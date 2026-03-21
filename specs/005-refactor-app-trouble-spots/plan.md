# Implementation Plan: Refactor Frontend App Trouble Spots

**Branch**: `005-refactor-app-trouble-spots` | **Date**: 2026-03-20 | **Spec**: [specs/005-refactor-app-trouble-spots/spec.md](specs/005-refactor-app-trouble-spots/spec.md)
**Input**: Feature specification from `/specs/005-refactor-app-trouble-spots/spec.md`

**Authority**: [specs/004-frontend-drift-coherence/execution-blueprint.md](../004-frontend-drift-coherence/execution-blueprint.md) is the source of truth for hotspot sequencing, dependencies, parallel tracks, and behavior guardrails.

## Summary

Refactor 9 identified frontend hotspots (model utilities, Redux slices, EditView, ResourceTree, ProjectTypesManagerPage, AppShell, MenuBar, HelpPage, and template-service) according to the execution blueprint. All refactors preserve behavior identically while decomposing responsibilities, eliminating type-safety violations, and applying style-contract rules. Work proceeds in 5 parallel tracks with explicit guardrails preventing invariant regression.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node 22.16.0  
**Primary Dependencies**: Next.js 16.1.6, React 19.2.4, Redux Toolkit 2.11.2, Zod 4.3.6, TipTap Editor, Vitest 4.0.18, Playwright 1.58.2  
**Storage**: TypeScript source files under `frontend/`; no schema or persistence changes  
**Testing**: `pnpm test:ci <target>` for unit tests after `nvm use 22.16.0`; Playwright for UI behavior tests; manual verification against guardrails in quickstart  
**Target Platform**: Local-first Next.js 16 web application  
**Project Type**: Web application (frontend refactoring only)  
**Performance Goals**: Refactors must preserve or improve performance. Batch-update reducers must use efficient O(1) lookup patterns. New selectors must not add expensive watchers.  
**Constraints**: All refactors must preserve user-facing behavior, API contracts, Redux selector shapes, and product invariants (workspace, canonical revisions, resource identity, styling consistency). Zero `as any` casts permitted in model paths. Token-first styling enforced on refactored hosts.  
**Scale/Scope**: 9 frontend hotspots across model, state management, multi-view editor, tree, project-types UI, shell coordination, toolbar, and help surfaces, organized into 5 parallel execution tracks

## Authority Order

When implementing refactors, follow this authority order:

1. **Execution Blueprint** ([specs/004-frontend-drift-coherence/execution-blueprint.md](../004-frontend-drift-coherence/execution-blueprint.md)): Defines hotspot order, dependencies, parallel tracks, non-goals, and behavior guardrails for each seam.
2. **Seam Documents** (`specs/004-frontend-drift-coherence/seams/*.md`): Define exact decomposition boundaries and responsibility splits for each hotspot.
3. **Style Contract** ([specs/004-frontend-drift-coherence/style-contract.md](../004-frontend-drift-coherence/style-contract.md)): Defines keep-rules, anti-patterns, and exemplar-derived guidance for TypeScript, module responsibility, state management, React shape, and token-first styling.
4. **Specification** ([specs/005-refactor-app-trouble-spots/spec.md](specs/005-refactor-app-trouble-spots/spec.md)): User stories, acceptance scenarios, functional requirements, and success criteria.
5. **Existing repository code**: Patterns and conventions already established (prefer match over innovation).

## Deployment Checklist (web apps)

- Target environments: MVP local development only. No staged/production deploy is required; this is source refactoring within the existing app.
- Migration plan: No runtime schema, data, or API contract changes. Source-only refactoring with identical external behavior.
- Feature flag strategy: Not applicable. All refactors are internal; no feature-flag toggles needed.
- Infra changes: None.
- Smoke tests: Unit tests passing for refactored modules; Playwright UI tests demonstrating behavior parity with original; manual verification against guardrails checklist (quickstart).
- Rollback plan: Revert the feature branch if a refactored hotspot fails guardrails review or introduces type-safety regressions.
- Monitoring & Alerts: Not applicable for language changes. Runtime observability surface must remain identical after refactors (same debugging hooks, same Redux devtools shape, same error logging patterns).

## Constitution Check

_GATE: Must pass before Phase 1 design. Re-check after each track completes._

Pre-Phase 1 status: **PASS**

- **Code Quality & Maintainability**: PASS. Refactors decompose large files into focused units with single responsibilities, improving readability without changing behavior.
- **Testing Standards**: PASS. Behavior-preserving guardrails from the execution blueprint define testability criteria. Unit tests, type checks, and Playwright UI tests enforce parity with original.
- **User Experience Consistency**: PASS. All refactors explicitly preserve user-facing behavior, Redux state shape, and API contracts. Token-first styling is enforced on new/migrated code.
- **Performance & Resource Constraints**: PASS. Batch reducers use O(1) lookup (Map-based). No new expensive selectors or global watchers are introduced. Refactors may improve performance by eliminating unneeded renders.
- **MVP Simplicity & Incremental Design**: PASS. Refactors are staged in parallel tracks with clear dependencies, allowing incremental verification without blocking critical paths.

**Justification**: All refactors are internal reorganization with zero behavior change, making them lower-risk than feature additions. Constitution gates apply to complexity and new dependencies, neither of which are introduced here.

## Execution Tracks

The execution blueprint defines 5 parallel tracks plus two deferred hotspots:

| Track | Hotspots                                                        | Dependencies      | Status      |
| ----- | --------------------------------------------------------------- | ----------------- | ----------- |
| A     | resource-templates → revisionsSlice → EditView → AppShell       | schemas.ts stable | Not started |
| B     | resource-templates → projectsSlice → ResourceTree               | schemas.ts stable | Not started |
| C     | resource-templates → template-service → ProjectTypesManagerPage | schemas.ts stable | Not started |
| D     | MenuBar                                                         | None              | Not started |
| E     | HelpPage                                                        | None              | Not started |
| —     | DF-004 (modal flows), DF-005 (sidebar metadata)                 | Deferred          | Deferred    |

**Gate**: All tracks depend on `schemas.ts` stability. Refactors may not alter Zod schema definitions.

## Project Structure

### Documentation (this feature)

```text
specs/005-refactor-app-trouble-spots/
├── plan.md                          # This file
├── research.md                      # Phase 1 design research (dependencies, exemplars, constraints)
├── data-model.md                    # Phase 1 refactor artifact model (seams, guardrails, verification gates)
├── quickstart.md                    # Phase 1 verification checklist and guardrails reference
├── contracts/
│   └── openapi.yaml                 # Phase 1 API/Redux contract models (if applicable)
├── checklists/
│   └── requirements.md              # Spec quality validation
└── tasks.md                         # Phase 2 per-hotspot task breakdown
```

Analysis/blueprint sources (spec 004 authority):

```text
specs/004-frontend-drift-coherence/
├── execution-blueprint.md           # Hotspot order, dependencies, parallel tracks, guardrails
├── style-contract.md                # Keep-rules, anti-patterns, exemplar-derived guidance
├── verification-gates.md            # Post-implementation verification criteria
└── seams/
    ├── resource-templates.md
    ├── revisionsSlice.md
    ├── projectsSlice.md
    ├── EditView.md
    ├── ResourceTree.md
    ├── ProjectTypesManagerPage.md
    ├── AppShell.md
    ├── MenuBar.md
    └── HelpPage.md
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── lib/
│   │   ├── models/
│   │   │   ├── revision-manager.ts        # Will be part of revisionsSlice refactor
│   │   │   ├── resource.ts                # Will be part of resource-templates refactor
│   │   │   ├── schemas.ts                 # AUTHORITY — will not be altered
│   │   │   └── uuid.ts
│   │   ├── projectTypes.ts                # Will be extracted as template-service
│   │   └── toast-service.ts
│   ├── store/
│   │   ├── resourcesSlice.ts              # May be touched in ResourceTree refactor
│   │   ├── revisionsSlice.ts              # Track A refactor target
│   │   ├── projectsSlice.ts               # Track B refactor target
│   │   └── hooks.ts
│   └── (other services)
├── components/
│   ├── Layout/
│   │   └── AppShell.tsx                   # Track A final refactor target (1486 lines)
│   ├── WorkArea/
│   │   ├── EditView.tsx                   # Track A refactor target
│   │   └── Views/
│   │       └── OrganizerView/OrganizerView.tsx  # May be touched (has lodash drift)
│   ├── Sidebar/
│   │   └── ResourceTree.tsx               # Track B refactor target
│   │   └── controls/MetadataSidebar.tsx   # Deferred (DF-005)
│   ├── Editor/
│   │   └── MenuBar/                       # Track D refactor target
│   ├── project-types/
│   │   └── ProjectTypesManagerPage.tsx    # Track C refactor target
│   └── common/
│       └── (HelpPage location TBD)        # Track E refactor target
└── tests/
    └── (unit + e2e tests for refactored units)
```

**Structure Decision**: Refactors are confined to modifying existing TypeScript files within `frontend/` to decompose responsibilities, eliminate type-safety violations, and apply style rules. No new top-level packages or major reorganization is introduced. Seam boundaries follow the execution blueprint; responsibility splits are detailed in seam documents.

## Phase 0 — Research & Verification

**Output**: [specs/005-refactor-app-trouble-spots/research.md](research.md)

Verify that all preconditions for refactoring are met:

1. **Authority validation**: Read and confirm the execution blueprint, seam documents, and style contract are internally consistent and define clear decomposition boundaries.
2. **Dependency mapping**: Confirm all inter-hotspot dependencies are correctly ordered in the blueprint. Identify any circular dependencies or hidden coupling not captured in the seams.
3. **Exemplar verification**: For each style rule in the style contract, verify at least one exemplar exists in the codebase and matches the stated pattern.
4. **Test baseline**: Run `pnpm test:ci` and capture baseline coverage/passing counts for files that will be refactored. Verify Playwright tests pass for AppShell, EditView, ResourceTree, and ProjectTypesManagerPage.
5. **Invariant audit**: Walk through each protected invariant (workspace, canonical revisions, resource identity, styling) and document current implementation sites. Identify where guardrails must be added/enforced during refactors.
6. **Lodash drift inventory**: Identify all non-conformant lodash imports (full-package, utilities present in native equivalents) per tome-007 policy.
7. **Type-safety scan**: Identify all `as any` casts in model and adapter paths that must be eliminated.

**Gate**: Research must confirm no blocking issues exist. If preconditions are not met, pause and escalate before proceeding to Phase 1.

## Phase 1 — Design & Seam Planning

**Output**:

- [specs/005-refactor-app-trouble-spots/data-model.md](data-model.md)
- [specs/005-refactor-app-trouble-spots/quickstart.md](quickstart.md)
- [specs/005-refactor-app-trouble-spots/contracts/](contracts/) (if needed for Redux/API contract models)

Design decisions:

1. **Seam-by-seam breakdown**: For each hotspot, read the corresponding seam document and produce a decomposition plan that:
    - Names the new extracted units
    - Lists which files will be created/modified
    - Maps old responsibility clusters to new module boundaries
    - Identifies which guardrails apply to each extracted unit
    - Lists which style rules apply to new/modified code

2. **Dataflow mapping**: For each hotspot, document:
    - Input data sources (props, Redux selectors, API calls)
    - Output surfaces (return values, Redux actions, callbacks)
    - No data or responsibility flows should cross seam boundaries without being explicit

3. **Test strategy per track**: For each parallel track, design:
    - Unit tests that verify each new module meets its decomposition contract
    - Integration tests that verify seam boundaries work correctly (if touching store/hooks)
    - UI tests (Playwright) that verify behavior parity with original
    - Guardrail verification (checklist of invariant constraints to confirm after each refactor)

4. **Verification gates**: For each hotspot, operationalize the behavior guardrails from the execution blueprint:
    - What must be true before the refactor is considered done?
    - How is each guardrail verified (unit test, type check, manual review)?
    - When is a failure signal detected, what is the remediation?

**Deliverable**: data-model.md defines the refactor artifact model (hotspots, seams, guardrails, verification gates). quickstart.md is an operator's checklist for verifying each completed refactor against its guardrails.

## Phase 2 — Implementation & Verification

**Output**: [specs/005-refactor-app-trouble-spots/tasks.md](tasks.md)

Phase 2 is organized by execution tracks and explicit dependencies:

1. **Per-track task generation**: For each parallel track (A–E), break down the hotspots into granular, independent tasks:
    - Each task is a single seam extraction or component decomposition
    - Dependencies between tasks are explicit
    - Parallel tasks within a track are scheduled to minimize blocking

2. **Track A (Critical Path)**: resource-templates → revisionsSlice → EditView → AppShell
    - Longest dependency chain; contains two canonical-revision guardrails
    - Must complete before AppShell can be extracted
    - Tracks B and C run in parallel

3. **Tracks B & C (Parallel)**: Same gatekeeping (schemas.ts stable + resource-templates step 1), then:
    - Track B: projectsSlice → ResourceTree
    - Track C: template-service → ProjectTypesManagerPage
    - Merge into AppShell (step 4) once both are stable

4. **Tracks D & E (Opportunistic)**:
    - MenuBar and HelpPage can be scheduled anytime; no blocking dependencies
    - Good for pairing sessions or concurrent work while critical path is in flight

5. **Verification checklist**: Each task includes acceptance criteria referencing:
    - Behavior guardrails from the execution blueprint
    - Style-contract rules that must be applied
    - Type-safety checks (no `as any` regressions)
    - Playwright parity tests that confirm behavior matches original

**Deliverable**: tasks.md lists ~30–40 prioritized, independent tasks grouped by track with explicit sequencing, dependencies, and verification steps.

## Post-Implementation Constitution Re-check

After each track completes:

- Confirm refactored code maintains type-safety (TypeScript compilation succeeds; no `as any` regressions).
- Confirm all guardrails are satisfied (unit tests + Playwright tests pass).
- Confirm style-contract rules are applied (token-first, SR-### and AP-### rules followed).
- Confirm product invariants remain intact (manual spot-checks of workspace, canonical revision, resource identity, styling behavior).

If any violation is detected, the offending PR is not merged until remediated.

## Complexity Tracking

No constitutional violations. Refactors are internal reorganization with zero behavior change, zero new dependencies, zero architectural expansion. Risk is containment and type-safety preservation, both addressed by explicit guardrails and test/review gates.
