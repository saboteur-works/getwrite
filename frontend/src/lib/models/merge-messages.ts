/**
 * @module merge-messages
 *
 * Feature 121, FR-2, FR-6, FR-9, FR-11, FR-15, FR-16, FR-17 to FR-20, FR-22,
 * FR-23, OQ-12: every refusal, notice, failure, mark and Undo text of "Merge
 * documents", in one module, as `split-messages.ts` does for Split.
 *
 * The wording was reviewed by the owner in Task 37 (Gate 5, 2026-11-19); see
 * `specs/features/merge-documents/experiments/task-37.md`. Texts of the merge
 * host and the Compile dialog live here too (FR-23).
 *
 * Texts are plain, state what happened, and name no mechanism. None takes or
 * echoes client input: every lookup key is a closed enum of the contract, and
 * the only dynamic parts are numbers and a document name read from the project
 * tree by the caller. No React, JSX, JSON or `node:*`.
 */
import {
  MERGE_REFUSAL_REASONS,
  type MergeAnnotationLimitCounts,
  type MergeMarkStateResult,
  type MergeRefusalReason,
  type MergeRemainingState,
  type MergeStep,
} from "./merge-types";
import type { SplitIndexStep } from "./split-index-update";

/** Refusals known before or at a merge. One per reason code of the contract. */
export const MERGE_REFUSAL_MESSAGES: Record<MergeRefusalReason, string> = {
  [MERGE_REFUSAL_REASONS.fewerThanTwo]:
    "Select at least two documents to merge.",
  [MERGE_REFUSAL_REASONS.repeatedId]:
    "The same document appears more than once in the selection.",
  [MERGE_REFUSAL_REASONS.folder]:
    "A folder is in the selection. Folders cannot be merged, so select only documents.",
  [MERGE_REFUSAL_REASONS.mediaResource]:
    "An image or audio file is in the selection. It has no text to merge.",
  [MERGE_REFUSAL_REASONS.source]:
    "A Source is in the selection. A Source cannot be merged. Its notes and attachments belong together.",
  [MERGE_REFUSAL_REASONS.entityDocument]:
    "A document set up as an entity is in the selection. Remove the entity first if you want to merge it.",
  [MERGE_REFUSAL_REASONS.mergedTarget]:
    "The first document you selected was already merged into another document. Choose a different first document.",
  [MERGE_REFUSAL_REASONS.mergedAbsorbed]:
    "A document in the selection was already merged into another document. Remove it from the selection.",
  [MERGE_REFUSAL_REASONS.missingDocument]:
    "A document in the selection can no longer be found.",
  [MERGE_REFUSAL_REASONS.documentInTrash]:
    "A document in the selection is in the Trash. Restore it first, or leave it out.",
  [MERGE_REFUSAL_REASONS.staleContent]:
    "A document changed after the merge dialog opened. Open the dialog again and retry.",
  [MERGE_REFUSAL_REASONS.annotationLimit]:
    "The first document cannot hold all the notes that were chosen to move.",
  [MERGE_REFUSAL_REASONS.tooManyDocuments]:
    "Too many documents are selected to merge at once.",
  [MERGE_REFUSAL_REASONS.lockedProject]:
    "This project is locked. Unlock it to merge documents.",
  [MERGE_REFUSAL_REASONS.stepFailed]:
    "The merge could not be finished. The message that follows says what state your documents are in.",
};

/** The annotation-limit refusal, generic form (FR-9). */
export const MERGE_ANNOTATION_LIMIT_MESSAGE =
  "There would be too many notes on the first document, so nothing was merged. Leave some notes behind, or remove some, and try again.";

/** The document-cap refusal, generic form (FR-15). */
export const MERGE_DOCUMENT_CAP_MESSAGE =
  "You selected too many documents to merge at once. Select fewer and try again. Nothing was changed.";

/** The annotation-limit refusal naming the counts (FR-9). Nothing was written. */
export function describeMergeAnnotationLimit(
  counts: MergeAnnotationLimitCounts,
): string {
  return `The first document has ${counts.existing} notes and ${counts.incoming} more were chosen to move, but a document holds at most ${counts.limit}. Nothing was changed.`;
}

/** The document-cap refusal naming the limit (FR-15). Nothing was written. */
export function describeMergeDocumentCap(limit: number): string {
  return `A merge takes at most ${limit} documents. Select fewer and try again. Nothing was changed.`;
}

/** What remains on disk after a failed merge (FR-6), one text per state. */
export const MERGE_FAILED_REMAINING_STATE_MESSAGES: Record<
  MergeRemainingState,
  string
> = {
  "documents-restored":
    "Your documents are as they were before, and nothing new was kept.",
  "snapshot-revisions-kept":
    "Your documents are as they were before. Saved copies of them from before the merge were kept in their revisions.",
  "partially-written":
    "Some documents may have been changed. Look at each document and its revisions: a copy of the text from before the merge was saved just before any change.",
  "state-unknown":
    "It could not be checked what was changed. Look at the documents and their revisions before you carry on.",
};

/** The step a failed merge stopped at, in words (FR-6). One label per step. */
export const MERGE_FAILED_STEP_LABELS: Record<MergeStep, string> = {
  "lock-documents": "securing the documents",
  snapshot: "saving copies of the documents",
  "move-annotations": "moving notes to the first document",
  "write-marks": "marking the documents that were merged",
  "strip-absorbed-marks": "removing note marks from the merged documents",
  "append-to-target": "adding the text to the first document",
  "write-records": "recording the merge",
};

/** The text for a failed merge: the step it stopped at and the state that remains. Never reads as success. */
export function describeMergeFailure(
  step: MergeStep,
  remaining: MergeRemainingState,
): string {
  return `The merge did not finish. It stopped while ${MERGE_FAILED_STEP_LABELS[step]}. ${MERGE_FAILED_REMAINING_STATE_MESSAGES[remaining]}`;
}

/**
 * The text for an index failure after a saved merge (FR-12). The merge is
 * applied and stays applied. `reindex` rewrites four indexes and not prose
 * diagnostics, so the text says the diagnostics refresh on the next save.
 */
export const MERGE_INDEX_FAILURE_MESSAGE =
  "The merge was saved, but some search and link data for the merged documents could not be brought up to date. Running reindex repairs the search index, the notes search index, links and mentions. Prose diagnostics refresh the next time you save the document.";

/** What was not brought up to date, in words. One label per failing step. */
export const MERGE_INDEX_STEP_LABELS: Record<SplitIndexStep, string> = {
  "read-content": "reading the saved text",
  "read-sidecar": "reading the document's details",
  "inverted-index": "the search index",
  "annotation-index": "the notes search index",
  backlinks: "links between documents",
  "mention-index": "name mentions",
  diagnostics: "prose diagnostics",
};

/** The text for an index failure after a saved merge: the general text, then what was not updated. */
export function describeMergeIndexFailure(
  steps: readonly SplitIndexStep[],
): string {
  const labels = [...new Set(steps)].map(
    (step) => MERGE_INDEX_STEP_LABELS[step],
  );
  return `${MERGE_INDEX_FAILURE_MESSAGE} Not brought up to date: ${labels.join(", ")}.`;
}

/** Warning (OQ-12): the target is left out of compile while an absorbed document is not. The merge proceeds. */
export const MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING =
  "The first document is left out of compile, so the text added to it will be left out of compile too. You can still merge.";

/** Warning (OQ-12): the target is in the Inbox, so it is left out of the goals. The merge proceeds. */
export const MERGE_TARGET_IN_INBOX_WARNING =
  "The first document is in the Inbox, so the text added to it will not count toward your goals. You can still merge.";

/** The merged-mark texts for the states beyond live (FR-16). Never blank, never the live label. */
export const MERGE_MARK_STATE_MESSAGES = {
  "revision-no-longer-kept":
    "Merged into another document, whose saved copy from before the merge is no longer kept",
  "target-in-trash": "Merged into a document that is now in the Trash",
  "target-permanently-removed":
    "Merged into a document that has been permanently removed",
  "could-not-be-checked":
    "Merged into another document, which could not be checked",
} as const;

/**
 * The tree label for a merged document (FR-16). `targetName` comes from the
 * project tree; a live state with no name is shown as could-not-be-checked,
 * never as a blank. The resolver's `cause` is never shown.
 */
export function describeMergedMarkLabel(
  result: MergeMarkStateResult,
  targetName: string | null,
): string {
  if (result.state !== "available") {
    return MERGE_MARK_STATE_MESSAGES[result.state];
  }
  if (targetName === null) {
    return MERGE_MARK_STATE_MESSAGES["could-not-be-checked"];
  }
  return `Merged into “${targetName}”`;
}

/** One rule text per surface of FR-17 to FR-20. */
export const MERGED_RULE_TEXTS = {
  compile: "It is left out of compile, in every format.",
  exportAndSearch: "It is still included in export and still found by search.",
  goals:
    "It no longer counts toward the project goal or the goal filter. For the daily goal, words written before the merge still count.",
  wordCounts:
    "Its words are left out of the project word totals. Its own word count is unchanged.",
} as const;

/** The rule in one line, for the tree label's accessible description (FR-16). */
export const MERGED_TREE_LABEL_RULE =
  "Left out of compile, goals and word totals. Still exported and searchable.";

/** The notice line at the top of an open merged document (FR-16). The editor stays editable. */
export const MERGED_NOTICE_LINE =
  "It is left out of compile, goals and word totals, but it is still exported and found by search. You can still edit it.";

/** Undo merge refusals (FR-22). Undo changes nothing when it refuses. */
export const UNDO_MERGE_REFUSAL_MESSAGES = {
  "target-gone":
    "The document the others were merged into can no longer be found, so the merge cannot be undone.",
  "snapshot-gone":
    "The saved copy of the first document from before the merge is no longer kept, so the merge cannot be undone.",
} as const;

/**
 * The Undo merge action's description (FR-22): names the target and the
 * number of absorbed documents. `targetName` is null when the tree has no
 * document with that id.
 */
export function describeUndoMergeAction(
  targetName: string | null,
  absorbedCount: number,
): string {
  const subject =
    targetName === null
      ? "the first document (its name could not be found in the project)"
      : `“${targetName}”`;
  const noun = absorbedCount === 1 ? "document" : "documents";
  return `Puts ${subject} back as it was before the merge and removes the merged mark from the ${absorbedCount === 1 ? "other" : `${absorbedCount} other`} ${noun}. Edits made since the merge are kept in saved revisions.`;
}

/** The Compile dialogs' statement of the merged-away rule (FR-17). Shown only when a document being compiled is merged. */
export const COMPILE_MERGED_NOTICE =
  "Documents merged into another document are left out of every compile.";

/** Host text: the pending edits could not be saved before the merge. */
export const MERGE_SAVE_FAILED_MESSAGE =
  "Your latest edits could not be saved, so the documents were not merged. Nothing was changed.";
/** Host text: a stored document could not be read before the merge. */
export const MERGE_READ_FAILED_MESSAGE =
  "A saved document could not be read, so the documents were not merged. Nothing was changed.";
/** Host text: the merge could not be started. */
export const MERGE_UNEXPECTED_FAILURE_MESSAGE =
  "The merge could not be started. Nothing was changed.";
/** Host text: the merge was saved but the open document could not be read back. */
export const MERGE_RELOAD_FAILED_MESSAGE =
  "The merge was saved, but the open document could not be read back into the editor. The editor is read-only until you open another document and come back, so the text from before the merge cannot be saved over the result.";
/** Host text: the merge was saved but the project tree could not be refreshed. */
export const MERGE_TREE_REFRESH_FAILED_MESSAGE =
  "The documents were merged, but the project tree could not be refreshed. Reopen the project to see the current documents.";
/** The success toast's title. */
export const MERGE_SUCCESS_TITLE = "Documents merged";

/** The success toast's body; the name comes from the preview the writer saw. */
export function describeMergeSuccess(
  targetName: string,
  absorbedCount: number,
): string {
  const others =
    absorbedCount === 1
      ? "1 other document"
      : `${absorbedCount} other documents`;
  return `The text of ${others} was added to the end of “${targetName}”.`;
}
