/**
 * @module splitUndoMessages
 *
 * DRAFT texts for "Undo split" (Feature 120, Task 32, FR-17, FR-18), for the
 * owner's wording review (Task 28). `split-messages.ts` has no Undo-specific
 * text for these cases and is not edited by this task, so they live here as
 * named constants for Task 28 to review and move. The five Undo refusal
 * texts are not repeated here: they are `SPLIT_UNDO_REFUSAL_MESSAGES`
 * (Task 10), already attached to a refused result by the client.
 *
 * Each text states what happened and what state remains, and says "nothing
 * was changed" only where the code returns before any write (a refusal,
 * `nothing-to-undo`, `unsupported-operation`, `could-not-be-checked`, an
 * invalid request that was never sent). No text takes client input; the
 * document name is the only dynamic part and comes from the project tree.
 * No React, JSX, JSON or `node:*`.
 */
import { SPLIT_INDEX_STEP_LABELS } from "../../src/lib/models/split-messages";
import type { SplitIndexStep } from "../../src/lib/models/split-index-update";
import type {
  SplitOffState,
  SplitUndoRemainingState,
  SplitUndoStep,
} from "../../src/lib/models/split-undo-core";

/** The action's name in the palette and the editor menu. */
export const UNDO_SPLIT_LABEL = "Undo split";

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
