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
- task tracking updates marking Phases 1 and 2 complete

This branch does not yet include:

- User Story 1 model or Redux seam extraction
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

### Task state updates

Updated `specs/005-refactor-app-trouble-spots/tasks.md` to mark the following tasks complete:

- `T001`
- `T002`
- `T003`
- `T004`
- `T005`
- `T006`

This leaves the branch ready to begin User Story 1 implementation work.

## Validation

Validation completed so far:

- `pnpm --filter getwrite-frontend run test:refactor:resource-templates` passed
- `pnpm --filter getwrite-frontend run test:refactor:revisions` passed
- new helper files and task/package edits reported no editor diagnostics after creation

Validation note:

- `pnpm --filter getwrite-frontend typecheck` is currently blocked by a pre-existing import error in `frontend/src/hooks/use-toast.ts` referencing `@/lib/toast-service`
- the passing revisions suite still emits existing test stderr warnings from sidecar lookups and React `act(...)` guidance inside `tests/reorder-persistence.test.tsx`, but these warnings did not fail the suite

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
