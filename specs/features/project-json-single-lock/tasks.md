# Tasks: Overlapping saves to a project's settings file keep every change (Feature 92)

Source spec: `specs/features/project-json-single-lock.md` (FR-1..FR-18, US-1; Gate 3 answers OQ-1..OQ-8 of 2026-10-23 are folded in). Parent: `specs/product/getwrite.features.md` Feature 92. Branch: `fix/project-json-write-lock`, main checkout. Format precedent: `specs/features/font-picker-and-typography-inputs/tasks.md`. Granularity: story points (1/2/3/5/8); S = 1-2, M = 3, L = 5.

Shape of the work: measure first, then the lock.
- Tasks 1-4: baselines and every "before" measurement: the FR-15 sidecar race experiment, the FR-16 cross-request read check, and the FR-10 race test changed to assert both changes so that it fails on the unchanged tree. No lock code changes before these are recorded.
- Task 5: the new lock primitive. Tasks 6-12: each writer family moved onto it (A, E, D, C in three parts, B). Task 13: the FR-10 test passing.
- Tasks 14-17: pairwise race tests, runtime guard and source scan, deadlock test, failure propagation. Task 18: docs. Task 19: final suites.

Measurements go in `specs/features/project-json-single-lock/experiments.md`, in the style of `specs/features/font-picker-and-typography-inputs/experiments.md` (environment record, method, observed values, what was not measured). Each item is MEASURED (observed in a run, stated as values) or UNMEASURED (not run, with the reason). A measurement states what was observed; no cause is written (CLAUDE.md: a measurement is a fact, a cause is a hypothesis). Task 1 creates the file.

FR coverage: FR-1: 5, 6. FR-2: 11. FR-3: 12. FR-4: 9, 10, 11. FR-5: 8. FR-6: 7. FR-7: 6. FR-8: 5, 15, 18. FR-9: 15. FR-10: 4, 13. FR-11: 14. FR-12: 16. FR-13: 6, 17, 19. FR-14: 5, 17. FR-15: 2. FR-16: 3. FR-17: 18. FR-18: 1, 19.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Work in the main checkout on branch `fix/project-json-write-lock`. No worktrees; do not switch branches. Implementors do not commit and do not push; the orchestrator commits. Leave the pipeline's uncommitted edits to `specs/product/getwrite.features.md` and `specs/product/getwrite.md` alone.
- Throwaway data only. Tests and experiments use temp directories under `$TMPDIR` or the scratchpad. NEVER read, list or write the repo's `projects/`, `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite` or `~/Library/Logs/*`.
- Before any task that runs `pnpm test:e2e`, run `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` and record it. `pnpm test:e2e` builds and serves Storybook itself on :6006: never start `pnpm storybook` first; if 6006 is held, stop and report. Never stop a process the task did not start; stop only started pids, by pid.
- The lock is a single-process, no-timeout, no-new-failure-path mechanism (OQ-111, OQ-112). Sidecars are out of scope unless Task 2 reproduces a lost update (then stop and report: scope change needs the owner).
- TDD (`docs/standards/testing.md`): write the named test first and show it failing for the stated reason, then passing. Extend an existing test file before creating one. Code follows `docs/standards/typescript-implementation.md`, `failure-visibility.md`, `storage-context.md`. A single writer on an idle project must behave exactly as before (FR-13): existing tests stay green without edits, except the one assertion Task 4 changes.
- Verification vocabulary, from `frontend/` unless stated: `pnpm typecheck`; `pnpm lint`; `pnpm exec vitest run <file>`; `pnpm test:ci`; `pnpm test:e2e`; from the repo root `pnpm knip`.
- Halt rule: if a task cannot meet its done condition, leave it unticked, record why, and report; do not work around it.

### Task 1: Baselines on the unchanged tree, and create experiments.md
**What:** Record the pre-change results of every final suite and create `experiments.md` with an environment record and a "Baselines" section.
**Files:** Creates `specs/features/project-json-single-lock/experiments.md`. No source change.
**Done when:** `experiments.md` states, each as an observed value with command and date: `git rev-parse HEAD` and `git status --short`; the `lsof` output (6006 confirmed free before e2e); from `frontend/`, `pnpm typecheck` (exit code), `pnpm lint` (error and warning counts), `pnpm test:ci` (passed / failed / skipped) and `pnpm test:e2e` (counts and names of failures); from the repo root `pnpm knip` (finding count); `pnpm --filter getwrite-cli test` and `pnpm --filter getwrite-electron test` (counts). A command that cannot run is recorded as not run with the reason. `git status --short` shows no change outside `specs/`.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-18 (baseline half). `pnpm test:e2e` runs outside the sandbox. Earlier figures are reported, not current; measure.
**Done:** [ ]

### Task 2: FR-15 sidecar race experiment on main
**What:** Run a race experiment for each pair of sidecar writers that hold different lock families and record counts of lost changes.
**Files:** Creates an experiment script or test under `specs/features/project-json-single-lock/scripts/` (not run by the suite); appends a "FR-15 sidecar races" section to `experiments.md`. No source change.
**Done when:** `experiments.md` records, for at least these pairs and at least 20 repetitions per pair on `main`: `writeSidecar` (`withMetaLock`) against `updateRevisionInPlace` (`revision-content:` `acquireLock`, `revision-core.ts:445-447`); `writeSidecar` against `forEachUserMetadata` (`metadata-schema.ts:307-334`); `updateRevisionInPlace` against `forEachUserMetadata`. Each pair states repetitions, number of lost changes and number of unparseable files, as observed values with no cause, and the temp-directory path used. A closing line states whether any pair reproduced a lost update; if one did, the task is reported to the lead as a scope question and Tasks 5 onward are not changed by it.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-15 (OQ-110). Runs in the sandbox with Vitest or `tsx`; temp directories only.
**Done:** [ ]

### Task 3: FR-16 cross-request read check
**What:** Read each caller of the writers in the inventory and record every route or core that reads `project.json` in one request and writes it in a later one.
**Files:** Appends a "FR-16 cross-request reads" section to `experiments.md`. No source change.
**Done when:** `experiments.md` lists, per writer family in the spec's inventory, the callers read (file:line) and a result: a list of read-in-one-request-write-in-a-later-one writers with file:line, or "none found". `POST /api/project/features` and its wholesale `config.subtypes` / `config.relationshipTypes` replacement (`docs/features/project-configuration.md:20`) is explicitly addressed. Each finding is labelled READ (not run) or MEASURED. For each writer found, a follow-up POS note is recorded (`sab`, per the `saboteur-pos` skill) and its id is written in the section; no route contract is changed.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-16 (OQ-113, OQ-8 option b). Read-only task.
**Done:** [ ]

### Task 4: Make the FR-10 race test assert both changes, and show it fails today
**What:** Change `an editor-style save racing a schema change` to assert the editor font size and the new field are both present, and record that it fails on the unchanged lock code.
**Files:** Modifies `frontend/tests/unit/metadata-concurrent-writes.test.ts` (`:132-165`); appends a "FR-10 before" section to `experiments.md`.
**Done when:** after `Promise.all([updateEditorConfigCore({ body: { fontSize: "19px" } }), addField("custom-group", { key: "mood", ... })])`, each of 20 repetitions asserts the file parses, contains `fontSize: "19px"` in the editor config body, and contains the `mood` field. Run 9 times on the unchanged lock code with `pnpm exec vitest run tests/unit/metadata-concurrent-writes.test.ts`; `experiments.md` records the 9 results (repetitions that failed per run), and the test fails in each run. Every other test in the file is unchanged and passes.
**Depends on:** 1
**Estimate:** 2
**Notes:** Satisfies FR-10 (before half). The test is expected to be red until Task 13; the orchestrator does not commit a red tree as done, so this task's red state is recorded and Tasks 5-13 follow on the same branch.
**Done:** [ ]

### Task 5: The project.json lock primitive
**What:** Add a small module owning the `project.json` lock: callback form only, no exposed release, its own key map, keyed by `path.resolve(root)`.
**Files:** Creates `frontend/src/lib/project-json-lock.ts` (name decided by reading `frontend/src/lib/` conventions) and `frontend/tests/unit/project-json-lock.test.ts`. Adds no importer yet.
**Done when:** tests that fail first (module absent) and pass: two calls for the same root run one after the other, in call order; two roots do not block each other; `"/a/b"`, `"/a/b/"` and `"/a/b/../b"` share one lock; a callback that throws (or rejects) propagates the same error object to its caller and a later call on the same root runs; a callback return value is returned unchanged; there is no timeout (a call waits for a slow earlier call); the module exports no release function; its key map is not the one used by `withMetaLock` or `acquireLock` (test: a `withMetaLock(root)` call and a primitive call for the same root run concurrently). The module's doc comment states the lock-order rule of FR-8 (the allowed edges `acquireLock(projectRoot) -> project.json lock` and `withMetaLock -> project.json lock`; nothing is acquired while holding it). `pnpm typecheck`, `pnpm lint` and the test file pass.
**Depends on:** 4
**Estimate:** 3
**Notes:** Satisfies FR-1 (primitive; OQ-1 option c, OQ-2), FR-8 (doc comment), FR-14 (release on throw). No `realpath`. Do not use `node:async_hooks` here (the native shim does not propagate across `await`).
**Done:** [ ]

### Task 6: Build updateProjectJson on the primitive (family A) with the durable argument
**What:** Rebuild `updateProjectJson` on the primitive, add an optional `durable` argument, and leave the five family A callers unchanged.
**Files:** Modifies `frontend/src/lib/project-json-write.ts` (`:115-134` and the header comment); extends `frontend/tests/unit/project-json-write.test.ts` (find the existing test file by reading; create only if none).
**Done when:** tests that fail first and pass: `updateProjectJson` no longer calls `withMetaLock`; with `durable: true` the write is the durable form `atomicWriteFile` offers and without it the write is as before; the written bytes (key order included), return value and thrown errors of a single call are identical to before for a fixed input set; two overlapping `updateProjectJson` calls on one root keep both changes. All existing tests for `editor-config-core.ts`, `project-crud-core.ts`, `project-preferences-core.ts`, `revision-settings.ts`, `tags.ts` pass without edits. `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run tests/unit/project-json-write.test.ts tests/unit/metadata-concurrent-writes.test.ts` (the FR-10 test may remain red until Task 13).
**Depends on:** 5
**Estimate:** 3
**Notes:** Satisfies FR-1, FR-7, FR-13 (OQ-6: `durable` optional, default unchanged). Family A callers' mutate callbacks, results and `updatedAt` handling must not change.
**Done:** [ ]

### Task 7: Family E: the sidecar metadataRevision bump
**What:** Move `bumpMetadataRevision` onto the primitive while `writeSidecar` keeps its outer `withMetaLock`.
**Files:** Modifies `frontend/src/lib/models/sidecar.ts` (`:27-47`, `:174-181` and the comment at `:176-178`); extends the sidecar tests found by reading.
**Done when:** tests that fail first and pass: a sidecar write bumps `metadataRevision` by exactly 1 with the edge `withMetaLock -> project.json lock`; ENOENT on `project.json` is still ignored and any other read, parse or write error still reaches the caller; the sidecar write itself is still inside `withMetaLock`; the stale comment is replaced. `pnpm typecheck`, `pnpm lint`, targeted vitest and the existing sidecar tests pass.
**Depends on:** 6
**Estimate:** 2
**Notes:** Satisfies FR-6. Must not call `withMetaLock` or `acquireLock` from inside the primitive.
**Done:** [ ]

### Task 8: Family D: updateFeatureConfig
**What:** Move `updateFeatureConfig` onto the primitive inside its outer `acquireLock(projectRoot)`.
**Files:** Modifies `frontend/src/lib/models/project-features.ts` (`:104-145` and the comment at `:130-132`); extends its existing test.
**Done when:** tests that fail first and pass: the read, mutate and write happen inside the primitive, under the kept `acquireLock(projectRoot)`; `updatedAt` is set; `metadataRevision` is not bumped; results and errors for a single call are unchanged; existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 6
**Estimate:** 2
**Notes:** Satisfies FR-5 (OQ-3 option b).
**Done:** [ ]

### Task 9: Family C part 1: withLockedSchema and writeProject
**What:** Make the 13 schema operations that go through `withLockedSchema` do their read, mutate and write inside the primitive, under the kept outer lock.
**Files:** Modifies `frontend/src/lib/models/metadata-schema.ts` (`:60`, `:100-114` and the comment at `:61-63`); extends the existing metadata-schema tests.
**Done when:** tests that fail first and pass: each of `addField`, `removeField`, `deprecateField`, `reorderFields`, `renameField`, `updateFieldOptions`, `addGroup`, `renameGroup`, `removeGroup`, `reorderGroups`, `updateRefProperties`, `updateFieldAppliesTo`, `changeFieldType` leaves the same file content as before for a fixed input set, bumps `metadataRevision` once per write and none when nothing changed; the read is inside the primitive; `acquireLock(projectRoot)` remains the outer lock. Existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run` on the metadata-schema test files.
**Depends on:** 6
**Estimate:** 3
**Notes:** Satisfies FR-4 (part), FR-2. Read the callers listed at `:506-896` before editing.
**Done:** [ ]

### Task 10: Family C part 2: rename, change-type and options with migration
**What:** Move `renameFieldKeyInSchema`, `changeFieldTypeWithMigration` and `updateFieldOptionsWithMigration` schema writes onto the primitive.
**Files:** Modifies `frontend/src/lib/models/metadata-schema.ts` (`:778-802`, `:951-981`, `:1096-1130`); extends the existing tests.
**Done when:** tests that fail first and pass: the schema write is inside the primitive under the kept outer `acquireLock(projectRoot)`; the sidecar migrations still run after the outer lock is released (a test asserts the order); results, `metadataRevision` bumps and errors for a single call are unchanged; existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 9
**Estimate:** 3
**Notes:** Satisfies FR-4 (part). The migrations stay outside any project-wide lock (non-goal).
**Done:** [ ]

### Task 11: Family C part 3: migrateProjectOnLoad and the getSchema migration write
**What:** Put the lock-held re-read and write of `migrateProjectOnLoad` and `getSchema` inside the primitive.
**Files:** Modifies `frontend/src/lib/models/metadata-schema.ts` (`:389-438`, `:475-496`); extends the existing tests.
**Done when:** tests that fail first and pass: the first read outside the lock only decides whether to work; the read a write is based on is repeated inside the primitive (a test interleaves a change between the two reads and sees it kept); when no migration is needed no write occurs; `project-loader.ts:97` behaviour is unchanged; existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 9
**Estimate:** 2
**Notes:** Satisfies FR-2, FR-4 (part).
**Done:** [ ]

### Task 12: Family B: the five withMetaLock setters
**What:** Move the five family B setters onto the primitive, keeping their written form and the durable write.
**Files:** Modifies `frontend/src/lib/models/word-count-goal-core.ts` (`:55-70`), `writing-log-core.ts` (`:181-196`), `mention-highlight-duration-core.ts` (`:63-76`), `entity-graph-settings-core.ts` (`:124-131`), `project-noise-words-core.ts` (`:113-125`); extends their existing tests. (Paths verified by reading before editing.)
**Done when:** tests that fail first and pass: each setter reads and writes `project.json` inside the primitive, passing `process.env.GETWRITE_DURABLE_META === "1"` as the helper's `durable` argument (a test sets the variable and asserts the durable write); the same `config` change and no added `updatedAt`; the raw-config display read in `project-noise-words-core.ts:85-91` stays outside the lock and is not written back. Existing tests pass without edits. `pnpm typecheck`, `pnpm lint`, targeted vitest.
**Depends on:** 6
**Estimate:** 3
**Notes:** Satisfies FR-3 (OQ-6).
**Done:** [ ]

### Task 13: FR-10 race test passes nine times
**What:** Run the changed FR-10 test against the new lock and record nine consecutive passing runs.
**Files:** Appends a "FR-10 after" section to `experiments.md`. No source change expected.
**Done when:** `pnpm exec vitest run tests/unit/metadata-concurrent-writes.test.ts` passes in each of 9 consecutive runs, with 20 of 20 repetitions in each run keeping both `fontSize: "19px"` and `mood`; the 9 results are in `experiments.md` next to the Task 4 results. If any run loses a change, the task halts and reports the observed counts.
**Depends on:** 9, 10, 11
**Estimate:** 2
**Notes:** Satisfies FR-10 (hard acceptance).
**Done:** [ ]

### Task 14: Pairwise race tests
**What:** Add a race test for each pair of writer families that can now overlap.
**Files:** Creates `frontend/tests/unit/project-json-lock-pairs.test.ts` (or extends `metadata-concurrent-writes.test.ts`; decided by reading).
**Done when:** each of these pairs runs 20 repetitions asserting both changes are in `project.json` and that it parses: D with B (`updateFeatureConfig` against `setWordCountGoalCore`), D with A, D with C, E with C (final `metadataRevision` equals the start value plus the number of writes, and the schema change present), E with B, E with D, B with C. (A with C is Task 13.) Each pair test fails against the pre-feature lock code (shown by running it on a stash or recorded in `experiments.md` as observed counts) where the pair lost updates, or is recorded as not lost on `main` with its counts. `pnpm typecheck`, `pnpm lint`, targeted vitest pass.
**Depends on:** 7, 8, 12, 13
**Estimate:** 5
**Notes:** Satisfies FR-11. L because seven pairs each need their own fixtures; a shared parametrised helper is allowed.
**Done:** [ ]

### Task 15: Source scan test and test-only runtime guard
**What:** Add a source scan that fails on any unlisted project.json read-then-write, and a runtime guard active only in tests that throws on re-entry or on any lock taken while the project.json lock is held.
**Files:** Creates `frontend/tests/unit/project-json-lock-scan.test.ts` (convention: the existing `*-locked-access-scan` tests); modifies `frontend/src/lib/project-json-lock.ts`, `frontend/src/lib/meta-locks.ts`, `frontend/src/lib/locks.ts` for the guard hook; extends `frontend/tests/unit/project-json-lock.test.ts`.
**Done when:** tests that fail first and pass: the scan fails for a fixture module that reads then writes `project.json` outside the helper and passes for the real tree with a written allow-list (creation and import writers per the spec's "Other writers found"); under test, a `withMetaLock` or `acquireLock` call from inside the project.json lock callback throws, and a nested project.json lock call throws; outside tests the guard does nothing and the production bundle does not import `node:async_hooks` (a test or `pnpm build` file search of the guard module's imports records this); the allowed edges `acquireLock(projectRoot) -> project.json lock` and `withMetaLock -> project.json lock` do not throw. `pnpm typecheck`, `pnpm lint`, targeted vitest, and from `frontend/` `pnpm build` pass.
**Depends on:** 12, 11, 10, 8, 7
**Estimate:** 3
**Notes:** Satisfies FR-8, FR-9 (OQ-5 option b). No production guard: the native `async_hooks` shim (`src/native-shims/async-hooks.mjs`, `next.config.mjs` aliases) does not propagate across `await`. `pnpm build` runs outside the sandbox in the main checkout.
**Done:** [ ]

### Task 16: Deadlock test
**What:** Run an operation from every family concurrently on one project, in several orderings, and fail on any repetition that does not finish within 5 s.
**Files:** Creates `frontend/tests/unit/project-json-lock-deadlock.test.ts`.
**Done when:** the test runs, concurrently on one project, at least one operation from each of families A to E plus `changeFieldTypeWithMigration`, in at least 3 orderings and 20 repetitions each; each repetition races a 5 s timer, and a hung repetition fails that test without timing out the suite; it passes with the guard of Task 15 active; the slowest repetition time is recorded in `experiments.md`; the bound is widened to 10 s only if CI flakes (not widened pre-emptively). `pnpm typecheck`, `pnpm lint`, targeted vitest pass.
**Depends on:** 14, 15
**Estimate:** 3
**Notes:** Satisfies FR-12 (OQ-7 option a).
**Done:** [ ]

### Task 17: Failure propagation and single-writer behaviour
**What:** Prove that every kind of failure inside the lock reaches the caller unchanged and releases the lock, including `ProjectBusyError`, and that a single writer behaves as before.
**Files:** Extends `frontend/tests/unit/project-json-lock.test.ts` or creates `frontend/tests/unit/project-json-lock-failures.test.ts`.
**Done when:** tests pass for each failure raised inside the lock: unreadable file, parse error, a mutate callback that throws, a failed write, a locked-access error, and `ProjectBusyError` raised through `runWithWriteBarrier` (`write-barrier.ts`) when a project is under conversion: the same error object reaches the caller, nothing is written for a throw before the write, a later write on the same root proceeds, and the write does not resolve as saved; a waiting write has no timeout. A single-writer snapshot test per family (A to E) asserts file bytes, return value and error identical to a fixture captured from the unchanged tree. `pnpm typecheck`, `pnpm lint`, targeted vitest pass.
**Depends on:** 14
**Estimate:** 2
**Notes:** Satisfies FR-14, FR-13 (OQ-4: `crypto/convert-project.ts` is excluded, protected by the write barrier).
**Done:** [ ]

### Task 18: Documentation
**What:** Update the docs and stale comments for the new lock and the lock-order rule.
**Files:** Modifies `frontend/CLAUDE.md` (Locks bullet, line ~35), `docs/features/project-configuration.md` (line ~35), the `project-json-write.ts` header (if not already done in Task 6). Comments at `sidecar.ts:176-178`, `metadata-schema.ts:61-63`, `project-features.ts:130-132` are checked and corrected if Tasks 7-9 left any stale. The `Feature 92` status line in `specs/product/getwrite.features.md` is left to the pipeline lead.
**Done when:** `frontend/CLAUDE.md` states the project.json lock, its module, that it is innermost, the allowed edges and the test-only guard, and no longer says whether every read-modify-write is locked "is an open hypothesis"; `docs/features/project-configuration.md` names the new lock alongside `withMetaLock`; if Task 3 recorded a cross-request writer, the documentation claim is narrowed to exclude it and names the POS follow-up; a search for the old comment wording returns zero hits, recorded in `experiments.md`. `pnpm typecheck` and `pnpm lint` pass.
**Depends on:** 3, 16, 17
**Estimate:** 2
**Notes:** Satisfies FR-17, FR-8 (CLAUDE.md). Wording is a working copy.
**Done:** [ ]

### Task 19: Final suites
**What:** Run every final suite on the branch and record the results next to the Task 1 baselines.
**Files:** Appends a "Final suites" section to `experiments.md`. Modifies only tests or stories needed to make a genuine gap pass (each recorded).
**Done when:** `experiments.md` records, as observed values with command and date, compared with Task 1: from `frontend/`, `pnpm typecheck`, `pnpm lint`, `pnpm test:ci` and `pnpm test:e2e` (6006 confirmed free first; `pnpm storybook` stopped or never started; Storybook built and served by the command itself); from the repo root `pnpm knip` (no new findings); `pnpm --filter getwrite-cli test`; `pnpm --filter getwrite-electron test`. `lsof` before and after. A suite that cannot run is recorded as not run with the reason, never as passing; a failing suite is recorded, not worked around. `git status --short` shows only intended changes; no commit is made by the task.
**Depends on:** 18
**Estimate:** 3
**Notes:** Satisfies FR-18, FR-13. `pnpm test:e2e` runs outside the sandbox; stop only pids this task started.
**Done:** [ ]

## Summary
- Total tasks: 19
- Total estimated effort: 52 story points (S = 2 or less, M = 3, L = 5 for Task 14 only)
- Critical path: 1 → 4 → 5 → 6 → 9 → 10 → 13 → 14 → 15 → 16 → 18 → 19
- Risks: Task 2 (if a sidecar pair reproduces a lost update, scope changes and needs the owner; the carried check is measured first so this surfaces before any lock code); Task 3 (a cross-request writer, such as the features route's wholesale lists, cannot be fixed by a lock; it becomes a POS follow-up and a narrowed doc claim); Task 4 (leaves the tree red by design until Task 13); Tasks 9-11 (one large file, `metadata-schema.ts`, edited in three serial tasks; they must not run in parallel); Task 14 (seven pairs, sized L); Task 15 (the test-only guard hooks `locks.ts` and `meta-locks.ts`, which are used in the Capacitor native build; `pnpm build` and a check that production code does not import `node:async_hooks` guard this; `pnpm build:native` is not in the final suites and is a known pre-existing failure); Task 16 (the 5 s bound is unmeasured until its first run); Task 19 (`pnpm test:e2e` takes a free port 6006).
