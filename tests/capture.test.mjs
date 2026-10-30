import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { capture, loadConfig } from "../scripts/capture.mjs";
import { EvidenceError } from "../scripts/lib/errors.mjs";
import { pngSize } from "../scripts/lib/files.mjs";
import { ROOT, browserSkip, tempDir } from "./helpers.mjs";

const quiet = (fn) => async (...args) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn(...args);
  } finally {
    console.log = log;
  }
};

function setup(config) {
  const dir = tempDir();
  for (const page of ["responsive.html", "no-viewport.html"]) cpSync(join(ROOT, "tests", "fixtures", page), join(dir, page));
  writeFileSync(join(dir, "fixture.json"), JSON.stringify({ fictional: true, people: ["Ana"] }));
  writeFileSync(join(dir, "capture.json"), JSON.stringify({ fixture: "fixture.json", ...config }));
  return { dir, config: loadConfig(join(dir, "capture.json")) };
}

const devices = [
  { id: "phone-390", viewport: "390x844", scale: 3, safeArea: { top: 47, bottom: 34 } },
  { id: "phone-320", viewport: "320x568", scale: 2 },
  { id: "android-360", platform: "android", viewport: "360x800", scale: 3 },
];

test("captures use the requested mobile viewport, scale and touch input", { skip: await browserSkip() }, quiet(async () => {
  const { dir, config } = setup({ variants: { before: "responsive.html", after: "responsive.html" }, devices, states: [{ id: "page" }] });
  const manifest = await capture(config, { out: join(dir, "out") });
  assert.equal(manifest.captures.length, 6);
  for (const item of manifest.captures) {
    const { width, height } = item.device.viewport;
    assert.equal(item.measured.viewport.width, width, "laid out at the requested width");
    assert.equal(item.measured.viewport.height, height, "laid out at the requested height");
    assert.equal(item.measured.viewport.devicePixelRatio, item.device.scale);
    assert.equal(item.measured.viewport.coarsePointer, true, "touch pointer");
    assert.equal(item.measured.viewport.hover, false, "no hover");
    assert.deepEqual(pngSize(join(dir, "out", item.file)), { width: width * item.device.scale, height: height * item.device.scale });
    assert.equal(item.measured.horizontalOverflow, 0);
    // The page's own media query chose the phone layout: only the phone paragraph is visible text.
    assert.ok(item.measured.smallestText.some((entry) => entry.samples.includes("Phone layout")));
    assert.ok(!item.measured.smallestText.some((entry) => entry.samples.includes("Desktop layout")));
  }
}));

test("before and after are captured with matching sizes and one fixture", { skip: await browserSkip() }, quiet(async () => {
  const { dir, config } = setup({ variants: { before: "responsive.html", after: "responsive.html?v=2" }, devices: devices.slice(0, 2), textScales: [1, 1.3], states: [{ id: "page" }] });
  const manifest = await capture(config, { out: join(dir, "out") });
  assert.match(manifest.fixture.sha256, /^[0-9a-f]{64}$/);
  const key = (item) => `${item.device.id}|${item.textScale}|${item.state}`;
  const before = new Map(manifest.captures.filter((item) => item.variant === "before").map((item) => [key(item), item]));
  const after = manifest.captures.filter((item) => item.variant === "after");
  assert.equal(after.length, before.size);
  for (const item of after) assert.deepEqual(item.image, before.get(key(item)).image, key(item));
}));

test("measurements find small targets, covered actions and controls inside safe areas", { skip: await browserSkip() }, quiet(async () => {
  const { dir, config } = setup({ variants: { only: "responsive.html" }, devices: [devices[0], devices[2]], states: [{ id: "page" }] });
  const manifest = await capture(config, { out: join(dir, "out") });
  const [ios, android] = manifest.captures;
  assert.ok(ios.measured.smallTargets.some((t) => t.label === "Tiny" && t.width === 30));
  assert.ok(!ios.measured.smallTargets.some((t) => t.label === "Left"), "48 px bar buttons meet 44");
  assert.ok(android.measured.smallTargets.some((t) => t.label === "Tiny"));
  assert.ok(ios.measured.covered.some((t) => t.label === "Covered" && /toast/.test(t.by)));
  assert.ok(ios.measured.underInsets.some((t) => t.label === "Left" && t.edge === "bottom"), "a bar at bottom:0 sits in the 34 pt inset");
  assert.equal(android.measured.underInsets.length, 0, "no insets emulated on that device");
}));

test("a page without a mobile viewport tag is refused, with the fix", { skip: await browserSkip() }, quiet(async () => {
  const { dir, config } = setup({ variants: { only: "no-viewport.html" }, devices: [devices[0]], states: [{ id: "page" }] });
  await assert.rejects(capture(config, { out: join(dir, "out") }), (error) => error instanceof EvidenceError && /980x/.test(error.message) && /width=device-width/.test(error.message));
}));

test("a failing step names the state and the step", { skip: await browserSkip() }, quiet(async () => {
  const { dir, config } = setup({ variants: { only: "responsive.html" }, devices: [devices[1]], states: [{ id: "broken", steps: [{ click: "#does-not-exist" }], timeout: 500 }] });
  await assert.rejects(capture(config, { out: join(dir, "out") }), /only\/phone-320\/broken: step 1 \{"click":"#does-not-exist"\} failed/);
}));

test("the keyboard proxy shrinks the viewport and is labelled as a proxy", { skip: await browserSkip() }, quiet(async () => {
  const { dir, config } = setup({ variants: { only: "responsive.html" }, devices: [{ ...devices[0], keyboard: 336 }], states: [{ id: "typing", keyboard: true, steps: [{ focus: "button.tiny" }] }] });
  const [item] = (await capture(config, { out: join(dir, "out") })).captures;
  assert.equal(item.measured.viewport.height, 844 - 336);
  assert.deepEqual(item.image, { width: 1170, height: (844 - 336) * 3 });
  assert.match(item.keyboard.note, /not a native keyboard/);
}));
