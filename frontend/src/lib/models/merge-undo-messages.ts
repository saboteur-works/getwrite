/**
 * @module merge-undo-messages
 *
 * The refusal texts of Undo merge (Feature 121, FR-22), one distinct text per
 * cause. The two texts `merge-messages.ts` already holds (`target-gone`,
 * `snapshot-gone`) are reused so a rewording there is followed here; the other
 * two are new and are drafted, not reviewed by the owner.
 *
 * No React, JSX, JSON or `node:*`.
 */
import { UNDO_MERGE_REFUSAL_MESSAGES } from "./merge-messages";
import { SPLIT_INDEX_STEP_LABELS } from "./split-messages";
import type { SplitIndexStep } from "./split-index-update";
import type { MergeUndoRemainingState, MergeUndoStep } from "./split-undo-core";

/** Why Undo merge refuses and changes nothing. */
export const MERGE_UNDO_REFUSAL_REASONS = [
  "target-in-trash",
  "target-purged",
  "snapshot-gone",
  "absorbed-snapshot-gone",
] as const;

/** One reason Undo merge is refused. */
export type MergeUndoRefusalReason =
  (typeof MERGE_UNDO_REFUSAL_REASONS)[number];

/** One distinct text per reason. */
export const MERGE_UNDO_REFUSAL_MESSAGES: Record<
  MergeUndoRefusalReason,
  string
> = {
  "target-in-trash":
    "The document the others were merged into is in the Trash. Restore it first to undo the merge.",
  "target-purged": UNDO_MERGE_REFUSAL_MESSAGES["target-gone"],
  "snapshot-gone": UNDO_MERGE_REFUSAL_MESSAGES["snapshot-gone"],
  "absorbed-snapshot-gone":
    "The saved copy of one of the merged documents from before the merge is no longer kept, so the merge cannot be undone.",
};

// --- Undo merge host texts (Task 41) ------------------------------------
//
// Drafted, NOT reviewed by the owner: every text below, in the same plain
// style as the Undo split texts (`split-messages.ts`). The action's
// description is `describeUndoMergeAction` in `merge-messages.ts`, the
// owner-approved wording, reused and not reworded.

/** The action's name in the palette and the editor menu (the name FR-22 gives). */
export const UNDO_MERGE_LABEL = "Undo merge";

/** The read of the latest operation failed; this is not "no merge". */
export const UNDO_MERGE_READ_FAILED_MESSAGE =
  "Whether a merge can be undone could not be checked. This does not mean there is nothing to undo. Nothing was changed.";

/** The read failed because the project is locked. */
export const UNDO_MERGE_READ_LOCKED_MESSAGE =
  "The project is locked, so whether a merge can be undone could not be checked. Unlock the project and try again. Nothing was changed.";

/** Undo started and is waiting for the server. */
export const UNDO_MERGE_WORKING_MESSAGE = "Undoing the merge.";

/** Pending saves failed, so no Undo was sent. */
export const UNDO_MERGE_SAVE_FAILED_MESSAGE =
  "Your latest edits could not be saved, so the merge was not undone. Nothing was changed.";

/** The project is locked and the unlock was not given. */
export const UNDO_MERGE_LOCKED_MESSAGE =
  "The project is locked, so the merge was not undone. Unlock the project and try again. Nothing was changed.";

/** The request was never sent because it was not valid. */
export const UNDO_MERGE_INVALID_REQUEST_MESSAGE =
  "The Undo merge request was not valid and was not sent. Nothing was changed.";

/** The request did not complete: whether Undo ran is not known. */
export const UNDO_MERGE_TRANSPORT_FAILED_MESSAGE =
  "The Undo merge request did not complete, so it is not known whether it ran. Check the merged documents and the revision lists before trying again.";

/** Something unexpected stopped the client before or after the request. */
export const UNDO_MERGE_UNEXPECTED_FAILURE_MESSAGE =
  "Undo merge could not be completed. Check the merged documents and the revision lists before trying again.";

/** The stored text could not be read back into the open editor after a committed Undo. */
export const UNDO_MERGE_RELOAD_FAILED_MESSAGE =
  "The merge was undone, but the document could not be read back into the editor. The editor is read-only until you open another document and come back, so the text from before the undo cannot be saved over the result.";

/** The tree could not be re-read after a committed Undo. */
export const UNDO_MERGE_TREE_REFRESH_FAILED_MESSAGE =
  "The merge was undone, but the project tree could not be refreshed. Reopen the project to see the current documents.";

/** Added when a failed Undo leaves the state not as it was: the editor is held read-only. */
export const UNDO_MERGE_EDITOR_HELD_MESSAGE =
  "The editor is read-only until you open another document, so text from before this attempt cannot be saved over what is stored.";

/** `nothing-to-undo`: the record had been cleared by the time Undo ran. */
export const UNDO_MERGE_NOTHING_TO_UNDO_MESSAGE =
  "There is no merge to undo any more. Nothing was changed.";

/** `could-not-be-checked`: Undo's own read failed before any write. */
export const UNDO_MERGE_COULD_NOT_BE_CHECKED_MESSAGE =
  "Whether the merge can be undone could not be checked, because the saved documents could not be read. Nothing was changed.";

/** Where a failed Undo merge stopped, in words. */
export const UNDO_MERGE_STEP_LABELS: Record<MergeUndoStep, string> = {
  "save-current-text": "saving the current text of the documents",
  "restore-target": "putting back the text of the base document",
  "restore-absorbed": "putting back the text of the other documents",
  "move-annotations": "moving the notes back",
  "clear-marks": "removing the merged mark from the other documents",
  "clear-record": "clearing the record of the merge",
};

/**
 * What remains after a failed Undo merge, one text per state. Each names the
 * state that remains; `merge-restored` and `state-unknown` say so plainly.
 */
export const UNDO_MERGE_REMAINING_STATE_MESSAGES: Record<
  MergeUndoRemainingState,
  string
> = {
  "merge-restored":
    "Everything was put back as it was before Undo merge started: the merge is still in place.",
  "record-not-restored":
    "The documents were put back as they were, but the record that lets Undo merge be offered could not be put back, so Undo merge may no longer be offered for this merge.",
  "marks-not-restored":
    "The documents were put back as they were, but the merged mark of some documents could not be put back, so a document may not show that it was merged.",
  "notes-not-restored":
    "The notes could not all be put back where they were, so some may be on a different document. Check the notes of the merged documents.",
  "documents-not-restored":
    "The text of some documents could not be put back as it was before Undo merge started. The text each document had when Undo merge started is kept in a saved revision of that document.",
  "preserved-revisions-kept":
    "The documents were put back as they were, but the saved revisions that Undo merge made could not all be deleted, so they remain in the revision lists.",
  "state-unknown":
    "More than one part could not be put back, so the state of the documents is not known. Check the merged documents and the revision lists before trying again.",
};

/**
 * The text for a failed Undo merge: where it stopped when that is known, then
 * the state that remains. A request that never ran, or whose outcome is
 * unknown, has its own text and never reads as the rolled-back state.
 */
export function describeUndoMergeFailure(
  failedStep: MergeUndoStep | null,
  remainingState: MergeUndoRemainingState,
  cause: string,
): string {
  if (cause === "invalid-request") return UNDO_MERGE_INVALID_REQUEST_MESSAGE;
  if (cause === "transport-failed") return UNDO_MERGE_TRANSPORT_FAILED_MESSAGE;
  const stopped =
    failedStep === null
      ? "Undo merge did not finish."
      : `Undo merge stopped while ${UNDO_MERGE_STEP_LABELS[failedStep]}.`;
  return `${stopped} ${UNDO_MERGE_REMAINING_STATE_MESSAGES[remainingState]}`;
}

/**
 * The success report: which document is back as it was, how many others lost
 * their mark, any left alone, the notes put back, and that edits are kept.
 * `targetName` is null when the server could not read the name.
 */
export function describeUndoMergeSuccess(
  targetName: string | null,
  absorbedCount: number,
  skippedCount: number,
  movedNoteCount: number,
): string {
  const subject = targetName === null ? "The base document" : `“${targetName}”`;
  const others =
    absorbedCount === 1
      ? "1 other document"
      : `${absorbedCount} other documents`;
  const left =
    skippedCount === 0
      ? ""
      : skippedCount === 1
        ? " 1 of them was in the Trash or permanently removed and was left alone."
        : ` ${skippedCount} of them were in the Trash or permanently removed and were left alone.`;
  const notes =
    movedNoteCount === 0
      ? ""
      : movedNoteCount === 1
        ? " 1 note was put back on a merged document."
        : ` ${movedNoteCount} notes were put back on the merged documents.`;
  return `Merge undone. ${subject} is back as it was before the merge, and the merged mark was removed from the ${others}.${left}${notes} Edits made since the merge are kept in saved revisions.`;
}

/**
 * The report for a committed Undo merge whose search and link data could not
 * all be brought up to date. Names what was not updated, as the split one does.
 */
export function describeUndoMergeIndexFailure(
  steps: readonly SplitIndexStep[],
): string {
  const labels = [...new Set(steps)].map(
    (step) => SPLIT_INDEX_STEP_LABELS[step],
  );
  return `The merge was undone, but some search and link data for the restored documents could not be brought up to date. Running reindex repairs the search index, the notes search index, links and mentions; it does not rebuild prose diagnostics. Not brought up to date: ${labels.join(", ")}.`;
}
