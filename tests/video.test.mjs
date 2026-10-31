import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadStory, renderStory, runtime, storyLayout } from "../scripts/story.mjs";
import { checkPair, loadComparison, renderComparison } from "../scripts/compare.mjs";
import { EvidenceError } from "../scripts/lib/errors.mjs";
import { EXAMPLE, browserSkip, ffmpegSkip, jpegSize, probe, tempDir, writePng } from "./helpers.mjs";

const story = join(EXAMPLE, "story.json");

test("the example story lays out at a phone viewport in every canvas, without stretching", () => {
  for (const canvas of ["portrait", "square", "landscape"]) {
    const loaded = loadStory(story, { canvas });
    assert.deepEqual(loaded.viewport, { width: 390, height: 844 }, "the viewport does not follow the canvas");
    const layout = storyLayout(loaded);
    assert.ok(Math.abs(layout.screen.width / layout.screen.height - loaded.frame.width / loaded.frame.height) < 1e-9, `${canvas} keeps the aspect ratio`);
    assert.ok(layout.screen.x >= 0 && layout.screen.y >= 0 && layout.screen.x + layout.screen.width <= loaded.canvas.width && layout.screen.y + layout.screen.height <= loaded.canvas.height, `${canvas} fits`);
  }
  const portrait = storyLayout(loadStory(story));
  assert.ok(portrait.readability.body > 8, "14 px text plays above 8 pt in portrait");
  assert.ok(storyLayout(loadStory(story, { canvas: "square" })).readability.warnings.length, "a whole phone screen in a square canvas warns");
});

test("frames are explicit crops, and the viewport can be overridden for desktop stories", () => {
  const cropped = loadStory(story, { canvas: "square", layout: "stack", frame: "0,0,390,390" });
  assert.deepEqual(cropped.frame, { x: 0, y: 0, width: 390, height: 390 });
  assert.ok(storyLayout(cropped).readability.warnings.length === 0, "cropping close fixes the warning");
  assert.deepEqual(loadStory(story, { viewport: "1440x900" }).viewport, { width: 1440, height: 900 });
});

test("square and landscape default to a side layout that gives the phone the full height", () => {
  for (const canvas of ["square", "landscape"]) {
    const loaded = loadStory(story, { canvas });
    assert.equal(loaded.layout, "side");
    const layout = storyLayout(loaded);
    const stacked = storyLayout(loadStory(story, { canvas, layout: "stack" }));
    assert.ok(layout.scale > stacked.scale, `${canvas}: the side layout shows the phone larger`);
    assert.ok(layout.panel.x + layout.panel.width <= layout.screen.x, `${canvas}: the caption column stays clear of the screen`);
    assert.ok(Math.abs(layout.screen.width / layout.screen.height - 390 / 844) < 1e-9, `${canvas}: aspect ratio kept`);
  }
  assert.equal(loadStory(story).layout, "stack", "portrait keeps the caption band");
  assert.throws(() => loadStory(story, { layout: "diagonal" }), /stack or side/);
});

test("zoom regions are parsed per step and must lie inside the viewport", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "page.html"), "<meta name=viewport content='width=device-width'><p>hi</p>");
  writeFileSync(join(dir, "story.json"), JSON.stringify({ source: "page.html", steps: [{ name: "A", zoom: [0, 100, 390, 300], kind: "sizes", measure: ["p"] }, { name: "B", zoom: "full" }] }));
  const loaded = loadStory(join(dir, "story.json"));
  assert.deepEqual(loaded.steps[0].zoom, { x: 0, y: 100, width: 390, height: 300 });
  assert.equal(loaded.steps[1].zoom, null);
  writeFileSync(join(dir, "bad.json"), JSON.stringify({ source: "page.html", steps: [{ name: "A", zoom: [0, 700, 390, 300] }] }));
  assert.throws(() => loadStory(join(dir, "bad.json")), /outside/);
  writeFileSync(join(dir, "kind.json"), JSON.stringify({ source: "page.html", steps: [{ name: "A", kind: "sparkles" }] }));
  assert.throws(() => loadStory(join(dir, "kind.json")), /use one of/);
});

test("how long the original and the result are held is read from the story and checked", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "page.html"), "<meta name=viewport content='width=device-width'><p>hi</p>");
  writeFileSync(join(dir, "story.json"), JSON.stringify({ source: "page.html", hold: { intro: 2, outro: 3.5 }, steps: ["A"] }));
  assert.deepEqual(loadStory(join(dir, "story.json")).hold, { intro: 2, outro: 3.5 });
  writeFileSync(join(dir, "plain.json"), JSON.stringify({ source: "page.html", steps: ["A"] }));
  assert.deepEqual(loadStory(join(dir, "plain.json")).hold, { intro: 1.4, outro: 1.8 }, "the original's holds by default");
  writeFileSync(join(dir, "bad.json"), JSON.stringify({ source: "page.html", hold: { end: 2 }, steps: ["A"] }));
  assert.throws(() => loadStory(join(dir, "bad.json")), /hold takes "intro" and "outro"/);
});

test("the drawn status bar and home indicator take black or white ink from the screen behind them", { skip: await browserSkip() }, async () => {
  const { launchBrowser } = await import("../scripts/lib/deps.mjs");
  const { mobileContext, normalizeDevice } = await import("../scripts/lib/mobile.mjs");
  const { browser } = await launchBrowser();
  try {
    const { page } = await mobileContext(browser, normalizeDevice({ viewport: "390x844", scale: 1, safeArea: { top: 47, bottom: 34 } }));
    // A gold header over a dark tab bar: white blended over gold would come out blue.
    await page.setContent(`<meta name="viewport" content="width=device-width"><body style="margin:0;height:100vh;background:#F4CE52"><nav style="position:fixed;left:0;right:0;bottom:0;height:90px;background:#0D0F14"></nav></body>`);
    await page.addScriptTag({ content: runtime([], 44, true) });
    await page.evaluate(() => window.__story.install());
    const ink = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#story-device [data-ink]")].map((el) => [el.dataset.ink, getComputedStyle(el).color])));
    assert.deepEqual(await ink(), { top: "rgb(0, 0, 0)", bottom: "rgb(255, 255, 255)" });
    // Followed every frame: swap the colours (at once, without the story's transitions) and the ink follows.
    await page.evaluate(() => {
      document.documentElement.classList.add("story-measure");
      document.body.style.background = "#0D0F14";
      document.querySelector("nav").style.background = "#FFFEFA";
      window.__story.follow();
    });
    assert.deepEqual(await ink(), { top: "rgb(255, 255, 255)", bottom: "rgb(0, 0, 0)" });
  } finally {
    await browser.close();
  }
});

test("story frames are canvas-sized whatever the viewport, and the page really lays out at the phone width", { skip: await browserSkip() }, async () => {
  for (const canvas of ["portrait", "landscape"]) {
    const dir = tempDir();
    const loaded = loadStory(story, { canvas, fps: 2, duration: 6 });
    // renderStory throws if the page inside the stage lays out at any other size than the viewport.
    const record = await renderStory(loaded, { framesDir: join(dir, "frames") });
    const frames = readdirSync(join(dir, "frames")).filter((name) => name.endsWith(".jpg"));
    assert.equal(frames.length, record.frames);
    assert.deepEqual(jpegSize(join(dir, "frames", frames[0])), loaded.canvas);
    assert.deepEqual(record.viewport, { width: 390, height: 844 });
    assert.equal(record.mode, "css-morph");
    assert.match(record.credit, /adapted from unslop by @heydamir/);
  }
});

test("the encoded story is H.264 portrait video with square pixels and an 8–12 second length", { skip: (await browserSkip()) || ffmpegSkip() }, async () => {
  const dir = tempDir();
  const out = join(dir, "story.mp4");
  await renderStory(loadStory(story, { fps: 10 }), { out });
  const info = probe(out);
  assert.equal(info.codec_name, "h264");
  assert.equal(info.pix_fmt, "yuv420p");
  assert.deepEqual([info.width, info.height], [1080, 1920]);
  assert.equal(info.sample_aspect_ratio ?? "1:1", "1:1");
  assert.ok(info.duration >= 8 && info.duration <= 12.5, `duration ${info.duration}`);
});

test("an upstream-style story.html still renders, at its own desktop width", { skip: await browserSkip() }, async () => {
  const loaded = loadStory(join(EXAMPLE, "..", "..", "tests", "fixtures", "upstream-story.html"), { canvas: "square", fps: 2, duration: 5 });
  assert.deepEqual(loaded.steps.map((step) => [step.name, step.kind]), [["Spacing", "spacing"], ["Details", "details"]]);
  assert.deepEqual(loaded.viewport, { width: 1440, height: 900 });
  const dir = tempDir();
  const record = await renderStory(loaded, { framesDir: join(dir, "frames") });
  assert.ok(record.frames > 5);
  assert.deepEqual(jpegSize(join(dir, "frames", "f-00000.jpg")), { width: 1080, height: 1080 });
});

test("long captions never run into the step counter, in any layout", { skip: await browserSkip() }, async () => {
  const { launchBrowser } = await import("../scripts/lib/deps.mjs");
  const { stageHtml, sideLayout } = await import("../scripts/lib/stage.mjs");
  const texts = ["Short", "1 · Clear the Dynamic Island and home indicator", "Unslop Mobile · mobile review for coding agents, on every phone you test"];
  const { browser } = await launchBrowser();
  try {
    for (const canvas of [{ width: 1080, height: 1080 }, { width: 1920, height: 1080 }, { width: 1080, height: 1920 }]) {
      const side = canvas.width / canvas.height >= 0.9;
      const layout = side ? sideLayout({ canvas, region: { width: 393, height: 852 } }) : { screens: [{ x: 40, y: 300, width: 700, height: 1500 }], panel: null };
      const page = await browser.newPage({ viewport: canvas });
      await page.setContent(stageHtml({ canvas, title: "Title", caption: texts[0], screens: layout.screens, panel: layout.panel, screenHtml: () => "" }));
      await page.evaluate((texts) => { window.__fitCaptions(texts); window.__counter(5, 2); }, texts);
      for (const text of texts) {
        await page.evaluate((text) => { const box = document.getElementById("caption"); box.replaceChildren(Object.assign(document.createElement("span"), { textContent: text })); }, text);
        const [caption, counter] = await page.evaluate(() => [document.querySelector("#caption > span").getBoundingClientRect().bottom, document.getElementById("counter").getBoundingClientRect().top]);
        assert.ok(caption <= counter + 0.5, `${canvas.width}x${canvas.height}: "${text}" ends at ${caption}, counter starts at ${counter}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("a bare stage shows only the phone, on a backdrop taken from the page's colours", { skip: await browserSkip() }, async () => {
  const { launchBrowser } = await import("../scripts/lib/deps.mjs");
  const { stageHtml } = await import("../scripts/lib/stage.mjs");
  const bare = storyLayout(loadStory(story, { bare: true }));
  assert.ok(bare.scale > storyLayout(loadStory(story)).scale, "the phone is larger without the caption band");
  const { browser } = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.setContent(stageHtml({ canvas: { width: 1080, height: 1920 }, title: "T", caption: "C", label: "L", screens: bare.screens, bare: true, screenHtml: () => "" }));
    assert.equal(await page.evaluate(() => document.body.innerText.trim()), "", "no text in the frame");
    const backdrop = (color) => page.evaluate((color) => { window.__backdrop(color); return getComputedStyle(document.body).backgroundImage; }, color);
    const rgb = (css) => [...css.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map((m) => m.slice(1).map(Number));
    const [darkCentre] = rgb(await backdrop("rgb(21, 10, 54)"));
    const [lightCentre] = rgb(await backdrop("rgb(246, 243, 236)"));
    assert.ok(darkCentre[2] > darkCentre[0] + 30, `a purple screen gives a purple backdrop: ${darkCentre}`);
    assert.ok(lightCentre.every((v) => v > 200), `a light screen gives a light backdrop: ${lightCentre}`);
  } finally {
    await browser.close();
  }
});

function comparisonFiles(beforeSize, afterSize, beforeFixture = "fixture@1", afterFixture = "fixture@1") {
  const dir = tempDir();
  writePng(join(dir, "before.png"), beforeSize[0], beforeSize[1], [230, 230, 230]);
  writePng(join(dir, "after.png"), afterSize[0], afterSize[1], [60, 90, 120]);
  writeFileSync(join(dir, "compare.json"), JSON.stringify({
    title: "Test",
    pairs: [{
      state: "home",
      caption: "Change",
      highlights: [{ rect: [20, 100, 200, 80], label: "Here" }],
      before: { image: "before.png", scale: 2, device: "Test phone", fixture: beforeFixture, source: "test pattern" },
      after: { image: "after.png", scale: 2, device: "Test phone", fixture: afterFixture, source: "test pattern" },
    }],
  }));
  return { dir, file: join(dir, "compare.json") };
}

test("comparisons refuse pairs that differ in size, fixture or state", () => {
  assert.throws(() => loadComparison(comparisonFiles([780, 1688], [780, 1690]).file), (error) => error instanceof EvidenceError && /image sizes differ/.test(error.message));
  assert.throws(() => loadComparison(comparisonFiles([780, 1688], [780, 1688], "a", "b").file), /fixtures differ/);
  const side = { size: { width: 10, height: 10 }, scale: 2, device: "x", state: "a", textScale: 1, fixture: "f" };
  assert.throws(() => checkPair(side, { ...side, state: "b" }, "pair"), /states differ/);
  assert.throws(() => checkPair(side, { ...side, textScale: 1.3 }, "pair"), /text scales differ/);
  assert.throws(() => checkPair(side, { ...side, fixture: null }, "pair"), /both sides need a fixture/);
  assert.doesNotThrow(() => checkPair(side, { ...side }, "pair"));
});

test("native-style screenshots derive their viewport from pixels and scale", () => {
  const cmp = loadComparison(comparisonFiles([780, 1688], [780, 1688]).file);
  assert.deepEqual(cmp.viewport, { width: 390, height: 844 });
  assert.equal(cmp.layout, "sequence");
  assert.equal(loadComparison(comparisonFiles([780, 1688], [780, 1688]).file, { canvas: "landscape" }).layout, "side-by-side");
});

test("comparison frames are canvas-sized in every layout", { skip: await browserSkip() }, async () => {
  for (const [canvas, size] of [["portrait", [1080, 1920]], ["landscape", [1920, 1080]], ["square", [1080, 1080]]]) {
    const { dir, file } = comparisonFiles([780, 1688], [780, 1688]);
    const cmp = loadComparison(file, { canvas, fps: 2 });
    const record = await renderComparison(cmp, { framesDir: join(dir, "frames") });
    const frames = readdirSync(join(dir, "frames")).filter((name) => name.endsWith(".jpg"));
    assert.equal(frames.length, record.frames);
    assert.deepEqual(jpegSize(join(dir, "frames", frames.at(-1))), { width: size[0], height: size[1] }, canvas);
    assert.ok(Math.abs(record.screen.width / record.screen.height - 390 / 844) < 0.002, `${canvas} keeps the aspect ratio`);
  }
});
