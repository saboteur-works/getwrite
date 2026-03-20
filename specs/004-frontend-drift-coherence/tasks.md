# Tasks: Frontend Drift Analysis and Coherence Baseline

**Input**: Design documents from `/specs/004-frontend-drift-coherence/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Runtime test-writing tasks are out of scope for this planning-only feature because this feature creates documentation artifacts only and does not change executable runtime behavior. To satisfy the constitution's "where practical" test requirement, this task set includes automated consistency validation tasks for generated artifacts and explicit definition of future implementation test gates.

**Organization**: Tasks are grouped by user story to enable independent completion and review of drift discovery, style-conformance guidance, and execution-readiness outputs.

## Phase 1: Setup (Shared Artifact Structure)

**Purpose**: Create the artifact files and directories that the analysis will fill.

- [x] T001 Create the planning artifact files `specs/004-frontend-drift-coherence/drift-inventory.md`, `specs/004-frontend-drift-coherence/style-contract.md`, `specs/004-frontend-drift-coherence/execution-blueprint.md`, and `specs/004-frontend-drift-coherence/verification-gates.md`
- [x] T002 Create the hotspot seam directory `specs/004-frontend-drift-coherence/seams/` and the seam documents `specs/004-frontend-drift-coherence/seams/AppShell.md`, `specs/004-frontend-drift-coherence/seams/resource-templates.md`, `specs/004-frontend-drift-coherence/seams/ProjectTypesManagerPage.md`, `specs/004-frontend-drift-coherence/seams/revisionsSlice.md`, `specs/004-frontend-drift-coherence/seams/EditView.md`, `specs/004-frontend-drift-coherence/seams/ResourceTree.md`, `specs/004-frontend-drift-coherence/seams/HelpPage.md`, `specs/004-frontend-drift-coherence/seams/MenuBar.md`, and `specs/004-frontend-drift-coherence/seams/projectsSlice.md`

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the shared structure and rubrics that all later analysis artifacts depend on.

**⚠️ CRITICAL**: No user story work should begin until these shared definitions exist.

- [x] T003 Define the shared drift taxonomy, risk rubric, invariant-impact legend, and domain coverage table structure in `specs/004-frontend-drift-coherence/drift-inventory.md`, including explicit `High` criteria: invariant impact not `none` or cross-domain blast radius.
- [x] T004 [P] Define the exemplar capture format, rule categories, and anti-pattern sections in `specs/004-frontend-drift-coherence/style-contract.md`
- [x] T005 [P] Define the common section structure for sequencing, non-goals, guardrails, and verification criteria in `specs/004-frontend-drift-coherence/execution-blueprint.md` and `specs/004-frontend-drift-coherence/verification-gates.md`

**Checkpoint**: The shared planning structure is in place and user-story artifact work can proceed.

---

## Phase 3: User Story 1 - Identify Drift Clearly (Priority: P1) 🎯 MVP

**Goal**: Produce a complete frontend drift report that identifies material drift, explains risk, and records domain coverage.

**Independent Test**: Review `specs/004-frontend-drift-coherence/drift-inventory.md` and confirm every major frontend domain is covered, each material hotspot is explained, and risk plus invariant impact are clearly assigned.

### Implementation for User Story 1

- [x] T006 [P] [US1] Document drift findings for app shell, work area/editor, resource tree, modal flows, and sidebar metadata domains in `specs/004-frontend-drift-coherence/drift-inventory.md`
- [x] T007 [P] [US1] Document drift findings for model utilities, Redux slices, project types manager, help surface, and editor menu duplication in `specs/004-frontend-drift-coherence/drift-inventory.md`
- [x] T008 [US1] Rank all documented findings and annotate each with drift type, risk level, invariant impact, evidence summary, and recommended direction in `specs/004-frontend-drift-coherence/drift-inventory.md`
- [x] T009 [US1] Complete the domain coverage table and add explicit `no material drift` notes for any in-scope domain without a hotspot in `specs/004-frontend-drift-coherence/drift-inventory.md`

**Checkpoint**: User Story 1 is complete when the drift inventory alone can guide hotspot prioritization without requiring additional clarification.

---

## Phase 4: User Story 2 - Preserve the Intended Style (Priority: P2)

**Goal**: Derive a repository-grounded style contract that future refactors can follow.

**Independent Test**: Review `specs/004-frontend-drift-coherence/style-contract.md` and confirm it names concrete exemplar files, extracts actionable keep-rules and anti-patterns, and preserves token-first styling direction.

### Implementation for User Story 2

- [x] T010 [P] [US2] Capture exemplar observations from `frontend/src/lib/models/revision-manager.ts`, `frontend/src/lib/models/resource.ts`, `frontend/src/lib/models/schemas.ts`, and `frontend/src/lib/models/uuid.ts` in `specs/004-frontend-drift-coherence/style-contract.md`
- [x] T011 [P] [US2] Capture exemplar observations from `frontend/src/store/resourcesSlice.ts`, `frontend/src/store/store.ts`, `frontend/src/store/hooks.ts`, `frontend/src/lib/projectTypes.ts`, `frontend/src/lib/toast-service.ts`, `frontend/components/Sidebar/controls/MultiSelectList.tsx`, and `frontend/components/common/ConfirmDialog.tsx` in `specs/004-frontend-drift-coherence/style-contract.md`
- [x] T012 [US2] Convert exemplar observations into keep-rules and anti-patterns for type safety, module responsibility, state management, error handling, React component shape, and styling in `specs/004-frontend-drift-coherence/style-contract.md`
- [x] T013 [US2] Add tie-breaker guidance that resolves conflicting examples in favor of product invariants, repository standards, and token-first consistency in `specs/004-frontend-drift-coherence/style-contract.md`

**Checkpoint**: User Story 2 is complete when maintainers can choose between competing refactor options by consulting the style contract alone.

---

## Phase 5: User Story 3 - Move from Analysis to Action (Priority: P3)

**Goal**: Turn the drift and style findings into a behavior-preserving execution blueprint with clear verification gates.

**Independent Test**: Review `specs/004-frontend-drift-coherence/seams/*.md`, `specs/004-frontend-drift-coherence/execution-blueprint.md`, and `specs/004-frontend-drift-coherence/verification-gates.md` and confirm the future refactor work is ordered, scoped, and reviewable.

### Implementation for User Story 3

- [x] T014 [P] [US3] Define refactor seams, dependency order, blast radius, and public-behavior guardrails in `specs/004-frontend-drift-coherence/seams/AppShell.md`, `specs/004-frontend-drift-coherence/seams/EditView.md`, and `specs/004-frontend-drift-coherence/seams/ResourceTree.md`
- [x] T015 [P] [US3] Define refactor seams, dependency order, blast radius, and public-behavior guardrails in `specs/004-frontend-drift-coherence/seams/resource-templates.md`, `specs/004-frontend-drift-coherence/seams/revisionsSlice.md`, and `specs/004-frontend-drift-coherence/seams/projectsSlice.md`
- [x] T016 [P] [US3] Define refactor seams, dependency order, blast radius, and public-behavior guardrails in `specs/004-frontend-drift-coherence/seams/ProjectTypesManagerPage.md`, `specs/004-frontend-drift-coherence/seams/HelpPage.md`, and `specs/004-frontend-drift-coherence/seams/MenuBar.md`
- [x] T017 [US3] Add style-alignment mappings from `specs/004-frontend-drift-coherence/style-contract.md` to every seam document in `specs/004-frontend-drift-coherence/seams/*.md`
- [x] T018 [US3] Build the prioritized hotspot order, dependency graph, parallel execution tracks, and explicit non-goals in `specs/004-frontend-drift-coherence/execution-blueprint.md`
- [x] T019 [US3] Add per-hotspot behavior guardrails and rationale for sequencing choices in `specs/004-frontend-drift-coherence/execution-blueprint.md`
- [x] T020 [US3] Define per-hotspot verification gates, including future test targets, manual checks (explicit accessibility and responsiveness checks), invariant checks, and artifact checks, in `specs/004-frontend-drift-coherence/verification-gates.md`

**Checkpoint**: User Story 3 is complete when reviewers can sequence and evaluate future refactor initiatives without inventing new criteria.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Ensure the generated planning artifacts are internally consistent and ready for task execution.

- [x] T021 [P] Reconcile terminology, cross-links, and scope statements across `specs/004-frontend-drift-coherence/spec.md`, `specs/004-frontend-drift-coherence/plan.md`, `specs/004-frontend-drift-coherence/research.md`, `specs/004-frontend-drift-coherence/data-model.md`, `specs/004-frontend-drift-coherence/quickstart.md`, `specs/004-frontend-drift-coherence/contracts/openapi.yaml`, and the generated analysis artifacts in `specs/004-frontend-drift-coherence/`
- [x] T022 Run the quickstart validation workflow in `specs/004-frontend-drift-coherence/quickstart.md` and perform a final completeness review against the success criteria in `specs/004-frontend-drift-coherence/spec.md`
- [x] T023 [P] Add and run an automated artifact-consistency check (headings/required sections/cross-link presence) over `specs/004-frontend-drift-coherence/*.md` and `specs/004-frontend-drift-coherence/seams/*.md`, then record outcomes in `specs/004-frontend-drift-coherence/verification-gates.md`
- [x] T024 Add a security/privacy confirmation section to `specs/004-frontend-drift-coherence/verification-gates.md` that verifies the analysis process is local-only and does not require exposing project content outside the repository context

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational completion.
- **User Story 2 (Phase 4)**: Depends on Foundational completion and can proceed in parallel with User Story 1.
- **User Story 3 (Phase 5)**: Depends on User Story 1 and User Story 2 because blueprinting requires both drift findings and style rules.
- **Polish (Phase 6)**: Depends on completion of all selected user stories.

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies beyond Foundational.
- **User Story 2 (P2)**: No dependencies beyond Foundational.
- **User Story 3 (P3)**: Depends on outputs from US1 and US2.

### Parallel Opportunities

- `T004` and `T005` can run in parallel once `T003` establishes the shared structure.
- `T006` and `T007` can run in parallel because they cover different domain groups in `specs/004-frontend-drift-coherence/drift-inventory.md`.
- `T010` and `T011` can run in parallel because they analyze different exemplar groups in `specs/004-frontend-drift-coherence/style-contract.md`.
- `T014`, `T015`, and `T016` can run in parallel because they cover different hotspot seam groups in separate files under `specs/004-frontend-drift-coherence/seams/`.
- `T021` can run in parallel with final cleanup of `T020` if artifact content is otherwise stable.
- `T023` and `T024` can run in parallel after `T020` because they extend verification coverage without altering seam definitions.

## Parallel Example: User Story 1

```bash
Task: "Document drift findings for app shell, work area/editor, resource tree, modal flows, and sidebar metadata domains in specs/004-frontend-drift-coherence/drift-inventory.md"
Task: "Document drift findings for model utilities, Redux slices, project types manager, help surface, and editor menu duplication in specs/004-frontend-drift-coherence/drift-inventory.md"
```

## Parallel Example: User Story 2

```bash
Task: "Capture exemplar observations from frontend/src/lib/models/revision-manager.ts, frontend/src/lib/models/resource.ts, frontend/src/lib/models/schemas.ts, and frontend/src/lib/models/uuid.ts in specs/004-frontend-drift-coherence/style-contract.md"
Task: "Capture exemplar observations from frontend/src/store/resourcesSlice.ts, frontend/src/store/store.ts, frontend/src/store/hooks.ts, frontend/src/lib/projectTypes.ts, frontend/src/lib/toast-service.ts, frontend/components/Sidebar/controls/MultiSelectList.tsx, and frontend/components/common/ConfirmDialog.tsx in specs/004-frontend-drift-coherence/style-contract.md"
```

## Parallel Example: User Story 3

```bash
Task: "Define refactor seams in specs/004-frontend-drift-coherence/seams/AppShell.md, specs/004-frontend-drift-coherence/seams/EditView.md, and specs/004-frontend-drift-coherence/seams/ResourceTree.md"
Task: "Define refactor seams in specs/004-frontend-drift-coherence/seams/resource-templates.md, specs/004-frontend-drift-coherence/seams/revisionsSlice.md, and specs/004-frontend-drift-coherence/seams/projectsSlice.md"
Task: "Define refactor seams in specs/004-frontend-drift-coherence/seams/ProjectTypesManagerPage.md, specs/004-frontend-drift-coherence/seams/HelpPage.md, and specs/004-frontend-drift-coherence/seams/MenuBar.md"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Stop and validate that `specs/004-frontend-drift-coherence/drift-inventory.md` independently satisfies the P1 acceptance scenarios.

### Incremental Delivery

1. Complete Setup + Foundational to establish the analysis framework.
2. Deliver User Story 1 to make drift visible and actionable.
3. Deliver User Story 2 to define the style target the future refactor must preserve.
4. Deliver User Story 3 to sequence the future refactor work and define verification gates.
5. Complete the cross-cutting review to ensure all artifacts remain aligned.

### Parallel Team Strategy

1. One contributor establishes Setup + Foundational structure.
2. After that:
    - Contributor A: User Story 1 drift findings.
    - Contributor B: User Story 2 exemplar harvesting and style rules.
3. Once both are complete, contributors can split hotspot seam documents in parallel while one contributor assembles the blueprint and verification gates.

## Notes

- [P] tasks indicate work that can proceed independently in different files or clearly partitioned sections.
- Each user story is independently reviewable and delivers standalone value.
- User Story 3 intentionally depends on the completion of User Story 1 and User Story 2 because action planning must be grounded in both drift evidence and style guidance.
- This task list covers planning artifacts only; runtime refactor implementation is out of scope for this feature.
