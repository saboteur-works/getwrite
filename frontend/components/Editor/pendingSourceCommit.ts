/**
 * @module pendingSourceCommit
 *
 * Tracks the Markdown source-mode edit that is still waiting out the
 * source autosave debounce, together with the save function of the resource
 * it was typed into, captured when the edit was made.
 *
 * On a resource switch the editor's `onChange` already belongs to the new
 * resource, so the pending edit cannot go through it (and pushing it through
 * would also load the old text into the editor). It was therefore cancelled,
 * and the last edits before a switch were lost (note_f13a655b). Flushing
 * through the captured save sends them to the resource they belong to
 * without touching the editor.
 */
import type { TipTapDocument } from "../../src/lib/models";

/** Saves a document to the resource it was captured for. */
export type SourceFlush = (doc: TipTapDocument) => void;

interface PendingSourceEdit {
  markdown: string;
  flush: SourceFlush | undefined;
}

export interface PendingSourceCommit {
  /** Records the latest source text and the save to send it to. */
  record(markdown: string, flush: SourceFlush | undefined): void;
  /** Forgets the pending edit (it was committed the normal way). */
  clear(): void;
  /**
   * Sends the pending edit, if any, through its captured save and forgets
   * it. Returns true when something was sent.
   */
  flushTo(convert: (markdown: string) => TipTapDocument): boolean;
}

export function createPendingSourceCommit(): PendingSourceCommit {
  let pending: PendingSourceEdit | null = null;
  return {
    record(markdown, flush) {
      pending = { markdown, flush };
    },
    clear() {
      pending = null;
    },
    flushTo(convert) {
      const edit = pending;
      pending = null;
      if (!edit?.flush) return false;
      edit.flush(convert(edit.markdown));
      return true;
    },
  };
}
