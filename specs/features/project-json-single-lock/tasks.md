# Tasks: Overlapping saves to a project's settings file or a resource's metadata keep every change (Feature 92)

Source spec: `specs/features/project-json-single-lock.md` (FR-1..FR-23, US-1; Gate 3 answers OQ-1..OQ-8 of 2026-10-23 are folded in; revised at Gate 5, 2026-10-23, see below). Parent: `specs/product/getwrite.features.md` Feature 92. Branch: `fix/project-json-write-lock`, main checkout. Format precedent: `specs/features/font-picker-and-typography-inputs/tasks.md`. Granularity: story points (1/2/3/5/8); S = 1-2, M = 3, L = 5.

Revised (Owner decision, Gate 5, 2026-10-23; option 2, scope expanded to sidecars). Tasks 1 and 2 are DONE (commits `ce84dc34` and `de1012fa`) and are unchanged in substance. The list below is renumbered: old Tasks 5-13 are now 7-15 (the lock primitive is per-file; the family A to E moves are unchanged in intent), and old Tasks 14-19 are now 22-27. Old-to-new: 1=1, 2=2, 3=3, 4=4, 5=7, 6=8, 7=9, 8=10, 9=11, 10=12, 11=13, 12=14, 13=15, 14=22, 15=23, 16=24, 17=25, 18=26, 19=27. New tasks: 5, 6 (sidecar measurements and red tests before any lock code), 16 (the sidecar sink), 17-20 (the sidecar writer families) and 21 (sidecar acceptance). Tasks 3, 23, 24, 25 and 26 are extended to sidecars, and their estimates were raised for it (3: 3 to 5; 23: 3 to 5; 24: 3 to 5; 26: 2 to 3). Any earlier reference to a task number (in a commit message, POS note or experiments.md section) refers to the old numbering.

Shape of the work: measure first, then the lock.
- Tasks 1-6: baselines and every "before" measurement: the FR-15 sidecar race experiment (done), the FR-16 cross-request read check (project.json and sidecars), the FR-10 race test changed to assert both changes so that it fails on the unchanged tree, the remaining sidecar families measured (Task 5), and the three FR-15 sidecar pairs as suite tests that fail on the unchanged tree (Task 6). No lock code changes before these are recorded.
- Task 7: the new per-file lock primitive. Tasks 8-15: each `project.json` writer family moved onto it (A, E, D, C in three parts, B). Task 15: the FR-10 test passing.
- Task 16: the sidecar sink. Tasks 17-20: each sidecar writer family moved onto it. Task 21: the sidecar acceptance tests passing.
- Tasks 22-25: pairwise race tests, runtime guard and source scan, deadlock test, failure propagation. Task 26: docs. Task 27: final suites.

Measurements go in `specs/features/project-json-single-lock/experiments.md`, in the style of `specs/features/font-picker-and-typography-inputs/experiments.md` (environment record, method, observed values, what was not measured). Each item is MEASURED (observed in a run, stated as values) or UNMEASURED (not run, with the reason). A measurement states what was observed; no cause is written (CLAUDE.md: a measurement is a fact, a cause is a hypothesis). Task 1 created the file.

FR coverage: FR-1: 7, 8. FR-2: 13. FR-3: 14. FR-4: 11, 12, 13. FR-5: 10. FR-6: 9, 16. FR-7: 8. FR-8: 7, 23, 26. FR-9: 23. FR-10: 4, 15. FR-11: 22. FR-12: 24. FR-13: 8, 25, 27. FR-14: 7, 25. FR-15: 2, 5. FR-16: 3. FR-17: 26. FR-18: 1, 27. FR-19: 16, 17, 18, 19, 20. FR-20: 16. FR-21: 17. FR-22: 5, 6, 21. FR-23: 16, 17, 18, 19, 20, 25.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Work in the main checkout on branch `fix/project-json-write-lock`. No worktrees; do not switch branches. Implementors do not commit and do not push; the orchestrator commits. Leave the pipeline's uncommitted edits to `specs/product/getwrite.features.md` and `specs/product/getwrite.md` alone.
- Throwaway data only. Tests and experiments use temp directories under `$TMPDIR` or the scratchpad. NEVER read, list or write the repo's `projects/`, `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite` or `~/Library/Logs/*`.
- Before any task that runs `pnpm test:e2e`, run `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` and record it. `pnpm test:e2e` builds and serves Storybook itself on :6006: never start `pnpm storybook` first; if 6006 is held, stop and report. Never stop a process the task did not start; stop only started pids, by pid.
- The lock is a single-process, no-timeout, no-new-failure-path mechanism (OQ-111, OQ-112). Scope (Gate 5, 2026-10-23): `project.json` and each resource sidecar. `meta/index/*`, `backlinks.json`, `relationships.json` and writing-log files are not touched. OQ-9 (stale whole-object client writes) and OQ-10 (trash move and restore of a sidecar) are open: do not change a route contract or the trash paths for them; report if a task seems to need it.
- TDD (`docs/standards/testing.md`): write the named test first and show it failing for the stated reason, then passing. Extend an existing test file before creating one. Code follows `docs/standards/typescript-implementation.md`, `failure-visibility.md`, `storage-context.md`. A single writer on an idle project must behave exactly as before (FR-13): existing tests stay green without edits, except the one assertion Task 4 changes. The Task 6 and Task 21 tests are new tests, not edits to existing ones.
- Verification vocabulary, from `frontend/` unless stated: `pnpm typecheck`; `pnpm lint`; `pnpm exec vitest run <file>`; `pnpm test:ci`; `pnpm test:e2e`; from the repo root `pnpm knip`.
- Halt rule: if a task cannot meet its done condition, leave it unticked, record why, and report; do not work around it.

### Task 1: Baselines on the unchanged tree, and create experiments.md
**What:** Record the pre-change results of every final suite and create `experiments.md` with an environment record and a "Baselines" section.
**Files:** Creates `specs/features/project-json-single-lock/experiments.md`. No source change.
**Done when:** `experiments.md` states, each as an observed value with command and date: `git rev-parse HEAD` and `git status --short`; the `lsof` output (6006 confirmed free before e2e); from `frontend/`, `pnpm typecheck` (exit code), `pnpm lint` (error and warning counts), `pnpm test:ci` (passed / failed / skipped) and `pnpm test:e2e` (counts and names of failures); from the repo root `pnpm knip` (finding count); `pnpm --filter getwrite-cli test` and `pnpm --filter getwrite-electron test` (counts). A command that cannot run is recorded as not run with the reason. `git status --short` shows no change outside `specs/`.
**Depends on:** none
**Estimate:** 3
**Notes:** DONE 2026-10-23, commit `ce84dc34`. Satisfies FR-18 (baseline half). `pnpm test:e2e` runs outside the sandbox. Earlier figures are reported, not current; measure.
**Done:** [x]

### Task 2: FR-15 sidecar race experiment on main
**What:** Run a race experiment for each pair of sidecar writers that hold different lock families and record counts of lost changes.
**Files:** Creates an experiment script or test under `specs/features/project-json-single-lock/scripts/` (not run by the suite); appends a "FR-15 sidecar races" section to `experiments.md`. No source change.
**Done when:** `experiments.md` records, for at least these pairs and at least 20 repetitions per pair on `main`: `writeSidecar` (`withMetaLock`) against `updateRevisionInPlace` (`revision-content:` `acquireLock`, `revision-core.ts:445-447`); `writeSidecar` against `forEachUserMetadata` (`metadata-schema.ts:307-334`); `updateRevisionInPlace` against `forEachUserMetadata`. Each pair states repetitions, number of lost changes and number of unparseable files, as observed values with no cause, and the temp-directory path used. A closing line states whether any pair reproduced a lost update; if one did, the task is reported to the lead as a scope question and Tasks 7 onward are not changed by it.
**Depends on:** 1
**Estimate:** 3
**Notes:** DONE 2026-10-23, commit `de1012fa`. Result (experiments.md, 100 repetitions per pair): `writeSidecar` against `updateRevisionInPlace` 41 lost, `writeSidecar` against `forEachUserMetadata` 10 lost, `updateRevisionInPlace` against `forEachUserMetadata` 0 lost, 0 unparseable. Gate 5 (Owner decision, 2026-10-23, option 2) brought sidecars into scope; Tasks 5, 6 and 16-21 and the sidecar parts of Tasks 3, 23-26 follow from it. The Done-when text above is as written before the run. Satisfies FR-15 (OQ-110). Runs in the sandbox with Vitest or `tsx`; temp directories only.
**Done:** [x]

### Task 3: FR-16 cross-request read check
**What:** Read each caller of the writers in both inventories (`project.json` and sidecar) and record every route or core that reads `project.json` or a sidecar in one request, or in one function, and writes it in a later one; confirm or correct the sidecar read-then-`writeSidecar` list.
**Files:** Appends a "FR-16 cross-request reads" section to `experiments.md`. No source change. Revised at Gate 5: adds the sidecar inventory.
**Done when:** `experiments.md` lists, per writer family in the spec's inventory, the callers read (file:line) and a result: a list of read-in-one-request-write-in-a-later-one writers with file:line, or "none found". `POST /api/project/features` and its wholesale `config.subtypes` / `config.relationshipTypes` replacement (`docs/features/project-configuration.md:20`) is explicitly addressed. For sidecars the section lists, with file:line: every `readSidecar` caller that later calls `writeSidecar` or `updateSidecarCore` (confirming or correcting the spec's S1 to S4 list and the "read-only callers" list, which were identified by `grep` only), every caller that passes a whole object built from an earlier read in another function or request (the client senders of `updateSidecarCore` and `setNoiseTermDismissedCore` are addressed explicitly, including whether a client-sent `updatedAt` reaches the stored sidecar), and the trash move and restore paths (`trash.ts:335`, `:862`) as input to OQ-10. Each finding is labelled READ (not run) or MEASURED. For each writer found, a follow-up POS note is recorded (`sab`, per the `saboteur-pos` skill) and its id is written in the section; no route contract is changed.
**Depends on:** 1
**Estimate:** 5
**Notes:** Satisfies FR-16 (OQ-113, OQ-8 option b; extended at Gate 5). Read-only task. Estimate raised from 3 to 5 for the second file kind. Findings are inputs to OQ-9 and OQ-10, which the owner resolved at the Gate 5 re-gate as option a (follow-ups, no contract change); a writer it finds that the spec does not list is added to Task 20.
**Done:** [ ]

### Task 4: Make the FR-10 race test assert both changes, and show it fails today
**What:** Change `an editor-style save racing a schema change` to assert the editor font size and the new field are both present, and record that it fails on the unchanged lock code.
**Files:** Modifies `frontend/tests/unit/metadata-concurrent-writes.test.ts` (`:132-165`); appends a "FR-10 before" section to `experiments.md`.
**Done when:** after `Promise.all([updateEditorConfigCore({ body: { fontSize: "19px" } }), addField("custom-group", { key: "mood", ... })])`, each of 20 repetitions asserts the file parses, contains `fontSize: "19px"` in the editor config body, and contains the `mood` field. Run 9 times on the unchanged lock code with `pnpm exec vitest run tests/unit/metadata-concurrent-writes.test.ts`; `experiments.md` records the 9 results (repetitions that failed per run), and the test fails in each run. Every other test in the file is unchanged and passes.
**Depends on:** 1
**Estimate:** 2
**Notes:** Satisfies FR-10 (before half). The test is expected to be red until Task 15; the orchestrator does not commit a red tree as done, so this task's red state is recorded and Tasks 5-15 follow on the same branch.
**Done:** [ ]

### Task 5: Sidecar race baselines for the remaining writer families
**What:** On the unchanged tree, measure each sidecar writer family of the spec's inventory that Task 2 did not cover, against a metadata save, and record the counts.
**Files:** Extends `specs/features/project-json-single-lock/scripts/fr15-sidecar-races.test.ts` (and its config) with one pair per family; appends a "FR-15 sidecar races, remaining families" section to `experiments.md`. No source change.
**Done when:** `experiments.md` records, for each of `setNoiseTermDismissedCore`, `renameResourceSidecarCore`, `reorderResourcesCore`'s sidecar loop, `nullifyResourceRefs`, `relinkResourceRefs` and `applyDocumentMetadata`, each against a metadata save (`readSidecar` then `writeSidecar`, a distinct field), at least 20 repetitions on the unchanged tree: repetitions, lost changes, unparseable files and rejected promises, as observed values with no cause, the temp-directory path used, command and date. A family that cannot be driven without a fixture it needs (for example a trashed resource for `relinkResourceRefs`) is recorded as not run with the reason. Also records, from one run of 100 repetitions, `setNoiseTermDismissedCore` against itself with two different terms (the cross-function case of FR-21), counting terms lost. Also records two measurements that change no contract and no source (OQ-9 and OQ-10, option a each, Gate 5 re-gate, 2026-10-23), each at least 20 repetitions: (1) stale client `updatedAt`: after a canonical save sets `updatedAt`, a metadata save (`updateSidecarCore`) carrying an older client `updatedAt`; per repetition whether the stored `updatedAt` is the older value, with the count; (2) trash against a sidecar update: `updateSidecarCore` called right after `softDeleteResource` for the same resource, and, as a separate run, overlapping it; per run whether `meta/resource-<id>.meta.json` exists afterwards (a live sidecar for a trashed resource), with the count. Both are recorded as observed values with no cause, and (2) feeds a follow-up POS note the lead creates. A closing line states which families reproduced a lost update. No result changes scope: FR-19 covers every read-modify-write.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-15 (extended), FR-22 (measurement half). Estimate raised from 3 to 5 at the Gate 5 re-gate for the two added measurements; the two added measurements satisfy the OQ-9 and OQ-10 decisions. They must not change `trash.ts` or `updateSidecarCore` behaviour. Measurement before lock code, as for Tasks 2 and 4. The script lives outside the suite as Task 2's does. Temp directories only.
**Done:** [ ]

### Task 6: Sidecar race tests as suite tests, red on the unchanged tree
**What:** Turn the three FR-15 pairs into suite tests of 100 repetitions asserting both changes are kept, and record that the two reproducing pairs fail on the unchanged tree.
**Files:** Creates `frontend/tests/unit/sidecar-concurrent-writes.test.ts` (or extends `metadata-concurrent-writes.test.ts`; decided by reading, extending preferred if it fits); appends a "FR-22 before" section to `experiments.md`.
**Done when:** the file holds three tests using the pair constructions of `specs/features/project-json-single-lock/scripts/fr15-sidecar-races.test.ts` (metadata save against `updateRevisionInPlace`; metadata save against `clearField` through `forEachUserMetadata`; `updateRevisionInPlace` against `forEachUserMetadata`), each of 100 repetitions asserting that the sidecar parses and both writers' changes are present. Run on the unchanged lock code: the first two fail and the third passes; `experiments.md` records, per test, the number of repetitions that lost a change, compared with the Task 2 values (41 and 10 changes lost in 100 repetitions). Each test has a timeout that fails the test, not the suite. Every other test in the repository is unchanged.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-22 (before half). Red by design until Task 21; like Task 4 the red state is recorded and Tasks 7-21 follow on the same branch. The distinct-field construction is the one that measured the loss; keep it.
**Done:** [ ]

### Task 7: The per-file lock primitive
**What:** Add a small module owning the per-file lock: callback form only, no exposed release, its own key map, one key per file path, `path.resolve(filePath)`. Used for `project.json` and, in later tasks, for each sidecar.
**Files:** Creates `frontend/src/lib/file-lock.ts` (name decided by reading `frontend/src/lib/` conventions; it replaces the earlier working name `project-json-lock.ts`) and `frontend/tests/unit/file-lock.test.ts`. Adds no importer yet.
**Done when:** tests that fail first (module absent) and pass: two calls for the same file path run one after the other, in call order; two different paths (for example `/p/project.json` and `/p/meta/resource-x.meta.json`) do not block each other; `"/a/b"`, `"/a/b/"` and `"/a/b/../b"` share one lock; a callback that throws (or rejects) propagates the same error object to its caller and a later call on the same root runs; a callback return value is returned unchanged; there is no timeout (a call waits for a slow earlier call); the module exports no release function; its key map is not the one used by `withMetaLock` or `acquireLock` (test: a `withMetaLock(root)` call and a primitive call for the same path run concurrently); a key is removed from the map when its last call finishes (test: the map is empty after many distinct paths have each been locked and released). The module's doc comment states the lock-order rule of FR-8 (the allowed edges `acquireLock(*) -> file lock` and `withMetaLock -> file lock`; nothing, including a second file lock, is acquired while holding it). `pnpm typecheck`, `pnpm lint` and the test file pass.
**Depends on:** 4, 5, 6
**Estimate:** 3
**Notes:** Revised at Gate 5: per-file instead of per-root, and it waits on the new measurement tasks 5 and 6 so that no lock code precedes the sidecar "before" measurements. Satisfies FR-1 (primitive; OQ-1 option c revised, OQ-2), FR-8 (doc comment), FR-14 (release on throw). No `realpath`. Do not use `node:async_hooks` here (the native shim does not propagate across `await`).
**Done:** [ ]

### Task 8: Build updateProjectJson on the primitive (family A) with the durable argument
**What:** Rebuild `updateProjectJson` on the per-file primitive (key: the resolved path of the project's `project.json`), add an optional `durable` argument, and leave the five family A callers unchanged.
**Files:** Modifies `frontend/src/lib/project-json-write.ts` (`:115-134` and the header comment); extends `frontend/tests/unit/project-json-write.test.ts` (find the existing test file by reading; create only if none).
**Done when:** tests that fail first and pass: `updateProjectJson` no longer calls `withMetaLock`; with `durable: true` the write is the durable form `atomicWriteFile` offers and without it the write is as before; the written bytes (key order included), return value and thrown errors of a single call are identical to before for a fixed input set; two overlapping `updateProjectJson` calls on one root keep both changes. All existing tests for `editor-config-core.ts`, `project-crud-core.ts`, `project-preferences-core.ts`, `revision-settings.ts`, `tags.ts` pass without edits. `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run tests/unit/project-json-write.test.ts tests/unit/metadata-concurrent-writes.test.ts` (the FR-10 test may remain red until Task 15).
**Depends on:** 7
**Estimate:** 3
**Notes:** Satisfies FR-1, FR-7, FR-13 (OQ-6: `durable` optional, default unchanged). Family A callers' mutate callbacks, results and `updatedAt` handling must not change.
**Done:** [ ]

### Task 9: Family E: the sidecar metadataRevision bump
**What:** Move `bumpMetadataRevision` onto the per-file primitive (the `project.json` key) while `writeSidecar` keeps its outer `withMetaLock`.
**Files:** Modifies `frontend/src/lib/models/sidecar.ts` (`:27-47`, `:174-181` and the comment at `:176-178`); extends the sidecar tests found by reading.
**Done when:** tests that fail first and pass: a sidecar write bumps `metadataRevision` by exactly 1 with the edge `withMetaLock -> project.json lock`; ENOENT on `project.json` is still ignored and any other read, parse or write error still reaches the caller; the sidecar write itself is still inside `withMetaLock`; the stale comment is replaced. `pnpm typecheck`, `pnpm lint`, targeted vitest and the existing sidecar tests pass.
**Depends on:** 8
**Estimate:** 2
**Notes:** Satisfies FR-6. Must not call `withMetaLock` or `acquireLock` from inside the primitive. At this point the bump is still called inside `writeSidecar`'s `withMetaLock` but outside any sidecar file lock (none exists yet); Task 16 keeps it so (FR-20).
**Done:** [ ]

### Task 10: Family D: updateFeatureConfig
**What:** Move `updateFeatureConfig` onto the primitive inside its outer `acquireLock(projectRoot)`.
**Files:** Modifies `frontend/src/lib/models/project-features.ts` (`:104-145` and the comment at `:130-132`); extends its existing test.
**Done when:** tests that fail first and pass: the read, mutate and write happen inside the primitive, under the kept `acquireLock(projectRoot)`; `updatedAt` is set; `metadataRevision` is not bumped; results and errors for a single call are unchanged; existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 8
**Estimate:** 2
**Notes:** Satisfies FR-5 (OQ-3 option b).
**Done:** [ ]

### Task 11: Family C part 1: withLockedSchema and writeProject
**What:** Make the 13 schema operations that go through `withLockedSchema` do their read, mutate and write inside the primitive, under the kept outer lock.
**Files:** Modifies `frontend/src/lib/models/metadata-schema.ts` (`:60`, `:100-114` and the comment at `:61-63`); extends the existing metadata-schema tests.
**Done when:** tests that fail first and pass: each of `addField`, `removeField`, `deprecateField`, `reorderFields`, `renameField`, `updateFieldOptions`, `addGroup`, `renameGroup`, `removeGroup`, `reorderGroups`, `updateRefProperties`, `updateFieldAppliesTo`, `changeFieldType` leaves the same file content as before for a fixed input set, bumps `metadataRevision` once per write and none when nothing changed; the read is inside the primitive; `acquireLock(projectRoot)` remains the outer lock. Existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run` on the metadata-schema test files.
**Depends on:** 8
**Estimate:** 3
**Notes:** Satisfies FR-4 (part), FR-2. Read the callers listed at `:506-896` before editing.
**Done:** [ ]

### Task 12: Family C part 2: rename, change-type and options with migration
**What:** Move `renameFieldKeyInSchema`, `changeFieldTypeWithMigration` and `updateFieldOptionsWithMigration` schema writes onto the primitive.
**Files:** Modifies `frontend/src/lib/models/metadata-schema.ts` (`:778-802`, `:951-981`, `:1096-1130`); extends the existing tests.
**Done when:** tests that fail first and pass: the schema write is inside the primitive under the kept outer `acquireLock(projectRoot)`; the sidecar migrations still run after the outer lock is released (a test asserts the order); results, `metadataRevision` bumps and errors for a single call are unchanged; existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 11
**Estimate:** 3
**Notes:** Satisfies FR-4 (part). The migrations stay outside any project-wide lock (non-goal).
**Done:** [ ]

### Task 13: Family C part 3: migrateProjectOnLoad and the getSchema migration write
**What:** Put the lock-held re-read and write of `migrateProjectOnLoad` and `getSchema` inside the primitive.
**Files:** Modifies `frontend/src/lib/models/metadata-schema.ts` (`:389-438`, `:475-496`); extends the existing tests.
**Done when:** tests that fail first and pass: the first read outside the lock only decides whether to work; the read a write is based on is repeated inside the primitive (a test interleaves a change between the two reads and sees it kept); when no migration is needed no write occurs; `project-loader.ts:97` behaviour is unchanged; existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 12
**Estimate:** 2
**Notes:** Satisfies FR-2, FR-4 (part). Depends on Task 12 only to serialise edits to `metadata-schema.ts`.
**Done:** [ ]

### Task 14: Family B: the five withMetaLock setters
**What:** Move the five family B setters onto the primitive, keeping their written form and the durable write.
**Files:** Modifies `frontend/src/lib/models/word-count-goal-core.ts` (`:55-70`), `writing-log-core.ts` (`:181-196`), `mention-highlight-duration-core.ts` (`:63-76`), `entity-graph-settings-core.ts` (`:124-131`), `project-noise-words-core.ts` (`:113-125`); extends their existing tests. (Paths verified by reading before editing.)
**Done when:** tests that fail first and pass: each setter reads and writes `project.json` inside the primitive, passing `process.env.GETWRITE_DURABLE_META === "1"` as the helper's `durable` argument (a test sets the variable and asserts the durable write); the same `config` change and no added `updatedAt`; the raw-config display read in `project-noise-words-core.ts:85-91` stays outside the lock and is not written back. Existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 8
**Estimate:** 3
**Notes:** Satisfies FR-3 (OQ-6).
**Done:** [ ]

### Task 15: FR-10 race test passes nine times
**What:** Run the changed FR-10 test against the new lock and record nine consecutive passing runs.
**Files:** Appends a "FR-10 after" section to `experiments.md`. No source change expected.
**Done when:** `pnpm exec vitest run tests/unit/metadata-concurrent-writes.test.ts` passes in each of 9 consecutive runs, with 20 of 20 repetitions in each run keeping both `fontSize: "19px"` and `mood`; the 9 results are in `experiments.md` next to the Task 4 results. If any run loses a change, the task halts and reports the observed counts.
**Depends on:** 11, 12, 13
**Estimate:** 2
**Notes:** Satisfies FR-10 (hard acceptance).
**Done:** [ ]

### Task 16: The sidecar read-modify-write sink and the no-nesting sequence
**What:** Add one read-modify-write function for a sidecar in `sidecar.ts` (read, mutate, atomic write, all under that sidecar's file lock, inside `withMetaLock`), make whole-object `writeSidecar` take the same lock for its write, and keep the `metadataRevision` bump outside the sidecar lock.
**Files:** Modifies `frontend/src/lib/models/sidecar.ts` (`readSidecar` stays unlocked; `writeSidecar` at `:150-190` and its doc comment; the new function, name decided at implementation); extends the existing sidecar tests found by reading.
**Done when:** tests that fail first and pass: two overlapping calls of the new function on one resource both land (the second sees the first's change); a call for another resource is not blocked by the first; within one call the order is `withMetaLock` taken, sidecar file lock taken, read, mutate, atomic write, sidecar lock released, then the `project.json` file lock taken for the bump (a test records the acquisition order and asserts the bump never runs while the sidecar lock is held, FR-20); `mutate` returning "no change" writes nothing and bumps nothing; `metadataRevision` rises by exactly 1 per write; ENOENT on `project.json` is still ignored in the bump; the entity rescan decision uses the value read inside the lock; the mutate callback calling `writeSidecar` or the sink throws under the guard of Task 23 (checked there); a missing sidecar reaches `mutate` as `null`; a locked-access error propagates unchanged and the write does not proceed; the written bytes, background index enqueue and entity rescan enqueue for a single call are identical to before. Whole-object `writeSidecar` produces identical bytes and takes the sidecar lock for its write. All existing sidecar tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 7, 9
**Estimate:** 5
**Notes:** Satisfies FR-19 (sink), FR-20, FR-23 (part). L because it changes the one function every sidecar writer calls and must keep the lock order of the spec's "Lock order" section. Design fixed by FR-20; no other lock layout is to be tried without reporting. Does not move any caller yet (Tasks 17-20).
**Done:** [ ]

### Task 17: Move updateSidecarCore and the resource-crud-core sidecar writers onto the sink
**What:** Convert `updateSidecarCore`, `setNoiseTermDismissedCore` and `renameResourceSidecarCore` to the sidecar read-modify-write function, computing the new value inside the mutate callback.
**Files:** Modifies `frontend/src/lib/models/resource-crud-core.ts` (`updateSidecarCore` `:492-540`, `setNoiseTermDismissedCore` `:619-642`, `renameResourceSidecarCore` `:691-707`); extends the existing tests for those functions found by reading.
**Done when:** tests that fail first and pass: `updateSidecarCore` merges the client update over the value read inside the lock and still drops `wordCount`, keeps `orderIndex` and `folderId` from the stored value, applies `clearKeys`, creates the sidecar when none exists, and propagates a locked-access error instead of writing; its post-write entity-graph-position clearing (`:545` onward) still runs after the write and outside the lock; `setNoiseTermDismissedCore` called twice at once with two different terms keeps both (the case Task 5 measured); `renameResourceSidecarCore` returns the same object as before and returns `null` for a missing sidecar without writing; single-call results, written bytes and errors are identical to before; existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 16
**Estimate:** 3
**Notes:** Satisfies FR-19, FR-21, FR-23. The route and transport contracts (`app/api/resource/[resource-id]/sidecar/route.ts`, `native-resource-backend.ts`) do not change (OQ-9 option a: no contract change).
**Done:** [ ]

### Task 18: Move updateRevisionInPlace's sidecar update onto the sink
**What:** Replace the `readSidecar` plus `writeSidecar` pair at the end of `updateRevisionInPlaceLocked` with the sidecar read-modify-write function.
**Files:** Modifies `frontend/src/lib/models/revision-core.ts` (`:517-532`); extends the existing revision-core tests found by reading.
**Done when:** tests that fail first and pass: the sidecar update sets `updatedAt` and, when content was synced, `wordCount` on the value read inside the lock, and leaves every other key as stored (a concurrent metadata edit between the content write and the sidecar update is kept); the `revision-content:` `acquireLock` still wraps the whole function; the lock edges taken are `acquireLock(revision-content) -> withMetaLock -> sidecar lock`, never the reverse; the returned object, `snapshotCreated`, `writingLog` and thrown errors are identical to before; `tests/unit/revision-concurrent-saves` and all existing revision tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 16
**Estimate:** 2
**Notes:** Satisfies FR-19, FR-23. The content write and its lock are untouched; only the sidecar update changes.
**Done:** [ ]

### Task 19: Move forEachUserMetadata onto the sink
**What:** Make `forEachUserMetadata` do its read, mutate and write per sidecar through the sidecar read-modify-write function, one sidecar at a time.
**Files:** Modifies `frontend/src/lib/models/metadata-schema.ts` (`:307-334`, and the four callers `:578`, `:770`, `:917`, `:1025` only if their callback shape must change); extends the existing metadata-schema tests.
**Done when:** tests that fail first and pass: the `readdir` of `meta/` only lists ids; each sidecar's read, `mutate(userMetadata)` and write happen inside its own lock; a sidecar without a readable `userMetadata` object is skipped without a write; `mutate` returning `false` writes nothing; `clearField`, `renameFieldKey`, `changeFieldType`/`changeFieldTypeWithMigration` and `updateFieldOptionsWithMigration` leave the same sidecar bytes as before for a fixed input set, and their schema writes still release `acquireLock(projectRoot)` before the sweep (the existing order test of Task 12 still passes); no lock is held across the sweep; a read error that reached the caller before still does. Existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 13, 16
**Estimate:** 2
**Notes:** Satisfies FR-19, FR-23. Depends on Task 13 to serialise edits to `metadata-schema.ts`. Do not run in parallel with Tasks 11-13.
**Done:** [ ]

### Task 20: Move the remaining sidecar read-then-write sequences onto the sink
**What:** Convert `reorderResourcesCore`'s sidecar loop, `nullifyResourceRefs`, `relinkResourceRefs`, `applyDocumentMetadata` and any further writer Task 3 found, to the sidecar read-modify-write function.
**Files:** Modifies `frontend/src/lib/models/resource-crud-core.ts` (`:895-912`), `frontend/src/lib/models/trash.ts` (`nullifyResourceRefs` `:174-240`, `relinkResourceRefs` `:716-784`), `frontend/src/lib/models/scrivener/apply-document-metadata.ts` (`:97-133`), plus the files for any Task 3 finding; extends the existing tests for each.
**Done when:** tests that fail first and pass: each writer reads the sidecar inside the sink and computes its new value from that read; `reorderResourcesCore` still logs and continues when one sidecar fails, and merges `orderIndex` and `folderId` as before (`ro.folderId ?? existing?.folderId ?? null`); `nullifyResourceRefs` returns the same cleared entries and `relinkResourceRefs` the same restored and not-restored lists, and neither holds a sidecar lock while calling the other or any lock; `applyDocumentMetadata` returns the same result object; single-call bytes, results and errors are identical to before; existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 3, 16
**Estimate:** 3
**Notes:** Satisfies FR-19, FR-23. The trash move and restore of a sidecar (`trash.ts:335`, `:862`) are not changed here (OQ-10, option a). The creation paths (new id) are not converted; they use whole-object `writeSidecar`.
**Done:** [ ]

### Task 21: Sidecar race acceptance tests pass nine times
**What:** Run the Task 6 suite tests and the per-family tests from Task 5 against the new lock and record nine consecutive passing runs.
**Files:** Extends the Task 6 test file with one test per remaining family (20 repetitions each, against a metadata save, distinct fields); appends a "FR-22 after" section to `experiments.md`.
**Done when:** the three FR-15 pair tests (metadata save against `updateRevisionInPlace`, metadata save against `clearField`, `updateRevisionInPlace` against `forEachUserMetadata`) each pass at 100 of 100 repetitions with both changes kept in each of 9 consecutive runs of `pnpm exec vitest run <file>`; the per-family tests pass 20 of 20 in each run; the nine results are in `experiments.md` next to the Task 6 and Task 5 values. If any run loses a change, the task halts and reports the observed counts: that falsifies the read-outside-the-lock hypothesis for that pair.
**Depends on:** 5, 6, 17, 18, 19, 20
**Estimate:** 3
**Notes:** Satisfies FR-22 (hard acceptance).
**Done:** [ ]

### Task 22: Pairwise race tests
**What:** Add a race test for each pair of writer families that can now overlap.
**Files:** Creates `frontend/tests/unit/project-json-lock-pairs.test.ts` (or extends `metadata-concurrent-writes.test.ts`; decided by reading).
**Done when:** each of these pairs runs 20 repetitions asserting both changes are in `project.json` and that it parses: D with B (`updateFeatureConfig` against `setWordCountGoalCore`), D with A, D with C, E with C (final `metadataRevision` equals the start value plus the number of writes, and the schema change present), E with B, E with D, B with C. (A with C is Task 15.) Each pair test fails against the pre-feature lock code (shown by running it on a stash or recorded in `experiments.md` as observed counts) where the pair lost updates, or is recorded as not lost on `main` with its counts. `pnpm typecheck`, `pnpm lint`, targeted vitest pass.
**Depends on:** 9, 10, 14, 15
**Estimate:** 5
**Notes:** Satisfies FR-11. L because seven pairs each need their own fixtures; a shared parametrised helper is allowed.
**Done:** [ ]

### Task 23: Source scan test and test-only runtime guard
**What:** Add a source scan that fails on any unlisted `project.json` or sidecar read-then-write, and a runtime guard active only in tests that throws on re-entry or on any lock, including a second file lock, taken while a file lock is held.
**Files:** Creates `frontend/tests/unit/project-json-lock-scan.test.ts` (convention: the existing `*-locked-access-scan` tests); modifies `frontend/src/lib/file-lock.ts`, `frontend/src/lib/meta-locks.ts`, `frontend/src/lib/locks.ts` for the guard hook; extends `frontend/tests/unit/file-lock.test.ts`.
**Done when:** tests that fail first and pass: the scan fails for a fixture module that reads then writes `project.json` outside the helper and passes for the real tree with a written allow-list (creation and import writers per the spec's "Other writers found"); under test, a `withMetaLock` or `acquireLock` call from inside a file lock callback throws, and a nested file lock call throws, for the same file and for another (including a sidecar lock taken inside the `project.json` lock and the reverse); a sidecar mutate callback that calls `writeSidecar` or the sink throws; the scan also fails for a fixture module that calls `readSidecar` and later `writeSidecar` for one sidecar outside the sink, and passes for the real tree with a written allow-list (creation and import writers that write a new id; the importers' read-only `readSidecar` uses); outside tests the guard does nothing and the production bundle does not import `node:async_hooks` (a test or `pnpm build` file search of the guard module's imports records this); the allowed edges `acquireLock(*) -> file lock` and `withMetaLock -> file lock`, the existing `acquireLock(revision-content) -> withMetaLock`, and the sequential `withMetaLock -> sidecar lock` then `withMetaLock -> project.json lock` of the sink do not throw. `pnpm typecheck`, `pnpm lint`, targeted vitest, and from `frontend/` `pnpm build` pass.
**Depends on:** 9, 10, 11, 12, 13, 14, 17, 18, 19, 20
**Estimate:** 5
**Notes:** Satisfies FR-8, FR-9 (OQ-5 option b; extended to sidecars at Gate 5). Estimate raised from 3 to 5 for the sidecar scan and the second-file-lock rule. No production guard: the native `async_hooks` shim (`src/native-shims/async-hooks.mjs`, `next.config.mjs` aliases) does not propagate across `await`. `pnpm build` runs outside the sandbox in the main checkout.
**Done:** [ ]

### Task 24: Deadlock test
**What:** Run an operation from every family concurrently on one project, in several orderings, and fail on any repetition that does not finish within 5 s.
**Files:** Creates `frontend/tests/unit/project-json-lock-deadlock.test.ts`.
**Done when:** the test runs, concurrently on one project, at least one operation from each of families A to E plus `changeFieldTypeWithMigration`, and at least one writer from each of the sidecar families S1 to S4 on the same resource (`updateSidecarCore`, `updateRevisionInPlace`, `clearField` through `forEachUserMetadata`, and `setNoiseTermDismissedCore` or `renameResourceSidecarCore`), and, if OQ-10 is decided as option (a), the trash move and restore of a sidecar, in at least 3 orderings and 20 repetitions each; each repetition races a 5 s timer, and a hung repetition fails that test without timing out the suite; it passes with the guard of Task 23 active; the slowest repetition time is recorded in `experiments.md`; the bound is widened to 10 s only if CI flakes (not widened pre-emptively). `pnpm typecheck`, `pnpm lint`, targeted vitest pass.
**Depends on:** 21, 22, 23
**Estimate:** 5
**Notes:** Satisfies FR-12 (OQ-7 option a; extended to sidecars at Gate 5). Estimate raised from 3 to 5. Must include orderings that start `updateRevisionInPlace` (holding the `revision-content:` lock) before and after the other writers, to exercise the edge `acquireLock(revision-content) -> withMetaLock -> file lock`.
**Done:** [ ]

### Task 25: Failure propagation and single-writer behaviour
**What:** Prove that every kind of failure inside the lock reaches the caller unchanged and releases the lock, including `ProjectBusyError`, and that a single writer behaves as before, for `project.json` and for sidecars.
**Files:** Extends `frontend/tests/unit/file-lock.test.ts` or creates `frontend/tests/unit/project-json-lock-failures.test.ts`.
**Done when:** tests pass for each failure raised inside the lock: unreadable file, parse error, a mutate callback that throws, a failed write, a locked-access error, and `ProjectBusyError` raised through `runWithWriteBarrier` (`write-barrier.ts`) when a project is under conversion: the same error object reaches the caller, nothing is written for a throw before the write, a later write on the same root proceeds, and the write does not resolve as saved; a waiting write has no timeout. A single-writer snapshot test per family (A to E, S1 to S4) asserts file bytes, return value and error identical to a fixture captured from the unchanged tree; the sidecar failures covered are an unreadable sidecar, a parse error, a throwing mutate, a failed write and a locked-access error, each reaching the caller unchanged, writing nothing for a throw before the write, releasing the sidecar lock and not resolving as saved. `pnpm typecheck`, `pnpm lint`, targeted vitest pass.
**Depends on:** 21, 22
**Estimate:** 3
**Notes:** Satisfies FR-14, FR-23, FR-13 (OQ-4: `crypto/convert-project.ts` is excluded, protected by the write barrier). Estimate raised from 2 to 3 for the sidecar cases.
**Done:** [ ]

### Task 26: Documentation
**What:** Update the docs and stale comments for the new lock and the lock-order rule.
**Files:** Modifies `frontend/CLAUDE.md` (Locks bullet, line ~35), `docs/features/project-configuration.md` (line ~35), the `project-json-write.ts` header (if not already done in Task 8), and `docs/features/sidecars.md` (the sections on writes and Best Practices). Comments at `sidecar.ts:176-178`, `metadata-schema.ts:61-63`, `project-features.ts:130-132` are checked and corrected if Tasks 9-11 left any stale. The `Feature 92` status line in `specs/product/getwrite.features.md` is left to the pipeline lead.
**Done when:** `frontend/CLAUDE.md` states the project.json lock, its module, that it is innermost, the allowed edges and the test-only guard, and no longer says whether every read-modify-write is locked "is an open hypothesis"; `docs/features/project-configuration.md` names the new lock alongside `withMetaLock`; `docs/features/sidecars.md` states that a sidecar read-modify-write goes through the per-file lock with the read inside it, names the sink, and says a caller must not build a whole object from an earlier read; the comments named in FR-17 are corrected; if Task 3 recorded a sidecar cross-request writer (OQ-9) the claim in `sidecars.md` is narrowed to exclude it and names the POS follow-up; if Task 3 recorded a cross-request writer, the documentation claim is narrowed to exclude it and names the POS follow-up; a search for the old comment wording returns zero hits, recorded in `experiments.md`. `pnpm typecheck` and `pnpm lint` pass.
**Depends on:** 3, 24, 25
**Estimate:** 3
**Notes:** Satisfies FR-17, FR-8 (CLAUDE.md). Wording is a working copy. Estimate raised from 2 to 3 for `sidecars.md`.
**Done:** [ ]

### Task 27: Final suites
**What:** Run every final suite on the branch and record the results next to the Task 1 baselines.
**Files:** Appends a "Final suites" section to `experiments.md`. Modifies only tests or stories needed to make a genuine gap pass (each recorded).
**Done when:** `experiments.md` records, as observed values with command and date, compared with Task 1: from `frontend/`, `pnpm typecheck`, `pnpm lint`, `pnpm test:ci` and `pnpm test:e2e` (6006 confirmed free first; `pnpm storybook` stopped or never started; Storybook built and served by the command itself); from the repo root `pnpm knip` (no new findings); `pnpm --filter getwrite-cli test`; `pnpm --filter getwrite-electron test`. `lsof` before and after. A suite that cannot run is recorded as not run with the reason, never as passing; a failing suite is recorded, not worked around. `git status --short` shows only intended changes; no commit is made by the task.
**Depends on:** 26
**Estimate:** 3
**Notes:** Satisfies FR-18, FR-13. `pnpm test:e2e` runs outside the sandbox; stop only pids this task started.
**Done:** [ ]

## Summary
- Total tasks: 27
- Total estimated effort: 86 story points (S = 2 or less, M = 3, L = 5 for Tasks 3, 5, 16, 22, 23 and 24 only)
- Critical path: 1 → 4 → 7 → 8 → 11 → 12 → 13 → 19 → 23 → 24 → 26 → 27
- Risks: Tasks 5 and 6 (measurements: if the Task 5 families do not reproduce, FR-19 still moves them; a Task 6 test that does not fail on the unchanged tree for the two reproducing pairs means the experiment construction was not carried over, and the task halts); Task 3 (a cross-request writer, such as the features route's wholesale lists or the client's whole-object sidecar writes, cannot be fixed by a lock; it becomes a POS follow-up and a narrowed doc claim as the owner decided at OQ-9, option a); Task 4 and Task 6 (leave the tree red by design until Tasks 15 and 21); Task 16 (the one function every sidecar writer calls; the no-nesting sequence of FR-20 is the point of the task and a different lock layout must be reported, not tried); Tasks 11-13 and 19 (one large file, `metadata-schema.ts`, edited in four serial tasks; they must not run in parallel); Task 21 (the read-outside-the-lock cause is a hypothesis; a pair that still loses a change after the fix falsifies it for that pair and the task halts); Task 22 (seven pairs, sized L); Task 23 (the test-only guard hooks `locks.ts` and `meta-locks.ts`, which are used in the Capacitor native build; `pnpm build` and a check that production code does not import `node:async_hooks` guard this; `pnpm build:native` is not in the final suites and is a known pre-existing failure); Task 24 (the 5 s bound is unmeasured until its first run, and the added `revision-content` lock orderings are the least-tested edges); Task 27 (`pnpm test:e2e` takes a free port 6006); OQ-10 (decided option a at the Gate 5 re-gate: the trash move and restore stay unlocked and join no task; Task 5 measures whether a live sidecar is left for a trashed resource).
