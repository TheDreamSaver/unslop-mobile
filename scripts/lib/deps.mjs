// Optional dependencies, found lazily so the skill and the pure helpers work without them.
// Capture needs Playwright and a Chromium browser. Video needs ffmpeg as well.

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DependencyError } from "./errors.mjs";

export const PLAYWRIGHT_HELP =
  "Playwright is needed to capture screens and render videos. In the unslop-mobile folder run `npm install`, " +
  "which installs the pinned playwright devDependency, or add it to your own project with `npm i -D playwright`. " +
  "The skill itself does not need it.";

export const BROWSER_HELP =
  "No Chromium browser was found. Install Google Chrome, set CHROME_PATH to a Chromium-based browser, " +
  "or download Playwright's build with `npx playwright install chromium`.";

export const FFMPEG_HELP =
  "ffmpeg is needed only to encode the video. Install it (macOS: `brew install ffmpeg`, Debian or Ubuntu: " +
  "`sudo apt install ffmpeg`) or point FFMPEG_PATH at an ffmpeg binary. To skip encoding, pass --frames=<folder> " +
  "and the frames are written as images instead.";

const defaultImporters = [
  (name) => import(name),
  (name) => createRequire(join(process.cwd(), "package.json"))(name),
];

export async function loadPlaywright({ importers = defaultImporters, names = ["playwright", "playwright-core"] } = {}) {
  for (const name of names) {
    for (const load of importers) {
      try {
        const kit = await load(name);
        const chromium = kit.chromium ?? kit.default?.chromium;
        if (chromium) return { chromium, name };
      } catch {
        // Try the next way of finding it.
      }
    }
  }
  throw new DependencyError(PLAYWRIGHT_HELP);
}

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

export function findChrome({ env = process.env, exists = existsSync } = {}) {
  if (env.CHROME_PATH) {
    if (!exists(env.CHROME_PATH)) throw new DependencyError(`CHROME_PATH points at ${env.CHROME_PATH}, which does not exist. ${BROWSER_HELP}`);
    return env.CHROME_PATH;
  }
  return CHROME_PATHS.find((path) => exists(path));
}

export async function launchBrowser({ headless = true } = {}) {
  const { chromium } = await loadPlaywright();
  const executablePath = findChrome();
  try {
    const browser = await chromium.launch({ headless, ...(executablePath ? { executablePath } : {}) });
    return { browser, executablePath: executablePath ?? "playwright-chromium" };
  } catch (error) {
    if (/Executable doesn't exist|executable|ENOENT/i.test(String(error?.message))) throw new DependencyError(BROWSER_HELP);
    throw error;
  }
}

export function findFfmpeg({ env = process.env, run = execFileSync } = {}) {
  const binary = env.FFMPEG_PATH || "ffmpeg";
  let encoders;
  try {
    encoders = String(run(binary, ["-hide_banner", "-encoders"], { stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    throw new DependencyError(env.FFMPEG_PATH ? `FFMPEG_PATH is set to ${env.FFMPEG_PATH}, which did not run. ${FFMPEG_HELP}` : FFMPEG_HELP);
  }
  if (!/\blibx264\b/.test(encoders)) {
    throw new DependencyError(`${binary} was found but has no libx264 encoder, so it cannot write phone-compatible H.264 video. ${FFMPEG_HELP}`);
  }
  return binary;
}
