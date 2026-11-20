/**
 * @module merge-types
 *
 * Inert shared contract for "Merge documents" (Feature 121, FR-2, FR-5, FR-6,
 * FR-7, FR-9, FR-10, FR-15, FR-16, FR-21). Types and constants only: no
 * behaviour, no React, no JSX, no JSON, no `node:*`, so it is reachable from
 * `core.ts`, the CLI and the Electron workers.
 *
 * A failed outcome never shares a value with an empty or applied one: every
 * result union is discriminated by a field whose values are all distinct.
 */

import { MERGED_MARK_SIDECAR_KEY } from "./split-types";

/**
 * The sidecar key of the merged mark, defined once in `split-types.ts` (the
 * seam `isMergedDocument` reads) and re-exported here. It stays outside
 * `CLIENT_WRITABLE_SIDECAR_KEYS` and `SIDECAR_CLEARABLE_KEYS`.
 */
export { MERGED_MARK_SIDECAR_KEY };

/** One stable string per refusal (FR-2, FR-6, FR-7, FR-9, FR-15). */
export const MERGE_REFUSAL_REASONS = {
  fewerThanTwo: "fewer-than-two-documents",
  repeatedId: "repeated-id",
  folder: "folder",
  mediaResource: "media-resource",
  source: "source",
  entityDocument: "entity-document",
  mergedTarget: "merged-target",
  mergedAbsorbed: "merged-absorbed",
  missingDocument: "missing-document",
  documentInTrash: "document-in-trash",
  staleContent: "stale-content",
  annotationLimit: "annotation-limit",
  tooManyDocuments: "too-many-documents",
  lockedProject: "locked-project",
  stepFailed: "step-failed",
} as const;

/** One refusal reason string. */
export type MergeRefusalReason =
  (typeof MERGE_REFUSAL_REASONS)[keyof typeof MERGE_REFUSAL_REASONS];

/** The merged mark written on each absorbed document (FR-5). */
export interface MergedMark {
  /** The document the text was appended to. */
  targetDocumentId: string;
  /** The target's pre-merge snapshot revision, an opaque id. */
  targetSnapshotRevisionId: string;
  /** ISO 8601 instant; the daily goal reads it (FR-19). */
  date: string;
}

/** The states of a merged mark's target: live, then the four of FR-16. */
export const MERGE_MARK_STATES = [
  "available",
  "revision-no-longer-kept",
  "target-in-trash",
  "target-permanently-removed",
  "could-not-be-checked",
] as const;

/** One merged-mark state. */
export type MergeMarkState = (typeof MERGE_MARK_STATES)[number];

/** Result of the pure merged-mark state resolver. */
export type MergeMarkStateResult =
  | { state: "available" }
  | { state: "revision-no-longer-kept" }
  | { state: "target-in-trash" }
  | { state: "target-permanently-removed" }
  | { state: "could-not-be-checked"; cause: string };

/** The ordered write steps of a merge (FR-6); a failure names one. */
export const MERGE_STEPS = [
  "lock-documents",
  "snapshot",
  "move-annotations",
  "write-marks",
  "strip-absorbed-marks",
  "append-to-target",
  "write-records",
] as const;

/** One write step of a merge. */
export type MergeStep = (typeof MERGE_STEPS)[number];

/** One metadata field and where its value comes from (FR-10). */
export interface MergeFieldChoice {
  field: string;
  /** The absorbed document the value is taken from, or `null` for none. */
  sourceDocumentId: string | null;
}

/** What the writer chose in the merge dialog (FR-9, FR-10, FR-11). */
export interface MergeCarryOverChoice {
  /** Ids of the annotations that move to the target. */
  annotationIds: string[];
  /** One entry per field the writer chose to carry. */
  fields: MergeFieldChoice[];
  /** Multiselect fields whose values are united across absorbed documents. */
  unitedMultiselectFields: string[];
}

/** Eligibility: eligible, or one stated reason naming the document (FR-2). */
export type MergeEligibilityResult =
  | { eligible: true }
  | {
      eligible: false;
      reason: MergeRefusalReason;
      /** The document that caused the refusal; `null` when none does. */
      documentId: string | null;
    };

/** The outcome values of a merge; all distinct. */
export const MERGE_OUTCOMES = {
  applied: "applied",
  refused: "refused",
  failed: "failed",
} as const;

/** What remains on disk after a failed merge (FR-6). */
export type MergeRemainingState =
  | "documents-restored"
  | "snapshot-revisions-kept"
  | "partially-written"
  | "state-unknown";

/** Counts named by the annotation-limit refusal (FR-9). */
export interface MergeAnnotationLimitCounts {
  existing: number;
  incoming: number;
  limit: number;
}

/** Result of a merge request. */
export type MergeResult =
  | {
      outcome: "applied";
      targetDocumentId: string;
      absorbedDocumentIds: string[];
      /** Notice text keys for non-fatal conditions. */
      notices: string[];
    }
  | {
      outcome: "refused";
      reason: MergeRefusalReason;
      documentId: string | null;
      annotationCounts?: MergeAnnotationLimitCounts;
    }
  | {
      outcome: "failed";
      failedStep: MergeStep;
      remainingState: MergeRemainingState;
    };
