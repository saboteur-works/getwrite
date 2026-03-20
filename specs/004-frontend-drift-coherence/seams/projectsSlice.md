# Projects Slice Seam

Refactor seam definition placeholder for projects slice hotspot.

# Projects Slice Seam

**Finding**: DF-007 (projectsSlice component) · Rank 1 (shared with revisionsSlice) · Risk: High · Invariant Impact: revisions+canonical (indirect, via project state mutation)
**Target**: `frontend/src/store/projectsSlice.ts`
**Drift Types**: responsibility, standards

## Overview

`projectsSlice` duplicates projection and mutation concerns from `resourcesSlice`, and embeds normalization/cache logic and side-effectful project operations (delete, rename, reorder persistence) directly inside slice-adjacent thunks. The slice is a sibling to `revisionsSlice` in the DF-007 finding. It is lower volume than `revisionsSlice` but the pattern of mixed transport + normalization + state is the same. The key concern is that `ManageProjectMenu` currently calls project delete/rename directly through thunks, without a dedicated action controller — making it hard to validate that modal confirmation is always required before a destructive action.

## Seam Splits

| Seam Boundary               | Responsibility                                                                             | Proposed New Unit                        | Dependency Direction                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------- |
| Project mutation service    | Wraps delete and rename operations; enforces confirmation-required invariant at one seam   | `project-actions-controller.ts`          | Depends on `projectsSlice` thunks; callable from `ManageProjectMenu` |
| Derived selection selectors | Complex project selection and ordering derivations extracted to `createSelector` factories | Added to `projectsSlice.ts` (co-located) | No new file; co-location enforced per SR-016                         |
| Slim slice                  | Pure state transitions; removes inline normalization from reducer bodies                   | `projectsSlice.ts` (trimmed)             | Imports `project-actions-controller` interface types                 |

## Dependency Order

1. **Model layer must be stable.** Project shapes come from model factories; `resource-factory.ts` extraction must precede this seam.
2. **`project-actions-controller.ts` can be defined before the slim slice.** It wraps currently existing thunks; does not require the slice to be restructured first.
3. **Derived selection selectors** (SR-014 compliance) can be added during or after the controller extraction.
4. **Slim slice** is the final step once the controller interface and selectors are settled.

## Blast Radius

| Affected Area                                                   | Coupling Type                                                                           | Migration Risk                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `frontend/components/Start/ManageProjectMenu.tsx`               | Dispatches delete/rename to `projectsSlice` thunks; also calls modal callbacks directly | High — any thunk API change must be coordinated with the controller extraction |
| API routes `/api/project/delete`, `/api/project/rename`         | Called by delete/rename thunks                                                          | High — endpoint paths and request payloads cannot change                       |
| Any component that reads project list or selected project state | Consumes `projectsSlice` selectors                                                      | Medium — selector return shapes must remain identical                          |
| `frontend/components/Layout/AppShell.tsx`                       | May read project status flags from the slice                                            | Low — status flag shapes must remain consistent                                |

## Public-Behavior Guardrails

| Guardrail                                                                                                          | Invariant Link                                                                                                   | Failure Signal                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Project rename must continue calling `/api/project/rename` with the same request payload                           | revisions+canonical (indirect — renaming a project that has open revisions must not corrupt revision references) | Rename succeeds in UI but revision references fail to resolve against the renamed project |
| Project delete must continue calling `/api/project/delete` and must remove the project from store state atomically | resource-identity (indirect)                                                                                     | Deleted project still appears in list; or store has stale entries after delete            |
| Project state normalization must produce an identical array shape for all existing selectors                       | none                                                                                                             | Component type errors or missing project entries after list refresh                       |
| Project ordering persistence must not change the visible order for the user                                        | none                                                                                                             | Projects re-sort to a different order after a page reload                                 |

## Non-Goals

- Do not merge `projectsSlice` with `resourcesSlice` or `revisionsSlice`.
- Do not change the project creation flow (create modal is DF-001/AppShell scope).
- Do not change the API route contracts for delete and rename.
- Do not add new project operations (archive, duplicate) in this seam.
- Do not redesign the modal confirmation pattern in `ManageProjectMenu` — only extract the action dispatch to the controller.

## Style-Alignment Mappings

| Rule   | Applies To                                                | Action Required                                                                                        |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| SR-006 | `projectsSlice.ts`                                        | Derive `RootState`, `AppDispatch` from the store factory; never hand-write type aliases                |
| SR-012 | `projectsSlice.ts`                                        | Typed `ProjectsState` interface must appear at the top of the slice file                               |
| SR-014 | `projectsSlice.ts` selectors                              | Add `createSelector` for any derived state that spans project + resource data                          |
| SR-015 | `projectsSlice.ts` reducers                               | Pick one mutation style; do not mix implicit Immer with explicit `return state`                        |
| SR-016 | `projectsSlice.ts`                                        | All selectors and async thunks remain co-located in the slice file                                     |
| SR-018 | `ManageProjectMenu.tsx` and any consumer of project state | Use `useAppSelector`/`useAppDispatch` from `hooks.ts`; remove any direct `react-redux` imports         |
| SR-007 | `project-actions-controller.ts`                           | Add `@module` JSDoc block naming responsibilities: project delete, rename, confirmation contract       |
| SR-011 | `project-actions-controller.ts`                           | Group all project mutation methods under one exported `projectActionsController` constant              |
| AP-004 | All consumers                                             | Remove any hand-written `RootState`/`AppDispatch` aliases; derive from store types                     |
| AP-011 | `ManageProjectMenu.tsx`                                   | Replace direct `useDispatch` with `useAppDispatch`; replace direct `useSelector` with `useAppSelector` |
