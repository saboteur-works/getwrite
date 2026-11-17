/**
 * @module split-messages
 *
 * Working copy (Feature 120, FR-2, FR-6, FR-7, FR-17, OQ-12): every refusal,
 * notice and failure text of "Split a document at the cursor", in one module,
 * as `lib/sharing/limits-copy.ts` does for paired-device limits. The wording
 * is a draft for the owner to review (Task 28); it is not owner-confirmed.
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
