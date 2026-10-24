# Tasks: A save never puts back an older value, and overlapping server writers keep each other's change (Feature 93)

Source spec: `specs/features/stale-saves-and-index-races.md` (FR-1..FR-23, US-1..US-3, AC-1..AC-15; Gate 3 approved 2026-10-24; OQ-1..OQ-6 resolved). Parent: `specs/product/getwrite.features.md` Feature 93. Branch: `fix/stale-saves-and-index-races`, main checkout. Format precedent: `specs/features/project-json-single-lock/tasks.md` (Feature 92). Granularity: story points (1/2/3/5/8); S = 1-2, M = 3, L = 5.

Shape of the work: measure first, then fix only what reproduces.
- Tasks 1-8: baselines and every "before" measurement and read-only audit, recorded in `specs/features/stale-saves-and-index-races/experiments.md`. Experiment scripts live under `specs/features/stale-saves-and-index-races/scripts/` (not run by the suite). Tasks 3 to 7 are independent of each other and can run concurrently once Task 1 exists (they append to separate sections of `experiments.md`; the orchestrator serialises the file edits).
- Part A, sidecar allowlist (Tasks 9-13): promised by decision (OQ-115, OQ-116), so it does NOT wait on E-1..E-3 (FR-2). It waits only on Task 2 (FR-3 caller re-search, before any key is dropped). Task 13 compares with the E-1..E-3 before values from Task 3.
- Part B, features route (Tasks 14-16): Task 14 is ungated; Tasks 15 and 16 are gated on E-5 (Task 4).
- Part C, carried settings checks (Task 17): gated on E-6/E-7 (Task 5).
- Part D, class B (Tasks 18-22): race tests, nested-lock test, then fixes gated per pair on E-8/E-9 (Tasks 6, 7).
- Tasks 23-24: docs and final suites.

Parallelism hint for the orchestrator: after Task 1, Tasks 2-8 are independent. Part A (9-13) is a serial chain in `resource-crud-core.ts` and its tests. Parts B, C, D touch disjoint files from Part A and can run beside it, once their gating measurements are recorded. Tasks 20 and 21 (different files) can run concurrently.

FR coverage: FR-1: 1, 3, 4, 5, 6, 7. FR-2: 3-8 (gating), 15, 16, 17, 20, 21. FR-3: 2. FR-4: 10. FR-5: 10. FR-6: 10. FR-7: 10. FR-8: 9, 10. FR-9: 3, 9, 13. FR-10: 9, 23. FR-11: 14, 23. FR-12: 15, 16. FR-13: 14, 15, 16. FR-14: 17. FR-15: 20. FR-16: 21. FR-17: 8, 19. FR-18: 18. FR-19: 22. FR-20: 8, 12. FR-21: 23. FR-22: 1, 24. FR-23: 9, 11.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Work in the main checkout on branch `fix/stale-saves-and-index-races`. No worktrees; do not switch branches. Implementors do not commit and do not push; the orchestrator commits, naming the task ID only. Leave the pipeline's uncommitted edits to `specs/product/getwrite.features.md` and `specs/product/getwrite.md` alone.
- Throwaway data only. Tests and experiments use temp directories under `$TMPDIR` or the scratchpad. NEVER read, list or write the repo's `projects/`, `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite` or `~/Library/Logs/*`.
- Before any task that runs `pnpm test:e2e`, run `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` and record it. `pnpm test:e2e` builds and serves Storybook itself on :6006: never start `pnpm storybook` first; if 6006 is held, stop and report. Never stop a process the task did not start; stop only started pids, by pid. `pnpm test:e2e` runs outside the sandbox.
- Measurement vocabulary: every entry in `experiments.md` is MEASURED (observed in a run, stated as values: repetitions, counts, command, date, temp-directory path) or READ, not run, or UNMEASURED (with the reason). A measurement states what was observed; no cause is written for any value (CLAUDE.md: a measurement is a fact, a cause is a hypothesis). A non-reproduction is recorded with its counts and construction and is not evidence that the case is safe under other timing (FR-2).
- A gated task states its gate. If the gate is not met, the task records the counts (or the reason) in `experiments.md`, marks the code change N/A, changes no source, and is ticked Done. If the gate is met, the fix is test-first and the commit names the `experiments.md` entry that gates it (AC-1).
- TDD (`docs/standards/testing.md`): write the named test first and show it failing for the stated reason, then passing. Extend an existing test file before creating one. Code follows `docs/standards/typescript-implementation.md`, `failure-visibility.md`, `security.md`, `storage-context.md`. A single write on an idle project behaves exactly as before (FR-20).
- Verification vocabulary, from `frontend/` unless stated: `pnpm typecheck`; `pnpm lint`; `pnpm exec vitest run <file>`; `pnpm test:ci`; `pnpm test:e2e`; from the repo root `pnpm knip`.
- Stop-and-report: if the FR-3 re-search (Task 2) or E-4 finds a production caller that relies on a dropped key, or legitimately writes a sixth key, Part A stops at that key and reports a blocker; the allowlist is not widened without an owner decision (FR-3, FR-4, OQ-5).
- Halt rule: if a task cannot meet its done condition, leave it unticked, record why, and report; do not work around it.

### Task 1: Baselines on the unchanged tree, and create experiments.md
**What:** Create `experiments.md` with an environment record and a "Baselines" section recording the pre-change result of every final suite.
**Files:** Creates `specs/features/stale-saves-and-index-races/experiments.md`. No source change.
**Done when:** `experiments.md` states, each as an observed value with command and date: date, branch, `git rev-parse HEAD`, `git status --short`, Node and Vitest versions (FR-1); the `lsof` output (6006 confirmed free before e2e); from `frontend/`, `pnpm typecheck` (exit code), `pnpm lint` (error and warning counts; expected baseline 0 errors / 392 warnings, reported as observed), `pnpm test:ci` (passed / failed / skipped) and `pnpm test:e2e` (counts and names of failures); from the repo root `pnpm knip` (finding count by section; expected baseline 412, reported as observed); `pnpm --filter getwrite-cli test` and `pnpm --filter getwrite-electron test` (counts). A command that cannot run is recorded as not run with the reason. The file has empty headed sections for E-1..E-9, the FR-3 caller list, the FR-17 caller list and the FR-20 test-edit list. `git status --short` shows no change outside `specs/`.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-1 (environment record), FR-22 (baseline half), AC-1 (file exists before the first fix commit). Earlier figures are reported, not current; measure.
**Done:** [x]

### Task 2: FR-3 caller re-search and E-4 key inventory
**What:** Search again for every caller of `updateSidecarCore`, and record the key inventory (E-4) for a real sidecar and a real page resource copy.
**Files:** Appends "FR-3 callers of updateSidecarCore" and "E-4 key inventory" sections to `experiments.md`; may add an inventory script under `specs/features/stale-saves-and-index-races/scripts/`. No source change.
**Done when:** `experiments.md` lists every caller of `updateSidecarCore` and of the `updateSidecar` transport with file:line (labelled READ, not run), and states whether any renames, or sets `updatedAt` or `dismissedNoiseTerms` (AC-2). E-4 records, MEASURED against a temp-directory project: which keys a stale whole-resource copy puts back; which keys each production sender sends (the page save at `app/(app)/page.tsx:537` built by `applyUpdate` `:508-531`, `SubtypeSection`, `WordCountGoalSection`, `EntitySection`, `RemoveEntityControl`); and whether the page resource copy carries `plainText`, `tiptap`, `charCount` or any other key that stored sidecars hold today (the allowlist stops storing them, FR-20). If any caller relies on a to-be-dropped key, or any sender legitimately writes a sixth key, the task records it and reports a blocker; Part A (Tasks 9-13) does not start.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-3, FR-1 (E-4), AC-2, and the input to FR-20 and OQ-5. The 2026-10-24 finding was none, with two production callers (F93-2); this task confirms or contradicts it.
**Done:** [x]

### Task 3: Experiments E-1, E-2, E-3 (sidecar stale-copy before values)
**What:** Run the three sidecar stale-copy measurements on unchanged `main` and record the counts.
**Files:** Creates scripts under `specs/features/stale-saves-and-index-races/scripts/` (not run by the suite); appends E-1, E-2, E-3 sections to `experiments.md`. No source change.
**Done when:** `experiments.md` records, per experiment, repetitions, counts, label, command, date and temp-directory path, with no cause: E-1 stale `name` after a rename followed by a stale whole-resource `updateSidecarCore` (the page-save construction), at least 20 repetitions; E-2 stale `updatedAt` after a canonical save, 100 repetitions, re-run on current `main` (the 2026-10-23 value of 100 of 100 is carried as history, not assumed); E-3 stale `dismissedNoiseTerms` after `setNoiseTermDismissedCore`, at least 20 repetitions. Each also records unparseable and rejected counts.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-1 (E-1..E-3), FR-9 (before values), AC-1. Gates nothing: the sidecar change is promised by decision and proceeds independently (FR-2); these supply the before values for Task 13. Reuse the construction of Feature 92's OQ-9 measurement (`specs/features/project-json-single-lock/experiments.md`).
**Done:** [x]

### Task 4: Experiment E-5 (features-route senders)
**What:** Measure whether two quick edits from one window lose one in `RelationshipTypesSettings`, `ProjectFeatureToggles` and `OrganizerCardBodySettings`.
**Files:** Creates a throwaway component-test script under `specs/features/stale-saves-and-index-races/scripts/` (read each component's source and stories before driving it; not run by the suite); appends an E-5 section to `experiments.md`. No source change.
**Done when:** `experiments.md` records, per sender (`RelationshipTypesSettings.tsx` `persist` `:67-82`, `ProjectFeatureToggles.tsx:100-125`, `OrganizerCardBodySettings.tsx:121`), at least 20 repetitions of two edits with the first save still pending, the number of repetitions whose final stored block holds both edits, label, command, date. A closing line states, per sender, "reproduced a loss" or "did not reproduce", without a cause. `SubtypesSettings.tsx` (already guarded by `isSaving`) is recorded as READ, not run.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-1 (E-5), AC-1. Gate for Tasks 15 and 16 (FR-2, FR-12, OQ-4). Never use a prop on an in-project component without opening its source and stories first.
**Done:** [x]

### Task 5: Experiments E-6 and E-7 (editor config and entity-graph settings)
**What:** Measure whether overlapping or older-copy saves revert a setting in `editor-config-core.ts` and `entity-graph-settings-core.ts`.
**Files:** Creates scripts under `specs/features/stale-saves-and-index-races/scripts/`; appends E-6 and E-7 sections to `experiments.md`. No source change.
**Done when:** `experiments.md` records, at least 20 repetitions each, with label, counts, command, date, no cause: E-6 overlapping saves of `headings` and `body` through `updateEditorConfigCore`, and a save from a copy older than another save; E-7 a save from a copy older than another save of the same entity-graph settings (`entityGraphConnectionTypes` and `entityGraphFocalHopRadius`), counting how many repetitions revert either key. The task also records, READ, what each UI sender sends per modal (the part the spec says was not traced), and a closing line per experiment: "reverted in N of M" or "did not reproduce".
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-1 (E-6, E-7), AC-1. Gate for Task 17 (FR-14, F93-3).
**Done:** [x]

### Task 6: Experiment E-8 (mention index races)
**What:** Measure the four mention-index writer pairs on unchanged `main`.
**Files:** Creates scripts under `specs/features/stale-saves-and-index-races/scripts/`; appends an E-8 section to `experiments.md`. No source change.
**Done when:** `experiments.md` records, at least 20 repetitions per pair, the number of repetitions that lost a change, unparseable files and rejected promises, label, command, date, temp-directory path, no cause, for: `removeResourceFromMentionIndex` against `runTask`'s mention step; `removeResourceFromMentionIndex` against `rescanEntityAcrossProject`; `rescanEntityAcrossProject` against `runTask`; two `persistMentionIndex` callers. `runTask` against `runTask` is recorded as skipped (the queue drains one task at a time, `indexer-queue.ts:329-334`). The constructions follow the OQ-6 findings (`rescanEntityAcrossProject` runs outside the indexer FIFO, `indexer-queue.ts:450-469`). A closing line states, per pair, "reproduced a loss" or "did not reproduce".
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-1 (E-8), AC-1. Gate for Task 20 (FR-15, per pair). Construction precedent: the pre-PR #300 `inverted-index.ts` race (20 of 20 lost).
**Done:** [x]

### Task 7: Experiment E-9 (backlinks races)
**What:** Measure the four backlinks writer pairs on unchanged `main`.
**Files:** Creates scripts under `specs/features/stale-saves-and-index-races/scripts/`; appends an E-9 section to `experiments.md`. No source change.
**Done when:** `experiments.md` records, at least 20 repetitions per pair, lost changes, unparseable files, rejected promises, label, command, date, temp-directory path, no cause, for: `removeResourceFromBacklinks` against `persistBacklinks`; `persistBacklinks` against `persistBacklinks`; the watcher's `persistBacklinks` (`backlinks-watcher.ts:46-62`) against `runTask`'s backlinks step; `removeResourceFromBacklinks` against `runTask`. A closing line states, per pair, "reproduced a loss" or "did not reproduce", and, if any pair loses a change that one locked load, change and save would not close (for example a `computeBacklinks` recompute overlapping a removal), says so as an observation, not a cause.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-1 (E-9), AC-1. Gate for Task 21 (FR-16, per pair). An atomic `computeBacklinks` recompute stays a recorded follow-up unless the owner widens scope (F93-4).
**Done:** [x]

### Task 8: FR-17 caller audit for the class B writers
**What:** List every caller of each candidate class B writer and record whether it already holds `withMetaLock` for the same project root, directly or through a callee.
**Files:** Appends an "FR-17 callers" section to `experiments.md`. No source change.
**Done when:** `experiments.md` lists, with file:line and result (holds `withMetaLock`: yes / no / indirect), every caller of `removeResourceFromMentionIndex`, `persistMentionIndex`, `rescanEntityAcrossProject`, `runTask`'s mention and backlinks steps, `removeResourceFromBacklinks` and `persistBacklinks`, including `trash.ts:335` and `:1280`, `indexer-queue.ts`, the three importers, `reindex` and `backlinks-watcher.ts`. Labelled READ, not run (a name-based grep is medium confidence; follow each callee chain by reading). Any caller found holding `withMetaLock` is flagged for Task 20 or 21 to un-nest.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-17 (list half), AC-10 (list half), FR-20. Read-only; done before any code that takes `withMetaLock` around a whole load, change and save. `meta-locks.ts` is not reentrant: a nested call chains behind the outer `fn` and never starts.
**Done:** [x]

### Task 9: Sidecar tests first: table-driven keys, stale copies, known gap, read-failure branches
**What:** Write the failing sidecar tests for the allowlist, the stale-copy cases, the `userMetadata` known gap and the FR-23 read-failure branches.
**Files:** Extends `frontend/tests/unit/resource-crud-core-sidecar-sink.test.ts` (or the sidecar test file found by reading); extends the sidecar route test for AC-5/AC-15 if one exists.
**Done when:** the tests exist and are shown failing on the unchanged tree for the stated reason (a client value is stored): (a) table-driven per key: for each of `entityKind`, `aliases`, `wordCountGoal`, `resourceSubtype`, `userMetadata` a client value is stored as sent; for each of `updatedAt`, `name`, `dismissedNoiseTerms`, `wordCount`, `file`, `orderIndex`, `folderId` and one key on no list, a client value leaves the stored value unchanged and the call succeeds (AC-3, AC-15); (b) after a rename, a stale whole-resource `updateSidecarCore` leaves the new `name` in 20 of 20 repetitions; after a canonical save, a stale whole-resource save leaves the newer `updatedAt` in 100 of 100 repetitions (AC-4); (c) a known-gap test, labelled as such, shows a stale `userMetadata` stored as sent (AC-6); (d) a stored sidecar that is not valid JSON is replaced by a file that parses and holds the client's `id`, `slug`, `name`, `type`, `createdAt` plus allowlisted keys (AC-13); (e) a stored sidecar whose read fails with `EACCES` makes the call reject and the file's bytes are unchanged (AC-14); (f) an invalid `clearKeys` entry still answers 400 at the route (AC-15); (g) the success body is `{ message: "Sidecar updated." }`. Tests (a)-(e) are red on the unchanged tree where the behaviour is new; (c), (f), (g) pass.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-8, FR-9, FR-10, FR-23 (test half). Red by design until Tasks 10 and 11; the orchestrator does not commit a red tree as done and Tasks 10-12 follow on the same branch. Sidecar work does not wait on E-1..E-3 (FR-2).
**Done:** [x]

### Task 10: Allowlist in updateSidecarCore
**What:** Make `updateSidecarCore` store only the five client-writable keys, replacing the `SERVER_DERIVED_SIDECAR_KEYS` denylist.
**Files:** Modifies `frontend/src/lib/models/resource-crud-core.ts` (`SERVER_DERIVED_SIDECAR_KEYS` `:395`, `omitServerDerivedKeys` `:477-486`, `mergeSidecarUpdate` `:497-545`, `updateSidecarCore` `:556-570`).
**Done when:** the allowlist is exactly `entityKind`, `aliases`, `wordCountGoal`, `resourceSubtype`, `userMetadata`; any other client key (named server-owned or unlisted) is ignored silently, the request succeeds; `wordCount` and `file` still ignored; `orderIndex` and `folderId` still re-applied from the stored sidecar; `clearKeys` validation (`SIDECAR_CLEARABLE_KEYS`) and `resourceSubtype` normalisation behave as before; the denylist is removed or reduced to a comment-only record; route and transport contract unchanged (request shape, `{ message: "Sidecar updated." }`, status codes, thrown errors; no caller migrated); `renameResourceSidecarCore`, `setNoiseTermDismissedCore`, reorder and the canonical save are untouched. The Task 9 tests (a), (b), (c), (f), (g) pass. `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run` on the Task 9 file.
**Depends on:** 9
**Estimate:** 3
**Notes:** Satisfies FR-4, FR-5, FR-6, FR-7, FR-8, AC-3, AC-4 (single run), AC-6, AC-15. Fail-closed per `docs/standards/security.md`. Tests (d), (e) turn green in Task 11. Existing tests that send unlisted keys go red here and are rewritten in Task 12.
**Done:** [x]

### Task 11: updateSidecarCore read-failure branches
**What:** Act by cause when the stored sidecar cannot be read: replace on a JSON parse failure, reject on any other error.
**Files:** Modifies `frontend/src/lib/models/resource-crud-core.ts` (the read and `isReadTolerant` path of `updateSidecarCore` / `mergeSidecarUpdate`).
**Done when:** on a `SyntaxError` the file is replaced with the allowlisted client keys plus the client's identity keys (`id`, `slug`, `name`, `type`, `createdAt`) and the result parses and loads (AC-13); on any other read error (for example `EACCES`, `EIO`) the call rejects visibly, writes nothing, and the file's bytes are unchanged (AC-14); `ENOENT` stays the `ResourceGoneError` path and locked-access stays the existing rethrow; a failure inside the lock reaches the caller unchanged and releases the lock (FR-20). Task 9 tests (d) and (e) pass. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 10
**Estimate:** 3
**Notes:** Satisfies FR-23, FR-20 (failure half). Same file as Task 10, so serial. `docs/standards/failure-visibility.md`: a failure must not render as absence.
**Done:** [x]

### Task 12: FR-20 existing-test rewrites
**What:** Edit the existing tests whose assertions depend on a key that is now ignored, and list each edit.
**Files:** Modifies `frontend/tests/unit/resource-crud-core-sidecar-sink.test.ts` (about `:127`, `:222`, `:241`, `:338`; the 20 concurrent `field${i}` test rebuilt on allowlisted keys or separate updates because `userMetadata` is replaced wholesale; `:213` changed for FR-23), `frontend/tests/unit/metadata-concurrent-writes.test.ts` (about `:90`), `frontend/tests/unit/resource-crud-core-entity-kind-omitted.test.ts`; any further test the full suite shows red because of an ignored key. Appends an "FR-20 test edits" section to `experiments.md`.
**Done when:** `experiments.md` lists every edited test by file and name with the reason (key now ignored, or FR-23); no test is edited that does not depend on an ignored key or FR-23; E-4's record of keys such as `plainText`, `tiptap`, `charCount` (Task 2) is accounted for in the section (stored sidecars holding them lose them on the next save, stated as an observed consequence); `pnpm exec vitest run` on the three files passes; `pnpm test:ci` shows no other new failure versus the Task 1 baseline (AC-5).
**Depends on:** 11
**Estimate:** 3
**Notes:** Satisfies FR-20, AC-5. Existing tests otherwise stay green without edits. The 20-concurrent test is the one with real design content: keep its intent (concurrent updates keep each other's change) using separate allowlisted keys.
**Done:** [x]

### Task 13: Sidecar acceptance: stale-copy tests pass nine consecutive runs
**What:** Run the stale-copy tests against the allowlist and record nine consecutive passing runs next to the E-1..E-3 before values.
**Files:** Appends a "Sidecar after" section to `experiments.md`. No source change expected.
**Done when:** `pnpm exec vitest run <the Task 9 file>` passes in each of 9 consecutive runs, with the rename test 20 of 20 and the canonical-save test 100 of 100 keeping the newer value in each run; the nine results sit in `experiments.md` next to the Task 3 values (E-1, E-2, E-3). If any run fails, the task halts and reports the observed counts.
**Depends on:** 3, 12
**Estimate:** 2
**Notes:** Satisfies FR-9 (hard acceptance), AC-4.
**Done:** [x]

### Task 14: Features route: document last-write-wins and add the server-side overlap regression test
**What:** Document whole-block last-write-wins in the route doc comment and add a server-side test that two overlapping requests for different blocks keep both.
**Files:** Modifies `frontend/app/api/project/features/route.ts` (doc comment only); extends the existing features-route test found by reading (create only if none).
**Done when:** the route doc comment states last-write-wins per block, that between two devices the newest write to a block wins, and that an item added on the other device can be dropped; a test sends two overlapping requests to the route for different blocks and asserts both blocks are present in `project.json` and the file parses (20 repetitions); it passes on the unchanged tree (regression guard of Feature 92's lock, labelled so); the route contract is unchanged (an omitted block untouched, at least one block required, success body, errors). `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 1
**Estimate:** 2
**Notes:** Satisfies FR-11 (comment half), FR-13 (server test). Ungated: no behaviour change. The `docs/features/project-configuration.md` half is Task 23.
**Done:** [x]

### Task 15: Gated: in-flight guard for RelationshipTypesSettings
**What:** Only if E-5 reproduced a lost edit for `RelationshipTypesSettings`, stop it sending a second edit until the first has settled; otherwise record counts and mark N/A.
**Files:** If gated in: modifies `frontend/components/**/RelationshipTypesSettings.tsx` (path verified by reading; `persist` `:67-82`), its story and test; always: appends the gate decision to `experiments.md`.
**Done when:** Gate: Task 4 recorded a reproduced loss for `RelationshipTypesSettings`. If not reproduced, `experiments.md` states the Task 4 counts and "N/A, unchanged (FR-2, OQ-4)", no source file changes, and AC-7's "no sender is changed" clause holds. If reproduced: a component test first sends two edits with the first still pending and asserts both are in the final stored block, failing on the unchanged tree; after the change the second edit is not sent until the first settled and its stored result is in the client store, using the `isSaving` mechanism of `SubtypesSettings` (disable controls or return early, with an accessible disabled state); a failed first save shows its error and re-enables the controls; the final stored list holds both edits in 20 of 20 repetitions; any new context requirement has a Storybook decorator. `pnpm typecheck`, `pnpm lint`, targeted vitest, and the component's Storybook/a11y tests pass.
**Depends on:** 4, 14
**Estimate:** 3
**Notes:** Satisfies FR-12, FR-13, AC-7, FR-2. Open the component's source and stories before editing. Estimate is the gated-in size; N/A costs 1.
**Done:** [x]

### Task 16: Gated: in-flight guards for ProjectFeatureToggles and OrganizerCardBodySettings
**What:** For each of these two senders where E-5 reproduced a lost edit, add the same in-flight guard; leave the other unchanged and record its counts.
**Files:** If gated in: modifies `frontend/components/**/ProjectFeatureToggles.tsx` (`:100-125`) and/or `OrganizerCardBodySettings.tsx` (`:121`) (paths verified by reading), their stories and tests; always: appends the gate decisions to `experiments.md`.
**Done when:** Gate, per sender: Task 4 recorded a reproduced loss for that sender. For a sender that did not reproduce, `experiments.md` states the counts and "N/A, unchanged" and its source is untouched. For a sender that reproduced: a failing-first component test with two edits and the first pending, both present in the final stored block, 20 of 20 after the change; the guard follows the `SubtypesSettings` `isSaving` mechanism with an accessible disabled state and re-enables controls on failure while still showing the error; Storybook decorator added for any new context requirement. `pnpm typecheck`, `pnpm lint`, targeted vitest pass.
**Depends on:** 4, 15
**Estimate:** 3
**Notes:** Satisfies FR-12, FR-13, FR-2. Serialised after Task 15 only to share the guard pattern and avoid divergent mechanisms; if Task 15 was N/A, copy the `SubtypesSettings` pattern directly.
**Outcome note (Gate 5, 2026-10-24):** The `OrganizerCardBodySettings` guard was built (5aad9c9a) and reverted by owner decision (240e5e40): nothing else writes `organizerCardBody` and each save carries the section's full state, while the guard disabled the length input during each save and dropped the keystrokes that followed. Follow-up: save the excerpt length on blur or after a typing pause. The `ProjectFeatureToggles` guard stays. Recorded at the end of `experiments.md`.
**Done:** [x]

### Task 17: Gated: editor config and entity-graph settings revert fix
**What:** For each of E-6 and E-7 that reproduced a reverted setting, make a key-level merge inside the existing `updateProjectJson` mutate if it is small; otherwise record a follow-up with the counts and change nothing.
**Files:** If gated in: modifies `frontend/src/lib/models/editor-config-core.ts` (`:104-124`) and/or `entity-graph-settings-core.ts` (`:124-`) and their existing tests; always: appends the gate decisions to `experiments.md`.
**Done when:** Gate, per experiment: Task 5 recorded a reverted setting. Not reproduced: `experiments.md` states the counts and "N/A, unchanged", source untouched. Reproduced and the fix is a key-level merge inside the `updateProjectJson` mutate that changes no route contract: a failing-first test (older-copy save), then the setting survives in 20 of 20 repetitions (AC-8); existing tests pass without edits. Reproduced and larger than that: `experiments.md` records the revert count and the follow-up, with no code change (AC-8). `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 5
**Estimate:** 3
**Notes:** Satisfies FR-14, AC-8, F93-3 option b. Do not widen the route or request contract. Estimate is gated-in; N/A costs 1.
**Done:** [x]

### Task 18: Class B race tests in the suite
**What:** Add a suite race test for every E-8 and E-9 pair, in the manner of `inverted-index.test.ts:169` and `:183`, red for pairs that reproduced and kept as labelled regression guards for those that did not.
**Files:** Creates or extends `frontend/tests/unit/mention-index-concurrent-writes.test.ts` and `frontend/tests/unit/backlinks-concurrent-writes.test.ts` (decided by reading existing test files; extend if one fits).
**Done when:** each pair of Tasks 6 and 7 has a test with two overlapping operations on one project, both changes asserted present and the file parseable, at least 20 repetitions, each repetition raced against a 5 s timer so a hang fails the test and not the suite; run on the unchanged tree, a pair that reproduced in Task 6 or 7 fails, a pair that did not passes and is labelled a regression guard; the observed fail/pass per test is recorded in `experiments.md`. `pnpm typecheck`, `pnpm lint`.
**Depends on:** 6, 7
**Estimate:** 5
**Notes:** Satisfies FR-18, AC-9 (before half). Eight pairs, each with its own fixtures; a shared parametrised helper is allowed. Red by design for reproduced pairs until Tasks 20 and 21.
**Done:** [x]

### Task 19: Nested withMetaLock test
**What:** Add the new test (and test-only hook if needed) that fails on a `withMetaLock` call nested inside a `withMetaLock` callback, before any writer takes the lock around a whole load, change and save.
**Files:** Extends `frontend/tests/unit/meta-locks.test.ts` (or the existing meta-lock test found by reading); may modify `frontend/src/lib/meta-locks.ts` for a test-only detection hook (inactive outside tests; no `node:async_hooks` import in the production bundle, as in Feature 92).
**Done when:** a test fails first because a nested same-key `withMetaLock` call is not detected, then passes: under test, a nested same-project call throws rather than hanging; a non-nested sequence and calls for other keys do not throw; outside tests the hook does nothing and does not change `withMetaLock`'s behaviour; any caller flagged by Task 8 as holding `withMetaLock` is listed in `experiments.md` with the planned un-nesting. `pnpm typecheck`, `pnpm lint`, targeted vitest; `pnpm build` if `meta-locks.ts` is modified.
**Depends on:** 8, 6, 7
**Estimate:** 3
**Notes:** Satisfies FR-17 (test half), AC-10. `tests/helpers/lockOrderGuard.ts` checks file locks only, so this is new work, not an extension of that guard. Gate: if neither Task 6 nor Task 7 reproduced a loss, no writer will change, the test is still added as a regression guard (FR-17 applies to any function that takes the lock) but no hook in `src/` is required; record that.
**Done:** [x]

### Task 20: Gated: mention-index writers under one withMetaLock
**What:** For each E-8 pair that reproduced a loss, make the implicated writers load, change and save the mention index inside one `withMetaLock` call.
**Files:** If gated in: modifies `frontend/src/lib/models/mention-index.ts` (`persistMentionIndex` `:59-69`, `removeResourceFromMentionIndex` `:100-108`) and `frontend/src/lib/models/indexer-queue.ts` (`runTask` `:292-298`, `rescanEntityAcrossProject` `:404-427`); existing tests; always: appends the gate decision to `experiments.md`.
**Done when:** Gate: Task 6 reproduced a loss for a pair. Only the writers in a reproduced pair are changed, in the manner of `inverted-index.ts` `updateIndex` (`:96-107`); reads for display (`loadMentionIndex`) stay unlocked. Not reproduced: counts recorded, "N/A, unchanged", source untouched, the Task 18 guard tests stay green. If reproduced: the Task 18 test for each reproduced pair passes in 20 of 20 repetitions and in 9 consecutive runs; no caller deadlocks (each repetition within 5 s; callers from Task 8 un-nested, `trash.ts:335` and `:1280` included, and the Task 19 test passes); a single idle write returns, stores and fails exactly as before (FR-20); a throw inside the lock reaches the caller unchanged, writes nothing and releases the lock. All existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 8, 18, 19
**Estimate:** 3
**Notes:** Satisfies FR-15, FR-17, FR-20, AC-9, AC-10. Concurrent with Task 21 (disjoint files). Importers and `reindex` persist at the end without `withMetaLock`; change them only if a reproduced pair implicates them. Estimate is gated-in; N/A costs 1.
**Done:** [x]

### Task 21: Gated: backlinks removal under one withMetaLock
**What:** If an E-9 pair that includes `removeResourceFromBacklinks` reproduced a loss, make it load, change and save `backlinks.json` inside one `withMetaLock` call; record anything one locked step cannot close as a follow-up.
**Files:** If gated in: modifies `frontend/src/lib/models/backlinks.ts` (`removeResourceFromBacklinks` `:276-289`, possibly `persistBacklinks` `:237-254`) and, only if a reproduced pair implicates them, `backlinks-watcher.ts` (`:46-62`) and `indexer-queue.ts`; existing tests; always: appends the gate decision to `experiments.md`.
**Done when:** Gate: Task 7 reproduced a loss for a pair. Not reproduced: counts recorded, "N/A, unchanged", source untouched, Task 18 guards stay green. If reproduced: the Task 18 test for each reproduced pair passes in 20 of 20 repetitions and 9 consecutive runs; callers from Task 8 are not nested and the Task 19 test passes; each repetition within 5 s; single idle writes behave as before; `computeBacklinks` followed by `persistBacklinks` is NOT made atomic; if a race test shows a loss one locked load, change and save cannot close, `experiments.md` records it as a follow-up and the task reports it to the lead instead of widening scope (F93-4). Existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 8, 18, 19
**Estimate:** 3
**Notes:** Satisfies FR-16, FR-17, FR-20, AC-9, AC-10. Concurrent with Task 20. Estimate is gated-in; N/A costs 1.
**Done:** [x]

### Task 22: Correct the "inside one withMetaLock" comments
**What:** Correct the inaccurate comments in `mention-index.ts` and `backlinks.ts` to state what is locked after this feature.
**Files:** Modifies `frontend/src/lib/models/mention-index.ts` (`:96-99`) and `frontend/src/lib/models/backlinks.ts` (`:271-275`) (comments only).
**Done when:** each comment states what is locked after Tasks 20 and 21 (the write only, or the whole load, change and save, per what was actually changed), and the `backlinks.ts` comment states that a `computeBacklinks` recompute is not atomic; a grep for "inside one `withMetaLock`" in both files finds only comments that match the code (AC-11), the grep output recorded in `experiments.md`. `pnpm typecheck`, `pnpm lint`.
**Depends on:** 20, 21
**Estimate:** 1
**Notes:** Satisfies FR-19, AC-11. Required whether or not Tasks 20 and 21 changed code.
**Done:** [x]

### Task 23: Documentation
**What:** Update the docs for the allowlist, the known gaps, last-write-wins per block and the lock notes.
**Files:** Modifies `docs/features/sidecars.md`, `docs/features/project-configuration.md`, `frontend/CLAUDE.md` (data-layer sidecar and lock notes), and other `docs/features/` pages found by grep to describe the changed behaviour (for example `docs/features/entities.md`, `docs/features/revisions.md`, only where they state a now-wrong claim). The `Feature 93` status line in `specs/product/getwrite.features.md` is left to the pipeline lead.
**Done when:** `docs/features/sidecars.md` states which keys a client may write (the five), that the other keys are server-owned, that a client value for them is ignored, and that a stale `userMetadata` is replaced wholesale (known gap, FR-10, AC-6); `docs/features/project-configuration.md` states last-write-wins per block for `POST /api/project/features`, that between two devices the newest write wins and an item added elsewhere can be dropped, and the single-window in-flight guard only for the senders Tasks 15 and 16 actually changed (FR-11); `frontend/CLAUDE.md` data-layer notes state the allowlist and, if Tasks 20 or 21 changed code, that the mention-index and backlinks writers load, change and save under `withMetaLock` (and that `withMetaLock` is not reentrant); known follow-ups are named (version check, returning the stored sidecar, atomic `computeBacklinks` recompute, any E-6/E-7 follow-up); no doc claims a non-reproduced case is fixed. `pnpm typecheck` and `pnpm lint` pass.
**Depends on:** 13, 14, 15, 16, 17, 22
**Estimate:** 3
**Notes:** Satisfies FR-21, FR-10 (doc half), FR-11 (doc half). Wording describes what was measured and changed, nothing more.
**Done:** [x]

### Task 24: Final suites
**What:** Run every final suite on the branch and record the results next to the Task 1 baselines.
**Files:** Appends a "Final suites" section to `experiments.md`. Modifies only tests or stories needed to make a genuine gap pass (each recorded). A new component context requirement gets a Storybook decorator.
**Done when:** `experiments.md` records, as observed values with command and date, compared with Task 1: from `frontend/`, `pnpm typecheck`, `pnpm lint` (baseline 0 errors / 392 warnings; no new errors, warning count reported), `pnpm test:ci`, and `pnpm test:e2e` (6006 confirmed free first by `lsof`; `pnpm storybook` never started; run before any PR per the owner rule); from the repo root `pnpm knip` compared by section against the baseline (412), no new findings; `pnpm --filter getwrite-cli test` and `pnpm --filter getwrite-electron test` (run if any CLI or Electron file or shared module they import was touched, else recorded as not run with the reason, and the baseline counts restated). Every Task 9 and 18 test passes in 9 consecutive runs where the spec requires it. `lsof` before and after. A suite that cannot run is recorded as not run with the reason, never as passing; a failing suite is recorded, not worked around. `git status --short` shows only intended changes; no commit, no push, no merge by the task.
**Depends on:** 23
**Estimate:** 3
**Notes:** Satisfies FR-22, AC-12, AC-1 (every fix commit names its gating entry). `pnpm test:e2e` runs outside the sandbox; stop only pids this task started.
**Done:** [x]

## Summary
- Total tasks: 24
- Total estimated effort: 72 story points (S = 1-2, M = 3, L = 5 for Tasks 9 and 18 only; gated tasks 15, 16, 17, 20, 21 are sized for the gated-in case and cost 1 each when N/A)
- Critical path: 1 → 2 → 9 → 10 → 11 → 12 → 13 → 23 → 24
- Risks: Task 2 (a caller relying on a dropped key, or a sixth legitimate key, is a stop-and-report blocker for Part A); Task 9 (red by design until Tasks 10-11; the 20 concurrent `field${i}` test in Task 12 needs a rebuilt design because `userMetadata` is replaced wholesale); Task 12 (E-4 may show stored sidecars hold `plainText`, `tiptap`, `charCount` that the allowlist stops storing on the next save); Tasks 15, 16, 17, 20, 21 (their size and even existence depend on measurements Tasks 4-7; a non-reproduction is recorded, not treated as proof of safety); Task 18 (eight pair constructions with fixtures; the E-8/E-9 constructions depend on the OQ-6 findings that `rescanEntityAcrossProject` and the backlinks watcher run outside the indexer FIFO); Task 19 (`withMetaLock` is not reentrant and `lockOrderGuard.ts` covers file locks only; a hook in `meta-locks.ts` must not reach the production or Capacitor native bundle); Tasks 20-21 (a reproduced backlinks loss that one locked load, change and save cannot close is a follow-up unless the owner widens scope; callers such as `trash.ts:335`, `:1280` must not nest); Task 24 (`pnpm test:e2e` needs port 6006 free; knip is compared by section, not exit code).
