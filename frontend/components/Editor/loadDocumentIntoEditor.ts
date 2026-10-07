import type { Editor } from "@tiptap/core";
import type { Content } from "@tiptap/react";
import isEqual from "lodash/isEqual";

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

/**
 * Decides whether `TipTapEditor.tsx`'s content-sync effect should call
 * {@link loadDocumentIntoEditor} for a newly-received `value`, or skip it
 * because the editor already effectively holds that content.
 *
 * Extracted into its own pure function (entity-mention-navigation,
 * regression for `5cbedfd0`) so the decision is testable without mounting a
 * real TipTap `Editor` — this repo's established convention for this module
 * (see `mentionJumpHighlightExtension.test.ts`'s header) is to never mount a
 * real editor/view in a jsdom test.
 *
 * Two skip conditions, in order:
 * 1. `value` is the exact object reference most recently emitted by
 *    `onUpdate` — the editor already has this content; calling `setContent`
 *    would reset the cursor position for no reason.
 * 2. `value` is a `TipTapDocument` object that is *structurally* identical
 *    to what the editor already holds (`currentJSON`, i.e. `editor.getJSON()`),
 *    even though its object reference differs from `lastEmitted`.
 *    `useRevisionContent.ts` delivers a resource/revision switch's content
 *    in two sequential stages — the resource's own `content.tiptap.json`
 *    first, then the (normally identical) canonical revision's content a
 *    moment later — each a distinct object. Without this check, the second,
 *    redundant delivery re-ran a full document replace purely because it
 *    was a new object, which also wiped any transient, non-content plugin
 *    decoration applied in the gap — including the mention-jump highlight
 *    (entity-mention-navigation FR-8), which could flash and vanish, or
 *    never visibly appear at all, depending on how the two loads happened
 *    to race. Comparing `value` against `currentHTML` (a string) — the only
 *    comparison this function had before `5cbedfd0` — never caught this,
 *    since an object `value` is never `===`/`!==` comparable to a string in
 *    any way that reflects actual content equality.
 *
 * `value !== currentHTML` after both skip checks is the pre-existing,
 * unchanged legacy path for the plain-string `value` case (source-mode
 * editing).
 */
export function shouldSyncEditorContent(
  value: unknown,
  lastEmitted: unknown,
  currentJSON: unknown,
  currentHTML: string,
): boolean {
  if (value === lastEmitted) return false;
  if (typeof value !== "string" && isEqual(value, currentJSON)) return false;
  return value !== currentHTML;
}
