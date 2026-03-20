# Implementation Plan: Frontend Drift Analysis and Coherence Baseline

**Branch**: `004-frontend-drift-coherence` | **Date**: 2026-03-20 | **Spec**: [specs/004-frontend-drift-coherence/spec.md](specs/004-frontend-drift-coherence/spec.md)
**Input**: Feature specification from `/specs/004-frontend-drift-coherence/spec.md`

## Summary

Produce a frontend-only drift-analysis plan that inventories structural drift, derives target style from strong in-repo exemplars, and turns the results into a prioritized refactor blueprint with explicit verification gates. The work remains analysis-and-planning only: no refactor implementation is included in this feature, and all conclusions must preserve product invariants defined by the app spec and token-first styling direction.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node 22.16.0, Markdown/OpenAPI artifacts  
**Primary Dependencies**: Next.js 16.1.6, React 19.2.4, Redux Toolkit 2.11.2, Zod 4.3.6, Vitest 4.0.18, Playwright 1.58.2  
**Storage**: Repository-local planning artifacts under `specs/004-frontend-drift-coherence/`; source evidence from `frontend/`, `docs/`, and `experiments-nopush/`  
**Testing**: Specification checklist review; later implementation verification gates reference `pnpm test:ci <target>` from repo root after `nvm use 22.16.0`, plus Playwright/manual UI checks where applicable  
**Target Platform**: Local-first web application development workflow on the existing `frontend/` Next.js app  
**Project Type**: Web application (frontend-analysis only)  
**Performance Goals**: Analysis remains practical to execute in a normal development session; generated blueprint must preserve existing responsiveness and avoid recommending behavior changes that degrade core workflows  
**Constraints**: Must not implement refactors in this phase; must preserve Workspace, revision/canonical, resource-identity, and compile invariants; must preserve token-first styling direction; must stay scoped to `/frontend` plus authority documents  
**Scale/Scope**: First-pass analysis of the `frontend/` surface and associated standards/tome references, resulting in drift findings, style rules, execution sequencing, and verification guidance

## Deployment Checklist (web apps)

- Target environments: MVP local only. No deployment environment changes are required because this feature produces repository artifacts only.
- Migration plan: No runtime schema or persisted-user-data migration. Artifact migration is additive inside `specs/004-frontend-drift-coherence/`.
- Feature flag strategy: Not applicable. This feature does not introduce runtime behavior.
- Infra changes: None.
- Smoke tests: Artifact completeness review, specification checklist completion, and validation that the blueprint preserves product invariants and frontend scope.
- Rollback plan: Revert the planning artifacts on this branch if the plan is found to be incomplete or misleading.
- Monitoring & Alerts: Not applicable for planning artifacts. Reviewers use artifact completeness and standards alignment instead.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Pre-Phase 0 status: PASS

- Code Quality & Maintainability: PASS. The deliverables are explicit, reviewable artifacts with named outputs and bounded responsibility.
- Testing Standards: PASS. The plan defines future verification gates using repo-standard targeted test execution and manual/UI checks where appropriate.
- User Experience Consistency: PASS. The analysis is required to preserve existing UX behavior, accessibility expectations, and token-first styling coherence.
- Performance & Resource Constraints: PASS. The plan is local-first, avoids unnecessary runtime changes, and treats performance regressions as out of scope for this phase.
- MVP Simplicity & Incremental Design: PASS. Scope is intentionally limited to frontend analysis and sequencing; no backend, deployment, or implementation expansion is introduced.

Post-Phase 1 design status: PASS

- Research resolves scope and artifact questions without expanding feature scope.
- Data model, contracts, and quickstart retain artifact-only boundaries and preserve the same constitutional constraints.
- No constitutional violations require justification in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/004-frontend-drift-coherence/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── tasks.md
```

Planned analysis outputs produced after this plan:

```text
specs/004-frontend-drift-coherence/
├── drift-inventory.md
├── style-contract.md
├── execution-blueprint.md
├── verification-gates.md
└── seams/
    ├── AppShell.md
    ├── resource-templates.md
    ├── ProjectTypesManagerPage.md
    ├── revisionsSlice.md
    ├── EditView.md
    ├── ResourceTree.md
    ├── HelpPage.md
    ├── MenuBar.md
    └── projectsSlice.md
```

### Source Code (repository root)

```text
docs/
├── app-spec.md
└── standards/

experiments-nopush/
└── tome-*.md

frontend/
├── app/
├── components/
├── src/
│   ├── lib/
│   └── store/
└── tests/

specs/
└── 004-frontend-drift-coherence/
```

**Structure Decision**: Work is confined to planning artifacts under `specs/004-frontend-drift-coherence/` and evidence gathering from the existing `frontend/`, `docs/`, and `experiments-nopush/` directories. No source implementation changes are part of this plan phase.

## Phase 0 — Research Summary

Research outputs are recorded in [specs/004-frontend-drift-coherence/research.md](specs/004-frontend-drift-coherence/research.md). Key decisions:

1. Keep the first pass strictly frontend-only and use authority documents as constraints rather than as targets for refactor.
2. Treat repository-local artifacts as the primary output format so findings remain durable, reviewable, and offline-capable.
3. Use an explicit drift-classification model tied to invariant impact so prioritization is not based on file size alone.
4. Derive target style from existing exemplar code inside the repository instead of importing outside style conventions.
5. Define verification as a combination of artifact-completeness checks now and targeted test/manual gates for later implementation.

## Phase 1 — Design & Contracts

Phase 1 artifacts:

- [specs/004-frontend-drift-coherence/data-model.md](specs/004-frontend-drift-coherence/data-model.md)
- [specs/004-frontend-drift-coherence/contracts/openapi.yaml](specs/004-frontend-drift-coherence/contracts/openapi.yaml)
- [specs/004-frontend-drift-coherence/quickstart.md](specs/004-frontend-drift-coherence/quickstart.md)

Design decisions:

- The planning data model centers on `DriftFinding`, `DomainCoverage`, `StyleRule`, `RefactorSeam`, `ExecutionBlueprintItem`, and `VerificationGate`.
- The contract models the planning outputs as a consistent artifact-generation surface so later tasks can produce structured, reviewable outputs.
- The quickstart defines the operator workflow for generating drift findings, exemplar-based style rules, blueprint sequencing, and verification guidance.

## Post-Design Constitution Check

PASS

- All planned outputs remain documentation artifacts.
- No new runtime dependencies, deployment changes, or architectural expansion are introduced.
- Future implementation work remains explicitly deferred to tasks and later execution phases.

## Complexity Tracking

No constitutional violations identified.
