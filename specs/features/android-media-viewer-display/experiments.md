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
- Tasks 11 to 14 runs (2026-11-09): same device and WebView; debug install built from branch tip `2da96e2d` (`pnpm build:native`), `adb` over Wi-Fi, screen kept on (`svc power stayon true`). Each run starts from force-stop plus a fresh launch unless stated.

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
- Re-check for the new modules (2026-11-09): in the build from `2da96e2d` (`pnpm build:native`), `NEXT_PUBLIC_GETWRITE_RUNTIME` occurs 0 times under `frontend/out/_next/static`.

## FR-6 viewer runs

Task 11, 2026-11-09, build `2da96e2d`, Pixel 7 Pro. Passed.

- Image resource "Lighthouse photo" (640x400 PNG): displays in the viewer from a `blob:` URL; naturalWidth 640.
- Audio resource "F105 small audio" (512,000-byte WAV, created on the device): plays from a `blob:` URL. Metadata ready 55 ms after the viewer opened; duration 5.8 s; playing (currentTime 1.45 s after 1.5 s, muted).
- Resource timing shows no request to `/api/resource`. 0 OutOfMemoryError lines; no crash.

## FR-7 threshold runs

Task 12, 2026-11-09, build `2da96e2d`. Passed; two runs each. Per run, opened in the viewer in this order:

- "T8b image-cap" (PNG, 31,457,280 bytes): displayed from a blob URL, 640 wide. Image ready 3,250 ms (run 1) and 3,264 ms (run 2) after the drawer closed.
- "T8b audio-cap" (WAV, 31,457,280 bytes): metadata ready at the first 50 ms poll after the drawer closed (51 ms in both runs; the read may have started while the drawer was closing). Duration 356.7 s; played from the midpoint (currentTime 179.8 s).
- 0 `/api/resource` requests; 0 OutOfMemoryError lines; no crash in either run.

## FR-3 refusal runs

Task 12, 2026-11-09, build `2da96e2d`. Two runs each.

- "F105 over image" and "F105 over audio": each created on the device at 31,457,280 bytes through Create Resource, then one byte appended to the stored file with `adb shell run-as ... printf x >>`, giving 31,457,281 bytes. Refused in 51 to 52 ms with "This file is 30.0 MB. It is too large to show on this device (limit 30 MB)."
- "T8 image-cap" (104,857,600-byte image resource created in Feature 104, before the 30 MB cap; the pre-Feature-104 case): refused in 51 ms with "This file is 100.0 MB. It is too large to show on this device (limit 30 MB)."
- 0 `/api/resource` requests; 0 OutOfMemoryError lines; no crash.
- Note: a file one byte over shows "30.0 MB ... (limit 30 MB)" because the size is rounded to one decimal.

## FR-4 read-failure observation

Observed in the Several-images run below: reads at or under the threshold that failed showed "This file cannot be shown." with no crash. See also the open defect under FR-9 drop runs.

## FR-8 embedded render runs

Task 13, 2026-11-09, build `2da96e2d`.

- Document "F105 baseline doc" containing "Lighthouse photo" (embedded at the Task 1 baseline): on opening, the embedded `<img>` renders from a `blob:` URL, naturalWidth 640; `data-resource-id` kept.
- After inserting a second image (see FR-10 picker runs), both rendered from blob URLs.

## FR-9 drop runs

Task 13, 2026-11-09, build `2da96e2d`. Touch drag-and-drop is not available on the device, so the drops were programmatic: a `DragEvent('drop')` with a `DataTransfer` holding a generated 31,457,280-byte PNG, dispatched on the editor element, three times (f105-drop-1, f105-drop-2, f105-drop-3 .png).

- Each drop uploaded a new image resource (three resource directories, each with `original.png` of 31,457,280 bytes) and inserted an image node. The saved document then held 5 image nodes, all with `/api/resource/...` `src` and no `blob:` string.
- The three new nodes were inserted at the top of the document, not at the drop coordinates.
- **Defect observed (open):** in the same session the three dropped nodes showed the "Loading..." placeholder. After scrolling them into view, one loaded (blob URL, 640 wide) and two stayed on "Loading..." for over 30 s (several minutes in total), with 0 OutOfMemoryError lines. That is an indefinite loading state, which FR-4 forbids. Returned to the owner.
- Cause: not established. Experiment that would settle it: instrument the node view's read and the cache acquire and release for a node inserted by drop after the document is open, and check whether the same happens for a small dropped image.

## FR-10 picker runs

Task 13, 2026-11-09, build `2da96e2d`. Passed.

- "Insert image" opens the picker. It is attached outside the masked menubar (the parent chain does not include `.editor-menubar`); box x 136, y 220, w 275, h 320 CSS px in a 411 px viewport (fully inside).
- Four entries. For every entry, `document.elementFromPoint` at the entry centre returns an element inside that entry.
- Thumbnails: "Lighthouse photo" and "T8b image-cap" show from blob URLs (640 wide). "T8 image-cap" (104,857,600 bytes) and "F105 over image" (31,457,281 bytes) show the placeholder "This file is 100.0 MB / 30.0 MB. It is too large to show on this device (limit 30 MB)." and stay listed. A device screenshot shows the picker on screen with these thumbnails and placeholders.
- A real touch tap (`adb shell input tap` at the "Insert T8b image-cap" centre) closed the picker and inserted the image, which rendered from a blob URL.
- The saved `content.tiptap.json` then held 2 image nodes whose `src` values are `/api/resource/<id>/file?projectId=...` and contained no `blob:` string (FR-14 on device).
- First-node-view device check (Task 6): the embedded images rendered from blob URLs in the runs above.

## Several-images run

Task 14, 2026-11-09, build `2da96e2d`. After a force-stop and fresh launch, "F105 baseline doc" was opened. It embeds 5 images on distinct resources: four of 31,457,280 bytes (T8b image-cap and the three dropped) and the 640x400 Lighthouse photo. After waiting 24 s, then scrolling to the end and waiting 12 s:

- Two images rendered from blob URLs; three showed "This file cannot be shown."; none stayed loading.
- logcat: 8 "Throwing OutOfMemoryError" lines (allocations: 41,943,052 x1, 83,886,092 x4, 83,886,096 x3 bytes). No FATAL EXCEPTION. The app process stayed up (PSS about 354 MB).
- So in this run, with several 30 MiB images in one document, reads after the first ones failed with allocation errors and were shown as messages. No "safe number" of images is claimed; no cause of which reads failed is stated.
- The picker listing several near-threshold images was not run as a separate several-images run (the FR-10 picker run held two at or under the threshold).

## Known limits

- Several near-threshold images in one document: some fail to load and show "This file cannot be shown." (measured in the Several-images run; owner decision pending on whether to accept or change).
- The refusal reads "30.0 MB ... (limit 30 MB)" for a file just over the limit.

## Not verified

Seed, to be completed by Task 16:

- Compile and export of images on Android.
- A paired-device run.
- A second device.
- Touch drag and drop (drops were programmatic).
- Video or any other media type.
- Any size above 31,457,280 bytes.
- Any embedded path not run.

## Acceptance

Pending Task 16.
