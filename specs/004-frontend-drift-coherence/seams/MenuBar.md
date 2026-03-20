# MenuBar Seam

**Finding**: DF-010 · Rank 8 · Risk: Medium · Invariant Impact: none
**Target**: `frontend/components/Editor/MenuBar/MenuBar.tsx`, `EditorMenuInput.tsx`, `EditorMenuColorSubmenu.tsx`
**Drift Types**: duplication, responsibility, standards

## Overview

The editor toolbar is implemented as repeated inline `EditorMenuIcon` callbacks in `MenuBar.tsx`, nearly identical submenu wiring in `EditorMenuColorSubmenu.tsx` (color and highlight entries share the same scaffold three times), and per-type state/change scaffolding duplicated across variants in `EditorMenuInput.tsx`. The maintenance risk is that any toolbar behavior change (icon swap, tooltip update, active-state correction) requires hunting and updating multiple independent wiring sites. A config-driven command schema centralizes command definition and makes new commands low-risk to add or remove. The preferred direction is established by `tome-006-editor-toolbar-config-driven-pattern`.

## Seam Splits

| Seam Boundary          | Responsibility                                                                                                                             | Proposed New Unit                  | Dependency Direction                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Toolbar command schema | Declarative definitions of every toolbar command group: icon, tooltip, active-state predicate, disabled-state predicate, handler reference | `toolbar-command-schema.ts`        | No React dependency; exports typed `ToolbarCommand[]` and `ToolbarGroup[]`                 |
| Command execution hook | Resolves active/disabled state and attaches a TipTap editor reference to each command at render time                                       | `useToolbarCommand` hook           | Depends on `toolbar-command-schema.ts` types and the TipTap `editor` instance              |
| Slim MenuBar           | Renders toolbar groups from schema; delegates per-command state to hook; eliminates inline callbacks                                       | `MenuBar` (trimmed)                | Imports `toolbar-command-schema.ts` and `useToolbarCommand`; no inline handler definitions |
| Slim color submenu     | Renders color/highlight options from a sub-schema; eliminates three sets of identical wiring                                               | `EditorMenuColorSubmenu` (trimmed) | Consumes a `ColorCommandGroup` definition from the schema                                  |
| Slim input variants    | Centralizes shared state/change scaffold; variants differentiated by a `type` discriminant from schema                                     | `EditorMenuInput` (trimmed)        | Consumes input type definitions from schema                                                |

## Dependency Order

1. **Fully independent.** This seam has no dependency on slice stabilization, model layer extraction, or other seams.
2. **`toolbar-command-schema.ts` first.** Define the full command/group type before writing any hook or component that consumes it.
3. **`useToolbarCommand` hook second.** Requires the schema type; can be written and tested before MenuBar is trimmed.
4. **Slim `MenuBar`, slim `EditorMenuColorSubmenu`, and slim `EditorMenuInput` in parallel** once the schema and hook are stable.

## Blast Radius

| Affected Area                               | Coupling Type                                                                                                 | Migration Risk                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `frontend/components/WorkArea/EditView.tsx` | Mounts `MenuBar`; passes TipTap `editor` prop                                                                 | Low — slim `MenuBar` keeps the same public prop (`editor`)             |
| TipTap command API                          | All toolbar commands delegate to `editor.chain()...`; config-driven approach wraps, not replaces, these calls | Low — command handlers remain TipTap calls inside the schema resolvers |
| No Redux state                              | MenuBar does not read from or dispatch to the Redux store                                                     | None                                                                   |

## Public-Behavior Guardrails

| Guardrail                                                                                 | Invariant Link | Failure Signal                                                                 |
| ----------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| Every current editor command must remain available and functional after schema extraction | none           | Toolbar icon is missing; clicking it does nothing; TipTap state is not updated |
| Icon, tooltip, and active-state behavior must be preserved per command exactly            | none           | A toolbar button shows active when it should not, or a tooltip is wrong        |
| Color and highlight submenu must produce identical CSS output from the same selection     | none           | Text color changes to a different value than the user selected                 |
| Keyboard shortcuts wired through TipTap must not be affected                              | none           | Keyboard shortcut for bold, italic, etc. stops working                         |

## Non-Goals

- Do not redesign the TipTap command integration or migrate to a different editor extension set.
- Do not change keyboard shortcut behavior.
- Do not add new toolbar commands or remove existing ones during schema extraction.
- Do not alter the editor's content model or document schema.
- Do not change how `MenuBar` receives the `editor` instance from `EditView`.

## Style-Alignment Mappings

| Rule                   | Applies To                                                         | Action Required                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| SR-008                 | `toolbar-command-schema.ts` internal resolver helpers              | Keep unexported; promote to shared utilities only when a second toolbar consumer is confirmed                                          |
| SR-010                 | `toolbar-command-schema.ts`                                        | Single-purpose: command definitions only; no React rendering or TipTap imports                                                         |
| SR-011                 | `toolbar-command-schema.ts`                                        | Group all command groups under one exported `toolbarCommandSchema` constant instead of scattered named exports                         |
| SR-025                 | `MenuBar` (trimmed)                                                | Export the `MenuBarProps` interface so `EditView` can import the type independently                                                    |
| SR-030                 | All MenuBar sub-components                                         | Use token-backed class names; remove any raw Tailwind utilities on toolbar host elements                                               |
| SR-031                 | Color submenu overlay zone                                         | Use semantic BEM-style class names (`editor-menu-bar-*`, `editor-color-submenu-*`); centralize in a scoped stylesheet                  |
| SR-032                 | `useToolbarCommand` or any command helper                          | Do not use lodash for array operations that native methods cover; use lodash only for `debounce` if toolbar input debouncing is needed |
| SR-033                 | Any lodash usage in MenuBar files                                  | Use path imports (`import debounce from 'lodash/debounce'`); never `import { fn } from 'lodash'`                                       |
| AP-019                 | `MenuBar.tsx`, `EditorMenuColorSubmenu.tsx`, `EditorMenuInput.tsx` | Remove raw Tailwind utilities on toolbar container and button elements; replace with token-backed utilities                            |
| TB-006 (if applicable) | Command schema vs inline handler pattern                           | Follow config-driven schema direction per tome-006; inline handler expansion is the anti-pattern being replaced                        |
