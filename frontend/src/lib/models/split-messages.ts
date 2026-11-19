/**
 * @module split-messages
 *
 * Feature 120, FR-2, FR-6, FR-7, FR-17, FR-18, OQ-12: every refusal, notice,
 * failure, host and Undo text of "Split a document at the cursor", in one
 * module, as `lib/sharing/limits-copy.ts` does for paired-device limits. The
 * wording was reviewed and kept as drafted by the owner (Task 28, 2026-11-17).
 *
 * Texts are plain, state what happened, and name no mechanism. None takes or
 * echoes client input: every lookup key is a closed enum of the contract.
 * No React, JSX, JSON or `node:*`.
 */
import {
  SPLIT_REFUSAL_REASONS,
  type SplitRefusalReason,
  type SplitRemainingState,
  type SplitStep,
} from "./split-types";
import type { SplitIndexStep } from "./split-index-update";
import type {
  SplitOffState,
  SplitUndoRemainingState,
  SplitUndoStep,
} from "./split-undo-core";

/** A step after a split that can fail without undoing it: an index step or the new document's word count. */
export type SplitIndexFailureStep = SplitIndexStep | "word-count";

/** Refusals known before or at a split (FR-2, FR-6, FR-7, FR-14). One per reason code. */
export const SPLIT_REFUSAL_MESSAGES: Record<SplitRefusalReason, string> = {
  [SPLIT_REFUSAL_REASONS.mediaResource]:
    "An image or audio file has no text to split.",
  [SPLIT_REFUSAL_REASONS.folder]: "A folder has no text to split.",
  [SPLIT_REFUSAL_REASONS.source]:
    "A Source cannot be split. Its notes and attachments belong together.",
  [SPLIT_REFUSAL_REASONS.entityDocument]:
    "A document set up as an entity cannot be split. Remove the entity first if you want to split it.",
  [SPLIT_REFUSAL_REASONS.mergedDocument]:
    "A document made by merging cannot be split.",
  [SPLIT_REFUSAL_REASONS.cursorInTableCell]:
    "The cursor is inside a table cell. Move it out of the table to split here.",
  [SPLIT_REFUSAL_REASONS.cursorInCodeBlock]:
    "The cursor is inside a code block. Move it out of the code block to split here.",
  [SPLIT_REFUSAL_REASONS.emptyFirstHalf]:
    "There is no text before the cursor, so the first part would be empty. Move the cursor later in the document.",
  [SPLIT_REFUSAL_REASONS.emptySecondHalf]:
    "There is no text after the cursor, so the second part would be empty. Move the cursor earlier in the document.",
  [SPLIT_REFUSAL_REASONS.staleCursor]:
    "The document changed after you placed the cursor. Place the cursor again and retry.",
  [SPLIT_REFUSAL_REASONS.lockedProject]:
    "This project is locked. Unlock it to split a document.",
  [SPLIT_REFUSAL_REASONS.stepFailed]:
    "The split could not be finished. The message that follows says what state your document is in.",
};

/** The refusals of Undo split (FR-17). */
export const SPLIT_UNDO_REFUSAL_REASONS = [
  "original-gone",
  "original-in-trash",
  "original-purged",
  "snapshot-gone",
  "split-off-split-since",
] as const;

/** One reason Undo split is refused. Defined here: `split-types.ts` is not edited by this task. */
export type SplitUndoRefusalReason =
  (typeof SPLIT_UNDO_REFUSAL_REASONS)[number];

/** Undo refusals, one distinct text each (FR-17). Undo changes nothing when it refuses. */
export const SPLIT_UNDO_REFUSAL_MESSAGES: Record<
  SplitUndoRefusalReason,
  string
> = {
  "original-gone":
    "The document that was split can no longer be found, so the split cannot be undone.",
  "original-in-trash":
    "The document that was split is in the Trash. Restore it first to undo the split.",
  "original-purged":
    "The document that was split has been permanently removed, so the split cannot be undone.",
  "snapshot-gone":
    "The saved copy of the document from before the split is no longer kept, so the split cannot be undone.",
  "split-off-split-since":
    "The new document has been split again since. Undo that split first, or leave this one as it is.",
};

/** Notice of FR-6 and FR-10: the list of documents left out of compile is full or unreadable. */
export const SPLIT_COMPILE_EXCLUSION_NOTICE =
  "The document was split. The new part could not be added to the list of documents left out of compile, because that list is full or could not be read. It will be included in compile unless you leave it out yourself.";

/** What remains on disk after a failed split (FR-6), one text per state. */
export const SPLIT_FAILED_REMAINING_STATE_MESSAGES: Record<
  SplitRemainingState,
  string
> = {
  "original-restored":
    "Your document is as it was before, and nothing new was kept.",
  "snapshot-revision-kept":
    "Your document is as it was before. A saved copy of it from before the split was kept in its revisions.",
  "new-document-remains":
    "A new document may have been left behind. Check the project for it and delete it if you do not want it.",
  "original-truncated":
    "Your original document was shortened, but the split was not recorded. Its earlier text is in the revision saved just before the split.",
  "state-unknown":
    "It could not be checked what was changed. Look at the document and its revisions before you carry on.",
};

/** The step a failed split stopped at, in words (FR-6). One label per step. */
export const SPLIT_FAILED_STEP_LABELS: Record<SplitStep, string> = {
  "lock-original": "securing the document",
  snapshot: "saving a copy of the document",
  "create-document": "creating the new document",
  "move-annotations": "moving notes to the new document",
  "seed-exclusion": "updating the list of documents left out of compile",
  truncate: "shortening the original document",
  "write-records": "recording the split",
};

/**
 * The text for a failed split: the step it stopped at and the state that
 * remains. It always says the split did not finish, so it never reads as success.
 */
export function describeSplitFailure(
  step: SplitStep,
  remaining: SplitRemainingState,
): string {
  return `The split did not finish. It stopped while ${SPLIT_FAILED_STEP_LABELS[step]}. ${SPLIT_FAILED_REMAINING_STATE_MESSAGES[remaining]}`;
}

/**
 * The text when the split was saved but its derived data could not be
 * brought up to date (FR-9). `reindex` rewrites the inverted index, the
 * annotation-body index, backlinks and the mention index; it does not rebuild
 * prose diagnostics or word counts, which the document's next save writes
 * (Owner decision, Gate 5, 2026-11-16). No sentence that names `reindex`
 * names diagnostics.
 */
export const SPLIT_INDEX_FAILURE_MESSAGE =
  "The split was saved, but some search and link data for the two documents could not be brought up to date. Running reindex repairs the search index, the notes search index, links and mentions. Prose diagnostics and word counts refresh the next time you save the document.";

/** What was not brought up to date, in words. One label per failing step. */
export const SPLIT_INDEX_STEP_LABELS: Record<SplitIndexFailureStep, string> = {
  "read-content": "reading the saved text",
  "read-sidecar": "reading the document's details",
  "inverted-index": "the search index",
  "annotation-index": "the notes search index",
  backlinks: "links between documents",
  "mention-index": "name mentions",
  diagnostics: "prose diagnostics",
  "word-count": "the new document's word count",
};

/** The text for an index failure after a saved split: the general text, then what was not updated. */
export function describeSplitIndexFailure(
  steps: readonly SplitIndexFailureStep[],
): string {
  const labels = [...new Set(steps)].map(
    (step) => SPLIT_INDEX_STEP_LABELS[step],
  );
  return `${SPLIT_INDEX_FAILURE_MESSAGE} Not brought up to date: ${labels.join(", ")}.`;
}

/** Host texts (Task 25): the split could not be started, or finished on the client. */
export const SPLIT_SAVE_FAILED_MESSAGE =
  "Your latest edits could not be saved, so the document was not split. Nothing was changed.";
export const SPLIT_READ_FAILED_MESSAGE =
  "The saved document could not be read, so it was not split. Nothing was changed.";
export const SPLIT_UNEXPECTED_FAILURE_MESSAGE =
  "The split could not be started. Nothing was changed.";
export const SPLIT_RELOAD_FAILED_MESSAGE =
  "The split was saved, but the document could not be read back into the editor. The editor is read-only until you open another document and come back, so the text before the split cannot be saved over the result.";
export const SPLIT_TREE_REFRESH_FAILED_MESSAGE =
  "The document was split, but the project tree could not be refreshed. Reopen the project to see the new document.";

/** The success toast's title. */
export const SPLIT_SUCCESS_TITLE = "Document split";

/** The success toast's body; `newName` comes from the project tree. */
export function describeSplitSuccess(newName: string): string {
  return `The text after the cursor is now the new document “${newName}”.`;
}

// Undo split texts (Task 32, FR-17, FR-18). The five Undo refusal texts are
// `SPLIT_UNDO_REFUSAL_MESSAGES` above. Each text states what happened and what
// state remains, and says "nothing was changed" only where the code returns
// before any write. The document name is the only dynamic part and comes from
// the project tree.

/** The action's name in the palette and the editor menu. */
export const UNDO_SPLIT_LABEL = "Undo split";

/**
 * The Dismiss button of an Undo toast, split or merge (Feature 121 Task 41;
 * drafted, not reviewed by the owner).
 */
export const UNDO_TOAST_DISMISS_LABEL = "Dismiss";

/** What stands in for the split-off document's name when the project tree has no document with its id. */
export const UNDO_SPLIT_UNKNOWN_NAME_PHRASE =
  "the new document made by the split (its name could not be found in the project)";

/**
 * The action's description (FR-18): names the split-off document, says it goes
 * to Trash and that edits made since are kept. `name` is null when the tree
 * has no document with that id; the unknown-name phrase is used instead.
 */
export function describeUndoSplitAction(name: string | null): string {
  const subject = name === null ? UNDO_SPLIT_UNKNOWN_NAME_PHRASE : `“${name}”`;
  return `Moves ${subject} to the Trash and puts the document that was split back as it was before the split. Edits made since the split are kept in saved revisions.`;
}

/** The read of the latest operation failed; this is not "no split". */
export const UNDO_SPLIT_READ_FAILED_MESSAGE =
  "Whether a split can be undone could not be checked. This does not mean there is nothing to undo. Nothing was changed.";

/** The read failed because the project is locked. */
export const UNDO_SPLIT_READ_LOCKED_MESSAGE =
  "The project is locked, so whether a split can be undone could not be checked. Unlock the project and try again. Nothing was changed.";

/** Undo started and is waiting for the server. */
export const UNDO_SPLIT_WORKING_MESSAGE = "Undoing the split.";

/** Pending saves failed, so no Undo was sent. */
export const UNDO_SPLIT_SAVE_FAILED_MESSAGE =
  "Your latest edits could not be saved, so the split was not undone. Nothing was changed.";

/** The project is locked and the unlock was not given. */
export const UNDO_SPLIT_LOCKED_MESSAGE =
  "The project is locked, so the split was not undone. Unlock the project and try again. Nothing was changed.";

/** The request was never sent because it was not valid. */
export const UNDO_SPLIT_INVALID_REQUEST_MESSAGE =
  "The Undo split request was not valid and was not sent. Nothing was changed.";

/** The request did not complete: whether Undo ran is not known. */
export const UNDO_SPLIT_TRANSPORT_FAILED_MESSAGE =
  "The Undo split request did not complete, so it is not known whether it ran. Check both documents and the Trash before trying again.";

/** Something unexpected stopped the client before or after the request. */
export const UNDO_SPLIT_UNEXPECTED_FAILURE_MESSAGE =
  "Undo split could not be completed. Check both documents and the Trash before trying again.";

/** The stored text could not be read back into the open editor after a committed Undo. */
export const UNDO_SPLIT_RELOAD_FAILED_MESSAGE =
  "The split was undone, but the document could not be read back into the editor. The editor is read-only until you open another document and come back, so the text from before the split cannot be saved over the result.";

/** The tree could not be re-read after a committed Undo. */
export const UNDO_SPLIT_TREE_REFRESH_FAILED_MESSAGE =
  "The split was undone, but the project tree could not be refreshed. Reopen the project to see the current documents.";

/** The open document was the split-off one, which is now in the Trash. */
export const UNDO_SPLIT_OPEN_DOCUMENT_IN_TRASH_MESSAGE =
  "The document shown in the editor is the one that went to the Trash. It is read-only until you open another document.";

/** Added when a failed Undo leaves the state not as it was: the editor is held read-only. */
export const UNDO_SPLIT_EDITOR_HELD_MESSAGE =
  "The editor is read-only until you open another document, so text from before this attempt cannot be saved over what is stored.";

/** `nothing-to-undo`: the record had been cleared by the time Undo ran. */
export const UNDO_SPLIT_NOTHING_TO_UNDO_MESSAGE =
  "There is no split to undo any more. Nothing was changed.";

/** `unsupported-operation`: the latest operation is not a split. */
export const UNDO_SPLIT_UNSUPPORTED_OPERATION_MESSAGE =
  "The latest operation is not a split, so Undo split cannot undo it. Nothing was changed.";

/** `could-not-be-checked`: Undo's own read failed before any write. */
export const UNDO_SPLIT_COULD_NOT_BE_CHECKED_MESSAGE =
  "Whether the split can be undone could not be checked, because the saved documents could not be read. Nothing was changed.";

/** Where a failed Undo stopped, in words. */
export const UNDO_SPLIT_STEP_LABELS: Record<SplitUndoStep, string> = {
  "save-current-text": "saving the current text of the documents",
  "restore-original": "putting back the text of the document that was split",
  "move-annotations": "moving the notes back",
  "trash-split-off": "moving the new document to the Trash",
  "remove-exclusion": "updating the list of documents left out of compile",
  "clear-record": "clearing the record of the split",
};

/**
 * What remains after a failed Undo, one text per state. Each names the state
 * that remains; `split-restored` and `state-unknown` say so plainly.
 */
export const UNDO_SPLIT_REMAINING_STATE_MESSAGES: Record<
  SplitUndoRemainingState,
  string
> = {
  "split-restored":
    "Everything was put back as it was before Undo split started: the split is still in place and the new document was not moved.",
  "record-not-restored":
    "The documents were put back as they were, but the record that lets Undo split be offered could not be put back, so Undo split may no longer be offered for this split.",
  "exclusion-not-restored":
    "The documents were put back as they were, but the new document is no longer in the list of documents left out of compile, so compile includes it unless you leave it out yourself.",
  "split-off-in-trash":
    "The new document stayed in the Trash, and its notes stayed on the document that was split. Restore the new document from the Trash if you want it back.",
  "notes-not-restored":
    "The notes could not all be put back where they were, so some may be on the other document. Check the notes of both documents.",
  "original-not-restored":
    "The text of the document that was split could not be put back as it was before Undo split started. The text it had when Undo split started is kept in a saved revision of that document.",
  "preserved-revisions-kept":
    "The documents were put back as they were, but the saved revisions that Undo split made could not all be deleted, so they remain in the revision lists.",
  "state-unknown":
    "More than one part could not be put back, so the state of the documents is not known. Check both documents, the Trash and the revision lists before trying again.",
};

/** Reasons the client gives for a failed result that has no step: no request ran, or its outcome is unknown. */
const TRANSPORT_FAILED_CAUSE = "transport-failed";
const INVALID_REQUEST_CAUSE = "invalid-request";

/**
 * The text for a failed Undo: where it stopped when that is known, then the
 * state that remains. A request that never ran, or whose outcome is unknown,
 * has its own texts and never reads as the rolled-back state.
 */
export function describeUndoSplitFailure(
  failedStep: SplitUndoStep | null,
  remainingState: SplitUndoRemainingState,
  cause: string,
): string {
  if (cause === INVALID_REQUEST_CAUSE) {
    return UNDO_SPLIT_INVALID_REQUEST_MESSAGE;
  }
  if (cause === TRANSPORT_FAILED_CAUSE) {
    return UNDO_SPLIT_TRANSPORT_FAILED_MESSAGE;
  }
  const stopped =
    failedStep === null
      ? "Undo split did not finish."
      : `Undo split stopped while ${UNDO_SPLIT_STEP_LABELS[failedStep]}.`;
  return `${stopped} ${UNDO_SPLIT_REMAINING_STATE_MESSAGES[remainingState]}`;
}

/** Where the new document ended up, in words, for the success report. */
function describeSplitOffState(
  name: string | null,
  state: SplitOffState,
): string {
  const subject = name === null ? "The new document" : `“${name}”`;
  if (state === "moved-to-trash") return `${subject} is now in the Trash.`;
  if (state === "was-in-trash") {
    return `${subject} was already in the Trash and stays there.`;
  }
  return `${subject} had already been permanently removed, so there was nothing to move.`;
}

/** The success report: where the new document is, the notes put back, and that edits made since are kept. */
export function describeUndoSplitSuccess(
  name: string | null,
  state: SplitOffState,
  movedNoteCount: number,
): string {
  const notes =
    movedNoteCount === 0
      ? ""
      : movedNoteCount === 1
        ? " 1 note was put back on the document that was split."
        : ` ${movedNoteCount} notes were put back on the document that was split.`;
  return `Split undone. ${describeSplitOffState(name, state)}${notes} Edits made since the split are kept in saved revisions.`;
}

/**
 * The report for a committed Undo whose search and link data could not all be
 * brought up to date. Lists what was not updated; `reindex` is named only for
 * what the shared rebuild covers (the search index, the notes search index,
 * links and mentions), and prose diagnostics are said not to be rebuilt by it.
 */
export function describeUndoSplitIndexFailure(
  steps: readonly SplitIndexStep[],
): string {
  const labels = [...new Set(steps)].map(
    (step) => SPLIT_INDEX_STEP_LABELS[step],
  );
  return `The split was undone, but some search and link data for the restored document could not be brought up to date. Running reindex repairs the search index, the notes search index, links and mentions; it does not rebuild prose diagnostics. Not brought up to date: ${labels.join(", ")}.`;
}
