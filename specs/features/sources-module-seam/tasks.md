# Tasks: Sources view, excerpts and citations, and the first cut of the module registry (Feature 103)

Source spec: `specs/features/sources-module-seam.md` (FR-1..FR-36, US-1..US-5; Gate 3 approved 2026-11-07; OQ-4 resolved at the owner's Wave 1 checkpoint, 2026-11-07: small, Trash converted (Task 38); OQ-170 open and non-blocking). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 103. Branch: `feat/sources-module-seam`; one PR (FR-36).

Shape of the work (FR-1, owner Gate 2 decision F103-1): waves, with an owner checkpoint after Wave 1.
- Wave 1 (Tasks 1-15, FR-2..FR-15): registry seam, `config.modules`, shared derived-index rebuild, annotation DELETE limit, minimal Sources view, the Trash-slot spike.
- Task 16: OWNER CHECKPOINT. Not implementation. It produced the checkpoint report (`checkpoint-wave-1.md`); the owner reviewed it on 2026-11-07 and approved Wave 2 ("all recommended"). Every task numbered 17 or higher lists Task 16 directly in its Depends on.
- Wave 2 (Tasks 17-24 and 38-42, FR-16..FR-20 plus the owner's checkpoint decisions of 2026-11-07): create and rename, attachments section, byte read, image preview and audio playback, Android device checks (owner-run), unchanged-behaviour tests; and the checkpoint follow-ups, Tasks 38-42 (Trash converted to a registry view slot, selection-aware module-off fallback, shared rebuild rethrows locked access with an importer annotation-index test, `experiments.md` clean-up, FR-2 scan of `uiRegistry.ts`). Task numbers 38 and up were added after the checkpoint so that POS ids keyed to Tasks 1-37 stay valid; in the file they sit after Task 19 so every dependency precedes its dependent.
- Wave 3 (Tasks 25-35, FR-21..FR-28): `target` and locator, empty-body rule, excerpts, citations, missing-target state, compile and export identity.
- Wave 4 (Task 36, FR-29): Type filter.
- Task 37: final suites, lead-run. All-waves requirements FR-30..FR-36 are folded into the tasks they apply to; FR-33 (documentation) is the scribe stage's job, not a task, except the pinned doc table in Task 14.

Compact dependency graph (`a -> b` means b depends on a):
- Wave 1: 1 -> 7; 2 -> 3 -> 4; 2 -> 8; 2, 3 -> 9; 3 -> 5 -> 6; 1, 3, 5 -> 7; 8, 9 -> 10; 8 -> 12; 2, 9, 11, 12 -> 13 -> 15; Tasks 1, 2, 11, 14 have no dependencies. 1-15 -> 16.
- Wave 2 (all after 16): 16 -> 17 (owner-run), 18, 19, 24 branch; 18 -> 20 -> 21 -> 22, 23 (owner-run); 19 -> 21; 18 -> 24. Checkpoint follow-ups (the edges into 20 and 37 are recorded in those tasks' Notes, not their Depends on field, because the schema forbids a dependency on a higher number): 16 -> 38 -> 39 -> 20 (the `AppShell.tsx` / `ViewSwitcher.tsx` / `uiRegistry.ts` order: Trash conversion, then selection-aware fallback, then the attachments slot); 16 -> 40; 16, 38, 39, 40 -> 41; 16, 38 -> 42.
- Wave 3 (all after 16): 16 -> 25 -> 26 -> 27, 28; 25 -> 32, 35; 28 -> 30; 28, 20 -> 29, 31; 28, 32 -> 33; 19, 21, 29, 31, 33 -> 34.
- Wave 4: 16 -> 36.
- 37 depends on every non-manual implementation task, including 38-42 (the 38-42 edges are in its Notes; see above).

Parallel groups the orchestrator may run (each member touches files disjoint from the others, per the hot-file list):
- Wave 1 start: {1, 2, 11, 14}. After 2: {3, 8}. After 3: {4, 5, 9}. After 5: {6, 7}. After 8, 9: {10}. After 8: {12}. Then 13, then 15, then 16.
- Wave 2: {17 (owner-run), 18, 19, 38, 40}; after 38: {39, 42}; after 18 and 39: {20}; after 18: {24}; after 38, 39, 40: {41}; 21 after 19 and 20; then {22, 23 (owner-run)}. Tasks 38, 39 and 20 are strictly serial (shared hot files). Task 40 (derived-index-rebuild) is disjoint from them. Task 41 edits `experiments.md` and should land before other Wave 2 tasks append to it, or after, but not concurrently with them.
- Wave 3: {25, 36}; after 25: {26, 32, 35}; after 26: {27, 28}; after 28: {30}; after 28 and 20: {29, 31}; after 28 and 32: {33}; then 34.

Hot files and the only tasks allowed to edit them (tasks named for one file never run concurrently; the dependency graph forces the order):
- `frontend/components/Layout/AppShell.tsx`: Task 13 (edits, done); Task 15 edited it only in a throwaway worktree. Wave 2 edit order: Task 38 (Trash conversion), then Task 39 (selection-aware fallback); Task 20 does not edit it unless a recorded need, after 39. Tasks 11 and 36 read it only.
- `frontend/components/WorkArea/ViewSwitcher.tsx`, `frontend/components/Modules/uiRegistry.ts`, `frontend/components/Modules/useEnabledModuleViews.ts`: Task 38, then Task 39 (only if the fallback needs them), then Task 20 (uiRegistry), then Task 31 (uiRegistry). Task 42 reads `uiRegistry.ts` in a test only.
- `frontend/src/lib/models/derived-index-rebuild.ts`: Task 40 only in Wave 2 and later.
- `frontend/src/lib/api/source-attachments.ts`: Task 19 only.
- `frontend/src/lib/models/indexer-queue.ts`: Task 7 only. Task 5 and Task 6 do not edit it; if they need to, they record the need and Task 7 applies it.
- `frontend/src/lib/models/types.ts`, `schemas.ts`, `frontend/src/lib/api/schemas.ts`: Task 2 (`config.modules`, registry id types), Task 13 (`ViewName` only), Task 25 (annotation `target`). No other task edits them.
- `frontend/src/lib/models/annotation-validation.ts`, `annotations-core.ts`: Task 25, then Task 26. Task 28 owns `frontend/src/lib/annotation-flows.ts`. Task 27 owns `annotation-copy.ts` and `trash.ts` (edit only if its test fails). Tasks 30, 32, 33, 35 are test-only against these unless a test fails, in which case they record the need and report it.
- `frontend/src/lib/models/trash.ts`: Task 27 only (no Wave 1 or 2 task edits it).
- `frontend/next.config.mjs`: Task 8, then Task 12 (only if a new list-read operation is needed), then Task 19.
- `frontend/components/Sources/SourcesView.tsx` (new, Task 12): Task 12, then Task 18, then Task 20, then Task 29.
- Registry files (Task 3 model-side, Task 9 UI-side): Task 3 and Task 9 create them; Task 13 registers the view slot; Task 38 adds a Trash entry to the UI registry (and the optional `icon` and `alwaysEnabled` slot fields); Task 20 adds the attachments-section slot kind; Task 31 adds the citation-control slot kind.
- `frontend/src/lib/models/query-intrinsics.ts`: Task 36 only.
- `app/api/annotations/route.ts`: Task 14 only.
- `specs/features/sources-module-seam/experiments.md`: created by Task 1 (Task 41 later repairs its stale text) with fixed headings (Environment, Wave 1 config.modules read cost (FR-6), FR-9 reindex runs, FR-10 spike, Module-switch cases, FR-13 inventory, Wave 2 Android image display, Wave 2 Android 100 MB baseline, Not verified, Acceptance) so concurrent tasks append to different sections.

**Builds:** `next build`, `pnpm build:native` and `pnpm test:e2e` only run from the main checkout, outside the sandbox, with `pnpm storybook` stopped. No orchestrator task runs them. Tasks that write an e2e spec check only that it typechecks and lints; the run is Task 37 (lead-run).

**Electron worker constraint (FR-4):** Task 4 owns the pinning test. Every task whose Files include anything under `frontend/src/lib/models/`, `frontend/src/lib/core.ts`, `cli/` or `electron/`, or that changes an import of `indexer-queue.ts`, an importer or `reindex.ts`, MUST also run `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`) and `pnpm --filter getwrite-cli typecheck`, and record each as run or not run. A bare frontend `tsc` is not accepted as evidence (Run B, commit `5894375f`).

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tests first (`docs/standards/testing.md`): add to an existing test file before creating one; code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions). Every catch added or touched follows `docs/standards/failure-visibility.md` (narrow catch; "failed" never returned as "empty"; locked access rethrown via `isLockedAccessError`). Every new route and core follows `docs/standards/security.md` and `docs/standards/storage-context.md` (no client-supplied path, validated ids, validation before any lock or write, nothing stored logged). New storage operations follow the core + route (`withStorageContext`) + `lib/api` client + `native-<x>-backend.ts` + `.web-stub.ts` + `next.config.mjs` alias pattern (FR-30). UI follows `docs/standards/accessibility.md` and `docs/standards/storybook-implementation.md`, with no red for actions, brand tokens only (`pnpm run check:no-hex`); read a component's source and stories before using any prop.
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run typecheck and lint on touched files before finishing. A suite not run is reported as not run, never as passing.
- A task that needs a hot file owned by another task records the need in `experiments.md` and its report instead of editing it.
- Implementors do not commit and do not push; the orchestrator commits. Write no cause that no experiment separated. A statement in the spec marked READ is a reading until its test runs.

## Wave 1: registry seam and a minimal Sources view

### Task 1: Experiments file and the measured per-save cost of the `config.modules` read
**What:** Create the experiments file with its fixed headings and measure what an extra plain unlocked `project.json` read costs per save in the `runTask` path, recorded as observed values.
**Files:** `specs/features/sources-module-seam/experiments.md` (new), a measurement test or script under `frontend/tests/` (existing indexer test file if one fits; no product source change), reads `frontend/src/lib/models/indexer-queue.ts` and `frontend/tests/**/project-json-lock-scan.test.ts` only
**Done when:** `experiments.md` exists with the headings named above and an environment record (Node version, commit, command, build); the "Wave 1 config.modules read cost (FR-6)" section records the observed per-save time of the existing `runTask` with and without one additional unlocked `project.json` read, over a stated number of runs and project size, as observed values with no cause stated; `project-json-lock-scan.test.ts` is shown passing unchanged; no product source file is changed.
**Depends on:** none
**Estimate:** 2
**Notes:** Satisfies FR-6 (measurement duty) and FR-35. If the measurement cannot be run, say so in "Not verified". The result informs Task 7 but does not gate it.
**POS:** task_b666711b
**Done:** [x]

### Task 2: `config.modules` declarations and schema tests
**What:** Declare `config.modules` in the persisted schema, the API response schema and the TypeScript type, keeping unknown module ids, with the tests that pin it and pin `config.features` and `ProjectTypeSchema` unchanged.
**Files:** `frontend/src/lib/models/schemas.ts`, `frontend/src/lib/models/types.ts`, `frontend/src/lib/api/schemas.ts`, existing schema and API-schema test files under `frontend/tests/`
**Done when:** Tests written first, then green: an unknown module id survives a write through the schema and a round trip through the client parse in `lib/api/schemas.ts`; every existing `config.features` write and read is unchanged (a test over the seven existing flags); `ProjectTypeSchema` is unchanged for module keys (a test that a project-type JSON with a module key is rejected exactly as before); a project with no `config.modules` entry parses and reads as the Sources module on (OQ-13 default is pinned in a pure `isModuleEnabled` helper added in Task 3, so this task pins only that absence parses). `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck` are run and recorded. A write by an older build is listed under "Not verified" in `experiments.md`.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-5 and FR-14 (pin). The schema must not import React or JSON (FR-4). Owner of `schemas.ts`, `types.ts` and `lib/api/schemas.ts` for module keys.
**POS:** task_3ab2e9e4
**Done:** [x]

### Task 3: Model-side module registry and the Sources module manifest
**What:** Add the build-time model-side registry (a static manifest, an `isModuleEnabled` helper and a registry factory a test can feed) with the Sources module as its first entry.
**Files:** `frontend/src/lib/models/modules/registry.ts` (new), `frontend/src/lib/models/modules/manifest.ts` (new), `frontend/src/lib/models/index.ts` (export, only if the barrel needs it), a new test file under `frontend/tests/` for the registry
**Done when:** Tests first, then green: the manifest is a static list from repository code; `isModuleEnabled(config, id)` returns true for an absent entry (OQ-13), false only for an explicit false, and keeps unknown ids; the registry factory accepts a test-only module; a source-text test confirms no dynamic `import()` of a module identifier and no read of module code from the project store or user data (FR-2); the registry declares only the view slot kind (OQ-12) and has no field for resource types, Trash kinds, importers, permissions or project-type keys (FR-11); `AnnotationMark` registration is untouched. `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck` are run and recorded.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-2, FR-3 (model side), FR-11. This file may not import React, JSX or JSON. The Sources module owns no index (OQ-9); the manifest records that in a comment-free field such as an empty `indexSteps` list.
**POS:** task_73016cc1
**Done:** [x]

### Task 4: Electron worker graph pin test
**What:** Add the test that fails if anything reachable from `frontend/src/lib/core.ts` or the shared rebuild imports React, JSX or project-type JSON.
**Files:** an existing import-graph or source-text test under `frontend/tests/` (or a new `core-import-graph.test.ts` if none fits); no product source change
**Done when:** A test walks the import graph from `frontend/src/lib/core.ts` (and from the model-side registry and rebuild-list files by name once present) and fails on any import of `react`, a `.tsx` file, a `.json` project-type file, or the UI registry; it passes on the current tree including Task 3's files; `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-electron build`, `pnpm --filter getwrite-cli typecheck` and `pnpm --filter getwrite-cli build` are run and recorded.
**Depends on:** 3
**Estimate:** 2
**Notes:** Satisfies FR-4 (the SHOULD test). Task 5 adds a file under `lib/models/`; Task 5 re-runs this test and the four commands.
**POS:** task_d0963489
**Done:** [x]

### Task 5: Shared derived-index rebuild for the three importers and `reindex`
**What:** Replace the four hand-written rebuild copies with one shared rebuild list in `lib/models`, with characterization tests proving byte-equal output per caller.
**Files:** `frontend/src/lib/models/derived-index-rebuild.ts` (new), `frontend/src/lib/models/scrivener/import-scrivener-project.ts`, `frontend/src/lib/models/docx/import-docx-project.ts`, `frontend/src/lib/models/plaintext/import-plaintext-project.ts`, `cli/src/commands/reindex.ts`, existing importer and CLI tests (`cli/tests/reindex.test.ts`)
**Done when:** Characterization tests are written and run green against the unchanged code first, capturing `meta/index/inverted.json`, `backlinks.json` and `index/mentions.json` for one fixture per caller; after the change the same tests pass, showing each caller's rebuilt files equal the captured ones; the shared list does not rebuild diagnostics (OQ-11) and a test pins that `meta/index/diagnostics.json` output is the same as before for each caller; an importer or `reindex` does not run a step owned by a module its project has switched off (tested with the Task 3 test-only module); the list is importable by the Electron import workers and the CLI: Task 4's test passes, and `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-electron build`, `pnpm --filter getwrite-cli typecheck`, `pnpm --filter getwrite-cli build` and the existing CLI tests are run and recorded.
**Depends on:** 3
**Estimate:** 5
**Notes:** Satisfies FR-8 and FR-4. Does not edit `indexer-queue.ts` (Task 7 owns it). The rebuild reads `config.modules` as a plain unlocked read of `project.json`; the survey counts four sites by grep for `persistMentionIndex`, so the task records the count it finds.
**POS:** task_2f0afe9b
**Done:** [x]

### Task 6: `reindex` rebuilds annotation search, with the three recorded runs
**What:** Add annotation-body indexing to the shared rebuild and record, for a present, a stale and a deleted `meta/index/annotations.json`, what `reindex` does before and after.
**Files:** `frontend/src/lib/models/derived-index-rebuild.ts`, `cli/src/commands/reindex.ts` (only if a call-site change is needed), `cli/tests/reindex.test.ts`, `specs/features/sources-module-seam/experiments.md` (FR-9 reindex runs section)
**Done when:** Before any code change, `reindex` is run on a project with annotations in cases (a) file present and current, (b) present and stale (a body in the file no longer in any sidecar, and a stored body missing from the file), (c) file deleted; for each, the file contents and the search results for an annotation-only term before and after are recorded as observed values, not causes; then a test per case is written and the shared rebuild changed so that after `reindex` annotation bodies are findable by full-text search as after a save; those tests pass; the electron and cli typecheck and build commands of Task 5 are run and recorded.
**Depends on:** 5
**Estimate:** 3
**Notes:** Satisfies FR-9. The documentation corrections (`indexing.md:192`, `annotations.md` Search) are the scribe stage's after these runs and are not part of this task. Does not edit `indexer-queue.ts`.
**POS:** task_ee889ecf
**Done:** [x]

### Task 7: Module gating inside `runTask`, and the module-switch cases
**What:** Make module-owned indexing steps read `config.modules` inside `runTask`'s `runForTenant` scope and stop while the module is off, and test the catch-up and switching cases on a test-only module.
**Files:** `frontend/src/lib/models/indexer-queue.ts`, the existing indexer-queue test file under `frontend/tests/`, `specs/features/sources-module-seam/experiments.md` (Module-switch cases section)
**Done when:** Tests first, then green, on a module registered only in tests (the Sources module owns no index, OQ-9): (b) with the module off, a save enqueues and runs no step for that module's derived data; (c) after turning it on, the reindex catch-up leaves that derived data equal to a from-scratch rebuild; the `entities` behaviour is unchanged (a test that its indexing runs while its flag is off, as today); the `config.modules` read is a plain unlocked read, not `updateProjectJson`, and `project-json-lock-scan.test.ts` is green; a locked project is not read in a way that bypasses the lock; Task 1's measured cost is cited in the record; the observed result of each module-switch case is recorded; the electron and cli typecheck and build commands of Task 5 are run and recorded.
**Depends on:** 1, 3, 5
**Estimate:** 5
**Notes:** Satisfies FR-6 (b), (c) and the FR-35 four-case record (with Task 8's (a) and Task 13's (d)). The spec and docs must say plainly the Sources module owns no index; that sentence is the scribe's.
**POS:** task_319800ed
**Done:** [x]

### Task 8: Module-switch write path (core, route, client, native backend, stub)
**What:** Add the storage operation that writes `config.modules[id]`, following the repository pattern, with the four route-security tests and the byte-identity test.
**Files:** `frontend/src/lib/models/module-config-core.ts` (new), `frontend/app/api/project/modules/route.ts` (new), `frontend/src/lib/api/modules.ts` (new), `frontend/src/store/transport/native-modules-backend.ts` and `.web-stub.ts` (new), `frontend/next.config.mjs` (alias entry), existing route and native-backend test files
**Done when:** Tests first, then green: (a) the data on disk (everything except the changed `config.modules` entry) is byte-identical before and after switching off and on; the route has a test each for per-route validation (bad project id, bad module id, unknown key refused with the same message on the route and the native backend), `withStorageContext`, the paired-device limit check where Task 14's inventory finds it needed (none expected, recorded), and encryption and locking behaviour; a locked project raises the locked error on route and native backend, the client turns HTTP 401 and 409 back into locked-access errors through `lib/api/locked-response.ts`; the web build excludes the native backend; the choice of reusing or extending the existing `updateFeatureConfig`-style path versus the new operation is recorded in `experiments.md`; electron and cli typecheck and build are run and recorded.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-5 (write path), FR-6 (a), FR-7 (transport), FR-12, FR-30. Native lock parity with the server is reasoned, not run, and must not be claimed as measured. Owner of `next.config.mjs` in Wave 1.
**POS:** task_9c43b777
**Done:** [x]

### Task 9: UI registry, modules selector and Storybook decorator
**What:** Add the React-side registry (view slot only), a `useModuleEnabled` selector over the project's `config.modules`, and a Storybook decorator for it.
**Files:** `frontend/components/Modules/uiRegistry.ts` (new), `frontend/components/Modules/useModuleEnabled.ts` (new), `frontend/.storybook/` decorator file or the existing decorators file (TBD, located by the task), a test under `frontend/tests/` for the selector and registry
**Done when:** Tests first, then green: the UI registry imports React and is imported by none of `lib/models`, `core.ts`, the CLI or the Electron workers (Task 4's test passes); it declares the view slot kind only; `useModuleEnabled` returns true for absent, false for an explicit false, and reads the live store value; the decorator exists and a story renders a component under it with the module on and off; an a11y test is not required (no UI element) but the decorator is used by Task 10's story.
**Depends on:** 2, 3
**Estimate:** 3
**Notes:** Satisfies FR-3 (UI side), FR-31 (decorator). Read the existing `StaticSharingLimitsProvider` and its stories before writing the decorator.
**POS:** task_82923d90
**Done:** [x]

### Task 10: Module switch control in Project Settings
**What:** Add the per-project module switch to the Project Settings dialog with a visible save result and a visible failure that keeps the writer's choice.
**Files:** `frontend/components/Layout/ProjectSettingsDialog.tsx`, a new `frontend/components/Modules/ModuleSwitchSection.tsx`, its story, existing dialog tests and a11y tests under `frontend/tests/`
**Done when:** Tests first, then green: the control toggles the Sources module via Task 8's client; success shows a visible result; a failed save shows a visible failure and leaves the writer's choice displayed; the control is keyboard operable with a visible focus and an accessible name; an a11y test per `docs/standards/accessibility.md` and a Storybook story (using Task 9's decorator) exist; a project with no entry shows the module on; `CreateResourceModal.tsx` and `SourceAttachmentsSection.tsx` are shown by test to ignore the switch.
**Depends on:** 8, 9
**Estimate:** 3
**Notes:** Satisfies FR-7, FR-31. A control disabled on a paired device (if Task 14's inventory says it is limited) shows a visible reason; otherwise the record says it is not limited.
**POS:** task_f7757782
**Done:** [x]

### Task 11: Characterization tests for every existing Work Area view
**What:** Write the tests that show each existing view is reachable and gated as before, run green on the unchanged tree.
**Files:** existing `AppShell` and `ViewSwitcher` test files under `frontend/tests/` (or a new `work-area-view-gating.test.tsx` if none fits); no product source change
**Done when:** A test per view (edit, organizer, data, diff, timeline, entityRoster, entityGraph, trash) shows it is reachable and gated as before, including with no resource selected for the project-wide views (as many as there are), the disabled-view reasons, and the view-reset behaviour at the effects around `AppShell.tsx:482-512`; all pass against the unchanged `AppShell.tsx`; the record names the exact reset conditions read.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-10 (first sentence). Task 13 and Task 15 must keep these green. Reads `AppShell.tsx`; does not edit it.
**POS:** task_7c951eff
**Done:** [x]

### Task 12: Sources view component and the Source list read
**What:** Build the project-scope Sources view component listing every Source with its name, subtype and attachment count and opening one in the editor, with a visible failure state.
**Files:** `frontend/components/Sources/SourcesView.tsx` (new), `frontend/components/Sources/useSourceList.ts` (new), its story, tests under `frontend/tests/`, and `frontend/next.config.mjs` plus new core, route, client and native-backend pair files only if the recorded data path needs a new list-read operation
**Done when:** Tests first, then green: the data path for the list (the store plus the existing attachments list, or a new operation) is recorded in `experiments.md` before the component is written; the list shows name, subtype and number of attachments for every Source and no non-Source; selecting a row opens that Source in the editor without the resource tree; a failed read of the list renders a failure, never an empty project (a test per cause: thrown error and locked project); a project with no Sources shows an empty state distinct from the failure; a component a11y test and a Storybook story exist; if a new operation is added it passes the FR-30 tests of Task 8's kind and the electron and cli typecheck and build commands are run.
**Depends on:** 8
**Estimate:** 3
**Notes:** Satisfies FR-15 (view body), FR-30, FR-31. Depends on Task 8 only because `next.config.mjs` is serialized if a new operation is needed; if no operation is needed the task does not touch it. Not registered or reachable yet; Task 13 wires it.
**POS:** task_f0063f1f
**Done:** [x]

### Task 13: Register the Sources view through the shell
**What:** Add `"sources"` to `ViewName` from registry view ids, feed `disabledViews` and `disabledReasons` from the slot, render the view before the no-selection guard, and fall back to the edit view when the module is switched off.
**Files:** `frontend/src/lib/models/types.ts` (`ViewName` only), `frontend/components/WorkArea/ViewSwitcher.tsx`, `frontend/components/Layout/AppShell.tsx`, `frontend/components/Modules/uiRegistry.ts` (registration), existing `AppShell` and `ViewSwitcher` tests
**Done when:** Tests first, then green, and Task 11's tests stay green: the Sources tab is absent when the module is off and present when on ((d)); the view is reachable with no resource selected, from every state the existing project-wide views are reachable from; with the module switched off while the view is open the shell falls back to `"edit"` and the test pins it; the view renders before the `!selectedResource` guard (`AppShell.tsx:1683`) and `|| view === "sources"` is in the project-wide outer condition; no existing view's behaviour changes; the `AppShell.tsx` lines changed are counted read-only (`git diff --stat`) and recorded in `experiments.md` as the baseline for Task 15; `pnpm typecheck`, `pnpm lint` run; electron and cli typechecks run and recorded.
**Depends on:** 2, 9, 11, 12
**Estimate:** 5
**Notes:** Satisfies FR-3 (view slot), FR-6 (d), FR-10, FR-15. Sole branch editor of `AppShell.tsx`. The post-guard placement caused the recorded roster and Timeline reachability bugs; do not place the view after the guard.
**POS:** task_d0bd20d5
**Done:** [x]

### Task 14: Annotation DELETE refuses a limited paired device, and the FR-13 inventory
**What:** Make the annotations DELETE route call the `permanentDeletion` limit check, update the pinned limited-route test and doc table, and record the permanent-delete or overwrite inventory for the Wave 1 actions.
**Files:** `frontend/app/api/annotations/route.ts`, `frontend/tests/unit/sharing-limits-routes.test.ts`, `docs/features/home-network-sharing.md` (the table at about line 161 only), `specs/features/sources-module-seam/experiments.md` (FR-13 inventory section)
**Done when:** Tests first, then green: a request to DELETE an annotation on a device with `permanentDeletion` limited returns HTTP 403 `{ error, limit }` for a plain note and (once they exist) any annotation, and succeeds on the window and when not limited; `sharing-limits-routes.test.ts` pins the new limited route and no sixth switch is added; the `home-network-sharing.md` table lists the route; the inventory section lists every action Wave 1 adds that permanently deletes or overwrites (expected: none besides the module-config write, recorded with how it is classified) and the actions Waves 2 and 3 will add, each with the existing switch that covers it or "not yet decided", for Task 34 to complete.
**Depends on:** none
**Estimate:** 2
**Notes:** Satisfies FR-13, OQ-10. This changes existing paired-device behaviour for plain notes; that is the owner's recorded decision. The doc edit is limited to the table a test reads.
**POS:** task_55f899ef
**Done:** [x]

### Task 15: FR-10 spike: TrashView behind a registry slot (worktree, not for the branch)
**What:** In its own worktree on a throwaway ref, move `TrashView` behind a view slot, count the `AppShell.tsx` lines changed, run the existing `TrashView` tests and e2e, and record the measurement.
**Files:** `specs/features/sources-module-seam/experiments.md` (FR-10 spike section, the only file that lands on the branch); in the throwaway worktree only: `frontend/components/Layout/AppShell.tsx`, `frontend/components/WorkArea/ViewSwitcher.tsx`, the `TrashView` file and the registry files
**Done when:** The spike is based on the branch after Task 13; the converted code is committed only to the throwaway ref `spike/sources-module-seam-trash-slot` (or left uncommitted in the worktree) and is never merged or cherry-picked onto `feat/sources-module-seam` (the owner decides at the checkpoint, OQ-4); `experiments.md` records as observed values: the base commit, the ref name, the `AppShell.tsx` lines added and removed (`git diff --numstat` against the base), the total files changed, the existing `TrashView` tests run and their results, and the e2e result or "not run" with the reason (e2e and builds run only from the main checkout outside the sandbox); no judgement that the cost is "small" or "large" is written; `git diff` on the branch after the task shows only `experiments.md` changed.
**Depends on:** 13
**Estimate:** 3
**Notes:** Satisfies FR-10 (spike) and FR-35. Runs in its own worktree. What "small" means is the owner's call at the checkpoint (OQ-4); the pipeline MUST NOT decide it. Never run the e2e from a worktree if it cannot build there; record "not run".
**POS:** task_dc5202a4
**Done:** [x]

### Task 16: OWNER CHECKPOINT: Wave 1 report (not implementation; the orchestrator halts here)
**What:** Produce the Wave 1 checkpoint report for the owner and stop; no product code is written.
**Files:** `specs/features/sources-module-seam/checkpoint-wave-1.md` (new), reads `specs/features/sources-module-seam/experiments.md`
**Done when:** The report exists and states: (1) the registry shape as built (model-side and UI-side files, the one slot kind, how the Sources view registers, how `config.modules` and `isModuleEnabled` behave); (2) for each of FR-2 to FR-15, whether it is met and how it was verified (test file and name), with any gap stated; (3) the Task 15 spike: ref name, base commit and the `AppShell.tsx` line count as recorded, without a verdict on OQ-4, which is the owner's; (4) the FR-13 check so far (Task 14's inventory and what Waves 2 and 3 still need to classify); (5) the measured per-save cost of the `config.modules` read from `experiments.md` (Task 1) as observed values; (6) the results of these commands, each as run or not run, run from the branch inside the sandbox: `pnpm --filter getwrite-frontend typecheck`, `pnpm --filter getwrite-frontend lint`, `pnpm --filter getwrite-frontend test:ci`, `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-electron build`, `pnpm --filter getwrite-cli typecheck`, `pnpm --filter getwrite-cli build` (the full CI list is Task 37, lead-run); (7) everything under "Not verified" so far; (8) FR-36's statement that the branch is a working, reviewable state with every existing behaviour unchanged, backed by the Task 11 tests; (9) the list of questions for the owner (OQ-4, and any conflict a task reported). The task ends with the explicit line "HALT: owner review required before Wave 2".
**Depends on:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
**Estimate:** 2
**Notes:** Satisfies FR-1, FR-36. Owner checkpoint. The orchestrator MUST NOT start any later task until the owner has reviewed this report. The wave boundary is not movable without the owner. This report may lead the owner to change the order of later waves or to decide Trash conversion (OQ-4); the task list is amended by the lead, not by this task.
**POS:** task_e696c3d2
**Done:** [x]

## Wave 2: attachments, media, create and rename

### Task 17: OWNER-RUN, manual: measure how Android shows image resources today
**What:** On the Pixel with adb outside the sandbox, from the main checkout, observe how an image resource is displayed on Android today and record it.
**Files:** `specs/features/sources-module-seam/experiments.md` (Wave 2 Android image display section)
**Done when:** The owner and lead record, as observed, the build used, the device, how an existing image resource is displayed on Android (the mechanism if observable, and whether it displays), with no cause written; or the entry "not run" is placed under "Not verified".
**Depends on:** 16
**Estimate:** 1
**Notes:** OWNER-RUN / MANUAL: the orchestrator skips this task; the lead runs it with the owner. It needs the Pixel and adb outside the sandbox from the main checkout. No other task depends on it, so skipping it does not block the orchestrator; Tasks 19 and 21 are fully testable without a device. Satisfies FR-18 (first Wave 2 measurement duty). The spec says the first Wave 2 task measures this; it is placed as a skip-able parallel task so implementation is not blocked.
**POS:** task_945a1e7d
**Done:** [ ]

### Task 18: Create and rename a Source from the Sources view
**What:** Add create and rename controls to the Sources view that behave as the same action through the tree does.
**Files:** `frontend/components/Sources/SourcesView.tsx`, `frontend/components/Sources/SourcesViewControls.tsx` (new), its story, existing view and resource-create tests under `frontend/tests/`
**Done when:** Tests first, then green: a test per action compares the stored result of create and of rename from the view with the tree's result on the same input; a new Source created from the view is seeded out of compile (Feature 102 FR-27) and shows the create-time notice at the 5000-id cap; failures are shown, not swallowed; controls are keyboard operable with accessible names; a paired-device-limited control (if any) is disabled with a visible reason; a11y test and story updated.
**Depends on:** 16
**Estimate:** 3
**Notes:** Satisfies FR-16, FR-19, FR-31. Sole editor of `SourcesView.tsx` at this point (after Task 12). Reuses the existing create path; adds no storage operation.
**POS:** task_1604ebaf
**Done:** [ ]

### Task 19: Attachment byte-read storage operation
**What:** Add the storage operation that returns an attachment's bytes by resource id and attachment id, on web, desktop and Android.
**Files:** `frontend/src/lib/models/source-attachment-bytes-core.ts` (new), `frontend/app/api/project/source-attachments/bytes/route.ts` (new), `frontend/src/lib/api/source-attachment-bytes.ts` (new), `frontend/src/store/transport/native-source-attachment-bytes-backend.ts` and `.web-stub.ts` (new), `frontend/next.config.mjs`, `frontend/src/lib/api/source-attachments.ts` (the existing attachments client, edited for the locked mapping), existing attachment route and native-backend tests, `frontend/tests/sourcesView.test.tsx`
**Done when:** Tests first, then green: the existing attachments client `frontend/src/lib/api/source-attachments.ts` maps HTTP 401 and 409 back to the locked-access errors through `lockedAccessErrorFromResponse` (`lib/api/locked-response.ts`), as the module-switch client does, with a client test per status (owner decision at the Wave 1 checkpoint, 2026-11-07; it replaces the observed limit recorded in the "Sources list data path (Task 12)" subsection of `experiments.md`), and a test in `sourcesView.test.tsx` that the Sources view shows the locked state, not the generic failure, when the attachments list read returns HTTP 401 or 409 over the HTTP client; the bytes read goes through `io.ts` and the storage adapter and is keyed by resource id and attachment id, never a client-supplied path (path-like ids refused); a locked project raises the locked error on route and native backend and the client maps HTTP 401 and 409 back; the same invalid input is refused with the same message on both; the response reports the kind from the stored entry and a magic-byte check, never from the original name (a test with a misnamed file); `withStorageContext`, encryption and the paired-device check where Task 14's inventory says needed are each covered by a test; the web build excludes the native backend; an in-memory test reads and returns an attachment through the native backend at a size well under the cap; electron and cli typecheck and build are run and recorded.
**Depends on:** 16
**Estimate:** 5
**Notes:** Satisfies FR-18 (storage half), FR-12, FR-30, and the checkpoint decision of 2026-11-07 on the attachments client (item 3). Sole editor of `source-attachments.ts` on this branch. Owner of `next.config.mjs` in Wave 2. The 100 MB device check is Task 23, owner-run; this task must be fully testable without a device and does not claim the Android baseline. Native lock parity is reasoned, not run.
**POS:** task_f6d0e452
**Done:** [ ]

### Task 38: Convert Trash to a registry view slot (spike `1313b8bb`, adapted to HEAD)
**What:** Bring the Task 15 spike commit `1313b8bb` (local ref `spike/sources-module-seam-trash-slot`, based on `85f882a7`) onto this branch, adapted to the current HEAD, so `TrashView` is a registry view slot.
**Files:** `frontend/components/Layout/AppShell.tsx`, `frontend/components/WorkArea/ViewSwitcher.tsx`, `frontend/components/Modules/uiRegistry.ts`, `frontend/components/Modules/useEnabledModuleViews.ts`, `frontend/tests/viewSwitcher.test.tsx`, `frontend/tests/a11y/workarea.a11y.test.tsx`, `specs/features/sources-module-seam/experiments.md` (a "Task 38" subsection appended under the FR-10 spike heading)
**Done when:** The spike's diff (`git show 1313b8bb`, `git diff 85f882a7 1313b8bb`) is applied by hand or `git apply --3way`, not cherry-picked with its message, and adapted to HEAD; `TrashView.tsx` and `TrashRefreshContext` are not edited; a Trash entry (`id: "trash"`) is in `UI_MODULE_VIEWS`, the slot has the optional `icon` and `alwaysEnabled` fields, `useModuleViews()` treats an `alwaysEnabled` slot as enabled regardless of `config.modules`, `ViewSwitcher` no longer lists Trash in `VIEW_OPTIONS`, and the Trash tab keeps its position (after Graph, before Sources); Task 11's characterization tests (`work-area-view-gating.test.tsx`, `viewSwitcher.test.tsx`) stay green with no assertion text changed (renders that pass `moduleViews` to carry the Trash slot are the only test edits, as in the spike), and a test shows the Trash tab stays present and reachable with the Sources module off and with no `config.modules` entry; Trash behaves as before in every existing view-reset and disabled-view case; the `AppShell.tsx` lines changed are counted (`git diff --numstat`) and recorded in `experiments.md` beside the spike's 5 added, 17 removed; `pnpm typecheck`, `pnpm lint` and `prettier --check` on touched files are run; electron and cli typecheck are run and recorded (a bare frontend `tsc` is not evidence); e2e coverage is Task 37 (lead-run) and is recorded here as "not run".
**Depends on:** 16
**Estimate:** 3
**Notes:** Owner decision at the Wave 1 checkpoint, 2026-11-07 (OQ-4: the spike cost is small enough; Trash converted as the FR-10 generality check). Satisfies FR-10 (conversion half) and FR-3 (view slot, second entry). Sole `AppShell.tsx`, `ViewSwitcher.tsx` and `uiRegistry.ts` editor until Task 39 starts. No other existing view is converted (FR-11). The spike ref is local and may be absent on another machine; if `1313b8bb` is not reachable, report the blocker, do not reconstruct it from memory.
**POS:** task_affd0a39
**Done:** [ ]

### Task 39: Selection-aware fallback when the Sources module is switched off while its view is open
**What:** Replace the always-`"edit"` fallback with the shell's existing view-reset logic, so the landing view depends on the selection and is never a type-disabled Edit tab.
**Files:** `frontend/components/Layout/AppShell.tsx`, `frontend/components/WorkArea/ViewSwitcher.tsx` and `frontend/components/Modules/uiRegistry.ts` (only if the fallback needs them), `frontend/tests/work-area-view-gating.test.tsx` (the `falls back to edit when the module is switched off while the view is open (selection: %s)` cases)
**Done when:** Tests first, then green: the Task 11 record of the exact reset conditions near `AppShell.tsx:482-512` (re-read at HEAD, since Task 38 changed the file) is cited, and the fallback reuses that logic rather than a new copy of it; with the module switched off while the Sources view is open, the shell lands on a view that is enabled for the current selection, with a test per selection kind (none, text, folder, source, image, audio) naming the view it lands on, and no case lands on a type-disabled Edit tab (a folder or no selection no longer lands on Edit); the cases that landed on `"edit"` before (text selection) are shown unchanged where Edit is enabled; no existing view's reset or gating behaviour changes (Task 11's tests stay green); `pnpm typecheck`, `pnpm lint` run; electron and cli typecheck run and recorded.
**Depends on:** 16, 38
**Estimate:** 3
**Notes:** Owner decision at the Wave 1 checkpoint, 2026-11-07, item 2 (the fallback is selection-aware, using the shell's existing view-reset logic, not always `"edit"`). Updates the Task 13 behaviour and FR-15 / OQ-7 wording. Serialized after Task 38 and before Task 20 (shared hot files). Do not decide a landing view the existing reset logic does not already produce; if it produces none for a case, record the case and report it.
**POS:** task_b12fc704
**Done:** [ ]

### Task 40: Shared rebuild rethrows locked-access errors, and each importer rebuilds `annotations.json`
**What:** Make `indexAllResources` and the annotation-body read in `derived-index-rebuild.ts` rethrow locked-access errors instead of swallowing them, and add a test that each of the three importers rebuilds `meta/index/annotations.json` through the shared rebuild.
**Files:** `frontend/src/lib/models/derived-index-rebuild.ts`, `frontend/tests/unit/import-rebuild-preserves-writing-log.test.ts`, `cli/tests/reindex.test.ts` (locked cases), an existing rebuild test file under `frontend/tests/unit/` if one fits
**Done when:** Tests first, then green, per `docs/standards/failure-visibility.md` and `docs/standards/security.md`: a locked-access error (`isLockedAccessError`) raised when `indexAllResources` reads a sidecar, when it reads resource content, and when the annotation-body step reads a sidecar is rethrown from `rebuildDerivedIndexes`, a test per read site, and the caller (`reindex`, an importer) surfaces it rather than reporting a rebuilt index; a non-locked unreadable sidecar keeps today's behaviour (skipped, with the stderr line `[reindex] annotation bodies of <id> not indexed: sidecar unreadable` for the annotation step and the existing tolerance in `indexAllResources`), pinned by a test per read site; no catch added or touched returns the same value for "failed" and "empty"; for each of docx, scrivener and plaintext, a test shows the importer's `rebuildIndexes` writes `meta/index/annotations.json` equal to the file built by one `indexAnnotationBodies` call per resource, through the shared rebuild (extend the existing `describe.each` in `import-rebuild-preserves-writing-log.test.ts`); Task 4's import-graph test stays green; `pnpm --filter getwrite-electron typecheck` (both tsc passes), `pnpm --filter getwrite-electron build`, `pnpm --filter getwrite-cli typecheck`, `pnpm --filter getwrite-cli build` and the CLI tests are run and recorded.
**Depends on:** 16
**Estimate:** 3
**Notes:** Owner decisions at the Wave 1 checkpoint, 2026-11-07, items 4 and 5 (combined: one file, one rebuild). Checkpoint section 9, items 10 and 11 (the swallowing catches were carried verbatim from the removed importer code; the importer annotation-index rebuild had no test). This changes an observable behaviour (a locked project now fails the rebuild instead of indexing nothing); the experiments record states it. Does not edit `indexer-queue.ts`.
**POS:** task_a8ce29a6
**Done:** [ ]

### Task 41: Repair the stale text in `experiments.md` and make it pass `prettier --check`
**What:** Fix the three stale statements in the experiments file and format it.
**Files:** `specs/features/sources-module-seam/experiments.md`
**Done when:** `prettier --check specs/features/sources-module-seam/experiments.md` passes (run and recorded); the "## FR-10 spike" heading's "Not yet recorded." placeholder is replaced by a pointer to the Task 15 subsection beneath it and the Task 38 subsection; the empty "Acceptance" section's "Not yet recorded." is replaced by a one-line note that Task 37 writes it (the heading stays, so the fixed headings are unchanged); the Task 7 note that case (d) is "recorded by Task 13" is replaced by a pointer to the tests that cover it, `tests/work-area-view-gating.test.tsx` describe "Sources module view (Feature 103 Task 13, FR-6 (d), FR-15)" and its cases "leaves the tab out of the list entirely when the module is off", "offers the tab when the module has no entry (on by default) and when on" and "brings the tab back when the module is switched on again" (checkpoint section 2, FR-6 (d)); no measurement or observed value is changed or deleted; `git diff` shows only these edits plus formatting.
**Depends on:** 16, 38, 39, 40
**Estimate:** 1
**Notes:** Owner decision at the Wave 1 checkpoint, 2026-11-07, item 6. Depends on 38, 39 and 40 only so the FR-10 section and its pointers are final before the repair; it must not run concurrently with any other task that appends to `experiments.md`.
**POS:** task_1d04e43d
**Done:** [ ]

### Task 42: FR-2 no-dynamic-import test also scans `uiRegistry.ts`
**What:** Extend the FR-2 source-text test so `frontend/components/Modules/uiRegistry.ts` is scanned for a dynamic `import()` and for a read of module code from the project store or user data.
**Files:** `frontend/tests/unit/module-registry.test.ts` (the describe "build-time only (FR-2) and no UI imports (FR-4)"), or `frontend/tests/unit/module-ui-registry.test.tsx` if the existing check sits better there
**Done when:** Tests first, then green: the existing `%s has no dynamic import() and no store or user-data read` check covers `registry.ts`, `manifest.ts` and `components/Modules/uiRegistry.ts`; the check can fail (a fixture string containing `import("x")` or the same pattern applied to a temporary copy is flagged, so the scan is not vacuous); it passes on `uiRegistry.ts` at HEAD after Task 38; no product file is changed.
**Depends on:** 16, 38
**Estimate:** 1
**Notes:** Owner decision at the Wave 1 checkpoint, 2026-11-07, item 8; closes the FR-2 gap in checkpoint section 2. Depends on 38 only so the scan runs against the registry file as converted; Tasks 20 and 31 later edit that file and the test then guards them.
**POS:** task_717c2463
**Done:** [ ]

### Task 20: Attachments section in the Sources view and the attachments-section slot
**What:** Build one attachments-section component with one list-reading hook, placed through a new registry slot kind, usable from the Sources view and the sidebar.
**Files:** `frontend/components/Sources/SourceAttachmentsPanel.tsx` (new, or the existing `frontend/components/Sidebar/SourceAttachmentsSection.tsx` refactored, as the recorded placement choice dictates), `frontend/components/Sources/useSourceAttachments.ts` (new), `frontend/components/Sources/SourcesView.tsx`, `frontend/components/Modules/uiRegistry.ts`, `frontend/components/Modules/useModuleEnabled.ts` only if needed, stories, tests under `frontend/tests/`
**Done when:** Tests first, then green: the placement choice (sidebar section stays, or moves into the slot) is recorded in `experiments.md` before the code; the section is one component with one list-reading hook; add, remove, replace and reorder work under the existing rules (image and audio only; no revision for an attachment change; a removed or replaced file goes to the project Trash and can be restored); a change made in the view shows in the sidebar and the reverse without reselecting the Source; the slot kind added has this real consumer; an a11y test and a story exist; the e2e spec is Task 22; Task 14's inventory lists remove and replace as going to Trash.
**Depends on:** 16, 18
**Estimate:** 5
**Notes:** ORDERING DEPENDENCY NOT EXPRESSIBLE IN THE FIELD: this task MUST NOT start until Tasks 38 and 39 are done (the `sab.tasks/1` check requires a task to depend only on lower-numbered tasks, and 38 and 39 were numbered after the checkpoint so POS ids stay valid). In the file, 38 and 39 sit before this task. Runs after Task 39 because Tasks 38, 39 and this task all edit `ViewSwitcher.tsx` and `uiRegistry.ts` (and 38, 39 `AppShell.tsx`): order is Trash conversion (38), selection-aware fallback (39), then this task. Satisfies FR-3 (attachments slot), FR-17, FR-19, FR-31. The module-off state must leave the Feature 102 sidebar section working (OQ-13; Task 10 test).
**POS:** task_90290142
**Done:** [ ]

### Task 21: Image preview and audio playback
**What:** Show an image attachment and play an audio attachment from the Sources interface, with platform handling and revoked object URLs.
**Files:** `frontend/components/Sources/AttachmentMedia.tsx` (new), `frontend/components/Sources/useAttachmentObjectUrl.ts` (new), `frontend/components/Sources/SourceAttachmentsPanel.tsx` (as placed by Task 20), stories, tests under `frontend/tests/`
**Done when:** Tests first, then green: an attachment is shown only as the kind its stored entry and magic-byte check say (a misnamed fixture); an image renders and an audio plays through native `<audio>`/`<img>` elements with accessible names and keyboard operable controls; the Blob object URL is created from Task 19's client and revoked on unmount (a test spies on `URL.revokeObjectURL`); a read failure is shown, never as an empty attachment; a control that cannot work on a platform says so; a paired device sees the controls it is allowed to use; an a11y test and story exist; no claim about 100 MB behaviour is made in code or comments.
**Depends on:** 16, 19, 20
**Estimate:** 5
**Notes:** Satisfies FR-18 (UI), FR-19, FR-31. Whether a 100 MB Blob is a memory risk is a hypothesis for Task 23 to measure, not a finding.
**POS:** task_ccf9ab83
**Done:** [ ]

### Task 22: E2E spec for attachments and media in the Sources view
**What:** Write the Playwright e2e test for adding, previewing and removing an attachment in the Sources view; execution is lead-run.
**Files:** a spec under `frontend/e2e/` (new `sources-view-attachments.spec.ts`), the Storybook story it targets
**Done when:** The spec exists, covers add, preview/playback controls present, remove to Trash, and a locked-project failure state; it typechecks and lints (`pnpm --filter getwrite-frontend typecheck`, `lint`); its execution is explicitly deferred to Task 37 (`pnpm test:e2e` needs the main checkout, outside the sandbox, `pnpm storybook` stopped) and is recorded as "not run" here.
**Depends on:** 16, 21
**Estimate:** 3
**Notes:** Satisfies FR-17 (e2e requirement). The orchestrator writes it; it cannot run it.
**POS:** task_868a6de3
**Done:** [ ]

### Task 23: OWNER-RUN, manual: Android 100 MB attachment baseline on the Pixel
**What:** On the Pixel, add, read and play or preview a 100 MB attachment through the native transport and record the observed throughput and build.
**Files:** `specs/features/sources-module-seam/experiments.md` (Wave 2 Android 100 MB baseline section)
**Done when:** The owner and lead record, as observed values, the build, the device, the attachment size, the time or throughput for add and for read, and whether preview or playback worked, with no cause stated; the product figures (about 10 MB/s, 100 MB cap) are not copied as a result; if the run does not happen, "FR-18 Android 100 MB baseline" is listed under "Not verified" and the PR must not claim the baseline holds.
**Depends on:** 16, 21
**Estimate:** 1
**Notes:** OWNER-RUN / MANUAL: the orchestrator skips this task; the lead runs it with the owner. Needs the Pixel, adb outside the sandbox and the main checkout. Nothing depends on it, so skipping it does not block Task 37; the Feature 102 in-memory fake filesystem check was not a device run and must not stand in for it. Satisfies FR-18 (MUST per OQ-5).
**POS:** task_72b2512a
**Done:** [ ]

### Task 24: Unchanged-behaviour tests for Feature 102 (entity, goals, templates)
**What:** Add the tests that show the Sources view leaves Feature 102 behaviour unchanged.
**Files:** existing entity, word-goal and template test files under `frontend/tests/` (or a new `sources-view-unchanged.test.tsx` if none fits); no product source change expected
**Done when:** A test per statement passes: a Source with `entityKind` is still matched in prose, appears in the roster and graph, and can be declared from the sidebar Entity section; Sources stay out of the project and daily word goals unless the goal filter selects them, and the per-resource goal stays unavailable for a Source; the Sources view offers no control to create a template from a Source or a Source from a template; no Source-to-entity link exists (a source-text or schema check); if a test fails, the failure is recorded and reported, not fixed in a file another task owns.
**Depends on:** 16, 18
**Estimate:** 3
**Notes:** Satisfies FR-20.
**POS:** task_6b45d86d
**Done:** [ ]

## Wave 3: excerpts and citations

### Task 25: Annotation `target`, locator and `sourceName` declarations and validation
**What:** Add the optional `target` (with locator and `sourceName`) to the annotation type, schema, key list, validators and client schema, with the compatibility and boundary tests.
**Files:** `frontend/src/lib/models/types.ts` (Annotation type), `frontend/src/lib/models/schemas.ts` (`AnnotationSchema`), `frontend/src/lib/models/annotation-validation.ts` (including `NEW_ANNOTATION_KEYS`), `frontend/src/lib/models/annotations-core.ts`, `frontend/src/lib/api/schemas.ts`, existing annotation tests under `frontend/tests/`
**Done when:** Tests first, then green: every existing annotation fixture round-trips byte-equal; a `target` `{ sourceId, attachmentId?, excerptId?, locator?, sourceName? }` survives a write and the client parse; an id that is not well-formed, an unknown key inside `target`, a locator over its limit, a locator type outside page, timestamp, paragraph or line, and a `sourceName` over the resource-name limit are refused with a message and nothing is stored; a timestamp locator is not validated against the attachment; `sourceName` is not updated by this task on rename; electron and cli typecheck and build run and recorded.
**Depends on:** 16
**Estimate:** 5
**Notes:** Satisfies FR-24 (record), FR-21 (locator rules), FR-30. Owner of the annotation schema and validation files until Task 26 completes.
**POS:** task_881464fc
**Done:** [ ]

### Task 26: Empty-body rule for annotations with a `target`
**What:** Enforce in the core that an empty body is allowed only with a `target` and that no body exceeds 5000 characters.
**Files:** `frontend/src/lib/models/annotation-validation.ts`, `frontend/src/lib/models/annotations-core.ts`, existing annotation tests under `frontend/tests/`
**Done when:** Tests first, then green, in the core and not only the interface: an empty body with a `target` is accepted; an empty body without one is refused; a body over `ANNOTATION_LIMITS` is refused for both; a body update that would empty an annotation without a `target` is refused; electron and cli typecheck run and recorded.
**Depends on:** 16, 25
**Estimate:** 3
**Notes:** Satisfies FR-26, OQ-3.
**POS:** task_a1fda9ba
**Done:** [ ]

### Task 27: `target` survives copy, duplicate, paste and Trash restore
**What:** Add the tests that a `target` survives each operation that moves an annotation, fixing the owning function only where a test fails.
**Files:** `frontend/src/lib/models/annotation-copy.ts`, `frontend/src/lib/models/trash.ts` (only if a test fails), existing annotation-copy and Trash tests under `frontend/tests/`
**Done when:** Tests first: a `target` survives a write, `remapCopiedAnnotations`, a duplicate, a paste and a Trash restore (with a Source that has a `target` citing another Source); the results pass or the failing function is fixed within `annotation-copy.ts` or `trash.ts` and the fix shown by the test; no other file is edited; electron and cli typecheck run and recorded.
**Depends on:** 16, 26
**Estimate:** 5
**Notes:** Satisfies FR-24 (survival), FR-25 (copy with new identity, kept on move). Sole editor of `trash.ts` on this branch.
**POS:** task_b42da1b5
**Done:** [ ]

### Task 28: Excerpt operations and "no mark by design" logic
**What:** Add the model and flow logic for creating text excerpts and locator-only attachment excerpts, and treat a target with an attachment and no passage as normal, not detached.
**Files:** `frontend/src/lib/annotation-flows.ts`, `frontend/src/lib/models/excerpts.ts` (new, pure helpers), existing annotation-flow tests under `frontend/tests/`
**Done when:** Tests first, then green: an excerpt of a Source with text is an annotation in the Source body keeping Source, locator and the excerpted text; a locator-only excerpt of an image or audio attachment is an annotation on the Source with `target` `{ sourceId, attachmentId, locator }`, empty body, no mark; the detached-state logic treats "no mark by design" as normal and re-attach is not offered for it; no Trash kind and no excerpt index are added (a test that no new index file or Trash kind appears); annotations on image or audio resources remain refused (product FR-90); a failed write after a mark is added leaves the state the annotation flows leave today (body stored, listed as detached).
**Depends on:** 16, 26
**Estimate:** 5
**Notes:** Satisfies FR-21, FR-22, FR-25 (failed write). Sole editor of `annotation-flows.ts`.
**POS:** task_77cdb616
**Done:** [ ]

### Task 29: Excerpts interface in the Sources view
**What:** Add excerpt creation, listing and locator entry for a Source to the Sources view.
**Files:** `frontend/components/Sources/SourcesView.tsx`, `frontend/components/Sources/ExcerptsSection.tsx` (new), `frontend/components/Sources/LocatorField.tsx` (new), stories, tests under `frontend/tests/`
**Done when:** Tests first, then green: the writer can mark a text excerpt and give it a locator with an optional type (page, timestamp, paragraph, line) and free-text value; for an image or audio attachment the writer can record a locator-only excerpt; failure and success are visible; controls are keyboard operable with accessible names; deleting an excerpt uses the annotation delete path (limited per Task 14); a11y test and story exist.
**Depends on:** 16, 20, 28
**Estimate:** 5
**Notes:** Satisfies FR-21, FR-22, FR-19, FR-31. Does not touch the registry.
**POS:** task_59e4ebd7
**Done:** [ ]

### Task 30: Excerpt not-found tests (edit, delete, revision restore)
**What:** Add the tests that an excerpt whose passage is lost is shown as not found with its saved text and is not deleted.
**Files:** existing annotation detached-state tests under `frontend/tests/`; no product source change expected
**Done when:** A test per case passes (edit of the passage, deletion of the passage, revision restore): the excerpt is kept, derived as not found, shown with its saved text, and can be re-attached or deleted; detached state is derived, not stored; a failing case is recorded and reported, not fixed in a file another task owns.
**Depends on:** 16, 28
**Estimate:** 3
**Notes:** Satisfies FR-23.
**POS:** task_8c75dc9c
**Done:** [ ]

### Task 31: Citation controls and the citation-control slot
**What:** Add the editor controls to tie a selected passage to a Source, optionally an excerpt, attachment and locator, placed through a new registry slot kind.
**Files:** `frontend/components/Editor/Citations/CitationControl.tsx` (new), `frontend/components/Modules/uiRegistry.ts`, its story, tests under `frontend/tests/`
**Done when:** Tests first, then green: the control is placed through the registry slot (the slot kind has this real consumer) and is absent while the module is off; selecting a passage and choosing a Source stores an annotation with a `target` carrying `sourceName` at citing time; excerpt, attachment and locator are optional; the control is operable by keyboard and shows a visible result or failure; a failed write after the mark is added leaves the state the annotation flows leave today; a11y test and story exist; the editor schema extensions are unchanged and `AnnotationMark` stays registered unconditionally (FR-11).
**Depends on:** 16, 20, 28
**Estimate:** 5
**Notes:** Satisfies FR-3 (citation slot), FR-24, FR-25, FR-11. Does not edit `AnnotationsPanel.tsx` (Task 33).
**POS:** task_13bac3bc
**Done:** [ ]

### Task 32: Citation target state and the missing-target tests
**What:** Add the pure function that derives whether a citation's Source, attachment or excerpt is present, in Trash, purged or removed, with the five FR-27 tests.
**Files:** `frontend/src/lib/models/citation-target-state.ts` (new), existing annotation and Trash tests under `frontend/tests/`
**Done when:** Tests first, then green, one per case, recording what the citation shows as observed: Source in Trash, Source purged, attachment removed, excerpt deleted, and Source renamed after the citation (it keeps the name at citing time); the derived state never resolves to hidden, nothing, or deleted; the function is pure and importable under FR-4 (Task 4's test passes); no where-cited index is built; electron and cli typecheck run and recorded.
**Depends on:** 16, 25
**Estimate:** 3
**Notes:** Satisfies FR-27, OQ-2, OQ-168.
**POS:** task_3886ff48
**Done:** [ ]

### Task 33: Annotations panel shows excerpts and citations
**What:** Show citations and excerpts in the annotations panel with the Source name, the "no mark by design" state and the missing-target state.
**Files:** `frontend/components/Editor/Annotations/AnnotationsPanel.tsx`, `frontend/components/Editor/Annotations/useAnnotationsPanel.ts`, stories, tests under `frontend/tests/`
**Done when:** Tests first, then green: a citation row shows the name of its Source; a locator-only excerpt is shown as normal (not detached) with no re-attach control; a citation whose target is missing shows the Source as removed with the saved name, never hidden; plain notes are unchanged; a citation or excerpt delete uses the annotation delete path; a11y test and story updated.
**Depends on:** 16, 28, 32
**Estimate:** 5
**Notes:** Satisfies FR-22 (panel), FR-25, FR-27. Sole editor of the panel files.
**POS:** task_aa32043a
**Done:** [ ]

### Task 34: FR-13 permanent-deletion check, completed, and paired-device control states
**What:** Complete the FR-13 inventory for every action Waves 2 and 3 added and test that limited controls are disabled with a visible reason.
**Files:** `specs/features/sources-module-seam/experiments.md` (FR-13 inventory section), existing sharing-limits tests under `frontend/tests/`
**Done when:** The inventory lists every action the Sources module adds that permanently deletes or overwrites data (removing and replacing an attachment going to Trash, deleting an excerpt, deleting a citation, purging a Source, and any action a new route added) with, for each, the existing switch that covers it and the test that shows it; a limited action's refusal is HTTP 403 `{ error, limit }`; a limited control is disabled with a visible reason; an action no existing switch covers is reported to the owner and not decided; no sixth switch is added.
**Depends on:** 16, 19, 21, 29, 31, 33
**Estimate:** 3
**Notes:** Satisfies FR-13, FR-19.
**POS:** task_8f84b520
**Done:** [ ]

### Task 35: Citations do not change compile or export output
**What:** Extend the compile and export tests so a document carrying a citation compiles and exports byte-identically to one without, in txt, md, docx and pdf.
**Files:** the existing compile and export byte-identity tests under `frontend/tests/` (the pending product FR-89 test); no product source change expected
**Done when:** A test per format (txt, md, docx, pdf) passes comparing a document with a citation (and a locator-only citation) to the same document without; a failing format is reported with the observed difference, not fixed in a file another task owns; no bibliography or footnote output exists.
**Depends on:** 16, 25
**Estimate:** 3
**Notes:** Satisfies FR-28.
**POS:** task_ce597ef7
**Done:** [ ]

## Wave 4: Type filter

### Task 36: Source in the query Type filter
**What:** Add "source" to the `type` intrinsic's value options without changing existing options or results.
**Files:** `frontend/src/lib/models/query-intrinsics.ts`, existing query and saved-query tests under `frontend/tests/`
**Done when:** Tests first, then green: the options "text", "image", "audio", "folder" are unchanged and "source" is added; over the existing saved-query corpus, results before and after are equal; for a project with a Source and a text document, `type = source` returns the Source only and the picker lists Source; electron and cli typecheck run and recorded (the file is under `lib/models`).
**Depends on:** 16
**Estimate:** 2
**Notes:** Satisfies FR-29.
**POS:** task_07c18aa3
**Done:** [ ]

## All waves

### Task 37: LEAD-RUN: final suites exactly as CI runs them
**What:** Run every CI command from the places the workflows run them, record each as run or not run, and write the acceptance section, including the "Not verified" list.
**Files:** `specs/features/sources-module-seam/experiments.md` (Acceptance and Not verified sections)
**Done when:** The CI command list is first re-read with `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` and any difference from the list below is recorded; each of these is run and its result recorded: frontend (`cd frontend`) `pnpm run format:check`, `pnpm lint`, `pnpm run check:no-hex`, `pnpm typecheck`, `pnpm test:ci`, `pnpm test:e2e` (builds and serves Storybook on :6006; `pnpm storybook` stopped first), `pnpm --filter getwrite-frontend build`; electron `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`), `pnpm --filter getwrite-electron test`, `pnpm --filter getwrite-electron build`; cli `pnpm --filter getwrite-cli typecheck`, `pnpm --filter getwrite-cli test`, `pnpm --filter getwrite-cli build`, then `node cli/dist/bin/getwrite-cli.cjs --help | head -n 20`, `node cli/dist/bin/getwrite-cli.cjs doctor --help | head -n 20` and `node cli/dist/bin/getwrite-cli.cjs prune --help | head -n 20`; android `pnpm --filter getwrite-android build`; root `pnpm knip` and `pnpm build:native` where they can run; a command that cannot run is listed under "Not verified" and not claimed; "Not verified" also lists, unless run: a write of `config.modules` by an older build (FR-5), Task 17 and Task 23 (Android device checks), native lock parity (reasoned, not run); the Acceptance section states which waves landed and which stopped (FR-36) and records that no bare `tsc` was used as evidence.
**Depends on:** 22, 24, 30, 31, 33, 34, 35, 36
**Estimate:** 3
**Notes:** ORDERING DEPENDENCY NOT EXPRESSIBLE IN THE FIELD: this task also depends on Tasks 38, 39, 40, 41 and 42 (the `sab.tasks/1` check requires a task to depend only on lower-numbered tasks; the lead may add them to a POS link). It MUST NOT start until all five are done. LEAD-RUN: not for the orchestrator. `pnpm test:e2e`, `next build` and `pnpm build:native` run outside the sandbox from the main checkout, never a worktree, after the orchestrator lands the waves. Satisfies FR-34, FR-35, FR-36, FR-30 to FR-32 (final verification). Tasks 17 and 23 are not dependencies (they are owner-run); their results, if run, are in `experiments.md`, otherwise under "Not verified". Task 25 to Task 29 and Task 32 are covered transitively through Tasks 31, 33, 34 and 35. Task 38 (Trash conversion) is covered by e2e here: `pnpm test:e2e` must pass with Trash behind the slot, and the result is recorded as the e2e coverage for the conversion (the spike's e2e was never run).
**POS:** task_2b5a7f61
**Done:** [ ]

## Summary
- Total tasks: 42
- Total estimated effort: 139 story points
- Status: Tasks 1-16 done and committed; Tasks 38-42 were added after the Wave 1 checkpoint (128 points for Tasks 1-37 plus 11 for Tasks 38-42: 3 + 3 + 3 + 1 + 1; Task 19's added work leaves it sized 5)
- Critical path: Tasks 2 → 8 → 12 → 13 → 15 → 16 (owner checkpoint) → 25 → 26 → 28 → 33 → 34 → 37
- Risks: Task 5 (four hand-written rebuild copies must stay byte-equal; the electron worker graph and CLI build are the Run B failure mode); Task 7 (the only task editing `indexer-queue.ts`; per-save read cost unmeasured until Task 1); Task 12 (the Source list read may need a new storage operation, which would take `next.config.mjs` after Task 8); Task 13 (sole `AppShell.tsx` editor; the post-guard reachability bug is recorded history); Task 15 (must stay off the branch, and its result is the owner's to judge, OQ-4); Task 16 (the orchestrator halts for the owner, and the owner may reorder later waves or decide Trash conversion); Tasks 17 and 23 (owner-run on a Pixel, which the orchestrator cannot do; Android image display today is not established); Tasks 25 and 26 (annotation schema and validation files shared by all of Wave 3); Task 27 (the only branch editor of `trash.ts`); Task 14 (changes existing paired-device behaviour for plain annotation deletes, by owner decision); Tasks 38 and 39 (edit `AppShell.tsx` after Task 13, strictly before Task 20; Task 38 depends on a local spike ref that may be absent); Task 40 (a locked project now fails the rebuild instead of indexing nothing); Task 19 (gained the attachments-client locked mapping, still sized 5).

## Open Questions
- OQ-4 (spec): RESOLVED (owner, Wave 1 checkpoint, 2026-11-07, "all recommended"): the Trash-slot spike cost is small enough; Trash is converted to a registry view slot (Task 38, spike `1313b8bb` adapted to HEAD; e2e in Task 37).
- Checkpoint decisions of 2026-11-07 (owner, "all recommended"; recorded here, none open): (2) the module-off fallback is selection-aware, using the shell's existing view-reset logic (Task 39); (3) the attachments client maps HTTP 401/409 to the locked-access errors, folded into Task 19; (4) and (5) the shared rebuild rethrows locked-access errors, and each importer's annotation-index rebuild is tested (Task 40); (6) `experiments.md` stale text repaired and `prettier --check` passes (Task 41); (7) the built behaviour stays, a switched-off module's tab is absent, not disabled, and the FR-15 wording is corrected in the spec (never in `disabledViews` or `disabledReasons`); (8) the FR-2 scan covers `uiRegistry.ts` (Task 42); (9) Wave 2 is approved.
- OQ-170 (product spec): whether the first cut must switch editor schema extensions per project. Open and non-blocking; no task depends on it (FR-11).
