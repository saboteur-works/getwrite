/**
 * @module EditorContextMenu
 *
 * Right-click context menu scoped to the TipTap editor's `.ProseMirror`
 * content area (`specs/features/editor-context-menu.md`). Wraps the editor's
 * rendered content in the shared shadcn/Radix `ContextMenu` primitive — the
 * same primitive `ResourceContextMenu` and `EditContextMenu` already use —
 * following `EditContextMenu.tsx`'s trigger-wrapping pattern: a `display:
 * contents` span around the children keeps the trigger invisible to layout
 * while still carrying the native `contextmenu` event.
 *
 * This is the Task 2 shell only: `ContextMenuContent` is intentionally empty.
 * Selection capture (Task 3), the clipboard/formatting/select-all actions
 * (Tasks 4-6), and the Markdown-source-mode guard (Task 7) land in later
 * tasks against this same file.
 */
"use client";

import * as React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "../common/UI/ContextMenu";

export interface EditorContextMenuProps {
  /** The editor's rendered content area (TipTap's `EditorContent`). */
  children: React.ReactNode;
}

/**
 * Wraps the TipTap editor's content area so a right-click inside it opens an
 * app-styled context menu instead of the browser's native one (FR-1).
 */
export default function EditorContextMenu({
  children,
}: EditorContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span style={{ display: "contents" }}>{children}</span>
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label="Editor options"
        className="resource-context-menu"
      />
    </ContextMenu>
  );
}
