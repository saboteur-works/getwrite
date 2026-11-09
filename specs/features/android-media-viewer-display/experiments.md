# Experiments: Image and audio display on Android (Feature 105)

Measurements are recorded as observed values. A cause is written only after an experiment has separated it from the alternatives. A hypothesis is labelled as one and names the experiment that would settle it.

## Environment

- Task 1, run by the lead with the owner on 2026-11-09.
- Device: Pixel 7 Pro, Android 17, Android System WebView 156.0.8078.47.
- Installed build: debug install from branch `fix/android-large-media-writes` at `d613f043`, built 2026-11-08 20:19. Product code is identical to this branch's base: `git diff --stat d613f043 HEAD -- frontend electron cli android` shows only `frontend/CLAUDE.md`.
- Commands, from the main checkout, outside the command sandbox: `pnpm build:native` (in `frontend/`), `cap sync android`, `gradlew :app:installDebug` (in `android/android/`) with `JAVA_HOME` set to Android Studio's JBR.
- Driving: Chrome DevTools over an `adb` forward to `webview_devtools_remote_<pid>`, Playwright `connectOverCDP`.
- `adb` ran over Wi-Fi (`adb tcpip 5555`, `adb connect 192.168.4.35:5555`) because the USB link reconnected repeatedly mid-run (the adb transport id kept climbing and the forward was lost). The screen was kept on with `adb shell svc power stayon usb`.
- Project: "F103 device check".

## FR-1 baseline

Observed on 2026-11-09 with the build in Environment. No cause is stated for any item.

1. Image resource "Lighthouse photo" (640x400 PNG, id `8d42e675-...`): the viewer shows "Unable to load image."; no `<img>` remains in the viewer. Resource timing shows a request to `https://localhost/api/resource/8d42e675-.../file?projectId=169a7d52-...` with responseStatus 200 and initiator `img`.
2. Audio resource "T8 audio-cap" (the 104,857,600-byte WAV `original.wav` of resource `27f35e57-...`, created in Feature 104 Task 8): the viewer shows "Unable to load audio.". The `<audio>` element has src `/api/resource/27f35e57-.../file?projectId=...`, readyState 0 and `error.code` 4 (MEDIA_ERR_SRC_NOT_SUPPORTED). Resource timing shows responseStatus 0 and initiator `audio`.
3. Image picker (editor toolbar "Insert image", in a new text document "F105 baseline doc"):
   - The picker DOM (`.editor-image-picker`, role menu "Image picker", position fixed, z-index 50, rect x 219, y 220, w 255, h 107 CSS px; viewport width 411) lists three entries: "Insert Lighthouse photo", "Insert T8 image-cap", "Insert T8b image-cap". Each thumbnail `<img>` has src `/api/resource/<id>/file?projectId=...`, `complete` true and `naturalWidth` 0.
   - A device screenshot (`adb exec-out screencap`) taken with the picker open in the DOM shows no picker on screen.
   - `document.elementFromPoint` at the centre of the first entry returns the editor's empty paragraph (`P.is-empty.is-editor-empty`). Playwright's click reported that paragraph intercepting pointer events.
   - A real touch tap (`adb shell input tap`) at the first entry's centre closed the picker and inserted nothing; the image count in the document was unchanged.
   - The third entry's centre is at x 426.7 CSS px, beyond the 411 px viewport.
   - Hypothesis (NOT established): the picker is a fixed-position descendant of `.editor-menubar`, which has a phone/tablet-only `mask-image` fade (`frontend/styles/getwrite-utilities.css`, ADR-021 Phase 3) that may clip or cover it. The experiment that would settle it: disable that mask on the device (or move the picker out of the masked element) and re-check visibility and a real tap.
4. Embedded image: inserting "Lighthouse photo" with a programmatic `element.click()` on the picker entry inserted an image node. In the document the `<img>` has src `/api/resource/8d42e675-.../file?projectId=...`, `data-resource-id` `8d42e675-...`, `complete` true and `naturalWidth` 0; the screenshot shows a broken-image icon. The saved `content.tiptap.json` stores `"type":"image","attrs":{"src":"/api/resource/8d42e675-14e1-4082-821a-6859a48e6b3c/file?projectId=169a7d52-a436-400d-abb4-d8bbd562ee5f","alt":null,"title":null,"width":null,"height":null,"resourceId":"8d42e675-14e1-4082-821a-6859a48e6b3c"}`. This confirms the Gate 3 OQ-4 reading: the stored src is the web URL plus `resourceId`.
5. Drop path: not run at baseline. No touch drag-and-drop source was attempted on the device.

## Runtime inlining confirmation

- READ: `frontend/src/store/transport/create-transport.ts:49` compares `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` directly. `media-validation.ts:21` uses `resolveRuntime()` (`runtime.ts:23-24`, the same comparison).
- MEASURED: in the current native build output (`frontend/out`, built 2026-11-08 20:19), the string `NEXT_PUBLIC_GETWRITE_RUNTIME` occurs 0 times under `frontend/out/_next/static`. Every reference in the existing modules was replaced at build time.
- Not yet checked: the modules Tasks 2 to 8 add (`resource-bytes.ts`, the node view, the picker changes) do not exist yet. Their inlining is re-checked on the first native build that contains them: the same 0-occurrence grep, recorded for Task 11's build.

## FR-6 viewer runs

Pending Task 11.

## FR-7 threshold runs

Pending Task 12.

## FR-3 refusal runs

Pending Task 12.

## FR-4 read-failure observation

Pending Task 12.

## FR-8 embedded render runs

Pending Task 13.

## FR-9 drop runs

Pending Task 13.

## FR-10 picker runs

Pending Task 13.

## Several-images run

Pending Task 14.

## Known limits

None yet.

## Not verified

Seed, to be completed by Task 16:

- Compile and export of images on Android.
- A paired-device run.
- A second device.
- Touch drag and drop.
- Video or any other media type.
- Any size above 31,457,280 bytes.
- Any embedded path not run.

## Acceptance

Pending Task 16.
