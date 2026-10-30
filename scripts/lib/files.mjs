import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { UsageError } from "./errors.mjs";

// The package version for provenance records. A partial install without package.json still runs.
export function toolVersion() {
  try {
    return JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
  } catch {
    return "unknown";
  }
}

export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function readJson(path, what = "config") {
  if (!existsSync(path)) throw new UsageError(`${what} not found: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new UsageError(`${what} at ${path} is not valid JSON: ${error.message}`);
  }
}

export function writeJson(path, value) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

// Reads the pixel size straight from a PNG header, so evidence checks need no image library.
export function pngSize(path) {
  const buffer = readFileSync(path);
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") throw new UsageError(`${path} is not a PNG image`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}
