# Attribution

## The original work

Unslop Mobile is adapted from **unslop**, created by **Damir Sokolovsky** ([@heydamir](https://x.com/heydamir)), who started the Unslopping series on X.

- Repository: <https://github.com/heydamir/unslop>
- Revision used: [`4652254daff586ff4739849395a127b56f7f8cc7`](https://github.com/heydamir/unslop/tree/4652254daff586ff4739849395a127b56f7f8cc7) (October 29, 2026)
- Licence: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (CC BY 4.0). The full licence text, including its disclaimer of warranties (section 5), is in [LICENSE](LICENSE), copied unchanged from the original repository.
- The original asks that its credit be kept in any copy or adaptation, and that every video carry a small `unslop by @heydamir` credit.

This is an independent adaptation. It is **not affiliated with, sponsored by or endorsed by** Damir Sokolovsky or the unslop project. Any mistakes in it are ours.

## What was used, and how it was changed

| Original | Here | Changes |
| --- | --- | --- |
| `skills/unslop/SKILL.md` | [SKILL.md](SKILL.md) | Rewritten for mobile. Kept the principles: look at the rendered screen first, ground the direction in the product, separate a polish pass from a redesign, work in deliberate passes, check the result against the audit, leave a good screen alone. Replaced the nine desktop-oriented passes, the slop-sign audit and the fixed token values with a task-and-flow review, mobile-specific passes, an explicit finding format and classes, a statement of what each platform's evidence can prove, and judgment rules that do not treat any style as a defect by itself. |
| `references/signs.md`, `tokens.md`, `visuals.md`, `effects.md`, `refs.md` | not included | Their checklists and values target desktop dashboards and landing pages. The mobile references ([references/](references/)) are new writing. |
| `scripts/story.mjs` | [scripts/story.mjs](scripts/story.mjs) and the shared [scripts/lib/stage.mjs](scripts/lib/stage.mjs) | Adapted. Kept: tweening every property between cumulative CSS steps with a top-left wave, letter-rolling text swaps, `data-in` and `data-out`, the spacing and radius redlines, the slop boxes, deterministic frame stepping by pausing and seeking animations, and the JPEG-frames-to-ffmpeg pipeline. Changed: the page lays out at a configurable logical viewport instead of a fixed 1440 px width; the viewport, the capture scale and the video canvas are separate; portrait (default), square and landscape canvases with uniform contain-fit and explicit crop frames; a caption band, step counter, provenance label and credit footer; safe-area emulation; a JSON story format with per-step stylesheets and a presentation-only `prepare` script; touch-target, text-size, contrast, note and inset annotations that count live; camera zooms with annotations that follow them; a side-caption layout for square and landscape; an optional device status bar and home indicator; motion settings, and scheduling that never compresses transitions; swaps that resize their box and return to plain text at the end; fixes for Chromium restarting inherited and `currentColor` transitions when frames are seeked, and for `color-scheme` changes stalling colour transitions; readable-size reporting; dependency checks with clear messages; a provenance sidecar for each video. Upstream-style `story.html` files with `<meta name="unslop-steps">` still render. |
| `scripts/snapshot.mjs` | not included | Its job, saving a live page as static HTML at a desktop width, is not part of this workflow. [scripts/capture.mjs](scripts/capture.mjs) is new: it captures states at phone viewports and records how each image was made. |
| `examples/`, reference images | not included | The examples here are new and use fictional data: [examples/crosspaths](examples/crosspaths), and [examples/checkout-demo](examples/checkout-demo), a vibecoded demo screen made in the spirit of the original's dashboard example, with its own subject, content and code. |
| `README.md`, `CITATION.cff` | [README.md](README.md) | New text; the credit and licence statements are carried over. |

New in this adaptation, with no counterpart in the original: [scripts/capture.mjs](scripts/capture.mjs), [scripts/compare.mjs](scripts/compare.mjs), [scripts/lib/](scripts/lib/) apart from the parts of `stage.mjs` noted above, [references/](references/), [tests/](tests/) and [examples/](examples/).

## Credit in outputs

- [SKILL.md](SKILL.md) opens with the credit and a link to the original.
- [scripts/story.mjs](scripts/story.mjs) carries the credit and the changes in its header.
- Every video rendered by `story.mjs` or `compare.mjs` shows `unslop-mobile · adapted from unslop by @heydamir` in its footer, and records the same credit in its `.json` sidecar.

If you share or adapt this package, keep this file, the credit in SKILL.md and the video credit, link to both repositories, and note your own changes.

## Bundled third-party material

Only the examples bundle assets. See [examples/crosspaths/README.md](examples/crosspaths/README.md#assets-and-licences) and [examples/checkout-demo/README.md](examples/checkout-demo/README.md#assets-and-licences) for each file's source and licence:

- Hanken Grotesk (variable), SIL Open Font License 1.1, copyright 2021 The Hanken Grotesk Project Authors.
- Playfair Display Bold, SIL Open Font License 1.1, copyright 2017 The Playfair Display Project Authors, with Reserved Font Name "Playfair Display". Shipped unmodified.
- Twelve fictional people from the CrossPaths design-review fixture. No real person's details.

The CrossPaths logo is not included.
