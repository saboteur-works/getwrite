# Task 30: device runs

Run by the lead with the owner on 2026-11-14 (about 01:20 to 01:45 local), from the main checkout outside the command sandbox. The owner did the taps on the device. The lead read the page over the WebView devtools socket (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`) and took screenshots with `adb exec-out screencap -p`.

## Build and device

- **Build:** commit `36a8bea7` on `feat/folklore-variants`, `pnpm build:native`, `pnpm sync`, `./gradlew :app:assembleDebug`. The debug APK was built 2026-11-14T00:39:12Z and installed with `adb install -r` over wireless debugging.
- **Device:** Pixel 7 Pro, Android 17, Android System WebView 157.0.8103.50.
- **Project:** a throwaway project, "F110 test", made on the device for this run. The owner set it up as the handbook describes: Narratives switched on in Project Settings > Modules; the subtypes Narrative and Variant; a Teller text field and a Motifs multiselect, both limited to Variant; one Narrative folder holding three Variant Sources (S1, S2, S3) with short text ("Text A" and so on).

## Observed

| Check | Portrait | Landscape |
|---|---|---|
| CSS window (width × height, device pixel ratio 2.625) | 411 × 826 | 850 × 359 |
| Narratives tab present and selectable | yes | yes |
| Narrative picker | "Narratives (3 variants)" | same |
| List | S1, S2, S3, each with a tick box, Open, Teller and Motifs values; S3 shows two tags (`M1 \| Death`, `M2 \| Rebirth`) | same |
| Phone message | shown ("Side-by-side comparison needs a wider screen. You can still open each variant from the list."), with or without ticks (owner: "a warning on portrait") | not shown |
| Compare control after ticking S1 and S3 | not shown | shown (owner) |
| Comparison after Compare | — | "Comparing 2 variants" heading, Back to list, columns S1 and S3, each with Teller, Motifs and its text |
| Text width per column | — | 359 px (bar: 240 px) |
| Comparison region client / scroll width | — | 761 / 761 (no sideways scroll) |
| Page sideways scroll (scrollWidth / clientWidth) | 411 / 411 | 850 / 850 |

The viewport tier was read as the phone layout at 411 px and the wide layout at 850 px from what rendered: the phone message at 411, the Compare control and columns at 850. The tier value itself was not read from the store.

Reported by the owner as working ("All steps worked as expected"), after which the lead read the page state:

- **Back to list, then Open on S1:** opened S1 in the editor with its text.
- **Remembered selection:** S1 and S3 were still ticked on return to the tab. The lead read ticks `[true, false, true]`, and the `localStorage` key `getwrite-folklore-selection:<project id>` held the narrative id and the two variant ids.
- **Module switch:** with Enable Narratives off, the Narratives tab disappeared; switched back on, it came back. Afterward the lead read the tab row with Narratives present.
- **Tagging a variant:** the owner gave the variants Motifs values on the device during set-up, and the list and the comparison showed them (above).

## Also observed

- In portrait, the tick boxes show although comparing isn't possible at that width.
- In landscape, the window is 359 CSS px tall. The app header, the tab row and the picker take part of that, so the columns get little height, and the "Narratives" heading had scrolled out of view when the comparison was shown. No height bar was set before the run, so this is recorded as observed, not judged.
- The texts were a few words each. Scrolling inside a column on touch was not exercised.

## Not verified

- A paired device (home-network sharing from desktop to a phone or browser): not run.
- Any Android device other than the Pixel 7 Pro, and a tablet or foldable width on Android.
- An unreadable variant (no way to make one on the device was tried).
- An audio-only variant and its player, and a file over the Android limit.
- A locked or encrypted-marked project.
- A screen reader (TalkBack).
- A large narrative or long texts on the device, and touch scrolling inside a column.
- A comparison of three columns on the device (the limit is 3; only 2 were compared).
- Electron.
