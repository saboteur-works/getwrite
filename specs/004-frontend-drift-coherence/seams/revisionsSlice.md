# Revisions Slice Seam

Refactor seam definition placeholder for revisions slice hotspot.

# Revisions Slice Seam

**Finding**: DF-007 · Rank 1 · Risk: High · Invariant Impact: revisions+canonical
**Target**: `frontend/src/store/revisionsSlice.ts` (884 lines)
**Drift Types**: size, responsibility, architectural-boundary

## Overview

`revisionsSlice` is the most critical hotspot in the drift inventory. At 884 lines it combines async transport (`fetch` thunks directly calling `/api/resource/revision/*`), array normalization, revision selection logic, canonical state transitions, and UI-facing status flags — all in one file. The canonical revision guarantee (only one revision can be canonical per resource at a time; revision linearity must hold) is currently enforced implicitly through interleaved reducer and thunk logic. Making that guarantee explicit, isolated, and independently testable is the primary objective of this seam.

## Seam Splits

| Seam Boundary           | Responsibility                                                                                           | Proposed New Unit               | Dependency Direction                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| Transport service       | Wraps all `fetch` calls for revision endpoints; returns typed promise results                            | `revision-transport-service.ts` | No Redux import; consumes API types only                       |
| Normalization helpers   | Converts raw API arrays to normalized revision maps; cache selector factories                            | `revision-normalization.ts`     | Depends on `schemas.ts` for validation; no Redux               |
| Canonical guard helpers | Explicit reducer-level guard functions that enforce canonical guarantee                                  | `revision-canonical-guards.ts`  | Pure functions; accept state slices; return validation results |
| Slim slice              | State transitions, dispatch hub; delegates transport, normalization, and canonical checks to above units | `revisionsSlice.ts` (trimmed)   | Imports all three units above                                  |

## Dependency Order

1. **`schemas.ts` must be stable.** Normalization helpers validate to schema-defined shapes.
2. **`revision-transport-service.ts` first.** Cleanest extraction — no invariant risk, no Redux dependency. Can be verified by unit testing transport isolation.
3. **`revision-normalization.ts` second.** Depends on schema types and transport response shapes.
4. **`revision-canonical-guards.ts` in parallel with normalization.** Pure functions; only need schema types.
5. **Slim `revisionsSlice.ts` last.** Replaces inlined logic with imports from all three units; tests must confirm that existing selector return shapes are unchanged.

## Blast Radius

| Affected Area                                                                                            | Coupling Type                                                           | Migration Risk                                                                    |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `frontend/components/WorkArea/EditView.tsx`                                                              | Dispatches to canonical state transition thunks                         | High — thunk API must remain identical or EditView extraction must be coordinated |
| `frontend/components/Layout/AppShell.tsx`                                                                | Reads UI-facing status flags (saving, saved, error) from revision state | Medium — status flag selector shapes must remain identical                        |
| API routes `/api/resource/revision/create`, `/api/resource/revision/list`, `/api/resource/revision/read` | Called by transport service (previously inline `fetch`)                 | High — endpoint paths and request/response shapes cannot change                   |
| Any component or hook reading `selectRevisions`, `selectCanonicalRevision`, or related selectors         | Selector return type must be identical                                  | Medium — selectors co-located in slice; shapes cannot drift                       |
| `frontend/src/lib/models/resource.ts`                                                                    | Revision factories used inside thunks                                   | Medium — stabilize model layer before finalizing thunk wiring                     |

## Public-Behavior Guardrails

| Guardrail                                                                                                                                         | Invariant Link      | Failure Signal                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| Only one revision per resource can have `canonical: true` at any time; `revision-canonical-guards.ts` must make this assertable                   | revisions+canonical | Two revisions share `canonical: true` in the store after a concurrent save attempt |
| Revision linearity must hold: the slice must not allow a new revision to skip a version number                                                    | revisions+canonical | Version numbers are non-sequential in `selectRevisions` output                     |
| All existing selectors (`selectRevisions`, `selectCanonicalRevision`, `selectRevisionStatus`, etc.) must return identical shapes after extraction | revisions+canonical | Components referencing these selectors fail TypeScript checks or render stale data |
| Transport thunks must continue calling the same API endpoints with the same request shapes                                                        | revisions+canonical | Revision fetch or save fails after extraction because endpoint or payload changed  |
| UI-facing status flags (`saving`, `saved`, `error`) must be set and cleared at the same reducer transitions                                       | none                | Editor toolbar shows wrong state; autosave indicator misleads the user             |

## Non-Goals

- Do not change the canonical revision API response contract.
- Do not merge `revisionsSlice` with `resourcesSlice` or `projectsSlice`.
- Do not redesign how `EditView` dispatches revision actions — coordinate, not dictate.
- Do not alter the normalization cache shape visible to UI consumers.
- Do not add new revision features or status states during this extraction.

## Style-Alignment Mappings

| Rule   | Applies To                                                                                   | Action Required                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| SR-006 | Slim `revisionsSlice.ts`                                                                     | `RootState`, `AppDispatch`, `AppStore` must be derived from the store factory return type; never hand-written   |
| SR-012 | Slim `revisionsSlice.ts`                                                                     | Typed `RevisionState` interface must appear at the top of the slice file                                        |
| SR-013 | Any batch normalization reducer in slim slice                                                | Use `Map` for O(1) lookup when batch size is non-trivial; `findIndex` only for single-item updates              |
| SR-014 | `revision-normalization.ts` selectors                                                        | Use `createSelector` for derived state spanning multiple arrays (e.g., canonical + all revisions)               |
| SR-015 | Slim `revisionsSlice.ts` reducers                                                            | Pick one mutation style (explicit `return state`); do not mix with implicit Immer mutation                      |
| SR-016 | Slim `revisionsSlice.ts`                                                                     | All selectors and `createAsyncThunk` definitions stay co-located in the slice file; none relocate to components |
| SR-019 | `revision-canonical-guards.ts` if using any locking                                          | Acquire locks in `try/finally`; release in `finally` only                                                       |
| SR-007 | `revision-transport-service.ts`, `revision-normalization.ts`, `revision-canonical-guards.ts` | Add `@module` JSDoc block to each extracted module                                                              |
| AP-004 | All consumers of the slice                                                                   | Remove any hand-written `RootState` or `AppDispatch` aliases; derive from store types                           |
| AP-009 | Slim `revisionsSlice.ts` reducers                                                            | Do not mix implicit Immer mutation and explicit `return state` in the same slice                                |
| AP-010 | Components that currently inline selectors                                                   | Move inline selectors into `revisionsSlice.ts`; no selector defined in a component file                         |
