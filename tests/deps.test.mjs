import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DependencyError } from "../scripts/lib/errors.mjs";
import { FFMPEG_HELP, findChrome, findFfmpeg, loadPlaywright } from "../scripts/lib/deps.mjs";
import { EXAMPLE, ROOT, tempDir } from "./helpers.mjs";

test("a missing Playwright says how to install it", async () => {
  const failing = [() => { throw new Error("Cannot find package"); }];
  await assert.rejects(loadPlaywright({ importers: failing }), (error) => error instanceof DependencyError && /npm install/.test(error.message) && /skill itself does not need it/.test(error.message));
});

test("a missing ffmpeg says how to install it, or how to skip encoding", () => {
  const run = () => { throw new Error("ENOENT"); };
  assert.throws(() => findFfmpeg({ env: {}, run }), (error) => error instanceof DependencyError && error.message === FFMPEG_HELP && /brew install ffmpeg/.test(error.message) && /--frames/.test(error.message));
  assert.throws(() => findFfmpeg({ env: { FFMPEG_PATH: "/nowhere/ffmpeg" }, run }), /FFMPEG_PATH is set to \/nowhere\/ffmpeg/);
});

test("an ffmpeg without H.264 is rejected with a reason", () => {
  assert.throws(() => findFfmpeg({ env: {}, run: () => "V..... mpeg4  MPEG-4 part 2" }), /no libx264/);
  assert.equal(findFfmpeg({ env: {}, run: () => " V....D libx264  H.264" }), "ffmpeg");
});

test("CHROME_PATH must point at something real", () => {
  assert.throws(() => findChrome({ env: { CHROME_PATH: "/nowhere/chrome" }, exists: () => false }), /CHROME_PATH points at \/nowhere\/chrome/);
  assert.equal(findChrome({ env: {}, exists: () => false }), undefined);
});

test("the video command exits with code 2 and a clear message when ffmpeg is missing", () => {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", "story.mjs"), join(EXAMPLE, "story.json"), join(tempDir(), "out.mp4")], { env: { ...process.env, FFMPEG_PATH: "/nowhere/ffmpeg" }, encoding: "utf8" });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /missing dependency: FFMPEG_PATH is set to \/nowhere\/ffmpeg/);
  assert.doesNotMatch(result.stderr, /at .*\.mjs:\d+/, "no stack trace");
});

test("the capture command exits with code 2 and a clear message when Playwright is missing", () => {
  // A copy of the scripts outside this package cannot see its node_modules.
  const dir = tempDir();
  cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
  cpSync(join(ROOT, "package.json"), join(dir, "package.json"));
  writeFileSync(join(dir, "page.html"), "<meta name=viewport content='width=device-width'><p>hi</p>");
  writeFileSync(join(dir, "capture.json"), JSON.stringify({ variants: { only: "page.html" }, devices: [{ viewport: "390x844" }], states: [{ id: "page" }] }));
  const result = spawnSync(process.execPath, [join(dir, "scripts", "capture.mjs"), join(dir, "capture.json")], { cwd: dir, encoding: "utf8" });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /missing dependency: Playwright is needed/);
});

test("bad configs fail as usage errors, not crashes", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "capture.json"), JSON.stringify({ variants: { before: "missing.html" }, devices: [{ viewport: "390x844" }], states: [{ id: "a" }] }));
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", "capture.mjs"), join(dir, "capture.json")], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: variant "before" points at missing.html/);
  const story = spawnSync(process.execPath, [join(ROOT, "scripts", "story.mjs"), join(EXAMPLE, "story.json"), "out.mp4", "--frame=0,600,390,400"], { encoding: "utf8" });
  assert.equal(story.status, 1);
  assert.match(story.stderr, /reaches outside the 390x844 viewport/);
});

test("node can at least parse every script", () => {
  for (const script of ["capture.mjs", "story.mjs", "compare.mjs"]) execFileSync(process.execPath, ["--check", join(ROOT, "scripts", script)]);
});
