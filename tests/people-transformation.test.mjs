// The CrossPaths People transformation: its motion source starts on the original screen and ends on
// the redesigned one, against the reference captures of the Expo app, the same people stay in the
// same places, and every typeface switch happens where its line cannot be seen.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "../scripts/lib/deps.mjs";
import { pngSize } from "../scripts/lib/files.mjs";
import { TICK_SOURCE } from "../scripts/lib/stage.mjs";
import { loadStory, runtime, serveFolder } from "../scripts/story.mjs";
import { ROOT, browserSkip, pixelDifference } from "./helpers.mjs";

const DIR = join(ROOT, "examples", "crosspaths-people-transformation");
const skip = await browserSkip();
const story = JSON.parse(readFileSync(join(DIR, "story.json"), "utf8"));
const { motion } = loadStory(join(DIR, "story.json"));
const steps = story.steps.map((step) => ({ name: step.name, css: readFileSync(join(DIR, step.css), "utf8"), motion: step.motion }));
const FONTS = ["DMSans_400Regular", "DMSans_500Medium", "DMSans_700Bold", "HankenGrotesk_400", "HankenGrotesk_500", "HankenGrotesk_600", "HankenGrotesk_700", "PlayfairDisplay_700Bold", "ionicons"];

// The page as the reference captures were taken: 390 × 844 at 2×, no insets. After `count` steps
// with transitions finished; `commit` puts rolled letters back as plain text.
async function capture(count, { commit = true } = {}) {
  const { server, base } = await serveFolder(DIR);
  const { browser } = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}/app.html`);
    await page.evaluate(async (fonts) => { await Promise.all(fonts.map((font) => document.fonts.load(`16px ${font}`))); await document.fonts.ready; }, FONTS);
    await page.addScriptTag({ path: join(DIR, story.prepare) });
    await page.evaluate(() => document.body.append(Object.assign(document.createElement("div"), { id: "story-layer" })));
    await page.addScriptTag({ content: runtime(steps, 44, false, motion) });
    await page.evaluate((count) => {
      window.__story.install();
      for (let k = 1; k <= count; k++) window.__story.step(k);
      document.getElementById("story-layer").remove();
    }, count);
    await page.evaluate((commit) => new Promise((done) => requestAnimationFrame(() => {
      document.documentElement.classList.add("story-measure");
      document.getAnimations().forEach((animation) => { if (Number.isFinite(animation.effect.getComputedTiming().endTime)) animation.finish(); });
      if (commit && document.documentElement.classList.contains("s1")) window.__story.commit();
      requestAnimationFrame(() => requestAnimationFrame(done));
    })), commit);
    const people = await page.evaluate(() => [...document.querySelectorAll(".card .name")].map((name) => [name.textContent, Math.round(name.getBoundingClientRect().top)]));
    const shot = await page.screenshot();
    assert.deepEqual(errors, []);
    return { shot, people };
  } finally {
    await browser.close();
    server.close();
  }
}

const reference = (name) => `data:image/png;base64,${readFileSync(join(DIR, "reference", `${name}-people.png`)).toString("base64")}`;
async function differs(shot, name) {
  const { browser } = await launchBrowser();
  try {
    const page = await browser.newPage();
    return await pixelDifference(page, shot, Buffer.from(reference(name).split(",")[1], "base64"));
  } finally {
    await browser.close();
  }
}

test("the story starts on the original People screen", { skip }, async () => {
  const { shot, people } = await capture(0);
  const ratio = await differs(shot, "before");
  assert.ok(ratio < 0.002, `the first state differs from the original capture in ${(ratio * 100).toFixed(2)}% of pixels`);
  assert.deepEqual(people.map(([name]) => name), ["Camille Dubois", "Priya Nair", "Elena Cruz"]);
});

test("the story ends on the redesigned People screen, with the same people in the same order", { skip }, async () => {
  const { shot, people } = await capture(steps.length);
  const ratio = await differs(shot, "after");
  assert.ok(ratio < 0.002, `the last state differs from the redesigned capture in ${(ratio * 100).toFixed(2)}% of pixels`);
  assert.deepEqual(people.slice(0, 2), [["Camille Dubois", 300], ["Priya Nair", 583]], "names where the redesigned capture has them");
  // As the video shows it: rolled-in words keep their letter spans, which loosens their kerning a little.
  const rolled = await differs((await capture(steps.length, { commit: false })).shot, "after");
  assert.ok(rolled < 0.005, `with rolled letters, ${(rolled * 100).toFixed(2)}% of pixels differ`);
});

test("every typeface switch happens where its line and the colour behind it meet", { skip }, async () => {
  const html = `<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0"><iframe id="page" src="/app.html" style="border:0;width:390px;height:844px"></iframe><div id="story-layer"></div><script>window.__tick = ${TICK_SOURCE};</script>`;
  const { server, base } = await serveFolder(DIR, { "/__stage.html": html });
  const { browser } = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${base}/__stage.html`);
    const frame = page.frames().find((item) => item !== page.mainFrame());
    await frame.waitForLoadState("load");
    await frame.evaluate(async (fonts) => { await Promise.all(fonts.map((font) => document.fonts.load(`16px ${font}`))); }, FONTS);
    await frame.addScriptTag({ path: join(DIR, story.prepare) });
    await frame.addScriptTag({ content: runtime(steps, 44, false, motion) });
    await frame.evaluate(() => window.__story.install());
    let ms = 0;
    const advance = async (seconds) => {
      for (const end = ms + seconds * 1000; ms <= end; ms += 33) await page.evaluate((ms) => window.__tick(ms, [document, document.getElementById("page").contentDocument]), ms);
    };
    const palette = story.steps.findIndex((step) => step.name === "Palette") + 1;
    for (let k = 1; k < palette; k++) {
      await frame.evaluate((k) => window.__story.step(k), k);
      await advance(2.6);
    }
    await frame.evaluate((k) => window.__story.step(k), palette);
    // Every line that switches face, and the contrast with the surface behind it, frame by frame.
    const read = () => frame.evaluate(() => {
      const lines = [...document.querySelectorAll("body *")].filter((el) => el.getAnimations().some((a) => /^face-/.test(a.animationName)));
      const rgb = (c) => c.match(/[\d.]+/g).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      return lines.map((line) => {
        const ink = [...line.querySelectorAll("*")].find((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) || line;
        const layers = [];
        for (let el = line; el; el = el.parentElement) {
          const c = rgb(getComputedStyle(el).backgroundColor);
          if ((c[3] ?? 1) > 0) layers.push(c);
          if ((c[3] ?? 1) >= 0.99) break;
        }
        let surface = layers.pop() || [255, 255, 255];
        while (layers.length) { const top = layers.pop(); const a = top[3] ?? 1; surface = surface.map((v, i) => top[i] * a + v * (1 - a)); }
        const [x, y] = [lum(rgb(getComputedStyle(ink).color)), lum(surface)];
        return [line.className + " " + (line.closest(".card")?.dataset.person ?? ""), getComputedStyle(line).fontFamily, (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)];
      });
    });
    const switches = new Map();
    let last = await read();
    for (const end = ms + 2400; ms <= end; ms += 33) {
      await page.evaluate((ms) => window.__tick(ms, [document, document.getElementById("page").contentDocument]), ms);
      const now = await read();
      now.forEach(([name, face, contrast], i) => { if (face !== last[i][1]) switches.set(name, contrast); });
      last = now;
    }
    assert.ok(switches.size >= 10, `${switches.size} lines switched face`);
    const visible = [...switches].filter(([, contrast]) => contrast > 1.3);
    assert.deepEqual(visible, [], "lines that switched face while readable (contrast > 1.3 : 1)");
    assert.ok(last.every(([, face]) => /^HankenGrotesk_/.test(face)), "every switched line ends in Hanken Grotesk");
  } finally {
    await browser.close();
    server.close();
  }
});

test("the copied assets keep their licences, and the people are the fixture's fictional ones", () => {
  for (const licence of ["DMSans-OFL.txt", "HankenGrotesk-OFL.txt", "PlayfairDisplay-OFL.txt"]) {
    assert.match(readFileSync(join(DIR, "assets", "fonts", licence), "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/, licence);
  }
  assert.match(readFileSync(join(DIR, "assets", "fonts", "Ionicons-LICENSE.txt"), "utf8"), /MIT License/);
  const source = readFileSync(join(DIR, "assets", "people.js"), "utf8");
  const data = JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1));
  assert.equal(data.fictional, true);
  assert.equal(data.records.length, 12);
  for (const name of ["before", "after"]) {
    const file = join(DIR, "reference", `${name}-people.png`);
    assert.ok(existsSync(file), file);
    assert.deepEqual(pngSize(file), { width: 780, height: 1688 }, `${name}: 390 × 844 at 2×`);
  }
});
