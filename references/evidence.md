# Evidence: captures, comparisons and video

The scripts in `scripts/` are optional. They need Node 18 or later. Capturing needs Playwright with a Chromium browser; videos also need ffmpeg with libx264. Missing pieces produce a message saying what to install.

Three sizes are always separate:

- **Viewport**: the logical size the interface lays out at, in CSS px, pt or dp. 390 × 844 for a typical iPhone.
- **Scale**: device pixels per logical unit in a capture. A 390 × 844 capture at 3× is 1170 × 2532 pixels.
- **Canvas**: the video frame. 1080 × 1920 for portrait. The canvas never changes how the page lays out.

## Mobile web and HTML studies: capture.mjs

```bash
node scripts/capture.mjs examples/crosspaths/capture.json [--out=folder] [--variant=before,after] [--device=phone-390] [--state=detail] [--text-scale=1,1.3]
```

Every state is captured from a fresh page load, for every variant, device and text scale, so before and after use the same steps. The config:

```json
{
  "name": "people-flow",
  "label": "HTML design study · fictional data",
  "provenance": "Where the pages come from and what they are not.",
  "fixture": "assets/fixture.js",
  "clock": "2026-10-30T12:00:00Z",
  "hash": ["assets/app.css", "assets/app.js"],
  "variants": {
    "before": "app.html?variant=before",
    "after": { "source": "app.html?variant=after", "presentation": "optional-presentation.css" }
  },
  "presentation": "optional stylesheet injected into every variant",
  "devices": [
    { "id": "phone-390", "label": "390 × 844 · notch", "viewport": "390x844", "scale": 3, "safeArea": { "top": 47, "bottom": 34 }, "keyboard": 336 },
    { "id": "android-360", "platform": "android", "viewport": "360x800", "scale": 3, "safeArea": { "top": 24, "bottom": 24 } }
  ],
  "textScales": [1, 1.3],
  "states": [
    { "id": "list" },
    { "id": "detail", "steps": [{ "click": ".card[data-id='1']" }] },
    { "id": "form-keyboard", "keyboard": true, "steps": [{ "click": "#add" }, { "fill": ["#name", "Ana Lucía"] }] },
    { "id": "end-of-list", "steps": [{ "scroll": ["#list", "end"] }] }
  ]
}
```

- **Steps:** `click`, `fill`, `press` (a key, or `[selector, key]`), `focus`, `scroll` (`[selector, y or "end"]`), `wait` (ms), `waitFor` (selector). A state may add `query` to the page URL.
- **Fixture and hashes.** The fixture's SHA-256 is recorded, and `compare.mjs` refuses to pair captures made from different fixtures. List the page's assets under `hash` so a later change to them is visible in the manifest.
- **Clock.** Pages that derive ids, colours or dates from the current time render differently each run. A fixed `clock` keeps before and after on the same data.
- **Presentation stylesheets** only change how a page is framed for capture, for example hiding a review board around a phone mockup. They must not change the design under review; keep them in their own file and say so in the provenance.

What the browser emulates: a phone viewport, device scale, `isMobile`, touch input with coarse pointer and no hover, reduced motion, a light colour scheme, and safe-area insets (`env(safe-area-inset-*)`, through Chromium's DevTools protocol). Pages need `<meta name="viewport" content="width=device-width, initial-scale=1">`; without it a mobile browser lays out at 980 px, and the capture stops with that message.

Proxies, labelled as such in the manifest:

- **Keyboard** (`"keyboard": true` on a state): the viewport shrinks by the device's `keyboard` height, then the focused element is scrolled into view. It shows what a resizing layout leaves visible. It is not a native keyboard.
- **Larger text** (`textScales`): every element's computed font size and pixel line height is multiplied, once, after the steps; boxes keep their sizes. That is how scaled text breaks fixed layouts. It is not Dynamic Type or Android font scale.

Hard checks, which stop the run: the page threw an error; a step failed; the laid-out viewport or device pixel ratio differs from the request; the image size is not viewport × scale.

Measurements, recorded per capture as evidence for the reviewer: horizontal overflow, controls under the device's minimum target (44, or 48 for `platform: "android"`), controls whose visible centre is covered by another element, controls inside a safe-area inset, the smallest text sizes with samples, elements that clip text (line clamps flagged separately), and which element has focus. Measurements use each element's visible area, clipped by scrolling containers; covered-action checks skip slivers under 16 px. They point at things to look at; they do not grade the screen.

Output: `<out>/<variant>/<device>-t<scale×100>/<state>.png` and `<out>/manifest.json` with the tool version, browser version, config, fixture, source and asset hashes, clock, and for each capture its device, safe areas, text scale, keyboard, image size, measurements and notes.

## Expo and React Native: native screenshots

The scripts do not drive simulators. Capture native screens with the platform tools, from a development build, using the same fixture and flow for before and after, then describe each image in a comparison file.

These commands are standard platform tooling; this release's own runs did not exercise them.

**iOS Simulator** (Xcode):

```bash
xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl ui booted appearance light
xcrun simctl ui booted content_size large            # default; try accessibility-large for larger text
xcrun simctl io booted screenshot before/people.png
```

**Android emulator or device** (platform tools):

```bash
adb shell settings put system font_scale 1.0         # 1.3 for larger text
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
adb exec-out screencap -p > before/people.png
```

Record for each image: device and OS version, build or commit, the fixture, the state, the text size setting, and the scale (3 for most current iPhones; Android density ÷ 160, so 2.625 for 420 dpi). Keep the device, scale and text setting identical between before and after.

## compare.mjs: screenshot comparisons

```bash
node scripts/compare.mjs compare.json out.mp4 [--canvas=portrait|square|landscape|WxH] [--frame=x,y,w,h] [--layout=sequence|side-by-side] [--fps=30] [--frames=folder]
```

```json
{
  "title": "CrossPaths · People flow",
  "label": "Browser captures · HTML design study · fictional data",
  "before": { "manifest": "captures/manifest.json", "variant": "before" },
  "after": { "manifest": "captures/manifest.json", "variant": "after" },
  "device": "phone-390",
  "textScale": 1,
  "pairs": [
    { "state": "saved", "caption": "An empty memory is not shown as a note", "highlights": [{ "rect": [18, 580, 354, 120], "label": "Empty state" }] }
  ]
}
```

For native screenshots, give each side an image and its provenance instead of a manifest:

```json
{ "state": "saved",
  "before": { "image": "ios/before-saved.png", "scale": 3, "device": "iPhone 16 · iOS 18.2 Simulator", "fixture": "demo-contacts.json@<sha256>", "source": "Expo dev build abc1234 · xcrun simctl io" },
  "after":  { "image": "ios/after-saved.png",  "scale": 3, "device": "iPhone 16 · iOS 18.2 Simulator", "fixture": "demo-contacts.json@<sha256>", "source": "Expo dev build def5678 · xcrun simctl io" } }
```

The script refuses a pair whose image sizes, scales, devices, states, text scales or fixtures differ, or that lacks a fixture. `highlights` are rectangles in logical units on the after image. In the sequence layout each pair shows the before screen, wipes to the after screen, then marks the highlights; side-by-side shows both at once, which suits landscape.

## story.mjs: CSS morph videos for browser pages

```bash
node scripts/story.mjs story.json out.mp4 [--canvas=portrait|square|landscape|WxH] [--viewport=390x844] [--frame=x,y,w,h] [--fps=30] [--duration=12] [--frames=folder] [--play]
```

Use it only when before and after share their structure, so the same page can tween between them: sizes, colours, spacing, weights, a few words. Structural changes and native screens belong in `compare.mjs`.

```json
{
  "title": "CrossPaths · a person saved with only a name",
  "label": "HTML design study · fictional data · 390×844",
  "source": "app.html?variant=before&screen=saved",
  "prepare": "story/prepare.js",
  "viewport": "390x844",
  "safeArea": { "top": 47, "bottom": 34 },
  "intro": "Before · saved with only a name",
  "outro": "After · same record, same fixture",
  "duration": 12,
  "steps": [
    { "name": "Empty values", "caption": "Missing places read as missing", "css": "assets/fixes/1-empty-values.css", "highlight": [{ "selector": "#met", "label": "Reads like a place" }] },
    { "name": "Safe areas", "caption": "Buttons clear the home indicator", "css": "assets/fixes/4-safe-areas.css", "kind": "insets" }
  ]
}
```

- The source page is served from the story file's folder and laid out in an iframe at `viewport`, so its media queries and layout are those of a phone. The stage scales it into the canvas with one uniform scale (never stretched), between a caption band and a footer with the provenance label and the credit.
- **Steps** apply in order and accumulate. A step's `css` files are injected at that step; the class `s<k>` is also added to the page's root, so an upstream-style `story.html` with `.s1 …` rules works too.
- **`prepare`** runs once in the page before the story starts, and is presentation only. It marks what cannot be expressed as CSS on a clean page: `<span class="swap" data-at="k"><span class="from">old</span><span class="to">new</span></span>` for words that change, `data-in="k"` for something that appears (its space is reserved), `data-out="k"` for something that collapses away.
- **Annotations** per step: `highlight` boxes with labels (red while it is a problem, white once fixed), `"kind": "targets"` with selectors in `targets` to measure touch targets live, `"kind": "insets"` to show the safe-area bands, and the original's `spacing` (`data-gap`) and `details` (`data-radius`) redlines. Step names containing Spacing, Details, Touch or Safe area choose those kinds automatically.
- **Framing.** The default frame is the whole viewport. `frame` (or `frames` per canvas preset) crops to a region in logical units, which must lie inside the viewport. Square and landscape canvases are wide and short, so a whole phone screen becomes small; crop to the part that changes. The script prints how large 14 px and 12 px text will appear when the video plays on a 390 pt wide phone, and warns below 8 pt.
- **Timing.** The intro holds the original for about 1.5 s; each annotated step marks the problem for most of a second before changing it; the outro holds the result for about 2 s. `duration` is a ceiling: steps compress to fit, never stretch.
- An upstream-style `story.html` with `<meta name="unslop-steps">` still renders; add `<meta name="unslop-viewport" content="1440x900">` to render a desktop story at its own width.

Each video is written with a `.json` sidecar: tool version, mode, source and stylesheet hashes, viewport, safe areas, frame, canvas, screen scale, readable sizes, frame count, duration and the credit. Look at a few frames and watch the whole video before handing it over.

## Labels

Every capture, comparison and video says what it is: "HTML design study", "mobile web, Chromium emulation", "iOS Simulator", "device". Use fictional data, and say so. Keep the credit `adapted from unslop by @heydamir` on every video.
