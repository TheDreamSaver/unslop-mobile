// Pure geometry shared by capture, story and compare. Nothing here touches a browser.
//
// Three sizes stay separate on purpose:
//   viewport  – the logical size the interface lays out at (CSS px, pt or dp), e.g. 390x844
//   scale     – device pixels per logical unit for a capture, e.g. 3 for a 1170x2532 image
//   canvas    – the final video frame, e.g. 1080x1920, which never changes the layout

import { UsageError } from "./errors.mjs";

export const CANVAS_PRESETS = Object.freeze({
  portrait: Object.freeze({ width: 1080, height: 1920 }),
  square: Object.freeze({ width: 1080, height: 1080 }),
  landscape: Object.freeze({ width: 1920, height: 1080 }),
});

export function parseSize(value, name = "size") {
  if (Array.isArray(value)) return checkSize({ width: Number(value[0]), height: Number(value[1]) }, name, value);
  if (value && typeof value === "object") return checkSize({ width: Number(value.width), height: Number(value.height) }, name, value);
  const match = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(String(value ?? ""));
  if (!match) throw new UsageError(`${name} must look like 390x844, got "${value}"`);
  return checkSize({ width: Number(match[1]), height: Number(match[2]) }, name, value);
}

function checkSize(size, name, original) {
  if (!(size.width > 0 && size.height > 0) || !Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    throw new UsageError(`${name} must have a positive width and height, got ${JSON.stringify(original)}`);
  }
  return size;
}

// Video encoders need even pixel dimensions for the yuv420p format that phones play back reliably.
export function resolveCanvas(value = "portrait") {
  const preset = CANVAS_PRESETS[String(value).toLowerCase()];
  const size = preset ? { ...preset } : parseSize(value, "canvas");
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width % 2 || size.height % 2) {
    throw new UsageError(`canvas must use whole, even pixel dimensions for H.264 video, got ${size.width}x${size.height}`);
  }
  return size;
}

export function parseRect(value, name = "frame") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return checkRect({ x: Number(value.x ?? 0), y: Number(value.y ?? 0), width: Number(value.width), height: Number(value.height) }, name, value);
  }
  const parts = Array.isArray(value) ? value.map(Number) : String(value ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length !== 4) throw new UsageError(`${name} must be x,y,width,height in logical units, got "${value}"`);
  return checkRect({ x: parts[0], y: parts[1], width: parts[2], height: parts[3] }, name, value);
}

function checkRect(rect, name, original) {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || rect.x < 0 || rect.y < 0) {
    throw new UsageError(`${name} must have x,y >= 0 and a positive width and height, got ${JSON.stringify(original)}`);
  }
  return rect;
}

// A frame is a crop of the logical viewport. It may not reach outside it, or the video would show
// space the interface never drew.
export function resolveFrame(frame, viewport) {
  const rect = frame ? parseRect(frame) : { x: 0, y: 0, width: viewport.width, height: viewport.height };
  if (rect.x + rect.width > viewport.width + 1e-6 || rect.y + rect.height > viewport.height + 1e-6) {
    throw new UsageError(`frame ${rect.x},${rect.y},${rect.width},${rect.height} reaches outside the ${viewport.width}x${viewport.height} viewport`);
  }
  return rect;
}

// Uniform scale only: the region is never stretched, so its aspect ratio is preserved exactly.
export function containFit(region, box) {
  const scale = Math.min(box.width / region.width, box.height / region.height);
  const width = region.width * scale;
  const height = region.height * scale;
  return { scale, width, height, x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2 };
}

// Places one or more equally sized regions (one per pane) inside the space left between the
// caption band and the footer band. Panes sit side by side with a gap.
export function stageLayout({ canvas, region, panes = 1, padding = 48, top = 0, bottom = 0, gap = 40 }) {
  const box = {
    x: padding,
    y: top + padding,
    width: canvas.width - padding * 2,
    height: canvas.height - top - bottom - padding * 2,
  };
  const paneWidth = (box.width - gap * (panes - 1)) / panes;
  if (box.height <= 0 || paneWidth <= 0) {
    throw new UsageError(`a ${canvas.width}x${canvas.height} canvas leaves no room for the screen after ${padding}px padding and ${top + bottom}px of bands`);
  }
  const fit = containFit(region, { x: 0, y: 0, width: paneWidth, height: box.height });
  const used = fit.width * panes + gap * (panes - 1);
  const left = box.x + (box.width - used) / 2;
  const screens = Array.from({ length: panes }, (_, index) => ({
    x: left + index * (fit.width + gap),
    y: box.y + (box.height - fit.height) / 2,
    width: fit.width,
    height: fit.height,
  }));
  return { scale: fit.scale, screens, box };
}

// How large source text appears when the finished video fills the width of a phone. A video is
// usually watched on a phone, so a 1080 px wide canvas spans roughly 390 pt.
export function phonePoints(sourceSize, scale, canvasWidth, phoneWidth = 390) {
  return (sourceSize * scale * phoneWidth) / canvasWidth;
}

export function readability({ scale, canvas, bodySize = 14, smallSize = 12, phoneWidth = 390 }) {
  const body = phonePoints(bodySize, scale, canvas.width, phoneWidth);
  const small = phonePoints(smallSize, scale, canvas.width, phoneWidth);
  const warnings = [];
  if (body < 8) {
    warnings.push(`${bodySize}px body text plays at about ${body.toFixed(1)} pt on a ${phoneWidth} pt wide phone; crop closer with --frame or use a taller canvas`);
  }
  return { body, small, warnings };
}

export function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
