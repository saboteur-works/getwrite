# Experiments: Android large-file writes (Feature 104)

Measurements are recorded as observed values. A cause is written only after an experiment has separated it from the alternatives.

## Environment

- Task 1, run by the lead on 2026-11-08.
- Device: Pixel 7 Pro, Android 17, Android System WebView 156. Same device as the Feature 103 baseline (`specs/features/sources-module-seam/experiments.md`, "Wave 2 Android 100 MB baseline").
- Branch `fix/android-large-media-writes` at `938253f7`, plus an uncommitted, throwaway experiment patch to `frontend/src/lib/models/capacitorFsAdapter.ts`, `writeFile`.
- Commands, from the main checkout, outside the command sandbox: `pnpm build:native` (in `frontend/`), `cap sync` (in `android/`), `gradlew :app:installDebug` (in `android/android/`). Debug install.
- The patch: a buffer larger than one piece was written as a first `Filesystem.writeFile` of the first piece, then one `Filesystem.appendFile` per further piece. Each piece was base64-encoded on its own. Piece size 4 MiB (4,194,304 bytes), so the largest base64 string per bridge call is 5,592,408 characters. A buffer at or under one piece used the single `writeFile`, as before. The patch logged one `[F104]` console line per chunked write.
- The patch was reverted after the runs and never committed. It is kept only in a local git stash.
- Path exercised: Source attachment add, from the Sources view of project "F103 device check", Source "Keeper tape". The file was a generated 16-bit mono 44.1 kHz WAV (440 Hz tone) of exactly 104,857,600 bytes, handed to the "Add attachment file" input.
- Pass criterion (FR-1): the file is stored at its exact byte length and the app does not crash.

## FR-2 25 MiB payload length

Not run. No `Filesystem.writeFile` payload length was logged for a 25 MiB single write. The single-call payload sizes are arithmetic only: base64 of n bytes is 4 x ceil(n/3) characters.

## FR-1 chunked-write runs

Piece size 4 MiB (4,194,304 bytes). Build and device as in Environment.

| Run | Bytes | Pieces | Write duration (from `[F104]` log, funnel only) | Stored size | MD5 matches generated file | Crash or OutOfMemoryError |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 104,857,600 | 25 | 13,927 ms | 104,857,600 | yes (77686a95c60724b1d255e5b4979a8888) | none; app process still running |
| 2 (after force-stop and fresh launch) | 104,857,600 | 25 | 11,733 ms | 104,857,600 | yes (same hash) | none; app process still running |

Run 1 end to end (file handed to the input until listed in the panel): 14,504 ms. Run 2's end-to-end time was not measured: the harness's "listed" check matched run 1's same-named row and returned early. The write itself completed and was verified on disk.

Result: the chunked write passed at 104,857,600 bytes, in both runs.

The previous unchunked baseline (Feature 103 experiments) crashed at 50 MiB and 100 MiB with OutOfMemoryError. This experiment does not establish why the single call failed. It shows only that the 4 MiB chunked form stored 100 MiB twice.

## FR-1 ladder runs

Not run at first: both 100 MiB chunked-write runs passed, so the ladder was not needed for the write. After the FR-8 read check failed at 104,857,600 bytes (see "FR-8 read check at the cap"), the owner chose on 2026-11-08 to lower the cap by running the FR-1 ladder through write and read (OQ-5). The ladder was run ascending and stopped at the first failure, 45 MiB (47,185,920 bytes) was not run.

Pixel 7 Pro, Android 17, WebView 156, build `8053699d`. Each run = force-stop and a fresh launch, add a WAV attachment and a PNG attachment of the size to Source "Keeper tape", then Preview each (audio: wait for metadata, then play muted from the midpoint; image: wait for the 640x400 image to display). Stored sizes were confirmed from the Source sidecar (`size` per attachment) and `ls -l`. Every write in the ladder stored the exact byte length.

| Size | Run | WAV add (ms) | WAV read | PNG add (ms) | PNG read | "Throwing OutOfMemoryError" lines in logcat | Crash |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 30 MiB (31,457,280) | 1 | 4,551 | ready 3,650 ms, duration 356.66 s, playing at 179.8 s | 4,551 | displayed 640x400 in 3,617 ms | 0 | none |
| 30 MiB | 2 | 4,452 | ready 3,750 ms, same duration, playing | 4,801 | displayed in 3,642 ms | 0 | none |
| 35 MiB (36,700,160) | 1 | 5,650 | ready 6,900 ms, duration 416.1 s, playing at 209.5 s | 5,358 | displayed in 5,572 ms | 2 | none |
| 35 MiB | 2 | 5,601 | ready 6,851 ms, playing | 5,663 | displayed in 4,245 ms | 1 | none |
| 40 MiB (41,943,040) | 1 | 5,655 (stored 41,943,040) | FAILED after 1,603 ms: "Error: Couldn't load the attachment. 'readFile' failed with: Failed to allocate a 55924072 byte allocation with 54067984 free bytes and 51MB until OOM, target footprint 268435456, growth limit 268435456" | stored 41,943,040 (its add-message check was confounded by the error alert still on screen; the sidecar shows it stored) | not cleanly measured (same alert on screen) | 4 | none |

Result: both 30 MiB runs and both 35 MiB runs passed write and read. The first 40 MiB run failed the audio read. The ladder stopped there; 40 MiB run 2 and 45 MiB were not run.

Owner decision (2026-11-08, after the ladder): the Android cap is 31,457,280 bytes (30 MiB), not 35 MiB. By the OQ-8 rule as written (last size passing both runs) the cap would be 36,700,160 (35 MiB). The owner chose 30 MiB because the 35 MiB reads logged OutOfMemoryError warnings while succeeding and took about 6.9 s to ready the audio versus about 3.6 s at 30 MiB; the 30 MiB runs logged none. The cap is temporary, pending an investigation of read memory (POS task_bdf70699, note note_a1951f3d). The write path is verified at 100 MiB; the read path is what limits the cap. This experiment does not establish why the read fails at 40 MiB.

## Confirmations

### (a) The native build inlines the runtime

- `resolveRuntime()` (`frontend/src/store/transport/runtime.ts:23`) reads `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`.
- `frontend/scripts/build-native-static.mjs:176` sets `NEXT_PUBLIC_GETWRITE_RUNTIME: "native"` for the native build.
- After `build:native`, the string `NEXT_PUBLIC_GETWRITE_RUNTIME` occurs 0 times under `frontend/out/_next/static`. The reference was replaced at build time.
- On the device, the `[F104]` lines come from the Capacitor adapter, so the native backend ran.

### (b) Size check against read order

- Source attachment add and replace (native): `native-source-attachments-backend.ts`, `toInput` (line 18, called at :41 and :46), calls `file.arrayBuffer()` before `addAttachmentCore` or `replaceAttachmentCore` validate size. The panel's file inputs (`components/Sources/SourceAttachmentsPanel.tsx`: the add input, and the per-row Replace input at :119) do not check size before calling `addAttachment` or `replaceAttachment`. An oversized attachment is read fully into memory before it is refused.
- Media resource create: the Create Resource dialog (`components/ResourceTree/CreateResourceModal.tsx`) does not check size. `app/(app)/page.tsx`, `handleMediaCreate`, calls `uploadMediaResource` (`frontend/src/lib/api/resources.ts:509`), which calls `file.arrayBuffer()` at :515 for every runtime before the transport. Size is validated afterwards in `resource-crud-core.ts` (`validateMediaFile`, about :263). The read-before-check on resource upload is in the shared API client, not in a native-only backend.
- Editor drop: `components/Editor/Extensions/MediaDropExtension.ts:45` calls `validateMediaFile` before `uploadMediaResource`. It checks first.
- For Task 6: the attachment backend and the resource upload path both read before checking. The editor drop path does not.

### (c) Trash restore is a rename on the device

- Removed the second 100 MiB attachment (status: "Removed keeper-100mib.wav. Restore it from the Trash tab."). The file moved to `.trash/attachments/<id>/attachment-52b846f7-....wav`, inode 1719946.
- Restored it from the Trash tab (confirm dialog "Restore 1 item from Trash?"; result "1 of 1 restored."). It was renamed to "keeper-100mib.wav (restored)" because a same-named attachment existed. The file returned to `resources/cfd2971d-.../attachment-52b846f7-....wav` with the same inode 1719946 and size 104,857,600.
- Logcat during the restore: Filesystem calls rename x16, writeFile x14, readFile, stat, readdir, mkdir, deleteFile x2, rmdir x2. No `[F104]` line (no writeFile above 1 MiB) and no OutOfMemoryError.
- Restore moved the bytes by rename and sent none of them through the bridge.

## FR-4 per-path runs

Task 8, run by the lead on 2026-11-08. Pixel 7 Pro, Android 17, WebView 156. Debug install built from branch `fix/android-large-media-writes` at commit `8053699d` (Tasks 2 to 7 landed, no experiment patch) with `pnpm build:native`, `cap sync android`, `gradlew :app:installDebug`. After the build, the string `NEXT_PUBLIC_GETWRITE_RUNTIME` occurs 0 times under `frontend/out/_next/static`.

Project "F103 device check". Cap = 104,857,600 bytes; "over" = 104,857,601 bytes. Files were generated in the page (16-bit mono WAV; PNG = a 640x400 canvas PNG padded with a private ancillary chunk with a valid CRC to the exact size) and handed to the file input. Stored sizes were read with `adb shell run-as ... ls -l`. Leftovers were checked by listing the resource directories and the Source's sidecar before and after. No crash and no FATAL EXCEPTION in logcat for any Task 8 run; the app process stayed up.

Result: every run at the cap passed; every run one byte over was refused.

| Path | Size | Result | Duration | Stored byte length | Left behind |
| --- | --- | --- | --- | --- | --- |
| Attachment add (Source "Keeper tape") | 104,857,600 | "Added t8-add-cap.wav." | 14,400 ms (input to message) | 104,857,600 | none |
| Attachment add | 104,857,601 | refused, message shown "Error: File exceeds the 100 MB limit." | 51 ms | none | no new attachment file, no sidecar entry |
| Attachment replace (replacing keeper-25mib.wav) | 104,857,600 | "Replaced keeper-25mib.wav with t8-rep-cap.wav. The old file is in Trash." | 14,858 ms | 104,857,600; the old 26,214,400-byte file is in `.trash/attachments/` | none |
| Attachment replace (replacing tiny.png) | 104,857,601 | refused, "Error: File exceeds the 100 MB limit." | 50 ms | none | tiny.png unchanged at 208 bytes, sidecar unchanged |
| Audio resource create (Create Resource dialog) | 104,857,600 | dialog closed, toast "Resource created T8 audio-cap" | 13,808 ms (Create click to dialog closed) | `original.wav` 104,857,600 | none |
| Audio resource create | 104,857,601 | refused in the dialog: "File exceeds the 100 MB limit." | 101 ms | none | no new resource directory, no orphan sidecar |
| Image resource create | 104,857,600 | dialog closed, "Resource created T8 image-cap" | 15,305 ms | `original.png` 104,857,600 | none |
| Image resource create | 104,857,601 | refused in the dialog: "File exceeds the 100 MB limit." | 242 ms | none | no new resource directory, no orphan sidecar |

Notes:

- The attachment panel shows the refusal prefixed with "Error: ". The Create Resource dialog shows it without the prefix.
- The previously opened media views show "Unable to load audio." and "Unable to load image.". This is the known pre-existing media-viewer issue (the media viewer requests `/api/resource/<id>/file`, which the native build lacks; POS task_fed2906c). It is not part of this feature.
- An earlier audio-create attempt at the cap (resource 27f35e57-...) also stored `original.wav` at 104,857,600 bytes. Its duration was not captured (the harness lost the adb USB connection twice and then timed out on a selector), so it is not counted as a timed run.

### Trash restore of large items

Run once, with large trashed items. The Task 1 trace found a rename; this run measured it.

- Trashed the attachment t8-add-cap.wav (inode 1784556), the audio resource "T8 audio-cap" 27f35e57-... (`original.wav`, inode 1599605), and the older replaced keeper-25mib.wav.
- "Restore selected" for all three: "3 of 3 restored." in 1,127 ms (confirm click to message).
- Both large files returned to their resource directories at 104,857,600 bytes with the same inodes (1784556, 1599605).
- Restore of a large attachment and of a large media resource on this device was measured as a rename (same inode), consistent with the Task 1 trace.
- Logcat during the restore: Filesystem rename x46, writeFile x40 and others. This build has no per-write size log, so the evidence that no file bytes crossed the bridge is the unchanged inode, not the log.

## FR-5 failure observation

The observed failure of a write that cannot complete is the refusal above the cap. At 104,857,601 bytes each of the four write paths refused before writing (50 to 242 ms) with "File exceeds the 100 MB limit." (attachment panel: "Error: File exceeds the 100 MB limit."). The app stayed up, and no file, sidecar entry or resource directory was left.

A failure mid-funnel (a piece failing after writing has started) was not produced on the device. It is covered only by the Task 3 and Task 4 unit tests with a failing fake plugin.

## FR-8 read check at the cap

Task 9, run by the lead on 2026-11-08. Same device and build as Task 8. Result: the read failed at the cap.

- Added an image attachment t9-image-cap.png of 104,857,600 bytes: "Added t9-image-cap.png." in 16,451 ms. The write passed.
- Audio attachment playback, t8-add-cap.wav (104,857,600 bytes): Preview showed "Error: Couldn't load the attachment. 'readFile' failed with: Failed to allocate a 279620288 byte allocation with 19157696 free bytes and 18MB until OOM, target footprint 268435456, growth limit 268435456". No audio element became ready. The app did not crash (the process stayed up).
- Image attachment preview, t9-image-cap.png (104,857,600 bytes), run alone after force-stop and a fresh launch: the same error text ("Failed to allocate a 279620288 byte allocation with 19125568 free bytes ... growth limit 268435456"), shown 11,051 ms after clicking Preview. No image was displayed. The app did not crash. Logcat for that run shows three `Throwing OutOfMemoryError` warnings from the app process: allocations of 139,810,148, 279,620,284 and 279,620,288 bytes, with growth limit 268,435,456.
- Earlier record (`specs/features/sources-module-seam/experiments.md`): preview and playback of a 25 MiB attachment worked on this device.

The read fails at a size the write accepts. This experiment does not establish why the allocation is the size it is.

Per OQ-5 (owner, Gate 3), the cap may not be stated above a size where both write and read were verified. The cap drops to a read-passing size only after that size is itself run through write and read and passes. A read-path change (`readFileInChunks`, plugin 8.1.2) is not made here and returns to the owner as new scope. Task 9 is returned to the owner on 2026-11-08. No cap change has been made.

Re-run at the lowered cap (2026-11-08): the owner chose to run the FR-1 ladder through write and read. The read check passed at 31,457,280 bytes for audio playback and for image preview, in both runs (see "FR-1 ladder runs", 30 MiB rows: audio ready 3,650 ms and 3,750 ms, duration 356.66 s, playing from the midpoint; image displayed 640x400 in 3,617 ms and 3,642 ms; no `Throwing OutOfMemoryError` line; no crash). This satisfies Task 9 at the new cap. The read check failed at 104,857,600 bytes and at 41,943,040 bytes (audio, 40 MiB run 1).

## Known limits

- OQ-4 (accepted at Gate 3): if the app is killed mid-write, a partial attachment file can be left on disk (an orphan). Accepted as a known limit, not handled.

## Not verified

- Encrypted projects on native: not bound on Android, so not exercised.
- Compile and export at large sizes (FR-8).
- Paired-device behaviour (Task 7).
- A mid-write piece failure on the device (FR-5): not produced; covered only by unit tests with a failing fake plugin.
- Playback and preview between 25 MiB and 100 MiB beyond the ladder sizes: not run. Preview worked at 25 MiB, 30 MiB and 35 MiB and failed at 40 MiB (audio) and 104,857,600 bytes.
- A 25 MiB single-write payload length log (FR-2): not run.
- 45 MiB (47,185,920 bytes): not run; the ladder stopped at the first failure (40 MiB run 1). 40 MiB run 2 was not run.
- Read between 30 MiB and 35 MiB beyond the two runs at each of those two sizes: not run.
- The per-path checks (FR-4) at 31,457,280 bytes and at 31,457,281 bytes: pending a re-run of Task 8 (the recorded FR-4 runs are at 104,857,600 and 104,857,601 bytes).
- A second device (F104-2: Pixel 7 Pro only).

## Acceptance

From the runs above, as values a run passed:

- Piece size: 4 MiB (4,194,304 bytes). The chunked write passed at 104,857,600 bytes in two runs.
- Android cap: 31,457,280 bytes (30 MiB), temporary, an owner decision of 2026-11-08 with the reason recorded under "FR-1 ladder runs"; write and read were verified at that size twice, on a Pixel 7 Pro only. Writes passed at 104,857,600 bytes on all four paths, but preview and playback failed at that size. The per-path checks (FR-4) at the new cap and one byte above are pending a re-run of Task 8; the FR-4 table above is at 104,857,600 and 104,857,601 bytes.
- The 100 MiB runs went through the Source attachment add, which includes the whole-file `Buffer.from(input.fileBytes)` copy at `source-attachments-core.ts:284`. The runs did not isolate that copy. Task 8 then ran attachment replace (`:469`) and audio and image resource create (`resource-persistence.ts:188-191`) at 104,857,600 bytes; each passed.
