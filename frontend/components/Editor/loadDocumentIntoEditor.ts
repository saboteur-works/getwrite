import type { Editor } from "@tiptap/core";
import type { Content } from "@tiptap/react";

/**
 * Replaces the editor's whole document with externally-loaded content —
 * a resource or revision the writer selected — without that replacement
 * becoming an undoable step.
 *
 * ProseMirror's history plugin records every transaction that is not marked
 * `addToHistory: false`, and `setContent`'s own `emitUpdate: false` only
 * suppresses Tiptap's `onUpdate`; it does nothing to the undo stack. So a
 * plain `setContent` on load left the load itself sitting in history beneath
 * the writer's own edits, and undo walked straight past their first keystroke
 * into content they never typed.
 *
 * Measured before this existed (2026-09-23, disposable workspace): a resource
 * holding 35 bytes of prose, opened fresh, one short string typed, then undo
 * pressed repeatedly — the document emptied completely and autosave wrote that
 * empty document over `content.txt`, `content.tiptap.json`, and the resource's
 * only revision. See note_68cf31b0.
 *
 * Excluding the load from history rather than clearing the stack afterwards is
 * what `prosemirror-history` 1.5 supports: it exports no clear-history command,
 * only the `"addToHistory"` transaction metadata consulted when the step is
 * recorded.
 */
export function loadDocumentIntoEditor(editor: Editor, content: Content): void {
  editor
    .chain()
    .setMeta("addToHistory", false)
    .setContent(content, { emitUpdate: false })
    .run();
}
