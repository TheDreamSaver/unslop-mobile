# Touch, navigation, keyboard and forms

Prompts for the touch and keyboard passes. Ask the ones the flow touches; each has a way to check it.

## Units first

Measure targets and spacing in the platform's logical units, never in device pixels and never by copying CSS pixels from a desktop design:

- iOS: points (pt). A 390 pt wide iPhone has 1170 device pixels at 3×.
- Android: density-independent pixels (dp), and scale-independent pixels (sp) for text.
- React Native: style numbers are already dp/pt. `width: 44` is 44 pt on iOS and 44 dp on Android.
- Mobile web: CSS px at a phone viewport (`width=device-width`) map to pt and dp one to one.

## Targets

- **Size.** Interactive controls need about **44 × 44 pt on iOS** and **48 × 48 dp on Android**. WCAG 2.2's minimum (2.5.8) is 24 × 24 CSS px; platform guidance is the bar for an app. A 44-unit control meets iOS and falls short on Android, so a shared React Native component either sizes per platform or adds `hitSlop` (and `pressRetentionOffset`) to reach 48 dp without changing the visual.
- **The target is the hit area, not the glyph.** A 20 pt icon in a 44 pt pressable is fine. A 44 pt icon whose pressable is the icon's own 20 pt box is not.
- **Spacing.** Adjacent targets need separation, about 8 dp between hit areas, or a mis-tap does the wrong thing. Watch destructive actions next to frequent ones, and dense rows of chips or icons.
- **Whole-row targets.** A list row or card that opens something should be tappable across its whole area, with any secondary action inside it clearly separate and itself full size.

Check: the capture script lists visible controls under the minimum for the device profile (`minTarget` 44, or 48 for `platform: "android"`), with sizes. On native, use the Accessibility Inspector (Xcode) or Android's Accessibility Scanner, or read the pressable's layout.

## No hover, and gestures with a way out

- Anything that appears on hover needs another way in on touch: a visible control, a tap, or a long press that has a visible alternative. On the web, keep hover-only enhancements inside `@media (hover: hover)`.
- Every gesture-only action needs a visible alternative: swipe-to-delete also has a menu or button, drag-to-reorder has move controls (WCAG 2.5.1 and 2.5.7), pull-to-refresh has a refresh affordance when content can be stale.
- Long press is undiscoverable. Use it as a shortcut, never as the only path.

## Navigation and back

- **Know where back goes** at every step of the flow: the Android system back and predictive back gesture, the iOS edge swipe, the header back button, and dismissing a sheet or modal. They should agree.
- **Return to where you were.** Coming back from a detail screen restores the list's scroll position and, for keyboard and screen reader users, puts focus back on the item that was opened. React Navigation restores scroll for mounted screens; focus is your job.
- **Leaving a form with input in it** either keeps the draft or asks before discarding it. Never discard silently. In React Navigation, `usePreventRemove` (or the `beforeRemove` event) can intercept back.
- **Tab bars and floating actions.** The current destination is marked by more than colour. A centre action that is not a destination is never marked as the current tab. Bars and floating buttons never cover the last item in a list; see [layout.md](layout.md#bars-and-floating-actions).

Check: walk the flow there and back, on the capture or device, and note focus after each return. The capture manifest records which element has focus.

## Feedback

- A press shows a pressed state within about 100 ms. On React Native, `Pressable` with a pressed style, or an opacity or scale change.
- A save, send or delete confirms what actually happened, where the person is looking, without covering the next action. A floating toast over the screen's only button is a defect. A status line or an inline confirmation is usually better on a short screen.
- Never confirm something that did not happen. "Saved" means it is stored; "Saved on this phone" when it is not synced yet.

## Keyboard and forms

### Keep the focused field and the action visible

- When the keyboard opens, the field being typed in stays visible, and so does the way to submit. On a short form, a fixed footer button that rides above the keyboard is fine; on a long one, make sure the content above it scrolls.
- React Native: wrap the form in a `ScrollView` with `keyboardShouldPersistTaps="handled"` (so tapping Save does not just dismiss the keyboard), inside `KeyboardAvoidingView` (`behavior="padding"` on iOS) or use a keyboard library such as `react-native-keyboard-controller`. On Android, check the app's `windowSoftInputMode` and edge-to-edge settings, because together they decide whether the window resizes.
- Web: the visual viewport shrinks when the keyboard opens. Fixed footers and `100vh` layouts behave differently across browsers; `100dvh` and the `interactive-widget` viewport setting help.

Check: on native, focus each field of the flow on a small phone and look. In a browser, the capture script's `keyboard` states shrink the viewport by a typical keyboard height and scroll the focused field into view. That is a proxy for a resizing layout, not native keyboard behaviour.

### The right keyboard and return key

| What it is | React Native | Web |
| --- | --- | --- |
| A person's name | `autoCapitalize="words"`, `autoCorrect={false}`, no `textContentType="name"` unless it is the user's own name | `autocapitalize="words"`, `autocorrect="off"`, `spellcheck="false"` |
| A handle or username | `autoCapitalize="none"`, `autoCorrect={false}` | `autocapitalize="none"`, `autocorrect="off"`, `spellcheck="false"` |
| Phone | `keyboardType="phone-pad"` or `inputMode="tel"` | `type="tel"` |
| Email | `keyboardType="email-address"`, `autoCapitalize="none"` | `type="email"` |
| Place name | `autoCapitalize="words"` | `autocapitalize="words"` |
| Free text | multiline, return inserts a newline | `textarea` |

- **Return moves forward** through a multi-field form (`returnKeyType="next"` / `enterkeyhint="next"`, focusing the next field in `onSubmitEditing`) and finishes on the last (`"done"`). It should not submit a half-filled form unless the form is a single field. Keep the keyboard open between fields; in React Native that is `submitBehavior="submit"` (formerly `blurOnSubmit={false}`).
- Autofill: someone else's details are not the user's own, so turn off contact autofill for them (`autoComplete="off"`, no `textContentType` for the user's name, phone or email).

Check: the attributes or props on each field, and on a device, the keyboard that appears and where return goes.

### Never lose what was typed

- Navigating away and back, a validation error, a permission prompt, rotating the device and a failed save all keep the entered values.
- Errors say what to fix, next to the field, and keep focus there. A required field is marked before submitting, not only after.
- Optional fields are visibly optional. Asking for less is usually the improvement.

Check: type, leave, come back; trigger the error; deny the permission. Compare the values before and after.

### Dismissal

- Tapping outside a field or scrolling dismisses the keyboard where that is the platform norm (`keyboardDismissMode="on-drag"` on a scroll view).
- A sheet or modal with a form follows the same rules as a screen with a form: back and swipe-to-dismiss either keep the draft or ask.
