# Readable text on a phone

Prompts for the text pass. Phone text is read at arm's length, outdoors, in motion and often enlarged by the system, so the questions are about legibility and scaling first and style second.

## Sizes that read

Starting points, not a house style. The platform defaults are the reference:

| Role | iOS | Android | Note |
| --- | --- | --- | --- |
| Body | 17 pt default; 15–17 is common in dense apps | 14–16 sp | The text people read most |
| Secondary, captions | 13–15 pt | 12–14 sp | Still information, so still readable |
| Small labels, metadata | 12 pt and up | 12 sp and up | Below 12 only for incidental text |
| Titles | 20–34 pt | 20–32 sp | Size and weight carry hierarchy |

- **Important information is never tiny metadata.** If a person scans for it, sorts by it or acts on it, it is not an 11 px caption. A date, a location, a price or a status that drives the task belongs at body or secondary size.
- **Hierarchy comes from size, weight, colour and position together.** Making everything bold, or everything small and grey, removes it.

Check: the capture manifest lists the smallest text sizes on each screen with samples. Ask of each sample whether it matters to the task.

## Support the system's text size

- **iOS Dynamic Type** goes from extra small to the accessibility sizes; body text at the largest accessibility size is about three times the default. **Android font scale** goes up to 200%, applied non-linearly to larger text on Android 14 and later.
- **React Native scales `Text` by default** (`allowFontScaling` is true). Keep it on for content. Use `maxFontSizeMultiplier` only for text inside a fixed-size control, such as a tab bar label or a badge, and only after the layout cannot reasonably grow. Never set `allowFontScaling={false}` on content.
- Read the current scale with `useWindowDimensions().fontScale` or `PixelRatio.getFontScale()` when a layout must switch, for example from a row to a stack.
- **The usual failure is fixed boxes, not the text.** Scaled text inside a container with a fixed height or width clips, overlaps or pushes controls off screen. Avoid fixed heights for anything holding text; see [layout.md](layout.md#let-content-decide-the-height).
- **Web:** set sizes in a way the browser can scale, honour the user's default font size where practical, and do not lock zoom (`user-scalable=no` or `maximum-scale=1`).

Check: on native, set the simulator or device to a large size (`xcrun simctl ui booted content_size accessibility-large`, `adb shell settings put system font_scale 1.3`) and walk the flow. In a browser, the capture script's `textScales` multiplies every element's font size and pixel line height while leaving boxes alone, which is how scaled text breaks fixed layouts. It is an approximation, not Dynamic Type.

## Wrapping and truncation

- Names, places and titles wrap. A long name on two lines is correct; a name cut to "Ana Lucía Fern…" is a defect when it is the only place it appears.
- Truncate summaries, with the full text one tap away. Prefer two lines to one.
- Watch the last word alone on a line in short headings and confirmations; `text-wrap: balance` on the web, or a shorter phrase.
- Do not justify text on a narrow column, and keep line length readable on large phones.

## Style is a judgment, not a rule

- **Serif and display faces** work for names and headings when they stay legible at the size used and support the weights needed. Check them at the smallest size they appear, with larger text on.
- **Italics** are fine for a short phrase or a quotation. Avoid long italic passages and italic small text.
- **Uppercase labels** are fine when short and spaced a little. Avoid uppercase for long labels, names or anything a screen reader would spell out.
- **Bold weights** are fine for names and headings. A screen where everything is bold has no hierarchy.
- **Custom fonts** must be bundled and loaded before first render on native (`expo-font`), and must include every weight used. A missing weight falls back to faux bold or the system face.

Ask of every type choice: does it fit this product, is it readable at its size and at larger text sizes, and does it keep the hierarchy clear? Only an effect on reading is a defect.

## Numbers, dates and copy

- One format per kind of value across the flow. Months and dates in the person's locale; avoid ambiguous `03/04`.
- Tabular figures where numbers line up.
- Labels in the product's own voice, short, without trailing periods on single phrases. Messages say what happened and what to do next.
- Unknown values say they are unknown, in a quieter style than saved values.
