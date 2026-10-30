// Measurements taken inside the page after a state is reached. They are evidence for a reviewer,
// not a score: a short list of things worth looking at on the screenshot, with where they are.

export function measurePage({ minTarget, safeArea, smallText = 12 }) {
  const viewportWidth = innerWidth;
  const viewportHeight = innerHeight;
  const describe = (el) => {
    const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim();
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
    return { element: `${el.tagName.toLowerCase()}${id}${cls}`, label: label.slice(0, 48) };
  };
  // The part of an element a person can actually see: its box cut by every scrolling or clipping
  // ancestor and by the viewport. A card half-scrolled under a bar is only judged by its visible half.
  const visibleRect = (el) => {
    const r = el.getBoundingClientRect();
    let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(hidden|clip|auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY)) {
        const c = node.getBoundingClientRect();
        left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
      }
    }
    left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, viewportWidth); bottom = Math.min(bottom, viewportHeight);
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };
  const shown = (el) => {
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    const full = el.getBoundingClientRect();
    // Visually hidden text for screen readers is intentionally 1 px and clipped.
    if (full.width <= 1 && full.height <= 1) return false;
    const rect = visibleRect(el);
    return rect.width > 1 && rect.height > 1;
  };
  const box = (rect) => ({ x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) });

  const interactive = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=checkbox], [role=radio], [tabindex]:not([tabindex='-1'])")]
    .filter(shown)
    .filter((el) => !el.closest("[inert], [aria-hidden=true]"));

  // Inputs inside a larger label count by the label's size, which is what a finger hits. Size is
  // judged on the full box: a target half-scrolled out of view is not small, just scrolled.
  const targetOf = (el) => (el.matches("input[type=radio], input[type=checkbox]") && el.closest("label")) || el;
  const smallTargets = [];
  for (const el of interactive) {
    const rect = targetOf(el).getBoundingClientRect();
    if (rect.width < minTarget - 0.5 || rect.height < minTarget - 0.5) smallTargets.push({ ...describe(el), ...box(rect) });
  }

  // An action covered by something else at the centre of its visible part cannot be tapped there.
  // Slivers under 16 px, such as a card scrolled almost out of view, are not tappable anyway.
  const covered = [];
  for (const el of interactive) {
    const rect = visibleRect(el);
    if (rect.width < 16 || rect.height < 16) continue;
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (top && top !== el && !el.contains(top) && !top.contains(el)) covered.push({ ...describe(el), by: describe(top).element, ...box(rect) });
  }

  const textSizes = new Map();
  const clipped = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el)) continue;
    const ownText = [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
    if (!ownText) continue;
    const size = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
    if (!textSizes.has(size)) textSizes.set(size, []);
    if (textSizes.get(size).length < 4) textSizes.get(size).push(el.textContent.replace(/\s+/g, " ").trim().slice(0, 32));
    const style = getComputedStyle(el);
    const clips = /hidden|clip/.test(style.overflow + style.overflowX + style.overflowY) || style.textOverflow === "ellipsis";
    if (clips && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
      clipped.push({ ...describe(el), clamped: style.webkitLineClamp !== "none" && style.webkitLineClamp !== "" });
    }
  }
  const sizes = [...textSizes.keys()].sort((a, b) => a - b);

  // Content inside a safe-area band sits under the status bar, notch or home indicator.
  const underInsets = [];
  if (safeArea.top || safeArea.bottom) {
    for (const el of interactive) {
      const rect = visibleRect(el);
      if (safeArea.bottom && rect.bottom > viewportHeight - safeArea.bottom + 0.5 && rect.top < viewportHeight) underInsets.push({ ...describe(el), edge: "bottom", overlap: Math.round(rect.bottom - (viewportHeight - safeArea.bottom)) });
      if (safeArea.top && rect.top < safeArea.top - 0.5 && rect.bottom > 0) underInsets.push({ ...describe(el), edge: "top", overlap: Math.round(safeArea.top - rect.top) });
    }
  }

  return {
    viewport: { width: viewportWidth, height: viewportHeight, devicePixelRatio, coarsePointer: matchMedia("(pointer: coarse)").matches, hover: matchMedia("(hover: hover)").matches },
    horizontalOverflow: Math.max(0, document.scrollingElement.scrollWidth - viewportWidth),
    focus: document.activeElement && document.activeElement !== document.body ? describe(document.activeElement) : null,
    smallTargets,
    covered,
    underInsets,
    smallestText: sizes.slice(0, 3).map((size) => ({ size, samples: textSizes.get(size) })),
    textBelow: sizes.filter((size) => size < smallText).reduce((count, size) => count + textSizes.get(size).length, 0),
    clipped: clipped.slice(0, 12),
  };
}

export function summarize(measure) {
  const notes = [];
  if (measure.horizontalOverflow) notes.push(`page scrolls sideways by ${measure.horizontalOverflow}px`);
  if (measure.smallTargets.length) notes.push(`${measure.smallTargets.length} target(s) under the minimum: ${measure.smallTargets.slice(0, 3).map((t) => `${t.label || t.element} ${t.width}×${t.height}`).join(", ")}`);
  if (measure.covered.length) notes.push(`${measure.covered.length} action(s) covered: ${measure.covered.slice(0, 3).map((t) => `${t.label || t.element} by ${t.by}`).join(", ")}`);
  if (measure.underInsets.length) notes.push(`${measure.underInsets.length} control(s) inside a safe-area inset`);
  const unclamped = measure.clipped.filter((item) => !item.clamped);
  if (unclamped.length) notes.push(`${unclamped.length} element(s) clip their text`);
  if (measure.smallestText[0]) notes.push(`smallest text ${measure.smallestText[0].size}px`);
  return notes;
}
