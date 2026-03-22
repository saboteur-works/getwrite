# Feature Specification: Refactor Frontend App Trouble Spots

**Feature Branch**: `005-refactor-app-trouble-spots`  
**Created**: 2026-03-20  
**Status**: Draft  
**Input**: User description: "Refactor frontend app trouble spots following the drift-coherence blueprint, addressing identified hotspots while preserving product invariants and behavior"

**Context**: This spec executes the refactor work planned in [spec 004](../004-frontend-drift-coherence/spec.md). It omits implementation details which will be produced in the planning phase.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Refactor Model Utilities and Redux Foundation (Priority: P1)

As a developer working on the frontend, I want the model layer and Redux slices to have clear responsibilities and explicit contracts so future extractions and component updates are safe and do not propagate invalid data shapes downstream.

**Why this priority**: Model utilities and Redux slices are prerequisites for all downstream component refactors. Stabilizing them first removes blast radius from later work and makes invariant violations visible early.

**Independent Test**: Verify that model factories validate all return objects through the canonical schema, all Redux selectors return stable typed shapes, and all `as any` casts have been eliminated from the model and slice paths.

**Acceptance Scenarios**:

1. **Given** a model factory, **When** it returns an object, **Then** that object has been validated through the schema before return.
2. **Given** a Redux slice with batch-update reducers, **When** the reducer processes multiple updates, **Then** it uses efficient lookup (Map-based) for O(1) identity operations rather than repeated array searches.
3. **Given** a component that needs model-derived data, **When** it calls a Redux selector, **Then** the selector returns a stable typed value without requiring casts.
4. **Given** a template scanning operation, **When** it loads and transforms template data, **Then** the output shape matches the current API contract exactly.

---

### User Story 2 - Stabilize Revision and Resource Workflows (Priority: P1)

As a user editing a document, I want the autosave, revision tracking, and resource tracking to work identically to today while having clean responsibility boundaries so bugs in one area cannot silently cascade to others.

**Why this priority**: Revisions and resources are protected invariants that directly impact data integrity. Refactoring them without behavior change requires explicit guardrails on every extraction boundary.

**Independent Test**: Verify that canonical revision invariants (only one revision per resource, no skipped version numbers) remain assertable, EditView save-on-blur timing is unchanged, and ResourceTree drag-drop identity preservation works identically.

**Acceptance Scenarios**:

1. **Given** a resource with multiple revisions, **When** any operation marks a revision canonical, **Then** only that revision has `canonical: true`, and at most one other revision can hold the flag globally.
2. **Given** a user typing in the editor and then navigating away, **When** blur fires, **Then** the pending content is flushed in the same lifecycle tick as the current implementation.
3. **Given** a resource in the tree that is dragged to a new parent, **When** the drag completes, **Then** the resource's stable `id` is preserved and references from other parts of the UI resolve correctly.
4. **Given** a project mutation (rename or delete), **When** it completes, **Then** it calls the same API endpoints with the same payload shape as before.

---

### User Story 3 - Decompose App Shell and Project Types Manager (Priority: P1)

As a maintainer, I want the AppShell and ProjectTypesManagerPage to be split into focused, single-responsibility units so layout changes, modal orchestration, settings management, and project-type loading can be understood and modified independently.

**Why this priority**: AppShell has grown to over 1400 lines combining layout, settings, modals, and project-type loading. ProjectTypesManagerPage mixes form editing, validation, and template persistence. Splitting them reduces cognitive load and blast radius for future changes while preserving identical user-facing behavior.

**Independent Test**: Verify that layout resizing, settings updates, all four modal flows, and project-type data propagation work identically to today, and that each extracted unit has a single clear responsibility.

**Acceptance Scenarios**:

1. **Given** a user resizing the editor panel, **When** the resize handle is dragged, **Then** the layout dimensions change identically to the current behavior, and no other component state is affected.
2. **Given** a user opening the settings panel and changing appearance preferences, **When** the change is saved, **Then** the preference is persisted and applied identically to today.
3. **Given** a user clicking a button to open a modal (CreateModal, ExportModal, CompileModal, or ContextAction), **When** the trigger fires, **Then** the modal opens at the same trigger point with the same props as before.
4. **Given** the application loading, **When** it fetches project types, **Then** the data is propagated to child routes in the same shape as the current API response.
5. **Given** a user editing a project template in the manager, **When** the template is saved, **Then** workspace folders are created with the same structure as before, with no missing or corrupted entries.

---

### User Story 4 - Consolidate Menu and Help Surfaces (Priority: P2)

As a maintainer, I want editor menu commands and help page content to be extracted from their current locations into coherent modules with clear data contracts so future menu or help changes do not require searching through multiple files.

**Why this priority**: MenuBar and HelpPage have duplication and unclear ownership. Extracting them second (after foundational work) removes scattered tooling dependencies and improves discoverability without blocking critical-path refactors.

**Independent Test**: Verify that all current editor commands remain available, menu styling behaves identically, help content displays without missing sections or broken links, and help modal can be opened and closed identically to today.

**Acceptance Scenarios**:

1. **Given** a user triggering an editor command (bold, italic, link, etc.), **When** the command is applied, **Then** the action completes identically to the current behavior.
2. **Given** the editor toolbar with color and highlight submenus, **When** a user selects a color, **Then** the text color matches the selected value exactly.
3. **Given** a user opening the help modal, **When** content renders, **Then** all text, sections, and links display identically to today.
4. **Given** a user pressing Escape or clicking the help modal close button, **When** the dismissal fires, **Then** the modal closes identically to the current behavior.

---

### User Story 5 - Maintain Product Invariants Throughout (Priority: P1)

As a product manager, I want all refactor work to preserve workspace behavior, revision integrity, resource identity, and styling consistency so end-user experience and data reliability remain unchanged.

**Why this priority**: Product invariants are non-negotiable. Every refactor must explicitly preserve the guarantees defined in the product specification.

**Independent Test**: Verify through behavior-preserving guardrails that workspace folder creation, canonical revision enforcement, resource identity stability, and token-first styling are all maintained throughout all refactoring work.

**Acceptance Scenarios**:

1. **Given** any refactored component or slice, **When** the code is reviewed, **Then** the refactor includes explicit guardrails that preserve the relevant product invariants.
2. **Given** a new workspace being created with templates, **When** the workspace loads, **Then** folder structures match existing behavior.
3. **Given** styling changes during component migration, **When** migrations apply token-first patterns, **Then** no raw Tailwind utilities appear on refactored host elements.

### Edge Cases

- A hotspot refactor touches a protected invariant boundary → guardrails and verification gates must be explicit before implementation begins.
- Multiple parallel tracks need to wait on a shared dependency → the dependency must be prioritized and completed before dependent work proceeds.
- A refactored component exports its props interface → the interface must remain stable for consumers during and after the refactor.
- A Redux slice selector changes return type → all components using that selector must be updated in the same change set to maintain type safety.
- Modal behavior is dependent on orchestration → the orchestrator must be extracted and tested before any modal component changes.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST refactor the model utilities layer (`resource-templates` / `resource.ts`, `uuid.ts`) using typed factories and schema validation such that every factory return is validated and no untyped (`as any`) casts remain in the extracted seam.
- **FR-002**: The system MUST refactor `revisionsSlice` to make the canonical-revision invariant explicit and testable in isolation, and all existing selectors must return identically-shaped data after extraction.
- **FR-003**: The system MUST refactor `projectsSlice` to isolate project mutation logic and state normalization such that all existing API calls and selector shapes are preserved identically.
- **FR-004**: The system MUST refactor `EditView` to isolate revision I/O and autosave concerns from the UI layer, preserving save-on-blur timing and canonical-revision semantics.
- **FR-005**: The system MUST refactor `ResourceTree` to isolate tree-adapter logic, drag-drop reparenting, and selection synchronization such that resource identity is preserved through all operations.
- **FR-006**: The system MUST refactor `ProjectTypesManagerPage` to decompose form editing, validation, template scanning, and workspace-seeding logic while preserving workspace folder structure and template-change semantics.
- **FR-007**: The system MUST refactor `AppShell` by extracting layout resizing, settings management, modal orchestration, and project-type loading into focused units that compose into a thin coordinator shell.
- **FR-008**: The system MUST refactor `MenuBar` to consolidate duplicated menu-command wiring and exports into a single data-driven command schema with identical cmd behavior.
- **FR-009**: The system MUST refactor `HelpPage` to extract help content and modal lifecycle into focused units such that rendering and dismissal behavior are identical to today.
- **FR-010**: The system MUST apply the style contract derived in spec 004 to all refactored code, enforcing token-first styling and eliminating raw Tailwind utilities on layout and component hosts.
- **FR-011**: The system MUST execute refactors in the prioritized sequence and parallel tracks defined in the execution blueprint to minimize external dependencies and blocking work.
- **FR-012**: The hotspots `DF-004` (modal flows) and `DF-005` (sidebar metadata) are explicitly deferred and are not included in the scope of this feature; they will be addressed opportunistically after core tracks complete.

### Key Entities _(include if feature involves data)_

- **Refactor Seam**: A decomposition boundary within a hotspot component, slice, or utility that extracts a focused responsibility into a new unit while preserving public API shape.
- **Behavior Guardrail**: An explicit requirement that a refactored unit must preserve identical user-facing behavior, Redux contract, or API shape to the original.
- **Execution Track**: A sequence of hotspots ordered to maximize parallelization and minimize blocking dependencies.
- **Product Invariant**: A protected property of the system that must remain unchanged: workspace behavior, canonical revisions, resource identity, compile safety, token-first styling.
- **Drift Hotspot**: A frontend domain identified in spec 004 analysis where structure or responsibility has materially diverged from intended patterns, identified by finding number `DF-###`.

## Assumptions

- This feature refactors identified hotspots without changing user-facing behavior or adding new features.
- All refactored code must preserve the style contract rules and anti-patterns established in spec 004.
- Product invariants defined in the application specification remain authoritative and non-negotiable throughout this work.
- Parallel execution tracks (A–E) can proceed independently after shared dependencies (`resource-templates` and `schemas.ts`) are stabilized.
- The behavior guardrails from the execution blueprint are the definition of "done" for each hotspot refactor.
- TypeScript compilation must succeed and type safety must improve after each refactor step.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of 9 in-scope hotspots (DF-001, DF-002, DF-003, DF-006, DF-007, DF-008, DF-009, DF-010, and the template-service prerequisite) are refactored to completion as defined in execution blueprint seams.
- **SC-002**: 100% of refactored hotspots pass their behavior-preserving guardrails and can be verified against the verification gates defined in the execution blueprint.
- **SC-003**: Zero instances of raw Tailwind utilities remain on refactored component/layout host elements; all styling uses token-backed class names or shared semantic BEM-style sheets.
- **SC-004**: Zero `as any` casts remain in the model utilities (`resource-templates`, `resource.ts`, `uuid.ts`) seam paths.
- **SC-005**: All TypeScript compilation errors caused by refactors are resolved; the codebase maintains or improves type safety throughout the work.
- **SC-006**: All Redux selectors return identically shaped data, and all new Redux hooks use the typed `useAppSelector`/`useAppDispatch` from `hooks.ts` without raw Redux imports.
- **SC-007**: Product invariants (workspace behavior, canonical revisions, resource identity, styling consistency) remain intact and can be demonstrated through explicit verification.
- **SC-008**: The refactored codebase achieves coherence with the style contract rules derived in spec 004, as demonstrated by spot-check reviews of refactored units against keep-rules and anti-patterns.

## Non-Functional Requirements

- **Performance**: All refactors must preserve or improve runtime performance. Batch-update reducers must use efficient lookup patterns (Map-based for O(1) identity operations). No new expensive selectors or watchers may be introduced.
- **Scalability**: The refactored structure must scale as the frontend surface grows. Redux slices must remain single-purpose and composable.
- **Reliability & Availability**: All refactored code must maintain the same error handling and resilience characteristics as the original. Retry logic, timeout handling, and fallback behavior must be preserved.
- **Security & Privacy**: No new data exposure or validation bypass is introduced. Schema validation gates remain as the source of truth for model safety.
- **Observability**: Refactored modules must expose the same debugging surface (selectors, hooks, events) as originals, or behavior-equivalent alternatives.
- **Browser & Device Support**: Token-based styling must maintain existing responsiveness and accessibility. WCAG compliance and mobile behavior are unchanged.
- **Data Storage & Migration**: No changes to schemas, persistence layer, or API contracts. All refactors are strictly internal reorganization.
