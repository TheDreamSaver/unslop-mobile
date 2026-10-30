// The CrossPaths example: each fix is checked against the problem it was made for, and screens that
// had no problem are checked to be unchanged.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "../scripts/lib/deps.mjs";
import { mobileContext, normalizeDevice } from "../scripts/lib/mobile.mjs";
import { runtime } from "../scripts/story.mjs";
import { EXAMPLE, browserSkip, pixelDifference } from "./helpers.mjs";

const skip = await browserSkip();
const page = (variant, query = "") => `${pathToFileURL(join(EXAMPLE, "app.html")).href}?variant=${variant}${query ? `&${query}` : ""}`;
const phone = normalizeDevice({ viewport: "390x844", scale: 2, safeArea: { top: 47, bottom: 34 } });
// With these insets the after variant's top strip and bars match the study's fixed values, so any
// difference between variants comes from the fixes, not from the safe areas.
const neutral = normalizeDevice({ viewport: "390x844", scale: 2, safeArea: { top: 44 } });

async function withPage(device, url, fn) {
  const { browser } = await launchBrowser();
  try {
    const { page: tab } = await mobileContext(browser, device);
    const errors = [];
    tab.on("pageerror", (error) => errors.push(error.message));
    await tab.goto(url);
    await tab.evaluate(() => document.fonts.ready);
    const result = await fn(tab);
    assert.deepEqual(errors, []);
    return result;
  } finally {
    await browser.close();
  }
}

for (const variant of ["before", "after"]) {
  test(`${variant}: the flow works — browse, open a person, return, add a name only`, { skip }, () => withPage(phone, page(variant), async (tab) => {
    assert.equal(await tab.locator(".person").count(), 12);
    await tab.click(".person[data-person='1']");
    assert.equal(await tab.textContent("#detail-name"), "Maria Reyes");
    assert.equal(await tab.textContent("#detail-note"), "Met on the Acatenango hike. Photographer, early riser, knows all the good coffee spots.", "the saved memory is shown as written");
    await tab.click("#detail-back");
    await tab.click("#add-person");
    await tab.fill("#new-name", "Ana Lucía Fernández-Wójcik");
    await tab.click("#save-person");
    assert.equal(await tab.textContent("#detail-name"), "Ana Lucía Fernández-Wójcik");
    await tab.click("#detail-back");
    assert.equal(await tab.locator(".person").count(), 13);
    assert.equal(await tab.textContent(".person:first-child .person-name"), "Ana Lucía Fernández-Wójcik", "newest encounter first");
  }));
}

test("a draft is lost before and kept after leaving the form", { skip }, async () => {
  for (const [variant, expected] of [["before", ""], ["after", "Ana"]]) {
    await withPage(phone, page(variant), async (tab) => {
      await tab.click("#add-person");
      await tab.fill("#new-name", "Ana");
      await tab.click("#capture-back");
      await tab.click("#add-person");
      assert.equal(await tab.inputValue("#new-name"), expected, variant);
    });
  }
  await withPage(phone, page("after"), async (tab) => {
    await tab.click("#add-person");
    await tab.fill("#new-name", "Ana");
    await tab.click("#save-person");
    await tab.click("#detail-back");
    await tab.click("#add-person");
    assert.equal(await tab.inputValue("#new-name"), "", "a saved draft does not come back");
  });
});

test("returning from a person puts focus back on their card only after the fix", { skip }, async () => {
  for (const [variant, expected] of [["before", null], ["after", "1"]]) {
    await withPage(phone, page(variant), async (tab) => {
      await tab.click(".person[data-person='1']");
      await tab.click("#detail-back");
      assert.equal(await tab.evaluate(() => document.activeElement.dataset?.person ?? null), expected, variant);
    });
  }
});

test("after: names and places get mobile keyboard hints, and return moves forward without saving", { skip }, () => withPage(phone, page("after"), async (tab) => {
  await tab.click("#add-person");
  const attrs = await tab.evaluate(() => Object.fromEntries(["new-name", "new-place", "new-instagram", "new-last"].map((id) => [id, ["autocapitalize", "enterkeyhint", "autocorrect"].map((name) => document.getElementById(id).getAttribute(name))])));
  assert.deepEqual(attrs["new-name"], ["words", "next", "off"]);
  assert.deepEqual(attrs["new-place"], ["words", "next", null]);
  assert.deepEqual(attrs["new-instagram"], ["none", "next", "off"]);
  assert.deepEqual(attrs["new-last"], ["words", "done", null]);
  await tab.fill("#new-name", "Ana");
  await tab.press("#new-name", "Enter");
  assert.equal(await tab.evaluate(() => document.activeElement.id), "new-place");
  assert.equal(await tab.evaluate(() => document.getElementById("capture-screen").hidden), false, "still on the form");
}));

test("after: a name-only person shows what is missing as missing, and invents nothing", { skip }, async () => {
  const styles = (tab) => tab.evaluate(() => Object.fromEntries(["detail-met", "detail-home", "detail-note"].map((id) => {
    const style = getComputedStyle(document.getElementById(id));
    return [id, { text: document.getElementById(id).textContent, weight: style.fontWeight, family: style.fontFamily.split(",")[0].replace(/"/g, ""), color: style.color }];
  })));
  const before = await withPage(phone, page("before", "screen=saved"), styles);
  const after = await withPage(phone, page("after", "screen=saved"), async (tab) => ({
    ...(await styles(tab)),
    freshness: await tab.isVisible("#detail-freshness"),
    addMemory: await tab.isVisible("#add-memory"),
    privacy: await tab.isVisible("#note-private"),
    toast: await tab.isVisible("#toast"),
    status: await tab.textContent("#save-status"),
    covered: await tab.evaluate(() => { const r = document.getElementById("share-person").getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).id; }),
  }));
  assert.equal(before["detail-met"].family, "Playfair Display", "before: an empty place used the display face");
  assert.equal(before["detail-note"].text, "Add a detail you would like to remember.", "before: placeholder in the note's place");
  assert.equal(after["detail-met"].family, "Hanken Grotesk");
  assert.equal(after["detail-met"].weight, "500");
  assert.equal(after["detail-met"].text, before["detail-met"].text, "same words, quieter type");
  assert.notEqual(after["detail-home"].color, before["detail-home"].color, "empty homebase uses the muted role");
  assert.equal(after["detail-note"].text, "No memory saved yet");
  assert.equal(after.addMemory, true);
  assert.equal(after.privacy, false, "no privacy note for a note that does not exist");
  assert.equal(after.freshness, false, "no location date without a location");
  assert.equal(after.toast, false);
  assert.match(after.status, /Saved in this preview/);
  assert.equal(after.covered, "share-person", "nothing covers the action");
});

test("after: Add a memory opens the person's form at the memory field", { skip }, () => withPage(phone, page("after", "screen=saved"), async (tab) => {
  await tab.click("#add-memory");
  assert.equal(await tab.textContent("#capture-heading"), "Edit person");
  assert.equal(await tab.evaluate(() => document.activeElement.id), "new-note");
  assert.equal(await tab.inputValue("#new-name"), "Ana Lucía Fernández-Wójcik");
}));

test("after: bars clear the home indicator", { skip }, () => withPage(phone, page("after"), async (tab) => {
  const gap = await tab.evaluate(() => innerHeight - [...document.querySelectorAll(".bottom-nav button")].reduce((bottom, el) => Math.max(bottom, el.getBoundingClientRect().bottom), 0));
  assert.ok(gap >= 34, `nav buttons end ${gap}px above the bottom edge`);
}));

test("screens that had no problem are unchanged: People and a populated person", { skip }, async () => {
  for (const [label, query] of [["People", ""], ["Maria's detail", "screen=detail&id=1"]]) {
    const shots = [];
    for (const variant of ["before", "after"]) shots.push(await withPage(neutral, page(variant, query), (tab) => tab.screenshot()));
    const ratio = await withPage(neutral, "about:blank", (tab) => pixelDifference(tab, shots[0], shots[1]));
    assert.equal(ratio, 0, `${label} differs in ${(ratio * 100).toFixed(2)}% of pixels`);
  }
});

test("the story ends on the after page: same pixels as app.html?variant=after", { skip }, async () => {
  const config = JSON.parse(readFileSync(join(EXAMPLE, "story.json"), "utf8"));
  const steps = config.steps.map((step) => ({ name: step.name, css: readFileSync(join(EXAMPLE, step.css), "utf8"), highlight: [], targets: [] }));
  const final = await withPage(phone, page("before", "screen=saved&hold"), async (tab) => {
    await tab.addScriptTag({ path: join(EXAMPLE, config.prepare) });
    await tab.evaluate(() => { window.__stage = { conf: { scale: 1, x: 0, y: 0 } }; document.body.append(Object.assign(document.createElement("div"), { id: "story-layer" })); });
    await tab.addScriptTag({ content: runtime(steps, 44) });
    await tab.evaluate((count) => {
      window.__story.install();
      for (let k = 1; k <= count; k++) window.__story.step(k);
      document.getElementById("story-layer").remove();
    }, steps.length);
    await tab.evaluate(() => new Promise((done) => requestAnimationFrame(() => { document.getAnimations().forEach((animation) => animation.finish()); requestAnimationFrame(done); })));
    return tab.screenshot();
  });
  const after = await withPage(phone, page("after", "screen=saved"), (tab) => tab.screenshot());
  const ratio = await withPage(phone, "about:blank", (tab) => pixelDifference(tab, final, after));
  assert.ok(ratio < 0.002, `story end differs from the after page in ${(ratio * 100).toFixed(2)}% of pixels`);
});
