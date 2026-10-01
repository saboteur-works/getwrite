# Editor Context Menu

## Overview

GetWrite's TipTap editor surface (the `.ProseMirror` contenteditable area
rendered by `TipTapEditor.tsx`) currently has no right-click context menu —
right-clicking inside document text falls through to the browser's native
menu, which offers no app-aware formatting actions and is visually
inconsistent with the rest of the app. GetWrite already ships a context menu
for the resource tree (`ResourceContextMenu`) and a generic one for plain
`<input>`/`<textarea>` fields (`EditContextMenu`), but neither reaches the
rich-text editing surface itself. This feature adds a right-click context menu
scoped to the editor's text content, surfacing the clipboard and formatting
actions a writer is most likely to want without leaving the keyboard or
reaching for the toolbar.

## Goals

- A writer can right-click anywhere inside the editor's text content and see
  a context menu offering clipboard and text-formatting actions relevant to
  the current selection.
- The menu's actions operate on the real TipTap/ProseMirror selection and
  produce the same document state as the equivalent toolbar button.
- The menu is fully keyboard-operable (open, navigate, activate, dismiss)
  per WCAG 2.1 AA.
- The menu's visual design is indistinguishable in style (fonts, color
  tokens, dark/light mode) from GetWrite's existing context menus.
- Right-clicking in the editor never also triggers the browser's native
  context menu.

## Non-goals

- Reusing, modifying, or extending `ResourceContextMenu` (resource tree) or
  `EditContextMenu` (plain input/textarea fields) — this is a new,
  independent component scoped to the TipTap surface only.
- Adding any formatting command, link action, table action, or entity action
  that does not already exist in the editor's toolbar command schema
  (`toolbar-command-schema.ts`) or as standard contenteditable clipboard
  behavior.
- A custom contextual menu for right-clicking a specific node type (image,
  table cell, math node) — this spec covers the general text-content case
  only. (See FR-9: that case falls back to the browser's native menu, same
  as today.)
- Touch-and-hold / long-press activation on mobile or tablet. This is a
  confirmed, deliberate scope decision for this iteration, not an oversight:
  this feature is desktop-pointer-only, and Android/touch gets no equivalent
  menu. No functional requirement in this spec implies Android/touch
  coverage.
- A shortcut inside this menu to switch to Markdown source mode, or any
  entity-highlighting-related action. This was explicitly considered (see
  the former OQ-2) and declined, not merely left unconsidered: the action
  set in FR-2–FR-5 is the complete set for v1.

## User stories

- US-1: As a writer, I want to right-click selected text and cut/copy it so
  that I don't have to use a keyboard shortcut or the browser menu.
- US-2: As a writer, I want to right-click and paste at my cursor so that I
  can insert clipboard content without leaving the mouse.
- US-3: As a writer, I want to right-click selected text and toggle bold,
  italic, underline, strikethrough, or inline code so that I can format text
  without reaching for the toolbar.
- US-4: As a writer, I want to right-click and select all document text so
  that I can quickly act on the whole document.
- US-5: As a keyboard-only or assistive-technology user, I want to open and
  operate this menu without a mouse so that formatting is not mouse-only.

## Functional requirements

1. FR-1: Right-clicking inside the editor's `.ProseMirror` content area MUST
   open a context menu anchored at the pointer, and MUST prevent the
   browser's native context menu from also appearing. [US-1]
2. FR-2: The menu MUST offer Cut and Copy, each acting on the current
   ProseMirror text selection; both MUST be disabled — rendered in the menu,
   grayed-out, and non-activatable, not omitted — when the selection is
   empty, and Cut MUST additionally be disabled (same meaning) when the
   editor is read-only. [US-1]
3. FR-3: The menu MUST offer Paste, inserting clipboard content at the
   current cursor position (replacing the selection if non-empty); Paste
   MUST be disabled — rendered in the menu, grayed-out, and
   non-activatable, not omitted — when the editor is read-only. [US-2]
4. FR-4: The menu MUST offer Bold, Italic, Underline, Strikethrough, and
   Inline Code, each invoking the same command the toolbar's equivalent
   button invokes (`toggleBold`/`toggleItalic`/`toggleUnderline`/
   `toggleStrike`/`toggleCode`); each MUST reflect the toolbar's own
   active/disabled state for the current selection. [US-3]
5. FR-5: The menu MUST offer Select All, selecting the entire document body.
   [US-4]
6. FR-6: Every menu item MUST be reachable and activatable using only the
   keyboard (arrow keys to navigate, Enter/Space to activate, Escape to
   dismiss), consistent with the resource tree's existing context menu. [US-5]
7. FR-7: The menu MUST use the project's existing color tokens and font
   stack (IBM Plex) for both dark and light mode, and MUST NOT use the red
   token for any menu item, since red is reserved for canonical-state
   indicators. [US-1]
8. FR-8: The menu MUST NOT open, and no action it would offer MUST be
   available, when the editor is in Markdown source mode (the raw-text
   `textarea` view, not the rich `.ProseMirror` surface). [US-3]
9. FR-9: The menu this spec defines MUST only open when the ProseMirror
   selection at the time of the right-click is a plain `TextSelection`. When
   the selection is a `NodeSelection` (e.g. clicking directly on an image,
   which sets one via `setNodeSelection`, or another node the editor renders
   specially such as a table cell or math node), this feature's menu MUST
   NOT open, and the browser's native context menu MUST be allowed through
   for that right-click instead — today's status quo for every node, since
   no context menu exists yet. [US-1]

## Technical considerations

- This menu reuses the shadcn/Radix `ContextMenu` primitive at
  `frontend/components/common/UI/ContextMenu/ContextMenu.tsx`, consistent
  with `ResourceContextMenu` and `EditContextMenu`.
- It follows the same capture pattern `EditContextMenu.tsx` already uses for
  plain `<input>`/`<textarea>` fields (lines ~69-107 there): capture the
  ProseMirror selection (`editor.state.selection` `from`/`to`) in the native
  `contextmenu` event handler before Radix's trigger/portal logic can steal
  focus, then use that captured selection — not whatever the selection
  happens to be by the time a menu item is activated — to drive each action.
- Every menu action routes through `editor.chain().focus()....run()`, the
  same way `toolbar-command-schema.ts`'s existing commands already do, so
  behavior stays identical to the equivalent toolbar button.
- There is no direct in-repo precedent for Radix `ContextMenu` combined with
  a TipTap/ProseMirror contenteditable surface specifically — only the
  analogous, already-working input/textarea case in `EditContextMenu.tsx`.
  Because of this, the first implementation task should be a short spike
  that confirms the captured ProseMirror selection actually survives Radix's
  focus/portal behavior (open menu, activate an action, verify the resulting
  document state matches the captured selection) before the rest of the
  feature is built on that assumption.

## Open questions

None identified.

## Out of scope (deferred)

- Node-specific context menu variants (image, table cell, math node).
- Mobile/touch long-press activation.
- A "Markdown source" or entity-highlighting shortcut inside this menu.
- Any new formatting command not already present in the toolbar.
