/**
 * @module apply-replacement
 *
 * "Replace with" for a flagged word (spell-checker FR-31, AC-14). Builds and
 * dispatches ONE ProseMirror transaction, so one undo restores the word. The
 * replacement keeps the marks of the replaced text and carries the flagged
 * word's capitalisation (initial capital, all capitals) to the suggestion.
 *
 * The range is the one frozen when the menu opened. Before writing, the text
 * at the range must still equal the flagged word; otherwise nothing is
 * changed and a toast says so (the stale-offset precedent of Mention jump,
 * `components/Editor/offset-resolver.ts`).
 */
import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import { toastService } from "../toast-service";

export const STALE_REPLACEMENT_MESSAGE =
  "The word changed, so it was not replaced.";

export interface ReplacementRange {
  from: number;
  to: number;
}

export type ReplacementResult = "applied" | "stale" | "read-only";

/** Applies the flagged word's capitalisation pattern to a suggestion. */
export function matchCapitalisation(word: string, suggestion: string): string {
  const isAllCaps =
    word.length > 1 &&
    word === word.toUpperCase() &&
    word !== word.toLowerCase();
  if (isAllCaps) return suggestion.toUpperCase();
  const first = word.charAt(0);
  if (first !== first.toLowerCase() && first === first.toUpperCase()) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

/**
 * Replaces `flaggedWord` at `range` with `suggestion` (capitalisation matched,
 * marks of the first replaced text node kept) in one transaction, then
 * returns focus to the editor without scrolling.
 */
export function applyReplacement(
  editor: Editor,
  range: ReplacementRange,
  flaggedWord: string,
  suggestion: string,
): ReplacementResult {
  if (!editor.isEditable) return "read-only";
  const { state } = editor;
  const { from, to } = range;
  const isInDoc = from >= 0 && to <= state.doc.content.size && from < to;
  if (!isInDoc || state.doc.textBetween(from, to) !== flaggedWord) {
    toastService.info(STALE_REPLACEMENT_MESSAGE);
    return "stale";
  }
  let marks: readonly Mark[] = [];
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && marks.length === 0) marks = node.marks;
    return !node.isText;
  });
  const text = state.schema.text(
    matchCapitalisation(flaggedWord, suggestion),
    marks,
  );
  editor.view.dispatch(state.tr.replaceWith(from, to, text));
  editor.commands.focus(undefined, { scrollIntoView: false });
  return "applied";
}
