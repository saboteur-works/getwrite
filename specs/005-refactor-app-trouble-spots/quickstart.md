# Quickstart: Verification Checklist for Refactored Hotspots

**Feature**: [specs/005-refactor-app-trouble-spots/spec.md](spec.md)  
**Authority**: [specs/004-frontend-drift-coherence/execution-blueprint.md](../004-frontend-drift-coherence/execution-blueprint.md)

## Purpose

This document is an operator's checklist for verifying that each completed refactor hotspot meets its behavior-preservation guardrails. Use this after a PR is opened to confirm the refactor is complete before merging.

## Pre-Implementation Verification

Before starting any refactor work:

- [ ] Author has read the corresponding seam document (e.g., `seams/AppShell.md`)
- [ ] Author has read the execution blueprint sequencing
- [ ] Author has reviewed the style-contract rules that apply to the hotspot
- [ ] Author has confirmed no blocking dependencies remain (prerequisites are complete)
- [ ] Author has created a draft PR with a clear description of the seam extraction

### Phase 2 Foundational Entry Gates

Run from repo root after `nvm use 22.16.0`:

```bash
pnpm --filter getwrite-frontend run test:refactor:resource-templates
pnpm --filter getwrite-frontend run test:refactor:revisions
```

- [ ] T004 baseline coverage confirms resource factories, UUID generation, template dry-run planning, and project-type Workspace validation remain stable before seam extraction
- [ ] T005 baseline coverage confirms canonical revision reassignment, prune protection, reorder payload identity, and persisted order indexes remain stable before seam extraction
- [ ] T006 gate recording is updated in this document before Phase 3 or any downstream hotspot work begins

## Post-Implementation Verification by Hotspot

### Track A: resource-templates (DF-006)

**Precondition**: `schemas.ts` is unchanged (authority gate)

**Seam**: Model utilities extraction  
**Target**: `frontend/src/lib/models/resource.ts` and related factories

#### Compilation & Type Safety

- [ ] `pnpm tsc --noEmit` passes with zero errors
- [ ] No new `as any` casts introduced in extracted code
- [ ] Type inference on model returns improved (confirmed via type hints on function signatures)

#### Behavior Preservation

- [ ] All model factory return values are validated through `Schema.parse()` before return
- [ ] Factory signatures remain identical (no parameter additions/removals)
- [ ] Template scanning in `template-service` returns identical output shape

#### Style Contract Compliance

- [ ] Factory docstrings include `@param`, `@returns`, `@throws`, `@example` (SR-007)
- [ ] All timestamp operations use consistent `now = new Date().toISOString()` pattern (EX-002e)
- [ ] Schema inheritance uses `.extend()` for subtypes, not duplication (SR-003)
- [ ] Recursive schemas use `z.lazy()` with explicit type annotations (SR-004)

#### Unit Tests

```bash
pnpm test:ci frontend/src/lib/models
```

- [ ] All factory tests pass
- [ ] Validation-gate tests confirm no invalid objects escape factories
- [ ] Template scanning tests confirm output shape matches current implementation

#### Guardrail Verification

- [ ] **BR-RT-001**: `Schema.parse()` gates every factory return ✓
- [ ] **BR-RT-002**: Zero `as any` casts in extracted seam ✓
- [ ] **BR-RT-003**: Template scanning output shape identical ✓

**Approval Gate**: Code review + all tests passing

---

### Track A: revisionsSlice (DF-007, Step 2)

**Precondition**: `resource-templates` refactor is complete

**Seam**: Canonical revision semantics + state normalization  
**Target**: `frontend/src/store/revisionsSlice.ts`

#### Compilation & Type Safety

- [ ] `pnpm tsc --noEmit` passes
- [ ] Redux state interface is declared at top of file (SR-012)
- [ ] All selectors use typed return types (no implicit `any`)
- [ ] `RootState`, `AppDispatch`, `AppStore` types are derived from store factory (SR-006)

#### Behavior Preservation

- [ ] All existing selectors return identically shaped data before/after refactor
- [ ] API calls to revision endpoints remain unchanged (same endpoints, same payload)
- [ ] Canonical revision invariant is enforced: only one `canonical: true` per resource at all times

#### Canonical Revision Guardrails

- [ ] **BR-Rev-001**: Only one revision per resource can be canonical ✓
    - Unit test: `revision-canonical-guards.ts` exists and asserts single-canonical invariant
    - Test: Create resource with multiple revisions, mark one canonical, confirm only one has flag
- [ ] **BR-Rev-002**: Revision version numbers are linear (no gaps) ✓
    - Unit test: Reducer adds revisions, selector confirms no gaps in version array
- [ ] **BR-Rev-003**: All selectors return stable shapes ✓
    - Type test: Component type imports do not require `as` casts
    - Snapshot test: Selector output shape matches before/after

#### Redux Pattern Compliance

- [ ] Batch-update reducers use `Map` for O(1) lookup, not repeated `findIndex` (SR-013)
- [ ] Batch reducers always `return state` explicitly (SR-005d)
- [ ] Selectors and async thunks are co-located in slice file (SR-005e)
- [ ] Type discriminant routing uses explicit checks, not chained conditionals (SR-005f)

#### Unit Tests

```bash
pnpm test:ci frontend/src/store/revisionsSlice
```

- [ ] Canonical-invariant tests pass
- [ ] Version-linearity tests pass
- [ ] Selector shape parity tests pass (snapshot or typed assertion)
- [ ] Thunk tests pass (if any Redux thunks present)

#### Guardrail Verification

- [ ] **BR-Rev-001**: 1-canonical-only enforced in guards ✓
- [ ] **BR-Rev-002**: No version gaps in reducer tests ✓
- [ ] **BR-Rev-003**: Selector shapes match original ✓

**Approval Gate**: Code review + all canonical invariant tests passing

---

### Track A: EditView (DF-002, Step 3)

**Precondition**: `revisionsSlice` refactor is complete; API contract is frozen

**Seam**: Revision I/O + autosave lifecycle decoupled from UI presentation  
**Target**: `frontend/components/WorkArea/EditView.tsx`

#### Behavior Preservation

- [ ] **BR-Edit-001**: Save-on-blur flushes in same lifecycle tick as original ✓
    - Playwright test: Type text → navigate away, assert save API called before nav completes
- [ ] **BR-Edit-002**: Only one canonical revision at a time ✓
    - Playwright test: Autosave during edit, confirm no duplicate canonical revisions
- [ ] **BR-Edit-003**: Retry logic does not exceed original max retry count ✓
    - Unit test: Mock API failures, confirm retry exhaustion matches original

#### Component Interface Preservation

- [ ] Component receives same props as before (read seam document for exactly which props)
- [ ] Component returns same output (callbacks, rendered output, selection state)
- [ ] All hooks remain in the component (no extraction that breaks hook rules)

#### Unit Tests

```bash
pnpm test:ci frontend/components/WorkArea/EditView
```

- [ ] autosave timing tests pass
- [ ] canonical-prevention tests pass
- [ ] retry-limit tests pass
- [ ] Snapshot test: rendered output identical before/after

#### Playwright Tests

```bash
pnpm test:e2e --grep "EditView|autosave"
```

- [ ] Type text, navigate away, confirm save completes
- [ ] Concurrent autosave does not create duplicate canonicals
- [ ] Keyboard shortcuts and command palette integration work

#### Style Contract Compliance

- [ ] Token-backed utility classes used (no raw `text-sm`, `px-4` on host elements)
- [ ] Lodash policy enforced: path imports only if used; native methods preferred

#### Guardrail Verification

- [ ] **BR-Edit-001**: Save-on-blur timing preserved ✓
- [ ] **BR-Edit-002**: No concurrent canonicals created ✓
- [ ] **BR-Edit-003**: Retry count not exceeded ✓

**Approval Gate**: Code review + critical Playwright tests passing

---

### Track A: AppShell (DF-001, Step 4)

**Precondition**: `EditView` and `ProjectTypesManagerPage` refactors complete

**Seam**: Shell layout, settings, modal orchestration, project-type loading decomposed into 4 units  
**Target**: `frontend/components/Layout/AppShell.tsx`

#### Compilation & Type Safety

- [ ] `pnpm tsc --noEmit` passes (no TypeScript errors in AppShell or child units)
- [ ] All child units export props interfaces (SR-025)
- [ ] All Redux hooks use `useAppSelector`/`useAppDispatch` from `hooks.ts`, not raw Redux (SR-018)

#### Behavior Preservation — Layout

- [ ] **BR-Shell-Layout**: Panel dimensions change identically to original behavior ✓
    - Playwright test: Drag resize handle, measure final dimensions, confirm match
    - Playwright test: Collapse/expand panels, confirm final state matches original

#### Behavior Preservation — Settings

- [ ] **BR-Shell-Settings**: User settings persist identically ✓
    - Unit test: Save preference, reload, confirm persisted value
    - Playwright test: Open settings, change appearance, reload app, confirm style applied

#### Behavior Preservation — Modals

- [ ] **BR-Shell-Modal**: All 4 modal flows open at same trigger points ✓
    - Playwright test: Click "Create" button, CreateModal opens (not ExportModal)
    - Playwright test: File → Export, ExportModal opens
    - Playwright test: File → Compile, CompileModal opens
    - Playwright test: Tree context menu → action, ContextAction modal opens

#### Behavior Preservation — Project Types

- [ ] **BR-Shell-ProjectTypes**: Project-type data shape matches API response ✓
    - Type test: Child routes receive correctly typed project-type data
    - Unit test: compareProjectTypeShape(apiResponse, propagatedData) returns equal

#### Behavior Preservation — Save Coordination

- [ ] **BR-Shell-SaveCoord**: Editor save signal reaches EditView with same timing and shape ✓
    - Playwright test: Type in editor, see autosave indicator, confirm save completed
    - Playwright test: AppShell triggers save, EditView receives signal, revisions update

#### Modal Component Tests (Untouched)

- [ ] Modal components themselves are NOT changed (DF-004 is deferred)
- [ ] Modal tests pass with new prop shapes from AppShell coordinator

#### Style Contract Compliance

- [ ] Token-first styling applied: no raw Tailwind on AppShell hosts (AP-019)
- [ ] Semantic BEM-style class names for modal orchestration layers (SR-031)
- [ ] Dark-mode overrides use existing token-scoped patterns (TB-003)

#### Unit Tests

```bash
pnpm test:ci frontend/components/Layout
```

- [ ] Layout controller tests pass (resize behavior)
- [ ] Settings menu tests pass (persistence)
- [ ] Modal coordinator tests pass (trigger points, prop propagation)
- [ ] Project-type loader tests pass (data shape match)

#### Playwright Tests

```bash
pnpm test:e2e --grep "AppShell|modal|settings|autosave"
```

- [ ] All modal open/close scenarios pass
- [ ] Settings save and reload scenarios pass
- [ ] Edit → autosave → AppShell coordination passes
- [ ] Project-type data propagation passes

#### Guardrail Verification

- [ ] **BR-Shell-001**: Layout resize works identically ✓
- [ ] **BR-Shell-002**: Settings persist identically ✓
- [ ] **BR-Shell-003**: All 4 modals open at same trigger points ✓
- [ ] **BR-Shell-004**: Project-type data shape preserved ✓
- [ ] **BR-Shell-005**: Save coordination timing unchanged ✓

**Approval Gate**: Code review + all critical Playwright tests passing

---

### Track B: projectsSlice (DF-007, Step 2) — Parallel with Track A

**Precondition**: `resource-templates` refactor is complete

**Seam**: Project mutation logic, state normalization  
**Target**: `frontend/src/store/projectsSlice.ts`

#### Behavior Preservation

- [ ] **BR-Proj-001**: API endpoints for rename/delete unchanged ✓
    - Unit test: Mock API calls, confirm same endpoints and payload shapes
- [ ] **BR-Proj-002**: State normalization produces identical array shape ✓
    - Snapshot test: Normalized state matches original structure

#### Unit Tests

```bash
pnpm test:ci frontend/src/store/projectsSlice
```

- [ ] API endpoint tests pass
- [ ] Normalization tests pass
- [ ] Selector shape parity tests pass

**Approval Gate**: Code review + unit tests passing

---

### Track B: ResourceTree (DF-003, Step 3)

**Precondition**: `projectsSlice` refactor complete; `resourcesSlice` stable

**Seam**: Tree adapter logic, drag-drop reparenting, selection sync  
**Target**: `frontend/components/Sidebar/ResourceTree.tsx`

#### Behavior Preservation

- [ ] **BR-Tree-001**: Drag-drop reparent preserves resource.id ✓
    - Playwright test: Drag resource A to folder B, confirm id() still references A
- [ ] **BR-Tree-002**: persistReorder writes same payload shape ✓
    - Unit test: Mock dispatch, compare reorder payload before/after
- [ ] **BR-Tree-003**: Selection state propagates identically to resourcesSlice ✓
    - Playwright test: Click tree item, confirm correct resource opens in editor

#### Style Contract Compliance

- [ ] Token-first styling applied (no raw Tailwind on hosts)

#### Unit Tests

```bash
pnpm test:ci frontend/components/Sidebar/ResourceTree
```

- [ ] Reparent guard tests pass
- [ ] Selection sync tests pass

#### Playwright Tests

```bash
pnpm test:e2e --grep "ResourceTree|drag-drop"
```

- [ ] Drag-drop preserves resource identity
- [ ] Selection opens correct resource

**Approval Gate**: Code review + Playwright tests passing

---

### Track C: template-service + ProjectTypesManagerPage (DF-008, Step 2–3)

**Precondition**: `resource-templates` refactor complete

**Seam**: Template file I/O, template validation, form editing  
**Target**: `frontend/src/lib/projectTypes.ts` (service) + `frontend/components/project-types/ProjectTypesManagerPage.tsx`

#### Behavior Preservation

- [ ] **BR-Proj-Types-001**: Workspace folder structure correct on project creation ✓
    - Integration test: Create project with template, confirm workspace folders present and correct
- [ ] **BR-Proj-Types-002**: Template changes only persist after explicit user save ✓
    - Playwright test: Edit template draft, close UI, reload, confirm draft lost if not saved

#### Unit Tests

```bash
pnpm test:ci frontend/src/lib/projectTypes frontend/components/project-types
```

- [ ] Template scanning tests pass
- [ ] Validation tests pass
- [ ] Form submission tests pass

#### Playwright Tests

```bash
pnpm test:e2e --grep "ProjectTypes"
```

- [ ] Create project with template, confirm workspace structure
- [ ] Edit template, save, confirm changes applied

**Approval Gate**: Code review + integration tests passing

---

### Track D: MenuBar (DF-010) — Independent

**Precondition**: None (fully independent)

**Seam**: Command schema extraction, duplication consolidation  
**Target**: `frontend/components/Editor/MenuBar/MenuBar.tsx`

#### Behavior Preservation

- [ ] **BR-Menu-001**: All current editor commands available and functional ✓
    - Playwright test: Bold, italic, link, color, highlight commands all work
- [ ] **BR-Menu-002**: Color and highlight submenu produce identical output ✓
    - Visual test: Compare color picker output before/after

#### Style Contract Compliance

- [ ] Config-driven command schema replaces inline wiring (tome-006)
- [ ] Zero raw Tailwind on refactored hosts (token-first)

#### Unit Tests

```bash
pnpm test:ci frontend/components/Editor/MenuBar
```

- [ ] Command descriptor tests pass
- [ ] Submenu parity tests pass

#### Playwright Tests

```bash
pnpm test:e2e --grep "MenuBar|toolbar"
```

- [ ] All commands execute identically
- [ ] Submenus display and work as expected

**Approval Gate**: Code review + Playwright tests passing

---

### Track E: HelpPage (DF-009) — Independent

**Precondition**: None (fully independent, lowest risk)

**Seam**: Content extraction, modal lifecycle  
**Target**: `frontend/components/*/HelpPage.tsx` (location TBD)

#### Behavior Preservation

- [ ] **BR-Help-001**: Content renders identically ✓
    - Snapshot test: Help modal HTML/text matches original
- [ ] **BR-Help-002**: Modal open/close and Escape dismissal work ✓
    - Playwright test: Click help trigger, modal opens; press Escape, modal closes

#### Unit Tests

```bash
pnpm test:ci frontend/components/HelpPage
```

- [ ] Content snapshot test passes
- [ ] Keyboard handler tests pass

#### Playwright Tests

```bash
pnpm test:e2e --grep "HelpPage|help"
```

- [ ] Help modal opens on trigger
- [ ] Escape key dismisses modal
- [ ] Content renders without missing sections or broken links

**Approval Gate**: Code review + Playwright tests passing

---

## Verification Template

Print this for code review:

```
[ ] Seam document read and understood
[ ] Preconditions met (dependencies complete)
[ ] Compilation passes (pnpm tsc --noEmit)
[ ] Unit tests pass (pnpm test:ci <target>)
[ ] Playwright tests pass (pnpm test:e2e --grep "<pattern>")
[ ] All guardrails verified (checklist complete)
[ ] Style contract rules applied (token-first, SR-###s, AP-###s)
[ ] No new `as any` casts introduced
[ ] Redux selectors use typed hooks (useAppSelector/useAppDispatch)
[ ] Code review approved
[ ] Squash merge to main
```

## Sign-Off

**Reviewed By**: [Reviewer Name]  
**Date**: [ISO 8601 date]  
**Hotspot**: [hotspot name]  
**Guardrail Checklist**: ✓ All passed

---

## Deferred Hotspots

⚠️ **The following hotspots are explicitly deferred and NOT in this feature's scope:**

- **DF-004 (Modal Flows)**: Modal component internals (close/confirm patterns). May be addressed opportunistically after AppShell extract completion.
- **DF-005 (Sidebar Metadata)**: MetadataSidebar selector duplication and type casts. Safe to address standalone or alongside Tracks D/E.

No verification checklist is required for deferred hotspots until they are brought into scope in a future feature.

---

## Post-Merge Verification

After merging to main:

- [ ] Run `pnpm test:ci` on main to confirm no regressions
- [ ] Run `pnpm test:e2e` on main to confirm UI behavior unchanged
- [ ] Spot-check the refactored source files for style compliance
- [ ] Document any follow-up improvements in a new issue if identified during review
