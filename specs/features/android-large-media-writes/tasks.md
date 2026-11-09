# Tasks: Large media files on Android are added without crashing the app, up to a cap a device run verified (Feature 104)

Source spec: `specs/features/android-large-media-writes.md` (FR-1..FR-14, US-1; OQ-1 to OQ-12 resolved at Gate 3, 2026-11-08, none open). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 104. Branch: `fix/android-large-media-writes`; one PR. Measurements: `specs/features/android-large-media-writes/experiments.md` (created by Task 1).

Shape of the work:
- Task 1 (LEAD-RUN, owner on the Pixel 7 Pro) is the FR-1 experiment and comes first. It needs a chunked funnel to test, and FR-1 forbids a funnel change before the result is recorded. Staging decision: Task 1 runs the experiment on a throwaway, uncommitted local patch to `capacitorFsAdapter.writeFile` (a piece-size constant, `writeFile` of the first piece then `appendFile` per piece, and a payload-length log), made in the main checkout by the lead and reverted by a single-path restore before Task 2. Nothing from that patch is committed. The real, tested funnel is Task 2 and uses the piece size and cap that Task 1 recorded. No orchestrator task runs a device.
- Tasks 2 to 7 are orchestrator-runnable, test-first, and need Task 1's recorded piece size or cap value: the funnel (2), its failure cleanup (3), create-path cleanup and core-level failure tests (4), the cap resolver (5), size check before read (6), the FR-9 unchanged-behaviour pins (7).
- Tasks 8 and 9 (LEAD-RUN, owner on the Pixel): per-path device checks, then the read check at the cap.
- Task 10: documentation updates FR-7 and FR-13 require (the scribe writes the prose; the task lists the files and facts).
- Task 11 (LEAD-RUN): final suites exactly as CI runs them.

Compact dependency graph (`a -> b` means b depends on a):
- 1 -> 2 -> 3 -> 4; 1 -> 5 -> 6; 5 -> 7; 2, 3, 4, 5, 6 -> 8 (the edges from 2, 3, 4, 6 into 8 are transitive through the fields below and listed in Notes where the field cannot hold them) -> 9 -> 10 -> 11; 4, 6, 7 -> 11.
- Task 7 has no device dependency and may run at any time after Task 5.

Parallel groups the orchestrator may run: after Task 1: {2, 5}; after 2: {3}; after 3: {4}; after 5: {6, 7}. Tasks 2, 3 and 4 are serial (shared hot file `capacitorFsAdapter.ts`, then `resource-crud-core.ts`). Tasks 5 and 6 are serial (6 reads the resolver).

Hot files and the only tasks allowed to edit them:
- `frontend/src/lib/models/storage/capacitorFsAdapter.ts` (path located by the task) : Task 2, then Task 3.
- `frontend/src/lib/models/media-validation.ts`: Task 5 only.
- `frontend/src/lib/models/resource-crud-core.ts`, `resource-persistence.ts`: Task 4 only.
- `frontend/src/store/transport/native-source-attachments-backend.ts` and the native resource-upload backend: Task 6 only.
- `specs/features/android-large-media-writes/experiments.md`: created by Task 1 with fixed headings (Environment, FR-2 25 MiB payload length, FR-1 chunked-write runs, FR-1 ladder runs, Confirmations (runtime inlining, picker size checks, Trash restore trace), FR-4 per-path runs, FR-5 failure observation, FR-8 read check, Known limits, Not verified, Acceptance) so later tasks append to different sections.

**Builds and devices:** `next build`, `pnpm build:native`, `pnpm test:e2e`, `cap sync`, `gradlew :app:installDebug` and every `adb` command only run from the main checkout, outside the command sandbox, by the lead with the owner on the Pixel 7 Pro (`JAVA_HOME` = Android Studio's JBR). No orchestrator task runs them. Tasks that write an e2e spec check only that it typechecks and lints.

**Electron worker constraint:** every task whose Files include anything under `frontend/src/lib/models/`, `frontend/src/lib/core.ts`, `cli/` or `electron/` MUST also run `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`) and `pnpm --filter getwrite-cli typecheck`, and record each as run or not run. A bare frontend `tsc` is not accepted as evidence.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tests first (`docs/standards/testing.md`): add to an existing test file before creating one; code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions). Every catch added or touched follows `docs/standards/failure-visibility.md` (narrow catch; a failed write never returned as success or "empty"; a cleanup error never replaces the original error). Boundary and fail-closed rules follow `docs/standards/security.md` (no client-supplied path; cap checked before any lock or write). Read a component's source and stories before using any prop.
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run typecheck and lint on touched files. A suite not run is reported as not run, never as passing.
- Unit tests with the in-memory fake plugin prove chunking, ordering and cleanup; they are not evidence about memory. Only a device run is.
- Write no cause that no experiment separated. A statement in the spec marked READ is a reading until its test runs. A passing chunked write is recorded as "the chunked write passed at N bytes".
- Implementors do not commit and do not push; the orchestrator commits.

### Task 1: LEAD-RUN: the chunked-write experiment on the Pixel 7 Pro, and the three confirmations
**What:** Create the experiments file and, on a throwaway local patch, record the 25 MiB payload length, the 100 MiB chunked-write runs, and the ladder if needed, ending with the recorded piece size and Android cap, plus the readings the spec says the first task confirms.
**Files:** `specs/features/android-large-media-writes/experiments.md` (new); a throwaway uncommitted local patch to `frontend/src/lib/models/storage/capacitorFsAdapter.ts` (path located by the lead), reverted by a single-path restore before the task ends; reads `capacitor-filesystem-real.ts`, `native-source-attachments-backend.ts`, the native resource-upload backend, the file pickers, `trash.ts`, `store/transport/runtime.ts`
**Done when:** `experiments.md` exists with the headings listed above and an environment record (device, Android version, WebView version, build id, commands). "FR-2 25 MiB payload length" records the logged `Filesystem.writeFile` payload length of a 25 MiB add, before any chunking. "FR-1 chunked-write runs" records at least two runs at 104,857,600 bytes through `writeFile` of the first piece then `appendFile` per piece with 4 MiB pieces first, each as an observed value with build, device, size, piece size, run number, duration, stored byte length and crash or no crash; a run passes only if the file is stored at its exact length and the app does not crash; a pass is written "the chunked write passed at N bytes" with no cause. If either run fails, "FR-1 ladder runs" records 30, 35, 40 and 45 MiB (31,457,280, 36,700,160, 41,943,040, 47,185,920 bytes) run ascending, twice each, stopping at the first size that fails either run; the cap is the last size before it that passed both runs; sizes above a failure are never the cap; if no ladder size passes both runs the task stops and returns to the owner (no 25 MiB floor). If a 4 MiB piece fails at a size the spec would otherwise accept, any other piece size tried is recorded with its piece size on every run. "Acceptance" states the piece size and the Android cap in bytes, each as the value a run passed, and that the cores' `Buffer.from(input.fileBytes)` whole-file copy (`source-attachments-core.ts:284`, `:469`; `resource-persistence.ts:188-191`) is part of what the 100 MiB run tests. "Confirmations" records, as readings or observed builds: (a) the native build inlines `NEXT_PUBLIC_GETWRITE_RUNTIME` in `media-validation.ts` (observed in the built output or a native-build check), (b) whether the native resource-upload backend and the file pickers check size before reading the file, with file:line, (c) the Trash restore byte path trace (`trash.ts:2096-2109`, `:1027`, `:1042`, `:1007-1013`: a rename, no file bytes cross the bridge). "Known limits" records the OQ-4 orphan (a process kill mid-write can leave an unlisted file until the Source is deleted; no sweep). "Not verified" lists compile and export at large sizes, a paired-device run, a second device, and an encrypted project on Android (reading: `native-bootstrap.ts:60-83` binds plain `capacitorFsAdapter`; `isEncryptionAvailable`'s doc text claims native Android and does not match). The throwaway patch is reverted and `git status` shows no product file changed.
**Depends on:** none
**Estimate:** 8
**Notes:** LEAD-RUN, not for the orchestrator: `pnpm build:native`, `cap sync`, `gradlew :app:installDebug` with `JAVA_HOME` = Android Studio's JBR, `adb` outside the sandbox, main checkout, owner on the Pixel. Satisfies FR-1, FR-2, FR-10 (record), FR-12 (device procedure); settles OQ-1, OQ-2, OQ-8. No funnel, validation or message change is committed before this result is recorded. Task 1 may be judged complete only when a cap value exists; if none, it returns to the owner and Tasks 2 to 11 do not start. The restore path is single-path (hook-safe); do not use a whole-tree restore.
**POS:** none yet
**Done:** [x] 2026-11-08

### Task 2: Chunked write in `capacitorFsAdapter.writeFile`
**What:** Make the adapter's `writeFile` write a buffer larger than one piece as `fs.writeFile` of the first piece then `fs.appendFile` per remaining piece, using the piece size Task 1 recorded, and leave writes at or below one piece as exactly one `fs.writeFile`.
**Files:** `frontend/src/lib/models/storage/capacitorFsAdapter.ts` (path located by the task), the existing adapter test file under `frontend/tests/` and its in-memory fake plugin, `frontend/src/lib/models/storage/capacitor-filesystem-real.ts` (read only; `appendFile` already exists)
**Done when:** Tests first, then green, with the in-memory fake plugin: a buffer of exactly one piece and one smaller than a piece each produce exactly one `fs.writeFile` call and the same stored bytes as before; a buffer one byte over a piece produces one `writeFile` then one `appendFile`; a multi-piece buffer is stored byte-equal in order, with the last piece shorter than the others; the threshold is the piece size constant (a single constant, no second); `atomicWriteFile` text writes through the adapter store the same bytes as before (a characterization test run green on the unchanged code first); no call site in `source-attachments-core.ts` or `resource-crud-core.ts` is changed; the Node and object-store adapters are not edited. Electron and cli typecheck are run and recorded; `pnpm typecheck` and `pnpm lint` on touched files run.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-3 (funnel, threshold), OQ-10. Unit tests prove ordering and byte equality only, not memory. Task 3 edits the same file next.
**POS:** none yet
**Done:** [x] 2026-11-08

### Task 3: Adapter cleanup when a piece fails
**What:** Make the chunked `writeFile` best-effort delete its target when any piece fails, swallowing only the cleanup error and rethrowing the original.
**Files:** `frontend/src/lib/models/storage/capacitorFsAdapter.ts`, the existing adapter test file under `frontend/tests/` with a failing fake plugin
**Done when:** Tests first, then green, with a failing fake plugin that rejects at the first piece, a middle piece and the last piece: no file remains at the target in each case; the error thrown is the original piece error, with its message and type, not a cleanup error; a fake whose delete also fails still surfaces the original error and the cleanup error is swallowed in a narrow catch (not a bare catch, and not returned as success); a failure at the first piece of a multi-piece write does not delete a pre-existing unrelated file at another path; a single-piece write failure behaves as before. Electron and cli typecheck are run and recorded.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-5 (adapter cleanup), FR-11, OQ-3: delete-on-failure, not temporary-name-and-rename. A replace of an existing target by a failed chunked write deletes the target; the core's catch restores the previous attachment (Task 4 tests this). The OQ-4 orphan after a process kill is accepted, not handled here.
**POS:** none yet
**Done:** [x] 2026-11-08

### Task 4: Create-path cleanup and core-level failure tests for add, replace and create
**What:** Make `uploadMediaResourceCore` remove the run-created resource directory when `writeResourceToFile` throws, and add core-level tests that a failed write through a failing fake plugin leaves no file, sidecar entry or resource directory.
**Files:** `frontend/src/lib/models/resource-crud-core.ts` (about `:305`), `frontend/src/lib/models/resource-persistence.ts` (read; edit only if the test shows it is required), existing core test files under `frontend/tests/` for `source-attachments-core` and `resource-crud-core`
**Done when:** Tests first, then green, using the failing fake plugin from Task 3 at the first, a middle and the last piece, for each of add, replace and create: add leaves no attachment file and a sidecar with no new entry; replace restores the previous attachment (file bytes and sidecar entry equal to before); create leaves no resource directory from the failed write (the directory the run created, not a pre-existing one); the error raised is the original, not a cleanup error; a directory-removal failure in the create cleanup is swallowed narrowly and does not replace the original error; the add and replace `catch` blocks in `source-attachments-core.ts` are unchanged (diff shows no edit); a successful create is unchanged. Electron and cli typecheck are run and recorded.
**Depends on:** 3
**Estimate:** 3
**Notes:** Satisfies FR-5, FR-11, OQ-3. READ: `writeResourceToFile` writes the binary at `resource-persistence.ts:188-191` before the sidecar at `:195`, so a binary-write throw leaves a directory today. The cleanup removes only what this run created.
**POS:** none yet
**Done:** [ ]

### Task 5: Platform-aware cap resolver
**What:** Add a pure resolver beside `MAX_MEDIA_FILE_BYTES` that returns the Android cap on the native runtime and 104,857,600 otherwise, and make `validateMediaFile`, `validateAttachmentFile` and the refusal message read it.
**Files:** `frontend/src/lib/models/media-validation.ts`, the existing media-validation test file under `frontend/tests/`
**Done when:** Tests first, then green: with the runtime not native, the resolver returns 104,857,600 and `validateMediaFile` and `validateAttachmentFile` accept 104,857,600 bytes and refuse 104,857,601 with the same result object as today; with the runtime native (the `NEXT_PUBLIC_GETWRITE_RUNTIME` value stubbed as the existing runtime tests do), the resolver returns the Android cap in bytes recorded in Task 1 and the validators accept exactly that many bytes and refuse one more; the refusal message reads "File exceeds the N MB limit." with N the cap divided by 1,048,576 using the existing MiB arithmetic and the "MB" label, and is byte-identical to today's text for the non-native cap; `MAX_MEDIA_FILE_BYTES` is still exported and still 104,857,600; the cap is checked before any lock or write in the cores (an existing core test or one added shows a refusal creates no lock file); `resolveRuntime()` (`store/transport/runtime.ts:24`) is the only runtime detection used; the module imports no React and is reachable from `core.ts` as before. Electron and cli typecheck are run and recorded.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-6, OQ-6, OQ-11 (wording). Confirmation (a) of Task 1 records that the native build inlines the runtime variable in this shared module; if it does not, stop and return to the owner. The Android cap value is a single constant named in the file with a comment-free name that says it is the device-verified value; do not state any other size.
**POS:** none yet
**Done:** [x] 2026-11-08

### Task 6: Refuse an oversized file before reading it into memory
**What:** Move the size check before `await file.arrayBuffer()` in the native Source-attachment backend and the equivalent native resource-upload backend, using the resolver, and fix any file picker Task 1 found reading before checking.
**Files:** `frontend/src/store/transport/native-source-attachments-backend.ts` (about `:42`), the native resource-upload backend (located by the task), any file picker Task 1's confirmation (b) names, existing native-backend tests under `frontend/tests/`
**Done when:** Tests first, then green: for a `File` one byte over the resolver's Android cap, the backend returns the refusal with the Task 5 message and `arrayBuffer` is never called (a spy on the `File` shows zero calls); for a `File` exactly at the cap, `arrayBuffer` is called once and the add proceeds; the same two tests for the resource-upload backend; with the runtime not native the 100 MiB behaviour is unchanged; no file picker is changed unless Task 1 recorded it reading before checking, and then its change has its own test. Electron and cli typecheck are run and recorded if a file under `lib/models` is touched.
**Depends on:** 5
**Estimate:** 3
**Notes:** Satisfies FR-5 (refusal before the write starts), FR-6, OQ-11. Reads Task 1's confirmation (b); if it records that the backend already checks first, the task is reduced to the add backend and records that.
**POS:** none yet
**Done:** [x] 2026-11-08

### Task 7: Unchanged-behaviour pins for desktop, hosted web and paired devices
**What:** Add the tests that fail if the Android cap or chunking leaks to a non-Android platform.
**Files:** the existing media-validation, upload-route, attachment-route and adapter test files under `frontend/tests/`; no product source change
**Done when:** Tests written first and green on the current tree: the exported `MAX_MEDIA_FILE_BYTES` equals 104,857,600; `validateMediaFile` and `validateAttachmentFile` results at 104,857,600 and 104,857,601 bytes with no Android cap in effect equal the pre-change results (success and `file-too-large` with the same message); the resolver returns 104,857,600 with the runtime not native; `POST /api/resource/upload` and the attachment routes return the same success result for an accepted file and the same refusal for a refused file as today; the Node adapter and the object-store adapter each call their underlying `writeFile` exactly once for a large buffer (a spy on the underlying call), proving they do not chunk; each assertion is shown to fail when the Android cap is wrongly applied for the non-native case (a mutation check recorded in the task report). A paired-device run is listed under "Not verified" in `experiments.md`, not claimed.
**Depends on:** 5
**Estimate:** 3
**Notes:** Satisfies FR-9. No device work; may run any time after Task 5. A route test that needs a new fixture adds to the existing route test file before creating one.
**POS:** none yet
**Done:** [x] 2026-11-08

### Task 8: LEAD-RUN: per-path device checks at the cap and one size above
**What:** On the Pixel 7 Pro, run attachment add, attachment replace, audio and image resource create and Trash restore of a large item at the Android cap and at one size above it, and record each result.
**Files:** `specs/features/android-large-media-writes/experiments.md` (FR-4 per-path runs and FR-5 failure observation sections)
**Done when:** A build of the branch with Tasks 2 to 7 landed is installed on the Pixel 7 Pro and, for each of attachment add, attachment replace, audio resource create, image resource create and Trash restore of a large trashed attachment and of a large trashed media resource, "FR-4 per-path runs" records at the largest size the cap accepts: the build id, device, size in bytes, the stored file's exact byte length, whether the path completed, duration, and no crash; and at one size above the cap: the refusal message text shown to the writer and that the app did not crash, with no attachment file, sidecar entry or resource directory left (checked by listing the project files). "FR-5 failure observation" records one observed failure of a write that cannot complete, produced by writing above the cap through a path that reaches the funnel or by the refusal, with the message the writer read and the state left afterward. For Trash restore, the record states it was run once with a large trashed item and that the trace of Task 1 found a rename; rename of a large file on Android is recorded as measured only if this run measured it. Importers are not run. Any path that cannot be run is listed under "Not verified", never claimed.
**Depends on:** 1, 2, 3, 4, 5, 6
**Estimate:** 5
**Notes:** LEAD-RUN, not for the orchestrator: `pnpm build:native`, `cap sync`, `gradlew :app:installDebug` (`JAVA_HOME` = Android Studio's JBR), `adb` outside the sandbox, main checkout, owner on the Pixel. Satisfies FR-4, FR-5 (device observation), FR-12, FR-14 (cap recorded as verified on this device only). Task 7 is not a dependency (no device input) but must be green before the PR. If a path fails at the cap, the cap is not changed here: return to the owner with the recorded result.
**POS:** none yet
**Done:** [ ]

### Task 9: LEAD-RUN: preview and playback at the cap (the read check)
**What:** On the Pixel 7 Pro, preview and play back a stored attachment or media file at the Android cap and record the result.
**Files:** `specs/features/android-large-media-writes/experiments.md` (FR-8 read check, Not verified and Acceptance sections)
**Done when:** "FR-8 read check" records, for a stored audio attachment (playback) and a stored image attachment (preview) at the cap: time to metadata ready, duration or display correct, and no crash, as observed values with build, device and size. If the read fails at a size the write accepts, the failure is recorded as a measurement; the cap then drops to the read-passing size by the owner's OQ-5 resolution only after that size is itself run through both write and read and passes, and a read-path change (`readFileInChunks`, plugin 8.1.2, native only) is not made and returns to the owner as new scope. "Not verified" lists compile and export at large sizes, a paired-device run, a second device and an encrypted project on Android, plus any check not run. "Acceptance" states the final Android cap in bytes and that it was verified on a Pixel 7 Pro only.
**Depends on:** 8
**Estimate:** 3
**Notes:** LEAD-RUN, not for the orchestrator; same device procedure as Task 8. Satisfies FR-8, FR-10, FR-14, OQ-5. If the cap changes here, Tasks 5 and 8 are re-run for the new size (the lead returns to the owner first).
**POS:** none yet
**Done:** [ ]

### Task 10: Documentation updates for the limit and the removed claim
**What:** List and apply the documentation changes FR-7 and FR-13 require, with the scribe stage writing the prose, so that no document states an Android cap or throughput that no device run measured.
**Files:** `docs/features/sources.md`, the user handbook page that states the Android size limit (located by the task; `specs/features/user-handbook.md` names its pages), `specs/features/folder-metadata-sources-core.md` (FR-31 (d)), `specs/features/sources-module-seam.md` (FR-18), `docs/features/feature-specifications/end-to-end-encryption/kdf-spike.md` and its `tasks.md`, `frontend/CLAUDE.md` (Code Map, only if a file or seam was added)
**Done when:** Each file above is checked, and where it repeats the "100 MB cap accepted" claim as a current claim it is replaced by the Android cap from Task 9's Acceptance stated as "verified on a Pixel 7 Pro", with the dated notes that record the earlier claim left in place; the throughput figure appears only for measured sizes (about 9 to 11 MB/s write up to 8 MiB, 25 MiB at about 8.6 MiB/s) and no throughput figure for chunked writes appears in user documentation (durations stay in `experiments.md`); `docs/features/sources.md` and the handbook state the Android size limit and the refusal message "File exceeds the N MB limit." in each page's existing style, in plain language and without test-run wording; the `frontend/CLAUDE.md` Code Map is updated only if Tasks 2 to 6 added a file or seam, otherwise the task records that none was added; `prettier --check` passes on every touched file.
**Depends on:** 9
**Estimate:** 3
**Notes:** Satisfies FR-7, FR-13, FR-14, OQ-12. Prose is the scribe stage's job; the orchestrator passes it the list of files and the facts above. Do not edit any document in a way that names a cause.
**POS:** none yet
**Done:** [ ]

### Task 11: LEAD-RUN: final suites exactly as CI runs them
**What:** Run every CI command from the places the workflows run them, record each as run or not run, and write the acceptance record including the "Not verified" list.
**Files:** `specs/features/android-large-media-writes/experiments.md` (Acceptance and Not verified sections)
**Done when:** The CI command list is first re-read with `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` and any difference from the list below is recorded; each of these is run and its result recorded, from the main checkout, outside the sandbox: from the repo root `pnpm run format:check`; frontend (`cd frontend`) `pnpm lint`, `pnpm run check:no-hex`, `pnpm typecheck`, `pnpm test:ci`, `pnpm test:e2e` (builds and serves Storybook on :6006; `pnpm storybook` stopped first), `pnpm --filter getwrite-frontend build`; electron `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`), `pnpm --filter getwrite-electron test`, `pnpm --filter getwrite-electron build`; cli `pnpm --filter getwrite-cli typecheck`, `pnpm --filter getwrite-cli test`, `pnpm --filter getwrite-cli build`, then `node cli/dist/bin/getwrite-cli.cjs --help | head -n 20`, `node cli/dist/bin/getwrite-cli.cjs doctor --help | head -n 20` and `node cli/dist/bin/getwrite-cli.cjs prune --help | head -n 20`; android `pnpm --filter getwrite-android build`; root `pnpm build:native` and `pnpm knip`, with the knip output compared to main (any finding on HEAD absent on main listed); a command that cannot run is listed under "Not verified" and not claimed; "Not verified" also lists, unless run: compile and export of large media on Android, a paired-device run, a second device, an encrypted project on Android (reading only), and the OQ-4 orphan after a process kill; the Acceptance section states the final Android cap and piece size, that no bare `tsc` was used as evidence, and that unit tests with the fake plugin are not evidence about memory.
**Depends on:** 4, 6, 7, 9, 10
**Estimate:** 3
**Notes:** LEAD-RUN: not for the orchestrator. `pnpm test:e2e`, `next build` and `pnpm build:native` run outside the sandbox from the main checkout, never a worktree. Satisfies FR-11, FR-12 (final verification), FR-10 (Not verified list). Tasks 2, 3, 5 and 8 are covered transitively through Tasks 4, 6, 9 and 10.
**POS:** none yet
**Done:** [ ]

## Summary
- Total tasks: 11
- Total estimated effort: 38 story points (8 + 3 + 3 + 3 + 3 + 3 + 3 + 5 + 3 + 3 + 3)
- Critical path: Tasks 1 → 2 → 3 → 4 → 8 → 9 → 10 → 11
- Risks: Task 1 (the whole feature waits on a device run whose outcome is unknown; the cap, piece size and even whether a cap exists are set by it, and if no ladder size passes both runs the work returns to the owner); Task 1 staging (the throwaway patch must be reverted with a single-path restore and must not reach a commit; FR-1 forbids a funnel change before the result is recorded); Tasks 2 and 3 (sole editors of `capacitorFsAdapter.ts`; the funnel is shared by every text write, so the small-write characterization test is the guard); Task 4 (create-path cleanup must remove only the directory this run created); Task 5 (depends on Task 1's confirmation that the native build inlines the runtime variable in a shared module); Task 8 (six device runs on one Pixel; a failure at the cap returns to the owner, not a cap edit); Task 9 (a read failure at the cap changes the cap or returns a read-path change to the owner as new scope, and would re-open Tasks 5 and 8); Task 11 (e2e and builds only run from the main checkout outside the sandbox).

## Open Questions
None. OQ-1 to OQ-12 of the feature spec are resolved at Gate 3 (2026-11-08) and folded into the tasks above. The staging of the experiment (throwaway local patch in Task 1, real funnel in Task 2) is a decision recorded in the header, not an open question.
