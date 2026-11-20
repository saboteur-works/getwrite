/**
 * @module split-types
 *
 * Inert shared contract for "Split a document at the cursor" (Feature 120,
 * FR-2, FR-5, FR-6, FR-7, FR-12, FR-14, FR-15, FR-16). Types and constants
 * only: no behaviour, no React, no JSX, no JSON, no `node:*`, so it is
 * reachable from `core.ts`, the CLI and the Electron workers.
 *
 * A failed outcome never shares a value with an empty or applied one: every
 * result union is discriminated by a field whose values are all distinct.
 */

/** One stable string per refusal (FR-2, FR-6, FR-7, FR-14). */
export const SPLIT_REFUSAL_REASONS = {
  mediaResource: "media-resource",
  folder: "folder",
  source: "source",
  entityDocument: "entity-document",
  mergedDocument: "merged-document",
  cursorInTableCell: "cursor-in-table-cell",
  cursorInCodeBlock: "cursor-in-code-block",
  emptyFirstHalf: "empty-first-half",
  emptySecondHalf: "empty-second-half",
  staleCursor: "stale-cursor",
  lockedProject: "locked-project",
  stepFailed: "step-failed",
} as const;

/** One refusal reason string. */
export type SplitRefusalReason =
  (typeof SPLIT_REFUSAL_REASONS)[keyof typeof SPLIT_REFUSAL_REASONS];

/**
 * Sidecar key of the merged mark (Feature 121 defines its use). It must stay
 * outside `CLIENT_WRITABLE_SIDECAR_KEYS` and `SIDECAR_CLEARABLE_KEYS`
 * (`resource-crud-core.ts`), so no client update can write or clear it.
 */
export const MERGED_MARK_SIDECAR_KEY = "mergedMark";

/** The operation kinds a latest-operation record may name. */
export const SPLIT_OPERATION_KINDS = ["split", "merge"] as const;

/** `split` or `merge`. */
export type SplitOperationKind = (typeof SPLIT_OPERATION_KINDS)[number];

/** The ordered write steps of a split (FR-6); a failure names one. */
export const SPLIT_STEPS = [
  "lock-original",
  "snapshot",
  "create-document",
  "move-annotations",
  "seed-exclusion",
  "truncate",
  "write-records",
] as const;

/** One write step of a split. */
export type SplitStep = (typeof SPLIT_STEPS)[number];

/** The five lineage states of FR-15, in the order the spec lists them. */
export const SPLIT_LINEAGE_STATES = [
  "available",
  "revision-no-longer-kept",
  "document-in-trash",
  "document-permanently-removed",
  "could-not-be-checked",
] as const;

/** One lineage state. */
export type SplitLineageState = (typeof SPLIT_LINEAGE_STATES)[number];

/** Lineage record of a split-off document (FR-5). */
export interface SplitLineageRecord {
  sourceDocumentId: string;
  /** The snapshot revision of FR-4. */
  sourceRevisionId: string;
  sourceRevisionNumber: number;
  operation: "split";
  /** ISO 8601 instant. */
  date: string;
}

/** One snapshot revision named by a latest-operation record. */
export interface SnapshotRevisionRef {
  documentId: string;
  revisionId: string;
  revisionNumber: number;
}

/** The latest operation of a project (FR-16). */
export type LatestOperationRecord = {
  affectedDocumentIds: string[];
  snapshotRevisions: SnapshotRevisionRef[];
  /** ISO 8601 instant. */
  date: string;
} & (
  | { kind: "split"; newDocumentId: string }
  | { kind: "merge"; newDocumentId?: string }
);

/** What the writer chose in the split dialog (FR-12). */
export interface SplitCarryOverChoice {
  /** Ids of the annotations that move with the text. */
  annotationIds: string[];
  /** Names of the metadata fields carried to the new document. */
  fields: string[];
  newName: string;
}

/** Eligibility: eligible, or exactly one stated reason (FR-2). */
export type SplitEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: SplitRefusalReason };

/** The outcome values of a split; all distinct. */
export const SPLIT_OUTCOMES = {
  applied: "applied",
  refused: "refused",
  failed: "failed",
} as const;

/** What remains on disk after a failed split (FR-6). */
export type SplitRemainingState =
  | "original-restored"
  | "snapshot-revision-kept"
  | "new-document-remains"
  | "original-truncated"
  | "state-unknown";

/** Result of a split request. */
export type SplitResult =
  | {
      outcome: "applied";
      newDocumentId: string;
      /** Notice text keys for non-fatal conditions (for example a full exclusion list). */
      notices: string[];
    }
  | { outcome: "refused"; reason: SplitRefusalReason }
  | {
      outcome: "failed";
      failedStep: SplitStep;
      remainingState: SplitRemainingState;
    };

/** Result of the pure lineage-state resolver (FR-15). */
export type SplitLineageStateResult =
  | { state: "available" }
  | { state: "revision-no-longer-kept" }
  | { state: "document-in-trash" }
  | { state: "document-permanently-removed" }
  | { state: "could-not-be-checked"; cause: string };
