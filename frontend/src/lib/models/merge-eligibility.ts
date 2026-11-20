/**
 * @module merge-eligibility
 *
 * Pure eligibility decision for Feature 121 FR-2: can this selection be
 * merged, and if not, exactly one stated reason naming the document that
 * caused it. Used by the client to explain and by the server to enforce. No
 * I/O, no React, no JSX, no JSON, no `node:*`; the documents and their
 * sidecars are arguments and are never mutated.
 *
 * Reading rules, each a decision of this module:
 * - The selection is refused whole: the first problem found wins, in this
 *   order: fewer than two rows, a repeated id, then each row in selection
 *   order (missing, in Trash, folder, image or audio, Source, entity, marked).
 * - Folder rows are counted and refused, never dropped from the selection.
 * - The first row is the target; a marked document is `merged-target` there
 *   and `merged-absorbed` anywhere else.
 * - The merged check is the one `isMergedDocument` predicate; `markKey` is a
 *   parameter so a test can substitute the key name.
 */
import { isMergedDocument } from "./split-eligibility";
import {
  MERGE_REFUSAL_REASONS,
  MERGED_MARK_SIDECAR_KEY,
  type MergeEligibilityResult,
  type MergeRefusalReason,
} from "./merge-types";

/** One selected row as read by the caller. */
export interface MergeEligibilityDocument {
  id: string;
  /** The sidecar read for the row, or `null` when none exists (missing). */
  sidecar: Readonly<Record<string, unknown>> | null;
  /** True when the row is in Trash. */
  inTrash: boolean;
}

function refuse(
  reason: MergeRefusalReason,
  documentId: string | null,
): MergeEligibilityResult {
  return { eligible: false, reason, documentId };
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

/** Refusal for one row, or null when the row can be merged. */
function rowRefusal(
  doc: MergeEligibilityDocument,
  isTarget: boolean,
  markKey: string,
): MergeEligibilityResult | null {
  const { sidecar } = doc;
  if (sidecar === null)
    return refuse(MERGE_REFUSAL_REASONS.missingDocument, doc.id);
  if (doc.inTrash) return refuse(MERGE_REFUSAL_REASONS.documentInTrash, doc.id);
  if (sidecar["type"] === "folder")
    return refuse(MERGE_REFUSAL_REASONS.folder, doc.id);
  if (sidecar["type"] === "image" || sidecar["type"] === "audio")
    return refuse(MERGE_REFUSAL_REASONS.mediaResource, doc.id);
  if (sidecar["type"] === "source")
    return refuse(MERGE_REFUSAL_REASONS.source, doc.id);
  if (nonEmptyString(sidecar["entityKind"]))
    return refuse(MERGE_REFUSAL_REASONS.entityDocument, doc.id);
  if (isMergedDocument(sidecar, markKey))
    return refuse(
      isTarget
        ? MERGE_REFUSAL_REASONS.mergedTarget
        : MERGE_REFUSAL_REASONS.mergedAbsorbed,
      doc.id,
    );
  return null;
}

/** The first id that appears twice, or null. */
function firstRepeatedId(
  docs: readonly MergeEligibilityDocument[],
): string | null {
  const seen = new Set<string>();
  for (const doc of docs) {
    if (seen.has(doc.id)) return doc.id;
    seen.add(doc.id);
  }
  return null;
}

/**
 * Decide whether `documents` (in selection order, the first being the target)
 * can be merged. Returns `{ eligible: true }` or exactly one refusal.
 */
export function mergeEligibility(
  documents: readonly MergeEligibilityDocument[],
  markKey: string = MERGED_MARK_SIDECAR_KEY,
): MergeEligibilityResult {
  if (documents.length < 2)
    return refuse(MERGE_REFUSAL_REASONS.fewerThanTwo, null);
  const repeated = firstRepeatedId(documents);
  if (repeated !== null)
    return refuse(MERGE_REFUSAL_REASONS.repeatedId, repeated);
  for (let i = 0; i < documents.length; i++) {
    const refusal = rowRefusal(documents[i], i === 0, markKey);
    if (refusal) return refusal;
  }
  return { eligible: true };
}
