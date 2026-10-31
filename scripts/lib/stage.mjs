// The video stage shared by story.mjs and compare.mjs: a canvas-sized page with a caption band,
// one or more phone screens, a provenance label and the attribution credit. Frames are stepped
// with paused animations so every render of the same input produces the same frames.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { containFit, round } from "./geometry.mjs";

export const CREDIT = "unslop-mobile · adapted from unslop by @heydamir";

export const DEFAULT_THEME = Object.freeze({ background: "#14161B", text: "#F4F5F7", muted: "#A9AFBA", screenEdge: "rgba(255,255,255,0.16)" });

// Bands scale with the canvas so captions stay readable on a phone whatever the output size.
export function bands(canvas) {
  const unit = Math.min(canvas.width, canvas.height) / 1080;
  return {
    unit,
    top: Math.round(250 * unit),
    bottom: Math.round(112 * unit),
    padding: Math.round(40 * unit),
    gap: Math.round(48 * unit),
  };
}

// Square and landscape canvases are short, so a caption band above the phone leaves it tiny. The
// side layout gives the phone the full height and sets the caption in a column beside it.
export function sideLayout({ canvas, region }) {
  const b = bands(canvas);
  const height = canvas.height - b.bottom - b.padding * 2;
  const maxWidth = canvas.width * 0.52 - b.padding * 1.5;
  const fit = containFit(region, { x: canvas.width - b.padding - maxWidth, y: b.padding, width: maxWidth, height });
  // On a wide canvas the caption column is capped and the pair is centred, so neither the words nor
  // the phone end up stranded at an edge. Captions grow with the column.
  const gap = b.padding * 2.5;
  const width = Math.min(canvas.width - b.padding * 2 - gap - fit.width, 900 * b.unit);
  const left = (canvas.width - (width + gap + fit.width)) / 2;
  const panel = { x: left, y: b.padding, width, height, type: Math.min(1.4, Math.max(1, width / (540 * b.unit))) };
  const screen = { x: left + width + gap, y: fit.y, width: fit.width, height: fit.height };
  return { scale: fit.scale, screens: [screen], panel };
}

const escape = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

export function stageHtml({ canvas, theme = DEFAULT_THEME, title = "", caption = "", label = "", screens, screenHtml, panel = null, extraCss = "", script = "" }) {
  const b = bands(canvas);
  const u = (px) => `${round(px * b.unit, 2)}px`;
  const side = panel ? `
  .header { top: ${round(panel.y)}px; left: ${round(panel.x)}px; right: auto; width: ${round(panel.width)}px; height: ${round(panel.height)}px; justify-content: center; padding: 0; }
  .title { font-size: ${u(32 * panel.type)}; margin-bottom: ${u(22)}; }
  .caption { min-height: ${u(240 * panel.type)}; }
  .caption > span { top: 0; bottom: auto; font-size: ${u(66 * panel.type)}; line-height: 1.08; }
  .counter { margin-top: ${u(30)}; }` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
  html, body { margin: 0; width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; background: ${theme.background}; color: ${theme.text};
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  .band { position: absolute; left: ${b.padding}px; right: ${b.padding}px; }
  .header { top: 0; height: ${b.top}px; display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: ${u(22)}; box-sizing: border-box; }
  .title { font-weight: 600; font-size: ${u(30)}; line-height: 1.25; color: ${theme.muted}; margin-bottom: ${u(14)}; }
  .caption { position: relative; min-height: ${u(132)}; }
  .caption > span { position: absolute; left: 0; right: 0; bottom: 0; font-weight: 700; font-size: ${u(54)}; line-height: 1.12; letter-spacing: -0.01em;
    transition: opacity 240ms cubic-bezier(0.22, 1, 0.36, 1), transform 240ms cubic-bezier(0.22, 1, 0.36, 1); }
  .caption > span.leaving { opacity: 0; transform: translateY(${u(-18)}); }
  .caption > span.entering { opacity: 0; transform: translateY(${u(18)}); }
  .counter { display: flex; gap: ${u(10)}; margin-top: ${u(18)}; height: ${u(8)}; }
  .counter i { flex: 0 0 ${u(44)}; border-radius: ${u(4)}; background: ${theme.muted}; opacity: 0.28; transition: opacity 300ms ease, background-color 300ms ease; }
  .counter i.done { opacity: 1; background: ${theme.text}; }
  .screen { position: absolute; overflow: hidden; background: #fff; box-shadow: 0 0 0 ${u(2)} ${theme.screenEdge}, 0 ${u(24)} ${u(60)} rgba(0,0,0,0.35); }
  .footer { bottom: 0; height: ${b.bottom}px; display: flex; align-items: center; justify-content: space-between; gap: ${u(24)}; }
  .label { font-weight: 500; font-size: ${u(23)}; line-height: 1.3; color: ${theme.muted}; text-wrap: balance; }
  .credit { font-weight: 500; font-size: ${u(23)}; color: ${theme.muted}; white-space: nowrap; }
  #story-layer { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
  #story-layer > * { position: absolute; }${side}
  ${extraCss}
</style></head><body>
  <div class="band header"><div class="title">${escape(title)}</div><div class="caption" id="caption"><span>${escape(caption)}</span></div><div class="counter" id="counter"></div></div>
  ${screens.map((screen, index) => `<div class="screen" id="screen-${index}" style="left:${round(screen.x)}px;top:${round(screen.y)}px;width:${round(screen.width)}px;height:${round(screen.height)}px;border-radius:${round(screen.radius ?? 0)}px">${screenHtml(index)}</div>`).join("\n  ")}
  <div class="band footer"><span class="label">${escape(label)}</span><span class="credit">${escape(CREDIT)}</span></div>
  <div id="story-layer"></div>
  <script>
    window.__caption = (text) => {
      const box = document.getElementById("caption");
      const old = box.lastElementChild;
      if (old && old.textContent === text) return;
      // The old caption fades out before the new one rises, and is removed when its own transition
      // ends, so a frame-stepped render and a live one show the same sequence.
      if (old) { old.addEventListener("transitionend", () => old.remove(), { once: true }); old.classList.add("leaving"); }
      const next = document.createElement("span");
      next.className = "entering";
      if (old) next.style.transitionDelay = "200ms";
      next.textContent = text;
      box.appendChild(next);
      next.offsetHeight;
      next.classList.remove("entering");
    };
    // The caption box is as tall as the longest caption the video will show, so a caption that
    // wraps to more lines never runs into the step counter beneath it.
    window.__fitCaptions = (texts) => {
      const box = document.getElementById("caption");
      const probe = document.createElement("span");
      probe.style.visibility = "hidden";
      box.appendChild(probe);
      let tallest = 0;
      for (const text of texts) {
        probe.textContent = text;
        tallest = Math.max(tallest, probe.getBoundingClientRect().height);
      }
      probe.remove();
      box.style.minHeight = Math.ceil(tallest) + "px";
      return Math.ceil(tallest);
    };
    window.__counter = (count, done) => {
      const box = document.getElementById("counter");
      if (box.children.length !== count) box.innerHTML = "<i></i>".repeat(count);
      [...box.children].forEach((dot, index) => dot.classList.toggle("done", index < done));
    };
  </script>
  ${script}
</body></html>`;
}

// Runs a timed plan against a page, either live in a window or frame by frame for encoding.
// `tick(ms)` must move every animation to that time so screenshots are deterministic.
export async function renderPlan({ page, plan, total, fps, framesDir, tick, play = false, onFrame }) {
  plan.sort((a, b) => a.time - b.time);
  if (play) {
    const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));
    const begin = Date.now();
    for (const { time, run } of plan) {
      await sleep(begin + time * 1000 - Date.now());
      await run();
    }
    await sleep(begin + total * 1000 - Date.now());
    return 0;
  }
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  let next = 0;
  const count = Math.round(total * fps);
  for (let index = 0; index <= count; index++) {
    const now = index / fps;
    while (next < plan.length && plan[next].time <= now + 1e-6) await plan[next++].run();
    await tick(now * 1000);
    await page.screenshot({ path: join(framesDir, `f-${String(index).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
    onFrame?.(index, count);
  }
  return count + 1;
}

export function encode({ ffmpeg, framesDir, fps, canvas, out }) {
  const frames = readdirSync(framesDir).filter((name) => name.endsWith(".jpg")).length;
  execFileSync(ffmpeg, [
    "-y", "-loglevel", "error",
    "-framerate", String(fps),
    "-i", join(framesDir, "f-%05d.jpg"),
    // The frames are already canvas-sized; this guarantees the exact size, square pixels and the
    // limited-range yuv420p that phone players expect (JPEG frames are full range).
    "-vf", `scale=${canvas.width}:${canvas.height}:flags=lanczos:out_range=tv,setsar=1,format=yuv420p`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow",
    "-movflags", "+faststart",
    resolve(out),
  ]);
  return frames;
}

// Shared by both renderers: pause every animation the first time it is seen, then seek it.
export const TICK_SOURCE = `
  (() => {
    const managed = new WeakMap();
    return (ms, documents) => {
      for (const doc of documents) {
        for (const animation of doc.getAnimations()) {
          if (!managed.has(animation)) {
            if (animation.playState !== "running") continue;
            managed.set(animation, ms);
            animation.pause();
          }
          const time = ms - managed.get(animation);
          const end = animation.effect ? animation.effect.getComputedTiming().endTime : Infinity;
          if (Number.isFinite(end) && time >= end) animation.finish();
          else animation.currentTime = time;
        }
      }
    };
  })()
`;
