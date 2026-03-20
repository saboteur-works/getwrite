# AppShell Seam

Refactor seam definition placeholder for AppShell hotspot.

# AppShell Seam

**Finding**: DF-001 · Rank 6 · Risk: High · Invariant Impact: none
**Target**: `frontend/components/Layout/AppShell.tsx` (1486 lines)
**Drift Types**: size, responsibility, architectural-boundary

## Overview

`AppShell` is the root layout shell for the entire application. Over time it has absorbed layout resizing mechanics, global settings UX, command palette state, project-type loading via `/api/project-types`, editor-save coordination, and orchestration of at least four distinct modal flows (`ContextAction`, `CreateModal`, `ExportModal`, `CompileModal`). No single area is incorrect on its own, but the combination means every modal, every setting change, and every layout resize forces readers to navigate 1486 lines of interleaved concerns. Cross-domain blast radius is the primary risk driver.

## Seam Splits

| Seam Boundary        | Responsibility                                                                  | Proposed New Unit        | Dependency Direction                                                    |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------- |
| Layout resizing      | Panel dimension state, resize handles, collapsed/expanded transitions           | `ShellLayoutController`  | Standalone; receives no slice data                                      |
| Global settings      | Settings panel UX, appearance preferences, persisted config reads               | `ShellSettingsMenu`      | Reads appearance preferences; no invariant-sensitive state              |
| Modal orchestration  | Trigger and lifecycle for ContextAction, CreateModal, ExportModal, CompileModal | `ShellModalCoordinator`  | Imports modal components; receives callbacks from slim shell            |
| Project-type loading | Fetch from `/api/project-types`, selection propagation to children              | `ShellProjectTypeLoader` | Depends on `projectsSlice` being stable; provides types to child routes |
| Slim shell           | Composes the four orchestrators; provides context bridges and event routing     | `AppShell` (trimmed)     | Depends on all four seams above being defined                           |

## Dependency Order

1. **EditView seam must be stabilized first.** AppShell coordinates editor-save state with `EditView`; the editor-save bridge interface cannot be defined until `EditView`'s public API is known.
2. **ProjectTypesManagerPage seam must be complete before `ShellProjectTypeLoader`.** The loader propagates project-type data to the manager page; the data contract depends on that seam.
3. **`ShellModalCoordinator` can be extracted ahead of both.** Modal orchestration does not depend on EditView or project-types being stabilized.
4. **`ShellLayoutController` and `ShellSettingsMenu` are independent** and can be extracted in any order.

## Blast Radius

| Affected Area                                                   | Coupling Type                                               | Migration Risk                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `frontend/components/WorkArea/EditView.tsx`                     | Editor-save coordination callbacks passed from AppShell     | Medium — interface must be preserved; any prop rename touches both sides |
| `frontend/components/project-types/ProjectTypesManagerPage.tsx` | Project-type list data propagated from AppShell's API fetch | Medium — data shape must remain identical                                |
| All routes that import `AppShell`                               | Layout prop-passing                                         | Low — slim shell keeps the same export surface                           |
| All four modal components                                       | Trigger props and close callbacks                           | Low — modal components are themselves not changing in this seam          |
| `frontend/src/store/hooks.ts` (typed hooks)                     | AppShell uses `useAppSelector`/`useAppDispatch`             | Low — correctly typed; no change required                                |

## Public-Behavior Guardrails

| Guardrail                                                                                                  | Invariant Link                                    | Failure Signal                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Editor-save coordination signal must be forwarded to `EditView` with the same timing and event shape       | revisions+canonical (indirect, via EditView)      | Autosave fails to trigger or executes at wrong lifecycle             |
| All four modal flows must continue to open at the same user-interaction trigger points                     | none                                              | Modal fails to open or opens with missing props                      |
| Command palette keyboard shortcut must remain registered at the shell level and produce identical behavior | none                                              | Command palette does not open on the expected key sequence           |
| Project-type list propagated to children must be the same data shape as the current API response           | workspace (indirect, via ProjectTypesManagerPage) | Child components receive undefined or mis-typed project-type entries |
| Layout resize handle behavior must be identical to the current behavior                                    | none                                              | Panels snap to wrong sizes or collapse unexpectedly                  |

## Non-Goals

- Do not change internal behavior of the four modal components (`ContextAction`, `CreateModal`, `ExportModal`, `CompileModal`) — those are DF-004 scope.
- Do not alter global settings storage or persistence logic.
- Do not redesign the layout resizing algorithm or panel dimension values.
- Do not change any route definitions or Next.js page wrappers.
- Do not alter how appearance preferences are stored or loaded from the backend.

## Style-Alignment Mappings

| Rule   | Applies To                                                                                      | Action Required                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| SR-018 | All AppShell sub-units that read from the Redux store                                           | Replace any direct `useSelector`/`useDispatch` with `useAppSelector`/`useAppDispatch` from `hooks.ts`                                             |
| SR-028 | `ShellModalCoordinator` and any conditionally rendered panels                                   | Guard each conditional render block with an early `return null`, not `isOpen && <Panel />`                                                        |
| SR-025 | `ShellLayoutController`, `ShellSettingsMenu`, `ShellModalCoordinator`, `ShellProjectTypeLoader` | Export the props interface alongside each new component                                                                                           |
| SR-030 | All new and migrated components in the shell                                                    | Use token-backed class names only; remove any raw Tailwind utilities on host elements                                                             |
| SR-031 | `ShellModalCoordinator` overlay zones                                                           | Use semantic BEM-style class names (`appshell-modal-root`, `appshell-modal-panel`) with styles in a shared stylesheet                             |
| AP-019 | AppShell and all new orchestrators                                                              | Remove any `text-sm`, `font-medium`, `mt-*`, `px-*` utilities on container/layout elements                                                        |
| TB-003 | Any styling decision during shell decomposition                                                 | Follow token-first resolution order: reuse existing `appshell-*` token utilities, then CSS custom properties, then new utility in `utilities.css` |
