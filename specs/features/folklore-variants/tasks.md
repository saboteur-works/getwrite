# Tasks: Folklore variants and motifs (Feature 110)

Source spec: `specs/features/folklore-variants.md` (FR-1..FR-25, US-1 to US-5; OQ-1 to OQ-16 resolved by the owner at Gate 3, 2026-11-12, none open and none reopened here). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 110. Depends on the shipped Features 77, 102, 103, 104, 108 and 109. Branch: `feat/folklore-variants`; one PR. The module is "Narratives", id `folklore`, off by default. Measurements: `specs/features/folklore-variants/experiments.md` (an index created by Task 1); each task records its results in `specs/features/folklore-variants/experiments/task-<n>.md`, never directly in `experiments.md`, so tasks running in parallel never edit the same file; Task 31 links them at close-out.

Shape of the work:
- Task 1 is the experiments record (FR-1 a, d, f, g, i); Task 2 pins FR-1 (b) and (c) with tests; Task 3 records FR-1 (e). FR-1 (h) is recorded in the lead-run Task 27. Task 4 is the contract (types, constants, labels, result types); it adds no behaviour and waits for nothing, so models, core, transports, hooks and components proceed as parallel siblings.
- Models and core: 6 (narrative scope), 7 (variant fields and tags), 8 (typed read core), 12 (remembered selection). Route, native backend, client: 9, 10, 11. Renderer: 13. Hooks: 14, 15, 16. Components: 17 (column), 18 (list), 19 (comparison), 20 (tab and host wiring). Pins: 21, 22, 23, 24. Fixture: 25.
- Module declaration (Task 5) waits for Task 1 because FR-1 requires the inventory of `config.modules` readers before any behaviour change is merged.
- Two stated dependencies, kept in order. (1) FR-8's field source (store or fresh read) is decided by FR-1(f): Task 1 records it and Task 15 (the list's fields) depends on Task 1. (2) The FR-12 column limit is a constant set from the FR-25 run on long text: Task 19 builds the comparison with `COMPARISON_COLUMN_LIMIT` exported as `null` (meaning "not yet measured": no refusal is committed, nothing is claimed), Task 28 is the lead-run long-text run, and Task 29, the only task that sets the constant, depends on Task 28.
- Tasks 27, 28, 30 and 31 are LEAD-RUN (builds, devices, the long-text run, CI); Task 26 is documentation for the scribe and states no device result and no column limit; Task 31 adds them.

Requirement traceability (every FR-1..FR-25 maps to at least one task; FR-24 is also an inherited rule of every code task):
- FR-1: 1, 2, 3, 27. FR-2: 4, 5. FR-3: 5, 22. FR-4: 4, 6. FR-5: 7, 18, 32. FR-6: 6. FR-7: 14, 20. FR-8: 15, 18, 20. FR-9: 2, 26. FR-10: 2, 7, 18. FR-11: 26. FR-12: 17, 19, 29. FR-13: 8, 9, 10, 11, 16. FR-14: 12, 13, 22. FR-15: 16, 17. FR-16: 8, 16, 17, 20. FR-17: 12, 19. FR-18: 19. FR-19: 7, 18, 20. FR-20: 21. FR-21: 9, 10, 11, 30. FR-22: 17, 18, 19, 20, 23, 24. FR-23: every task (no task adds a text diff, a bundled index, a new record kind, a draft comparison, a map or timeline, cross-narrative comparison, a typed date, prefix matching, a search index step, a project type, a CSV import or a passage mark; a task that needs one stops and returns to the owner). FR-24: every code task. FR-25: 28, 30, 31.

Compact dependency graph (`a -> b` means b depends on a):
- 1 -> 5, 8, 14, 15, 26; 2 -> 26; 3 -> 31; 4 -> 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18; 5 -> 20, 21; 6 -> 14, 15; 7 -> 15, 17, 18, 32; 8 -> 9, 10; 9 -> 11; 10 -> 11; 11 -> 16; 12 -> 19; 13 -> 17; 14 -> 20; 15 -> 20; 16 -> 19; 17 -> 19, 32; 18 -> 20, 32; 19 -> 20, 28, 29; 20 -> 22, 23, 24, 26, 27, 28, 30; 21 -> 31; 22 -> 31; 23 -> 31; 24 -> 31; 25 -> 28; 26 -> 31; 27 -> 28, 30; 28 -> 29; 29 -> 31; 30 -> 31.

Parallel waves the orchestrator may run (LEAD-RUN tasks 27, 28, 30 and 31 are never run by the orchestrator):
- Wave 1: {1, 2, 3, 4, 25}.
- Wave 2: {5, 6, 7, 8, 12, 13}.
- Wave 3: {9, 10, 14, 15, 17, 18}.
- Wave 4: {11, 16, 21}.
- Wave 5: {19}.
- Wave 6: {20}.
- Wave 7: {22, 23, 24, 26, 27}.
- Wave 8: {28, 30}.
- Wave 9: {29}.
- Wave 10: {31}.

Hot files and the only tasks allowed to edit them (file conflicts for wave planning):
- `specs/features/folklore-variants/experiments.md`: Task 1 creates it, Task 31 closes it; every other task writes only its own `experiments/task-<n>.md`.
- `frontend/components/Modules/uiRegistry.ts`: Task 5 (entry with a placeholder view), then Task 20 (host and wiring) by dependency. `frontend/src/lib/models/types.ts` (the `ViewName` union), `frontend/src/lib/models/modules/manifest.ts`, `frontend/tests/unit/module-registry.test.ts`, `frontend/tests/unit/module-ui-registry.test.tsx`, `frontend/tests/work-area-view-gating.test.tsx`, `frontend/tests/moduleSwitchSection.test.tsx`, `frontend/components/Layout/AppShell.tsx`: Task 5 only.
- `frontend/components/Folklore/NarrativesView.tsx`: Task 5 (placeholder), then Task 20. `frontend/components/Folklore/comparisonLimit.ts`: Task 19 (creates it as `null`), then Task 29 (the only task that sets the figure).
- `frontend/next.config.mjs`: Task 10 only.
- `docs/`, `frontend/CLAUDE.md`, root `CLAUDE.md`: Task 26 only, then Task 31 for the device-run and column-limit results.

**Builds and devices:** `next build`, `pnpm build:native`, `pnpm test:e2e`, Storybook build, `cap sync`, Gradle, adb and every real-browser or device run happen only from the main checkout, outside the command sandbox, by the lead with the owner. No orchestrator task runs them; a worktree cannot run `next build` or `build:native`. Tasks that write a story or an e2e spec check only that it typechecks and lints.

**What the orchestrator cannot verify:** the native backend on a device, the paired-device gate against a real paired client, the tab, the comparison and the phone message in a real WebView, the first-paint tier flash, the inlining of new modules (Task 27), the column limit (Task 28) and the whole device run (Task 30). For these the orchestrator verifies only what the task's Done when names (tests with fakes, typecheck, lint) and reports the rest as not run. Unit tests with fakes are never evidence about a device.

**New dependencies:** none expected. A task that finds it needs one stops and returns to the owner; the owner installs it.

**Electron worker constraint:** every task whose Files include anything under `frontend/src/lib/models/`, `frontend/src/lib/core.ts`, `cli/` or `electron/` MUST also run `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`) and `pnpm --filter getwrite-cli typecheck`, and record each as run or not run. A bare frontend `tsc` is not accepted as evidence.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tests first (`docs/standards/testing.md`): add to an existing test file before creating one where the Files list names one; code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions) and `docs/standards/code-documentation.md`. Every catch follows `docs/standards/failure-visibility.md` (a failed read of a folder subtype, a variant, an attachment list or the subtype list never renders as empty, "no text", "no audio" or "no narrative"; the failed and the empty outcomes never share a return value). Boundary rules follow `docs/standards/security.md` (project id, resource id and the stored remembered selection validated, no client-supplied path, no echo of client input). The storage context is established as `docs/standards/storage-context.md` requires. Read a component's source and stories before using any of its props. UI follows `docs/standards/accessibility.md` and `docs/standards/storybook-implementation.md`; no red, no colour alone.
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run `pnpm typecheck` and `pnpm lint` on touched files. A suite not run is reported as not run, never as passing.
- Write no cause that no experiment separated. A statement in the spec marked READ is a reading until its test runs; the device run is the only evidence about device behaviour.
- The comparison is read-only: no task adds a control that writes a variant, a field, a tag, a list or a subtype.
- Each task records its results in its own `specs/features/folklore-variants/experiments/task-<n>.md`.
- Implementors do not commit and do not push; the orchestrator commits.

### Task 1: Experiments record: FR-1 (a), (d), (f), (g), (i)
**What:** Create the experiments index and record FR-1 items (a), (d), (f), (g) and (i) as observed values from reading and throwaway probes.
**Files:** `specs/features/folklore-variants/experiments.md` (new; index with fixed headings Environment, FR-1 inventory, Column limit, Device run, Not verified, Acceptance; edited by this task and by Task 31 only), `specs/features/folklore-variants/experiments/task-1.md` (new; this task's results only)
**Done when:** `experiments.md` exists with the headings above and an environment record (node version, commit, commands); `experiments/task-1.md` records, each as an observed value with the command or test that produced it: (a) every reader of `config.modules` and every production call of `isModuleEnabled`, `useModuleEnabled`, `useModuleViews`, `registry.enabledViews` and `registry.indexSteps`, and whether a third module with `defaultEnabled: false` needs a change in any of them; (d) what a Narrative folder and a Variant Source do after the project's subtype list loses the label and gains another, observed through a probe of the matching logic (`normalizeSubtypeLabel`, `isFieldVisibleForSubtype`); (f) whether `userMetadata` of a resource in the store reflects a sidebar edit without a reload, stated plainly as "store" or "fresh read" for Task 15; (g) whether a Source's canonical revision text and its `content.txt` can differ, and what each of a missing canonical revision, a missing `v-N` file, an unparseable document and a locked project does today in `fetchResourceContent`; (i) whether the shell's fallback for an open view that is switched off works for a third module view. No cause is written as a cause.
**Depends on:** none
**Estimate:** 5
**Notes:** Reads and throwaway probes only; probes live in the scratchpad, no production file is edited. Read `frontend/src/lib/models/modules/registry.ts`, `components/Modules/useEnabledModuleViews.ts`, `components/Modules/uiRegistry.ts`, `src/lib/models/project-loader.ts`, `src/lib/api/resources.ts`, `src/lib/models/resource-crud-core.ts`, `components/WorkArea/useRevisionContent.ts` and the shell's view fallback. FR-1 (b) and (c) are Task 2, (e) is Task 3, (h) is Task 27 (lead-run). Per the repo rule, measurements go to `experiments/task-1.md`, not into `experiments.md` beyond the index.
**POS:** task_8078b99b
**Done:** [x]

### Task 2: FR-1 (b) and (c): option migration and exact-tag query tests
**What:** Pin, as tests with recorded observed values, what the options migration does to a tagged Source and that an exact `in` query finds a variant by its whole option string.
**Files:** `frontend/tests/unit/folklore-option-migration.test.ts` (new), `frontend/tests/unit/folklore-exact-tag-query.test.ts` (new), `specs/features/folklore-variants/experiments/task-2.md` (new; this task's results only)
**Done when:** Tests first, then green, with the stored value after each recorded in `experiments/task-2.md` as observed: (b) `updateFieldOptionsWithMigration` on a Source sidecar tagged with several options of a multiselect, run through a rename (remove plus add with "normalize"), a removal with "clear", a removal with the default "add-to-options" and a removal with "keep", reporting the stored value and whether the tagged variant still shows its tag; (c) `evalIn` finds a Source by the full option string with the separator " | " (for example "ATU 510A | Cinderella"), with a comma and with a double quote in the name, and a code prefix finds nothing; the query builder's value picker (`SelectPickerInput` in `ValuePicker.tsx`) passes the whole option string, as a component test with a comma and a double quote; no `query-evaluator.ts` change is made, and if a test shows one is needed it is recorded and returned to the owner (it changes Feature 111's premise).
**Depends on:** none
**Estimate:** 5
**Notes:** The existing options dialog is the path; no rename control is built (FR-9). Read `frontend/src/lib/models/metadata-schema.ts` (`updateFieldOptionsWithMigration`, `migrateFieldOptionsInSidecars`), `src/lib/models/query-evaluator.ts` and the query builder's `ValuePicker.tsx` before writing tests. Models are touched only by reading, but the new unit tests import them, so run the Electron and CLI typechecks and record each.
**POS:** task_4c8c66ea
**Done:** [x]

### Task 3: FR-1 (e): folder-sidecar read cost
**What:** Record how long it takes to read the folder sidecars of every folder of the largest available project.
**Files:** `specs/features/folklore-variants/experiments/task-3.md` (new; this task's results only)
**Done when:** `experiments/task-3.md` records the number of folders, the command that read them (the `useFolderRowMetadata` path or an equivalent probe through `folder-metadata-core.ts`), the elapsed time, or the single word "not measured" with the reason if no large project exists.
**Depends on:** none
**Estimate:** 2
**Notes:** Read-only; the probe lives in the scratchpad. A figure is stated only if a run produced it; the spec's table does not claim one.
**POS:** task_2b6bbbcd
**Done:** [x]

### Task 4: Contract: folklore types, labels, constants and result types
**What:** Define the inert shared contract for the module: the module id and view label, the two subtype labels, the typed read result, the remembered-selection shape and the comparison limit type.
**Files:** `frontend/src/lib/models/folklore-types.ts` (new), `frontend/tests/unit/folklore-types.test.ts` (new), `frontend/tests/unit/folklore-core-import-graph.test.ts` (new)
**Done when:** `folklore-types.ts` exports `FOLKLORE_MODULE_ID = "folklore"`, `FOLKLORE_VIEW_LABEL = "Narratives"`, `NARRATIVE_SUBTYPE = "Narrative"`, `VARIANT_SUBTYPE = "Variant"`, a typed `VariantTextResult` union (`text`, `none`, `unreadable` with a reason, `locked`), the `FolkloreSelection` type (picked narrative id and chosen variant ids), the `NOT_IN_LIST`, `NOT_SET` and phone-message string constants worded as FR-8, FR-10 and FR-18 state, and imports no React, JSX or JSON; `folklore-core-import-graph.test.ts` asserts that every `frontend/src/lib/models/folklore-*.ts` file imports no React, JSX, JSON or `node:*` module (it covers Tasks 6, 7 and 8's files as they appear); its test passes (id matches `^[a-z][a-z0-9-]{0,63}$`, the phone message equals the FR-18 text) and `pnpm typecheck`, `pnpm lint` and both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** none
**Estimate:** 2
**Notes:** No behaviour here. The limit type is `number | null`; the figure lives in `components/Folklore/comparisonLimit.ts` (Task 19, set by Task 29).
**POS:** task_38c6f9c4
**Done:** [x]

### Task 5: Module declaration, view slot and switch
**What:** Declare the `folklore` module in the manifest and UI registry with a placeholder tab, add its view id to `ViewName`, and pin the switch behaviour. Add the view id to the two module-view branches in `AppShell.tsx` so the registered slot renders (owner decision at Gate 5, 2026-11-13).
**Files:** `frontend/src/lib/models/modules/manifest.ts`, `frontend/src/lib/models/types.ts`, `frontend/components/Modules/uiRegistry.ts`, `frontend/components/Layout/AppShell.tsx`, `frontend/components/Folklore/NarrativesView.tsx` (new; placeholder `<section>` with heading "Narratives", replaced by Task 20), `frontend/tests/unit/module-registry.test.ts`, `frontend/tests/unit/module-ui-registry.test.tsx`, `frontend/tests/work-area-view-gating.test.tsx`, `frontend/tests/moduleSwitchSection.test.tsx`, `frontend/tests/unit/project-type-draft-service.test.ts`, `frontend/tests/unit/project-type-draft-service-hook.test.tsx`, `specs/features/folklore-variants/experiments/task-5.md` (new; this task's results only)
**Done when:** Tests first, then green: `MODULE_MANIFEST` has an entry with id `folklore`, `defaultEnabled: false`, empty `indexSteps` and view label "Narratives"; `UiModuleEntry` has a `view` slot only and no new slot kind; `ViewName` lists the view id and the gating test pins it equal to the manifest's view id; the Modules screen shows a switch labelled "Enable Narratives" that reads off for a project with no entry and writes only its own entry through the existing `PUT /api/project/modules` path; nothing writes an entry automatically; with Sources off and folklore on the view is enabled; with the module on, the Work Area renders the registered placeholder for the folklore view rather than the default 'Work Area' fallback, pinned by a test; the project type draft lists the folklore module with state `not-set` by default, like claims, and the two draft test files' expected module lists include it; the module seeds no subtype, field or list; `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-cli typecheck`, `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 1, 4
**Estimate:** 3
**Notes:** FR-1 requires the inventory (Task 1) before a behaviour change merges, hence the dependency. Task 1 (i) found the switch-off fallback needs no code, but the Work Area's module-view branches in `AppShell.tsx` list view ids literally; the owner added `AppShell.tsx` to this task at Gate 5 (2026-11-13). Only this task edits `AppShell.tsx`; Task 20 replaces the placeholder through the registry only. The existing `core-import-graph.test.ts` covers the model side; Task 6 adds the folklore model files to it. Owner decision at Gate 5 (2026-11-13): the Project Types editor lists Narratives, default not set (Feature 112 needs it).
**POS:** task_86cd066a
**Done:** [x]

### Task 6: Narrative scope: pure function, Narrative-ending walk
**What:** Compute the variants of a narrative as the Sources in its folder and subfolders in tree order, ending at a nested Narrative folder.
**Files:** `frontend/src/lib/models/folklore-narratives.ts` (new), `frontend/tests/unit/folklore-narratives.test.ts` (new)
**Done when:** Tests first, then green, each pinned by its own test: Sources in the folder and its subfolders are returned flattened in tree order (as `organizerSource.ts` builds it, not by reusing `listDescendantsSource`); a nested Narrative folder is its own narrative and ends the parent's scope; a Source belongs to one narrative; text, image and audio resources are not listed; a Source moved out leaves; a Source in Trash is not listed and returns on restore; a Source copied into another narrative is a separate variant; a folder that is its own ancestor in a corrupt record does not walk forever; a failed folder-subtype read is returned as a distinct failed outcome, never as "not a Narrative"; subtype matching uses `normalizeSubtypeLabel`; the file imports no React, Redux or drag-and-drop module (covered by Task 4's import-graph test); both Electron typecheck passes, the CLI typecheck, `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 4
**Estimate:** 5
**Notes:** Read `components/WorkArea/Views/OrganizerView/organizerSource.ts` (`buildChildrenMap`, `walkTree`, `effectiveParentId`) for the style; copy the idea, do not import from a component directory into the model.
**POS:** task_b16c753d
**Done:** [x]

### Task 7: Variant fields and tags: pure selection and marks
**What:** Select the custom fields limited to the Variant subtype in schema order and describe each value as set, not set, or a tag not in the list.
**Files:** `frontend/src/lib/models/folklore-variant-fields.ts` (new), `frontend/tests/unit/folklore-variant-fields.test.ts` (new)
**Done when:** Tests first, then green: only custom fields whose `appliesTo` holds the Variant subtype (matched as `isFieldVisibleForSubtype` matches, and not offered on a folder) are returned, in the order of the metadata schema, under their current labels, with no fixed key and no role mapping; a text field is a detail and a multiselect is tags; a field with no value is "not set"; a stored tag not in the field's current options is kept in the result and marked "not in the list", never removed or normalised; a project with no tag fields yields no empty tag column and no error; a renamed field and a key of the writer's choosing still show; both Electron typecheck passes, the CLI typecheck, `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 4
**Estimate:** 3
**Notes:** Reuse `isFieldVisibleForSubtype` from `frontend/src/lib/models/field-subtype-scope.ts`; do not wording any field as motifs or tale types.
**POS:** task_4b14e32f
**Done:** [x]

### Task 8: Typed variant read core
**What:** Add a core function that reads one variant's canonical-revision text and returns text, none, unreadable with a reason, or locked.
**Files:** `frontend/src/lib/models/folklore-variant-read-core.ts` (new), `frontend/tests/unit/folklore-variant-read-core.test.ts` (new)
**Done when:** Tests first, then green: a variant with a canonical revision returns `text` with the stored document; an empty body returns `none`; a missing canonical revision, a missing `v-N` file and an unparseable document each return `unreadable` with a distinct reason, never `none`; a locked project rethrows the locked-access error and never returns `none`; the read writes no revision, sidecar, log entry or other record (asserted by a write spy); the text is the canonical revision as `useRevisionContent.ts:170-213` treats it, per Task 1 (g); `fetchResourceContent` and `readTextResourceContent` are unchanged and their existing tests still pass; the file imports no React, JSX or JSON and reaches `node:*` only through the storage adapter (covered by Task 4's import-graph test); both Electron typecheck passes, the CLI typecheck, `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 1, 4
**Estimate:** 5
**Notes:** Model it on `claims-list-core.ts` for the locked and per-resource failure behaviour. Boundary: take `projectId` and `resourceId` only, validated, no path.
**POS:** task_aac48042
**Done:** [x]

### Task 9: Variant text route
**What:** Add the API route that returns the typed read for one variant, sitting in the storage context.
**Files:** `frontend/app/api/folklore/variant-text/route.ts` (new), `frontend/tests/unit/folklore-variant-text-route.test.ts` (new)
**Done when:** Tests first, then green: the route runs inside `withStorageContext`, takes `projectId` and `resourceId` and no path, rejects a malformed id, returns each of the four typed results for fake cores, fails closed on a locked project with the existing locked behaviour, never echoes client input, is classified for the paired-device check by the same gate as every other `/api` route (a case added to the existing classification test or asserted by the new test), and adds no paired-device limit switch; a tenant-scoping case shows a hosted read touches only the signed-in tenant's project; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 8
**Estimate:** 3
**Notes:** Follow `frontend/app/api/claims/route.ts` and `tests/unit/claims-route.test.ts`. Whether `sharing-classify-request.test.ts` needs a case is decided by reading it; extend it only if the route is not covered by the generic gate, and record which.
**POS:** task_3e3d5eb9
**Done:** [x]

### Task 10: Variant read native backend and web stub
**What:** Add the native backend that runs the same core through `createNativeRunner`, with its web stub and the config alias.
**Files:** `frontend/src/store/transport/native-folklore-backend.ts` (new), `frontend/src/store/transport/native-folklore-backend.web-stub.ts` (new), `frontend/next.config.mjs`, `frontend/tests/unit/native-folklore-backend.test.ts` (new)
**Done when:** Tests first, then green: the backend runs the Task 8 core through `createNativeRunner` and returns each typed result; a project that carries the encrypted marker is refused as `native-encrypted-project-guard.ts` refuses it for the Claims backend; the web stub is aliased in `next.config.mjs` by the same rule as `native-claims-backend`; `pnpm typecheck` and `pnpm lint` are run; the device behaviour is not claimed.
**Depends on:** 8
**Estimate:** 3
**Notes:** Follow `native-claims-backend.ts` and its stub and test (`tests/unit/native-claims-backend.test.ts`). Only this task edits `next.config.mjs`.
**POS:** task_2962972e
**Done:** [x]

### Task 11: Variant read client and transport
**What:** Add the client function that calls the route (or the native backend) and returns the typed result per variant.
**Files:** `frontend/src/lib/api/folklore.ts` (new), `frontend/tests/unit/folklore-transport.test.ts` (new)
**Done when:** Tests first, then green: the client returns each of the four typed results, maps a thrown fetch or non-ok response to `unreadable` with a reason (never `none`), rethrows the locked-access error, and picks the native backend on the native runtime and the route otherwise, as `claims.ts` does; the shared `fetchResourceContent` is not edited; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 4, 9, 10
**Estimate:** 3
**Notes:** Follow `frontend/src/lib/api/claims.ts` and `tests/unit/claims-transport.test.ts`.
**POS:** task_b11661aa
**Done:** [x]

### Task 12: Remembered selection: per-device preference
**What:** Add the per-device, per-project preference for the picked narrative and chosen variants.
**Files:** `frontend/src/lib/folklore-selection-preference.ts` (new), `frontend/tests/unit/folklore-selection-preference.test.ts` (new)
**Done when:** Tests first, then green, on the pattern of `organizer-arrangement-preference.ts`: one `localStorage` key per project under a new name; only well-formed ids are accepted on read; a read never writes; a storage failure never throws and is distinguishable from "nothing stored"; an id that no longer names a variant of the narrative reads as absent and the result carries the "choice lost" state for the tab to show; nothing is written to `project.json`; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 4
**Estimate:** 2
**Notes:** The owner confirmed at Gate 3 that a per-device preference is not a stored record under FR-14. Write only when the writer changes the selection (the caller's job; asserted in Task 22).
**POS:** task_12ed08a6
**Done:** [x]

### Task 13: Read-only stored-document renderer
**What:** Render a variant's stored TipTap document to plain React nodes with a visible placeholder for any unsupported node.
**Files:** `frontend/components/Folklore/StoredDocumentView.tsx` (new), `frontend/tests/component/StoredDocumentView.test.tsx` (new), `frontend/stories/Folklore/StoredDocumentView.stories.tsx` (new)
**Done when:** Tests first, then green: headings, paragraphs, lists and emphasis render as the structure the renderer supports; text renders as text and never as raw HTML (a test with markup in the text); an unsupported node renders a visible placeholder in text and is never dropped silently; no TipTap editor is created and `getActiveEditor` is unchanged by mounting and unmounting several instances; a story per state is written after reading `components/Sources/AttachmentMedia.tsx` stories for conventions; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 4
**Estimate:** 5
**Notes:** No existing view renders TipTap JSON read-only (the only `useEditor` is in `TipTapEditor.tsx`); read the editor's node and mark names to keep the supported list in step.
**POS:** task_f055fab0
**Done:** [x]

### Task 14: Narrative list hook
**What:** Provide the hook that lists the project's Narrative folders with variant counts, reporting folders not read, a locked project and near-miss subtypes.
**Files:** `frontend/components/Folklore/useNarrativeList.ts` (new), `frontend/tests/hooks/useNarrativeList.test.tsx` (new)
**Done when:** Tests first, then green: each Narrative folder is returned by name with its variant count from Task 6; the subtypes are read per folder as `useFolderRowMetadata` reads them; a folder whose subtype could not be read is returned in a `notRead` list with the narratives that were read still shown and a retry; a locked project raises the locked-access error so the tab can open the unlock prompt, as `useClaimList.ts` does; when no folder carries Narrative but folders with other subtypes exist, the hook returns those subtype names, and a failed read of the subtype list for this line is returned as a failure and not omitted; the hook writes nothing; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 1, 4, 6
**Estimate:** 5
**Notes:** Read `components/Claims/useClaimList.ts` and `components/WorkArea/Views/OrganizerView/useOrganizerSourceData.ts` (`useFolderRowMetadata`) first. Task 3's figure, if recorded, informs a note, not the code.
**POS:** task_ac967780
**Done:** [x]

### Task 15: Variant list hook
**What:** Provide the hook that lists the picked narrative's variants with their Variant-limited fields, marking non-Variant Sources and unreadable variants.
**Files:** `frontend/components/Folklore/useVariantList.ts` (new), `frontend/tests/hooks/useVariantList.test.tsx` (new)
**Done when:** Tests first, then green: every Source in the narrative's scope is returned in tree order with its name and the Task 7 fields under their current schema labels; a Source without the Variant subtype is returned marked "not a Variant: teller, date and place do not apply" and selectable; a variant whose fields could not be read is returned as unreadable with the reason and never as a variant with empty fields; the field source is the one Task 1 (f) recorded, "store" or "fresh read made when the narrative is picked and on retry", and the test names which; the hook writes nothing; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 1, 4, 6, 7
**Estimate:** 5
**Notes:** This is the stated FR-8 dependency on FR-1(f); do not choose the source before reading `experiments/task-1.md`. Read `components/Sources/useSourceList.ts` for how the resources slice is read.
**POS:** task_9378d78c
**Done:** [x]

### Task 16: Variant texts hook
**What:** Provide the hook that reads the chosen variants' text and audio-attachment state through the typed client, never starting reads it will not show.
**Files:** `frontend/components/Folklore/useVariantTexts.ts` (new), `frontend/tests/hooks/useVariantTexts.test.tsx` (new)
**Done when:** Tests first, then green: each chosen variant returns its typed result; failed variants are collected in a `notRead` list while the others still return; a locked project rethrows the locked-access error and never reads as "no text"; for an empty-body variant the attachment list is read and a failed attachment list read is returned as a failure and not as "no audio"; with `enabled: false` no read is started (the phone case); the hook never reads more variants than are passed in; nothing is written; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 4, 11
**Estimate:** 5
**Notes:** Use `listAttachments` from the Sources client for the attachment list; read its source before use. Do not mount `AttachmentMedia` here (mounting starts the byte read).
**POS:** task_0e4c6954
**Done:** [x]

### Task 17: Comparison column
**What:** Build one comparison column: an `<h3>` with the variant's name, its fields above its text, and a focusable scroll body, in each of the text, no text, audio-only and unreadable states.
**Files:** `frontend/components/Folklore/ComparisonColumn.tsx` (new), `frontend/tests/component/ComparisonColumn.test.tsx` (new), `frontend/stories/Folklore/ComparisonColumn.stories.tsx` (new)
**Done when:** Tests first, then green: the column is a `<section aria-labelledby>` with an `<h3>`; fields show above the text with "not set" and "not in the list" in text; the scroll body has `tabindex="0"` and an accessible name; a variant with text shows the text via `StoredDocumentView` and mounts no audio player; an empty body with an audio attachment shows a plain "no text" line, its fields and the player mounted only after the writer asks to play; an empty body with no audio shows the "no text" line and its fields; an unreadable variant shows the reason and not an empty column; a failed attachment list read is shown as a failure; on Android a file over the Feature 104 limit shows the existing visible message; axe passes; a story per state is written after reading `AttachmentMedia.tsx` and its stories; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 4, 7, 13
**Estimate:** 5
**Notes:** The column is presentational and receives its data by props. Read `components/Sources/AttachmentMedia.tsx` (comment at lines 15-21) before using its props.
**POS:** task_5b8fdcdb
**Done:** [x]

### Task 18: Variant list component
**What:** Build the presentational variant list with fields, tags, marks, a select control for comparison and an open action.
**Files:** `frontend/components/Folklore/VariantList.tsx` (new), `frontend/tests/component/VariantList.test.tsx` (new), `frontend/stories/Folklore/VariantList.stories.tsx` (new)
**Done when:** Tests first, then green: the list is a `<ul>` with an accessible name; each row shows the name, every field under its label, "not set" in text, tags with "not in the list" marked in text, the "not a Variant" mark and the unreadable reason; each row has an open action (callback) and a select-for-comparison control; there is no write control for a variant, field, tag or list; it works with no tag fields; operable by keyboard alone; axe passes; a story per state is written; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 4, 7
**Estimate:** 3
**Notes:** States are conveyed by text, not colour; no red.
**POS:** task_3e499ace
**Done:** [x]

### Task 19: Comparison view with limit constant and phone message
**What:** Assemble the comparison: selection, columns, remembered selection, limit refusal and the phone-width message, with the limit constant exported as `null`.
**Files:** `frontend/components/Folklore/ComparisonView.tsx` (new), `frontend/components/Folklore/comparisonLimit.ts` (new; exports `COMPARISON_COLUMN_LIMIT: number | null = null` with a comment that the figure waits for the recorded long-text run), `frontend/tests/component/ComparisonView.test.tsx` (new), `frontend/stories/Folklore/ComparisonView.stories.tsx` (new)
**Done when:** Tests first, then green: two or more chosen variants open in as many columns and not more; each column scrolls on its own and the page is not the only scroller; no difference markup; a selection beyond a limit passed to the component (a test passes a limit of 3) is refused with a message stating the limit and is never silently dropped, while with the exported `null` nothing is refused and no limit is stated anywhere; at `useViewportTier() === "phone"` the exact message "Side-by-side comparison needs a wider screen. You can still open each variant from the list." is shown instead of columns, no text read is started (`enabled: false` into Task 16), and crossing 768 px either way keeps the selection; the tablet tier shows columns; the remembered selection is written only when the writer changes the selection, never on open, scroll or close; a variant lost from the narrative is shown as lost in text; a story per state is written; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 12, 16, 17
**Estimate:** 5
**Notes:** The constant is a figure no run has produced; the file must say so. Task 29 is the only task that sets it. Read `src/lib/hooks/useViewportTier.ts` (starts at `"desktop"` before mount) and test that columns' reads are not started at phone width after mount.
**POS:** task_816c2bb1
**Done:** [x]

### Task 20: Narratives tab: picker, states and host wiring
**What:** Replace the placeholder with the tab: narrative picker, empty state, near-miss line, not-read and locked states, the list and the comparison, wired to open a variant in the editor.
**Files:** `frontend/components/Folklore/NarrativesView.tsx`, `frontend/components/Modules/uiRegistry.ts`, `frontend/tests/component/NarrativesView.test.tsx` (new), `frontend/tests/component/folklore-registry-wiring.test.tsx` (new), `frontend/stories/Folklore/NarrativesView.stories.tsx` (new)
**Done when:** Tests first, then green: the tab is a `<section aria-labelledby>` with an `<h2>`, loading as `role="status"`, failure as `role="alert"` with a retry; the picker lists Narrative folders by name with variant counts; with no Narrative folder the empty state says what a narrative is and writes and offers nothing (no checklist, no set-up action); when folders with other subtypes exist the visible line names them, and a failed subtype-list read is shown as a failure; folders not read are named with a retry while the read narratives stay shown; a locked project opens the unlock prompt as the Claims tab does; the list and the comparison are shown for the picked narrative and the list stays at phone width; the host passes `openInEditor` from the view's props and opening a variant opens it in the editor; the tab lists, compares and opens only; a story per state is written after reading `ClaimsView.tsx`, `SourcesView.tsx` and their stories; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 5, 14, 15, 18, 19
**Estimate:** 5
**Notes:** Model on `ClaimsView.tsx` and `ClaimsViewHost` in `uiRegistry.ts`; the registry-wiring test follows `tests/component/claims-registry-wiring.test.tsx`. This is the first task after Task 5 allowed to edit `uiRegistry.ts`.
**POS:** task_8e2ce340
**Done:** [x]

### Task 21: FR-20 neutrality pins: compile, export, goals, indexes
**What:** Pin that a narrative and its variants change nothing in compile, export, goals or derived indexes, and that the tab adds nothing to either dialog.
**Files:** `frontend/tests/unit/compile-export-folder-notes-excluded.test.ts`, `frontend/tests/unit/folklore-index-neutral.test.ts` (new), `frontend/tests/component/folklore-dialogs-neutral.test.tsx` (new)
**Done when:** Tests first, then green: with a narrative folder and Variant Sources, compile and export output (TXT, Markdown, DOCX and PDF text) is identical to the same project without the subtypes; a new Source still starts out of compile and out of project and daily goals; no variant, narrative or comparison id enters `config.compileDefaults` or `config.exportDefaults`; the compile and export dialogs gain no entry from the module; `rebuildDerivedIndexes` gives the same result with the module on and off; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 5
**Estimate:** 3
**Notes:** No production code is expected to change; a failing pin is a finding returned to the owner, not a fix made here.
**POS:** task_fc830c8f
**Done:** [x]

### Task 22: No-writes, switch-off and Sources-off pins
**What:** Pin that opening, scrolling and closing the comparison writes nothing but the device preference, and that switching the module off keeps data and works without the Sources module.
**Files:** `frontend/tests/component/NarrativesViewNoWrites.test.tsx` (new), `frontend/tests/component/NarrativesViewModuleOff.test.tsx` (new)
**Done when:** Tests first, then green: a spy on every write path (revision, sidecar, writing log, `project.json`, Redux-persisted record, subtype list, metadata schema, `config.modules`) records no call across open, scroll and close, and the only write is the remembered selection when the writer changes it; the module switched off hides only the tab, writes nothing, keeps every narrative, variant, field value and tag as ordinary folders, Sources and fields, and switched on again shows the same narratives and variants; with the tab open at the moment of switching off the shell falls back as Task 1 (i) recorded; with Sources off and folklore on the tab, the list, the comparison and the player work; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 20
**Estimate:** 3
**Notes:** Use the existing Module and Claims fixtures for the shell; a failing pin is returned as a finding.
**POS:** task_ce695585
**Done:** [x]

### Task 23: Accessibility and keyboard tests
**What:** Add axe and keyboard tests for the tab, the list and the comparison.
**Files:** `frontend/tests/component/NarrativesViewA11y.test.tsx` (new)
**Done when:** Tests first, then green: axe passes for the tab with a narrative open, the empty state, the unreadable and locked states and the phone message; the picker, the list, the select controls, the open action and each column's scroll body are reachable and operable by keyboard alone; each column's scroll body is focusable with an accessible name; every state (not set, not in the list, unreadable, no text, not a Variant) is conveyed by text; status messages sit in `role="status"` and failures in `role="alert"`; a screen-reader run is recorded in `experiments/task-23.md` as not verified; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 20
**Estimate:** 3
**Notes:** Follow `docs/standards/accessibility.md` for test conventions and an existing a11y test for the helper.
**POS:** task_01376841
**Done:** [x]

### Task 24: Storybook e2e spec for the tab
**What:** Write the Playwright spec that drives the Narratives stories (the tab, the picker, the comparison and the phone message).
**Files:** `frontend/e2e/narratives-view.e2e.spec.ts` (new)
**Done when:** The spec exists, typechecks and lints, and covers: pick a narrative, open a variant, choose two variants and see two columns, scroll one column and not the other, the phone-width message at a phone viewport (as `organizer-grid-phone.e2e.spec.ts` sets one), and the keyboard path through a column; it is reported as written and not run (the lead runs `pnpm test:e2e` outside the sandbox from the main checkout).
**Depends on:** 20
**Estimate:** 2
**Notes:** Do not run Playwright or Storybook here. Follow `frontend/e2e/organizer-grid-phone.e2e.spec.ts` and `frontend/e2e/sources-view-attachments.spec.ts`.
**POS:** task_92b36c5e
**Done:** [x]

### Task 25: Long-text fixture generator
**What:** Add a script that generates a project with a Narrative folder and Variant Sources of recorded word counts, for the column-limit run.
**Files:** `scripts/folklore-long-text-fixture.mjs` (new), `specs/features/folklore-variants/experiments/task-25.md` (new; this task's results only)
**Done when:** Running the script with a target directory writes a valid project with one Narrative folder, N Variant Sources whose bodies have given word counts (a short telling, a long one and a very long one, chosen by arguments), the three Variant text fields and two tag fields in its metadata schema, the two subtype labels in its subtype list and `config.modules.folklore: true`; the project opens through `loadProjectCore` in a probe; `experiments/task-25.md` records the command, the word counts written and that the generated texts are synthetic (not a writer's); nothing is run in the main store.
**Depends on:** none
**Estimate:** 3
**Notes:** It generates data for Task 28 only; it is not shipped as a feature. Write to the directory given, never to `projects/` unless the lead passes it.
**POS:** task_e770cf5e
**Done:** [x]

### Task 26: Documentation (handbook, feature docs, Code Map, glossary)
**What:** Write the handbook page with the by-hand set-up steps and update the feature docs, the Code Map and the glossary, with no device result and no column limit.
**Files:** `docs/user/handbook/views/narratives.md` (new), `docs/user/handbook/index.md`, `docs/features/modules.md`, `docs/features/sources.md`, `docs/features/folder-metadata.md`, `frontend/CLAUDE.md`, `CLAUDE.md`, `specs/features/folklore-variants/experiments/task-26.md` (new; this task's results only)
**Done when:** The handbook page states in plain language the exact by-hand steps and field settings (switch the module on, add the subtypes "Narrative" and "Variant", add the three text fields and two multiselect fields with `appliesTo` set to Variant, the separator " | ", give a folder and its Sources their subtypes), what the tab shows and does, what happens on rename and removal of a list entry exactly as `experiments/task-2.md` observed, that a tag not in the list is shown and marked, and that the phone width shows a message; it claims no built-in set-up path, no column limit and no Android or paired-device result, and no sentence states an unmeasured result as fact; the two modules docs, the folder-metadata doc, the `frontend/CLAUDE.md` Code Map and the `CLAUDE.md` glossary (Narrative, Variant, Narratives tab, comparison) are updated and the module list names `folklore` as switchable and off by default; the user-guide conventions (no "verified against" lines) are followed.
**Depends on:** 1, 2, 20
**Estimate:** 5
**Notes:** Use the `write-user-guide` skill for the handbook page. Only the scribe edits these files until Task 31 adds the results.
**POS:** task_d53d1a80
**Done:** [x]

### Task 27: LEAD-RUN: build and inlining check, FR-1 (h)
**What:** Record that `NEXT_PUBLIC_GETWRITE_RUNTIME` is inlined in every new client module and that the web and native builds succeed.
**Files:** `specs/features/folklore-variants/experiments/task-27.md` (new; this task's results only)
**Done when:** From the main checkout and outside the sandbox, `experiments/task-27.md` records the commands and results of `next build` and `pnpm build:native`, and the raw comparison with the count of `NEXT_PUBLIC_GETWRITE_RUNTIME` occurrences under `frontend/out/_next/static` (expected 0, as Features 105 and 107 recorded), each as observed or "not run" with the reason.
**Depends on:** 20
**Estimate:** 2
**Notes:** LEAD-RUN: the orchestrator does not run it; builds fail in worktrees here.
**POS:** task_768019d6
**Done:** [ ]

### Task 28: LEAD-RUN: column-limit run on long text
**What:** Run the comparison on long texts on the desktop app and record the lengths, widths, counts tried and what was observed at each.
**Files:** `specs/features/folklore-variants/experiments/task-28.md` (new; this task's results only)
**Done when:** `experiments/task-28.md` states before the run what "usable" means, then records the build (commit and build time), the fixture from Task 25 with the texts' word counts, the window widths (desktop and a tablet-width window), the number of columns tried from two upward and, for each, the observed readable column width, time to show, scrolling and memory if it could be read; it states a candidate limit only as what the run observed, or "not measured" for a cell not run.
**Depends on:** 19, 20, 25, 27
**Estimate:** 3
**Notes:** LEAD-RUN with the owner, outside the sandbox, from the main checkout. This run is a recorded input to Task 29 and to Task 31; it is not a device run.
**POS:** task_2bfa68ab
**Done:** [ ]

### Task 29: Set the comparison column limit
**What:** Set `COMPARISON_COLUMN_LIMIT` to the figure the recorded run supports, with the refusal message stating it.
**Files:** `frontend/components/Folklore/comparisonLimit.ts`, `frontend/tests/component/ComparisonView.test.tsx`
**Done when:** Tests first, then green: the constant holds the figure the owner takes from `experiments/task-28.md` with a comment naming that file; a selection beyond it is refused with a message stating the limit and is never silently dropped, with the default constant and not a test-passed limit; no other file states the figure; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 19, 28
**Estimate:** 1
**Notes:** If the run recorded no usable figure, stop and return to the owner; do not choose one. This is the only task that sets the constant (the stated FR-12 dependency on the FR-25 run).
**POS:** task_4ee0bb32
**Done:** [ ]

### Task 30: LEAD-RUN: device runs (Pixel 7 Pro and paired device)
**What:** Run the feature on the Pixel 7 Pro (portrait and landscape) and on a paired device and record only what was observed.
**Files:** `specs/features/folklore-variants/experiments/task-30.md` (new; this task's results only)
**Done when:** `experiments/task-30.md` records, for each run, the build (commit and build time), the device, the Android and WebView versions or the pairing and client, and as observed values: the module switch on and off; the tab, the narrative picker and the list; opening a variant in the editor; tagging a variant; the comparison or the phone message with the CSS width and viewport tier at portrait and at landscape on the Pixel; an unreadable variant if one could be made; an audio-only variant and its player, with a file over the Android limit; a locked or encrypted project (Android refuses an encrypted-marked project); and a "Not verified" list naming at least any device other than the Pixel 7 Pro, a comparison on a tablet or foldable width on Android unless run, screen-reader use, a large narrative, and every path not run.
**Depends on:** 20, 27
**Estimate:** 5
**Notes:** LEAD-RUN with the owner, outside the sandbox, from the main checkout (`pnpm build:native` and adb run outside it). An emulator, a fake filesystem or a unit test is not a device run and is not reported as one.
**POS:** task_39b020ab
**Done:** [ ]

### Task 31: LEAD-RUN: CI, results into docs, close-out
**What:** Run every CI workflow command, add the device-run and column-limit results to the docs, and link the per-task records in the experiments index.
**Files:** `specs/features/folklore-variants/experiments.md`, `specs/features/folklore-variants/experiments/task-31.md` (new; this task's results only), `docs/user/handbook/views/narratives.md`, `frontend/CLAUDE.md`, `CLAUDE.md`
**Done when:** The CI command list is taken at that time from `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` and each command is reported in `experiments/task-31.md` as run (with the result) or not run, with builds and e2e run outside the sandbox from the main checkout (including `pnpm test:e2e` for Task 24's spec and the Electron and CLI typechecks); `experiments.md` links or summarises `task-1`, `task-2`, `task-3`, `task-5`, `task-23`, `task-25`, `task-26`, `task-27`, `task-28`, `task-30` and the Not verified list; the handbook and the Code Map state the column limit and the Android and paired-device results exactly as `experiments/task-28.md` and `experiments/task-30.md` record, and nothing else; no sentence states an unmeasured result as fact.
**Depends on:** 3, 21, 22, 23, 24, 26, 29, 30
**Estimate:** 3
**Notes:** LEAD-RUN. Only this task edits `experiments.md` after Task 1.
**POS:** task_b680a5ca
**Done:** [ ]

### Task 32: Select fields as a detail
**What:** Include the custom fields limited to the Variant subtype whose type is `select` as details showing the chosen value, with "not set" and unexpected-value handling matching text fields (owner decision at Gate 5, 2026-11-13).
**Files:** `frontend/src/lib/models/folklore-variant-fields.ts`, `frontend/tests/unit/folklore-variant-fields.test.ts`
**Done when:** Tests first, then green, each pinned by its own test: a Variant-limited `select` field is selected in schema order beside text and multiselect fields and described as a detail with its chosen value; an unset value is described as not set; a stored value not in the field's option list is described as an unexpected value, shown and never rewritten, as for a text field; text and multiselect descriptions are unchanged; the file imports no React, Redux or drag-and-drop module; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 7, 17, 18
**Estimate:** 2
**Notes:** `ComparisonColumn.tsx` and `VariantList.tsx` render a detail from its `kind` and `text` and do not switch on field type (checked at HEAD), so neither is listed; if the select value needs a different rendering, stop and return to the owner.
**POS:** task_52c1392d
**Done:** [x]

## Summary
- Total tasks: 32
- Total estimated effort: 114 story points
- Critical path: Tasks 1 → 8 → 9 → 11 → 16 → 19 → 20 → 27 → 28 → 29 → 31
- Risks: Task 15 depends on the FR-1(f) measurement (Task 1) for the field source; Task 29 waits on the lead-run long-text run (Task 28) and stops if no usable figure was recorded; Task 5 also edits `AppShell.tsx`'s module-view branches (owner decision at Gate 5, 2026-11-13); Task 2 may find that the query builder or evaluator needs a change, which goes back to the owner because it changes Feature 111's premise; Task 13 (no existing read-only TipTap renderer) and Task 8 (typed read with a distinct failure per case) are the largest new surfaces; Tasks 27, 28, 30 and 31 are lead-run and depend on devices and an unsandboxed main checkout, and Android and paired-device parity are claimed only for what Task 30 observes.

## Open Questions

None.
