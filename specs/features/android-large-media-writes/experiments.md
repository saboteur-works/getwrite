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

Not run. Both 100 MiB runs passed, so per FR-1 and OQ-8 the 30, 35, 40 and 45 MiB ladder was not needed. The Android cap stays 100 MiB (104,857,600 bytes).

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

Pending Task 8.

## FR-5 failure observation

Pending Task 8.

## FR-8 read check at the cap

Pending Task 9.

## Known limits

- OQ-4 (accepted at Gate 3): if the app is killed mid-write, a partial attachment file can be left on disk (an orphan). Accepted as a known limit, not handled.

## Not verified

- Encrypted projects on native: not bound on Android, so not exercised.
- Compile and export at large sizes (FR-8).
- Paired-device behaviour (Task 7).
- Per-path device checks at the cap and one size above (attachment replace, audio and image resource create): pending Task 8.
- Read and preview at the cap: pending Task 9.
- A 25 MiB single-write payload length log (FR-2): not run.
- The ladder sizes (30 to 45 MiB): not run.
- A second device (F104-2: Pixel 7 Pro only).

## Acceptance

From the runs above, as values a run passed:

- Piece size: 4 MiB (4,194,304 bytes). The chunked write passed at 104,857,600 bytes in two runs.
- Android cap: 104,857,600 bytes (100 MiB). No ladder size was run, because the 100 MiB runs passed.
- The 100 MiB runs went through the Source attachment add, which includes the whole-file `Buffer.from(input.fileBytes)` copy at `source-attachments-core.ts:284`. The runs did not isolate that copy. The replace copy (`:469`) and the resource copy (`resource-persistence.ts:188-191`) were not on this path; they are covered by Task 8.
