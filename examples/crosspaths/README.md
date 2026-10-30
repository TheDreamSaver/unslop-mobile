# Example: CrossPaths, People flow

CrossPaths is a private travel contact book: you save who you met, where you met, their homebase and their last known location, and find them again when you travel. This folder is a small, self-contained mobile web page that reproduces its **People flow** from the CrossPaths HTML design study, in the Passage theme, with twelve fictional people. It runs without the CrossPaths repository, a backend, an account or anyone's real contacts.

It is the first application of the skill: the flow below was reviewed with [SKILL.md](../../SKILL.md), and the fixes found are applied here exactly as they were applied to the design study. It is not the native Expo app, and nothing here was checked on a device.

## The review

- **Task.** Find someone you already know, and recognise them by where you met. Save a new person in seconds, even with only a name.
- **Moment.** Standing at a hostel table, one hand, mid-conversation.
- **Flow.** People → open Maria Reyes → back → + → type only a name → save → back.
- **Keep.** The original identity, visible person cards, People / Map / + / Journey / You, the Passage theme, and three separate location meanings: where we met, homebase, last known location. A saved location must never look like live tracking, and the person's own memory is never rewritten.
- **Stage.** HTML design study. The native app is unchanged.

**Verdict: polish.** The populated screens (the People list, Maria's detail, the capture form) work and fit the product; the review left them alone, and the tests check that they render pixel-identical before and after. The problems were all in the name-only path and on the device's edges:

| # | Screen or component | Observed (390 × 844 unless noted) | Impact on the task | Change | Check | Class |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Person · name-only record | Empty meeting place in the 23 px display serif; empty homebase and last known in primary ink | "Not added yet" reads as the place you met; the record looks complete | Same words, 17 px body type at weight 500; empty locations in the muted role | Computed font and colour; populated records unchanged | Consistency |
| 2 | Person · empty memory | "Add a detail you would like to remember." set as the note, above "Only visible to you" | Looks like something the user wrote and kept private | "No memory saved yet" in the muted role and an **Add a memory** button that opens the form at the memory field | No note-styled text on an empty record; the button focuses the memory field | Usability |
| 3 | Person · last known location | "Location date unknown" under a location that was never saved, on every new record | A date state for nothing; erodes trust in real dates | Date line only when a location exists; editing keeps a known date | Not shown for a name-only record | Consistency |
| 4 | Person · after saving | The save toast sits over **Share card** for 4 s; at 320 px it covers the whole bar | The only action on the screen is unreachable | Save note in the top bar's empty centre; other toasts above the bar | No action covered at its centre (capture measurement) | Usability |
| 5 | Person · action bar | With no phone number, **Share card** sits alone at its own width | Looks unfinished; smaller target | The lone action fills the bar | Width equals the bar | Consistency |
| 6 | Add person | + clears a name typed before going back | A name typed mid-conversation is lost | The unsaved draft survives until it is saved | Type, back, +: the name is still there | Usability |
| 7 | People · return from a person | Focus stays on the hidden back button | Keyboard and screen reader users restart from the top | Focus returns to the opened card | Focused element after back | Usability (access) |
| 8 | Add person · fields | No capitalisation, autocorrect or return-key hints; return submits the form | Names get autocorrected, handles capitalised, return saves a half-entered person | Words for names and places, none for handles, return moves to the next field | Attributes; return focuses the next field | Usability |
| 9 | All screens · bars | Fixed 44 px top strip; no space for the home indicator | Navigation labels and buttons sit in the 34 pt indicator zone | Bars pad `env(safe-area-inset-*)` | No control inside an inset (capture measurement) | Usability |

**Not changed, and why**

- The 44 px header buttons, the 44 px People / Places tabs and the 46 px search field meet iOS's 44 pt but fall under Android's 48 dp (the `android-360` captures list them). A native Android build needs 48 dp minimums or `hitSlop`. Recorded for implementation, not a study change.
- Initials overflow their avatar tiles at 2× text. They are decorative (the name is next to them); natively, `maxFontSizeMultiplier` on the initials only.
- Homebase and last known values are 12 px on cards. Homebase is a search key for the product's main task, so raising them to 13 px is a reasonable **optional suggestion**, but the 11–12 px metadata role is a recorded design decision; it was not changed.
- At 320 × 568 the header and controls fill about 40% of the People screen before the first card. The header scrolls away with the list, so it was left as designed.

## Run it

From the package root:

```bash
npm install                   # Playwright, used by the scripts; uses your Chrome, or run npx playwright install chromium
npm run example:capture       # 160 captures: 2 variants × 5 phones × 2 text sizes × 8 states
npm run example:compare       # screenshot comparison video from those captures
npm run example:story         # CSS morph video of the saved name-only person
```

Or open [app.html](app.html) in a browser with the device toolbar set to a phone: `app.html?variant=before` is the study as it was, `app.html` the improved version. Other parameters: `screen=detail&id=1`, `screen=capture`, `screen=saved` (saves a name-only person through the normal path), `hold` (keeps a toast on screen).

## Files

| File | What it is |
| --- | --- |
| [app.html](app.html) | The page. `?variant=before` disables the fix stylesheets and the fixed behaviours |
| [assets/app.css](assets/app.css) | The design study's revision-8 Passage styles, laid out to fill a phone viewport |
| [assets/fixes/](assets/fixes/) | One stylesheet per fix, linked by the after variant and reused by the story as its steps |
| [assets/app.js](assets/app.js) | Rendering and behaviour; the before/after differences are marked in comments |
| [assets/fixture.js](assets/fixture.js) | The twelve fictional people |
| [capture.json](capture.json) | Phones, text sizes, states and steps for `capture.mjs` |
| [compare.json](compare.json) | Pairs and highlights for `compare.mjs` |
| [story.json](story.json), [story/prepare.js](story/prepare.js) | The morph video: steps, captions, and the presentation-only markup for swaps and entrances |
| [media/](media/) | The rendered videos with their provenance sidecars, and a few stills |

## Assets and licences

| File | Source | Licence |
| --- | --- | --- |
| `assets/fonts/HankenGrotesk-Variable.ttf` | Hanken Grotesk 3.013, from the official [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/hankengrotesk) via the CrossPaths design study; unmodified | SIL OFL 1.1, [HankenGrotesk-OFL.txt](assets/fonts/HankenGrotesk-OFL.txt) |
| `assets/fonts/PlayfairDisplay-Bold.ttf` | Playfair Display Bold 1.203 ([project](https://github.com/clauseggers/Playfair-Display)), as bundled in the CrossPaths app; unmodified, renamed | SIL OFL 1.1 with Reserved Font Name "Playfair Display", [PlayfairDisplay-OFL.txt](assets/fonts/PlayfairDisplay-OFL.txt) |
| `assets/fixture.js` | The CrossPaths design-review fixture, twelve fictional people, copied unchanged | Part of this package |
| Icons in `app.html` | Simple line icons drawn for the CrossPaths design study | Part of this package |

The CrossPaths logo and country silhouettes are not included; the wordmark is set in Playfair Display.
