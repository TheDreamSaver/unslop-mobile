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
import { parseRect, parseSize, readability, resolveCanvas, resolveFrame, round, stageLayout } from "./lib/geometry.mjs";
import { readJson, sha256, toolVersion } from "./lib/files.mjs";
import { applySafeArea, normalizeDevice } from "./lib/mobile.mjs";
import { CREDIT, DEFAULT_THEME, TICK_SOURCE, bands, encode, renderPlan, sideLayout, stageHtml } from "./lib/stage.mjs";

const VERSION = toolVersion();
const USAGE = "node scripts/story.mjs <story.json | story.html> <out.mp4> [--canvas=portrait|square|landscape|WxH] [--layout=stack|side] [--viewport=390x844] [--frame=x,y,w,h] [--fps=30] [--duration=10] [--frames=folder] [--play]";

// Step names choose an annotation, as in the original: "Spacing" measures gaps, "Details" outlines
// corners. Mobile additions: "Touch" sizes targets, "Safe area" shows insets.
const KINDS = ["notes", "targets", "sizes", "contrast", "insets", "spacing", "details"];

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
    const kind = value.kind ?? (highlight.length ? "notes" : kindOf(value.name));
    if (kind && !KINDS.includes(kind)) throw new UsageError(`step "${value.name}" has kind "${kind}"; use one of ${KINDS.join(", ")}`);
    // zoom: a region of the viewport the camera moves to for this step, or "full" to move back out.
    const zoom = value.zoom === undefined ? undefined : value.zoom === "full" || value.zoom === null ? null : parseRect(value.zoom, `step "${value.name}" zoom`);
    return { name: value.name, caption: value.caption ?? value.name, css, highlight, measure: value.measure ?? value.targets ?? [], min: value.min, zoom, kind };
  });
  if (!steps.length) throw new UsageError(`${input} has no steps. Add "steps" to the JSON, or <meta name="unslop-steps" content="Spacing, Color"> to the HTML`);
  const viewport = parseSize(overrides.viewport ?? story.viewport ?? "390x844", "viewport");
  const canvasName = String(overrides.canvas ?? story.canvas ?? "portrait").toLowerCase();
  const canvas = resolveCanvas(canvasName);
  let frameValue = overrides.frame ?? story.frames?.[canvasName] ?? story.frame;
  if (Array.isArray(frameValue) && frameValue[3] === null) frameValue = [frameValue[0], frameValue[1], frameValue[2], viewport.height - frameValue[1]];
  const frame = resolveFrame(frameValue, viewport);
  for (const step of steps) if (step.zoom) resolveFrame(step.zoom, viewport);
  const layout = String(overrides.layout ?? story.layouts?.[canvasName] ?? story.layout ?? (canvas.width / canvas.height >= 0.9 ? "side" : "stack"));
  if (!["stack", "side"].includes(layout)) throw new UsageError(`layout must be stack or side, got "${layout}"`);
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
    layout,
    frame,
    safeArea: device.safeArea,
    duration: Number(overrides.duration ?? story.duration ?? 10),
    fps: Number(overrides.fps ?? story.fps ?? 30),
    screenRadius: Number(story.screenRadius ?? 40),
    deviceChrome: Boolean(story.deviceChrome),
    // Transition timing in ms, and how long a problem is marked before it changes, in seconds.
    // Defaults follow the original: 700 ms layout, 900 ms colour, a wave of up to 420 ms.
    motion: { layout: 700, tint: 900, wave: 420, read: 0.75, ...(story.motion ?? {}) },
    theme: { ...DEFAULT_THEME, ...(story.theme ?? {}) },
  };
}

export function storyLayout(story) {
  const b = bands(story.canvas);
  const layout = story.layout === "side" ? sideLayout({ canvas: story.canvas, region: story.frame }) : stageLayout({ canvas: story.canvas, region: story.frame, padding: b.padding, top: b.top, bottom: b.bottom });
  const [screen] = layout.screens;
  // Rounded corners only where the crop meets the viewport edge, so a crop never looks like a device.
  const fullWidth = story.frame.x === 0 && story.frame.width === story.viewport.width;
  const radius = fullWidth && story.frame.y === 0 ? story.screenRadius * layout.scale : 12 * b.unit;
  return { ...layout, screen: { ...screen, radius }, readability: readability({ scale: layout.scale, canvas: story.canvas }) };
}

export const runtime = (steps, minTarget, chrome = false, motion = { layout: 700, tint: 900, wave: 420 }) => `
(() => {
  const red = "#ff4d6a";
  const spring = "cubic-bezier(0.3, 1.12, 0.45, 1)";
  const ease = "cubic-bezier(0.45, 0, 0.2, 1)";
  const layout = ["padding", "margin", "gap", "row-gap", "column-gap", "width", "height", "min-width", "min-height", "max-width", "max-height", "top", "right", "bottom", "left", "inset", "font-size", "line-height", "letter-spacing", "font-weight", "transform", "translate", "scale", "rotate", "border-width", "outline-width", "flex-basis", "flex-grow", "grid-template-columns", "grid-template-rows"];
  const tint = ["color", "background-color", "border-color", "outline-color", "fill", "stroke", "stroke-dashoffset", "stroke-width", "box-shadow", "text-shadow", "border-radius", "opacity", "filter", "backdrop-filter", "clip-path", "text-decoration-color", "-webkit-text-fill-color"];
  const timing = (p) => p + (layout.includes(p) ? " ${motion.layout}ms " + spring : " ${motion.tint}ms " + ease) + " var(--wave, 0ms)";
  const transition = [...layout, ...tint].map(timing).join(", ");
  // Inherited properties transition only where an element's own value changes. When a descendant
  // also transitions a value it merely inherits, every seek of the ancestor's animation starts a
  // fresh transition on the descendant, and the change visibly replays from the old value.
  const INHERITED = ["color", "-webkit-text-fill-color", "font-size", "line-height", "letter-spacing", "font-weight"];
  // Properties that default to currentColor change on every frame while colour animates. Given
  // their own transitions they restart each frame and lag far behind, so where they equal the text
  // colour in both states they follow it instead.
  const CURRENT = { "border-color": ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"], "outline-color": ["outline-color"], "text-decoration-color": ["text-decoration-color"], "-webkit-text-fill-color": ["-webkit-text-fill-color"], fill: ["fill"], stroke: ["stroke"] };
  const READ = [...INHERITED, ...new Set(Object.values(CURRENT).flat())];
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
    /* Outgoing words shrink away and incoming words grow to their own size, so a swap ends with
       the box the new words need, not the larger of the two. */
    .swap > .from, .swap > .to { overflow: hidden; }
    .swap > .to { max-width: 0; max-height: 0; }
    .swap > .to .ch { display: inline-block; opacity: 0; transform: translateY(40%); filter: blur(8px); }
    html.story-live .swap > .to .ch { transition: opacity 700ms \${rise} calc(var(--wave, 0ms) + 140ms + var(--ci) * 16ms), transform 700ms \${rise} calc(var(--wave, 0ms) + 140ms + var(--ci) * 16ms), filter 700ms \${rise} calc(var(--wave, 0ms) + 140ms + var(--ci) * 16ms) !important; }
    [data-in] { opacity: 0; transform: translateY(10px) scale(0.98); }
    html.story-measure *, html.story-measure *::before, html.story-measure *::after, html.story-measure .swap > .to .ch { transition: none !important; }
  \`;
  steps.forEach((_, index) => {
    const k = index + 1;
    css += \`
      html.s\${k} .swap[data-at="\${k}"] > .from { opacity: 0; filter: blur(10px); transform: translateY(-14px); max-width: 0 !important; max-height: 0 !important; white-space: nowrap; }
      html.s\${k} .swap[data-at="\${k}"] > .to { opacity: 1; max-width: var(--to-w, none); max-height: var(--to-h, none); }
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

  // Where the page is on the stage right now. It moves when the camera zooms, so it is read live.
  const frameEl = window.parent.document.getElementById("page");
  const conf = {
    get x() { return frameEl.getBoundingClientRect().left; },
    get y() { return frameEl.getBoundingClientRect().top; },
    get scale() { return frameEl.getBoundingClientRect().width / innerWidth; },
  };
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
  // Tags stay inside the visible screen, so a zoom or an element at the edge never cuts them off.
  const screenBox = () => window.parent.document.getElementById("screen-0").getBoundingClientRect();
  function place(tag, x, y, align = "left") {
    const width = tag.offsetWidth;
    const edge = screenBox();
    let left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    left = Math.min(Math.max(left, edge.left + 6), edge.right - width - 6);
    Object.assign(tag.style, { left: left + "px", top: y + "px", translate: "0 0" });
  }
  // The box of the text itself, not of the block it sits in, so a full-width heading is measured
  // where its words are.
  const textBox = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const b = range.getBoundingClientRect();
    return b.width > 0 ? b : el.getBoundingClientRect();
  };
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
          const above = sy(b.top - p) - 46 > screenBox().top;
          place(tag, sx(b.left - p), above ? sy(b.top - p) - 44 : sy(b.bottom + p) + 10);
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
    const els = pick(step, "[data-target]");
    const items = els.map((el) => ({ el, wrap: put("s-fade", {}, '<div class="s-box" style="position:absolute;inset:0"></div>'), tag: put("s-tag s-fade", {}) }));
    return () => {
      for (const { el, wrap, tag } of items) {
        const b = box(el);
        Object.assign(wrap.style, rect(b.left, b.top, b.width, b.height));
        wrap.firstChild.style.borderRadius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, b.height / 2) * conf.scale + "px";
        // The shown size is the one judged, so a tag never reads 44 while still marked too small.
        const w = Math.floor(b.width + 0.05), h = Math.floor(b.height + 0.05);
        const text = w + " × " + h;
        if (tag.textContent !== text) tag.textContent = text;
        const small = w < minTarget || h < minTarget;
        tag.classList.toggle("s-ok", !small);
        wrap.classList.toggle("s-ok", !small);
        place(tag, sx(b.left + b.width / 2), sy(b.bottom) + 10, "center");
      }
    };
  }

  function pick(step, fallback) {
    const list = step.measure && step.measure.length ? step.measure.flatMap((selector) => [...document.querySelectorAll(selector)]) : [...document.querySelectorAll(fallback)];
    return list.filter(onScreen).slice(0, 8);
  }

  // Text sizes, counted live as they change. Red below the minimum (12 px unless the step says).
  function sizes(step) {
    const min = step.min ?? 12;
    const items = pick(step, "[data-size]").map((el) => ({ el, wrap: put("s-fade", {}, '<div class="s-box" style="position:absolute;inset:0"></div>'), tag: put("s-tag s-fade", {}) }));
    return () => {
      for (const { el, wrap, tag } of items) {
        const b = textBox(el);
        const size = parseFloat(getComputedStyle(el).fontSize);
        Object.assign(wrap.style, rect(b.left - 3, b.top - 2, b.width + 6, b.height + 4));
        const text = (Math.round(size * 10) / 10).toString().replace(/\\.0$/, "") + " px";
        if (tag.textContent !== text) tag.textContent = text;
        tag.classList.toggle("s-ok", size >= min - 0.05);
        wrap.classList.toggle("s-ok", size >= min - 0.05);
        const right = sx(b.right) + 10;
        if (right + tag.offsetWidth < screenBox().right - 6) place(tag, right, sy(b.top + b.height / 2) - 20);
        else place(tag, sx(b.left), sy(b.bottom) + 8);
      }
    };
  }

  // Contrast of text against the solid background behind it, counted live. Gradient or image layers
  // over that background are not included, so give them the solid colour they sit on.
  function contrast(step) {
    const parse = (value) => (value.match(/[\\d.]+/g) || [0, 0, 0, 0]).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const backdrop = (el) => {
      const layers = [];
      for (let node = el; node; node = node.parentElement) {
        const [r, g, b, a = 1] = parse(getComputedStyle(node).backgroundColor);
        if (a > 0) layers.push([r, g, b, a]);
        if (a >= 1) break;
      }
      return layers.reverse().reduce((under, [r, g, b, a]) => [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a)], [255, 255, 255]);
    };
    const items = pick(step, "[data-contrast]").map((el) => ({ el, wrap: put("s-fade", {}, '<div class="s-box" style="position:absolute;inset:0"></div>'), tag: put("s-tag s-fade", {}) }));
    return () => {
      for (const { el, wrap, tag } of items) {
        const b = textBox(el);
        const style = getComputedStyle(el);
        const [r, g, bl, a = 1] = parse(style.color);
        const under = backdrop(el);
        const fg = [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), bl * a + under[2] * (1 - a)];
        const one = lum(fg), two = lum(under);
        const ratio = (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
        const size = parseFloat(style.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        const ok = ratio >= (step.min ?? (large ? 3 : 4.5)) - 0.005;
        Object.assign(wrap.style, rect(b.left - 4, b.top - 3, b.width + 8, b.height + 6));
        const text = ratio.toFixed(1) + " : 1";
        if (tag.textContent !== text) tag.textContent = text;
        tag.classList.toggle("s-ok", ok);
        wrap.classList.toggle("s-ok", ok);
        place(tag, sx(b.left), sy(b.bottom) + 10);
      }
    };
  }

  function insets() {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)";
    document.body.appendChild(probe);
    const top = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    const bottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    const bands = [];
    if (top) bands.push({ y: 0, h: top, label: "Status bar " + Math.round(top) });
    if (bottom) bands.push({ y: innerHeight - bottom, h: bottom, label: "Home indicator " + Math.round(bottom) });
    const items = bands.map((item) => ({ ...item, band: put("s-fade s-band", {}), tag: Object.assign(put("s-tag s-fade", { translate: "-100% 0" }), { textContent: item.label }) }));
    return () => {
      for (const { y, h, band, tag } of items) {
        Object.assign(band.style, rect(0, y, innerWidth, h));
        Object.assign(tag.style, { left: sx(innerWidth) - 12 + "px", top: sy(y) + (y ? -44 : h * conf.scale + 8) + "px" });
      }
    };
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

  // Presentation only: where the device itself draws, inside the emulated insets, so a header
  // under the Dynamic Island or a button on the home indicator is visible. Drawn in the page so it
  // moves with the camera, and excluded from the story's transitions.
  function device() {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)";
    document.body.appendChild(probe);
    const top = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    const bottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    const layer = document.createElement("div");
    layer.id = "story-device";
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;transition:none!important";
    if (top >= 50) layer.innerHTML += '<i style="position:absolute;left:50%;top:11px;width:125px;height:37px;margin-left:-62.5px;border-radius:19px;background:#000;transition:none!important"></i>';
    else if (top >= 40) layer.innerHTML += '<i style="position:absolute;left:50%;top:0;width:160px;height:31px;margin-left:-80px;border-radius:0 0 20px 20px;background:#000;transition:none!important"></i>';
    if (bottom) layer.innerHTML += '<i style="position:absolute;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:#fff;mix-blend-mode:difference;transition:none!important"></i>';
    // A status bar in the top inset: the time and battery, drawn the way the system would.
    if (top >= 40) {
      const ear = (innerWidth - (top >= 50 ? 125 : 160)) / 2;
      const middle = top >= 50 ? 29.5 : 15.5;
      layer.innerHTML += '<span style="position:absolute;left:0;width:' + ear + 'px;top:' + (middle - 11) + 'px;text-align:center;font:600 17px/22px -apple-system,system-ui,sans-serif;color:#fff;mix-blend-mode:difference;transition:none!important">9:41</span>' +
        '<i style="position:absolute;left:' + (innerWidth - ear / 2 - 13) + 'px;top:' + (middle - 6) + 'px;width:24px;height:12px;border:1.5px solid #fff;border-radius:4px;box-sizing:border-box;mix-blend-mode:difference;transition:none!important"><i style="position:absolute;inset:1.5px 5px 1.5px 1.5px;border-radius:1.5px;background:#fff;transition:none!important"></i></i>';
    }
    document.body.appendChild(layer);
  }

  const kinds = { audit, spacing, details, notes, targets, sizes, contrast, insets };
  let current = null;
  let stepping = false;

  window.__story = {
    install() {
      const style = document.createElement("style");
      style.id = "story-style";
      style.textContent = css;
      document.head.appendChild(style);
      if (${JSON.stringify(chrome)}) device();
      // Chromium restarts colour transitions on every style recalculation while the root's
      // color-scheme changes, so text colours stall until the story stops seeking. Hold it at its
      // starting value; it only affects built-in controls and scrollbars.
      document.documentElement.style.setProperty("color-scheme", getComputedStyle(document.documentElement).colorScheme, "important");
      document.querySelectorAll(".swap > .to").forEach(letters);
      document.querySelectorAll("[data-out]").forEach((el) => {
        const b = box(el);
        if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
        el.style.overflow = "hidden";
        el.style.maxHeight = Math.ceil(b.height) + "px";
        el.style.maxWidth = Math.ceil(b.width) + "px";
      });
      // The wave never decreases from a parent to its children. If a child finished an inherited
      // transition (colour, size) before its parent did, Chromium would start the child's transition
      // again from the old value when the parent's ended, and the change would visibly replay.
      document.querySelectorAll("body *").forEach((el) => {
        const b = box(el);
        const own = Math.round(Math.min(${motion.wave}, (Math.max(0, b.top) / innerHeight * 320 + Math.max(0, b.left) / innerWidth * 100) * ${motion.wave} / 420));
        const inherited = parseFloat(el.parentElement?.style.getPropertyValue("--wave")) || 0;
        el.style.setProperty("--wave", Math.max(own, inherited) + "ms");
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
      const root = document.documentElement;
      const text = steps[k - 1].css;
      const style = document.createElement("style");
      style.dataset.storyStep = String(k);
      style.textContent = text || "";
      const apply = (on) => {
        if (on) document.head.appendChild(style);
        else style.remove();
        root.classList.toggle("s" + k, on);
      };
      // Where does this step leave each inherited property? Measure with transitions off, undo,
      // then let only the elements that own a change transition it.
      const elements = [...document.querySelectorAll("body, body *")];
      elements.forEach((el) => el.style.removeProperty("transition"));
      // Swaps at this step: pin the outgoing words at their current size so they can shrink, and
      // let the incoming words take their natural size while the step is measured.
      const swaps = [...document.querySelectorAll('.swap[data-at="' + k + '"]')].map((swap) => ({ from: swap.querySelector(":scope > .from"), to: swap.querySelector(":scope > .to") })).filter((item) => item.from && item.to);
      for (const { from, to } of swaps) {
        const r = from.getBoundingClientRect();
        from.style.maxWidth = Math.ceil(r.width + 1) + "px";
        from.style.maxHeight = Math.ceil(r.height + 1) + "px";
        to.style.setProperty("--to-w", "none");
        to.style.setProperty("--to-h", "none");
      }
      const read = () => new Map(elements.map((el) => { const cs = getComputedStyle(el); return [el, Object.fromEntries(READ.map((p) => [p, cs.getPropertyValue(p)]))]; }));
      const before = read();
      root.classList.add("story-measure");
      apply(true);
      const after = read();
      const targets = swaps.map(({ to }) => { const r = to.getBoundingClientRect(); return { width: r.width, height: r.height, line: parseFloat(getComputedStyle(to).lineHeight) || r.height }; });
      apply(false);
      root.offsetHeight;
      root.classList.remove("story-measure");
      root.offsetHeight;
      for (const el of elements) {
        const now = after.get(el), was = before.get(el);
        const parent = el.parentElement;
        const follows = parent && after.has(parent) ? INHERITED.filter((p) => now[p] === after.get(parent)[p] && was[p] === before.get(parent)[p]) : [];
        for (const [name, longhands] of Object.entries(CURRENT)) {
          if (longhands.every((p) => now[p] === now.color && was[p] === was.color)) follows.push(name);
        }
        if (follows.length) el.style.setProperty("transition", [...layout, ...tint].filter((p) => !follows.includes(p)).map(timing).join(", "), "important");
      }
      swaps.forEach(({ to }, i) => {
        to.style.setProperty("--to-w", Math.ceil(targets[i].width + 1) + "px");
        to.style.setProperty("--to-h", Math.ceil(targets[i].height + 1) + "px");
        // One-line words stay on one line while their box grows, instead of reflowing letter by letter.
        if (targets[i].height < targets[i].line * 1.6) to.style.whiteSpace = "nowrap";
      });
      apply(true);
    },
    // Letter-by-letter words lose their kerning. Once the swaps have settled, put plain text back so
    // the last frames show the page exactly as it is.
    commit() {
      for (const swap of document.querySelectorAll(".swap")) {
        const at = Number(swap.dataset.at);
        if (!document.documentElement.classList.contains("s" + at)) continue;
        const to = swap.querySelector(":scope > .to");
        swap.replaceWith(document.createTextNode(to ? to.textContent : ""));
      }
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
  const iframeStyle = `position:absolute;left:0;top:0;border:0;width:${story.viewport.width}px;height:${story.viewport.height}px;transform-origin:0 0;transform:scale(${scale}) translate(${-story.frame.x}px, ${-story.frame.y}px);background:#fff;transition:transform 900ms cubic-bezier(0.65, 0, 0.35, 1)`;
  // Annotations are clipped to the screen, with a margin for tags, so a zoom never leaves redlines
  // floating over the captions.
  const margin = 64 * bands(story.canvas).unit;
  const clip = `#story-layer { clip-path: inset(${round(screen.y - margin)}px ${round(story.canvas.width - screen.x - screen.width - margin)}px ${round(story.canvas.height - screen.y - screen.height - margin)}px ${round(screen.x - margin)}px); }`;
  const html = stageHtml({
    canvas: story.canvas,
    theme: story.theme,
    title: story.title,
    caption: story.intro,
    label: story.label,
    screens: [screen],
    panel: layout.panel ?? null,
    screenHtml: () => `<iframe id="page" title="Story page" src="${sourceSrc(story.source)}" style="${iframeStyle}"></iframe>`,
    extraCss: layerCss(bands(story.canvas).unit) + clip,
    script: `<script>
      window.__tick = ${TICK_SOURCE};
      // The camera: move the page so a region of the viewport fills the screen, or back to the frame.
      window.__zoom = (region) => {
        const page = document.getElementById("page");
        const box = { width: ${screen.width}, height: ${screen.height} };
        const viewport = ${JSON.stringify(story.viewport)};
        const frame = ${JSON.stringify(story.frame)};
        const base = ${scale};
        const target = region || frame;
        const s = Math.max(base, Math.min(box.width / target.width, box.height / target.height));
        const w = box.width / s, h = box.height / s;
        const left = region ? Math.min(Math.max(0, target.x + target.width / 2 - w / 2), viewport.width - w) : frame.x;
        const top = region ? Math.min(Math.max(0, target.y + target.height / 2 - h / 2), viewport.height - h) : frame.y;
        page.style.transform = "scale(" + s + ") translate(" + -left + "px, " + -top + "px)";
      };
    </script>`,
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
    const steps = story.steps.map((step) => ({ name: step.name, css: step.css.map((item) => item.text).join("\n"), highlight: step.highlight, measure: step.measure, min: step.min }));
    await frame.addScriptTag({ content: runtime(steps, minTarget, story.deviceChrome, story.motion) });
    await frame.evaluate(() => window.__story.install());
    await page.waitForTimeout(300);

    const slop = await frame.evaluate(() => document.querySelectorAll("[data-slop]").length);
    const call = (name, ...values) => () => frame.evaluate(([name, values]) => window.__story[name](...values), [name, values]);
    const caption = (text) => () => page.evaluate((text) => window.__caption(text), text);
    const counter = (done) => () => page.evaluate(([count, done]) => window.__counter(count, done), [story.steps.length, done]);
    const zoom = (region) => () => page.evaluate((region) => window.__zoom(region), region);
    const plan = [];
    const at = (time, run) => plan.push({ time, run });
    // Each problem is marked before it changes, so a viewer reads it first, and the annotation stays
    // until the change has finished, so the fixed value is seen. Transitions are never compressed;
    // if the story would run past its duration, reading time and holds shrink, to a floor.
    const settleAfter = (Math.max(story.motion.layout, story.motion.tint) + story.motion.wave) / 1000 + 0.05;
    let zoomedState = null;
    const movesPlan = story.steps.map((step) => {
      const moving = step.zoom !== undefined && JSON.stringify(step.zoom) !== JSON.stringify(zoomedState);
      if (step.zoom !== undefined) zoomedState = step.zoom;
      return moving;
    });
    const fixedTime = story.steps.reduce((sum, step, index) => sum + (movesPlan[index] ? 0.35 : 0) + (step.kind ? 0.05 + settleAfter : 0.25 + settleAfter), 0) + (zoomedState ? 0.35 : 0);
    const flexible = 1.4 + 1.8 + story.steps.reduce((sum, step) => sum + (step.kind ? story.motion.read + 0.3 : 0.2), 0);
    const squeeze = Math.max(0.6, Math.min(1, (story.duration - fixedTime) / flexible));
    const introHold = 1.4 * squeeze;
    const outroHold = 1.8 * squeeze;
    at(0, counter(0));
    let cursor = introHold;
    if (slop) {
      at(Math.max(0.2, cursor - 0.9), call("show", "audit", 0));
      at(cursor, call("clear"));
      cursor += 0.3;
    }
    // A camera move takes its own time before the problem is marked.
    story.steps.forEach((step, index) => {
      const k = index + 1;
      at(cursor, caption(`${k} · ${step.caption}`));
      if (movesPlan[index]) {
        at(cursor, zoom(step.zoom));
        cursor += 0.35;
      }
      if (step.kind) {
        at(cursor + 0.05, call("show", step.kind, k));
        const change = cursor + 0.05 + story.motion.read * squeeze;
        at(change, call("step", k));
        at(change, counter(k));
        at(change + settleAfter, call("settle"));
        cursor = change + settleAfter + 0.3 * squeeze;
        at(cursor, call("clear"));
      } else {
        const change = cursor + 0.2 * squeeze;
        at(change, call("step", k));
        at(change, counter(k));
        cursor = change + settleAfter;
      }
    });
    if (zoomedState) {
      at(cursor, zoom(null));
      cursor += 0.35;
    }
    at(cursor, caption(story.outro));
    at(cursor + 0.05, call("commit"));
    total = cursor + outroHold;

    if (play) {
      console.log("playing in the browser window, close it to stop");
      while (browser.isConnected()) {
        await frame.evaluate(() => window.__story.reset());
        await page.evaluate((text) => { window.__caption(text); window.__zoom(null); }, story.intro);
        await renderPlan({ page, plan: [...plan], total, play: true });
      }
    } else {
      const folder = framesDir ? resolve(framesDir) : `${resolve(out)}.frames`;
      frames = await renderPlan({
        page, plan, total, fps: story.fps, framesDir: folder,
        tick: async (ms) => {
          await page.evaluate((ms) => window.__tick(ms, [document, document.getElementById("page").contentDocument]), ms);
          await frame.evaluate(() => window.__story.follow());
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
    canvas: { ...story.canvas, preset: story.canvasName, layout: story.layout },
    screen: { x: round(screen.x), y: round(screen.y), width: round(screen.width), height: round(screen.height), scale: round(scale, 4) },
    readability: { bodyPoints: round(layout.readability.body, 1), smallPoints: round(layout.readability.small, 1), warnings: layout.readability.warnings },
    fps: story.fps,
    frames,
    seconds: round(total, 2),
    steps: story.steps.map((step) => ({ name: step.name, caption: step.caption, kind: step.kind, ...(step.zoom !== undefined ? { zoom: step.zoom } : {}) })),
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
    const { positionals, values } = parseArgs(process.argv.slice(2), { flags: ["play"], options: ["canvas", "layout", "viewport", "frame", "fps", "duration", "frames"] });
    const [input, out] = positionals;
    if (!input || (!out && !values.play && !values.frames)) throw new UsageError(USAGE);
    const story = loadStory(input, {
      canvas: values.canvas,
      layout: values.layout,
      viewport: values.viewport,
      frame: values.frame,
      fps: number(values.fps, "fps", { min: 1, max: 120 }),
      duration: number(values.duration, "duration", { min: 3, max: 60 }),
    });
    const layout = storyLayout(story);
    console.log(`viewport ${story.viewport.width}×${story.viewport.height} · frame ${story.frame.x},${story.frame.y},${story.frame.width}×${story.frame.height} · canvas ${story.canvas.width}×${story.canvas.height} (${story.canvasName}, ${story.layout} layout) · screen scale ${layout.scale.toFixed(3)}`);
    console.log(`on a phone: ${layout.readability.body.toFixed(1)} pt for 14 px text, ${layout.readability.small.toFixed(1)} pt for 12 px`);
    layout.readability.warnings.forEach((warning) => console.warn(`warning: ${warning}`));
    const record = await renderStory(story, { out, framesDir: values.frames, play: values.play });
    if (!record) return;
    if (out) writeFileSync(`${resolve(out)}.json`, JSON.stringify(record, null, 2) + "\n");
    console.log(`saved ${out ? resolve(out) : resolve(values.frames)} · ${record.frames} frames · ${record.seconds}s · ${record.steps.length} steps`);
  });
}
