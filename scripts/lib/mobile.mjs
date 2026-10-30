// Browser contexts that lay a page out the way a phone browser would. This is mobile web
// emulation in Chromium: a real viewport, device scale, touch input and optional safe-area
// insets. It is not a native iOS or Android renderer.

import { parseSize } from "./geometry.mjs";
import { UsageError } from "./errors.mjs";

export function normalizeDevice(device, index = 0) {
  if (!device || typeof device !== "object") throw new UsageError(`device ${index + 1} must be an object`);
  const viewport = parseSize(device.viewport, `device ${device.id ?? index + 1} viewport`);
  const scale = Number(device.scale ?? 3);
  if (!(scale > 0 && scale <= 5)) throw new UsageError(`device ${device.id ?? index + 1} scale must be between 0 and 5`);
  const inset = device.safeArea ?? {};
  const safeArea = { top: Number(inset.top ?? 0), right: Number(inset.right ?? 0), bottom: Number(inset.bottom ?? 0), left: Number(inset.left ?? 0) };
  if (Object.values(safeArea).some((value) => !(value >= 0))) throw new UsageError(`device ${device.id ?? index + 1} safeArea values must be zero or positive`);
  return {
    id: String(device.id ?? `${viewport.width}x${viewport.height}`),
    label: device.label ?? `${viewport.width} × ${viewport.height}`,
    viewport,
    scale,
    safeArea,
    platform: device.platform ?? "web",
    minTarget: Number(device.minTarget ?? (device.platform === "android" ? 48 : 44)),
    keyboard: device.keyboard === undefined ? undefined : Number(device.keyboard),
  };
}

export async function mobileContext(browser, device, { reducedMotion = "reduce", height } = {}) {
  const viewport = { width: device.viewport.width, height: height ?? device.viewport.height };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: device.scale,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    reducedMotion,
  });
  const page = await context.newPage();
  await applySafeArea(context, page, device.safeArea);
  return { context, page };
}

// Chromium's DevTools protocol can report env(safe-area-inset-*) values, which lets a browser
// capture show whether bars and buttons respect a notch or home indicator.
export async function applySafeArea(context, page, safeArea) {
  if (!Object.values(safeArea).some(Boolean)) return false;
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: {
        top: safeArea.top, topMax: safeArea.top,
        right: safeArea.right, rightMax: safeArea.right,
        bottom: safeArea.bottom, bottomMax: safeArea.bottom,
        left: safeArea.left, leftMax: safeArea.left,
      },
    });
    return true;
  } catch (error) {
    throw new UsageError(`this browser cannot emulate safe-area insets (${error.message}). Remove safeArea from the device or use a current Chrome.`);
  }
}

// Platform text scaling multiplies font sizes but not fixed boxes, which is exactly what makes
// clipped labels appear. This approximates that by scaling every element's computed font size and
// pixel line height once. It is not Dynamic Type or Android font scale; check those natively.
export async function applyTextScale(page, factor) {
  if (!factor || factor === 1) return;
  await page.evaluate((k) => {
    const elements = [...document.querySelectorAll("body, body *")];
    const original = elements.map((el) => {
      const style = getComputedStyle(el);
      return [parseFloat(style.fontSize), style.lineHeight];
    });
    elements.forEach((el, index) => {
      const [size, lineHeight] = original[index];
      el.style.setProperty("font-size", `${size * k}px`, "important");
      if (lineHeight.endsWith("px")) el.style.setProperty("line-height", `${parseFloat(lineHeight) * k}px`, "important");
    });
    document.documentElement.dataset.unslopTextScale = String(k);
  }, factor);
}

// A browser cannot open a native keyboard. Shrinking the viewport by the keyboard's height shows
// what a resizing layout leaves visible, then scrolls the focused field into view the way phones do.
export async function simulateKeyboard(page, device, height) {
  await page.setViewportSize({ width: device.viewport.width, height: device.viewport.height - height });
  await page.evaluate(() => document.activeElement?.scrollIntoView?.({ block: "nearest" }));
}
