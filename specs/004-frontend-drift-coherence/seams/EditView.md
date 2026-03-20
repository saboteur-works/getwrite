# EditView Seam

Refactor seam definition placeholder for EditView hotspot.

# EditView Seam

**Finding**: DF-002 · Rank 2 · Risk: High · Invariant Impact: revisions+canonical
**Target**: `frontend/components/WorkArea/EditView.tsx` (637 lines)
**Drift Types**: responsibility, architectural-boundary, size

## Overview

`EditView` is the primary writing surface. It has absorbed revision and canonical fetch/persistence logic, an autosave state machine with retry, appearance preference listeners, and presentational editor interactions — all in one component. The critical risk is that canonical revision persistence is entangled directly in a UI component, meaning any UI change can inadvertently alter the behavior of a safety-critical data path. This seam's primary goal is to create an explicit, testable boundary between editor UI and canonical revision I/O.

## Seam Splits

| Seam Boundary          | Responsibility                                                                 | Proposed New Unit           | Dependency Direction                                                                  |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------- |
| Revision content fetch | Hydrate editor with canonical revision content on mount and on resource change | `useRevisionContent` hook   | Consumes `revisionsSlice` selectors; reads from `/api/resource/revision/*`            |
| Canonical autosave     | Autosave state machine, save-on-blur, retry logic, loading toast lifecycle     | `useCanonicalAutosave` hook | Depends on `useRevisionContent` for revision identity; dispatches to `revisionsSlice` |
| Presentational shell   | TipTap editor mount, toolbar integration, appearance preference listeners      | `EditView` (trimmed)        | Consumes `useRevisionContent` and `useCanonicalAutosave`; no raw fetch calls          |

## Dependency Order

1. **`revisionsSlice` seam must be stabilized first.** `useRevisionContent` and `useCanonicalAutosave` both dispatch to and read from `revisionsSlice`; the hook interfaces cannot be finalized until the slice's public selector and thunk surface is frozen.
2. **`useRevisionContent` can be extracted before `useCanonicalAutosave`.** It is the lighter hook; autosave depends on revision identity produced by the content hook.
3. **`useCanonicalAutosave` follows revision content extraction.** It requires a stable revision ID from `useRevisionContent` to construct the save payload.
4. **Trimmed `EditView` is the final step.** Once both hooks exist, the component body strips all raw fetch calls and delegates lifecycle to the hooks.

## Blast Radius

| Affected Area                                                      | Coupling Type                                                               | Migration Risk                                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `frontend/components/Layout/AppShell.tsx`                          | Receives editor-save state signals from `EditView` for coordination         | Medium — the outward signal interface must be preserved; internal hook shape is irrelevant to AppShell |
| `frontend/src/store/revisionsSlice.ts`                             | Thunks for revision fetch and canonical save are dispatched from `EditView` | High — any thunk API change must be coordinated between seam extractions                               |
| API routes `/api/resource/revision/*` and `/api/project-resources` | `useRevisionContent` and `useCanonicalAutosave` call these endpoints        | High — endpoint contracts cannot change; hooks wrap, not replace, the existing calls                   |
| Any component or route wrapping `EditView`                         | Prop surface may change slightly during extraction                          | Low — slim `EditView` keeps the same public props                                                      |
| `frontend/components/Editor/MenuBar/MenuBar.tsx`                   | Mounted by `EditView`; no data coupling to the revision path                | Low — toolbar props unchanged                                                                          |

## Public-Behavior Guardrails

| Guardrail                                                                                                          | Invariant Link      | Failure Signal                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------ |
| Only one revision can be canonical at a time; `useCanonicalAutosave` must not create or promote a second canonical | revisions+canonical | Two revisions for the same resource have `canonical: true` simultaneously      |
| Revision linearity must not be broken; save must not skip a version number                                         | revisions+canonical | Version numbers are non-sequential after a save; history gaps appear in review |
| Save-on-blur must flush in the same lifecycle tick as the current implementation                                   | revisions+canonical | Content changes typed immediately before navigation are lost                   |
| Retry logic must not call the save endpoint more than the current maximum retry count                              | revisions+canonical | Duplicate revision entries created from excess retries                         |
| Appearance preference listeners must remain registered for the full component lifetime                             | none                | Theme changes do not apply to the open editor without a reload                 |

## Non-Goals

- Do not alter the TipTap editor configuration or extension set.
- Do not change the route structure or the URL that renders `EditView`.
- Do not alter the canonical revision API response contract.
- Do not redesign the editor toolbar (`MenuBar`) — that is DF-010 scope.
- Do not change how appearance preferences are stored in the backend.

## Style-Alignment Mappings

| Rule   | Applies To                                                                   | Action Required                                                                                   |
| ------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| SR-018 | `EditView` and both extracted hooks                                          | Use `useAppSelector` and `useAppDispatch` from `hooks.ts`; no direct `useSelector`/`useDispatch`  |
| SR-019 | `useCanonicalAutosave` if it uses a mutex or debounce guard                  | Wrap lock acquisition in `try/finally`; release in `finally`                                      |
| SR-020 | `useRevisionContent` and `useCanonicalAutosave` option params                | Absorb defaults with `??` inside the hook; call sites need not specify all options                |
| SR-021 | Background index enqueue in `useCanonicalAutosave` (best-effort side effect) | Mark with explicit `void`; swallow-error comment required                                         |
| SR-023 | Save loading toast in `useCanonicalAutosave`                                 | Capture the loading toast ID; always dismiss after resolution or failure                          |
| SR-025 | `EditView` trimmed component                                                 | Export the `EditViewProps` interface so wrappers can import the type independently                |
| SR-026 | Appearance preference listeners in `EditView`                                | Register in `useEffect` with cleanup return; no listeners outside effects                         |
| SR-028 | Any conditional panel in `EditView`                                          | Use early `return null` guard instead of conditional JSX wrapper                                  |
| SR-029 | `useRevisionContent` and `useCanonicalAutosave`                              | Document with `@param`, `@returns`, and `@throws` for the edge case where save fails exhaustively |
| AP-011 | EditView and hooks                                                           | Do not import `useSelector`/`useDispatch` from `react-redux` directly                             |
| AP-013 | Fire-and-forget patterns in autosave                                         | Any dropped promise must have `void` keyword and an explanatory comment                           |
