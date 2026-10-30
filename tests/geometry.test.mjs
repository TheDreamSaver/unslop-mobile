import test from "node:test";
import assert from "node:assert/strict";
import { CANVAS_PRESETS, containFit, parseRect, parseSize, readability, resolveCanvas, resolveFrame, stageLayout } from "../scripts/lib/geometry.mjs";
import { UsageError } from "../scripts/lib/errors.mjs";
import { bands } from "../scripts/lib/stage.mjs";
import { parseArgs } from "../scripts/lib/args.mjs";

test("sizes parse from text, arrays and objects, and reject nonsense", () => {
  assert.deepEqual(parseSize("390x844"), { width: 390, height: 844 });
  assert.deepEqual(parseSize("390×844"), { width: 390, height: 844 });
  assert.deepEqual(parseSize([360, 800]), { width: 360, height: 800 });
  assert.deepEqual(parseSize({ width: 430, height: 932 }), { width: 430, height: 932 });
  for (const bad of ["390", "x844", "0x844", "-1x2", "", undefined]) assert.throws(() => parseSize(bad), UsageError, String(bad));
});

test("canvas presets cover portrait, square and landscape, and custom sizes must be even", () => {
  assert.deepEqual(resolveCanvas("portrait"), { width: 1080, height: 1920 });
  assert.deepEqual(resolveCanvas("square"), { width: 1080, height: 1080 });
  assert.deepEqual(resolveCanvas("landscape"), { width: 1920, height: 1080 });
  assert.deepEqual(resolveCanvas("1080x1350"), { width: 1080, height: 1350 });
  assert.throws(() => resolveCanvas("1081x1920"), /even/);
  assert.throws(() => resolveCanvas("1080.5x1920"), /even/);
});

test("fitting a phone viewport into any canvas keeps its aspect ratio exactly", () => {
  const viewport = { width: 390, height: 844 };
  for (const name of Object.keys(CANVAS_PRESETS)) {
    const canvas = resolveCanvas(name);
    const b = bands(canvas);
    const layout = stageLayout({ canvas, region: viewport, padding: b.padding, top: b.top, bottom: b.bottom });
    const [screen] = layout.screens;
    assert.ok(Math.abs(screen.width / screen.height - viewport.width / viewport.height) < 1e-9, `${name} aspect`);
    assert.ok(Math.abs(screen.width - viewport.width * layout.scale) < 1e-9 && Math.abs(screen.height - viewport.height * layout.scale) < 1e-9, `${name} uniform scale`);
    assert.ok(screen.x >= b.padding - 1e-9 && screen.x + screen.width <= canvas.width - b.padding + 1e-9, `${name} inside horizontally`);
    assert.ok(screen.y >= b.top + b.padding - 1e-9 && screen.y + screen.height <= canvas.height - b.bottom - b.padding + 1e-9, `${name} inside vertically`);
  }
});

test("the logical viewport and the output canvas are independent", () => {
  const viewport = { width: 390, height: 844 };
  const portrait = stageLayout({ canvas: resolveCanvas("portrait"), region: viewport });
  const landscape = stageLayout({ canvas: resolveCanvas("landscape"), region: viewport });
  // Changing the canvas changes only the scale on screen, never the size the page lays out at.
  assert.notEqual(portrait.scale, landscape.scale);
  assert.deepEqual(viewport, { width: 390, height: 844 });
  // Changing the viewport never changes the canvas.
  const canvas = resolveCanvas("portrait");
  const small = stageLayout({ canvas, region: { width: 320, height: 568 } });
  assert.deepEqual(canvas, { width: 1080, height: 1920 });
  assert.ok(Math.abs(small.screens[0].width / small.screens[0].height - 320 / 568) < 1e-9);
});

test("contain fit never stretches and centres the leftover space", () => {
  const fit = containFit({ width: 100, height: 200 }, { x: 0, y: 0, width: 400, height: 400 });
  assert.equal(fit.scale, 2);
  assert.deepEqual([fit.width, fit.height, fit.x, fit.y], [200, 400, 100, 0]);
});

test("side-by-side panes are equal, separated and inside the canvas", () => {
  const canvas = resolveCanvas("landscape");
  const layout = stageLayout({ canvas, region: { width: 390, height: 844 }, panes: 2, padding: 40, top: 200, bottom: 100, gap: 48 });
  const [a, b] = layout.screens;
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  assert.ok(b.x - (a.x + a.width) >= 48 - 1e-9);
  assert.ok(b.x + b.width <= canvas.width - 40 + 1e-9);
});

test("frames are crops inside the viewport", () => {
  const viewport = { width: 390, height: 844 };
  assert.deepEqual(resolveFrame(undefined, viewport), { x: 0, y: 0, width: 390, height: 844 });
  assert.deepEqual(resolveFrame("0,200,390,400", viewport), { x: 0, y: 200, width: 390, height: 400 });
  assert.deepEqual(parseRect([10, 20, 30, 40]), { x: 10, y: 20, width: 30, height: 40 });
  assert.throws(() => resolveFrame("0,500,390,400", viewport), /outside/);
  assert.throws(() => resolveFrame("0,0,390", viewport), /x,y,width,height/);
});

test("readability reports phone-sized text and warns when a full screen is too small", () => {
  const portrait = readability({ scale: 1.75, canvas: resolveCanvas("portrait") });
  assert.ok(portrait.body > 8 && portrait.warnings.length === 0);
  const square = readability({ scale: 0.85, canvas: resolveCanvas("square") });
  assert.ok(square.body < 8);
  assert.match(square.warnings[0], /--frame/);
});

test("arguments reject unknown options and options without values", () => {
  assert.deepEqual(parseArgs(["a.json", "--canvas=square", "--play"], { flags: ["play"], options: ["canvas"] }), { positionals: ["a.json"], values: { canvas: "square", play: true } });
  assert.throws(() => parseArgs(["--wat"], {}), /unknown option/);
  assert.throws(() => parseArgs(["--canvas"], { options: ["canvas"] }), /needs a value/);
});
