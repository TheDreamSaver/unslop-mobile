# The review

How to run the passes in [SKILL.md](../SKILL.md) on a real flow, and how to report them.

## Choose the flow

Start from the product's main task, then pick the smallest flow that exercises it: usually three to five states, one of which is awkward. Good flows include a return trip and an edge case:

- browse → open an item → back → add a minimal new item → saved
- search with no results → clear → result → act on it
- start a form → leave → come back → submit with an error → fix → done

Write the flow down before capturing, with the fixture you will use. The same flow, fixture and viewports are used for the after captures, so the comparison stays meaningful.

## The brief

Five lines (see [SKILL.md](../SKILL.md#run-it)): task, moment, flow, keep, stage. "Keep" is the most often forgotten. List what the owner has decided, with where it is written down: a named theme, a logo, the navigation, a data distinction such as "a saved location is not a live location". Those are constraints on the review, not targets for it.

When the product has documents, read them before proposing anything. A recommendation that a recorded decision already covers should cite that decision, and any departure from it should be stated as a departure.

## Questions per pass

Short prompts. Each answer is either "fine" or a finding with evidence.

- **Task and hierarchy.** What does the person need from this screen right now? Is it the most prominent thing? What is louder than it, and why?
- **Touch.** Which controls are under 44 pt / 48 dp? Which are too close together? What only works on hover or by gesture? Where does back go?
- **Layout.** What sits under the status bar, the home indicator, a tab bar or a floating button? What clips or overflows with a long value? What is visible before scrolling on a small phone?
- **Keyboard and forms.** When the keyboard opens, are the field and the submit action visible? Is it the right keyboard, capitalisation and return key? What happens to typed input when you leave, fail or are interrupted?
- **Text and access.** What is the smallest text and does it matter? What breaks at larger text? Does each control have a name, role and state? Where does focus go after each step? What relies on colour alone? What moves when reduced motion is on?
- **States and honesty.** Which states does the flow pass through, and which did you actually see? Does any screen claim something that did not happen?
- **Consistency and identity.** Does the same thing look and behave the same across the flow? Does the screen still belong to this product?

## States

Exercise the states the flow can reach, with real or fixture data, and record which you saw:

| State | What to look for |
| --- | --- |
| Empty (first use, no results) | Says what is empty and how to fill it; no fake content |
| Loading | Keeps layout stable; says what is loading if it takes more than a moment |
| Error | Says what failed and what to do; keeps what was entered |
| Offline | Shows what still works; queues or refuses writes honestly |
| Permission denied | Explains what is unavailable and how to allow it; the rest still works |
| Populated, long, unknown | Long names, places and notes wrap; unknown values look unknown |
| Saved and pending | Distinguishes "saved on this device", "syncing" and "synced"; never shows a success that did not happen |

Honesty rules that apply in every state:

- Do not invent successful saves, live locations, sync status, presence, counts or freshness to make a screen look complete.
- A recorded value is not a live one. A location typed in last month is "last known", with its date or "date unknown", never presented like tracking.
- Placeholder or prompt text never sits where saved content goes, in the same style as saved content.

## Severity and scope

Classify each finding (usability defect, consistency issue, optional suggestion; see [SKILL.md](../SKILL.md#findings)), then decide scope from the whole list, not from the first finding:

- **No change** when nothing blocks or misleads the task and the screen fits the product.
- **Polish** when there are a few defects or inconsistencies inside a working structure.
- **Redesign** only when the structure itself defeats the task, for example the key information cannot be made prominent without reorganising the screen. Propose it and wait.

An empty or near-empty findings list is a valid outcome. So is fixing three defects and leaving five optional suggestions in the report.

## Verify

For each finding, run its check on the same fixture, state and viewport, after the change, and record the result: passed, failed, or not checkable here. Checks are specific: a computed value, a measurement, an attribute, a focused element, a screenshot pair at the same size. "Looks better" is not a check.

Re-capture every state of the flow, not only the ones you changed, so regressions show up. Then stop: verification covers the changes and their neighbours, not the whole app.

## Report

```
Verdict: polish (3 usability defects, 2 consistency issues, 2 optional suggestions)
Stage: HTML design study, revision 9. Native code unchanged.
Flow: People → person → back → add a name only → saved. Fixture: demo-contacts.json (12 fictional people).
Viewports: 375×667, 390×844, 430×932; text ×1 and ×1.3; Chromium emulation.

Fixed
1. Person · empty memory · usability · placeholder set as a saved note → empty state and "Add a memory"
   Check: no note-styled text on a name-only record; the action opens the form at the memory field. Passed (browser).
...

Not changed, and why
- Header back buttons are 44 pt: meets iOS; native Android needs hitSlop to 48 dp. Recorded for implementation.

Optional suggestions
- ...

Not verified
- VoiceOver and TalkBack reading order; native keyboard avoidance; Dynamic Type at accessibility sizes.
```

Name the evidence files (capture manifest, screenshots, video) and where each check ran.
