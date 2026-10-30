#!/usr/bin/env node
// Renders a short video in which a browser screen improves itself step by step, by tweening CSS
// between stages. Use it for HTML design studies and mobile web pages whose structure stays the
// same between stages. For native screenshots or structural changes, use compare.mjs instead.
//
//   node scripts/story.mjs <story.json | story.html> <out.mp4> [--canvas=portrait|square|landscape|WxH]
//        [--viewport=390x844] [--frame=x,y,w,h] [--fps=30] [--duration=10] [--frames=folder] [--play]
//
// Adapted from story.mjs in unslop by Damir Sokolovsky (@heydamir), CC BY 4.0,
// https://github.com/heydamir/unslop at 4652254daff586ff4739849395a127b56f7f8cc7. The tweening
// runtime, letter swaps, data-in/data-out and the spacing and radius redlines follow the original.
// Changed here: the page lays out at a configurable logical viewport instead of 1440 px; the
// viewport, capture scale and video canvas are independent; portrait, square and landscape canvases
// with explicit framing; captions, provenance label, safe-area emulation, per-step stylesheets,
// touch-target, note and inset annotations; a JSON story format; dependency checks.

import { createServer } from "node:http";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { parseArgs, number } from "./lib/args.mjs";
import { UsageError, isMain, runCli } from "./lib/errors.mjs";
import { findFfmpeg, launchBrowser } from "./lib/deps.mjs";
import { parseSize, readability, resolveCanvas, resolveFrame, round, stageLayout } from "./lib/geometry.mjs";
import { readJson, sha256, toolVersion } from "./lib/files.mjs";
import { applySafeArea, normalizeDevice } from "./lib/mobile.mjs";
import { CREDIT, DEFAULT_THEME, TICK_SOURCE, bands, encode, renderPlan, stageHtml } from "./lib/stage.mjs";

const VERSION = toolVersion();
const USAGE = "node scripts/story.mjs <story.json | story.html> <out.mp4> [--canvas=portrait|square|landscape|WxH] [--viewport=390x844] [--frame=x,y,w,h] [--fps=30] [--duration=10] [--frames=folder] [--play]";

// Step names choose an annotation, as in the original: "Spacing" measures gaps, "Details" outlines
// corners. Mobile additions: "Touch" sizes targets, "Safe area" shows insets.
export function kindOf(name) {
  if (/spac/i.test(name)) return "spacing";
  if (/detail|radius|corner/i.test(name)) return "details";
  if (/touch|target|tap/i.test(name)) return "targets";
  if (/safe.?area|inset|notch|home indicator/i.test(name)) return "insets";
  return null;
}

export function loadStory(input, overrides = {}) {
  const file = resolve(input);
  if (!existsSync(file)) throw new UsageError(`story not found: ${input}`);
  const root = dirname(file);
  let story;
  if (extname(file) === ".json") {
    story = readJson(file, "story");
    if (!story.source) throw new UsageError(`${input} needs a "source" page, relative to the story file`);
  } else {
    // An upstream-style story.html: steps and framing come from <meta> tags in the page itself.
    const html = readFileSync(file, "utf8");
    const meta = (name) => new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, "i").exec(html)?.[1];
    const frame = meta("unslop-frame")?.split(/\s+/).map(Number);
    story = {
      source: relative(root, file),
      viewport: meta("unslop-viewport") ?? "390x844",
      title: meta("unslop-title") ?? "",
      label: meta("unslop-label") ?? "",
      steps: (meta("unslop-steps") ?? "").split(",").map((name) => name.trim()).filter(Boolean).map((name) => ({ name })),
      frame: frame?.length === 4 ? frame : frame?.length === 3 ? [frame[0], frame[1], frame[2], null] : null,
    };
  }
  const steps = (story.steps ?? []).map((step, index) => {
    const value = typeof step === "string" ? { name: step } : step;
    if (!value.name) throw new UsageError(`step ${index + 1} needs a "name"`);
    const css = value.css ? [value.css].flat().map((path) => {
      const full = resolve(root, path);
      if (!existsSync(full)) throw new UsageError(`step "${value.name}" stylesheet not found: ${path}`);
      return { path, full, text: readFileSync(full, "utf8") };
    }) : [];
    const highlight = (value.highlight ?? []).map((item) => (typeof item === "string" ? { selector: item, label: "" } : item));
    return { name: value.name, caption: value.caption ?? value.name, css, highlight, targets: value.targets ?? [], kind: value.kind ?? (highlight.length ? "notes" : kindOf(value.name)) };
  });
  if (!steps.length) throw new UsageError(`${input} has no steps. Add "steps" to the JSON, or <meta name="unslop-steps" content="Spacing, Color"> to the HTML`);
  const viewport = parseSize(overrides.viewport ?? story.viewport ?? "390x844", "viewport");
  const canvasName = String(overrides.canvas ?? story.canvas ?? "portrait").toLowerCase();
  const canvas = resolveCanvas(canvasName);
  let frameValue = overrides.frame ?? story.frames?.[canvasName] ?? story.frame;
  if (Array.isArray(frameValue) && frameValue[3] === null) frameValue = [frameValue[0], frameValue[1], frameValue[2], viewport.height - frameValue[1]];
  const frame = resolveFrame(frameValue, viewport);
  const device = normalizeDevice({ id: "story", viewport, scale: 1, safeArea: story.safeArea ?? {} });
  const sourcePath = resolve(root, story.source.split("?")[0]);
  if (!existsSync(sourcePath)) throw new UsageError(`story source not found: ${story.source}`);
  // A prepare script runs in the page before the story starts. It is presentation only: it marks
  // swaps, data-in and data-out on a clean page, so the page itself carries no story code.
  const prepare = story.prepare ? resolve(root, story.prepare) : null;
  if (prepare && !existsSync(prepare)) throw new UsageError(`story prepare script not found: ${story.prepare}`);
  return {
    file,
    root,
    source: story.source,
    sourcePath,
    prepare,
    title: story.title ?? "",
    label: story.label ?? "",
    intro: story.intro ?? "Before",
    outro: story.outro ?? "After",
    steps,
    viewport,
    canvas,
    canvasName,
    frame,
    safeArea: device.safeArea,
    duration: Number(overrides.duration ?? story.duration ?? 10),
    fps: Number(overrides.fps ?? story.fps ?? 30),
    screenRadius: Number(story.screenRadius ?? 40),
    theme: { ...DEFAULT_THEME, ...(story.theme ?? {}) },
  };
}

export function storyLayout(story) {
  const b = bands(story.canvas);
  const layout = stageLayout({ canvas: story.canvas, region: story.frame, padding: b.padding, top: b.top, bottom: b.bottom });
  const [screen] = layout.screens;
  // Rounded corners only where the crop meets the viewport edge, so a crop never looks like a device.
  const fullWidth = story.frame.x === 0 && story.frame.width === story.viewport.width;
  const radius = fullWidth && story.frame.y === 0 ? story.screenRadius * layout.scale : 12 * b.unit;
  return { ...layout, screen: { ...screen, radius }, readability: readability({ scale: layout.scale, canvas: story.canvas }) };
}

export const runtime = (steps, minTarget) => `
(() => {
  const red = "#ff4d6a";
  const spring = "cubic-bezier(0.3, 1.12, 0.45, 1)";
  const ease = "cubic-bezier(0.45, 0, 0.2, 1)";
  const layout = ["padding", "margin", "gap", "row-gap", "column-gap", "width", "height", "min-width", "min-height", "max-width", "max-height", "top", "right", "bottom", "left", "inset", "font-size", "line-height", "letter-spacing", "font-weight", "transform", "translate", "scale", "rotate", "border-width", "outline-width", "flex-basis", "flex-grow", "grid-template-columns", "grid-template-rows"];
  const tint = ["color", "background-color", "border-color", "outline-color", "fill", "stroke", "stroke-dashoffset", "stroke-width", "box-shadow", "text-shadow", "border-radius", "opacity", "filter", "backdrop-filter", "clip-path", "text-decoration-color", "-webkit-text-fill-color"];
  const transition = [...layout.map((p) => p + " 700ms " + spring + " var(--wave, 0ms)"), ...tint.map((p) => p + " 900ms " + ease + " var(--wave, 0ms)")].join(", ");
  const rise = "cubic-bezier(0.17, 0.84, 0.44, 1)";
  const steps = ${JSON.stringify(steps)};
  const minTarget = ${JSON.stringify(minTarget)};
  let css = \`
    :root { interpolate-size: allow-keywords; }
    html.story-live *, html.story-live *::before, html.story-live *::after { transition: \${transition} !important; }
    .swap { display: inline-grid; justify-items: start; align-items: start; vertical-align: top; overflow: visible; }
    div.swap, p.swap, h1.swap, h2.swap, h3.swap, li.swap { display: grid; }
    .swap > .from, .swap > .to { grid-area: 1 / 1; }
    .swap > .to { opacity: 0; pointer-events: none; }
    .swap > .to .ch { display: inline-block; opacity: 0; transform: translateY(40%); filter: blur(8px); }
    html.story-live .swap > .to .ch { transition: opacity 700ms \${rise} calc(var(--wave, 0ms) + 140ms + var(--ci) * 16ms), transform 700ms \${rise} calc(var(--wave, 0ms) + 140ms + var(--ci) * 16ms), filter 700ms \${rise} calc(var(--wave, 0ms) + 140ms + var(--ci) * 16ms) !important; }
    [data-in] { opacity: 0; transform: translateY(10px) scale(0.98); }
  \`;
  steps.forEach((_, index) => {
    const k = index + 1;
    css += \`
      html.s\${k} .swap[data-at="\${k}"] > .from { opacity: 0; filter: blur(10px); transform: translateY(-14px); }
      html.s\${k} .swap[data-at="\${k}"] > .to { opacity: 1; }
      html.s\${k} .swap[data-at="\${k}"] > .to .ch { opacity: 1; transform: none; filter: none; }
      html.s\${k} [data-in="\${k}"] { opacity: 1; transform: none; }
      html.s\${k} [data-out="\${k}"] { opacity: 0; max-height: 0 !important; max-width: 0 !important; margin-top: 0 !important; margin-bottom: 0 !important; padding: 0 !important; border-width: 0 !important; }
    \`;
  });

  function letters(node) {
    let index = 0;
    const walk = (el) => {
      [...el.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\\s+$/.test(part)) return frag.appendChild(document.createTextNode(part));
            const word = document.createElement("span");
            word.style.display = "inline-block";
            word.style.whiteSpace = "nowrap";
            [...part].forEach((char) => {
              const span = document.createElement("span");
              span.className = "ch";
              span.style.setProperty("--ci", index++);
              span.textContent = char;
              word.appendChild(span);
            });
            frag.appendChild(word);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName.toLowerCase() !== "svg") {
          walk(child);
        }
      });
    };
    walk(node);
  }

  const conf = window.parent.__stage.conf;
  const layer = () => window.parent.document.getElementById("story-layer");
  const box = (el) => el.getBoundingClientRect();
  const sx = (x) => conf.x + x * conf.scale;
  const sy = (y) => conf.y + y * conf.scale;
  function put(className, style, html) {
    const node = window.parent.document.createElement("div");
    node.className = className;
    Object.assign(node.style, style);
    if (html) node.innerHTML = html;
    layer().appendChild(node);
    return node;
  }
  const rect = (left, top, width, height) => ({ left: sx(left) + "px", top: sy(top) + "px", width: width * conf.scale + "px", height: height * conf.scale + "px" });
  const onScreen = (el) => { const b = box(el); return b.width > 2 && b.height > 2 && b.bottom > 0 && b.top < innerHeight; };

  function marked(list) {
    return list.map((item, index) => {
      const el = typeof item.selector === "string" ? document.querySelector(item.selector) : item.el;
      if (!el || !onScreen(el)) return null;
      const wrap = put("s-fade", { transitionDelay: index * 70 + "ms" }, '<div class="s-box" style="position:absolute;inset:0"></div>' +
        [["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]].map(([x, y]) => '<span class="s-corner" style="position:absolute;' + x + ':-4px;' + y + ':-4px"></span>').join(""));
      const tag = item.label ? put("s-tag s-fade", { transitionDelay: index * 70 + "ms" }) : null;
      if (tag) tag.textContent = item.label;
      return { el, wrap, tag };
    }).filter(Boolean);
  }
  function follow(items, pad = 8) {
    return () => {
      for (const { el, wrap, tag } of items) {
        const b = box(el);
        const p = pad / conf.scale;
        Object.assign(wrap.style, rect(b.left - p, b.top - p, b.width + p * 2, b.height + p * 2));
        if (tag) {
          const above = sy(b.top - p) - 46 > conf.y;
          Object.assign(tag.style, { left: Math.max(conf.x + 4, sx(b.left - p)) + "px", top: (above ? sy(b.top - p) - 44 : sy(b.bottom + p) + 10) + "px" });
        }
      }
    };
  }

  function audit() {
    return follow(marked([...document.querySelectorAll("[data-slop]")].map((el) => ({ el, label: el.dataset.slop }))));
  }

  function notes(step) {
    return follow(marked(step.highlight));
  }

  function targets(step) {
    const els = (step.targets.length ? step.targets.flatMap((selector) => [...document.querySelectorAll(selector)]) : [...document.querySelectorAll("[data-target]")]).filter(onScreen).slice(0, 6);
    const items = els.map((el) => ({ el, wrap: put("s-fade", {}, '<div class="s-box" style="position:absolute;inset:0"></div>'), tag: put("s-tag s-fade", {}) }));
    return () => {
      for (const { el, wrap, tag } of items) {
        const b = box(el);
        Object.assign(wrap.style, rect(b.left, b.top, b.width, b.height));
        wrap.firstChild.style.borderRadius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, b.height / 2) * conf.scale + "px";
        const text = Math.round(b.width) + " × " + Math.round(b.height);
        if (tag.textContent !== text) tag.textContent = text;
        const small = b.width < minTarget - 0.5 || b.height < minTarget - 0.5;
        tag.classList.toggle("s-ok", !small);
        wrap.classList.toggle("s-ok", !small);
        Object.assign(tag.style, { left: sx(b.left) + "px", top: sy(b.bottom) + 10 + "px" });
      }
    };
  }

  function insets() {
    const style = getComputedStyle(document.documentElement);
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)";
    document.body.appendChild(probe);
    const top = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    const bottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    const bands = [];
    if (top) bands.push({ y: 0, h: top, label: "Status bar " + Math.round(top) });
    if (bottom) bands.push({ y: innerHeight - bottom, h: bottom, label: "Home indicator " + Math.round(bottom) });
    bands.forEach(({ y, h, label }) => {
      put("s-fade s-band", rect(0, y, innerWidth, h));
      const tag = put("s-tag s-fade", { left: sx(innerWidth) - 12 + "px", top: sy(y) + (y ? -44 : h * conf.scale + 8) + "px", translate: "-100% 0" });
      tag.textContent = label;
    });
    return null;
  }

  function spacing() {
    const groups = new Map();
    document.querySelectorAll("[data-gap]").forEach((el) => {
      const key = el.dataset.gap || "main";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    });
    const stageWidth = window.parent.innerWidth;
    const several = groups.size > 1;
    const pairs = [];
    groups.forEach((list) => {
      const items = list.filter((el) => box(el).height > 0 && box(el).top < innerHeight).sort((a, b) => box(a).top - box(b).top);
      for (let i = 1; i < items.length; i++) {
        if (box(items[i]).top - box(items[i - 1]).bottom <= 2) continue;
        pairs.push({ group: items, above: items[i - 1], below: items[i], nodes: {
          fill: put("s-fill s-x", {}), top: put("s-hair s-x", {}), bottom: put("s-hair s-x", {}),
          ruler: put("s-ink s-y", {}), capTop: put("s-ink s-x", {}), capBottom: put("s-ink s-x", {}),
          tag: put("s-tag s-fade", {}),
        } });
      }
    });
    return () => {
      for (const { group, above, below, nodes } of pairs) {
        const a = box(above);
        const b = box(below);
        const left = sx(Math.min(...group.map((el) => box(el).left)));
        const ruler = Math.max(14, left - 20);
        const top = sy(a.bottom);
        const size = Math.max(0, (b.top - a.bottom) * conf.scale);
        const value = Math.round(b.top - a.bottom);
        const right = several ? sx(Math.max(...group.map((el) => box(el).right))) + 24 : stageWidth;
        const start = several ? ruler - 8 : 0;
        const band = { left: start + "px", width: right - start + "px", transformOrigin: ruler - start + "px 50%" };
        Object.assign(nodes.fill.style, band, { top: top + "px", height: size + "px" });
        Object.assign(nodes.top.style, band, { top: top + "px", height: "1px" });
        Object.assign(nodes.bottom.style, band, { top: top + size - 1 + "px", height: "1px" });
        Object.assign(nodes.ruler.style, { left: ruler + "px", top: top + "px", width: "1.5px", height: size + "px", transformOrigin: "50% 0" });
        Object.assign(nodes.capTop.style, { left: ruler - 4 + "px", top: top + "px", width: "9px", height: "1.5px" });
        Object.assign(nodes.capBottom.style, { left: ruler - 4 + "px", top: top + size - 1.5 + "px", width: "9px", height: "1.5px" });
        const room = ruler - 10 > 64;
        Object.assign(nodes.tag.style, { left: (room ? ruler - 10 : ruler + 12) + "px", top: top + size / 2 - 15 + "px", translate: room ? "-100% 0" : "0 0" });
        const text = value + "px";
        if (nodes.tag.textContent !== text) nodes.tag.textContent = text;
        const hidden = value < 4 ? "0" : "";
        Object.values(nodes).forEach((node) => {
          if (node.style.visibility !== (hidden ? "hidden" : "")) node.style.visibility = hidden ? "hidden" : "";
        });
      }
    };
  }

  function details() {
    const items = [...document.querySelectorAll("[data-radius]")].filter((el) => box(el).bottom > 0 && box(el).top < innerHeight).map((el) => {
      const wrap = put("s-fade", {}, '<div class="s-box" style="position:absolute;inset:0"></div>');
      return { el, wrap, outline: wrap.firstChild, tag: put("s-tag s-fade", {}) };
    });
    return () => {
      for (const { el, wrap, outline, tag } of items) {
        const b = box(el);
        const radius = Math.round(Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, b.width / 2, b.height / 2));
        const pad = 5 / conf.scale;
        Object.assign(wrap.style, rect(b.left - pad, b.top - pad, b.width + pad * 2, b.height + pad * 2));
        outline.style.borderRadius = radius * conf.scale + 5 + "px";
        Object.assign(tag.style, { left: sx(b.left) + "px", top: sy(b.bottom) + 12 + "px" });
        const text = "r " + radius;
        if (tag.textContent !== text) tag.textContent = text;
      }
    };
  }

  const kinds = { audit, spacing, details, notes, targets, insets };
  let current = null;
  let stepping = false;

  window.__story = {
    install() {
      const style = document.createElement("style");
      style.id = "story-style";
      style.textContent = css;
      document.head.appendChild(style);
      document.querySelectorAll(".swap > .to").forEach(letters);
      document.querySelectorAll("[data-out]").forEach((el) => {
        const b = box(el);
        if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
        el.style.overflow = "hidden";
        el.style.maxHeight = Math.ceil(b.height) + "px";
        el.style.maxWidth = Math.ceil(b.width) + "px";
      });
      document.querySelectorAll("body *").forEach((el) => {
        const b = box(el);
        const wave = Math.round(Math.min(420, Math.max(0, b.top) / innerHeight * 320 + Math.max(0, b.left) / innerWidth * 100));
        el.style.setProperty("--wave", wave + "ms");
      });
      document.querySelectorAll("*").forEach((el) => {
        if (getComputedStyle(el).animationName !== "none") el.style.animationPlayState = "paused";
      });
      document.documentElement.offsetHeight;
      document.documentElement.classList.add("story-live");
      const loop = () => {
        if (current && !stepping) current();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    reset() {
      const root = document.documentElement;
      root.classList.remove("story-live", ...steps.map((_, index) => "s" + (index + 1)));
      document.querySelectorAll("style[data-story-step]").forEach((node) => node.remove());
      layer().className = "";
      layer().innerHTML = "";
      current = null;
      root.offsetHeight;
      root.classList.add("story-live");
    },
    follow() {
      stepping = true;
      if (current) current();
    },
    step(k) {
      const text = steps[k - 1].css;
      if (text) {
        const style = document.createElement("style");
        style.dataset.storyStep = String(k);
        style.textContent = text;
        document.head.appendChild(style);
      }
      document.documentElement.classList.add("s" + k);
    },
    show(kind, k) {
      const node = layer();
      node.className = "";
      node.innerHTML = "";
      const update = (kinds[kind] || (() => null))(steps[k - 1] || {});
      current = typeof update === "function" ? update : null;
      if (current) current();
      node.offsetHeight;
      node.classList.add("s-on");
    },
    settle() {
      layer().classList.add("s-on", "s-fixed");
    },
    clear() {
      layer().classList.remove("s-on");
    },
  };
})();
`;

const layerCss = (unit) => {
  const u = (px) => `${round(px * unit, 2)}px`;
  return `
  #story-layer .s-fade { opacity: 0; transition: opacity 240ms ease; }
  #story-layer.s-on .s-fade { opacity: 1; }
  #story-layer .s-x { transform: scaleX(0); transition: transform 520ms cubic-bezier(0.65, 0, 0.35, 1), background-color 300ms ease; }
  #story-layer .s-y { transform: scaleY(0); transition: transform 520ms cubic-bezier(0.65, 0, 0.35, 1), background-color 300ms ease; }
  #story-layer.s-on .s-x { transform: scaleX(1); }
  #story-layer.s-on .s-y { transform: scaleY(1); }
  #story-layer .s-tag { font: 600 ${u(26)}/${u(40)} ui-monospace, "SF Mono", Menlo, monospace; height: ${u(40)}; padding: 0 ${u(14)}; border-radius: ${u(20)}; white-space: nowrap; color: #fff; background: #e23a57; font-variant-numeric: tabular-nums; transition: opacity 220ms ease 100ms, background-color 300ms ease, color 300ms ease; }
  #story-layer.s-fixed .s-tag, #story-layer .s-tag.s-ok { background: #f5f5f5; color: #111; }
  #story-layer .s-ink { background: #ff4d6a; }
  #story-layer .s-hair { background: rgba(255,77,106,0.55); }
  #story-layer .s-fill { background: rgba(255,77,106,0.1); }
  #story-layer.s-fixed .s-ink { background: rgba(255,255,255,0.92); }
  #story-layer.s-fixed .s-hair { background: rgba(255,255,255,0.24); }
  #story-layer.s-fixed .s-fill { background: rgba(255,255,255,0.05); }
  #story-layer .s-box { border: ${u(3)} solid #ff4d6a; border-radius: ${u(10)}; background: rgba(255,77,106,0.08); transform: scale(1.03); transition: opacity 220ms ease, transform 260ms ease, border-color 300ms ease, background-color 300ms ease; }
  #story-layer.s-on .s-box { transform: scale(1); }
  #story-layer.s-fixed .s-box, #story-layer .s-ok .s-box { border-color: rgba(255,255,255,0.95); background: rgba(255,255,255,0.06); }
  #story-layer .s-corner { width: ${u(10)}; height: ${u(10)}; background: #fff; border: ${u(2)} solid #ff4d6a; }
  #story-layer .s-band { background: repeating-linear-gradient(135deg, rgba(255,77,106,0.28) 0 ${u(8)}, rgba(255,77,106,0.08) ${u(8)} ${u(16)}); }
  #story-layer.s-fixed .s-band { background: repeating-linear-gradient(135deg, rgba(255,255,255,0.22) 0 ${u(8)}, rgba(255,255,255,0.05) ${u(8)} ${u(16)}); }`;
};

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf" };

export function serveFolder(root, routes = {}) {
  const base = resolve(root) + sep;
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (routes[path]) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return response.end(routes[path]);
    }
    const target = normalize(join(base, path));
    if (!target.startsWith(base) || !existsSync(target) || statSync(target).isDirectory()) {
      response.writeHead(404);
      return response.end();
    }
    response.writeHead(200, { "content-type": TYPES[extname(target).toLowerCase()] ?? "application/octet-stream" });
    response.end(readFileSync(target));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

export async function renderStory(story, { out, framesDir, play = false } = {}) {
  const ffmpeg = play || (framesDir && !out) ? null : findFfmpeg();
  const layout = storyLayout(story);
  const { scale, screen } = layout;
  const minTarget = 44;
  const iframeStyle = `position:absolute;left:0;top:0;border:0;width:${story.viewport.width}px;height:${story.viewport.height}px;transform-origin:0 0;transform:scale(${scale}) translate(${-story.frame.x}px, ${-story.frame.y}px);background:#fff`;
  const html = stageHtml({
    canvas: story.canvas,
    theme: story.theme,
    title: story.title,
    caption: story.intro,
    label: story.label,
    screens: [screen],
    screenHtml: () => `<iframe id="page" title="Story page" src="${sourceSrc(story.source)}" style="${iframeStyle}"></iframe>`,
    extraCss: layerCss(bands(story.canvas).unit),
    script: `<script>window.__stage = { conf: { scale: ${scale}, x: ${screen.x - story.frame.x * scale}, y: ${screen.y - story.frame.y * scale} } }; window.__tick = ${TICK_SOURCE};</script>`,
  });
  const { server, base } = await serveFolder(story.root, { "/__stage.html": html });
  const { browser, executablePath } = await launchBrowser({ headless: !play });
  let frames = 0;
  let total = 0;
  try {
    const view = play ? Math.min(1, 900 / story.canvas.height) : 1;
    const context = await browser.newContext({ viewport: { width: Math.round(story.canvas.width * view), height: Math.round(story.canvas.height * view) }, deviceScaleFactor: play ? 1 : 1, hasTouch: true });
    const page = await context.newPage();
    if (play && view !== 1) await page.addInitScript((v) => document.addEventListener("DOMContentLoaded", () => { document.body.style.transform = `scale(${v})`; document.body.style.transformOrigin = "0 0"; }), view);
    await applySafeArea(context, page, story.safeArea);
    await page.goto(`${base}/__stage.html`, { waitUntil: "load" });
    const frame = page.frames().find((item) => item !== page.mainFrame());
    await frame.waitForLoadState("load");
    const measured = await frame.evaluate(() => [innerWidth, innerHeight]);
    if (measured[0] !== story.viewport.width || measured[1] !== story.viewport.height) {
      throw new UsageError(`the story page laid out at ${measured[0]}x${measured[1]}, not ${story.viewport.width}x${story.viewport.height}`);
    }
    await frame.evaluate(async () => {
      const families = new Set();
      for (const sheet of document.styleSheets) {
        let rules = [];
        try { rules = [...sheet.cssRules]; } catch {}
        const walk = (list) => list.forEach((rule) => {
          if (rule.cssRules) walk([...rule.cssRules]);
          const value = rule.style && rule.style.fontFamily;
          if (value) value.split(",").forEach((name) => families.add(name.trim().replace(/^["']|["']$/g, "")));
        });
        walk(rules);
      }
      await Promise.all([...families].flatMap((family) => [400, 500, 600, 700].map((weight) => document.fonts.load(`${weight} 16px "${family}"`).catch(() => null))));
      await document.fonts.ready;
    });
    if (story.prepare) await frame.addScriptTag({ content: readFileSync(story.prepare, "utf8") });
    const steps = story.steps.map((step) => ({ name: step.name, css: step.css.map((item) => item.text).join("\n"), highlight: step.highlight, targets: step.targets }));
    await frame.addScriptTag({ content: runtime(steps, minTarget) });
    await frame.evaluate(() => window.__story.install());
    await page.waitForTimeout(300);

    const slop = await frame.evaluate(() => document.querySelectorAll("[data-slop]").length);
    const call = (name, ...values) => () => frame.evaluate(([name, values]) => window.__story[name](...values), [name, values]);
    const caption = (text) => () => page.evaluate((text) => window.__caption(text), text);
    const counter = (done) => () => page.evaluate(([count, done]) => window.__counter(count, done), [story.steps.length, done]);
    const plan = [];
    const at = (time, run) => plan.push({ time, run });
    // Each problem is marked for most of a second before it changes, so a viewer reads it first.
    const introHold = 1.5;
    const outroHold = 2.0;
    at(0, counter(0));
    let cursor = introHold;
    if (slop) {
      at(cursor - 0.9, call("show", "audit", 0));
      at(cursor, call("clear"));
      cursor += 0.3;
    }
    const blocks = story.steps.map((step) => (step.kind ? 2.0 : 1.4));
    const fit = Math.min(1, (story.duration - cursor - outroHold) / blocks.reduce((sum, block) => sum + block, 0));
    story.steps.forEach((step, index) => {
      const k = index + 1;
      at(cursor, caption(`${k} · ${step.caption}`));
      if (step.kind) {
        at(cursor + 0.05 * fit, call("show", step.kind, k));
        at(cursor + 0.8 * fit, call("step", k));
        at(cursor + 0.8 * fit, counter(k));
        at(cursor + 1.5 * fit, call("settle"));
        at(cursor + 1.9 * fit, call("clear"));
      } else {
        at(cursor + 0.25 * fit, call("step", k));
        at(cursor + 0.25 * fit, counter(k));
      }
      cursor += blocks[index] * fit;
    });
    at(cursor, caption(story.outro));
    total = cursor + outroHold;

    if (play) {
      console.log("playing in the browser window, close it to stop");
      while (browser.isConnected()) {
        await frame.evaluate(() => window.__story.reset());
        await page.evaluate((text) => window.__caption(text), story.intro);
        await renderPlan({ page, plan: [...plan], total, play: true });
      }
    } else {
      const folder = framesDir ? resolve(framesDir) : `${resolve(out)}.frames`;
      frames = await renderPlan({
        page, plan, total, fps: story.fps, framesDir: folder,
        tick: async (ms) => {
          await frame.evaluate(() => window.__story.follow());
          await page.evaluate((ms) => window.__tick(ms, [document, document.getElementById("page").contentDocument]), ms);
        },
      });
      if (out) {
        encode({ ffmpeg, framesDir: folder, fps: story.fps, canvas: story.canvas, out });
        if (!framesDir) rmSync(folder, { recursive: true, force: true });
      }
    }
  } catch (error) {
    if (!play || browser.isConnected()) throw error;
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
  if (play) return null;
  const record = {
    tool: `unslop-mobile story ${VERSION}`,
    mode: "css-morph",
    note: "Rendered from a browser page by tweening CSS between steps. Not a native screen recording.",
    createdAt: new Date().toISOString(),
    story: { file: relative(dirname(resolve(out ?? framesDir)), story.file), sha256: sha256(story.file) },
    source: { file: relative(dirname(resolve(out ?? framesDir)), story.sourcePath), query: story.source.split("?")[1] ?? "", sha256: sha256(story.sourcePath) },
    prepare: story.prepare ? { file: relative(dirname(resolve(out ?? framesDir)), story.prepare), sha256: sha256(story.prepare) } : null,
    stepStyles: story.steps.flatMap((step) => step.css.map((item) => ({ step: step.name, file: item.path, sha256: sha256(item.full) }))),
    browser: { version: browserVersion(executablePath) },
    viewport: story.viewport,
    safeArea: story.safeArea,
    frame: story.frame,
    canvas: { ...story.canvas, preset: story.canvasName },
    screen: { x: round(screen.x), y: round(screen.y), width: round(screen.width), height: round(screen.height), scale: round(scale, 4) },
    readability: { bodyPoints: round(layout.readability.body, 1), smallPoints: round(layout.readability.small, 1), warnings: layout.readability.warnings },
    fps: story.fps,
    frames,
    seconds: round(total, 2),
    steps: story.steps.map((step) => ({ name: step.name, caption: step.caption, kind: step.kind })),
    label: story.label,
    credit: CREDIT,
  };
  return record;
}

function sourceSrc(source) {
  const [path, query] = source.split("?");
  return "/" + path.split("/").map(encodeURIComponent).join("/") + (query ? `?${query}` : "");
}

function browserVersion(executable) {
  try {
    return String(execFileSync(executable, ["--version"], { stdio: ["ignore", "pipe", "ignore"] })).trim();
  } catch {
    return executable;
  }
}

if (isMain(import.meta.url)) {
  runCli(async () => {
    const { positionals, values } = parseArgs(process.argv.slice(2), { flags: ["play"], options: ["canvas", "viewport", "frame", "fps", "duration", "frames"] });
    const [input, out] = positionals;
    if (!input || (!out && !values.play && !values.frames)) throw new UsageError(USAGE);
    const story = loadStory(input, {
      canvas: values.canvas,
      viewport: values.viewport,
      frame: values.frame,
      fps: number(values.fps, "fps", { min: 1, max: 120 }),
      duration: number(values.duration, "duration", { min: 3, max: 60 }),
    });
    const layout = storyLayout(story);
    console.log(`viewport ${story.viewport.width}×${story.viewport.height} · frame ${story.frame.x},${story.frame.y},${story.frame.width}×${story.frame.height} · canvas ${story.canvas.width}×${story.canvas.height} (${story.canvasName}) · screen scale ${layout.scale.toFixed(3)}`);
    console.log(`on a phone: ${layout.readability.body.toFixed(1)} pt for 14 px text, ${layout.readability.small.toFixed(1)} pt for 12 px`);
    layout.readability.warnings.forEach((warning) => console.warn(`warning: ${warning}`));
    const record = await renderStory(story, { out, framesDir: values.frames, play: values.play });
    if (!record) return;
    if (out) writeFileSync(`${resolve(out)}.json`, JSON.stringify(record, null, 2) + "\n");
    console.log(`saved ${out ? resolve(out) : resolve(values.frames)} · ${record.frames} frames · ${record.seconds}s · ${record.steps.length} steps`);
  });
}
