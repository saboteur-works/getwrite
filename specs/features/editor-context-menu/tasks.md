# Editor Context Menu — Tasks

Source spec: `specs/features/editor-context-menu.md`

### Task 1: Spike — verify captured ProseMirror selection survives Radix ContextMenu
**What:** A throwaway, in-repo verification (a Storybook story or a scratch test harness wrapping `.ProseMirror` in the shadcn/Radix `ContextMenu` primitive) that captures `editor.state.selection` `from`/`to` in a native `contextmenu` handler — mirroring `EditContextMenu.tsx`'s capture pattern — opens the Radix menu, activates a single test action (e.g. `toggleBold`) routed through `editor.chain().focus()...run()` using the captured range, and confirms the resulting document state matches what was captured, not whatever the live selection happened to be at activation time.
**Files:** A temporary spike file/story under `frontend/components/Editor/` or `frontend/stories/` (not merged as the final component); notes on the outcome recorded in a follow-up comment or commit message, not in the spec itself.
**Done when:** The spike has been run manually (dev server or Storybook) and one of two outcomes is confirmed and recorded: (a) the captured selection survives Radix's trigger/portal/focus handling unchanged, so Task 3 onward can build directly on `EditContextMenu.tsx`'s capture pattern, or (b) it does not survive, in which case the specific divergence (e.g. focus moves before capture, selection resets on portal mount) is written down so Task 3 can design around it instead of assuming parity.
**Depends on:** none
**Estimate:** 2
**Notes:** This gates every other implementation task per the spec's Technical Considerations. Do not start Tasks 2–9 until this is resolved one way or the other. If outcome (b), re-scope Task 3's "Done when" before proceeding — do not silently keep the `EditContextMenu.tsx`-identical approach.
**Done:** [ ]

### Task 2: Scaffold EditorContextMenu component shell and mount point
**What:** Create the new `EditorContextMenu` component (shadcn/Radix `ContextMenu` wrapping the TipTap editor surface, per the spec's Technical Considerations) and wire it into `frontend/components/TipTapEditor.tsx` so it wraps the rendered `.ProseMirror` content area, with no menu items yet (empty `ContextMenuContent`).
**Files:** New `frontend/components/Editor/EditorContextMenu.tsx` (or sibling path consistent with `EditContextMenu.tsx`'s location); `frontend/components/TipTapEditor.tsx` (mount point).
**Done when:** Right-clicking inside the editor's text content opens an (empty) Radix context menu anchored at the pointer, and the browser's native context menu does not also appear (FR-1). Right-clicking elsewhere in the app is unaffected.
**Depends on:** Task 1
**Estimate:** 3
**Notes:** Use the outcome of Task 1 to decide whether this component captures the selection itself in the native `contextmenu` handler (the assumed path) or needs a different mechanism.
**Done:** [ ]

### Task 3: Capture ProseMirror selection and gate menu open on TextSelection (FR-9)
**What:** Implement the native `contextmenu` capture — ProseMirror `from`/`to`, selection emptiness, editor read-only state — following `EditContextMenu.tsx`'s pattern, and gate whether the menu opens at all on the captured selection being a plain `TextSelection`. When it is a `NodeSelection` (image, table cell, math node, etc.), the menu must not open and the native browser context menu must be allowed through instead.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`.
**Done when:** Right-clicking on plain text opens the menu as before; right-clicking directly on an image (or another node-selected element) shows the browser's native context menu and the new menu does not open, verified for at least an image node (FR-9).
**Depends on:** Task 2
**Estimate:** 3
**Notes:** `setNodeSelection` and TipTap's image node are the spec's named example — use it as the concrete test case. A table-cell/math-node check is a nice-to-have but not required for "Done" if those node types aren't readily reachable in a test harness.
**Done:** [ ]

### Task 4: Cut, Copy, Paste menu items (FR-2, FR-3)
**What:** Add Cut, Copy, and Paste items to the menu, each operating on the captured ProseMirror selection via `editor.chain().focus()....run()`-routed commands (or the equivalent clipboard API call at the captured range), matching `EditContextMenu.tsx`'s disabled-state logic adapted to the ProseMirror selection: Cut and Copy disabled when the captured selection is empty, Cut additionally disabled when the editor is read-only, Paste disabled when the editor is read-only.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`.
**Done when:** With text selected, Cut and Copy are enabled and each produces the same document/clipboard state as the equivalent native keyboard shortcut; with no selection, Cut and Copy render grayed-out and non-activatable (not omitted); with the editor read-only, Cut and Paste render grayed-out and non-activatable; Paste with a non-empty selection replaces that selection with clipboard content at the captured range.
**Depends on:** Task 3
**Estimate:** 5
**Notes:** Disabled items must still render in the menu per FR-2/FR-3 — grayed-out, not hidden.
**Done:** [ ]

### Task 5: Bold/Italic/Underline/Strikethrough/Inline Code menu items (FR-4)
**What:** Add the five formatting items, each invoking the same command the toolbar already uses (`toggleBold`/`toggleItalic`/`toggleUnderline`/`toggleStrike`/`toggleCode` per `toolbar-command-schema.ts`), reflecting that command's own active/disabled state for the captured selection.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`.
**Done when:** Selecting text and activating each formatting item toggles that mark and produces the identical document state as clicking the corresponding toolbar button; each item's active (pressed/checked) and disabled state matches the toolbar's own state (e.g. `state.canBold`/`state.isBold`) for the same selection, verified for all five commands.
**Depends on:** Task 3
**Estimate:** 5
**Notes:** Reuse `toolbar-command-schema.ts`'s existing `isDisabled`/`isActive`/`run` functions for these five ids directly rather than re-deriving the logic, so behavior cannot drift from the toolbar.
**Done:** [ ]

### Task 6: Select All menu item (FR-5)
**What:** Add a Select All item that selects the entire document body, matching the toolbar/keyboard-equivalent behavior.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`.
**Done when:** Activating Select All from the menu selects the whole document's text content, verified by checking the resulting ProseMirror selection spans the full document.
**Depends on:** Task 3
**Estimate:** 2
**Done:** [ ]

### Task 7: Markdown source mode gating (FR-8)
**What:** Ensure the menu does not open, and none of its actions are reachable, when the editor is in Markdown source mode (the raw-text `textarea` view).
**Files:** `frontend/components/Editor/EditorContextMenu.tsx` and/or `frontend/components/TipTapEditor.tsx` (wherever source-mode state is read).
**Done when:** Right-clicking inside the editor while in Markdown source mode shows no menu from this feature (native browser menu or `EditContextMenu`'s existing textarea menu behavior is unaffected, per Non-goals) and the component renders no menu DOM for that mode.
**Depends on:** Task 4, Task 5, Task 6
**Estimate:** 2
**Notes:** This is a guard around the whole menu, so it's cheapest to implement last, once all actions exist, confirming none of them leak through in source mode.
**Done:** [ ]

### Task 8: Keyboard operability (FR-6)
**What:** Verify and, where needed, adjust the menu so every item is reachable and activatable via keyboard only — arrow keys to navigate, Enter/Space to activate, Escape to dismiss — consistent with the resource tree's existing context menu.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`.
**Done when:** With the editor focused, a keyboard-only interaction sequence (open via the keyboard context-menu key or an equivalent trigger, arrow through every item including disabled ones, activate an enabled item, Escape to dismiss) is exercised in a test and passes, matching `ResourceContextMenu`'s existing keyboard test coverage pattern.
**Depends on:** Task 4, Task 5, Task 6
**Estimate:** 3
**Notes:** Radix `ContextMenu` provides most of this for free; this task is primarily verification plus targeted fixes, not a rebuild.
**Done:** [ ]

### Task 9: Visual styling parity (FR-7)
**What:** Style the menu's items, separators, and container using the project's existing color tokens and IBM Plex font stack for both dark and light mode, matching `ResourceContextMenu`/`EditContextMenu`'s existing classes (e.g. `resource-context-menu`, `resource-context-menu-item`), and confirm no item uses the reserved red token.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`; shared styles under `frontend/components/common/UI/ContextMenu/` if a new class is needed.
**Done when:** The menu is visually indistinguishable in style from the existing two context menus in both dark and light mode (manual check or snapshot), and a review of the component's classNames/inline styles confirms no red token is used anywhere in this menu.
**Depends on:** Task 4, Task 5, Task 6
**Estimate:** 2
**Done:** [ ]

### Task 10: Storybook story for EditorContextMenu
**What:** Add a Storybook story for the new `EditorContextMenu` component, covering default (text selected), empty-selection, read-only, and node-selection (menu-does-not-open) states, per `docs/standards/storybook-implementation.md` and mirroring `ResourceContextMenu.stories.tsx`'s structure.
**Files:** New `frontend/stories/Editor/EditorContextMenu.stories.tsx` (or path consistent with existing Editor stories).
**Done when:** The story renders in Storybook showing the menu's default, empty-selection-disabled, and read-only-disabled states without errors.
**Depends on:** Task 4, Task 5, Task 6, Task 9
**Estimate:** 2
**Done:** [ ]

### Task 11: Accessibility test coverage
**What:** Add an a11y-focused test (axe-core check via `frontend/tests/a11y/helpers/axe.ts`, following `docs/standards/accessibility.md`) for the new menu, opting the Storybook story into `parameters: { a11y: { test: "error" } }` if applicable.
**Files:** New `frontend/tests/editorContextMenu.a11y.test.tsx` (mirroring `editContextMenu.test.tsx`'s structure); the Task 10 story file.
**Done when:** The axe-core check passes with no violations for the menu's open state (enabled and disabled item combinations), and the story's a11y parameter is set to `"error"`.
**Depends on:** Task 10
**Estimate:** 2
**Done:** [ ]

### Task 12: Unit/integration tests for menu behavior
**What:** Write unit/integration tests covering FR-1 through FR-9 end to end against the real component — menu-open/prevent-native-menu, Cut/Copy/Paste enablement and effect, each of the five formatting toggles, Select All, keyboard operability, Markdown-source-mode suppression, and NodeSelection fallback — in `frontend/tests/`, following this repo's existing `editContextMenu.test.tsx`/`resourceContextMenu.test.tsx` conventions.
**Files:** New `frontend/tests/editorContextMenu.test.tsx`.
**Done when:** `pnpm test:ci` passes with new tests exercising every FR (FR-1–FR-9) at least once, including the NodeSelection-fallback case (FR-9) and the captured-selection-after-Radix-focus-change case the Task 1 spike investigated.
**Depends on:** Task 4, Task 5, Task 6, Task 7, Task 8
**Estimate:** 5
**Notes:** This is the task that converts the Task 1 spike's finding into a permanent regression test, so a future Radix/TipTap upgrade that breaks the selection-capture assumption is caught automatically.
**Done:** [ ]

## Summary
- Total tasks: 12
- Total estimated effort: 36 points
- Critical path: Tasks 1 → 2 → 3 → 4 → 7 → 12 (Task 7 depends on 4/5/6 jointly, and 12 depends on 4/5/6/7/8 jointly; 4→7→12 is the longest single dependent chain)
- Risks: Task 1 (the spike) is the highest-uncertainty item — if it reveals the captured-selection pattern does not survive Radix's focus/portal behavior, every downstream task from Task 3 onward (selection capture, all five action groups, and the regression tests in Task 12) needs re-scoping before implementation starts. Task 8 (keyboard operability) carries secondary risk since there's no existing precedent for Radix `ContextMenu` keyboard behavior specifically validated against a contenteditable ProseMirror surface losing focus on menu open.

