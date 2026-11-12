# Tasks: Organizer grid (Feature 109)

Source spec: `specs/features/organizer-grid.md` (FR-1..FR-23, US-1 to US-5; OQ-1 to OQ-19 resolved by the owner at Gate 3, 2026-11-11, "all recommended", none open). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 109. Depends on the shipped Features 24, 66, 8, 72, 99, 101, 102, 103, 90, 108 and 77. Branch: `feat/organizer-grid`; one PR. Measurements: `specs/features/organizer-grid/experiments.md` (an index created by Task 1); each task records its results in `specs/features/organizer-grid/experiments/task-<n>.md`, never directly in `experiments.md`, so tasks running in parallel never edit the same file; Task 44 links them at close-out.

Shape of the work:
- Wave order set by the owner (F109-1, Gate 2): the grid (Tasks 5 to 23, FR-2 to FR-13) is the first wave; saved arrangements and seeding (Tasks 24 to 36, FR-14 to FR-19) follow; there is NO owner checkpoint between them, and the second wave's contract-first siblings run alongside the first wave wherever dependencies allow.
- Task 1 is the experiments record (FR-1 a, b, f, g, i). Task 2 is the contract (types, constants, inert core stubs); it adds no behaviour, so it does not wait for Task 1, and it lets models, cores, routes, transports, native backends and UI proceed as parallel siblings. Task 3 is the spike record (FR-1 c, d). Task 4 is the measurement fixture generator; FR-1 (e) and (h) are recorded in the lead-run Task 42, which is the one departure from FR-1's wording.
- First wave: pure models (Tasks 5 to 9), field-write core, folder `clearFieldKeys`, route, transport and native backend (10 to 14), hooks (15, 16, 22), cap constant (17), UI pieces (18 to 21), wiring (23). Second wave: config plumbing (24), arrangements core, route, transport and native backend (25 to 28), availability and preference (29, 30), controls and hook (31, 32), seeding (33 to 35), wiring (36). Stories and pins: 37 to 40.
- Tasks 41 (build, inlining), 42 (device runs and card cap) and 44 (final CI and close-out) are LEAD-RUN; Task 43 is documentation for the scribe, written while the lead and owner do the device run (Task 42), so it states no device result or card-cap figure; Task 44 adds them.

Requirement traceability (every FR-1..FR-23 maps to at least one task; FR-20 is also an inherited rule of every code task):
- FR-1: 1, 3, 4, 42. FR-2: 5, 7, 18, 19, 23, 40. FR-3: 5, 15, 18, 23. FR-4: 6, 23. FR-5: 2, 5, 7, 19. FR-6: 23. FR-7: 8, 10, 11, 12, 13, 14, 22, 40. FR-8: 8, 22. FR-9: 9, 15, 20, 23, 40. FR-10: 7, 21, 23, 39. FR-11: 19, 20, 37, 38. FR-12: 7, 16, 17, 23, 42. FR-13: 10, 12, 13, 14, 22, 40.
- FR-14: 2, 24, 25, 26, 27, 28, 31, 32, 36. FR-15: 29, 31, 32, 36. FR-16: 30, 32, 36. FR-17: 33, 34. FR-18: 35. FR-19: 18, 31, 36, 37. FR-20: every code task, 25. FR-21: every task (no task adds a derived mention row, create-from-cell, date axis, text, number, date or boolean axis, per-cell order, a Move to menu, structure packs or a cross-folder move; a task that needs one stops and returns to the owner). FR-22: 41, 42, 43. FR-23: 44.

Compact dependency graph (`a -> b` means b depends on a):
- 1 -> 24, 33; 2 -> 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 24, 25, 26, 27, 28, 29, 31, 33, 34; 3 -> 15, 20; 4 -> 42; 5 -> 23; 6 -> 23; 7 -> 19, 21, 23; 8 -> 20, 22; 9 -> 20; 11 -> 22; 13 -> 22; 14 -> 28, 41; 15 -> 23; 16 -> 23; 17 -> 23; 18 -> 23, 37; 19 -> 23, 37, 38; 20 -> 23, 38; 21 -> 23, 37, 38; 22 -> 23; 23 -> 36; 24 -> 25, 32, 33; 25 -> 35; 27 -> 32; 28 -> 41; 29 -> 32; 30 -> 32; 31 -> 36, 37; 32 -> 36; 33 -> 35; 34 -> 35; 35 -> 41; 36 -> 40, 41; 37 -> 39, 41; 38 -> 42, 43; 39 -> 41; 40 -> 41, 42, 43; 41 -> 42, 43; 42 -> 44; 43 -> 44.

Parallel waves the orchestrator may run (LEAD-RUN tasks 41, 42 and 44 are never run by the orchestrator); no owner checkpoint separates the first wave from the second:
- Wave 1: {1, 2, 3, 4, 11, 17, 30}.
- Wave 2: {5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 24, 26, 27, 29, 31, 34}.
- Wave 3: {19, 20, 21, 22, 25, 28, 32, 33}.
- Wave 4: {23, 35, 37, 38}.
- Wave 5: {36, 39}.
- Wave 6: {40}.
- Wave 7: {41}.
- Wave 8: {42, 43}.
- Wave 9: {44}.

Hot files and the only tasks allowed to edit them (file conflicts for wave planning):
- `specs/features/organizer-grid/experiments.md`: Task 1 creates it, Task 44 closes it; every other task writes only its own `experiments/task-<n>.md`.
- `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`: Task 23, then Task 36 (by dependency). Its two existing test files `tests/organizerView.test.tsx` (Tasks 23 and 36) and `tests/organizerFolderCards.test.tsx` (Task 23) are extended by those tasks only.
- `frontend/next.config.mjs`: Task 14, then Task 28.
- `frontend/src/lib/models/schemas.ts` and `frontend/src/lib/api/schemas.ts`: Task 24, then Task 33. `types.ts`, `project.ts`, `projectsSlice.ts`: Task 24 only. `modules/registry.ts` and `module-registry.test.ts`: Task 34 only. `project-creator.ts` and `project-types-static.ts`: Task 35 only.
- `organizer-field-write-core.ts`: Task 2 (stub), Task 10. `organizer-arrangements-core.ts`: Task 2 (stub), Task 25. Folder metadata core, route, client and native backend: Task 11 only.
- `organizerGridCap.ts` and its test: Task 17, then Task 42 (the owner's figure).
- `docs/`, `frontend/CLAUDE.md`, root `CLAUDE.md`, `android/CLAUDE.md`, `OrganizerView/README.md`: Task 43 only, then Task 44 for the device-run results.

**Builds and devices:** `next build`, `pnpm build:native`, `pnpm test:e2e`, Storybook build, `cap sync`, Gradle and every real-browser, emulator or device run happen only from the main checkout, outside the command sandbox, by the lead with the owner. No orchestrator task runs them; a worktree cannot run `next build` or `build:native`. Tasks that write a story or an e2e spec check only that it typechecks and lints.

**What the orchestrator cannot verify:** the native backends on a device, the paired-device gate against a real paired client, the grid, drag, keyboard and phone layout in a real WebView, the first-paint layout flash, the inlining of new modules (Task 41), the card cap (Task 42) and the whole device run (Task 42). For these the orchestrator verifies only what the task's Done when names (tests with fakes, typecheck, lint) and reports the rest as not run. Unit tests with fakes are never evidence about a device.

**New dependencies:** none expected (FR-20). A task that finds it needs one stops and returns to the owner; the owner installs it.

**Electron worker constraint:** every task whose Files include anything under `frontend/src/lib/models/`, `frontend/src/lib/core.ts`, `cli/` or `electron/` MUST also run `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`) and `pnpm --filter getwrite-cli typecheck`, and record each as run or not run. A bare frontend `tsc` is not accepted as evidence.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tests first (`docs/standards/testing.md`): add to an existing test file before creating one where the Files list names one; code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions) and `docs/standards/code-documentation.md`. Every catch follows `docs/standards/failure-visibility.md` (a failed read of folders, saved queries, a folder sidecar or an excerpt never renders as an empty cell, an empty grid or no arrangements). Boundary and fail-closed rules follow `docs/standards/security.md` (name, source id, field key, axis and count validated, unknown keys refused, no client-supplied path, no echo of client input). The storage context is established as `docs/standards/storage-context.md` requires. Read a component's source and stories before using any of its props. UI follows `docs/standards/accessibility.md` and `docs/standards/storybook-implementation.md`; no red, no colour alone.
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run `pnpm typecheck` and `pnpm lint` on touched files. A suite not run is reported as not run, never as passing.
- Write no cause that no experiment separated. A statement in the spec marked READ is a reading until its test runs; the device run is the only evidence about device behaviour.
- The default arrangement (Rows none, Columns order, direct children) stays today's Organizer; the card cap figure is stated nowhere before `experiments/task-42.md` exists.
- Each task records its results in its own `specs/features/organizer-grid/experiments/task-<n>.md`.
- Implementors do not commit and do not push; the orchestrator commits.

### Task 1: Experiments record: FR-1 inventory (a), (b), (f), (g), (i)
**What:** Create the experiments index and record FR-1 items (a), (b), (g) and (i) as observed values from reading and throwaway probes, and (f) as to-be-run.
**Files:** `specs/features/organizer-grid/experiments.md` (new; index with fixed headings Environment, FR-1 inventory, Device run, Card cap, Not verified, Acceptance; edited by this task and by Task 44 only), `specs/features/organizer-grid/experiments/task-1.md` (new; this task's results only)
**Done when:** `experiments.md` exists with the headings above and an environment record (node version, commit, commands); `experiments/task-1.md` records, each as an observed value with the command or test that produced it: (a) for a folder with interleaved folders and documents and chosen `orderIndex` values, the order the Organizer shows today and the order the tree shows, and whether they differ; (b) whether two `updateResource` calls in one handler for one document keep both fields in the stored sidecar (a test through the page's closure) and whether a write for a card that is not the globally selected resource restores or clears `resourceSubtype`, `entityKind`, `aliases` or `wordCountGoal`; (g) whether a new `project.json` config key survives `normalizeProjectConfig`, `buildStoredProject`, the Redux copy, a reopen and a `ProjectConfigSchema` parse, one probe per path, as the code is before Task 24; (i) whether `project-type.schema.json` or anything that lists project types rejects a type with a key the schema does not know; (f) the raw-comparison convention as READ with the `frontend/out/_next/static` grep recorded as to be run in Task 41, not claimed. No cause is written as a cause.
**Depends on:** none
**Estimate:** 5
**Notes:** Reads only (no edits): the Organizer view and tree builder, the page's `updateResource`, `sidecar.ts`, `project.ts`, `projectsSlice.ts`, `schemas.ts`, `project-types-static.ts` and `project-type.schema.json`; probes live in the scratchpad. Satisfies FR-1 (a), (b), (f), (g), (i). FR-1 (c) and (d) are Task 3. FR-1 (e) (excerpt and folder-sidecar read cost at 100, 500 and 2000 cards) and (h) (the card cap) need a generated large project and a device, so they are recorded in Task 42 (LEAD-RUN) with the fixture from Task 4; this is the one departure from FR-1's wording that the first task records them, and the index says so. Per the repo rule, this task writes measurements to `experiments/task-1.md`, not into `experiments.md` beyond the index; no other task edits `experiments.md` before Task 44. No build is run here (builds fail in worktrees).
**Done:** [ ]

### Task 2: Contract: arrangement and grid types, constants, inert stubs
**What:** Define the types-only contract (axis, source, arrangement, grid cells, drop and write inputs and results, operation inputs) with inert core stubs so models, cores, routes, transports, native backends and UI proceed as siblings.
**Files:** new `frontend/src/lib/models/organizer-grid-types.ts` (axis `none | order | status | subtype | field`, source `folder | smart-folder`, arrangement `{ id, name, source, rows, columns }`, constants for 50 arrangements and a 1 to 100 character name, grid cell and placement types, axis value lists, field-write input and result, arrangement add, rename and delete inputs and results, the unavailable-reason union), new `frontend/src/lib/models/organizer-field-write-core.ts` and `frontend/src/lib/models/organizer-arrangements-core.ts` (exported signatures only, each body throws `not implemented`), new `frontend/tests/unit/organizer-grid-types.test.ts`, `specs/features/organizer-grid/experiments/task-2.md` (new; this task's results only)
**Done when:** Tests first, then green: the constants are 50 and 100; the two stubs export the signatures other tasks import; the types module imports no React, JSX, JSON or `node:*`; `pnpm typecheck` and `pnpm lint` on touched files pass; `pnpm --filter getwrite-electron typecheck` (both passes) and `pnpm --filter getwrite-cli typecheck` run and recorded as run or not run.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-5, FR-7, FR-14 (shapes from OQ-2), FR-20. Types, constants and inert stubs only; no behaviour is merged, so it does not wait for Task 1. The stubs are replaced by Tasks 10 and 25, one file each. The Electron worker constraint applies (files under `lib/models/`).
**Done:** [ ]

### Task 3: Spike record: FR-1 (c) smart-folder read and (d) dnd-kit keyboard drag
**What:** Record, from throwaway probes that are not merged, how a smart folder's ids can be read without touching shared query state and whether dnd-kit keyboard drag moves a card between droppable cells of a two-dimensional layout.
**Files:** `specs/features/organizer-grid/experiments/task-3.md` (new; this task's results only)
**Done when:** `experiments/task-3.md` records as observed values with the command or test: (c) that `evaluateQueryAst` (or the transport) returns a saved query's matching ids with `activeQueryIds`, the shell's active smart folder and the Data view unchanged (checked by test), whether a deleted query id is distinguishable from a list not yet loaded (`isLoadingQueries`), and the time on the largest project available or "not measured"; (d) whether `@dnd-kit` keyboard drag with `sortableKeyboardCoordinates`, and with a custom coordinate getter over droppable cells, moves a card between cells of a grid layout including an empty cell, the working getter's source pasted into the record, and which keys collide with roving arrow keys; the spike is not merged and the file list of the repo is unchanged.
**Depends on:** none
**Estimate:** 5
**Notes:** Reads only (no edits): `query-transport-service.ts`, `querySlice.ts`, `saved-queries.ts`, the Organizer view and card; spike code lives in the scratchpad only. Satisfies FR-1 (c), (d). Its record decides the custom coordinate getter that Task 20 builds (OQ-9) and the query read Task 15 uses (OQ-14). Run in jsdom only: a jsdom spike is not evidence about touch or a device, and the record says so. Write nothing as a cause that was not separated.
**Done:** [ ]

### Task 4: Measurement fixture generator for large generated projects
**What:** Add a script that writes a generated project of N text resources (spread over folders, with select, multiselect, status and subtype values) for the card-cap measurement.
**Files:** `scripts/organizer-grid-fixture/generate.mjs` (new), `scripts/organizer-grid-fixture/README.md` (new), `specs/features/organizer-grid/experiments/task-4.md` (new; this task's results only)
**Done when:** Run with N of 100, 500 and 2000 in the scratchpad, the script writes a project directory that the repository's own project loader opens (checked by loading it through the model layer in a throwaway probe); the sidecars carry the values named above; the README states the command, the field set and that the data is generated; the run results are in `experiments/task-4.md` with no timing claims.
**Depends on:** none
**Estimate:** 3
**Notes:** Serves FR-1 (e), (h) and OQ-8 (generated cards). Reading the project format from `frontend/src/lib/models/` only; nothing under `projects/` is written by the task. Getting the generated project onto the Pixel 7 Pro (import) is the lead's step in Task 42.
**Done:** [ ]

### Task 5: Pure source model: tree order and source resolution
**What:** Add a pure module that lists a folder's direct children, its descendants flattened in tree order (documents only) and a smart folder's cards in tree order, with the tree-order rule pinned by a test against the tree's own order.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/organizerSource.ts` (new), `frontend/tests/organizerSource.test.ts` (new), `specs/features/organizer-grid/experiments/task-5.md` (new; this task's results only)
**Done when:** Tests first, then green: descendants come depth-first with each parent's children sorted by `orderIndex`, folders and resources interleaved as the tree does (compared in a test with the order `buildResourceTree.ts` produces for the same data); the children source keeps today's folders-first order; documents only in the descendants and smart-folder sources; a smart-folder id list is returned in tree order and an id missing from the project is reported, not dropped silently; the module imports no React, Redux or `@dnd-kit`; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-3, FR-5 (tree order); OQ-5 (the default keeps folders first, flattened uses tree order).
**Done:** [ ]

### Task 6: Pure axis model: offered fields and axis values
**What:** Add a pure module that returns the fields a Rows or Columns picker offers for the cards' kind and the ordered value list of an axis field.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/organizerAxisFields.ts` (new), `frontend/tests/organizerAxisFields.test.ts` (new), `specs/features/organizer-grid/experiments/task-6.md` (new; this task's results only)
**Done when:** Tests first, then green: select, multiselect, status, subtype, resource-reference and multi-reference fields are offered and text, number, date, boolean and deprecated fields are not; folder fields (`getFieldsOfferedOnFolder`, no `notes`) are offered in the direct-children source only; values follow the field's list order (`options`, `config.statuses`, `config.subtypes`); a reference axis lists the values present among the cards grouped by id with the saved name and routes `{ id: null, name }` to Other values (not a drop target); the same field cannot be picked for both axes; a field with no values returns only the None and Other lines; no React, Redux or `@dnd-kit` import; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-4 (OQ-10, OQ-16). Reuses `isFieldVisibleForSubtype`, `getFieldsOfferedOnFolder`, `isFieldDeprecated`; read their source before use.
**Done:** [ ]

### Task 7: Pure grid model: placement, None, Other values, duplicates, cap, phone groups
**What:** Add the pure `organizerGridModel.ts` that places cards into cells and rows and builds the phone grouping from cards, field values and axis value lists.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/organizerGridModel.ts` (new), `frontend/tests/organizerGridModel.test.ts` (new), `specs/features/organizer-grid/experiments/task-7.md` (new; this task's results only)
**Done when:** Tests first, then green, one test each for: every axis type; None (always present, last, even when empty); Other values (before None, marked in text); a card with several values in each matching cell in tree order with later appearances marked as the same document (`also in N other cells`); an empty grid; the cap (N counts cards, not appearances, cards past it follow tree order and the result reports N not shown); rows none with columns order returning one sequence; the phone grouping (one group per row value with empty groups, None and Other included, a per-card column label naming the value or values); no React, Redux or `@dnd-kit` import; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-2, FR-5, FR-10, FR-12 (model side). Takes the axis value lists as input (Task 6 produces them) and a cap number as a parameter, so it needs neither Task 6 nor Task 17.
**Done:** [ ]

### Task 8: Pure drop model: field drop to write payload and refusals
**What:** Add a pure module that turns a drag from one cell to another into one field-write payload or a refusal with its reason.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/organizerDropModel.ts` (new), `frontend/tests/organizerDropModel.test.ts` (new), `specs/features/organizer-grid/experiments/task-8.md` (new; this task's results only)
**Done when:** Tests first, then green: a drop across both axes yields one payload with both fields; a drop on None clears (status removes the key, subtype uses clear); a multiselect drop from a cell moves only the dragged-from value, from a cell onto None removes only that value and clears the key when none remain, from None adds, onto a cell already held is a no-op, and written values keep the field's list order; a reference drop writes `{ id, name }` and refuses past `maxSelections`; refusals with text reasons for a value not in the list, Other values as a target, a field out of subtype scope (`isFieldVisibleForSubtype`), a locked field the sidebar does not let a writer edit, and a subtype not in `config.subtypes` (`isLabelInList`, `normalizeSubtypeLabel`); a drop on the same cell writes nothing; no React, Redux or `@dnd-kit` import; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-7, FR-8 (OQ-6, OQ-7, OQ-19). The payload type is Task 2's.
**Done:** [ ]

### Task 9: Pure order-drop model: reorder within one folder
**What:** Add a pure module that maps a drop in an order-column layout onto the full unfiltered sibling order or a refusal.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/organizerOrderDrop.ts` (new), `frontend/tests/organizerOrderDrop.test.ts` (new), `specs/features/organizer-grid/experiments/task-9.md` (new; this task's results only)
**Done when:** Tests first, then green: with rows a field and columns order, a drop inside a row band maps onto the full unfiltered sibling order of one folder exactly as `useOrganizerCardReorder` expects (a test against that hook's input shape); a drop into another row writes nothing and returns the use-a-field-drag message; a drop that would put a card among another folder's cards returns the do-it-in-the-tree message; reorder is refused with a reason for the flattened and smart-folder sources and with `Clear filters to reorder cards` while a filter is active; no React, Redux or `@dnd-kit` import; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-9 (OQ-15). Reads `useOrganizerCardReorder.ts` for the input shape; edits nothing else.
**Done:** [ ]

### Task 10: Field-write core: set named userMetadata keys and subtype in one sidecar write
**What:** Replace the stub with a core that sets named `userMetadata` keys and `resourceSubtype` for one resource inside `mutateSidecar`, one write for many fields, re-validating values with the sidebar's rules.
**Files:** `frontend/src/lib/models/organizer-field-write-core.ts`, `frontend/tests/unit/organizer-field-write-core.test.ts` (new), `specs/features/organizer-grid/experiments/task-10.md` (new; this task's results only)
**Done when:** Tests first, then green: two fields in one call are both in the stored sidecar after one write; `userMetadata` keys not named are kept untouched (not replaced wholesale); `resourceSubtype`, `entityKind`, `aliases`, `wordCountGoal`, `orderIndex` and `folderId` are untouched unless named; a named key to clear is removed (status via key removal, subtype via the clear path); a value not valid for its field (not in `options`, a subtype not in `config.subtypes`, `maxSelections` exceeded, a locked field the sidebar does not edit) is refused with a message that echoes no client input; an unknown key and a malformed payload are refused before any lock; a missing sidecar raises `ResourceGoneError`; a locked project rethrows the locked-access error; the arrangement-free import graph test passes; Electron and CLI typecheck recorded.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-7, FR-13 (OQ-6, OQ-19). Validates before the lock; takes `projectId` and no path (`docs/standards/storage-context.md`, `security.md`). The Electron worker constraint applies.
**Done:** [ ]

### Task 11: Folder metadata: explicit clearFieldKeys through core, route, client and native backend
**What:** Add an optional `clearFieldKeys` to the folder metadata update so a folder card's field can be cleared, through the core, the route, the client transport and the native backend.
**Files:** `frontend/src/lib/models/folder-metadata-core.ts`, `frontend/app/api/project/folder-metadata/route.ts`, `frontend/src/lib/api/folder-metadata.ts`, `frontend/src/store/transport/native-folder-metadata-backend.ts`, `frontend/tests/unit/folder-metadata-core.test.ts`, `frontend/tests/unit/folder-metadata-route.test.ts`, `frontend/tests/unit/folder-metadata-transport.test.ts`, `specs/features/organizer-grid/experiments/task-11.md` (new; this task's results only)
**Done when:** Tests first, then green: a `clearFieldKeys` list removes only those keys from a folder's `fieldValues` and keeps the others; an unknown folder is still 404; a key that is not a string, a list over a bound or a duplicate is refused without echoing input; a call without `clearFieldKeys` behaves exactly as before (every existing test passes unchanged); the HTTP and native paths accept the same field with a parity test; Electron and CLI typecheck recorded.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-7 (OQ-6, folder cards). Edits no web-stub file: the stub is unchanged. The Electron worker constraint applies.
**Done:** [ ]

### Task 12: Field-write route
**What:** Add the route that exposes the field-write core under the storage context.
**Files:** `frontend/app/api/project/organizer-field/route.ts` (new), `frontend/tests/unit/organizer-field-write-route.test.ts` (new), `specs/features/organizer-grid/experiments/task-12.md` (new; this task's results only)
**Done when:** Tests first, then green: the route runs inside `withStorageContext`, validates the body and returns the core's result; a gone resource returns 404; a locked project returns the locked response; a malformed body is 400 without echoing input; the route calls no `checkLimit` (as the sidecar route does not) and a test asserts that; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-7, FR-13. Compiles against Task 2's stub signature, so it does not wait for Task 10; its test uses a fake core.
**Done:** [ ]

### Task 13: Field-write client transport
**What:** Add the client transport that calls the field-write route through `createTransport`.
**Files:** `frontend/src/lib/api/organizer-field-write.ts` (new), `frontend/tests/unit/organizer-field-write-transport.test.ts` (new), `specs/features/organizer-grid/experiments/task-13.md` (new; this task's results only)
**Done when:** Tests first, then green: the transport sends the payload and parses the response with a schema, maps a 404 to the gone result and a locked response to the locked error, and a network failure to a failed result that is never an empty or done result; it contains no hard-coded path outside the route constant; the `NEXT_PUBLIC_GETWRITE_RUNTIME` comparison is the raw one; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-7, FR-13, FR-1(f) (inlining, checked in Task 41).
**Done:** [ ]

### Task 14: Field-write native backend with web stub
**What:** Add the native backend for the field-write operation, its `.web-stub.ts` alias and the `next.config.mjs` alias entry.
**Files:** `frontend/src/store/transport/native-organizer-field-write-backend.ts` (new), `frontend/src/store/transport/native-organizer-field-write-backend.web-stub.ts` (new), `frontend/next.config.mjs`, `frontend/tests/unit/native-organizer-field-write-backend.test.ts` (new), `specs/features/organizer-grid/experiments/task-14.md` (new; this task's results only)
**Done when:** Tests first, then green: the native backend (through `createNativeRunner`) returns the same results as the route for a set, a clear, a gone resource and a refusal (parity test); an encrypted-marked project is refused as the existing native backends refuse; the web build resolves to the stub (an alias test like `native-folder-metadata-backend-web-exclusion.test.ts`); typecheck and lint pass; the Electron worker constraint is recorded.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-7, FR-13. `next.config.mjs` is edited by this task and then by Task 28 only, so Task 28 depends on this one. Device behaviour is unmeasured until Task 42.
**Done:** [ ]

### Task 15: Smart-folder source hook
**What:** Add a hook that evaluates a smart-folder source into the grid's own local state with loading, failed, deleted and ready states.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/useOrganizerSmartFolderCards.ts` (new), `frontend/tests/useOrganizerSmartFolderCards.test.tsx` (new), `specs/features/organizer-grid/experiments/task-15.md` (new; this task's results only)
**Done when:** Tests first, then green: the hook calls the query transport directly and a test asserts `activeQueryIds`, `activeQueryDefinition` and the shell's active smart folder are unchanged; loading says loading; a failed evaluation yields a failed state with the message and a retry that re-evaluates, never an empty list; deleted is reported only after the saved-query list has loaded and the id is absent (a still-loading list is never deleted); it re-evaluates after a call to its refresh function and when the saved-query list changes; the returned ids feed `organizerSource.ts` (Task 5) in tree order through the hook's output type; typecheck and lint pass.
**Depends on:** 2, 3
**Estimate:** 5
**Notes:** Satisfies FR-3, FR-9 (smart folder leaves), FR-15 (loading never unavailable); OQ-14. The probe findings of Task 3 decide the call used. Reads `query-transport-service.ts` and `querySlice.ts`.
**Done:** [ ]

### Task 16: Shown-card data hook: excerpts and folder sidecars for shown cards only
**What:** Add a hook that requests text excerpts and folder sidecars only for the cards that are shown after the cap and the filters.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/useOrganizerShownCardData.ts` (new), `frontend/tests/useOrganizerShownCardData.test.tsx` (new), `specs/features/organizer-grid/experiments/task-16.md` (new; this task's results only)
**Done when:** Tests first, then green: with 600 cards and a cap of 100 the excerpt request names only the shown text ids and the folder-sidecar reads only the shown folder cards; changing a filter re-requests for the new shown set; a failed excerpt read or folder-sidecar read is returned as a failure state, never as an empty body or a hidden card; folder reads exist only when folder cards are in the source (children source); it reuses `fetchResourceExcerpts` (`frontend/src/lib/api/resource-excerpts.ts`) and `useFolderRowMetadata` (`frontend/src/hooks/useFolderRowMetadata.ts`) without editing them; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-12 (OQ-18). Read both reused modules before use.
**Done:** [ ]

### Task 17: Card cap constant module
**What:** Add a named constant module for the card cap that holds no figure until the owner sets one from the measurement record.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/organizerGridCap.ts` (new), `frontend/tests/organizerGridCap.test.ts` (new), `specs/features/organizer-grid/experiments/task-17.md` (new; this task's results only)
**Done when:** Tests first, then green: `ORGANIZER_GRID_CARD_CAP` is `null` or a positive integer, null meaning no figure has been set and every card shown with no cap message; a helper applies it to a count; a comment beside the constant says the figure comes only from `experiments/task-42.md` and states no number; no figure appears in the code or tests (a grep recorded in the results).
**Depends on:** none
**Estimate:** 1
**Notes:** Satisfies FR-12 (the constant exists, the figure does not). Task 42 sets the figure in this file; Task 44 verifies it is set and cites the record.
**Done:** [ ]

### Task 18: Toolbar: Rows and Columns pickers and source select
**What:** Add the toolbar component with the Rows picker, the Columns picker and the source select.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerGridToolbar.tsx` (new), `frontend/tests/organizerGridToolbar.test.tsx` (new), `specs/features/organizer-grid/experiments/task-18.md` (new; this task's results only)
**Done when:** Tests first, then green: the Rows picker offers none and the passed fields, the Columns picker offers order and the passed fields; the field chosen for one axis is not offered for the other; the source select offers "This folder", "This folder and subfolders" and each passed smart folder; every control has an accessible name, is operable by keyboard and carries no colour-only state; the component fits at 360px width (class assertions, not a layout claim); typecheck and lint pass.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-2, FR-3, FR-19 (first-wave controls). Props-driven so it needs only Task 2's types. Read `OrganizerFilterBar.tsx` for the existing control conventions before writing.
**Done:** [ ]

### Task 19: Grid matrix component with ARIA grid and roving tabindex
**What:** Add the matrix component that renders the cells, headings, cards and empty cells as an ARIA grid with roving tabindex and droppable cells.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerGrid.tsx` (new), `frontend/components/WorkArea/Views/OrganizerView/OrganizerGridCell.tsx` (new), `frontend/tests/organizerGrid.test.tsx` (new), `specs/features/organizer-grid/experiments/task-19.md` (new; this task's results only)
**Done when:** Tests first, then green: `role="grid"` with row, `columnheader`, `rowheader` and `gridcell` roles and headings naming each value in text; one tab stop with roving tabindex, arrow keys move between cells including empty ones, Enter opens the focused card; a duplicate card shows its `also in N other cells` text; None and Other values lines render; empty cells are droppable cells; the existing `OrganizerCard` is used with its body, open and select behaviour unchanged and its existing tests pass; typecheck and lint pass.
**Depends on:** 2, 7
**Estimate:** 5
**Notes:** Satisfies FR-5, FR-11 (structure and arrows). The drag handle's Space lift and the coordinate getter are Task 20; this component only exposes the sortable and droppable ids that task consumes. The component takes the Task 7 model output as props. Read `OrganizerCard.tsx` and its stories before using a prop.
**Done:** [ ]

### Task 20: Drag hook: sensors, coordinate getter, announcements and drop routing
**What:** Add the hook that sets up the pointer and keyboard sensors, the custom cell coordinate getter, the announcements and the drop routing to the field and order paths.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/useOrganizerGridDrag.ts` (new), `frontend/tests/useOrganizerGridDrag.test.tsx` (new), `specs/features/organizer-grid/experiments/task-20.md` (new; this task's results only)
**Done when:** Tests first, then green: pointer drag keeps the existing distance-8 sensor; the keyboard sensor lifts from the drag-handle button with Space, arrow keys move between cells using the coordinate getter recorded in Task 3, Escape cancels inside dnd-kit and a drop applies; announcements name the pick-up, the target cell by its row and column names, the drop or cancel and every refusal; a field drop is passed to an injected `onFieldDrop` with the payload of `organizerDropModel.ts`, an order drop to an injected `onOrderDrop`, and a refusal goes to an injected `onRefuse` with its text; focus returns to the moved card after a drop or a refusal; typecheck and lint pass.
**Depends on:** 3, 8, 9
**Estimate:** 8
**Notes:** Satisfies FR-9, FR-11 (OQ-9). The largest first-wave task: if Task 3 shows the custom getter needs more than one concern, the implementor splits the announcements into a second file within this task, not a new task. Callbacks are injected, so the write path (Task 22) is not a dependency.
**Done:** [ ]

### Task 21: Phone grouped lists component
**What:** Add the phone layout that renders the grid model's groups as grouped lists with per-card column labels and no `role="grid"`.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerPhoneGroups.tsx` (new), `frontend/tests/organizerPhoneGroups.test.tsx` (new), `specs/features/organizer-grid/experiments/task-21.md` (new; this task's results only)
**Done when:** Tests first, then green: one group per row value with empty groups, None and Other values shown; every card of the model appears (a count assertion, no card hidden); each card shows a label naming its column value or values in text; a card in several groups is marked as the same document; there is no `role="grid"` in the output; with rows none a single list renders as today; every control is a button or link operable by touch with a 44px minimum hit class as the other phone controls use; typecheck and lint pass.
**Depends on:** 7
**Estimate:** 3
**Notes:** Satisfies FR-10 (OQ-1). The width switch (`useViewportTier` phone) is in Task 23. The first-paint flash caveat is recorded in Tasks 39 and 42, not claimed absent here.
**Done:** [ ]

### Task 22: Field drop hook: non-optimistic write, live region and gone handling
**What:** Add the hook that performs a field drop through the field-write transport or the folder metadata transport without moving the card until success and reports the outcome.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/useOrganizerFieldDrop.ts` (new), `frontend/tests/useOrganizerFieldDrop.test.tsx` (new), `specs/features/organizer-grid/experiments/task-22.md` (new; this task's results only)
**Done when:** Tests first, then green: a resource drop makes one transport call with all changed fields and the card stays in its old cell until it resolves; a folder card drop uses the folder transport with `clearFieldKeys` for a clear; success updates Redux and writes a live-region message naming the new cell; failure writes the failure text in the live region and a toast and leaves the card in its old cell; a gone result says the document is gone and triggers a re-read; a refusal from the model writes its reason and no call; the hook adds no writing-log entry or revision call; typecheck and lint pass.
**Depends on:** 8, 11, 13
**Estimate:** 5
**Notes:** Satisfies FR-7, FR-13 (OQ-6, OQ-19). Reads `SubtypeSection.tsx` for the toast text convention ("Couldn't save the subtype" precedent) and uses its own wording.
**Done:** [ ]

### Task 23: Wire the grid into the Organizer: default branch and grid branch
**What:** Edit `OrganizerView.tsx` so the default arrangement stays today's wrapping list and the grid is a second branch fed by the pure models, hooks and components, with filters, the cap message and the phone switch.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`, `frontend/tests/organizerView.test.tsx`, `frontend/tests/organizerFolderCards.test.tsx`, `specs/features/organizer-grid/experiments/task-23.md` (new; this task's results only)
**Done when:** Tests first, then green: with Rows none, Columns order and the children source the rendered output and the existing tests in `tests/organizerView.test.tsx`, `organizerFolderCards.test.tsx`, `organizerCard.test.tsx` and the a11y tests pass unchanged; choosing a Rows field renders the grid (wide) or the phone groups (below 768px through `useViewportTier`); the three sources work with live "This folder" following the browsed folder; the filters hide cards from every cell, reset on folder navigation and show a no-card-matches-the-filters message distinct from an empty source; a failed or deleted source shows its message with no fallback to another source; the cap message reads `N not shown` in text with how to reach them when a number is set (tested with an injected cap); the component file stays smaller than the components it composes (the diff in lines is recorded); typecheck and lint pass.
**Depends on:** 5, 6, 7, 15, 16, 17, 18, 19, 20, 21, 22
**Estimate:** 5
**Notes:** Satisfies FR-2, FR-3, FR-6, FR-9, FR-10, FR-12 (wiring). AppShell is not edited: it renders `<OrganizerView />` with no props. Only the two named existing test files may be extended, never made weaker. `OrganizerView.tsx` is edited by this task and Task 36 only.
**Done:** [ ]

### Task 24: Config key plumbing: organizerArrangements through schema, types, normalizer, slice and selector
**What:** Declare `config.organizerArrangements` in every place a config key is copied by name and add a selector over it.
**Files:** `frontend/src/lib/models/types.ts`, `frontend/src/lib/models/schemas.ts`, `frontend/src/lib/models/project.ts`, `frontend/src/store/projectsSlice.ts`, `frontend/src/lib/api/schemas.ts`, `frontend/tests/unit/organizer-arrangements-config.test.ts` (new), `specs/features/organizer-grid/experiments/task-24.md` (new; this task's results only)
**Done when:** Tests first, then green, one assertion per path: a list of arrangements survives a `ProjectConfigSchema` parse, `normalizeProjectConfig`, `buildStoredProject`, the Redux copy and a reopen of the project; a project with no key has no key after each path; `selectActiveProjectOrganizerArrangements` returns the list or an empty list for none; the API schema accepts the key; every existing project, config and slice test passes unchanged; Electron and CLI typecheck recorded.
**Depends on:** 1, 2
**Estimate:** 3
**Notes:** Satisfies FR-14 (FR-1(g) test). Task 1's record of the pre-change behaviour is the comparison. Hot files `types.ts`, `schemas.ts`, `lib/api/schemas.ts`, `project.ts`, `projectsSlice.ts`: Task 24, then Task 33 for `schemas.ts` and `lib/api/schemas.ts` only. The Electron worker constraint applies.
**Done:** [ ]

### Task 25: Arrangements core: add, rename and delete with validation
**What:** Replace the stub with the core for per-arrangement add, rename and delete, each a read-modify-write inside `updateProjectJson`.
**Files:** `frontend/src/lib/models/organizer-arrangements-core.ts`, `frontend/tests/unit/organizer-arrangements-core.test.ts` (new), `frontend/tests/unit/organizer-arrangements-import-graph.test.ts` (new), `specs/features/organizer-grid/experiments/task-25.md` (new; this task's results only)
**Done when:** Tests first, then green: add stores `{ id (UUID), name, source, rows, columns }` and returns the new id; the name is trimmed, 1 to 100 characters, refused when blank, over length or equal to another's after trim and case-fold; the 51st arrangement is refused and nothing is truncated; an unknown key, a malformed source or axis and a non-UUID id are refused before any lock without echoing input; rename and delete of an unknown id are refused; every operation re-reads inside `withMetaLock` plus `updateProjectJson` so two interleaved calls both persist (no lost update); only the one config key is touched; a locked project rethrows the locked-access error; the import-graph test shows no React, JSX, JSON or `node:*` outside the storage adapter; Electron and CLI typecheck recorded.
**Depends on:** 2, 24
**Estimate:** 5
**Notes:** Satisfies FR-14, FR-20 (OQ-2, OQ-3). Precedents `saved-query-dispatch-core.ts`, `metadata-schema-dispatch-core.ts`, `saved-defaults-core.ts`. An arrangement whose source or field no longer exists is stored as written (availability is read-side, Task 29), never rewritten.
**Done:** [ ]

### Task 26: Arrangements dispatch route
**What:** Add the single dispatch route for arrangement add, rename and delete.
**Files:** `frontend/app/api/project/organizer-arrangements/route.ts` (new), `frontend/tests/unit/organizer-arrangements-route.test.ts` (new), `specs/features/organizer-grid/experiments/task-26.md` (new; this task's results only)
**Done when:** Tests first, then green: the route runs in `withStorageContext`, dispatches the three operations to the core, returns 400 for a malformed body without echoing input and the locked response for a locked project; it calls no `checkLimit` and a test asserts that; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-14. Compiles against Task 2's stub; its test uses a fake core.
**Done:** [ ]

### Task 27: Arrangements client transport
**What:** Add the client transport for the arrangement operations through `createTransport`.
**Files:** `frontend/src/lib/api/organizer-arrangements.ts` (new), `frontend/tests/unit/organizer-arrangements-transport.test.ts` (new), `specs/features/organizer-grid/experiments/task-27.md` (new; this task's results only)
**Done when:** Tests first, then green: each operation sends its payload and parses its result with a schema; a refusal returns its message text; a failed request returns a failed result that is never an empty or successful list; the runtime comparison is the raw one; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-14, FR-1(f).
**Done:** [ ]

### Task 28: Arrangements native backend with web stub
**What:** Add the native backend for the arrangement operations, its web stub and the `next.config.mjs` alias.
**Files:** `frontend/src/store/transport/native-organizer-arrangements-backend.ts` (new), `frontend/src/store/transport/native-organizer-arrangements-backend.web-stub.ts` (new), `frontend/next.config.mjs`, `frontend/tests/unit/native-organizer-arrangements-backend.test.ts` (new), `specs/features/organizer-grid/experiments/task-28.md` (new; this task's results only)
**Done when:** Tests first, then green: the native backend returns the same results as the route for add, rename, delete and a refusal (parity test); an encrypted-marked project is refused as the existing native backends refuse; the web build resolves to the stub (alias test); typecheck and lint pass; the Electron worker constraint is recorded.
**Depends on:** 2, 14
**Estimate:** 3
**Notes:** Satisfies FR-14. Depends on Task 14 only because both edit `next.config.mjs`.
**Done:** [ ]

### Task 29: Pure availability model for saved arrangements
**What:** Add a pure function that decides whether a saved arrangement is available and, if not, why, only after the folders, saved queries and metadata schema have loaded.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/organizerArrangementAvailability.ts` (new), `frontend/tests/organizerArrangementAvailability.test.ts` (new), `specs/features/organizer-grid/experiments/task-29.md` (new; this task's results only)
**Done when:** Tests first, then green: a missing folder, a missing query, a missing field and a field whose type is no longer an axis type each return a distinct reason in text; while any of folders, queries or schema is still loading the result is `pending`, never unavailable; an available arrangement returns available; the function never returns a changed arrangement (inputs are not mutated); no React, Redux or `@dnd-kit` import; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-15 (OQ-2, OQ-14).
**Done:** [ ]

### Task 30: Last-used arrangement preference
**What:** Add the per-device `localStorage` preference for the last-used arrangement id.
**Files:** `frontend/src/lib/organizer-arrangement-preference.ts` (new), `frontend/tests/unit/organizer-arrangement-preference.test.ts` (new), `specs/features/organizer-grid/experiments/task-30.md` (new; this task's results only)
**Done when:** Tests first, then green: the key is `getwrite-organizer-arrangement:<projectDirId>` and the value the arrangement id, absent meaning the default; a malformed value reads as absent; a read never writes; a storage failure on read or write never throws; two project ids do not share a value; typecheck and lint pass.
**Depends on:** none
**Estimate:** 2
**Notes:** Satisfies FR-16 (OQ-4). Follows `frontend/src/lib/capture-preferences.ts` and `tests/unit/capture-preferences.test.ts`; read both first.
**Done:** [ ]

### Task 31: Arrangement controls component
**What:** Add the toolbar controls to save, apply, rename and delete arrangements, showing the applied name, unavailable ones and errors.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerArrangementControls.tsx` (new), `frontend/tests/organizerArrangementControls.test.tsx` (new), `frontend/tests/a11y/organizerArrangementControls.a11y.test.tsx` (new), `specs/features/organizer-grid/experiments/task-31.md` (new; this task's results only)
**Done when:** Tests first, then green: applying a saved arrangement is one action; the toolbar shows the applied name or `Default` and whether the grid has changed since; an unavailable arrangement shows its reason in text, is not applicable and stays renameable and deletable; a failed save, rename or delete shows its message and leaves the shown list as it was; a blank, too long or duplicate name shows its message; controls have accessible names, are keyboard operable and fit 360px; the axe test passes; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-14, FR-15, FR-19. Props-driven, takes Task 29's availability result type as a prop type from Task 2.
**Done:** [ ]

### Task 32: Arrangements hook: list, operations, apply, dirty state and remembered fallback
**What:** Add the hook that holds the arrangement list, calls the operations, applies an arrangement and falls back to the default with a message.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/useOrganizerArrangements.ts` (new), `frontend/tests/useOrganizerArrangements.test.tsx` (new), `specs/features/organizer-grid/experiments/task-32.md` (new; this task's results only)
**Done when:** Tests first, then green: the list comes from `selectActiveProjectOrganizerArrangements`; a save, rename or delete calls the transport and the list updates only after success; apply changes only source, rows and columns and leaves the filters; the remembered id is applied on open; a missing, unavailable or unreadable remembered id falls back to the default arrangement with a message and deletes or rewrites nothing; a pending availability result is never treated as unavailable; a changed-since flag is true after the writer edits a picker; typecheck and lint pass.
**Depends on:** 24, 27, 29, 30
**Estimate:** 5
**Notes:** Satisfies FR-14, FR-15, FR-16, FR-19.
**Done:** [ ]

### Task 33: Project type key: arrangements in the strict schema and its validation text
**What:** Add the optional `arrangements` list to `ProjectTypeSchema`, the API schemas and the refusal-text tables, and to `project-type.schema.json` if Task 1 (i) shows it is needed.
**Files:** `frontend/src/lib/models/schemas.ts`, `frontend/src/lib/api/schemas.ts`, `frontend/tests/unit/project-type-validation.test.ts`, `frontend/tests/unit/project-type.test.ts`, `getwrite-config/templates/project-types/project-type.schema.json`, `specs/features/organizer-grid/experiments/task-33.md` (new; this task's results only)
**Done when:** Tests first, then green: a type with a valid `arrangements` list (each naming a folder by slug or name, rows, columns, scope) parses and a malformed list fails with a message that names no client input and is not stored; a type without the key parses as before and every existing project-type test passes; `PROJECT_TYPE_SECTION_LABELS` and `readableProjectTypeIssue` name the key; the JSON schema is changed only if Task 1 (i) recorded a rejection, and the task records which; smart-folder sources are not accepted in the key; Electron and CLI typecheck recorded.
**Depends on:** 1, 2, 24
**Estimate:** 3
**Notes:** Satisfies FR-17 (OQ-12). `schemas.ts` and `lib/api/schemas.ts` are edited after Task 24 by dependency. The Manager editor files are not touched (no Manager UI in this feature). The Electron worker constraint applies.
**Done:** [ ]

### Task 34: Module seam: optional arrangements on ModuleManifestEntry
**What:** Add an optional plain-data `arrangements` field to `ModuleManifestEntry` with a lookup for enabled modules, used by a test fixture only.
**Files:** `frontend/src/lib/models/modules/registry.ts`, `frontend/tests/unit/module-registry.test.ts`, `frontend/tests/unit/core-import-graph.test.ts`, `specs/features/organizer-grid/experiments/task-34.md` (new; this task's results only)
**Done when:** Tests first, then green: a fake manifest with `arrangements` returns them only for modules enabled at the given state (through `moduleDefaultEnabled` and an explicit `config.modules`); a module without the field returns none; no real manifest entry carries the field (an assertion over `MODULE_MANIFEST`); no slot kind is added to `uiRegistry.ts`; `core-import-graph.test.ts` passes with no React, JSX or JSON reachable; every existing registry case passes; Electron and CLI typecheck recorded.
**Depends on:** 2
**Estimate:** 2
**Notes:** Satisfies FR-17 (OQ-11). `registry.ts` is edited by this task only. The Electron worker constraint applies.
**Done:** [ ]

### Task 35: Seed arrangements at project creation
**What:** Copy a type's and an enabled module's arrangements into a new project inside `createProjectFromType`, resolving folder names to ids with a second `project.json` write.
**Files:** `frontend/src/lib/models/project-creator.ts`, `frontend/src/lib/models/project-types-static.ts`, `frontend/tests/unit/project-creator.test.ts`, `frontend/tests/unit/project-type-arrangements-creation.test.ts` (new), `specs/features/organizer-grid/experiments/task-35.md` (new; this task's results only)
**Done when:** Tests first, then green: a type with arrangements creates a project whose `config.organizerArrangements` holds copies with fresh UUIDs and folder ids that exist in the created project, written by a second `project.json` write after the folders; a name that resolves to no folder is left out with the reason recorded and no dangling id is written; a smart-folder source is not seeded; enabled modules' arrangements are added after the type's, a module that is off at creation adds none, and on a duplicate name the type's wins; a type with none creates a project with no key; no code path re-applies a seed to an existing project (a test over an existing project); the native static registry path creates the same result; every existing `project-creator` test passes; Electron and CLI typecheck recorded.
**Depends on:** 25, 33, 34
**Estimate:** 5
**Notes:** Satisfies FR-18 (OQ-11, OQ-12). Uses the validation exported by Task 25 for the seeded values. The Electron worker constraint applies.
**Done:** [ ]

### Task 36: Wire arrangements into the Organizer toolbar
**What:** Edit `OrganizerView.tsx` to mount the arrangement controls and the arrangements hook and apply the applied arrangement's source, rows and columns.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`, `frontend/tests/organizerView.test.tsx`, `specs/features/organizer-grid/experiments/task-36.md` (new; this task's results only)
**Done when:** Tests first, then green: the toolbar shows `Default` for a project with no arrangements and the existing tests pass unchanged; saving the current picks then applying another changes only source, rows and columns and leaves the filters; a remembered arrangement is applied on open and an unavailable one falls back to the default with a message; saving and applying work at 360px (a class assertion); typecheck and lint pass.
**Depends on:** 23, 31, 32
**Estimate:** 3
**Notes:** Satisfies FR-14, FR-15, FR-16, FR-19. `OrganizerView.tsx` is edited by Task 23 and then this task only.
**Done:** [ ]

### Task 37: Storybook stories for the grid, phone groups, toolbar and arrangement controls
**What:** Add stories for the grid states, the phone groups, the toolbar and the arrangement controls.
**Files:** `frontend/stories/WorkArea/OrganizerGrid.stories.tsx` (new), `specs/features/organizer-grid/experiments/task-37.md` (new; this task's results only)
**Done when:** The stories cover: a two-axis grid with None, Other values and a duplicate card, an empty grid, a failed source with retry, a deleted source, a no-match-for-filters state, the `N not shown` message with an injected cap, the phone groups, the toolbar and the arrangement controls with an unavailable arrangement; each story typechecks and lints; the build of Storybook is not run here and is listed as not run; the props of every in-project component used were read from its source and stories first.
**Depends on:** 18, 19, 21, 31
**Estimate:** 3
**Notes:** Satisfies FR-11, FR-19 (stories). Storybook and its a11y addon run only in Task 41 and 44 from the main checkout; a story that typechecks is not reported as a11y-clean.
**Done:** [ ]

### Task 38: Grid a11y and keyboard tests
**What:** Add the axe test and the keyboard tests for the grid and the drag hook.
**Files:** `frontend/tests/a11y/organizerGrid.a11y.test.tsx` (new), `frontend/tests/organizerGridKeyboard.test.tsx` (new), `specs/features/organizer-grid/experiments/task-38.md` (new; this task's results only)
**Done when:** Green: the axe test passes for the grid with None, Other values, a duplicate and an empty cell, and for the phone groups; the keyboard test moves focus between cells with arrows, opens a card with Enter, lifts with Space, moves to another cell, drops, and cancels with Escape, asserting the announcement text at each step and that focus is on the moved card after a drop and after a refusal and that `Esc` and `Cmd/Ctrl+K` handlers still fire; no red and no colour-only state is asserted by class; typecheck and lint pass.
**Depends on:** 19, 20, 21
**Estimate:** 5
**Notes:** Satisfies FR-11. jsdom keyboard tests are not device evidence; the record says so.
**Done:** [ ]

### Task 39: Browser test of the phone layout at 360px and 767px
**What:** Add the Playwright spec that checks the phone grouped layout at 360px and 767px width against the built Storybook.
**Files:** `frontend/e2e/organizer-grid-phone.e2e.spec.ts` (new), `specs/features/organizer-grid/experiments/task-39.md` (new; this task's results only)
**Done when:** The spec asserts at 360px and at 767px that the phone groups render, no `role="grid"` exists, every card of the story's data is reachable and no horizontal page scroll appears, and at 768px that the matrix renders; it also records whether the first paint shows the other layout (a screenshot or assertion at first paint, recorded as observed or not observed); it typechecks and lints; it is not run here (e2e runs outside the sandbox from the main checkout, Task 41 and 44).
**Depends on:** 37
**Estimate:** 3
**Notes:** Satisfies FR-10 (browser test). Not run by the orchestrator: report as not run. The first-paint flash is a caveat of the `useViewportTier` mechanism (OQ-1).
**Done:** [ ]

### Task 40: Pins: default arrangement, drag integration and wiring
**What:** Add integration tests that pin the default arrangement unchanged and the drag path end to end with fakes.
**Files:** `frontend/tests/organizerGridWiring.test.tsx` (new), `specs/features/organizer-grid/experiments/task-40.md` (new; this task's results only)
**Done when:** Green: with no arrangements the Organizer renders the same card sequence as today for a folder with interleaved folders and documents (the order Task 1 recorded for (a)); a drop across two axes makes one write call and the card moves only after it resolves; a failed write leaves the card and shows the live-region text; a drop onto None clears; a drop out of subtype scope is refused with no call; a smart-folder card that stops matching leaves with a toast; a reorder is refused while a filter is active with `Clear filters to reorder cards`; no writing-log or revision call is made; a locked-project path shows no grid; typecheck and lint pass.
**Depends on:** 36
**Estimate:** 5
**Notes:** Satisfies FR-2, FR-7, FR-9, FR-13 (pins). Fakes only: nothing here is device or paired-device evidence.
**Done:** [ ]

### Task 41: LEAD-RUN: build, install and inlining check
**What:** From the main checkout, outside the sandbox, build the native app, run the inlining grep and install the debug build on the Pixel 7 Pro, recording each result.
**Files:** `specs/features/organizer-grid/experiments/task-41.md` (new)
**Done when:** Recorded as observed values with the command, commit and build time: `pnpm build:native` (in `frontend/`) result; the grep of `NEXT_PUBLIC_GETWRITE_RUNTIME` under `frontend/out/_next/static` (0 occurrences or the count seen) for a build containing every new client module; the Gradle debug assemble and install result; the Storybook build and `pnpm test:e2e` including Task 39's spec, each as run or not run; any failure recorded as seen with no cause named.
**Depends on:** 14, 28, 35, 36, 37, 39, 40
**Estimate:** 2
**Notes:** LEAD-RUN, not for the orchestrator: the lead runs it with the owner outside the sandbox from the main checkout (builds fail in worktrees here; `adb` and Gradle can fail inside the sandbox, retry outside before filing a bug). Satisfies FR-1(f), FR-22.
**Done:** [ ]

### Task 42: LEAD-RUN: device and paired-device runs and the card-cap measurement
**What:** With the owner, run the grid on the physical Pixel 7 Pro and a paired device, run the card-cap measurement on the generated fixtures, record every FR-22 item as an observed value and set the card cap from the record.
**Files:** `specs/features/organizer-grid/experiments/task-42.md` (new), `frontend/components/WorkArea/Views/OrganizerView/organizerGridCap.ts`, `frontend/tests/organizerGridCap.test.ts`
**Done when:** Each run records the build (commit and build time), the device, Android version and WebView version (Android) or the pairing and client (paired device), and as observed values: the three sources; Rows and Columns pickers with each axis type; a drag setting one field, one setting two, one onto None and one refused out of subtype scope; a multiselect partial move; the phone grouped lists and whether the first paint shows the other layout; keyboard movement and keyboard drag where a keyboard is attached; a saved arrangement saved, applied, renamed, deleted and shown unavailable; the last-used arrangement after a restart; the seeded arrangements of a project type that carries some. The measurement (FR-1 (e) and (h)) records, for generated projects of 100, 500 and 2000 cards from Task 4 on the desktop two-axis and phone grouped layouts: render time, key-press response, one drag, and the excerpt and folder-sidecar request counts and times, and a separate Pixel 7 Pro figure only if it differs; the owner sets the figure in `organizerGridCap.ts` with the record cited beside it; every path not run is listed under Not verified; an emulator or unit test is not reported as a device run.
**Depends on:** 4, 38, 40, 41
**Estimate:** 8
**Notes:** LEAD-RUN, not for the orchestrator. Satisfies FR-1 (e), (h), FR-12, FR-22. Android and paired-device support MUST NOT be claimed until this is recorded. Record the driving method (by hand or `adb`). The cap is the owner's decision from the record, not a derived figure. No cause is written without an experiment that separated it.
**Done:** [ ]

### Task 43: Documentation updates for the organizer grid
**What:** Apply the documentation changes FR-22 requires, with the scribe stage writing the prose, so that no document states an unmeasured result as fact.
**Files:** `docs/user/handbook/views/organizer.md`, `docs/user/handbook/organize/project-types.md`, `docs/features/modules.md`, `docs/features/project-types.md`, `docs/features/project-configuration.md`, new `docs/features/organizer-grid.md`, `frontend/components/WorkArea/Views/OrganizerView/README.md`, `frontend/CLAUDE.md` (Code Map: each file or seam added by Tasks 2 to 36), `CLAUDE.md` (glossary: Organizer grid, Arrangement, Axis, None row, Other values, Card cap), `specs/features/organizer-grid/experiments/task-43.md` (new; this task's results only); `specs/product/getwrite.features.md` is not edited (status is the lead's)
**Done when:** The handbook states in plain language: choosing rows and columns, the three sources, None and Other values, a card shown in several cells, dragging to set a field and what is refused, the phone lists, keyboard use, `N not shown`, and saving, applying, renaming and deleting arrangements, and that a project type can start new projects with arrangements; the feature docs describe the config key, the field-write operation, the arrangement operations, the folder `clearFieldKeys`, the project-type `arrangements` key, the module hook and the per-device key; the stale `OrganizerView/README.md` is rewritten to describe the component as it is; `frontend/CLAUDE.md` and the glossary list each seam added; no document states the card-cap figure, a device result or a cause that no experiment separated, and device results are said to be recorded in `experiments/task-42.md`.
**Depends on:** 38, 40, 41
**Estimate:** 5
**Notes:** Satisfies FR-22 (documentation; OQ-13 option (a)). Prose is the scribe stage's job; the orchestrator passes it the files and the facts recorded by Tasks 1 to 41. It runs alongside the device run (Task 42), so it states no device, paired-device or card-cap result; Task 44 adds those. Hot files: `docs/`, `frontend/CLAUDE.md`, root `CLAUDE.md`, `android/CLAUDE.md`: Task 43 only, then Task 44 for the device-run results.
**Done:** [ ]

### Task 44: LEAD-RUN: final suites exactly as CI runs them and close-out
**What:** Run every CI command from the places the workflows run them, write the acceptance record with the Not verified list, add the device-run results and the card cap to the docs, and link the per-task results from `experiments.md`.
**Files:** `specs/features/organizer-grid/experiments.md` (Acceptance, Card cap, Not verified and links to `experiments/task-*.md`), `specs/features/organizer-grid/experiments/task-44.md` (new), and the docs Task 43 wrote (device-run results and the cap figure only), plus `android/CLAUDE.md` only if the device run changed it
**Done when:** The CI list is first re-read with `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` and any difference recorded; each command is run from the main checkout outside the sandbox and recorded as run or not run (including root `pnpm run format:check`, frontend `pnpm lint`, `pnpm run check:no-hex`, `pnpm typecheck`, `pnpm test:ci`, `pnpm test:e2e`, builds, `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck`, plus `pnpm knip` with no unused export introduced by this feature); `ORGANIZER_GRID_CARD_CAP` is a positive integer with the record cited beside it; `experiments.md` links or summarises every `experiments/task-<n>.md`; Not verified lists at least: any device or Android version other than the Pixel 7 Pro, an encrypted project on Android, a project above the largest one measured, and any path not run; `git status` shows no `package.json` or lockfile change.
**Depends on:** 42, 43
**Estimate:** 5
**Notes:** LEAD-RUN, not for the orchestrator. Satisfies FR-23. Tasks 1 to 41 are covered transitively through Tasks 42 and 43. Folding the device-run results into the docs is its own step after Task 42 is recorded.
**Done:** [ ]

## Summary
- Total tasks: 44
- Total estimated effort: 173 story points
- Critical path: 2 → 8 → 20 → 23 → 36 → 40 → 41 → 42 → 44
- Risks: Task 3 (the dnd-kit keyboard spike decides the coordinate getter; if it cannot move a card between cells Task 20 and the keyboard claim of FR-11 stop and return to the owner); Task 20 (largest first-wave task, estimate 8); Task 23 (wide fan-in wiring in one hot file); Task 10 (a new write path that must keep the sidebar's refusals); Task 35 (second `project.json` write inside project creation); Tasks 14 and 28 (native backends, device behaviour unmeasured until Task 42); Tasks 42 and 44 (device-only and lead-run; Android and paired-device support and the card cap are not claimed until Task 42 is recorded, and the cap is the owner's decision).
