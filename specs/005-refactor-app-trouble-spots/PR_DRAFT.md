# PR Draft: Refactor Frontend App Trouble Spots

**Feature**: [spec.md](/Users/jedaisaboteur/Repositories/getwrite/specs/005-refactor-app-trouble-spots/spec.md)
**Branch**: `005-refactor-app-trouble-spots`
**Base**: `main`
**Status**: Draft
**Last Updated**: 2026-03-21

## Purpose

This file is the working PR draft for feature `005-refactor-app-trouble-spots`.

Update it as implementation progresses so the eventual PR body can be assembled from the branch's recorded scope, validation, risks, and completion status instead of reconstructing that context at PR creation time.

## Current Branch Summary

This branch currently contains:

1. The full planning and execution artifact set for feature `005-refactor-app-trouble-spots`.
2. The completed Phase 1 setup work that establishes shared refactor guardrail scaffolding and hotspot-specific test commands.
3. The completed Phase 2 foundational baseline work that locks model, template, revision, and reorder assertions before any seam extraction begins.
4. The first User Story 1 regression coverage pass for model-layer seams before extraction begins.
5. The second User Story 1 regression coverage pass for slice guardrails and selector stability.
6. User Story 1 extraction has started with the `resource-factory` seam (`T009`).
7. User Story 1 persistence extraction is complete with `resource-persistence` (`T010`).
8. User Story 1 typed adapter extraction is complete with `project-view-adapter` (`T011`).

At the current branch state, this is still early execution work. The branch does **not** yet implement the model, slice, or UI seam extractions described in later phases.

## Proposed PR Title

`feat(spec-005): start refactor app trouble spots execution`

## Draft PR Body

## Summary

This PR starts execution for feature `005-refactor-app-trouble-spots`.

It adds the planning package for the frontend trouble-spot refactor and completes the Phase 1 setup plus Phase 2 foundational work needed before invariant-sensitive seam extraction begins.

The current branch state focuses on execution readiness, not the downstream seam extractions themselves.

## Scope

This branch currently includes:

- the full feature spec package under `specs/005-refactor-app-trouble-spots`
- shared refactor fixture builders for invariant-sensitive tests
- shared UI parity helpers for behavior-preserving integration coverage
- hotspot-specific frontend test command aliases for later execution tracks
- foundational baseline assertions for model, template, revision, and reorder guardrails
- focused model-layer regression coverage for factory, persistence, project-view adapter, and template-service seams
- focused slice guardrail coverage for canonical revision behavior, selector visibility rules, and project-slice normalization contracts
- first model seam extraction by moving pure factory logic to `resource-factory.ts` while preserving `resource.ts` exports
- persistence seam extraction by moving write/load helpers to `resource-persistence.ts` while preserving `resource.ts` exports
- typed project-view adapter extraction by moving UI-mapping helpers to `project-view-adapter.ts` while preserving `project-view.ts` exports
- task tracking updates marking Phases 1 and 2 complete

This branch does not yet include:

- User Story 1 Redux seam extraction
- User Story 2, 3, 4, or 5 implementation work
- any intended user-facing behavior change

## What Changed

### Feature planning and execution artifacts

Added the feature package under `specs/005-refactor-app-trouble-spots`:

- `spec.md`
- `plan.md`
- `research.md`
- `data-model.md`
- `quickstart.md`
- `tasks.md`
- `checklists/requirements.md`

These artifacts define:

- the refactor scope and priorities
- the authority chain back to feature `004-frontend-drift-coherence`
- the hotspot sequencing and execution tracks
- the invariant guardrails and verification workflow
- the per-phase implementation task list

### Phase 1 setup scaffolding

Added shared test infrastructure for the refactor tracks:

- `frontend/src/tests/unit/refactor-guardrails/fixtureBuilders.ts`
- `frontend/tests/integration/refactorParity.ts`

This setup work provides:

- deterministic fixture builders for folders, resources, revisions, and project-type specs
- reusable parity assertions for ordered identities and strict output comparisons
- lightweight UI tick and parity wait helpers for later integration coverage

### Frontend test command aliases

Updated `frontend/package.json` with hotspot-specific command aliases:

- `test:refactor:resource-templates`
- `test:refactor:revisions`
- `test:refactor:projects`
- `test:refactor:edit-view`
- `test:refactor:resource-tree`
- `test:refactor:project-types`
- `test:refactor:app-shell`
- `test:refactor:menu-bar`
- `test:refactor:help-page`

These commands create stable entry points for guardrail verification as each hotspot track is implemented.

### Phase 2 foundational baseline assertions

Expanded the blocking baseline coverage before any seam extraction starts:

- `frontend/src/tests/unit/resource.test.ts`
- `frontend/src/tests/unit/uuid.test.ts`
- `frontend/src/tests/unit/resource-templates.test.ts`
- `frontend/tests/unit/project-type-validation.spec.ts`
- `frontend/src/tests/unit/revision-invariants.test.ts`
- `frontend/tests/reorder-persistence.test.tsx`
- `specs/005-refactor-app-trouble-spots/quickstart.md`

This work adds baseline assertions for:

- schema-validated resource factory output, slugging, timestamps, and UUID shape
- template placeholder inspection and dry-run write planning
- Workspace folder validation and strict project-type spec shape
- canonical revision reassignment and prune-protection behavior
- reorder persistence payload identity and order-index persistence
- explicit Phase 2 entry-gate commands in the quickstart guide

### User Story 1 model-layer regression coverage

Added focused seam-level regression coverage for the first extraction track:

- `frontend/src/tests/unit/resource-factory.test.ts`
- `frontend/src/tests/unit/resource-persistence.test.ts`
- `frontend/src/tests/unit/project-view-adapter.test.ts`
- `frontend/src/tests/unit/template-service.test.ts`

This work locks down:

- factory dispatch, slug normalization, metadata passthrough, and invalid-shape rejection
- text and folder persistence behavior, sidecar identity, and local resource loading
- project-view folder/resource ordering and flat legacy adapter output
- template listing, nested placeholder inspection, schema validation, and bulk scaffold creation

### User Story 1 slice guardrail coverage

Added focused slice-level guardrail coverage for the Redux foundation seams:

- `frontend/src/tests/unit/revision-canonical-guards.test.ts`
- `frontend/src/tests/unit/revisions-slice-selectors.test.ts`
- `frontend/src/tests/unit/projects-slice-controller.test.ts`

This work locks down:

- single-canonical revision transitions for both reducer and thunk fulfillment paths
- visible-revision selector behavior when the selected resource changes and status-flag selector stability
- project-slice normalization, selector memoization, and resource add/remove behavior keyed by stable ids

The hotspot-specific aliases were also refreshed so:

- `test:refactor:resource-templates` now includes the four T007 model-layer regression files
- `test:refactor:revisions` now includes the new T008 revision slice tests
- `test:refactor:projects` now includes the new T008 project slice test

### User Story 1 seam extraction start (T009)

Started the first model seam extraction by introducing:

- `frontend/src/lib/models/resource-factory.ts`

Updated:

- `frontend/src/lib/models/resource.ts`

This extraction moves pure resource factory construction/validation logic into the dedicated module while re-exporting the same public factory APIs from `resource.ts` so downstream imports remain stable.

### User Story 1 persistence extraction (T010)

Added:

- `frontend/src/lib/models/resource-persistence.ts`

Updated:

- `frontend/src/lib/models/resource.ts`

This extraction moves local write/load side-effect logic into a dedicated persistence module while preserving call sites through stable re-exports from `resource.ts`.

### User Story 1 typed adapter extraction (T011)

Added:

- `frontend/src/lib/models/project-view-adapter.ts`

Updated:

- `frontend/src/lib/models/project-view.ts`

This extraction moves typed project-view mapping helpers into a dedicated adapter module and removes `as any` usage from the seam while preserving the existing `buildProjectView` API surface.

### Task state updates

Updated `specs/005-refactor-app-trouble-spots/tasks.md` to mark the following tasks complete:

- `T001`
- `T002`
- `T003`
- `T004`
- `T005`
- `T006`
- `T007`
- `T008`
- `T009`
- `T010`
- `T011`

This leaves the branch ready for the next US1 extraction tasks `T012` through `T018`.

## Validation

Validation completed so far:

- `pnpm --filter getwrite-frontend run test:refactor:resource-templates` passed
- `pnpm --filter getwrite-frontend run test:refactor:revisions` passed
- `pnpm --filter getwrite-frontend run test:refactor:projects` passed
- `pnpm --filter getwrite-frontend test:ci src/tests/unit/resource-factory.test.ts src/tests/unit/resource-persistence.test.ts src/tests/unit/project-view-adapter.test.ts src/tests/unit/template-service.test.ts` passed
- `pnpm --filter getwrite-frontend test:ci src/tests/unit/revision-canonical-guards.test.ts src/tests/unit/revisions-slice-selectors.test.ts src/tests/unit/projects-slice-controller.test.ts` passed
- `pnpm --filter getwrite-frontend test:ci src/tests/unit/resource-factory.test.ts src/tests/unit/resource-persistence.test.ts src/tests/unit/project-view-adapter.test.ts src/tests/unit/template-service.test.ts src/tests/unit/revision-canonical-guards.test.ts src/tests/unit/revisions-slice-selectors.test.ts src/tests/unit/projects-slice-controller.test.ts` passed after the `T009` extraction
- `pnpm --filter getwrite-frontend exec vitest run src/tests/unit/project-view-adapter.test.ts` passed after the `T011` extraction
- `pnpm --filter getwrite-frontend run test:refactor:resource-templates` passed after the `T011` extraction
- new helper files and task/package edits reported no editor diagnostics after creation

Validation note:

- `pnpm --filter getwrite-frontend typecheck` is currently blocked by a pre-existing import error in `frontend/src/hooks/use-toast.ts` referencing `@/lib/toast-service`
- the passing revisions suite still emits existing test stderr warnings from sidecar lookups and React `act(...)` guidance inside `tests/reorder-persistence.test.tsx`, but these warnings did not fail the suite
- the passing `resource-persistence` regression suite emits a non-failing sidecar lookup warning during temp-directory cleanup because background indexing can outlive the test body briefly
- the passing projects alias emits existing integration-test debug logging from `tests/create-project-modal.spec.tsx`, but it does not affect pass/fail status

## Product and Invariant Notes

The setup work in this branch is intended to support later refactors that must preserve:

- Workspace protection and seed structure
- resource identity stability across reorder and move flows
- canonical revision invariants
- token-first UI consistency for touched frontend surfaces

No runtime behavior change is intended by the Phase 1 work currently on the branch.

## Files of Interest

- [specs/005-refactor-app-trouble-spots/spec.md](/Users/jedaisaboteur/Repositories/getwrite/specs/005-refactor-app-trouble-spots/spec.md)
- [specs/005-refactor-app-trouble-spots/plan.md](/Users/jedaisaboteur/Repositories/getwrite/specs/005-refactor-app-trouble-spots/plan.md)
- [specs/005-refactor-app-trouble-spots/tasks.md](/Users/jedaisaboteur/Repositories/getwrite/specs/005-refactor-app-trouble-spots/tasks.md)
- [frontend/src/tests/unit/refactor-guardrails/fixtureBuilders.ts](/Users/jedaisaboteur/Repositories/getwrite/frontend/src/tests/unit/refactor-guardrails/fixtureBuilders.ts)
- [frontend/tests/integration/refactorParity.ts](/Users/jedaisaboteur/Repositories/getwrite/frontend/tests/integration/refactorParity.ts)
- [frontend/package.json](/Users/jedaisaboteur/Repositories/getwrite/frontend/package.json)

## Branch History Snapshot

Commits currently on this branch relative to `main`:

- `9ade122` — `spec(005): add planning artifacts for refactor-app-trouble-spots`
- `4593ce9` — `feat(spec-005): complete phase 1 setup scaffolding`

## Update Checklist

When this branch changes, update this file with:

- newly completed phases or task ids
- added validation commands and outcomes
- known blockers or pre-existing failures encountered during validation
- changes to PR title or scope if the branch expands
- any new files that reviewers should prioritize

## Update Log

### 2026-03-21

- Created the initial PR draft file for feature `005-refactor-app-trouble-spots`.
- Recorded the planning artifacts already present on the branch.
- Recorded completion of Phase 1 setup tasks `T001` through `T003`.
- Recorded the passing `test:refactor:resource-templates` validation run.
- Recorded the pre-existing frontend typecheck blocker in `frontend/src/hooks/use-toast.ts`.
- Recorded completion of Phase 2 foundational tasks `T004` through `T006`.
- Recorded the passing `test:refactor:revisions` validation run.
- Recorded the existing non-failing stderr warnings emitted by the revisions baseline suite.
- Recorded completion of `T007` with focused model-layer regression tests covering factory, persistence, project-view adapter, and template-service seams.
- Recorded the passing targeted Vitest command for the four new T007 regression files.
- Recorded completion of `T008` with focused slice guardrail coverage for `revisionsSlice` and `projectsSlice`.
- Recorded the passing targeted Vitest command for the three new T008 slice tests.
- Recorded the passing refreshed hotspot alias commands for `resource-templates`, `revisions`, and `projects`.
- Recorded completion of `T009` by extracting pure factory construction/validation logic to `frontend/src/lib/models/resource-factory.ts` while preserving stable exports from `frontend/src/lib/models/resource.ts`.
- Recorded the passing combined T007/T008 targeted guardrail command and the passing refreshed hotspot alias commands after `T009`.
