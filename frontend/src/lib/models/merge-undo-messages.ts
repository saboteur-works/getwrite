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
