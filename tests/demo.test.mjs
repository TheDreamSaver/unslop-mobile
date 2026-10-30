// The checkout demo: its draft has the problems the video claims, the reviewed screen fixes each
// one, the story ends on that screen, and the story's measurements report real numbers.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "../scripts/lib/deps.mjs";
import { mobileContext, normalizeDevice } from "../scripts/lib/mobile.mjs";
import { TICK_SOURCE } from "../scripts/lib/stage.mjs";
import { runtime, serveFolder } from "../scripts/story.mjs";
import { ROOT, browserSkip, pixelDifference } from "./helpers.mjs";

const DEMO = join(ROOT, "examples", "checkout-demo");
const skip = await browserSkip();
const phone = normalizeDevice({ viewport: "393x852", scale: 2, safeArea: { top: 59, bottom: 34 } });
const url = (variant) => `${pathToFileURL(join(DEMO, "app.html")).href}?variant=${variant}`;
const story = JSON.parse(readFileSync(join(DEMO, "story.json"), "utf8"));
const steps = story.steps.map((step) => ({ name: step.name, css: readFileSync(join(DEMO, step.css), "utf8"), highlight: step.highlight ?? [], measure: step.measure ?? [], min: step.min }));

async function withPage(url, fn) {
  const { browser } = await launchBrowser();
  try {
    const { page } = await mobileContext(browser, phone);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    const result = await fn(page);
    assert.deepEqual(errors, []);
    return result;
  } finally {
    await browser.close();
  }
}

// Everything the video claims about the draft and the fix, measured on the pages themselves.
const facts = (page) => page.evaluate(() => {
  const box = (selector) => document.querySelector(selector).getBoundingClientRect();
  const lum = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (el, bg) => { const a = lum(getComputedStyle(el).color), b = lum(getComputedStyle(bg).backgroundColor); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const total = box(".total-value");
  const covering = document.elementFromPoint(total.left + total.width / 2, total.top + total.height / 2);
  const name = document.querySelector(".item:nth-child(2) .name");
  return {
    titleTop: box(".title").top,
    payBottom: box(".pay").bottom,
    qty: [...document.querySelectorAll(".qty button")].map((b) => Math.round(Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))),
    totalCovered: !covering.closest(".checkout"),
    promoContrast: ratio(document.querySelector(".promo-text"), document.querySelector(".promo")),
    metaSize: parseFloat(getComputedStyle(document.querySelector(".meta")).fontSize),
    nameCut: name.scrollWidth > name.clientWidth + 1,
    checkShown: Number(getComputedStyle(document.querySelector(".slot[aria-checked='true'] .check")).opacity) > 0.9,
  };
});

test("the draft has the problems the video names", { skip }, () => withPage(url("before"), async (page) => {
  const f = await facts(page);
  assert.ok(f.titleTop < 59, `title starts at ${f.titleTop}, inside the 59 pt top inset`);
  assert.ok(f.payBottom > 852 - 34, "checkout reaches into the home indicator");
  assert.ok(f.qty.every((size) => size === 24), "24 pt quantity buttons");
  assert.equal(f.totalCovered, true, "the chat button covers the total");
  assert.ok(f.promoContrast < 3, `promo contrast ${f.promoContrast.toFixed(2)}`);
  assert.equal(f.metaSize, 10);
  assert.equal(f.nameCut, true, "a product name is cut off");
  assert.equal(f.checkShown, false, "the chosen slot is marked by colour alone");
}));

test("the reviewed screen fixes each one", { skip }, () => withPage(url("after"), async (page) => {
  const f = await facts(page);
  assert.ok(f.titleTop >= 59, "title clears the Dynamic Island");
  assert.ok(f.payBottom <= 852 - 34, "checkout clears the home indicator");
  assert.ok(f.qty.every((size) => size >= 44), `quantity buttons ${f.qty}`);
  assert.equal(f.totalCovered, false);
  assert.ok(f.promoContrast >= 4.5, `promo contrast ${f.promoContrast.toFixed(2)}`);
  assert.ok(f.metaSize >= 13);
  assert.equal(f.nameCut, false);
  assert.equal(f.checkShown, true);
}));

test("removing an item needs hover in the draft and works by touch after", { skip }, async () => {
  for (const [variant, left] of [["before", 3], ["after", 2]]) {
    await withPage(url(variant), async (page) => {
      await page.tap(".item[data-id='avocado'] .dec");
      assert.equal(await page.locator(".item").count(), left, variant);
    });
  }
  await withPage(url("after"), async (page) => {
    await page.tap(".item[data-id='avocado'] .dec");
    assert.equal(await page.textContent(".total-value"), "$17.29", "totals follow the basket");
  });
});

// A stage like the renderer's, so the runtime's measurements can be read back.
async function stage(fn) {
  const html = `<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0"><div id="screen-0" style="position:absolute;left:0;top:0;width:393px;height:852px;overflow:hidden"><iframe id="page" src="/app.html?variant=before" style="border:0;width:393px;height:852px"></iframe></div><div id="story-layer" style="position:absolute;inset:0"></div><script>window.__tick = ${TICK_SOURCE};</script>`;
  const { server, base } = await serveFolder(DEMO, { "/__stage.html": html });
  const { browser } = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
    const page = await context.newPage();
    await page.goto(`${base}/__stage.html`);
    const frame = page.frames().find((item) => item !== page.mainFrame());
    await frame.waitForLoadState("load");
    await frame.evaluate(() => document.fonts.ready);
    await frame.addScriptTag({ path: join(DEMO, story.prepare) });
    await frame.addScriptTag({ content: runtime(steps, 44, false, story.motion) });
    await frame.evaluate(() => window.__story.install());
    let ms = 0;
    const advance = async (seconds, sample) => {
      const seen = [];
      for (const end = ms + seconds * 1000; ms <= end; ms += 33) {
        await page.evaluate((ms) => window.__tick(ms, [document, document.getElementById("page").contentDocument]), ms);
        await frame.evaluate(() => window.__story.follow());
        if (sample) seen.push(await frame.evaluate(sample));
      }
      return seen;
    };
    const tags = (kind, k) => frame.evaluate(([kind, k]) => { window.__story.show(kind, k); window.__story.follow(); return [...window.parent.document.querySelectorAll("#story-layer .s-tag")].map((tag) => tag.textContent); }, [kind, k]);
    return await fn({ frame, advance, tags });
  } finally {
    await browser.close();
    server.close();
  }
}

test("the story's measurements report the real sizes and contrast, before and after", { skip }, () => stage(async ({ frame, advance, tags }) => {
  assert.deepEqual(await tags("targets", 2), ["24 × 24", "24 × 24", "24 × 24"]);
  assert.deepEqual(await tags("sizes", 3), ["10 px", "13 px", "10 px"]);
  assert.deepEqual(await tags("contrast", 5), ["2.7 : 1", "4.2 : 1"]);
  for (let k = 1; k <= steps.length; k++) {
    await frame.evaluate((k) => window.__story.step(k), k);
    await advance(1.6);
  }
  assert.deepEqual(await tags("targets", 2), ["44 × 44", "44 × 44", "44 × 44"]);
  assert.deepEqual(await tags("sizes", 3), ["13 px", "16 px", "14 px"]);
  const after = (await tags("contrast", 5)).map((text) => parseFloat(text));
  assert.ok(after.every((value) => value >= 4.5), `contrast after: ${after}`);
}));

test("colours move only towards their final value while frames are seeked", { skip }, () => stage(async ({ frame, advance }) => {
  for (let k = 1; k <= 4; k++) {
    await frame.evaluate((k) => window.__story.step(k), k);
    await advance(1.6);
  }
  await frame.evaluate(() => window.__story.step(5));
  const read = () => ["promo-text", "subtitle"].map((name) => getComputedStyle(document.querySelector("." + name)).color).concat(getComputedStyle(document.querySelector(".item:nth-child(3) .inc .glyph")).color);
  const seen = await advance(2.2, read);
  const rgb = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
  const final = seen.at(-1).map(rgb);
  seen.forEach((frameColours, index) => {
    if (!index) return;
    frameColours.forEach((colour, i) => {
      const distance = (c) => Math.hypot(...rgb(c).map((v, j) => v - final[i][j]));
      assert.ok(distance(colour) <= distance(seen[index - 1][i]) + 2, `colour ${i} jumped back at frame ${index}: ${seen[index - 1][i]} → ${colour}`);
    });
  });
  assert.ok(seen.at(-1).every((colour, i) => colour === seen.at(-2)[i]), "colours have settled");
}));

test("the story ends on the reviewed screen", { skip }, async () => {
  const final = await withPage(url("before"), async (page) => {
    await page.addScriptTag({ path: join(DEMO, story.prepare) });
    await page.evaluate(() => document.body.append(Object.assign(document.createElement("div"), { id: "story-layer" })));
    await page.addScriptTag({ content: runtime(steps, 44, false, story.motion) });
    await page.evaluate((count) => {
      window.__story.install();
      for (let k = 1; k <= count; k++) window.__story.step(k);
      document.getElementById("story-layer").remove();
    }, steps.length);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => {
      document.getAnimations().forEach((animation) => { if (Number.isFinite(animation.effect.getComputedTiming().endTime)) animation.finish(); });
      window.__story.commit();
      requestAnimationFrame(done);
    })));
    return page.screenshot();
  });
  const after = await withPage(url("after"), (page) => page.screenshot());
  const ratio = await withPage("about:blank", (page) => pixelDifference(page, final, after));
  assert.ok(ratio < 0.003, `story end differs from the reviewed screen in ${(ratio * 100).toFixed(2)}% of pixels`);
});
