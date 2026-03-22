# Tasks: Refactor Frontend App Trouble Spots

**Input**: Design documents from `/specs/005-refactor-app-trouble-spots/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md, and the authority artifacts in `/specs/004-frontend-drift-coherence/`

**Tests**: This feature explicitly requires behavior-preserving verification. Each user story includes test tasks for invariant-sensitive paths before or alongside implementation tasks.

**Organization**: Tasks are grouped by user story, but sequencing inside and across stories follows the source of truth in [execution-blueprint.md](/Users/jedaisaboteur/Repositories/getwrite/specs/004-frontend-drift-coherence/execution-blueprint.md).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared verification scaffolding and baseline commands used by every hotspot track.

- [x] T001 Create shared refactor fixture builders in `frontend/src/tests/unit/refactor-guardrails/fixtureBuilders.ts`
- [x] T002 [P] Create shared UI parity helpers in `frontend/tests/integration/refactorParity.ts`
- [x] T003 [P] Add hotspot-specific test command aliases in `frontend/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lock the shared guardrail baseline before any hotspot extraction begins.

**⚠️ CRITICAL**: No user story implementation should begin until this phase is complete.

- [x] T004 Expand model and template baseline assertions in `frontend/src/tests/unit/resource.test.ts`, `frontend/src/tests/unit/uuid.test.ts`, `frontend/src/tests/unit/resource-templates.test.ts`, and `frontend/tests/unit/project-type-validation.spec.ts`
- [x] T005 [P] Expand revision and identity baseline assertions in `frontend/src/tests/unit/revision-invariants.test.ts` and `frontend/tests/reorder-persistence.test.tsx`
- [x] T006 [P] Record baseline verification commands and entry gates in `specs/005-refactor-app-trouble-spots/quickstart.md`

**Checkpoint**: Shared baselines are fixed and all hotspot tracks can now proceed according to blueprint dependencies.

---

## Phase 3: User Story 1 - Refactor Model Utilities and Redux Foundation (Priority: P1) 🎯 MVP

**Goal**: Stabilize the model and slice foundations that every downstream seam depends on.

**Independent Test**: Model factories validate all return objects via schemas, `revisionsSlice` and `projectsSlice` preserve selector/API shapes, and no `as any` remains in the model-layer seam paths.

### Tests for User Story 1

- [x] T007 [P] [US1] Add model-layer regression coverage in `frontend/src/tests/unit/resource-factory.test.ts`, `frontend/src/tests/unit/resource-persistence.test.ts`, `frontend/src/tests/unit/project-view-adapter.test.ts`, and `frontend/src/tests/unit/template-service.test.ts`
- [x] T008 [P] [US1] Add slice guardrail coverage in `frontend/src/tests/unit/revision-canonical-guards.test.ts`, `frontend/src/tests/unit/revisions-slice-selectors.test.ts`, and `frontend/src/tests/unit/projects-slice-controller.test.ts`

### Implementation for User Story 1

- [x] T009 [US1] Extract pure factories to `frontend/src/lib/models/resource-factory.ts` and re-export stable factory APIs from `frontend/src/lib/models/resource.ts`
- [x] T010 [P] [US1] Extract persistence helpers to `frontend/src/lib/models/resource-persistence.ts` and trim side effects from `frontend/src/lib/models/resource.ts`
- [x] T011 [P] [US1] Extract typed adapter helpers to `frontend/src/lib/models/project-view-adapter.ts` and remove `as any` usage from `frontend/src/lib/models/project-view.ts`
- [x] T012 [P] [US1] Extract template scanning and validation to `frontend/src/lib/models/template-service.ts` from `frontend/src/lib/models/resource-templates.ts`
- [x] T013 [US1] Trim `frontend/src/lib/models/resource-templates.ts` and `frontend/src/lib/models/resource.ts` to delegate to `frontend/src/lib/models/resource-factory.ts`, `frontend/src/lib/models/resource-persistence.ts`, and `frontend/src/lib/models/template-service.ts`
- [x] T014 [P] [US1] Extract transport and normalization helpers to `frontend/src/store/revision-transport-service.ts` and `frontend/src/store/revision-normalization.ts` from `frontend/src/store/revisionsSlice.ts`
- [x] T015 [P] [US1] Extract canonical guard helpers to `frontend/src/store/revision-canonical-guards.ts` and rewire reducer checks in `frontend/src/store/revisionsSlice.ts`
- [x] T016 [US1] Trim `frontend/src/store/revisionsSlice.ts` to preserve thunk and selector contracts while delegating to `frontend/src/store/revision-transport-service.ts`, `frontend/src/store/revision-normalization.ts`, and `frontend/src/store/revision-canonical-guards.ts`
- [x] T017 [P] [US1] Add `frontend/src/store/project-actions-controller.ts` and move delete/rename orchestration out of `frontend/src/store/projectsSlice.ts`
- [x] T018 [US1] Trim `frontend/src/store/projectsSlice.ts` and update `frontend/components/Start/ManageProjectMenu.tsx` to use typed hooks and `frontend/src/store/project-actions-controller.ts`

**Checkpoint**: User Story 1 is complete when the model layer and both slices are stable enough for Track A, B, and C downstream seams to proceed without hidden data-shape drift.

---

## Phase 4: User Story 2 - Stabilize Revision and Resource Workflows (Priority: P1)

**Goal**: Separate revision and tree behavior from UI rendering without changing autosave, selection, or reorder semantics.

**Independent Test**: Canonical revision enforcement, save-on-blur timing, resource-tree reorder payloads, and selection propagation all behave identically to the current application.

### Tests for User Story 2

- [x] T019 [P] [US2] Add EditView parity coverage in `frontend/tests/editView.test.tsx` and `frontend/tests/integration/editViewAutosave.test.tsx`
- [x] T020 [P] [US2] Expand ResourceTree parity coverage in `frontend/tests/resourceTree.test.tsx`, `frontend/tests/resourceTreeDrag.test.tsx`, and `frontend/tests/reorder-persistence.test.tsx`

### Implementation for User Story 2

- [x] T021 [US2] Extract revision hydration logic to `frontend/components/WorkArea/useRevisionContent.ts` from `frontend/components/WorkArea/EditView.tsx`
- [x] T022 [US2] Extract autosave lifecycle and retry handling to `frontend/components/WorkArea/useCanonicalAutosave.ts` from `frontend/components/WorkArea/EditView.tsx`
- [x] T023 [US2] Trim `frontend/components/WorkArea/EditView.tsx` to presentational editor coordination using `frontend/components/WorkArea/useRevisionContent.ts` and `frontend/components/WorkArea/useCanonicalAutosave.ts`
- [x] T024 [US2] Extract the tree adapter to `frontend/components/ResourceTree/buildResourceTree.ts` from `frontend/components/ResourceTree/ResourceTree.tsx`
- [x] T025 [US2] Extract reorder orchestration to `frontend/components/ResourceTree/useResourceReorder.ts` from `frontend/components/ResourceTree/ResourceTree.tsx`
- [x] T026 [US2] Trim `frontend/components/ResourceTree/ResourceTree.tsx` to render-only tree behavior and replace non-conformant lodash usage in `frontend/components/ResourceTree/ResourceTree.tsx`

**Checkpoint**: User Story 2 is complete when revision and tree workflows can be validated independently of large component bodies and all identity/canonical guardrails remain green.

---

## Phase 5: User Story 3 - Decompose App Shell and Project Types Manager (Priority: P1)

**Goal**: Split shell orchestration and project-type editing into focused units while preserving modal behavior, save coordination, and workspace-safe template editing.

**Independent Test**: Project-type editing preserves Workspace rules, AppShell still opens the same modals from the same triggers, and edit/save coordination remains unchanged.

### Tests for User Story 3

- [x] T027 [P] [US3] Expand project-type guardrail coverage in `frontend/tests/unit/project-type-validation.spec.ts` and `frontend/tests/create-project-modal.spec.tsx`
- [x] T028 [P] [US3] Add AppShell parity coverage in `frontend/tests/flows.test.tsx`, `frontend/tests/exportPreviewModal.test.tsx`, `frontend/tests/compilePreviewModal.test.tsx`, and `frontend/tests/create-project-modal.spec.tsx`

### Implementation for User Story 3

- [x] T029 [P] [US3] Extract `frontend/components/project-types/ProjectTypeDraftService.ts` and `frontend/components/project-types/ProjectTypeListPane.tsx` from `frontend/components/project-types/ProjectTypesManagerPage.tsx`
- [x] T030 [P] [US3] Extract `frontend/components/project-types/ProjectTypeEditorForm.tsx` and wire it to `frontend/components/project-types/ProjectTypeDraftService.ts`
- [x] T031 [US3] Trim `frontend/components/project-types/ProjectTypesManagerPage.tsx` to a slim shell that validates Workspace boundaries before committing through `frontend/src/lib/models/template-service.ts`
- [x] T032 [P] [US3] Extract `frontend/components/Layout/ShellLayoutController.tsx` and `frontend/components/Layout/ShellSettingsMenu.tsx` from `frontend/components/Layout/AppShell.tsx`
- [x] T033 [P] [US3] Extract `frontend/components/Layout/ShellModalCoordinator.tsx` and `frontend/components/Layout/ShellProjectTypeLoader.tsx` from `frontend/components/Layout/AppShell.tsx`
- [x] T034 [US3] Trim `frontend/components/Layout/AppShell.tsx` to compose the extracted shell units while preserving modal triggers, command-palette behavior, project-type propagation, and editor-save coordination

**Checkpoint**: User Story 3 is complete when both complex shell surfaces can be reasoned about as orchestrators instead of monoliths and all workspace/save guardrails still pass.

---

## Phase 6: User Story 5 - Maintain Product Invariants Throughout (Priority: P1)

**Goal**: Prove the refactors preserve workspace, canonical-revision, resource-identity, and styling invariants across all touched seams.

**Independent Test**: A focused regression pass confirms invariant-sensitive tests, type checks, and styling/import audits all pass after the extracted seams land.

### Tests for User Story 5

- [x] T035 [P] [US5] Add cross-invariant regression coverage in `frontend/src/tests/unit/revision-invariants.test.ts`, `frontend/tests/reorder-persistence.test.tsx`, and `frontend/tests/unit/project-type-validation.spec.ts`
- [x] T036 [P] [US5] Add cross-track parity coverage in `frontend/tests/flows.test.tsx`, `frontend/tests/start.test.tsx`, and `frontend/tests/a11y/workarea.a11y.test.tsx`

### Implementation for User Story 5

- [x] T037 [US5] Update `frontend/src/tests/unit/resource.test.ts`, `frontend/src/tests/unit/revision-manager.test.ts`, and `frontend/src/tests/unit/project-type.test.ts` to assert invariant preservation after seam extraction
- [x] T038 [P] [US5] Remove remaining type-safety and import-policy drift in `frontend/src/lib/models/project-view.ts`, `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`, and `frontend/components/ResourceTree/ResourceTree.tsx`
- [x] T039 [US5] Run and record guardrail verification outcomes in `specs/005-refactor-app-trouble-spots/quickstart.md`

**Checkpoint**: User Story 5 is complete when invariant regressions are explicitly ruled out by tests, audits, and quickstart verification evidence.

---

## Phase 7: User Story 4 - Consolidate Menu and Help Surfaces (Priority: P2)

**Goal**: Replace duplicated toolbar/help wiring with schema-driven or data-driven structures that preserve the existing UX.

**Independent Test**: Toolbar commands, color/highlight behavior, help content rendering, and help modal dismissal work exactly as before.

### Tests for User Story 4

- [x] T040 [P] [US4] Add toolbar parity coverage in `frontend/tests/controls.test.tsx` and `frontend/tests/editorMenuBar.test.tsx`
- [x] T041 [P] [US4] Add help surface parity coverage in `frontend/tests/component/helpPage.test.tsx` and `frontend/tests/a11y/helpPage.a11y.test.tsx`

### Implementation for User Story 4

- [x] T042 [US4] Add typed toolbar schema to `frontend/components/Editor/MenuBar/toolbar-command-schema.ts` and command resolution to `frontend/components/Editor/MenuBar/useToolbarCommand.ts`
- [x] T043 [P] [US4] Trim `frontend/components/Editor/MenuBar/EditorMenuColorSubmenu.tsx` and `frontend/components/Editor/MenuBar/EditorMenuInput.tsx` to schema-driven renderers
- [x] T044 [US4] Trim `frontend/components/Editor/MenuBar/MenuBar.tsx` to render from `frontend/components/Editor/MenuBar/toolbar-command-schema.ts` while preserving the `editor` prop surface
- [x] T045 [P] [US4] Extract help content and section primitives to `frontend/components/help/help-content.ts` and `frontend/components/help/HelpSectionCard.tsx`
- [x] T046 [US4] Trim `frontend/components/help/HelpPage.tsx` to a slim shell that preserves tabs, modal lifecycle, and keyboard dismissal behavior

**Checkpoint**: User Story 4 is complete when both low-risk surfaces become easier to maintain without changing command or help behavior.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup, full validation, and release-readiness for the refactor branch.

- [ ] T047 [P] Remove obsolete inline helpers, dead imports, and duplicate logic from `frontend/src/lib/models/resource.ts`, `frontend/src/lib/models/resource-templates.ts`, `frontend/src/store/revisionsSlice.ts`, `frontend/src/store/projectsSlice.ts`, `frontend/components/WorkArea/EditView.tsx`, `frontend/components/ResourceTree/ResourceTree.tsx`, `frontend/components/project-types/ProjectTypesManagerPage.tsx`, `frontend/components/Layout/AppShell.tsx`, `frontend/components/Editor/MenuBar/MenuBar.tsx`, and `frontend/components/help/HelpPage.tsx`
- [ ] T048 [P] Normalize token-first styling and typed hook usage across `frontend/components/Layout/ShellLayoutController.tsx`, `frontend/components/Layout/ShellSettingsMenu.tsx`, `frontend/components/Layout/ShellModalCoordinator.tsx`, `frontend/components/project-types/ProjectTypeListPane.tsx`, `frontend/components/project-types/ProjectTypeEditorForm.tsx`, `frontend/components/Editor/MenuBar/MenuBar.tsx`, and `frontend/components/help/HelpSectionCard.tsx`
- [ ] T049 Run the full refactor validation workflow and record completion in `specs/005-refactor-app-trouble-spots/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user-story implementation.
- **User Story 1 (Phase 3)**: Depends on Foundational and establishes the model/slice foundation required by Tracks A, B, and C.
- **User Story 2 (Phase 4)**: Depends on User Story 1 because `EditView` and `ResourceTree` require stable model and slice contracts.
- **User Story 3 (Phase 5)**: Depends on User Story 1 for `template-service` and on User Story 2 for the final `AppShell` save-coordination boundary.
- **User Story 5 (Phase 6)**: Depends on User Stories 1 through 3 and validates the invariant-sensitive seams before lower-risk cleanup is finalized.
- **User Story 4 (Phase 7)**: Depends only on Foundational by blueprint, but is intentionally scheduled after invariant-sensitive work because it is independent and lower risk.
- **Polish (Phase 8)**: Depends on all implemented user stories being complete.

### User Story Dependencies

- **US1**: No story dependency beyond Foundational.
- **US2**: Depends on US1.
- **US3**: Depends on US1; the `AppShell` trim step also depends on US2.
- **US5**: Depends on US1, US2, and US3 because it validates their invariant-sensitive outcomes.
- **US4**: No dependency on other stories beyond Foundational, but scheduled later for delivery order.

### Blueprint Track Mapping

- **Track A**: T009–T016 → T021–T023 → T032–T034
- **Track B**: T017–T018 → T024–T026
- **Track C**: T012 → T029–T031 → T033–T034
- **Track D**: T042–T044
- **Track E**: T045–T046
- **Deferred (not in scope)**: DF-004 modal internals and DF-005 metadata sidebar cleanup

### Parallel Opportunities

- T001/T002/T003 can run in parallel after initial branch setup.
- T007 and T008 can run in parallel because they cover different seam groups.
- T010, T011, and T012 can run in parallel after T009 stabilizes the factory surface.
- T014 and T015 can run in parallel before T016 trims `revisionsSlice.ts`.
- T017 can run in parallel with T014/T015 because `projectsSlice` is on Track B.
- T019 and T020 can run in parallel before US2 implementation.
- T029/T030 and T032/T033 can run in parallel once their prerequisites are met because they touch different Track C and Track A files.
- T040 and T041 can run in parallel, as can T043 and T045, because MenuBar and HelpPage are independent tracks.

---

## Parallel Example: User Story 1

```bash
# After T009 stabilizes resource-factory.ts:
Task: "Extract persistence helpers to frontend/src/lib/models/resource-persistence.ts and trim side effects from frontend/src/lib/models/resource.ts"
Task: "Extract typed adapter helpers to frontend/src/lib/models/project-view-adapter.ts and remove as any usage from frontend/src/lib/models/project-view.ts"
Task: "Extract template scanning and validation to frontend/src/lib/models/template-service.ts from frontend/src/lib/models/resource-templates.ts"

# In parallel on the slice side:
Task: "Extract transport and normalization helpers to frontend/src/store/revision-transport-service.ts and frontend/src/store/revision-normalization.ts from frontend/src/store/revisionsSlice.ts"
Task: "Add frontend/src/store/project-actions-controller.ts and move delete/rename orchestration out of frontend/src/store/projectsSlice.ts"
```

---

## Parallel Example: User Story 3

```bash
# Track C project-types extraction:
Task: "Extract frontend/components/project-types/ProjectTypeDraftService.ts and frontend/components/project-types/ProjectTypeListPane.tsx from frontend/components/project-types/ProjectTypesManagerPage.tsx"
Task: "Extract frontend/components/project-types/ProjectTypeEditorForm.tsx and wire it to frontend/components/project-types/ProjectTypeDraftService.ts"

# Track A shell extraction:
Task: "Extract frontend/components/Layout/ShellLayoutController.tsx and frontend/components/Layout/ShellSettingsMenu.tsx from frontend/components/Layout/AppShell.tsx"
Task: "Extract frontend/components/Layout/ShellModalCoordinator.tsx and frontend/components/Layout/ShellProjectTypeLoader.tsx from frontend/components/Layout/AppShell.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: Run the model/slice regression suite and confirm selector/API surfaces remain stable.
5. Proceed to invariant-sensitive UI seams only after US1 is green.

### Incremental Delivery

1. Deliver US1 to freeze shared contracts.
2. Deliver US2 to separate revision and tree workflows from rendering.
3. Deliver US3 to decompose the large shell surfaces.
4. Deliver US5 to prove invariants still hold across the critical seams.
5. Deliver US4 as the independent lower-risk cleanup track.
6. Finish with Phase 8 full validation and cleanup.

### Parallel Team Strategy

1. One pair handles Phase 1 and Phase 2 shared verification setup.
2. After Foundational is complete:
    - Developer A: Track A foundation in US1, then EditView in US2.
    - Developer B: Track B foundation in US1, then ResourceTree in US2.
    - Developer C: Track C template-service handoff in US1, then ProjectTypesManagerPage in US3.
    - Developer D: Track D/E low-risk surfaces in US4 once shared baselines are stable.
3. Rejoin on US5 invariant proof and Phase 8 validation.

---

## Notes

- [P] tasks are parallelizable because they touch different files or independent track segments.
- The execution blueprint in `specs/004-frontend-drift-coherence/execution-blueprint.md` overrides any conflicting convenience sequencing.
- `schemas.ts` is intentionally not a task target because the blueprint marks it as stable authority.
- DF-004 modal internals and DF-005 metadata sidebar cleanup are deliberately excluded from this task list.
