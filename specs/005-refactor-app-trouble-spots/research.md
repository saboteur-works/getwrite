# Research: Refactor Frontend App Trouble Spots

**Feature**: [specs/005-refactor-app-trouble-spots/spec.md](spec.md)  
**Plan**: [specs/005-refactor-app-trouble-spots/plan.md](plan.md)  
**Authority**: [specs/004-frontend-drift-coherence/execution-blueprint.md](../004-frontend-drift-coherence/execution-blueprint.md)

## Research Goals

This document captures verification that all preconditions for refactoring are met:

1. Authority documents (blueprint, seams, style contract) are internally consistent
2. Hotspot dependencies are correctly ordered
3. Style rules are grounded in exemplars
4. Test baselines are established
5. Product invariants are identified and guardable
6. Type-safety and lodash-drift violations are catalogued

## 1. Authority Validation

### Execution Blueprint Consistency

_Status_: To be completed in Phase 0

- [ ] Read [execution-blueprint.md](../004-frontend-drift-coherence/execution-blueprint.md) and confirm hotspot order makes sense
- [ ] Verify all 9 in-scope hotspots (DF-001, DF-002, DF-003, DF-006, DF-007, DF-008, DF-009, DF-010, template-service) have seam documents
- [ ] Confirm 5 execution tracks (A–E) and dependencies are clearly stated
- [ ] Verify 2 deferred hotspots (DF-004, DF-005) are explicitly excluded from scope
- [ ] Validate that all non-goals do not overlap with functional requirements (FR-001 through FR-012)

**Findings**: [to be filled during Phase 0]

### Seam Document Completeness

_Status_: To be completed in Phase 0

For each seam document under `specs/004-frontend-drift-coherence/seams/`:

- [ ] `resource-templates.md` — Check seam splits, dependency order, blast radius, guardrails, non-goals
- [ ] `revisionsSlice.md` — Canonical-revision guardrails present?
- [ ] `projectsSlice.md` — API shape preservation guardrails present?
- [ ] `EditView.md` — Save-on-blur timing guardrails present?
- [ ] `ResourceTree.md` — Identity preservation guardrails present?
- [ ] `ProjectTypesManagerPage.md` — Workspace folder guardrails present?
- [ ] `AppShell.md` — All four modal flows + save coordination guardrails present?
- [ ] `MenuBar.md` — Command parity guardrails present?
- [ ] `HelpPage.md` — Rendering and dismissal parity guardrails present?

**Findings**: [to be filled during Phase 0]

## 2. Dependency Mapping

### Blueprint Dependency Verification

_Status_: To be completed in Phase 0

- [ ] Confirm `schemas.ts` is the shared foundation (no hotspot modifies schemas)
- [ ] Confirm `resource-templates` step 1 gates all tracks
- [ ] Confirm `revisionsSlice` (step 2, Track A) gates both `EditView` and `AppShell`
- [ ] Confirm `projectsSlice` (step 2, Track B) gates `ResourceTree`
- [ ] Confirm `template-service` gates `ProjectTypesManagerPage` (Track C)
- [ ] Confirm `EditView` and `ProjectTypesManagerPage` (step 3) gate `AppShell` (step 4, Track A)
- [ ] Confirm `MenuBar` and `HelpPage` have no dependencies
- [ ] Identify any hidden dependencies not captured in the blueprint (e.g., shared utilities, shared hooks)

**Findings**: [to be filled during Phase 0]

## 3. Exemplar Verification

_Status_: To be completed in Phase 0

Verify the style contract keep-rules. For each rule in [specs/004-frontend-drift-coherence/style-contract.md](../004-frontend-drift-coherence/style-contract.md):

- [ ] SR-001 (Schema.parse before return) — exemplar EX-002b exists and matches pattern
- [ ] SR-002 through SR-032 (all keep-rules) — exemplar exists and code location is correct
- [ ] Anti-patterns AP-001 through AP-021 — current codebase violations identified
- [ ] Lodash rules (SR-032, SR-033) — current usage assessed (see Section 5)

**Rule Summary**:

- [ ] Type safety rules present
- [ ] Module responsibility rules present
- [ ] State management rules present
- [ ] React component shape rules present
- [ ] Token-first styling rules present
- [ ] Lodash policy rules present (path imports only, narrow allowlist)

**Findings**: [to be filled during Phase 0]

## 4. Test Baseline

_Status_: To be completed in Phase 0

### Unit Test Baseline

Run from repo root after `nvm use 22.16.0`:

```bash
pnpm test:ci
```

- [ ] Capture baseline passing count and coverage %
- [ ] Note which tests cover refactored modules (AppShell, EditView, ResourceTree, revisionsSlice, projectsSlice, etc.)
- [ ] Identify any pre-existing failures that must not regression during refactors

**Baseline Results**: [to be filled during Phase 0]

### UI Test Baseline (Playwright)

Run from repo root:

```bash
pnpm test:e2e
```

- [ ] Capture baseline test status (passing, failing, skipped)
- [ ] Identify tests that cover hotspot workflows (editor save, revision history, resource tree, project types, modals, menu)
- [ ] Note any platform-specific flakes or timeouts that may affect refactor verification

**Baseline Results**: [to be filled during Phase 0]

### Coverage Targets

- [ ] Set target for refactored modules: 80%+ line coverage (from baseline or higher)
- [ ] Guardrail verification requires >90% for invariant-sensitive paths (revisions, resources, workspace)
- [ ] Identify manually-tested behaviors that Playwright may not cover (e.g., accessibility, keyboard navigation)

## 5. Invariant Audit

### Workspace Invariant

_Status_: To be completed in Phase 0

Product requirement: Workspace is protected/fixed at first level; cannot rename/delete/move.

- [ ] Identify current implementation sites:
    - [ ] Where is Workspace created? (check projectTypes.ts, template-service, ProjectTypesManagerPage)
    - [ ] Where is Workspace validated? (check schemas.ts, validators)
    - [ ] Where is Workspace returned to UI? (check AppShell, ProjectTypesManagerPage)
- [ ] Document guardrails needed:
    - [ ] Template scanning must preserve Workspace folder structure
    - [ ] ProjectTypesManagerPage form validation must prevent Workspace rename/delete
    - [ ] New project creation must produce valid Workspace entry
- [ ] Test coverage:
    - [ ] Unit test for workspace-seeding on project creation
    - [ ] Unit test for template-validation rejecting invalid workspace changes

**Findings**: [to be filled during Phase 0]

### Canonical-Revision Invariant

_Status_: To be completed in Phase 0

Product requirement: Exactly one canonical revision per resource at all times; canonical cannot be deleted; revision numbers are linear (no gaps).

- [ ] Identify current implementation sites:
    - [ ] Where is `canonical: true` set? (check revisionsSlice, EditView autosave)
    - [ ] Where is `canonical: false` enforced on other revisions? (check revisionsSlice reducers)
    - [ ] Where is canonical deletion prevented? (check revisionsSlice guards)
    - [ ] Where is revision linearity checked? (check revisionsSlice selectors, guards)
- [ ] Document guardrails:
    - [ ] Only `revisionsSlice` may set/unset canonical flags
    - [ ] `EditView` autosave must not create a second canonical
    - [ ] Unit test `revision-canonical-guards.ts` must enforce 1-canonical-only assertion
    - [ ] Unit test must verify no version number gaps in revision history
- [ ] Test coverage:
    - [ ] Unit tests in revisionsSlice for canonical invariants
    - [ ] Playwright test of concurrent autosave edge case (if applicable)

**Findings**: [to be filled during Phase 0]

### Resource-Identity Invariant

_Status_: To be completed in Phase 0

Product requirement: Resource identity (id) survives moves/renames and is independent of path.

- [ ] Identify implementation sites:
    - [ ] Where is resource id assigned? (check models/resource.ts)
    - [ ] Where is id used for references? (check selectors, EditView route params, tree selection)
    - [ ] Where is path updated on move? (check resourcesSlice, ResourceTree drag-drop)
- [ ] Document guardrails:
    - [ ] Every drag-drop reparent must preserve resource.id
    - [ ] persistReorder payload must include stable ids, not paths
    - [ ] Selection state must sync via id, not path
    - [ ] Model factories must assign stable UUIDs
- [ ] Test coverage:
    - [ ] Unit test of ResourceTree reparent preserving id
    - [ ] Playwright test of tree drag-drop + editor selection sync

**Findings**: [to be filled during Phase 0]

### Styling Consistency (Token-First)

_Status_: To be completed in Phase 0

Product requirement: Components use design token utilities, not ad-hoc Tailwind or hard-coded values.

- [ ] Identify:
    - [ ] Where are existing token-backed utilities defined? (check frontend/styles/tokens.css, utilities.css)
    - [ ] Which refactored components will have styling changes? (AppShell, AppShell sub-units, ProjectTypesManagerPage)
    - [ ] Are there anti-patterns (raw Tailwind utilities, hard-coded colors) in hotspot files?
- [ ] Document guardrails:
    - [ ] No raw Tailwind utilities (`text-sm`, `px-4`, etc.) on refactored component hosts
    - [ ] Use token-backed utility classes (e.g., `appshell-*`, `workarea-*`) or semantic BEM-style classes
    - [ ] Dark-mode overrides use existing token-scoped patterns, not new base classes
- [ ] Test coverage:
    - [ ] CSS snapshot tests comparing refactored vs original styling
    - [ ] Playwright visual regression tests for layout and colors

**Findings**: [to be filled during Phase 0]

## 6. Type-Safety Scan

### `as any` Casts in Model & Adapter Paths

_Status_: To be completed in Phase 0

Lodash policy (tome-007): Path imports only, narrow allowlist. All type-unsafe casts must be eliminated.

Run:

```bash
grep -r "as any" frontend/src/lib/models/ frontend/components/*/adapter* --include="*.tsx" --include="*.ts"
```

- [ ] Identify all `as any` instances in:
    - [ ] `frontend/src/lib/models/`
    - [ ] `frontend/components/*/adapter*` files
    - [ ] `frontend/src/lib/project-view.ts` (mentioned in Blueprint guardrail)
- [ ] For each instance, determine whether it will be eliminated or justified in seam document

**Findings**: [to be filled during Phase 0]

### Lodash Drift Inventory

_Status_: To be completed in Phase 0

Policy from tome-007: Path imports only (`import debounce from 'lodash/debounce'`), narrow allowlist.

Run:

```bash
grep -r "from ['\"]lodash['\"]" frontend/src frontend/components --include="*.ts" --include="*.tsx"
```

- [ ] Identify all `from 'lodash'` (full-package imports — non-conformant)
- [ ] Identify all lodash usages not in the allowlist:
    - [ ] Allowed: `debounce`, `throttle`, `cloneDeep`, `uniq`, `uniqBy`, `groupBy`, `keyBy`, `chunk`, `difference`, `intersection`, `merge`
    - [ ] Not allowed: `map`, `find`, `filter`, `reduce`, `some`, `every` (use native equivalents)
    - [ ] Not allowed: Full-package imports of any kind
- [ ] Prioritize fixes for files being refactored (e.g., `OrganizerView.tsx` in ResourceTree track)

**Current Known Issues** (from tom-007):

- [ ] `OrganizerView.tsx`: `import { filter } from 'lodash'` — replace with native `array.filter()`
- [ ] `ResourceTree.tsx`: `import { uniq } from 'lodash'` — replace with path import or `[...new Set(arr)]`

**Findings**: [to be filled during Phase 0]

## 7. Verification Gates Summary

_Status_: To be completed in Phase 0

Operational criteria for deeming a refactor hotspot "complete":

1. **Type-safety**: TypeScript compilation succeeds; no new `as any` casts; type inference improvements verified
2. **Behavior preservation**: Unit tests and Playwright tests confirm identical user-facing behavior
3. **Guardrails met**: All behavior guardrails from execution blueprint are satisfied (see Section 5)
4. **Style contract applied**: Keep-rules followed; anti-patterns identified and corrected; token-first styling applied
5. **Code review**: Seam document is read and reviewers confirm decomposition matches the plan

**Verification Checklist** (to be captured in quickstart.md after Phase 0):

- [ ] Compilation clean (no TypeScript errors)
- [ ] Unit tests pass (90%+ coverage on guardrail-critical paths)
- [ ] Playwright tests pass (behavior parity verified)
- [ ] Guardrails checklist complete (invariants intact)
- [ ] Code style review (style-contract rules applied)
- [ ] Seam boundary review (decomposition matches plan)

## Summary

[To be completed after Phase 0 research is done]

All nine hotspots are ready for refactoring:

- [ ] Authorities are consistent and complete
- [ ] Dependencies are correctly ordered
- [ ] Test baselines are established
- [ ] Invariants are identified and guardable
- [ ] Type-safety and style issues are catalogued
- [ ] Verification gates are operational

**Release Gate**: Phase 1 design (data-model.md, quickstart.md) may begin only after this research is complete and any blocking issues are resolved.
