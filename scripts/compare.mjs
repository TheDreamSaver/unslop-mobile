#!/usr/bin/env node
// Renders a before/after video from pairs of screenshots: browser captures from capture.mjs, or
// native simulator and device screenshots with their provenance written down. Nothing is morphed;
// the after image is revealed over the before image, so this works for any kind of change.
//
//   node scripts/compare.mjs <compare.json> <out.mp4> [--canvas=portrait|square|landscape|WxH]
//        [--frame=x,y,w,h] [--layout=sequence|side-by-side] [--fps=30] [--frames=folder]

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { parseArgs, number } from "./lib/args.mjs";
import { EvidenceError, UsageError, isMain, runCli } from "./lib/errors.mjs";
import { findFfmpeg, launchBrowser } from "./lib/deps.mjs";
import { readability, resolveCanvas, resolveFrame, round, stageLayout } from "./lib/geometry.mjs";
import { pngSize, readJson, sha256, toolVersion } from "./lib/files.mjs";
import { CREDIT, DEFAULT_THEME, TICK_SOURCE, bands, encode, renderPlan, stageHtml } from "./lib/stage.mjs";

const VERSION = toolVersion();
const USAGE = "node scripts/compare.mjs <compare.json> <out.mp4> [--canvas=portrait|square|landscape|WxH] [--frame=x,y,w,h] [--layout=sequence|side-by-side] [--fps=30] [--frames=folder]";

const manifests = new Map();
function manifestAt(path) {
  if (!manifests.has(path)) manifests.set(path, readJson(path, "capture manifest"));
  return manifests.get(path);
}

// One side of a pair, from a capture manifest or from an image with stated provenance.
export function resolveSide(spec, defaults, root, side) {
  const merged = { ...defaults, ...spec };
  if (merged.manifest) {
    const path = resolve(root, merged.manifest);
    const manifest = manifestAt(path);
    const matches = manifest.captures.filter((item) => item.variant === merged.variant && item.state === merged.state
      && (!merged.device || item.device.id === merged.device) && Number(item.textScale) === Number(merged.textScale ?? 1) && !item.keyboard === !merged.keyboard);
    if (matches.length !== 1) {
      throw new EvidenceError(`${side}: ${matches.length ? "several" : "no"} captures in ${merged.manifest} match variant "${merged.variant}", state "${merged.state}"${merged.device ? `, device "${merged.device}"` : ""}, text scale ${merged.textScale ?? 1}`);
    }
    const capture = matches[0];
    const image = resolve(dirname(path), capture.file);
    return {
      image,
      size: pngSize(image),
      scale: capture.device.scale,
      viewport: capture.device.viewport,
      device: capture.device.id,
      deviceLabel: capture.device.label,
      state: capture.state,
      textScale: capture.textScale,
      fixture: manifest.fixture?.sha256 ?? null,
      source: `${manifest.kind} · ${manifest.browser?.version ?? "browser"}`,
      kind: manifest.kind,
    };
  }
  if (!merged.image) throw new UsageError(`${side} needs either "manifest" (with variant and state) or "image"`);
  const image = resolve(root, merged.image);
  if (!existsSync(image)) throw new UsageError(`${side} image not found: ${merged.image}`);
  const size = pngSize(image);
  const scale = Number(merged.scale);
  if (!(scale > 0)) throw new UsageError(`${side} image ${merged.image} needs "scale", the device pixels per point or dp (3 for most current iPhones)`);
  if (!merged.source) throw new UsageError(`${side} image ${merged.image} needs "source", where it came from, such as "iOS Simulator 18.2 · iPhone 16 · Expo dev build"`);
  return {
    image,
    size,
    scale,
    viewport: { width: round(size.width / scale, 2), height: round(size.height / scale, 2) },
    device: merged.device ?? null,
    deviceLabel: merged.device ?? `${size.width}×${size.height} @${scale}x`,
    state: merged.state ?? null,
    textScale: Number(merged.textScale ?? 1),
    fixture: merged.fixture ?? null,
    source: merged.source,
    kind: merged.kind ?? "screenshot",
  };
}

// Before and after must show the same screen in the same conditions, or the comparison misleads.
export function checkPair(before, after, label) {
  const problems = [];
  if (before.size.width !== after.size.width || before.size.height !== after.size.height) problems.push(`image sizes differ (${before.size.width}×${before.size.height} vs ${after.size.width}×${after.size.height})`);
  if (before.scale !== after.scale) problems.push(`device scales differ (${before.scale} vs ${after.scale})`);
  if (before.device && after.device && before.device !== after.device) problems.push(`devices differ (${before.device} vs ${after.device})`);
  if (before.state && after.state && before.state !== after.state) problems.push(`states differ (${before.state} vs ${after.state})`);
  if (before.textScale !== after.textScale) problems.push(`text scales differ (${before.textScale} vs ${after.textScale})`);
  if (!before.fixture || !after.fixture) problems.push("both sides need a fixture (the manifest records one, or set \"fixture\" on an image)");
  else if (before.fixture !== after.fixture) problems.push(`fixtures differ (${before.fixture} vs ${after.fixture})`);
  if (problems.length) throw new EvidenceError(`${label}: ${problems.join("; ")}`);
}

export function loadComparison(input, overrides = {}) {
  const file = resolve(input);
  const root = dirname(file);
  const config = readJson(file, "comparison");
  if (!Array.isArray(config.pairs) || !config.pairs.length) throw new UsageError(`${input} needs "pairs", each naming a state or two images`);
  const shared = { device: config.device, textScale: config.textScale ?? 1 };
  const pairs = config.pairs.map((pair, index) => {
    const label = `pair ${index + 1}${pair.state ? ` (${pair.state})` : ""}`;
    const before = resolveSide({ ...config.before, ...pair.before, state: pair.state ?? pair.before?.state }, shared, root, `${label} before`);
    const after = resolveSide({ ...config.after, ...pair.after, state: pair.state ?? pair.after?.state }, shared, root, `${label} after`);
    checkPair(before, after, label);
    return { before, after, caption: pair.caption ?? pair.state ?? `Change ${index + 1}`, highlights: pair.highlights ?? [] };
  });
  const viewport = pairs[0].before.viewport;
  for (const pair of pairs) {
    if (pair.before.viewport.width !== viewport.width || pair.before.viewport.height !== viewport.height) {
      throw new EvidenceError(`every pair must share one viewport; ${pair.before.state} is ${pair.before.viewport.width}x${pair.before.viewport.height}, the first is ${viewport.width}x${viewport.height}`);
    }
  }
  const canvasName = String(overrides.canvas ?? config.canvas ?? "portrait").toLowerCase();
  const canvas = resolveCanvas(canvasName);
  const layout = overrides.layout ?? config.layouts?.[canvasName] ?? config.layout ?? (canvasName === "landscape" ? "side-by-side" : "sequence");
  if (!["sequence", "side-by-side"].includes(layout)) throw new UsageError(`layout must be sequence or side-by-side, got "${layout}"`);
  return {
    file,
    root,
    title: config.title ?? "",
    label: config.label ?? `${pairs[0].before.source}`,
    intro: config.intro,
    outro: config.outro ?? "After",
    pairs,
    viewport,
    canvas,
    canvasName,
    layout,
    frame: resolveFrame(overrides.frame ?? config.frames?.[canvasName] ?? config.frame, viewport),
    fps: Number(overrides.fps ?? config.fps ?? 30),
    screenRadius: Number(config.screenRadius ?? 40),
    theme: { ...DEFAULT_THEME, ...(config.theme ?? {}) },
  };
}

const compareCss = (unit) => {
  const u = (px) => `${round(px * unit, 2)}px`;
  return `
  .screen img { position: absolute; left: 0; top: 0; display: block; transform-origin: 0 0; }
  .screen .after { clip-path: inset(0 100% 0 0); transition: clip-path 900ms cubic-bezier(0.65, 0, 0.35, 1); }
  .screen.revealed .after, .screen.solo .after { clip-path: inset(0 0 0 0); }
  .screen .pair { opacity: 0; transition: opacity 320ms ease; }
  .screen .pair.current { opacity: 1; }
  .divider { position: absolute; top: 0; bottom: 0; left: 0; width: ${u(4)}; background: #fff; box-shadow: 0 0 ${u(16)} rgba(0,0,0,0.4); opacity: 0; transition: transform 900ms cubic-bezier(0.65, 0, 0.35, 1), opacity 200ms ease; }
  .screen.wiping .divider { opacity: 1; }
  .screen.revealed .divider { opacity: 0; transition: opacity 200ms ease; }
  .side { position: absolute; z-index: 5; font-weight: 700; font-size: ${u(28)}; line-height: ${u(48)}; height: ${u(48)}; padding: 0 ${u(18)}; border-radius: ${u(24)}; background: rgba(20,22,27,0.82); color: #fff; }
  .mark { position: absolute; z-index: 6; border: ${u(4)} solid #fff; border-radius: ${u(12)}; box-shadow: 0 0 0 ${u(3)} rgba(20,22,27,0.55); opacity: 0; transform: scale(1.04); transition: opacity 260ms ease, transform 300ms ease; }
  .mark span { position: absolute; left: ${u(-4)}; bottom: calc(100% + ${u(10)}); white-space: nowrap; font: 600 ${u(26)}/${u(40)} ui-sans-serif, system-ui, sans-serif; padding: 0 ${u(14)}; border-radius: ${u(20)}; background: #fff; color: #111; }
  .mark.below span { bottom: auto; top: calc(100% + ${u(10)}); }
  .mark.on { opacity: 1; transform: none; }`;
};

export async function renderComparison(cmp, { out, framesDir } = {}) {
  const ffmpeg = framesDir && !out ? null : findFfmpeg();
  const b = bands(cmp.canvas);
  const panes = cmp.layout === "side-by-side" ? 2 : 1;
  const layout = stageLayout({ canvas: cmp.canvas, region: cmp.frame, panes, padding: b.padding, top: b.top, bottom: b.bottom, gap: b.gap });
  const fullWidth = cmp.frame.x === 0 && cmp.frame.width === cmp.viewport.width && cmp.frame.y === 0;
  const radius = fullWidth ? cmp.screenRadius * layout.scale : 12 * b.unit;
  const screens = layout.screens.map((screen) => ({ ...screen, radius }));
  const dataUrl = (path) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  // Images are drawn at logical size and scaled, so a 3x capture and the frame crop line up exactly.
  const imageStyle = `width:${cmp.viewport.width}px;height:${cmp.viewport.height}px;transform:scale(${layout.scale}) translate(${-cmp.frame.x}px, ${-cmp.frame.y}px)`;
  const markHtml = (pair, index) => pair.highlights.map((mark, n) => {
    const [x, y, w, h] = mark.rect;
    const left = (x - cmp.frame.x) * layout.scale;
    const top = (y - cmp.frame.y) * layout.scale;
    const below = top < 70 * b.unit;
    return `<div class="mark${below ? " below" : ""}" data-pair="${index}" style="left:${round(left)}px;top:${round(top)}px;width:${round(w * layout.scale)}px;height:${round(h * layout.scale)}px;transition-delay:${n * 90}ms"><span>${String(mark.label ?? "").replace(/</g, "&lt;")}</span></div>`;
  }).join("");
  const screenHtml = (paneIndex) => {
    const side = panes === 2 ? (paneIndex === 0 ? "before" : "after") : null;
    const images = cmp.pairs.map((pair, index) => side
      ? `<div class="pair${index === 0 ? " current" : ""}" data-pair="${index}"><img alt="" style="${imageStyle}" src="${dataUrl(pair[side].image)}">${side === "after" ? markHtml(pair, index) : ""}</div>`
      : `<div class="pair${index === 0 ? " current" : ""}" data-pair="${index}"><img class="before" alt="" style="${imageStyle}" src="${dataUrl(pair.before.image)}"><img class="after" alt="" style="${imageStyle}" src="${dataUrl(pair.after.image)}">${markHtml(pair, index)}</div>`).join("");
    const tag = side ? `<span class="side" style="left:${round(16 * b.unit)}px;top:${round(16 * b.unit)}px">${side === "before" ? "Before" : "After"}</span>`
      : `<span class="side" id="side" style="left:${round(16 * b.unit)}px;top:${round(16 * b.unit)}px">Before</span><div class="divider" id="divider"></div>`;
    return images + tag;
  };
  const html = stageHtml({
    canvas: cmp.canvas,
    theme: cmp.theme,
    title: cmp.title,
    caption: cmp.intro ?? cmp.pairs[0].caption,
    label: cmp.label,
    screens,
    screenHtml,
    extraCss: compareCss(b.unit),
    script: `<script>
      window.__tick = ${TICK_SOURCE};
      window.__pair = (index) => {
        document.querySelectorAll(".pair").forEach((node) => node.classList.toggle("current", Number(node.dataset.pair) === index));
        document.querySelectorAll(".mark").forEach((node) => node.classList.remove("on"));
        document.querySelectorAll(".screen").forEach((node) => node.classList.remove("revealed", "wiping"));
        const divider = document.getElementById("divider");
        if (divider) { divider.style.transition = "none"; divider.style.transform = "translateX(0)"; divider.offsetHeight; divider.style.transition = ""; }
        const side = document.getElementById("side");
        if (side) side.textContent = "Before";
      };
      window.__wipe = () => {
        const screen = document.getElementById("screen-0");
        screen.classList.add("wiping");
        screen.querySelectorAll(".pair.current .after").forEach((node) => node.style.clipPath = "inset(0 0 0 0)");
        const divider = document.getElementById("divider");
        divider.style.transform = "translateX(" + (screen.clientWidth - 4) + "px)";
        document.getElementById("side").textContent = "After";
      };
      window.__revealed = () => document.getElementById("screen-0").classList.add("revealed");
      window.__marks = (index) => document.querySelectorAll('.mark[data-pair="' + index + '"]').forEach((node) => node.classList.add("on"));
    </script>`,
  });
  const { browser, executablePath } = await launchBrowser();
  const plan = [];
  const at = (time, run) => plan.push({ time, run });
  let total = 0;
  let frames = 0;
  try {
    const context = await browser.newContext({ viewport: cmp.canvas, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
    const run = (code, arg) => () => page.evaluate(([code, arg]) => window[code](arg), [code, arg]);
    const caption = (text) => () => page.evaluate((text) => window.__caption(text), text);
    const counter = (done) => () => page.evaluate(([count, done]) => window.__counter(count, done), [cmp.pairs.length, done]);
    let cursor = 0;
    at(0, counter(0));
    cmp.pairs.forEach((pair, index) => {
      if (index > 0) at(cursor, run("__pair", index));
      at(cursor + (index === 0 && cmp.intro ? 1.2 : 0), caption(`${index + 1} · ${pair.caption}`));
      if (panes === 1) {
        const hold = index === 0 ? 1.9 : 1.4;
        at(cursor + hold, run("__wipe"));
        at(cursor + hold, counter(index + 1));
        at(cursor + hold + 0.95, run("__revealed"));
        at(cursor + hold + 1.15, run("__marks", index));
        cursor += hold + 3.2;
      } else {
        at(cursor + 0.6, run("__marks", index));
        at(cursor + 0.6, counter(index + 1));
        cursor += 3.6;
      }
    });
    at(cursor, caption(cmp.outro));
    total = cursor + 1.6;
    const folder = framesDir ? resolve(framesDir) : `${resolve(out)}.frames`;
    frames = await renderPlan({ page, plan, total, fps: cmp.fps, framesDir: folder, tick: (ms) => page.evaluate((ms) => window.__tick(ms, [document]), ms) });
    if (out) {
      encode({ ffmpeg, framesDir: folder, fps: cmp.fps, canvas: cmp.canvas, out });
      if (!framesDir) rmSync(folder, { recursive: true, force: true });
    }
  } finally {
    await browser.close();
  }
  const base = dirname(resolve(out ?? framesDir));
  return {
    tool: `unslop-mobile compare ${VERSION}`,
    mode: "screenshot-comparison",
    createdAt: new Date().toISOString(),
    comparison: { file: relative(base, cmp.file), sha256: sha256(cmp.file) },
    renderer: executablePath,
    viewport: cmp.viewport,
    frame: cmp.frame,
    canvas: { ...cmp.canvas, preset: cmp.canvasName },
    layout: cmp.layout,
    screen: { width: round(screens[0].width), height: round(screens[0].height), scale: round(layout.scale, 4) },
    readability: (({ body, small, warnings }) => ({ bodyPoints: round(body, 1), smallPoints: round(small, 1), warnings }))(readability({ scale: layout.scale, canvas: cmp.canvas })),
    fps: cmp.fps,
    frames,
    seconds: round(total, 2),
    pairs: cmp.pairs.map((pair) => ({
      caption: pair.caption,
      state: pair.before.state,
      device: pair.before.deviceLabel,
      textScale: pair.before.textScale,
      fixture: pair.before.fixture,
      before: { file: relative(base, pair.before.image), sha256: sha256(pair.before.image), source: pair.before.source, size: pair.before.size },
      after: { file: relative(base, pair.after.image), sha256: sha256(pair.after.image), source: pair.after.source, size: pair.after.size },
    })),
    label: cmp.label,
    credit: CREDIT,
  };
}

if (isMain(import.meta.url)) {
  runCli(async () => {
    const { positionals, values } = parseArgs(process.argv.slice(2), { options: ["canvas", "frame", "layout", "fps", "frames"] });
    const [input, out] = positionals;
    if (!input || (!out && !values.frames)) throw new UsageError(USAGE);
    const cmp = loadComparison(input, { canvas: values.canvas, frame: values.frame, layout: values.layout, fps: number(values.fps, "fps", { min: 1, max: 120 }) });
    console.log(`${cmp.pairs.length} pair(s) · viewport ${cmp.viewport.width}×${cmp.viewport.height} · canvas ${cmp.canvas.width}×${cmp.canvas.height} (${cmp.canvasName}, ${cmp.layout})`);
    const record = await renderComparison(cmp, { out, framesDir: values.frames });
    record.readability.warnings.forEach((warning) => console.warn(`warning: ${warning}`));
    if (out) writeFileSync(`${resolve(out)}.json`, JSON.stringify(record, null, 2) + "\n");
    console.log(`saved ${out ? resolve(out) : resolve(values.frames)} · ${record.frames} frames · ${record.seconds}s`);
  });
}
