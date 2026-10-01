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
 * Task 3 (FR-9): the component now receives the live TipTap `Editor`
 * instance (the same prop convention `MenuBar` already uses) and tracks its
 * current ProseMirror selection. A plain `TextSelection` (clicking/selecting
 * text) lets Radix's normal `contextmenu`-triggered open proceed. A
 * `NodeSelection` (e.g. clicking directly on an image node, which TipTap
 * sets via `setNodeSelection`) disables the Radix trigger outright —
 * Radix's `ContextMenuTrigger` skips its own open/`preventDefault` logic
 * entirely when `disabled`, so the browser's native context menu is shown
 * instead. That `disabled` flag has to already be correct *before* the
 * `contextmenu` event fires (Radix decides whether to wire up its internal
 * handler at render time, not inside the event itself), so the selection is
 * tracked reactively via the editor's own `selectionUpdate` event rather
 * than only captured inside the `contextmenu` handler. The `contextmenu`
 * handler itself (mirroring `EditContextMenu.tsx`'s capture-at-event-time
 * pattern) re-captures the selection at the moment of the right-click as a
 * defensive refresh and to freeze the `from`/`to`/empty/read-only details
 * Tasks 4-6 will read to decide which menu items to enable.
 *
 * `ContextMenuContent` stays empty — the clipboard/formatting/select-all
 * actions (Tasks 4-6) and the Markdown-source-mode guard (Task 7) land in
 * later tasks against this same file.
 */
"use client";

import * as React from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "../common/UI/ContextMenu";

export interface EditorContextMenuProps {
  /** The editor's rendered content area (TipTap's `EditorContent`). */
  children: React.ReactNode;
  /** The live TipTap editor instance whose selection gates the menu (FR-9). */
  editor: Editor;
}

/** A snapshot of the editor's ProseMirror selection at a point in time. */
export interface CapturedEditorSelection {
  from: number;
  to: number;
  isEmpty: boolean;
  /** True for a plain text cursor/range selection. */
  isTextSelection: boolean;
  /** True for a selected node (e.g. an image), which has no text range. */
  isNodeSelection: boolean;
  /** True when the editor is not currently editable. */
  readOnly: boolean;
}

function captureEditorSelection(editor: Editor): CapturedEditorSelection {
  const { selection } = editor.state;
  return {
    from: selection.from,
    to: selection.to,
    isEmpty: selection.empty,
    isTextSelection: selection instanceof TextSelection,
    isNodeSelection: selection instanceof NodeSelection,
    readOnly: !editor.isEditable,
  };
}

/**
 * Wraps the TipTap editor's content area so a right-click inside it opens an
 * app-styled context menu instead of the browser's native one (FR-1), gated
 * on the editor's current selection kind (FR-9).
 */
export default function EditorContextMenu({
  children,
  editor,
}: EditorContextMenuProps) {
  const [captured, setCaptured] = React.useState<CapturedEditorSelection>(() =>
    captureEditorSelection(editor),
  );

  React.useEffect(() => {
    const syncSelection = () => setCaptured(captureEditorSelection(editor));
    syncSelection();
    editor.on("selectionUpdate", syncSelection);
    editor.on("transaction", syncSelection);
    return () => {
      editor.off("selectionUpdate", syncSelection);
      editor.off("transaction", syncSelection);
    };
  }, [editor]);

  const handleContextMenu = React.useCallback(() => {
    setCaptured(captureEditorSelection(editor));
  }, [editor]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={captured.isNodeSelection}>
        <span onContextMenu={handleContextMenu} style={{ display: "contents" }}>
          {children}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label="Editor options"
        className="resource-context-menu"
      />
    </ContextMenu>
  );
}
