#!/usr/bin/env node
// Captures the same states of a mobile web page at real phone viewports, for every variant
// (usually "before" and "after"), and writes a manifest describing exactly how each image was made.
//
//   node scripts/capture.mjs <capture.json> [--out=folder] [--variant=before,after]
//        [--device=ids] [--state=ids] [--text-scale=1,1.3]
//
// See references/evidence.md for the config format and what the measurements mean.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, list } from "./lib/args.mjs";
import { EvidenceError, UsageError, isMain, runCli } from "./lib/errors.mjs";
import { launchBrowser } from "./lib/deps.mjs";
import { pngSize, readJson, sha256, slug, toolVersion, writeJson } from "./lib/files.mjs";
import { applyTextScale, mobileContext, normalizeDevice, simulateKeyboard } from "./lib/mobile.mjs";
import { measurePage, summarize } from "./lib/measure.mjs";

const VERSION = toolVersion();
const USAGE = "node scripts/capture.mjs <capture.json> [--out=folder] [--variant=before,after] [--device=ids] [--state=ids] [--text-scale=1,1.3]";

export function loadConfig(path) {
  const file = resolve(path);
  const config = readJson(file, "capture config");
  const root = dirname(file);
  const given = config.variants ?? (config.source ? { current: config.source } : null);
  if (!given || !Object.keys(given).length) throw new UsageError(`${path} needs "variants" like {"before": "before.html", "after": "after.html"}`);
  // A variant is a page, or {source, presentation} when one variant needs its own presentation-only
  // stylesheet (for example an older study that has no full-screen mode of its own).
  const variants = {};
  for (const [name, value] of Object.entries(given)) {
    const source = typeof value === "string" ? value : value?.source;
    if (!source) throw new UsageError(`variant "${name}" needs a source page`);
    if (!/^https?:/.test(source) && !existsSync(resolve(root, source.split("?")[0]))) throw new UsageError(`variant "${name}" points at ${source}, which does not exist next to ${path}`);
    const own = typeof value === "object" && value.presentation ? resolve(root, value.presentation) : null;
    if (own && !existsSync(own)) throw new UsageError(`variant "${name}" presentation stylesheet not found: ${value.presentation}`);
    variants[name] = { source, presentation: own };
  }
  if (!Array.isArray(config.devices) || !config.devices.length) throw new UsageError(`${path} needs at least one entry in "devices"`);
  if (!Array.isArray(config.states) || !config.states.length) throw new UsageError(`${path} needs at least one entry in "states"`);
  const ids = new Set();
  for (const state of config.states) {
    if (!state.id) throw new UsageError(`every state needs an "id"`);
    if (ids.has(state.id)) throw new UsageError(`state id "${state.id}" is used twice`);
    ids.add(state.id);
    (state.steps ?? []).forEach(checkStep);
  }
  return {
    file,
    root,
    name: config.name ?? slug(file),
    label: config.label ?? "",
    provenance: config.provenance ?? "",
    variants,
    fixture: config.fixture ? resolve(root, config.fixture) : null,
    presentation: config.presentation ? resolve(root, config.presentation) : null,
    hash: (config.hash ?? []).map((item) => resolve(root, item)),
    devices: config.devices.map(normalizeDevice),
    textScales: (config.textScales ?? [1]).map(Number),
    clock: config.clock ? checkClock(config.clock) : null,
    states: config.states,
  };
}

// Pages that derive ids, dates or colours from the current time render differently on every run.
// A fixed clock keeps before and after on the same data.
function checkClock(value) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) throw new UsageError(`clock must be an ISO date like 2026-10-30T12:00:00Z, got "${value}"`);
  return time.toISOString();
}

const STEP_KINDS = ["click", "fill", "press", "focus", "scroll", "wait", "waitFor"];

function checkStep(step) {
  const kinds = Object.keys(step).filter((key) => STEP_KINDS.includes(key));
  if (kinds.length !== 1) throw new UsageError(`each step needs exactly one of ${STEP_KINDS.join(", ")}; got ${JSON.stringify(step)}`);
}

async function runStep(page, step) {
  if (step.click) return page.click(step.click);
  if (step.fill) return page.fill(step.fill[0], step.fill[1]);
  if (step.focus) return page.focus(step.focus);
  if (step.press) return Array.isArray(step.press) ? page.press(step.press[0], step.press[1]) : page.keyboard.press(step.press);
  if (step.waitFor) return page.waitForSelector(step.waitFor, { state: "visible" });
  if (step.wait) return page.waitForTimeout(Number(step.wait));
  if (step.scroll) {
    const [selector, y] = step.scroll;
    return page.evaluate(([selector, y]) => {
      const target = selector ? document.querySelector(selector) : document.scrollingElement;
      if (!target) throw new Error(`no element matches ${selector}`);
      target.scrollTop = y === "end" ? target.scrollHeight : Number(y);
    }, [selector, y]);
  }
}

function sourceUrl(config, source, state) {
  const query = state.query ?? "";
  if (/^https?:/.test(source)) return source + query;
  const [path, ownQuery] = source.split("?");
  const url = pathToFileURL(resolve(config.root, path));
  url.search = [ownQuery, query.replace(/^\?/, "")].filter(Boolean).join("&");
  return url.href;
}

export async function capture(config, { out, variants, devices, states, textScales } = {}) {
  const chosen = {
    variants: Object.entries(config.variants).filter(([name]) => !variants || variants.includes(name)),
    devices: config.devices.filter((device) => !devices || devices.includes(device.id)),
    states: config.states.filter((state) => !states || states.includes(state.id)),
    textScales: textScales ?? config.textScales,
  };
  for (const [what, items] of Object.entries(chosen)) if (!items.length) throw new UsageError(`no ${what} matched the filters`);
  const sharedPresentation = config.presentation ? readFileSync(config.presentation, "utf8") : "";
  const { browser, executablePath } = await launchBrowser();
  const manifest = {
    tool: `unslop-mobile capture ${VERSION}`,
    kind: "browser-capture",
    note: "Chromium mobile emulation of a web page. Not a native iOS or Android screenshot.",
    createdAt: new Date().toISOString(),
    name: config.name,
    label: config.label,
    provenance: config.provenance,
    browser: { version: browser.version(), executable: executablePath },
    config: { file: relative(out, config.file), sha256: sha256(config.file) },
    fixture: config.fixture ? { file: relative(out, config.fixture), sha256: sha256(config.fixture) } : null,
    presentation: config.presentation ? { file: relative(out, config.presentation), sha256: sha256(config.presentation) } : null,
    sources: Object.fromEntries(Object.entries(config.variants).map(([name, { source, presentation }]) => [name, {
      ...(/^https?:/.test(source) ? { url: source } : { file: relative(out, resolve(config.root, source.split("?")[0])), query: source.split("?")[1] ?? "", sha256: sha256(resolve(config.root, source.split("?")[0])) }),
      ...(presentation ? { presentation: { file: relative(out, presentation), sha256: sha256(presentation) } } : {}),
    }])),
    hashed: config.hash.map((file) => ({ file: relative(out, file), sha256: sha256(file) })),
    clock: config.clock,
    captures: [],
  };
  try {
    for (const [variant, { source, presentation: own }] of chosen.variants) {
      const presentation = [sharedPresentation, own ? readFileSync(own, "utf8") : ""].join("\n").trim();
      for (const device of chosen.devices) {
        for (const textScale of chosen.textScales) {
          for (const state of chosen.states) {
            manifest.captures.push(await captureOne({ config, browser, out, variant, source, device, textScale, state, presentation }));
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  writeJson(join(out, "manifest.json"), manifest);
  return manifest;
}

async function captureOne({ config, browser, out, variant, source, device, textScale, state, presentation }) {
  const { context, page } = await mobileContext(browser, device);
  // A page that throws can still look plausible in a screenshot, so errors stop the capture.
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(Number(state.timeout ?? 5000));
  const where = `${variant}/${device.id}/${state.id}`;
  if (config.clock) await page.clock.setFixedTime(new Date(config.clock));
  try {
    await page.goto(sourceUrl(config, source, state), { waitUntil: "load" });
    if (presentation) await page.addStyleTag({ content: presentation });
    await page.evaluate(() => document.fonts.ready);
    if (errors.length) throw new EvidenceError(`${where}: the page threw while loading: ${errors[0]}`);
    for (const [index, step] of (state.steps ?? []).entries()) {
      try {
        await runStep(page, step);
      } catch (error) {
        throw new EvidenceError(`${where}: step ${index + 1} ${JSON.stringify(step)} failed: ${String(error.message).split("\n")[0]}${errors.length ? ` (page error: ${errors[0]})` : ""}`);
      }
    }
    if (errors.length) throw new EvidenceError(`${where}: the page threw during the steps: ${errors[0]}`);
    // Text scaling runs once, after the steps, so screens a step renders are scaled as well.
    await applyTextScale(page, textScale);
    const keyboard = state.keyboard ? Number(device.keyboard ?? state.keyboardHeight ?? 0) || defaultKeyboard(device) : 0;
    if (keyboard) await simulateKeyboard(page, device, keyboard);
    await page.waitForTimeout(Number(state.settle ?? 150));
    const measured = await page.evaluate(measurePage, { minTarget: device.minTarget, safeArea: device.safeArea });
    const expected = { width: device.viewport.width, height: device.viewport.height - keyboard };
    if (measured.viewport.width !== expected.width || measured.viewport.height !== expected.height) {
      const hint = measured.viewport.width === 980 ? ' The page has no mobile viewport tag; add <meta name="viewport" content="width=device-width, initial-scale=1">.' : "";
      throw new EvidenceError(`${variant}/${state.id} laid out at ${measured.viewport.width}x${measured.viewport.height} CSS px, not the requested ${expected.width}x${expected.height}.${hint}`);
    }
    if (Math.abs(measured.viewport.devicePixelRatio - device.scale) > 1e-6) {
      throw new EvidenceError(`${variant}/${state.id} rendered at device scale ${measured.viewport.devicePixelRatio}, not ${device.scale}`);
    }
    const folder = join(out, variant, `${device.id}-t${Math.round(textScale * 100)}`);
    mkdirSync(folder, { recursive: true });
    const file = join(folder, `${slug(state.id)}.png`);
    await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
    const image = pngSize(file);
    const pixels = { width: Math.round(expected.width * device.scale), height: Math.round(expected.height * device.scale) };
    if (image.width !== pixels.width || image.height !== pixels.height) {
      throw new EvidenceError(`${file} is ${image.width}x${image.height} px, expected ${pixels.width}x${pixels.height} for ${expected.width}x${expected.height} at ${device.scale}x`);
    }
    const notes = summarize(measured);
    console.log(`  ${variant}/${device.id} ${device.scale}x text ${textScale}× ${state.id}${keyboard ? " (keyboard)" : ""}: ${image.width}×${image.height}${notes.length ? " · " + notes.join(" · ") : ""}`);
    return {
      variant,
      state: state.id,
      device: { id: device.id, label: device.label, platform: device.platform, viewport: device.viewport, scale: device.scale, safeArea: device.safeArea, minTarget: device.minTarget },
      textScale,
      keyboard: keyboard ? { height: keyboard, note: "Simulated by shrinking the viewport; not a native keyboard." } : null,
      file: relative(out, file),
      image,
      measured,
      notes,
    };
  } finally {
    await context.close();
  }
}

// Typical portrait keyboard heights with a suggestion bar, in logical units. Override per device.
function defaultKeyboard(device) {
  if (device.platform === "android") return Math.round(device.viewport.height * 0.38);
  return device.viewport.width >= 428 ? 346 : device.viewport.width >= 375 ? 336 : 253;
}

if (isMain(import.meta.url)) {
  runCli(async () => {
    const { positionals, values } = parseArgs(process.argv.slice(2), { options: ["out", "variant", "device", "state", "text-scale"] });
    if (positionals.length !== 1) throw new UsageError(USAGE);
    const config = loadConfig(positionals[0]);
    const out = resolve(values.out ?? join(config.root, "captures"));
    console.log(`capturing ${config.name} into ${out}`);
    const manifest = await capture(config, {
      out,
      variants: list(values.variant),
      devices: list(values.device),
      states: list(values.state),
      textScales: list(values["text-scale"])?.map(Number),
    });
    console.log(`saved ${manifest.captures.length} captures and ${join(out, "manifest.json")}`);
  });
}
