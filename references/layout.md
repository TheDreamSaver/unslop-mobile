# Layout on a phone

Prompts for the layout pass. A phone screen is narrow, interrupted at both edges, and shared with a keyboard, so layouts break at the edges and at the extremes of content rather than in the middle.

## Safe areas and edge-to-edge

- **Know the insets of the devices you check.** Typical portrait values:

  | Device class | Viewport | Top inset | Bottom inset |
  | --- | --- | --- | --- |
  | iPhone with a home button (SE) | 375 × 667 | 20 | 0 |
  | iPhone with a notch (12–14) | 390 × 844 | 47 | 34 |
  | iPhone with the Dynamic Island (15–16) | 393 × 852 | 59 | 34 |
  | Large iPhone (Plus, Pro Max) | 430 × 932 | 59 | 34 |
  | Android, gesture navigation | 360 × 800, 412 × 915 | about 24–32 | about 16–24 |

  Android values vary by device and navigation mode. Read the real insets instead of hard-coding them.
- **Edge-to-edge is the default now.** Android 15 draws apps behind the status and navigation bars when they target API 35, and recent Expo SDKs turn edge-to-edge on. iOS has always needed it. Backgrounds can run under the bars; text and controls cannot.
- **React Native:** use `react-native-safe-area-context` (`SafeAreaView` with explicit `edges`, or `useSafeAreaInsets()` for padding you compute). React Navigation's headers and tab bars already apply the insets; your own fixed footers, floating buttons and full-screen sheets must add them. Do not stack two safe-area wrappers.
- **Web:** `viewport-fit=cover` in the viewport tag, then `env(safe-area-inset-*)` on the bars. Without `viewport-fit=cover`, iOS Safari reports zero insets.

Check: capture with the device's insets (the capture script emulates them in Chromium) and look at the top and bottom bands. The manifest lists controls whose visible area falls inside an inset. On native, check one notched and one home-button device, in both orientations if the app rotates.

## Bars and floating actions

- **Nothing important sits under a bar.** The last item in a scrolling list can scroll fully above the tab bar, the home indicator and any floating button. In React Native, give the list's `contentContainerStyle` a bottom padding of the bar height plus the bottom inset (or use the tab bar height hook your navigator provides).
- **A floating action does not cover content the person needs**, including when the list is scrolled to the end. If it would, reserve space for it or put the action in the bar.
- **Transient messages (toasts, snackbars) do not cover actions.** Place them above the bottom bar, and where a screen has little content, prefer a confirmation inside the layout.
- **Sticky headers stay short.** On a small phone a tall fixed header and a fixed footer can leave a few lines for content. Let large headers scroll away or collapse.

Check: capture the end of each list and the states with a floating element visible. The manifest lists controls whose visible centre is covered by another element.

## Let content decide the height

- **No fixed heights for anything holding text.** Cards, rows, buttons and chips grow with their content; set a minimum height, not a height. In React Native, avoid `height` on containers of `Text`, and test with long values.
- **Wrap, don't clip, the things people identify by:** names, place names, titles. Truncate only summaries, and only where the full value is one tap away. `numberOfLines` (React Native) and line clamps are for previews, never for the only copy of something.
- **Prepare for long, multilingual and missing values.** Use the product's own fixture and add the hard cases: a long double-barrelled name with accents, a long place name, a multi-line note, an empty field, and an unknown value. Unknown values are shown as unknown, in a quieter style than saved data, so they cannot be mistaken for it.
- **Numbers and dates** take their full width. A date chip that fits "May" can clip "September".

Check: the capture script measures horizontal overflow and lists elements that clip their text (line clamps are reported separately as intentional).

## Small phones without shrinking

- The smallest common phones are about **360 dp wide** on Android and **375 pt** on iOS (the SE). 320 is a useful stress width, not a target.
- On a small phone, reflow before you shrink: two columns become one, labels wrap, chrome gets shorter, decorative space goes. Text sizes stay; a 13 pt label does not become 11.
- Check what is visible before the first scroll on the smallest phone. The task's first step should be there.
- Large phones are not a reason to spread out: keep line lengths readable and keep controls within reach of the thumb.

Check: capture the flow at a small phone and a large one, and the small one with larger text.

## Density and hierarchy

- Ask what a person needs to see on each screen of the flow to do the task, and whether that is the most prominent thing. Saved information before prompts to add more; the person's own words before system labels.
- A list on a phone is scanned, not read. Each row needs one strong anchor (usually a name or title) and at most a few supporting details in a consistent order.
- Repeated "not added" placeholders on every row are noise. Keep unknowns explicit but quiet, and consider whether a row needs to show a missing value at all.

## Orientation and larger screens

If the app supports landscape or tablets, check that the safe areas move to the sides, that sheets and keyboards still leave the focused field visible, and that line lengths stay readable. If it does not, lock orientation deliberately rather than by accident.
