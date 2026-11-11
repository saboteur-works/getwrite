# Tasks: Claim ledger (Feature 108)

Source spec: `specs/features/claim-ledger.md` (FR-1..FR-24, US-1 to US-3; OQ-1 to OQ-15 resolved by the owner at Gate 3, 2026-11-11, "all recommended", none open). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 108. Depends on the shipped Features 101, 102, 103, 90 and 77. Branch: `feat/claim-ledger`; one PR. Measurements: `specs/features/claim-ledger/experiments.md` (an index created by Task 1); each task records its results in `specs/features/claim-ledger/experiments/task-<n>.md`, never directly in `experiments.md`, so tasks running in parallel never edit the same file; Task 31 links them at close-out.

Shape of the work:
- Wave order set by the owner (F108-1): the module default and the project-type module declaration (Tasks 3 to 9, FR-2 to FR-6) are the first wave, with no owner checkpoint after it; the claims (Tasks 10 to 27) follow; Tasks 28 to 31 are the last.
- Task 1 is the experiments record (FR-1 a to g). Task 2 is the contract (types, status constant, inert core stubs, the optional `claim` schema field); it adds no behaviour, so it does not wait for Task 1, and it lets core, route, transport, native backend, UI and tests proceed as parallel siblings.
- Core: Tasks 10 (validators), 11 (add), 12 (update), 13 (list), 14 (carry through paste). Transport: Tasks 15 (route), 16 (client), 17 (native backend). UI: Tasks 18 to 23 (flows, control, display model, claim row, tab, list hook). Wiring at the end: Tasks 24 (panel) and 25 (registry). Tests pinning behaviour: Tasks 26 and 27.
- Tasks 28 (build and inlining check), 29 (device runs) and 31 (final CI and close-out) are LEAD-RUN; Task 30 is documentation for the scribe, written while the lead and owner do the device run (Task 29), so it states no device result; Task 31 adds the device-run results to the docs Task 30 wrote.

Requirement traceability (every FR-1..FR-24 maps to at least one task; FR-23 is also an inherited rule of every code task):
- FR-1: 1, 28. FR-2: 3. FR-3: 4, 5, 25. FR-4: 6, 7. FR-5: 8, 9. FR-6: 5, 20, 21, 24, 25. FR-7: 2, 11. FR-8: 10. FR-9: 2, 10, 12, 20. FR-10: 2, 11, 12, 20. FR-11: 10, 12, 21, 24.
- FR-12: 10, 12, 20, 21. FR-13: 20, 21, 24, 26. FR-14: 18, 19, 25. FR-15: 18, 21, 24. FR-16: 20, 22, 23, 25. FR-17: 13, 22, 23. FR-18: 14, 26. FR-19: 27. FR-20: 27.
- FR-21: 2, 15, 16, 17, 29. FR-22: every task (no task adds citation formatting, folklore, clipper or collaboration; a task that needs one stops and returns to the owner). FR-23: every code task, 27, 31. FR-24: 28, 29, 30, 31.

Compact dependency graph (`a -> b` means b depends on a):
- 1 -> 3, 6; 2 -> 4, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20; 3 -> 4; 3, 4 -> 5; 4, 6 -> 8; 6 -> 7; 8 -> 9; 10 -> 11, 12, 14; 16, 20 -> 23; 20 -> 21, 22; 16, 18, 21 -> 24; 1, 4, 18, 19, 22, 23 -> 25; 11, 12, 14 -> 26; 11, 13 -> 27; 5, 7, 9, 15, 17, 24, 25 -> 28; 26, 27, 28 -> 29; 26, 27, 28 -> 30; 26, 27, 29, 30 -> 31.

Parallel waves the orchestrator may run (LEAD-RUN tasks 28, 29 and 31 are never run by the orchestrator); the first wave of the owner's order (Tasks 3 to 9) runs alongside the contract-first siblings of the second wave wherever dependencies allow, and no owner checkpoint follows it:
- Wave 1: {1, 2}. Wave 2: {3, 6, 10, 13, 15, 16, 17, 18, 19, 20}. Wave 3: {4, 7, 11, 12, 14, 21, 22, 23}. Wave 4: {5, 8, 24, 25, 26, 27}. Wave 5: {9}. Wave 6: {28 (LEAD-RUN)}. Wave 7: {29 (LEAD-RUN), 30}. Wave 8: {31 (LEAD-RUN)}.

Hot files and the only tasks allowed to edit them (file conflicts for wave planning):
- `specs/features/claim-ledger/experiments.md`: Task 1 creates it, Task 31 closes it; every other task writes only its own `experiments/task-<n>.md`.
- `frontend/src/lib/models/types.ts`, `schemas.ts` and `frontend/src/lib/api/schemas.ts`: Task 2, then Task 4 (`types.ts` only) and Task 6 (`schemas.ts`, `lib/api/schemas.ts`), sequential by dependency.
- `frontend/src/lib/models/modules/registry.ts` and `module-registry.test.ts`: Task 3 only. `manifest.ts`: Task 4 only. `ModuleSwitchSection.tsx`, `useModuleEnabled.ts`, `useEnabledModuleViews.ts`: Task 5 only. `uiRegistry.ts`, `CitationControlSlot.tsx`, `AppShell.tsx`: Task 25 only.
- `frontend/src/lib/models/annotation-validation.ts`: Task 10 only. `claims-add-core.ts`: Task 11. `claims-update-core.ts`: Task 12. `claims-list-core.ts`: Task 13. `annotations-core.ts`, `annotation-paste.ts`, `lib/api/annotations.ts`: Task 14 only. Existing `updateAnnotationCore` and `reattachAnnotationCore`: edited by no task.
- `frontend/app/api/claims/route.ts`: Task 15 only. `lib/api/claims.ts`: Task 16 only. `native-claims-backend.ts`, its stub and `frontend/next.config.mjs`: Task 17 only.
- `AnnotationsPanel.tsx`, `useAnnotationsPanel.ts`, `stories/Editor/AnnotationsPanel.stories.tsx`: Task 24 only. `ProjectTypeDraftService.ts`: Task 8; `ProjectTypeEditorForm.tsx` and its test and story: Task 9; `project-creator.ts`: Task 7.
- `docs/`, `frontend/CLAUDE.md`, root `CLAUDE.md`, `android/CLAUDE.md`: Task 30 only, then Task 31 for the device-run results.

**Builds and devices:** `next build`, `pnpm build:native`, `pnpm test:e2e`, `cap sync`, Gradle and every real-browser, emulator or device run happen only from the main checkout, outside the command sandbox, by the lead with the owner. No orchestrator task runs them; a worktree cannot run `next build` or `build:native`. Tasks that write a story check only that it typechecks and lints.

**What the orchestrator cannot verify:** the native backend on a device, the paired-device gate against a real paired client, the Claims tab and control in a real WebView, the inlining of new modules (Task 28), and the whole device run (Task 29). For these the orchestrator verifies only what the task's Done when names (tests with fakes, typecheck, lint) and reports the rest as not run. Unit tests with fakes are never evidence about a device.

**New dependencies:** none expected (FR-23). A task that finds it needs one stops and returns to the owner; the owner installs it.

**Electron worker constraint:** every task whose Files include anything under `frontend/src/lib/models/`, `frontend/src/lib/core.ts`, `cli/` or `electron/` MUST also run `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`) and `pnpm --filter getwrite-cli typecheck`, and record each as run or not run. A bare frontend `tsc` is not accepted as evidence.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tests first (`docs/standards/testing.md`): add to an existing test file before creating one; code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions) and `docs/standards/code-documentation.md`. Every catch follows `docs/standards/failure-visibility.md` (a failed read of annotations, Trash or a Source never renders as no claims, unsourced or verified). Boundary and fail-closed rules follow `docs/standards/security.md` (statement length, status, Source id, locator and module declaration validated, unknown keys refused, no client-supplied path, no echo of client input). The storage context is established as `docs/standards/storage-context.md` requires. Read a component's source and stories before using any of its props. UI follows `docs/standards/accessibility.md` and `docs/standards/storybook-implementation.md`; no red, no colour alone.
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run `pnpm typecheck` and `pnpm lint` on touched files. A suite not run is reported as not run, never as passing.
- Write no cause that no experiment separated. A statement in the spec marked READ is a reading until its test runs; the device run is the only evidence about device behaviour.
- Claims are annotations: no new record kind, store, Trash kind or index; nothing about claims in compile or export; `config.statuses` is never read or written by claims.
- Each task records its results in its own `specs/features/claim-ledger/experiments/task-<n>.md`.
- Implementors do not commit and do not push; the orchestrator commits.
### Task 1: Experiments record: FR-1 inventory (a) to (g)
**What:** Create the experiments index and record the FR-1 items a to g as observed values, from reading and throwaway probes only.
**Files:** `specs/features/claim-ledger/experiments.md` (new; index with fixed headings Environment, FR-1 inventory, Device run, Not verified, Acceptance, each linking per-task files; edited by this task and by Task 31 only), `specs/features/claim-ledger/experiments/task-1.md` (new; this task's results only); reads `frontend/src/lib/models/modules/registry.ts`, `manifest.ts`, `frontend/components/Modules/useModuleEnabled.ts`, `useEnabledModuleViews.ts`, `ModuleSwitchSection.tsx`, `frontend/components/Editor/Citations/CitationControlSlot.tsx`, `frontend/src/lib/models/annotations-core.ts`, `annotation-remap.ts`, `frontend/components/Editor/Extensions/annotation-paste.ts`, `frontend/src/lib/api/annotations.ts`, `frontend/src/lib/models/project-types-static.ts`, `getwrite-config/templates/project-types/project-type.schema.json`; throwaway probes in the scratchpad only
**Done when:** `experiments.md` exists with the headings above and an environment record (node version, commit, commands); `experiments/task-1.md` records, each as an observed value with the command or test that produced it: (a) every production reader of `config.modules` and call of `isModuleEnabled`, `useModuleEnabled`, `useModuleViews`, `registry.enabledViews`, `registry.indexSteps`, each with file:line and whether it assumes absent means on, including the Modules screen and the shell's view gating; (b) whether `registry.ts` can read `MODULE_MANIFEST` or a default from it without an import cycle or a React/JSX/JSON import reachable from `core.ts` (a throwaway probe plus the `core-import-graph` test run), which decides whether Task 3 creates `module-defaults.ts`; (c) a throwaway test that a field added to a stored annotation survives the client response parse, `updateAnnotationCore`, `reattachAnnotationCore`, `remapAnnotationIds`, `annotation-paste.ts` and an older `validateNewAnnotation`, each recorded as survived, dropped or refused; (d) how `resolveProjectTypes`, `project-types-static.ts`, the Manager list and `project-type.schema.json` treat a type with an unknown key; (e) the number of sidecars read and the time to scan every text resource's sidecar on the largest project available, or "not measured"; (f) the `NEXT_PUBLIC_GETWRITE_RUNTIME` raw-comparison convention as READ and the `frontend/out/_next/static` grep recorded as "to be run in Task 28", not claimed; (g) whether `CitationControlSlot` renders the control of every enabled module or only Sources', with file:line. No cause is written as a cause.
**Depends on:** none
**Estimate:** 5
**Notes:** Satisfies FR-1. Per the repo rule in root `CLAUDE.md`, this task writes its measurements to `experiments/task-1.md`, not into `experiments.md` beyond the index; no other task edits `experiments.md` before Task 31. If (g) shows the slot renders only Sources', Task 25 extends it. If (c) shows a field is dropped by a path, record it plainly; Tasks 14 and 15 act on it. A cause is written only where an experiment separated it from the alternatives. No build is run here (builds fail in worktrees).
**Done:** [ ]

### Task 2: Contract: claim types, status constants, inert core stubs, annotation schema field
**What:** Define the types-only contract (the `claim` field, the four status identifiers and labels, add/update/list inputs and results) with inert core stubs and the optional `claim` field in the annotation schemas, so core, route, transport, native and UI tasks proceed as siblings.
**Files:** new `frontend/src/lib/models/claim-types.ts` (types and the status constant only: `unverified`, `verified`, `disputed`, `needs-review`, labels Unverified, Verified, Disputed, Needs review; add, update and list inputs and results; a claim list entry with its resource id, name and read-failure shape; the `onMarkClaim` callback type), new `frontend/src/lib/models/claims-add-core.ts`, `claims-update-core.ts`, `claims-list-core.ts` (exported signatures only, each body throws `not implemented`), `frontend/src/lib/models/types.ts` (optional `claim?: { status; statusChangedAt }` on `Annotation`), `frontend/src/lib/models/schemas.ts` (optional `claim` on `AnnotationSchema`), `frontend/src/lib/api/schemas.ts` (optional `claim` on `AnnotationResponseSchema`), a new test `frontend/tests/unit/claim-types.test.ts`, `specs/features/claim-ledger/experiments/task-2.md` (new; this task's results only)
**Done when:** Tests first, then green: the status constant has exactly the four identifiers and four labels; an `AnnotationSchema` and `AnnotationResponseSchema` parse of an annotation with a valid `claim` keeps the key and of one without a `claim` is unchanged and still passes every existing annotation test (`tests/unit/annotations-core.test.ts`, `annotation-validation.test.ts` unchanged); the three stub modules typecheck and export the signatures the other tasks import; `pnpm typecheck` and `pnpm lint` on touched files pass; `pnpm --filter getwrite-electron typecheck` (both passes) and `pnpm --filter getwrite-cli typecheck` run and recorded as run or not run.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-7, FR-9 (constant), FR-10 (field), FR-21 (contract). Types, constants and inert stubs only; no behaviour is merged, so this task does not wait for Task 1. The stubs are replaced by Tasks 11, 12 and 13, one file each, so those tasks never share a file. Hot files `types.ts`, `schemas.ts`, `lib/api/schemas.ts`: Task 2, then Tasks 4 and 6 sequentially. The Electron worker constraint applies (files under `lib/models/`).
**Done:** [ ]

### Task 3: Per-module default: defaultEnabled and one lookup
**What:** Add `defaultEnabled` to `ModuleManifestEntry` and make `isModuleEnabled` and the registry use one lookup, with an absent entry meaning the module's default, on for Sources and unknown ids.
**Files:** `frontend/src/lib/models/modules/registry.ts`, new `frontend/src/lib/models/modules/module-defaults.ts` (only if Task 1 (b) shows an import cycle; otherwise the lookup stays in `registry.ts`), `frontend/tests/unit/module-registry.test.ts`, `frontend/tests/unit/core-import-graph.test.ts`, `specs/features/claim-ledger/experiments/task-3.md` (new; this task's results only)
**Done when:** Tests first, then green: with a manifest in which a module declares `defaultEnabled: false`, `isModuleEnabled` is false when `config.modules` is absent or has no own entry, true for an explicit `true`, false for an explicit `false`; Sources and an unknown id stay true when absent; prototype names stay true as today; `registry.enabledViews` and `registry.indexSteps` follow the same rule through the one lookup; every existing case in `module-registry.test.ts` passes unchanged; `core-import-graph.test.ts` passes with the model side importing no React, JSX or JSON; Electron and CLI typecheck recorded.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-2 (OQ-4). The claims manifest entry itself is Task 4, so this task tests with a fake manifest. Hot files: `registry.ts` and `module-registry.test.ts`, Task 3 only. The Electron worker constraint applies.
**Done:** [ ]

### Task 4: Claims manifest entry, module id and ViewName
**What:** Add the `claims` entry to `MODULE_MANIFEST` (off by default, view `claims`, empty `indexSteps`) and add `"claims"` to `ViewName`.
**Files:** `frontend/src/lib/models/modules/manifest.ts`, `frontend/src/lib/models/types.ts` (`ViewName` only), new `frontend/tests/unit/claims-module-manifest.test.ts`, `specs/features/claim-ledger/experiments/task-4.md` (new; this task's results only)
**Done when:** Tests first, then green: the manifest has an entry `claims` matching `^[a-z][a-z0-9-]{0,63}$` with view `{ id: "claims", label: "Claims" }`, `defaultEnabled: false` and empty `indexSteps`; Sources' entry is unchanged; a project with no `config.modules` has claims off and Sources on; a project with `{ claims: true }` has both on; `"claims"` is a member of `ViewName`; typecheck reports no non-exhaustive `ViewName` switch left unhandled; Electron and CLI typecheck recorded.
**Depends on:** 2, 3
**Estimate:** 2
**Notes:** Satisfies FR-3 (OQ-5, OQ-8). The `UiModuleEntry` for claims is registered in Task 25 with its components. Hot file `types.ts`: Task 2 then Task 4.
**Done:** [ ]

### Task 5: Modules screen: claims switch, Sources save writes no claims entry
**What:** Make the Project Settings > Modules screen and the hooks show and save the claims switch through the existing path, reading the default when no entry exists.
**Files:** `frontend/components/Modules/ModuleSwitchSection.tsx`, `frontend/components/Modules/useModuleEnabled.ts`, `frontend/components/Modules/useEnabledModuleViews.ts`, new `frontend/tests/component/claims-module-switch.test.tsx`, `specs/features/claim-ledger/experiments/task-5.md` (new; this task's results only)
**Done when:** Tests first, then green: a project with no claims entry renders the claims switch off and Sources on; toggling claims calls the existing `PUT /api/project/modules` path with only the `claims` entry; toggling Sources writes no `claims` entry; a failed save shows the writer's choice and a text error as the Sources switch does; the hooks return the default for an absent entry; with the module off the Claims view is absent from the enabled views and an open Claims tab falls back as Sources does (test with a fake shell state); no new route.
**Depends on:** 3, 4
**Estimate:** 3
**Notes:** Satisfies FR-3, FR-6 (tab absent and fallback). Nothing writes a claims entry automatically and the screen shows only on or off.
**Done:** [ ]

### Task 6: Project type `modules` declaration: schema, validation, API schema
**What:** Add the optional `modules` record (module id to boolean) to the project type format and its validation, request and response schemas and the JSON schema file.
**Files:** `frontend/src/lib/models/schemas.ts` (`ProjectTypeSchema`), `frontend/src/lib/api/schemas.ts` (project type request and response uses), `getwrite-config/templates/project-types/project-type.schema.json` (only if Task 1 (d) shows something consumes it; otherwise left unchanged and recorded), `frontend/tests/unit/project-type-validation.test.ts`, `frontend/tests/unit/project-type.test.ts`, `specs/features/claim-ledger/experiments/task-6.md` (new; this task's results only)
**Done when:** Tests first, then green: a type with `modules: { claims: true, sources: false }` validates; a non-boolean value, an array or an unknown shape fails with a message and is never stored; an unknown module id is accepted as given; a type with no `modules` validates unchanged; the built-in types still validate and none declares claims on; an error message does not echo client input; Electron and CLI typecheck recorded.
**Depends on:** 1, 2
**Estimate:** 3
**Notes:** Satisfies FR-4 (format change), FR-23 (boundary validation). `ProjectTypeSchema` is `.strict()`, so an older build rejects a saved type with the key; the older-build behaviour is recorded by Task 1 (d) and listed under Not verified unless measured. Hot files `schemas.ts` and `lib/api/schemas.ts`: Task 2 then Task 6. The Electron worker constraint applies.
**Done:** [ ]

### Task 7: Create projects with the declared module entries
**What:** Make `createProjectFromType` write exactly the declared `modules` entries to `config.modules` through the one creation path, and none for a type declaring nothing.
**Files:** `frontend/src/lib/models/project-creator.ts`, `frontend/src/lib/models/project-types-static.ts` (only if the native static path needs it), `frontend/tests/unit/helpers/project-creator.ts` (helper only, if needed), new `frontend/tests/unit/project-type-modules-creation.test.ts`, `specs/features/claim-ledger/experiments/task-7.md` (new; this task's results only)
**Done when:** Tests first, then green: a project created from a type declaring `{ claims: true }` has `config.modules` equal to `{ claims: true }` and `isModuleEnabled` true; from a type declaring nothing has no `config.modules` key or entries; an unknown declared id is stored as given; the same result through `createProjectCore` and the native static registry path; saving or editing a type changes no existing project's `config.modules` (a test that no code path re-applies a type); no built-in type changes; Electron and CLI typecheck recorded.
**Depends on:** 6
**Estimate:** 3
**Notes:** Satisfies FR-4 (creation, no effect on existing projects). Hosted creation refuses writer-made types (`saving-unavailable`); only built-ins apply there. The Electron worker constraint applies.
**Done:** [ ]

### Task 8: Project Type draft service: three-state module declaration
**What:** Add the module declaration (one on, off or not set state per manifest module) to the draft service, its validation and its save payload.
**Files:** `frontend/components/project-types/ProjectTypeDraftService.ts`, `frontend/tests/unit/project-type-draft-service.test.ts`, `frontend/tests/unit/project-type-draft-service-hook.test.tsx`, `specs/features/claim-ledger/experiments/task-8.md` (new; this task's results only)
**Done when:** Tests first, then green: a draft exposes one state per module in `MODULE_MANIFEST` (claims and sources), defaulting to not set; setting on or off puts exactly that entry in the save payload and not set removes it; an existing type's declaration loads into the draft; a failed save keeps the draft and returns an error text; a hosted deployment's draft is read-only for saving (no save offered); a built-in type's draft is read-only.
**Depends on:** 4, 6
**Estimate:** 3
**Notes:** Satisfies FR-5 (state and validation half). No built-in type declares claims on.
**Done:** [ ]

### Task 9: Project Type Manager form: module control, accessibility, story
**What:** Render the three-state control per manifest module in the Project Type Manager with accessible names, keyboard operation and text errors.
**Files:** `frontend/components/project-types/ProjectTypeEditorForm.tsx`, `frontend/tests/component/ProjectTypeEditorForm.test.tsx`, `frontend/stories/ProjectTypes/ProjectTypeEditorForm.stories.tsx`, `specs/features/claim-ledger/experiments/task-9.md` (new; this task's results only)
**Done when:** Tests first, then green: the form shows one labelled three-state control (on, off, not set) for each manifest module; it is operable by keyboard and has an accessible name per control; a field error renders as text; a built-in type shows the declaration read-only; a hosted deployment shows built-in declarations with no save control; a failed save says so and keeps the draft; an axe test passes; a story covers editable, built-in read-only, hosted read-only and error states, written after reading the form's source and stories.
**Depends on:** 8
**Estimate:** 3
**Notes:** Satisfies FR-5 (interface half). Read the component's source and stories before using any prop. No red.
**Done:** [ ]

### Task 10: Claim validators: new claim, update claim, carried claim
**What:** Add the pure validators for creating a claim, for the update-claim operation and for a claim carried by paste, each run before any lock.
**Files:** `frontend/src/lib/models/annotation-validation.ts`, `frontend/tests/unit/annotation-validation.test.ts`, `specs/features/claim-ledger/experiments/task-10.md` (new; this task's results only)
**Done when:** Tests first, then green: a statement of 1 and 5000 UTF-16 code units is accepted and 0 and 5001 are refused, never truncated; an empty statement is refused with and without a Source link; update-claim refuses a status not among the four identifiers, a Source link failing `validateAnnotationTarget`, an empty or over-long statement, an unknown key, a client-supplied `statusChangedAt` and a call with none of status, link, statement present; a status of `unsourced` is refused; the existing `validateAnnotationBody` and `validateNewAnnotation` results for a non-claim are unchanged (existing tests pass untouched); a carried `claim` (paste) is accepted only with a known status and a valid ISO `statusChangedAt` and refused otherwise; messages never echo input.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-8, FR-9, FR-11 (validation), FR-12 (unsourced never settable), FR-23. Open point for the lead: FR-10 says the date is never client-supplied while FR-18 and OQ-12 say a paste keeps status date; this task accepts a validated carried `claim` only on the paste path and never on mark-as-claim creation, and Task 11's core ignores any client date. Hot file `annotation-validation.ts`: Task 10 only.
**Done:** [ ]

### Task 11: addClaimCore: create a claim in one write
**What:** Implement `addClaimCore`, which stores an annotation with `claim: { status: "unverified", statusChangedAt }` in one `mutateSidecar` write, refusing non-text resources and empty selections.
**Files:** `frontend/src/lib/models/claims-add-core.ts`, new `frontend/tests/unit/claims-add-core.test.ts`, `specs/features/claim-ledger/experiments/task-11.md` (new; this task's results only)
**Done when:** Tests first, then green, with a temporary project and no HTTP: a claim on a text resource is stored with its statement as body, its quote, a new id and `claim.status` `unverified` with a core-written ISO `statusChangedAt` in one write (a spy shows one `mutateSidecar` call); an image, audio or Source resource is refused with a plain message and nothing written; an empty selection is refused; a field naming an entity is refused; the 501st annotation (claims and notes together) is refused; a locked project raises the locked-access error and an encrypted project stores it encrypted (the existing adapter path); validation runs before the lock; the claim core's reads go through the storage adapter, not `node:fs`; Electron and CLI typecheck recorded.
**Depends on:** 2, 10
**Estimate:** 5
**Notes:** Satisfies FR-7, FR-9 (start status), FR-10, FR-21 (core). Imports no React, JSX or JSON. Replaces the Task 2 stub in its own file.
**Done:** [ ]

### Task 12: updateClaimCore: status, Source link and statement in one write
**What:** Implement `updateClaimCore`, one operation that changes status, Source link and statement of a claim in a single `mutateSidecar` write, setting `statusChangedAt` only when the status changes.
**Files:** `frontend/src/lib/models/claims-update-core.ts`, new `frontend/tests/unit/claims-update-core.test.ts`, `specs/features/claim-ledger/experiments/task-12.md` (new; this task's results only)
**Done when:** Tests first, then green, with a temporary project: a status change sets `claim.status`, a new core-written `statusChangedAt` and `updatedAt`; a statement edit, a Source link change, a link removal and a re-selection of the same status leave `statusChangedAt` unchanged; a link saves `sourceName` at link time and a Source rename does not update it; a link to a non-Source or a missing id is refused with a message and nothing written; an annotation that is not a claim is refused; a stored off-list status is left as stored by a statement edit; a body edit through the existing `updateAnnotationCore` leaves `claim` and `target` untouched; one `mutateSidecar` write per call; locked and encrypted behave as in Task 11; storage adapter only; Electron and CLI typecheck recorded.
**Depends on:** 2, 10
**Estimate:** 5
**Notes:** Satisfies FR-9, FR-10, FR-11, FR-12. Existing `updateAnnotationCore` and `reattachAnnotationCore` are not edited; Task 26 pins that they spread the stored `claim`.
**Done:** [ ]

### Task 13: Project-wide claim list core
**What:** Implement `listClaimsCore`, which scans every text resource's sidecar and returns the claims read plus the resources that could not be read.
**Files:** `frontend/src/lib/models/claims-list-core.ts`, new `frontend/tests/unit/claims-list-core.test.ts`, `specs/features/claim-ledger/experiments/task-13.md` (new; this task's results only)
**Done when:** Tests first, then green, with a temporary project: claims of every text resource are returned with resource id and name, statement, quote, status, date, Source link and Source name; a resource whose sidecar read fails is named as not read while the others are still returned (never an empty list for a failed read); a resource in Trash is not listed as a live claim; a non-claim annotation is not listed; a locked project raises the locked-access error; the read goes through the storage adapter (a test that fails if `node:fs` is imported or used) and takes no client path; tenant scoping holds under a hosted-tenant `StorageContext`; the count of sidecars read is returned for Task 1's measurement; Electron and CLI typecheck recorded.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-17 (OQ-9: scan, no new store). Citation state (removed Source) is derived in the UI from the listed facts by Task 20, not here.
**Done:** [ ]

### Task 14: Carry the claim through add, paste and the client parse
**What:** Make the add core, `annotation-paste.ts` and the client annotation transport carry a validated `claim` so a pasted claim keeps status, status date and Source link.
**Files:** `frontend/src/lib/models/annotations-core.ts`, `frontend/components/Editor/Extensions/annotation-paste.ts`, `frontend/src/lib/api/annotations.ts`, `frontend/tests/unit/annotation-paste.test.ts`, `specs/features/claim-ledger/experiments/task-14.md` (new; this task's results only)
**Done when:** Tests first, then green: `addAnnotationCore` given a carried valid `claim` (Task 10) stores it unchanged and a carried invalid one is refused; `annotation-paste.ts` sends `body`, `quote`, `target` and `claim` when present and a pasted claim keeps status, status date and Source link in the stored sidecar; the client parse in `lib/api/annotations.ts` returns the `claim` key; an annotation with no `claim` pastes exactly as before (existing paste tests unchanged); the result recorded in Task 1 (c) for an older build is cited in the Done notes, not re-asserted; Electron and CLI typecheck recorded.
**Depends on:** 1, 2, 10
**Estimate:** 3
**Notes:** Satisfies FR-18 (paste path), OQ-7, OQ-12. Hot file `annotations-core.ts`: Task 14 only (Tasks 11 and 12 use `mutateSidecar` directly). The Electron worker constraint applies.
**Done:** [ ]

### Task 15: Route: /api/claims (list, create, update)
**What:** Add the claims route with GET list, POST create and PUT update-claim, each in `withStorageContext`, taking `projectId` and `resourceId` and no path.
**Files:** new `frontend/app/api/claims/route.ts`, new `frontend/tests/unit/claims-route.test.ts`, `specs/features/claim-ledger/experiments/task-15.md` (new; this task's results only)
**Done when:** Tests first, then green, with the cores mocked by their Task 2 signatures: each method runs inside `withStorageContext` and takes no client path; a locked project returns the locked-access response and an unknown key or bad status returns 400 with a message that does not echo input; a hosted request is scoped to the signed-in tenant's project (a test with two tenants shows no cross-tenant read through GET); the paired-device gate classifies the route as it does `/api/annotations` writes (a test through the same gate), creating, updating status and changing the link are allowed and refused on a paired device exactly as the annotation write is, and no new limit switch exists; claim delete is still only `DELETE /api/annotations` under `permanentDeletion` (existing test unchanged).
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-21 (route, paired-device classification), FR-17 (locked). Contract-first: runs in parallel with Tasks 11 to 13; the final behaviour is exercised end to end in Task 26. The gate's file is located by the task and only read.
**Done:** [ ]

### Task 16: Client transport: lib/api/claims.ts
**What:** Add the client for list, create and update-claim that resolves the HTTP or native backend through `createTransport` and parses every response.
**Files:** new `frontend/src/lib/api/claims.ts`, new `frontend/tests/unit/claims-transport.test.ts`, `specs/features/claim-ledger/experiments/task-16.md` (new; this task's results only)
**Done when:** Tests first, then green, with fakes: on a web runtime each call hits `/api/claims` with `projectId`, `resourceId` and no path and parses the response with a schema that keeps `claim`; on a native runtime it calls the native backend through `createTransport` with no `fetch`; a failed response surfaces its error and is never turned into an empty list; the locked-access error is surfaced as such; the raw `NEXT_PUBLIC_GETWRITE_RUNTIME` comparison is used.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-21 (transport parity), FR-23. The native module is a Task 17 file; this test fakes it by its Task 2 signature.
**Done:** [ ]

### Task 17: Native backend: claims core in-process, web stub, encrypted-marker refusal
**What:** Add the native claims backend that runs the same cores through `createNativeRunner`, with a `.web-stub.ts` alias, and refuse writes into a project carrying the encrypted marker.
**Files:** new `frontend/src/store/transport/native-claims-backend.ts`, new `frontend/src/store/transport/native-claims-backend.web-stub.ts`, `frontend/next.config.mjs` (alias only), new `frontend/tests/unit/native-claims-backend.test.ts`, `specs/features/claim-ledger/experiments/task-17.md` (new; this task's results only)
**Done when:** Tests first, then green: the backend calls list, add and update cores through `createNativeRunner` with the project id and returns their results; a write into a project with the encrypted marker is refused with the typed error of Feature 107's guard (`native-encrypted-project-guard.ts`, reused, not edited) and writes nothing, while a read-only list is allowed; the web stub rejects with a native-only message; a webpack-alias test shows the web build resolves the stub; no route is added; typecheck and lint pass.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-21 (native parity, encrypted marker verified rather than assumed). Hot file `next.config.mjs`: Task 17 only. Inlining of the new module is checked by the lead in Task 28.
**Done:** [ ]

### Task 18: Claim flows: mark, update, failure handling
**What:** Add the flows (`addClaimFlow`, status, link and statement updates) with injected transport functions so a failed write adds no mark and a failed mark leaves the claim stored.
**Files:** new `frontend/src/lib/claim-flows.ts`, new `frontend/tests/unit/claim-flows.test.ts`, `specs/features/claim-ledger/experiments/task-18.md` (new; this task's results only)
**Done when:** Tests first, then green, with injected fakes (patterned on `tests/unit/annotation-flows.test.ts`): a successful mark stores the claim then sets the `annotation` mark with the stored id; a failed write adds no mark and returns an error text; a failed mark after a stored write leaves the claim stored and reports it as detached; an update that fails returns the error and the caller's displayed value is not changed (non-optimistic); no flow reads or writes `config.statuses`.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-14 (failure handling), FR-15 (non-optimistic writes). `annotation-flows.ts` is read, not edited.
**Done:** [ ]

### Task 19: Mark as claim control and story
**What:** Add the "Mark as claim" control for the editor's claim slot, keyboard and touch operable, with a status region, working with Sources off.
**Files:** new `frontend/components/Editor/Citations/MarkClaimControl.tsx`, new `frontend/tests/component/MarkClaimControl.test.tsx`, new `frontend/stories/Editor/MarkClaimControl.stories.tsx`, `specs/features/claim-ledger/experiments/task-19.md` (new; this task's results only)
**Done when:** Tests first, then green: the control has an accessible name "Mark as claim", is operable by keyboard and touch, is disabled with a visible reason for an empty selection, calls the `onMarkClaim` callback of Task 2 with the selection and statement, announces success and failure in a status region, uses no red and no colour alone, renders and works when no Source list is available (Sources off), and an axe test passes; the story covers idle, empty selection, working, failed and succeeded, written after reading `CitationControl.tsx`, `MarkExcerptControl.tsx` and their stories.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-14. Presentational: props in, callbacks out; Task 25 wires it. It is not rendered with the module off, a read-only editor or a non-text resource; that gating is Task 25.
**Done:** [ ]

### Task 20: Claim display model and filters (pure)
**What:** Add the pure functions that derive unsourced, the status label and off-list mark, the local date, the removed-Source state and the status and sourced filters.
**Files:** new `frontend/src/lib/claim-display.ts`, new `frontend/tests/unit/claim-display.test.ts`, `specs/features/claim-ledger/experiments/task-20.md` (new; this task's results only)
**Done when:** Tests first, then green: unsourced is derived from no `target` and never stored and a Verified unsourced claim reports both facts; a stored off-list status is reported as stored with a marked flag and matches no status filter but all; the date is shown as a local calendar date from the ISO timestamp; Source state reuses `citation-target-state.ts` facts (present, removed, permanently deleted, could not be checked) and a could-not-be-checked claim is never sourced or unsourced; filters by status (four) and by sourced or unsourced combine, the active filters render as text, and an empty result reports that no claim matches; with the module off the display model reports an ordinary note (statement as body, no marker, status or Source line).
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-9, FR-10, FR-12, FR-13, FR-16 (filters), FR-6 (off display), FR-23. Pure functions, no React.
**Done:** [ ]

### Task 21: ClaimRow: presentational claim row and stories
**What:** Add the presentational claim row for the annotations panel: claim marker, statement, status control, status date, Source line or "unsourced", detached and removed-Source states.
**Files:** new `frontend/components/Editor/Annotations/ClaimRow.tsx`, new `frontend/tests/component/ClaimRow.test.tsx`, new `frontend/stories/Editor/ClaimRow.stories.tsx`, `specs/features/claim-ledger/experiments/task-21.md` (new; this task's results only)
**Done when:** Tests first, then green: the row shows that it is a claim, the statement and quote as text never HTML, the status with its date, the Source line ("Source: <name>", "(removed)", "permanently deleted", "The Source could not be checked.") or the word "unsourced", and a Re-attach action for a detached claim; a status select offers the four labels and calls back; a link or relink control is rendered only when `sourcesEnabled` is true and the removed-Source line stays visible when it is false; an off-list status is shown marked; with `moduleEnabled` false it renders as an ordinary note with an editable body and no marker, status or Source line; an axe test passes and no red or colour-only state; stories cover each state, written after reading `AnnotationsPanel.tsx` and its stories.
**Depends on:** 20
**Estimate:** 5
**Notes:** Satisfies FR-11 (relink placement), FR-12, FR-13, FR-15, FR-6. Props in, callbacks out; `AnnotationsPanel.tsx` is not edited here (Task 24).
**Done:** [ ]

### Task 22: ClaimsView: Claims tab presentation, filters and stories
**What:** Add the presentational Claims tab with heading, loading, failed with retry, empty, not-read resources, the list, and the combinable filters, modelled on `SourcesView.tsx`.
**Files:** new `frontend/components/Claims/ClaimsView.tsx`, new `frontend/components/Claims/ClaimsFilters.tsx`, new `frontend/tests/component/ClaimsView.test.tsx`, new `frontend/stories/Claims/ClaimsView.stories.tsx`, `specs/features/claim-ledger/experiments/task-22.md` (new; this task's results only)
**Done when:** Tests first, then green: the view renders loading, failed with a retry, empty ("no claims") and the list; each claim shows statement, quote, resource, status with its date, Source name or "unsourced" and detached, removed or could-not-be-checked state; resources that could not be read are named as not read above the claims that were read, with a retry; status and sourced filters combine, state the active filters in text and say that no claim matches when the result is empty; each claim has an open action (callback) and there is no write control for status, link, statement or delete; axe and keyboard tests pass; a story per state, written after reading `SourcesView.tsx`, `SourcesViewControls.tsx` and their stories.
**Depends on:** 20
**Estimate:** 5
**Notes:** Satisfies FR-16 (OQ-15: list, filter, open only), FR-17 (not-read named). Presentational; the data and open behaviour come from Task 23.
**Done:** [ ]

### Task 23: useClaimList hook and open-at-passage
**What:** Add the hook that loads the project-wide list through the client, exposes retry, the locked unlock prompt and the open-claim action, resolving a detached claim to its resource.
**Files:** new `frontend/components/Claims/useClaimList.ts`, new `frontend/tests/hooks/useClaimList.test.tsx`, `specs/features/claim-ledger/experiments/task-23.md` (new; this task's results only)
**Done when:** Tests first, then green, with a fake client: the hook returns loading, the claims with the not-read resources, and a failure state with retry that is never an empty list; a locked-access error opens the unlock prompt as `TrashView.tsx` does; open on a claim whose passage exists asks the shell to open the resource and focus the annotation, and on a detached claim opens the resource with the detached state shown, not nothing; filter state uses `claim-display.ts`; a claim of a Trash resource is not shown as live.
**Depends on:** 16, 20
**Estimate:** 3
**Notes:** Satisfies FR-16 (open at passage), FR-17. Read `TrashView.tsx` and the existing mention-jump or annotation-focus path to reuse before adding any new mechanism.
**Done:** [ ]

### Task 24: Annotations panel wiring: claim rows, update actions, module off
**What:** Wire the panel and its hook to render claim rows, call the update-claim client and show an ordinary note with the module off.
**Files:** `frontend/components/Editor/Annotations/AnnotationsPanel.tsx`, `frontend/components/Editor/Annotations/useAnnotationsPanel.ts`, `frontend/stories/Editor/AnnotationsPanel.stories.tsx`, `frontend/tests/hooks/useAnnotations.test.tsx`, new `frontend/tests/component/AnnotationsPanelClaims.test.tsx`, `specs/features/claim-ledger/experiments/task-24.md` (new; this task's results only)
**Done when:** Tests first, then green, with fakes: with the module on a claim renders as `ClaimRow` and never as a plain note; a status, Source link or statement change calls the update-claim client once, shows its failure in text and leaves the shown value as it was (non-optimistic); relink is offered only while Sources is on; with the module off the same claim renders as an ordinary note whose body edit calls the existing note update and changes no `claim` or `target`; Re-attach and Delete still work for a claim, and Delete is disabled with its visible reason under `permanentDeletion` as for a note; existing panel tests and stories pass unchanged for non-claim annotations; axe passes.
**Depends on:** 16, 18, 21
**Estimate:** 5
**Notes:** Satisfies FR-6, FR-11, FR-13, FR-15. Hot files: `AnnotationsPanel.tsx`, `useAnnotationsPanel.ts` and the panel story, Task 24 only. Read the component source and stories before using props.
**Done:** [ ]

### Task 25: Registry wiring: claims UI entry, citation slot, Claims tab and editor gating
**What:** Register the claims `UiModuleEntry` with its `view` and `citationControl` slots, make the citation slot render every enabled module's control, and gate the control and tab on the module.
**Files:** `frontend/components/Modules/uiRegistry.ts`, `frontend/components/Editor/Citations/CitationControlSlot.tsx`, `frontend/components/Layout/AppShell.tsx` (only if the Claims view needs the shell to host it), `frontend/tests/unit/module-ui-registry.test.tsx`, new `frontend/tests/component/claims-registry-wiring.test.tsx`, `specs/features/claim-ledger/experiments/task-25.md` (new; this task's results only)
**Done when:** Tests first, then green: `UI_MODULE_VIEWS` has a `claims` view whose id equals the manifest's and `ViewName`'s (the existing pinning test extended); with the module on the Claims tab appears beside Sources and renders `ClaimsView` through `useClaimList`; with it off the tab is absent and an open Claims tab falls back; the editor shows both Sources' controls and "Mark as claim" when both modules are on, "Mark as claim" alone with Sources off, none with claims off, and none in a read-only editor or for a non-text resource; mark-as-claim calls `addClaimFlow`; no new slot kind; `CitationControlSlot` change made only if Task 1 (g) showed it renders one module's control, with a test; existing Sources tests pass unchanged.
**Depends on:** 1, 4, 18, 19, 22, 23
**Estimate:** 5
**Notes:** Satisfies FR-3, FR-14, FR-16, FR-6 (OQ-8). Hot files `uiRegistry.ts`, `CitationControlSlot.tsx`, `AppShell.tsx`: Task 25 only.
**Done:** [ ]

### Task 26: Pins: copy, duplicate, paste, cut, revision restore, Trash and encryption of a claim
**What:** Add one test per FR-18 operation showing a claim keeps its marker, status, date and Source link or is reported, plus the older-build and off-list cases.
**Files:** new `frontend/tests/unit/claim-survival.test.ts`, `specs/features/claim-ledger/experiments/task-26.md` (new; this task's results only); reads `frontend/src/lib/models/annotation-remap.ts`, `annotation-copy.ts`, `revision-core.ts`, `frontend/tests/unit/annotation-target-survival.test.ts`, `revision-restore-annotations.test.ts` for patterns; no product source change
**Done when:** Tests written first and green, each its own test: copy and duplicate of a resource (new id, claim fields kept); paste of a copied claim in the same and another resource; a same-resource cut-paste (same id, nothing written); a cross-resource cut-paste; a partial cut; revision restore; Trash and restore of a resource and of a folder holding it; encrypt and unlock of the project; `updateAnnotationCore` and `reattachAnnotationCore` keep `claim` and `target`; deleting only the passage text leaves the claim stored and detached; a claim is deleted only through the existing delete; a stored off-list status is never rewritten by any of these; Electron and CLI typecheck recorded.
**Depends on:** 11, 12, 14
**Estimate:** 5
**Notes:** Satisfies FR-18, FR-13, FR-9 (never rewritten). Tests only; a failure caused by shipped behaviour is reported, not fixed here. The older-build behaviour is not tested here (Task 1 (c)) and is listed under Not verified.
**Done:** [ ]

### Task 27: Pins: compile, export, search and import graph
**What:** Add the tests showing claims change no compile or export output, are found by search as a Note hit, and that the claim cores respect the import graph.
**Files:** `frontend/tests/unit/compile-annotation-marks.test.ts`, new `frontend/tests/unit/claim-search.test.ts`, new `frontend/tests/unit/claims-core-import-graph.test.ts`, new `frontend/tests/component/claims-dialogs-unchanged.test.tsx`, `specs/features/claim-ledger/experiments/task-27.md` (new; this task's results only)
**Done when:** Tests written first and green: TXT, Markdown, DOCX and PDF text and the Markdown warnings are identical with and without a claim on the passage; the Compile and Export dialogs show nothing about claims and no claim id enters `compileDefaults` or `exportDefaults`; a claim's statement is found with `snippetKind: "note"` ("Note: ") with the module on and off, and status and Source are not query fields; `claims-add-core.ts`, `claims-update-core.ts` and `claims-list-core.ts` import no React, JSX or JSON and no `node:*` outside the storage adapter, extending the `core-import-graph` approach; Electron and CLI typecheck recorded.
**Depends on:** 11, 13
**Estimate:** 3
**Notes:** Satisfies FR-19, FR-20, FR-23. Tests only; `execute-search.ts` is changed only if a test shows it is needed, and then the task stops and reports.
**Done:** [ ]

### Task 28: LEAD-RUN: build, install and inlining check
**What:** From the main checkout, outside the sandbox, build the native app, run the inlining grep and install the debug build on the Pixel 7 Pro, recording each result.
**Files:** `specs/features/claim-ledger/experiments/task-28.md` (new)
**Done when:** Recorded as observed values with the command, commit and build time: `pnpm build:native` (in `frontend/`) result; the grep of `NEXT_PUBLIC_GETWRITE_RUNTIME` under `frontend/out/_next/static` (0 occurrences or the count seen) for a build containing every new client module; the Gradle debug assemble and install result; any failure recorded as seen with no cause named.
**Depends on:** 5, 7, 9, 15, 17, 24, 25
**Estimate:** 2
**Notes:** LEAD-RUN, not for the orchestrator: the lead runs it with the owner outside the sandbox from the main checkout (builds fail in worktrees here; `adb` and Gradle can fail inside the sandbox, retry outside before filing a bug). Satisfies FR-1(f), FR-24.
**Done:** [ ]

### Task 29: LEAD-RUN: device runs on the Pixel 7 Pro and a paired device
**What:** With the owner, run the claim ledger on the physical Pixel 7 Pro and on a paired device and record every FR-24 item as an observed value.
**Files:** `specs/features/claim-ledger/experiments/task-29.md` (new)
**Done when:** Each run records the build (commit and build time), the device, Android version and WebView version (Android) or the pairing and client (paired device), and as observed values: the module switched on and off; marking a claim, linking a Source, changing the status and reading the status date; the Claims tab with its filters and open-at-passage; a claim whose Source was moved to Trash and one whose passage text was deleted; a copy, a paste and a revision restore of a claim; a search for the statement; for the paired device the claim write, status change, link change and the delete refused when `permanentDeletion` is on; whether a project type declaring claims on starts a new project with it on; every path not run is listed under Not verified; an emulator or unit test is not reported as a device run.
**Depends on:** 26, 27, 28
**Estimate:** 8
**Notes:** LEAD-RUN, not for the orchestrator. Satisfies FR-24, FR-21 (parity claims). Android and paired-device support MUST NOT be claimed until this is recorded. Record which driving method was used (by hand or `adb`). No cause is written without an experiment that separated it.
**Done:** [ ]

### Task 30: Documentation updates for the claim ledger
**What:** Apply the documentation changes FR-24 requires, with the scribe stage writing the prose, so that no document states an unmeasured result as fact.
**Files:** `docs/user/handbook/write/annotations.md`, `docs/user/handbook/organize/project-types.md`, new `docs/user/handbook/write/claims.md`, `docs/features/annotations.md`, `docs/features/sources.md`, `docs/features/modules.md`, `docs/features/project-types.md`, new `docs/features/claims.md`, `frontend/CLAUDE.md` (Code Map: each file or seam added by Tasks 2 to 25), repo-root `CLAUDE.md` (glossary: Claim, Claims tab, claims module default), `android/CLAUDE.md` (not edited here; Task 31 edits it only if the device run changed it); `specs/product/getwrite.features.md` is not edited (status is the lead's), `specs/features/claim-ledger/experiments/task-30.md` (new; this task's results only)
**Done when:** The handbook pages state in plain language: how to mark a claim, the four statuses and the date, linking a Source, "unsourced", the Claims tab and its filters, that the module is off until switched on, that a project type can start new projects with it on, what a claim looks like with the module off, and that Sources off hides relink; `docs/features/modules.md` states the per-module default replacing "absent entry means on" for claims only; `docs/features/project-types.md` documents the `modules` record; `docs/features/annotations.md` and `sources.md` document the `claim` field, the update-claim operation and the claim-aware panel; `frontend/CLAUDE.md` and the glossary list each seam added; no sentence states an unmeasured result as fact, no document names a cause, and the "older build may drop it on paste or parse" limit is stated unless Task 1 (c) showed otherwise.
**Depends on:** 26, 27, 28
**Estimate:** 3
**Notes:** Satisfies FR-24 (documentation). Prose is the scribe stage's job; the orchestrator passes it the files and the facts recorded by Tasks 1 to 28; it runs alongside the device run, so it states no device or paired-device result and says only that those runs are recorded in `experiments/task-29.md`; Task 31 adds the device-run results to these docs. Hot files: `docs/`, `frontend/CLAUDE.md`, root `CLAUDE.md`, `android/CLAUDE.md`: Task 30 only, then Task 31 for the device-run results.
**Done:** [ ]

### Task 31: LEAD-RUN: final suites exactly as CI runs them and close-out
**What:** Run every CI command from the places the workflows run them, write the acceptance record with the Not verified list, add the device-run results (from `experiments/task-29.md`) to the docs Task 30 wrote, and link the per-task results from `experiments.md`.
**Files:** `specs/features/claim-ledger/experiments.md` (Acceptance, Not verified and links to `experiments/task-*.md`), `specs/features/claim-ledger/experiments/task-31.md` (new), and the docs Task 30 wrote (device-run results only), plus `android/CLAUDE.md` only if the device run changed it
**Done when:** The CI list is first re-read with `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` and any difference is recorded; each command is run from the main checkout outside the sandbox and recorded as run or not run (including root `pnpm run format:check`, frontend `pnpm lint`, `pnpm run check:no-hex`, `pnpm typecheck`, `pnpm test:ci`, `pnpm test:e2e`, builds, `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck`, plus `pnpm knip` compared with main); `experiments.md` links or summarises every `experiments/task-<n>.md`; "Not verified" lists at least: any device or Android version other than the Pixel 7 Pro, an encrypted project on Android, a claim in a project near the 500-annotation cap, the project-wide list on a large project, an older build's treatment of the `claim` key and of a saved type with `modules`, and any path not run; `git status` shows no `package.json` or lockfile change.
**Depends on:** 26, 27, 29, 30
**Estimate:** 5
**Notes:** LEAD-RUN, not for the orchestrator. Satisfies FR-23, FR-24. Tasks 1 to 25 are covered transitively through Tasks 26, 27 and 30. Folding the device-run results into the docs is its own step after Task 29 is recorded.
**Done:** [ ]

## Summary
- Total tasks: 31
- Total estimated effort: 122 story points
- Critical path: Tasks 1 → 3 → 4 → 8 → 9 → 28 → 29 → 31
- Risks: Task 1 (FR-1 (b), (c) and (g) decide whether Task 3 needs a leaf module, whether paste and the parse drop the `claim` key and whether Task 25 extends `CitationControlSlot`); Task 10 and Task 14 (a spec tension: FR-10 says the status date is never client-supplied while FR-18 and OQ-12 say a paste keeps it, so a validated carried `claim` is accepted on the paste path only); Task 17 (native encrypted-marker refusal reuses Feature 107's guard); Task 24 (the largest wiring task, one hot file set); Tasks 29 and 31 (device-only and lead-run; Android and paired-device support are not claimed until Task 29 is recorded).
