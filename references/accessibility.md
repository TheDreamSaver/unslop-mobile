# Accessibility on mobile

Prompts for the access pass, and an honest account of what each kind of check can prove. Many of these overlap with touch and typography; they are repeated here only where the accessibility question differs.

## What a check proves

| Check | What it establishes | What it does not |
| --- | --- | --- |
| Reading the code or the browser's accessibility tree | Names, roles and states are declared | That VoiceOver or TalkBack announces them well, in a sensible order |
| Contrast measurement | Colours meet a ratio on that surface | Legibility in sunlight, or with larger text |
| Browser text-scale proxy | Layouts survive bigger text in fixed boxes | Dynamic Type or Android font scale behaviour |
| Xcode Accessibility Inspector, Android Accessibility Scanner | Labels, target sizes and contrast on the real view hierarchy | The experience of using the flow by ear |
| VoiceOver (iOS) and TalkBack (Android) on a device or simulator | The flow works by ear, in order, with focus where it should be | Other assistive technology such as Switch Control or Voice Control |

Report each result at the level it was checked. "Accessible names present in the browser" and "flow completed with VoiceOver on iPhone 15" are different claims.

## Names, roles and states

- **Every control has an accessible name** that says what it does: "Add a person", not "Plus" or nothing. Icon-only buttons always need one. React Native: `accessibilityLabel` or `aria-label`. Web: visible text, `aria-label` or a `label`.
- **Roles match behaviour.** A card that opens a screen is a button or link, not a toggle. Tabs are tabs. React Native: `accessibilityRole` or `role`.
- **States are exposed**, not just drawn: selected, checked, expanded, disabled, busy. React Native: `accessibilityState` or `aria-selected`, `aria-expanded` and friends. Web: the matching `aria-*` or native element.
- **Rich rows read well.** A list card with a name, a date, a place and a note should announce as one item with its key details, not as eight separate fragments. React Native: group with `accessible` on the container and give it a label, or let it read its children in order; web: a button with a short name and `aria-describedby` for the details.
- **Decorative images and icons are hidden** from assistive technology (`accessibilityElementsHidden`/`importantForAccessibility="no-hide-descendants"`, `aria-hidden`); meaningful ones have a description.

## Focus and reading order

- Reading order follows the visual order and the task. Check headers, the main content, then the bottom bar.
- **After a navigation, focus lands somewhere sensible:** the new screen's heading or first element on the way in, and the item that was opened on the way back. After closing a sheet or modal, focus returns to what opened it.
- A modal or sheet keeps focus inside it while open (`accessibilityViewIsModal` on iOS; `aria-modal` and an inert background on the web).
- Errors move focus or are announced (`accessibilityLiveRegion` on Android, `AccessibilityInfo.announceForAccessibility`, `role="status"` or `aria-live` on the web).
- On the web, keyboard focus is visible on every control, with a ring that meets 3:1 against its surroundings.

## Colour and contrast

- Text: **4.5:1** against its background, **3:1** for large text (about 24 px regular or 19 px bold). Controls and the boundaries that identify them: **3:1** (WCAG 1.4.11).
- Check text placed on colourful surfaces, photos and gradients at the point where contrast is worst, and placeholder text, which is often the lowest-contrast text on a form.
- **Meaning never travels by colour alone.** Selected tabs, statuses, errors, map layers and categories add a shape, weight, icon, underline or word.
- Light and dark themes, and every named theme a product offers, each need their own check.

## Larger text and zoom

See [typography.md](typography.md#support-the-systems-text-size). The accessibility question is whether the flow can still be completed at the largest size people actually use, not whether it looks the same.

## Motion

- Respect reduced motion. React Native: `AccessibilityInfo.isReduceMotionEnabled()`, or Reanimated's `useReducedMotion()`. Web: `prefers-reduced-motion`. Remove movement, parallax and auto-playing animation; keep confirmations as text or a quick fade.
- Nothing flashes more than three times a second.
- Animation never carries information that is not also stated.

## Time, gestures and input

- Nothing important times out quickly; a confirmation people need to read stays long enough, or stays.
- Gestures have visible alternatives ([interaction.md](interaction.md#no-hover-and-gestures-with-a-way-out)).
- Targets meet platform sizes ([interaction.md](interaction.md#targets)); WCAG's 24 px is the floor, not the goal.
