---
name: unslop-mobile
description: Reviews and improves mobile interfaces, Expo / React Native screens and mobile web pages, from rendered evidence at real phone sizes. Starts from the product's main task and a short flow, checks touch, safe areas, keyboard and forms, navigation, readable text, accessibility and real app states, and separates usability defects from consistency issues and optional taste. Can conclude that a screen needs no change. Optional scripts capture matched before/after screens and render a short comparison video. Use when asked to review, polish, unslop or redesign a mobile screen or flow, or to show a mobile before/after. Not for desktop-only layouts.
license: CC-BY-4.0
metadata:
  short-description: Review and improve mobile screens from evidence
  adapted-from: "unslop by Damir Sokolovsky (@heydamir), https://github.com/heydamir/unslop, revision 4652254"
---

# Unslop Mobile

Adapted from [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Keep this credit in any copy or adaptation. This is an independent adaptation, not part of or endorsed by the original project; [ATTRIBUTION.md](ATTRIBUTION.md) lists what was kept and what changed.

From the original: look at the rendered screen before proposing anything, ground every decision in the product, tell a polish pass from a redesign, work in deliberate passes, check the result against the problems you found, and leave a good screen alone.

What this adds: a phone is used one-handed, in motion, outdoors, while talking to someone, with a keyboard covering half of it and text set larger than the designer's. Most mobile problems are not visible in a static mockup at default settings. They appear when a real state is reached at a real size. So this skill reviews **a task through a few states**, not a screen in isolation, and it changes only what that review can show is worth changing.

## Know what you can see

Decide this first, because it decides what you can claim at the end.

| | Mobile web, or an HTML design study | Expo / React Native |
| --- | --- | --- |
| Render | Chromium mobile emulation at a logical viewport, such as 390 × 844 CSS px, with `scripts/capture.mjs` | iOS Simulator, Android emulator or a device, running a development build |
| Units | CSS px | pt on iOS, dp on Android. React Native style numbers are density-independent pixels |
| Safe areas | `env(safe-area-inset-*)`, emulated by the capture script | `react-native-safe-area-context` insets |
| Keyboard | Only a proxy: the viewport shrinks by a typical keyboard height | The real keyboard, with `KeyboardAvoidingView` or a keyboard library |
| Larger text | Only a proxy: font sizes multiplied, boxes left alone | Dynamic Type and Android font scale settings |
| Screen reader | Accessible names and roles in the browser's tree | VoiceOver and TalkBack, on a device or simulator |
| Video | CSS morph (`story.mjs`) when structure is shared, or screenshot comparison | Screenshot comparison (`compare.mjs`) only |

Never describe a browser capture as a native screenshot, a browser check as VoiceOver or TalkBack verification, or an HTML study as the shipped app. React Native views cannot be restyled by injecting CSS, so the morph video does not apply to them.

## Run it

1. **Write a short brief.** Read the product's own documents before touching anything: product notes, design records, the latest decisions in the conversation, and the current state of the build. Then write five lines:
   - **Task.** The one thing a person must get done, in their words. "Find who I know in El Salvador and remember where we met."
   - **Moment.** Where and how it happens. Standing at a hostel table, one hand, talking.
   - **Flow.** Three to five states that cover it, including the awkward ones. "List → person → back → add a person with only a name → saved."
   - **Keep.** What is decided and must survive: the brand, named themes, navigation, data meanings, anything the owner chose.
   - **Stage.** Is this a design study, a mobile web page or native code, and what stage is the work at? Change the thing the current milestone is about, and say which one you changed.
2. **Look at it rendered,** at a phone viewport, in every state of the flow, before reading much code. Capture a small phone and a large one, and one pass with larger text. Use the product's own fixture or clearly fictional data, never someone's real records. How to capture each stack is in [references/evidence.md](references/evidence.md).
3. **Review in passes,** each a few questions, not a checklist to fill in. Skip what the flow does not touch.
   - **Task and hierarchy.** Can the task be done, and is the thing it needs the most prominent thing on screen?
   - **Touch.** [references/interaction.md](references/interaction.md): target size and spacing, nothing that needs hover, gestures with a visible alternative, predictable back and dismissal.
   - **Layout.** [references/layout.md](references/layout.md): safe areas, bars and floating actions that cover content, heights that come from content, long and unknown values, small phones.
   - **Keyboard and forms.** [references/interaction.md](references/interaction.md#keyboard-and-forms): the focused field and the submit action stay visible, the right keyboard and return key, nothing typed is lost.
   - **Text and access.** [references/typography.md](references/typography.md) and [references/accessibility.md](references/accessibility.md): readable sizes and scaling, names, states, focus and reading order, contrast, meaning beyond colour, reduced motion.
   - **States and honesty.** [references/review.md](references/review.md#states): empty, loading, error, offline, permission denied, populated, saved and pending. Nothing claims a save, a sync or a live location that did not happen.
   - **Consistency and identity.** The same thing looks and behaves the same everywhere, and the product's own character holds.
4. **Write findings,** one row each, in the format in [Findings](#findings). Measure what can be measured. Then decide the scope, honestly:
   - **No change.** The flow works and the screen fits the product. Say so, and offer at most two or three optional refinements with exact values. Do not apply them unless asked.
   - **Polish.** A few defects or inconsistencies. Fix those only, inside the existing design.
   - **Redesign.** The structure itself blocks the task. Show the findings and the proposed direction and wait for agreement before rebuilding, unless the user already said to go ahead. A redesign of a named, owner-chosen identity always needs that agreement.
5. **Change in deliberate passes,** the smallest change that fixes each observed problem, in the product's own stack and idiom. Keep features, content, real data, the user's own words and the established identity. Where the owner has authorised exploration, work inside that exploration instead of starting a new direction.
6. **Verify each finding against its check,** on the same fixture, state and viewport as the original capture, and re-capture. A finding is fixed when its check passes, not when the screen looks better. Record where each check ran: browser, simulator, device or screen reader.
7. **Report:** the verdict and why, each finding with its result, what you chose not to change, and what remains unverified on which platform. The template is in [references/review.md](references/review.md#report).
8. **Record, only if wanted.** A before/after video comes from the same captures. See [Evidence and video](#evidence-and-video).

Keep a run proportionate. Once the checks for the changed things pass, stop. Do not run unrelated audits to fill the report.

## Judgment

There is no house style. Judge everything against the brief: does it fit this product, does it communicate, does it stay usable?

- **Not defects by themselves:** gradients, serif or display faces, italics, uppercase labels, colourful surfaces, bold weights, rounded or pill controls, decoration, illustration, playful copy. Each becomes a problem only through an effect you can name: text that fails contrast, a label too small to read, a gradient behind text that moves, a pill that hides its state, decoration that reads as data.
- **Respect an established identity.** A product that already has a logo, palette, typeface or named themes keeps them. Improve how they are used.
- **Content is the character.** Names, places, photos, a real note, a real chart: the person's own material is what makes a screen belong to its product. Never replace real content with shorter invented copy, and never fabricate photos, handles, dates or locations to fill a layout.
- **The template test still applies.** If the screen would fit any app with the name swapped, the content is not leading. On mobile that is more often a hierarchy problem than a decoration problem.
- **Do not manufacture changes.** A review that finds nothing to fix is a successful review. A finding with no impact on a real task is at most an optional suggestion.

## Findings

Every proposed change gets one row:

| Screen or component | Observed | Impact on a real task | Proposed change | How to check |
| --- | --- | --- | --- | --- |
| Person · name-only record | Empty meeting place set in the 23 px display face, like a real place | Scanning the record, "Not added yet" reads as where you met | Same words in body type at 17 px, regular weight | Computed font on the empty value; populated records unchanged |

and one class:

- **Usability defect.** It blocks, slows or misleads the task, loses input, or shuts someone out: a target too small or covered, unreadable text, the wrong keyboard, a lost draft, a state that claims something false. Fix it.
- **Consistency issue.** The same thing is presented two ways, or the screen departs from the product's own system. Low task impact. Fix it when it is cheap and inside scope.
- **Optional suggestion.** Taste, or a bigger idea. Propose it with exact values, do not apply it unasked.

Observed means seen on a capture or measured, with the state and viewport. "Might be small" is not a finding.

## Evidence and video

The scripts are optional. The skill works without them, and the video tools need extra software.

- `scripts/capture.mjs` (needs Playwright and Chromium): captures the same states of a mobile web page for every variant at real phone viewports, with device scale, touch, safe-area insets, a larger-text pass and a keyboard proxy, and writes a manifest of how each image was made, with hashes of the page and fixture. It refuses a capture whose viewport or scale differs from what was asked.
- `scripts/compare.mjs` (Playwright and ffmpeg): a before/after video from pairs of screenshots, browser captures or native simulator and device screenshots with their provenance. It refuses pairs whose size, scale, state or fixture differ.
- `scripts/story.mjs` (Playwright and ffmpeg): the original unslop video, adapted. A browser page lays out at its own phone viewport and tweens from before to after one CSS step at a time, with captions. Only for browser pages whose structure is shared between stages.

The viewport, the capture scale and the video canvas are separate settings. A portrait video shows a page laid out at a phone width; it never squeezes a desktop layout into a tall frame. Details, configuration and native screenshot commands are in [references/evidence.md](references/evidence.md). Every video carries the credit `adapted from unslop by @heydamir`, as the licence asks.

## Do not

- Do not review from code alone, or from a desktop window dragged narrow.
- Do not port desktop numbers to a phone. 32 px navigation rows are not touch targets.
- Do not shrink the whole interface to fit a small phone. Reflow it, and reduce chrome before text.
- Do not change what the product is, rename it, or replace a chosen identity.
- Do not invent data, saves, live locations or sync states for visual completeness.
- Do not mark a platform behaviour verified unless you exercised it on that platform.
