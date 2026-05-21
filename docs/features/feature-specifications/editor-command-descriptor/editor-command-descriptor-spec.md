# Editor Command Descriptor

## Overview

The editor toolbar currently wires action logic, active/disabled state, and submenu scaffolding in-place across `MenuBar.tsx`, `EditorMenuInput.tsx`, and `EditorMenuColorSubmenu.tsx`. This duplication increases drift risk — adding or changing a command requires touching multiple files. The Editor Command Descriptor feature consolidates all toolbar command definitions into a single typed, declarative schema and renders the toolbar entirely from that schema via a resolver hook, eliminating inline wiring duplication.

## Goals

- All toolbar commands are defined in one place (`toolbar-command-schema.ts`) with no duplicate wiring elsewhere.
- A resolver hook (`useToolbarCommands`) binds editor/state context to each command and returns fully resolved render-ready descriptors.
- `MenuBar.tsx` renders purely from resolved descriptors, with no direct TipTap command calls.
- Parity tests verify that every group and every command ID in the schema is present and correctly resolves its `active`, `disabled`, `onClick`/`onChange`/`onSelectColor` bindings.
- Adding a new toolbar command requires touching only `toolbar-command-schema.ts`.

## Non-goals

- Modifying the visual layout or styling of the toolbar.
- Adding or removing any toolbar commands beyond what already exists.
- Exposing the command schema as a user-configurable plugin API.

## User stories

- As a developer, I want to add a new toolbar command by editing a single file so that I do not risk introducing drift between the schema definition and the renderer.
- As a developer, I want a test suite that fails when a command is present in the schema but not covered by the renderer, so that schema-renderer parity is enforced automatically.

## Functional requirements

1. `toolbar-command-schema.ts` **must** export a `toolbarCommandSchema: ToolbarCommandGroup[]` as a plain static array — no runtime registration API.
2. Each command entry **must** carry an `id`, `kind` (`"icon"` | `"input"` | `"color-submenu"`), `tooltipContent`, and all kind-specific fields (`run`, `isActive`, `isDisabled`, `getValue`, `onChange`, `getActiveColor`, `onSelectColor`, `colors`).
3. `useToolbarCommands` **must** accept `(editor, state, editorConfig?)` and return `ResolvedToolbarGroup[]` where all context-dependent callbacks are already bound to the current editor instance.
4. `MenuBar.tsx` **must** render toolbar items using only `ResolvedToolbarGroup[]` from `useToolbarCommands` — no direct `editor.chain()` calls in the component body.
5. Parity tests **must** be Vitest unit tests against `useToolbarCommands` (not Storybook interaction tests) and **must** assert that the count of resolved groups matches `toolbarCommandSchema.length`, and that every command `id` in each group produces a `ResolvedToolbarItem` of the correct `kind`.
6. Parity tests **must** verify that `onClick` / `onChange` / `onSelectColor` on resolved items are functions (not undefined), for every item in the schema.
7. `EditorMenuInput` and `EditorMenuColorSubmenu` **must not** contain inline TipTap command wiring — they **must** be pure presentational components driven entirely by props.

## Open questions

None identified.

## Out of scope (deferred)

- Keyboard shortcut binding per command descriptor.
- Per-command visibility rules (hide commands when the editor extension is not loaded).
- Overflow/collapse behavior for narrow viewports.
