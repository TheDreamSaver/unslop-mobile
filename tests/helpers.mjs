// Test helpers. Browser and ffmpeg tests skip, with a reason, when those tools are not installed.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EXAMPLE = join(ROOT, "examples", "crosspaths");

export function tempDir(prefix = "unslop-mobile-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

let browserState;
export async function browserSkip() {
  if (browserState === undefined) {
    try {
      const { launchBrowser } = await import("../scripts/lib/deps.mjs");
      const { browser } = await launchBrowser();
      await browser.close();
      browserState = false;
    } catch (error) {
      browserState = `browser unavailable: ${error.message.split("\n")[0]}`;
    }
  }
  return browserState;
}

export function ffmpegSkip() {
  try {
    execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"], { stdio: "ignore" });
    return false;
  } catch {
    return "ffmpeg unavailable";
  }
}

export function probe(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,pix_fmt,sample_aspect_ratio,codec_name:format=duration", "-of", "json", file]);
  const data = JSON.parse(String(out));
  return { ...data.streams[0], duration: Number(data.format.duration) };
}

// Width and height from a JPEG's start-of-frame marker.
export function jpegSize(path) {
  const data = readFileSync(path);
  let offset = 2;
  while (offset < data.length) {
    const marker = data.readUInt16BE(offset);
    const length = data.readUInt16BE(offset + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  throw new Error(`no frame header in ${path}`);
}

// A solid-colour PNG, enough to test image pairing without an image library.
export function writePng(path, width, height, [r, g, b] = [200, 200, 200]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "ascii");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0))]));
}

// Fraction of pixels that differ noticeably between two same-sized screenshots, computed in a page.
export async function pixelDifference(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((done, fail) => { const img = new Image(); img.onload = () => done(img); img.onerror = fail; img.src = src; });
    const [one, two] = await Promise.all([load(a), load(b)]);
    if (one.width !== two.width || one.height !== two.height) return 1;
    const read = (img) => { const canvas = new OffscreenCanvas(img.width, img.height); const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, img.width, img.height).data; };
    const x = read(one);
    const y = read(two);
    let differ = 0;
    for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) > 24 || Math.abs(x[i + 1] - y[i + 1]) > 24 || Math.abs(x[i + 2] - y[i + 2]) > 24) differ++;
    return differ / (x.length / 4);
  }, [`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`]);
}
