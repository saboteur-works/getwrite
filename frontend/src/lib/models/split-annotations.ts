/**
 * @module split-annotations
 *
 * Pure annotation partition and mark cut for "Split a document at the cursor"
 * (Feature 120, FR-11). No I/O, no editor, no React, JSX, JSON or `node:*`:
 * reachable from `core.ts`, the CLI and the Electron workers.
 *
 * Input: the two documents produced by `cutDocument` (Task 12), the sidecar
 * annotation list of the original and the ids the writer chose. Mark behaviour
 * at the cut is the measured one (`experiments/task-6.md`): a mark spanning
 * the cut appears in both halves with one id, one ending at the cut only in the
 * first half, one starting at it only in the second. So an annotation is
 *
 * - before: its id is marked in the first half only;
 * - after: its id is marked in the second half only;
 * - spanning: marked in both (it stays with the original; its mark in the
 *   first half already covers only the part that remains there);
 * - unanchored: marked in neither (detached already; it stays).
 *
 * Carry rules: only an `after` annotation the writer chose moves, whole and
 * unchanged, out of the original's list. Every other annotation stays in the
 * original's list unchanged (its stored quote and body are never edited). In
 * the new document every `annotation` mark whose id is not carried is stripped
 * with `stripBodylessAnnotationMarks`, which leaves every node id as it found
 * it (ids are assigned by Task 12, not here).
 *
 * A case the measurement does not cover returns a failed outcome naming the
 * annotation id and is never guessed.
 */
import { collectAnnotationMarkIds } from "./annotation-mark-ids";
import { stripBodylessAnnotationMarks } from "./annotation-mark-strip";
import { ANNOTATION_LIMITS } from "./annotation-validation";
import type { Annotation, TipTapDocument } from "./types";

/** Why a partition failed; every value is distinct. */
export const SPLIT_ANNOTATION_FAILURES = {
  /** Two annotations in the list share an id. */
  duplicateAnnotationId: "duplicate-annotation-id",
  /** A chosen id names no annotation in the list. */
  unknownChosenId: "unknown-chosen-id",
  /** A chosen annotation has no mark in the document, so no passage to move. */
  chosenWithoutPassage: "chosen-without-passage",
  /** The input list, or a resulting list, exceeds the per-resource limit. */
  overLimit: "over-limit",
} as const;

/** One partition failure reason. */
export type SplitAnnotationFailureReason =
  (typeof SPLIT_ANNOTATION_FAILURES)[keyof typeof SPLIT_ANNOTATION_FAILURES];

/** Ids grouped by where the passage lies; each list keeps sidecar order. */
export interface SplitAnnotationClassification {
  before: string[];
  /** Anchored in the moving text (carried only if chosen). */
  after: string[];
  /** Stay with the original because the passage spans the cursor. */
  spanning: string[];
  /** No mark in the document. */
  unanchored: string[];
}

/** Input of {@link partitionAnnotations}. */
export interface SplitAnnotationsInput {
  /** Original's text before the cursor (Task 12 `first`). */
  first: TipTapDocument;
  /** Text after the cursor (Task 12 `second`, fresh node ids). */
  second: TipTapDocument;
  /** The original's sidecar annotation list. */
  annotations: readonly Annotation[];
  /** Ids the writer chose to move with the text. */
  chosenIds: readonly string[];
}

/** Result of {@link partitionAnnotations}. */
export type SplitAnnotationsResult =
  | {
      outcome: "partitioned";
      /** The original's sidecar list after the split. */
      originalAnnotations: Annotation[];
      /** The new document's sidecar list. */
      newAnnotations: Annotation[];
      /** The original's document (the first half, as given). */
      originalDocument: TipTapDocument;
      /** The new document with the marks of annotations not carried stripped. */
      newDocument: TipTapDocument;
      classification: SplitAnnotationClassification;
      /** Chosen ids that stayed because they are before or span the cursor. */
      chosenButStayed: string[];
      /** How many marks the strip removed from the new document. */
      strippedMarkCount: number;
    }
  | {
      outcome: "failed";
      reason: SplitAnnotationFailureReason;
      /** The annotation the failure names; null when no single annotation applies. */
      annotationId: string | null;
    };

function fail(
  reason: SplitAnnotationFailureReason,
  annotationId: string | null,
): SplitAnnotationsResult {
  return { outcome: "failed", reason, annotationId };
}

function firstDuplicateId(annotations: readonly Annotation[]): string | null {
  const seen = new Set<string>();
  for (const annotation of annotations) {
    if (seen.has(annotation.id)) return annotation.id;
    seen.add(annotation.id);
  }
  return null;
}

function classify(
  annotations: readonly Annotation[],
  inFirst: ReadonlySet<string>,
  inSecond: ReadonlySet<string>,
): SplitAnnotationClassification {
  const result: SplitAnnotationClassification = {
    before: [],
    after: [],
    spanning: [],
    unanchored: [],
  };
  for (const { id } of annotations) {
    const isInFirst = inFirst.has(id);
    const isInSecond = inSecond.has(id);
    if (isInFirst && isInSecond) result.spanning.push(id);
    else if (isInFirst) result.before.push(id);
    else if (isInSecond) result.after.push(id);
    else result.unanchored.push(id);
  }
  return result;
}

/**
 * Partition `annotations` at the cut and strip the new document's marks of
 * annotations not carried. The inputs are not modified; the carried
 * annotations are copies.
 */
export function partitionAnnotations(
  input: SplitAnnotationsInput,
): SplitAnnotationsResult {
  const { first, second, annotations, chosenIds } = input;
  const limit = ANNOTATION_LIMITS.maxPerResource;
  if (annotations.length > limit) {
    return fail(SPLIT_ANNOTATION_FAILURES.overLimit, null);
  }
  const duplicate = firstDuplicateId(annotations);
  if (duplicate !== null) {
    return fail(SPLIT_ANNOTATION_FAILURES.duplicateAnnotationId, duplicate);
  }
  const known = new Set(annotations.map((a) => a.id));
  for (const id of chosenIds) {
    if (!known.has(id)) {
      return fail(SPLIT_ANNOTATION_FAILURES.unknownChosenId, id);
    }
  }

  const classification = classify(
    annotations,
    collectAnnotationMarkIds(first),
    collectAnnotationMarkIds(second),
  );
  const chosen = new Set(chosenIds);
  const unanchored = new Set(classification.unanchored);
  for (const id of chosenIds) {
    if (unanchored.has(id)) {
      return fail(SPLIT_ANNOTATION_FAILURES.chosenWithoutPassage, id);
    }
  }

  const movingIds = new Set(
    classification.after.filter((id) => chosen.has(id)),
  );
  const newAnnotations = annotations
    .filter((a) => movingIds.has(a.id))
    .map((a) => structuredClone(a));
  const originalAnnotations = annotations.filter((a) => !movingIds.has(a.id));
  if (newAnnotations.length > limit || originalAnnotations.length > limit) {
    return fail(SPLIT_ANNOTATION_FAILURES.overLimit, null);
  }

  const stripped = stripBodylessAnnotationMarks(second, movingIds);
  return {
    outcome: "partitioned",
    originalAnnotations,
    newAnnotations,
    originalDocument: first,
    newDocument: stripped.doc as TipTapDocument,
    classification,
    chosenButStayed: chosenIds.filter((id) => !movingIds.has(id)),
    strippedMarkCount: stripped.removed,
  };
}
