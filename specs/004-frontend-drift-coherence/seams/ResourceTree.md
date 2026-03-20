# ResourceTree Seam

Refactor seam definition placeholder for ResourceTree hotspot.

# ResourceTree Seam

**Finding**: DF-003 · Rank 3 · Risk: High · Invariant Impact: resource-identity
**Target**: `frontend/components/ResourceTree/ResourceTree.tsx` (600 lines)
**Drift Types**: responsibility, architectural-boundary, size

## Overview

`ResourceTree` renders the file-tree panel in the sidebar. Over time it has absorbed responsibility for converting the flat resource+folder arrays from the Redux store into tree nodes, managing custom selection semantics, handling drag-drop reparenting and reordering, and calling persistence dispatch (`updateFolders`, `updateResources`, `persistReorder`). The critical risk is that resource identity (parent-child relationships, stable IDs) is guarded inside a rendering component, where it is difficult to unit-test independently of tree render behavior. A tree data adapter plus a reorder command layer are needed to verify identity invariants without DOM involvement.

## Seam Splits

| Seam Boundary         | Responsibility                                                                                                      | Proposed New Unit                           | Dependency Direction                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Tree data adapter     | Transform flat `resources` + `folders` arrays into typed `TreeNode[]` with identity metadata                        | `buildResourceTree` (pure function or hook) | Consumes `resourcesSlice` selectors; depends on model layer types |
| Reorder command layer | Translate drag-drop events into typed reorder commands; dispatch `persistReorder` with identity-preserving payloads | `useResourceReorder` hook                   | Depends on `useAppDispatch`; receives tree node refs from adapter |
| Slim tree component   | Render-only: receives `TreeNode[]` from adapter, routes drag events to reorder hook                                 | `ResourceTree` (trimmed)                    | Depends on both adapter and reorder hook                          |

## Dependency Order

1. **Model layer (`resource.ts`, `resource-templates.ts`) must be stable first.** The tree adapter constructs node metadata from resource/folder identity; permissive casts in the current model layer must be replaced with typed helpers before the adapter can be finalized.
2. **`resourcesSlice` steady-state is a prerequisite.** The adapter consumes `selectFolders` and `selectResources`; these selectors must retain identical return shapes after any slice extraction.
3. **`buildResourceTree` adapter can be extracted once model types are stable.** It is a pure function with no side effects.
4. **`useResourceReorder` hook depends on the adapter types.** It receives `TreeNode[]` references; the node shape must be final before the hook is written.
5. **Slim `ResourceTree` is last.** Replaces its own normalization and drag wiring with calls to the adapter and the hook.

## Blast Radius

| Affected Area                                                                      | Coupling Type                                                                       | Migration Risk                                                                                 |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `frontend/src/store/resourcesSlice.ts`                                             | `persistReorder`, `updateFolders`, `updateResources` dispatched from `ResourceTree` | High — dispatch payload shapes must remain identical; any thunk API change must be coordinated |
| `frontend/components/Layout/AppShell.tsx`                                          | Wraps `ResourceTree` in its sidebar column                                          | Low — slim component keeps the same public props                                               |
| Any component receiving `selectedResourceId` from the tree's selection interaction | Selection side effect propagated to `resourcesSlice`                                | Medium — selection dispatch must remain identical                                              |
| `frontend/src/lib/models/resource.ts`                                              | Adapter imports identity helpers and type guards                                    | Medium — any type shape change in the model layer propagates to adapter                        |

## Public-Behavior Guardrails

| Guardrail                                                                                                                     | Invariant Link    | Failure Signal                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| Every drag-drop reparent must preserve the resource's stable `id`; no new ID should be generated during a reorder             | resource-identity | Sidebar loses the selected resource reference after drag; navigation breaks    |
| `persistReorder` must write a payload with the same structure as the current dispatch (folder IDs, positions, resource order) | resource-identity | Server-side order diverges from client-side; tree flickers or resets on reload |
| Selection state (`selectedResourceId`) must propagate identically to `resourcesSlice` after every selection event             | resource-identity | Incorrect resource loads in the editor after selecting from the tree           |
| Parent-child folder associations (resource `folderId`) must not be altered by the extraction                                  | resource-identity | Resources appear under the wrong folder after a reparent operation             |
| Non-drag selection semantics (click, keyboard) must remain unchanged                                                          | none              | Keyboard users cannot select resources                                         |

## Non-Goals

- Do not redesign tree icons, expand/collapse animation, or visual styling.
- Do not change the drag-drop library integration or event schema.
- Do not alter folder or resource create/delete flows — those are `resourcesSlice` scope.
- Do not merge `ResourceTree` with the sidebar or any other panel.
- Do not change the API route called by `persistReorder`.

## Style-Alignment Mappings

| Rule   | Applies To                                                       | Action Required                                                                                                  |
| ------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| SR-005 | Tree adapter if it normalizes unknown API shapes                 | Replace `as any` casts with `as unknown as TypedShape` narrowing                                                 |
| SR-008 | Tree adapter helper functions (node builders, type guards)       | Keep helpers unexported; promote to shared utilities only when a second caller is identified                     |
| SR-010 | `buildResourceTree` adapter                                      | Keep adapter single-purpose; do not add selection or reorder logic to the adapter file                           |
| SR-014 | `buildResourceTree` if it spans `folders` and `resources`        | Wrap in `createSelector` to prevent derivation re-running on every render                                        |
| SR-018 | `useResourceReorder` hook and slim `ResourceTree`                | Use `useAppSelector`/`useAppDispatch`; do not import from `react-redux` directly                                 |
| SR-032 | `ResourceTree.tsx` currently uses `uniq` from full lodash import | Replace lodash `uniq` with native `[...new Set(arr)]` or use path import `lodash/uniq`; known drift per tome-007 |
| SR-033 | Any remaining lodash usage introduced during extraction          | Use path imports (`import uniq from 'lodash/uniq'`) or `lodash-es`; never `import { uniq } from 'lodash'`        |
| AP-003 | Tree adapter for project-view-style adapter casts                | Remove permissive `as any` casts; use typed helpers drawn from stable model layer                                |
| AP-008 | Slim `ResourceTree` component body                               | Do not derive tree structure in JSX; consume the memoized adapter result                                         |
| AP-010 | Component-level selector definitions                             | Move any remaining inline selectors from `ResourceTree` body into `resourcesSlice.ts`                            |
