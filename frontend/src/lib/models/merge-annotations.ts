/**
 * @module merge-annotations
 *
 * Pure annotation carry and mark strip for "Merge documents" (Feature 121,
 * FR-9). No I/O, no editor, no React, JSX, JSON or `node:*`: reachable from
 * `core.ts`, the CLI and the Electron workers.
 *
 * Measured basis (`experiments/task-6.md`): appended nodes keep the absorbed
 * document's annotation mark ids (I7); `annotation-validation.ts` guards one
 * add at a time and not a batch carry (L2), so the 500 limit is checked here
 * as target list plus carried; stripping a mark leaves text unchanged (S1).
 *
 * Rules, the same for a note, a citation and a claim whether or not their
 * module is on:
 * - a chosen annotation moves, whole and unchanged (id, body, target, claim),
 *   from its absorbed document's list to the target's list, in selection
 *   order of the absorbed documents;
 * - the appended text keeps only the marks of moved annotations; every other
 *   `annotation` mark is stripped from it;
 * - a moved annotation's mark is stripped from the absorbed document's stored
 *   text, so no annotation id is in the stored text of both documents;
 * - an unchosen annotation stays in its absorbed list and its mark stays in
 *   the absorbed document's stored text, both unchanged.
 *
 * The strip leaves every node id as it found it (fresh ids are Task 18's).
 * A case the measurement does not cover returns a failed outcome naming the
 * annotation id and is never guessed.
 */
import { collectAnnotationMarkIds } from "./annotation-mark-ids";
import { stripBodylessAnnotationMarks } from "./annotation-mark-strip";
import { ANNOTATION_LIMITS } from "./annotation-validation";
import {
  MERGE_REFUSAL_REASONS,
  type MergeAnnotationLimitCounts,
} from "./merge-types";
import type { Annotation, TipTapDocument } from "./types";

/** Why a partition failed; every value is distinct. */
export const MERGE_ANNOTATION_FAILURES = {
  /** Two annotations across the target and absorbed lists share an id. */
  duplicateAnnotationId: "duplicate-annotation-id",
  /** A chosen id names no annotation of any absorbed document. */
  unknownChosenId: "unknown-chosen-id",
  /** A chosen annotation has no mark in its document, so no passage to move. */
  chosenWithoutPassage: "chosen-without-passage",
  /** An input list already exceeds the per-resource limit. */
  overLimit: "over-limit",
} as const;

/** One partition failure reason. */
export type MergeAnnotationFailureReason =
  (typeof MERGE_ANNOTATION_FAILURES)[keyof typeof MERGE_ANNOTATION_FAILURES];

/** One absorbed document as the partition reads it. */
export interface MergeAnnotationAbsorbed {
  documentId: string;
  /** The absorbed document's stored text. */
  document: TipTapDocument;
  /** The absorbed document's sidecar annotation list. */
  annotations: readonly Annotation[];
}

/** Input of {@link partitionMergeAnnotations}. */
export interface MergeAnnotationsInput {
  /** The target's sidecar annotation list. */
  targetAnnotations: readonly Annotation[];
  /** Absorbed documents in the order they are appended. */
  absorbed: readonly MergeAnnotationAbsorbed[];
  /** Ids the writer chose to move with the text. */
  chosenIds: readonly string[];
}

/** The result for one absorbed document. */
export interface MergeAnnotationAbsorbedResult {
  documentId: string;
  /** Its list after the merge: the unchosen annotations, unchanged. */
  annotations: Annotation[];
  /** Its stored text after the merge: moved marks stripped. */
  document: TipTapDocument;
  /** The text to append: only moved marks kept. */
  appendedDocument: TipTapDocument;
}

/** Result of {@link partitionMergeAnnotations}. */
export type MergeAnnotationsResult =
  | {
      outcome: "partitioned";
      /** The target's list after the merge: its own, then the moved ones. */
      targetAnnotations: Annotation[];
      absorbed: MergeAnnotationAbsorbedResult[];
    }
  | {
      outcome: "refused";
      reason: typeof MERGE_REFUSAL_REASONS.annotationLimit;
      annotationCounts: MergeAnnotationLimitCounts;
    }
  | {
      outcome: "failed";
      reason: MergeAnnotationFailureReason;
      /** The annotation the failure names; null when no single one applies. */
      annotationId: string | null;
    };

/** One offered annotation: id and body. */
export interface MergeAnnotationOffer {
  id: string;
  body: string;
}

/** Annotations of one absorbed document grouped by kind, for the dialog. */
export interface MergeAnnotationOfferGroup {
  documentId: string;
  notes: MergeAnnotationOffer[];
  citations: MergeAnnotationOffer[];
  claims: MergeAnnotationOffer[];
}

function fail(
  reason: MergeAnnotationFailureReason,
  annotationId: string | null,
): MergeAnnotationsResult {
  return { outcome: "failed", reason, annotationId };
}

function firstDuplicateId(
  lists: readonly (readonly Annotation[])[],
): string | null {
  const seen = new Set<string>();
  for (const list of lists) {
    for (const { id } of list) {
      if (seen.has(id)) return id;
      seen.add(id);
    }
  }
  return null;
}

/**
 * Annotations of each absorbed document grouped by kind: a claim is any
 * annotation with a `claim`, a citation one with a `target` and no `claim`,
 * a note the rest. Sidecar order is kept within each group.
 */
export function groupAnnotationsForOffer(
  absorbed: readonly MergeAnnotationAbsorbed[],
): MergeAnnotationOfferGroup[] {
  return absorbed.map(({ documentId, annotations }) => {
    const group: MergeAnnotationOfferGroup = {
      documentId,
      notes: [],
      citations: [],
      claims: [],
    };
    for (const a of annotations) {
      const offer = { id: a.id, body: a.body };
      if (a.claim !== undefined) group.claims.push(offer);
      else if (a.target !== undefined) group.citations.push(offer);
      else group.notes.push(offer);
    }
    return group;
  });
}

/** Failure of the structural checks, or null when the input is sound. */
function checkInput(
  input: MergeAnnotationsInput,
): MergeAnnotationsResult | null {
  const { targetAnnotations, absorbed, chosenIds } = input;
  const limit = ANNOTATION_LIMITS.maxPerResource;
  const lists = [targetAnnotations, ...absorbed.map((a) => a.annotations)];
  if (lists.some((list) => list.length > limit)) {
    return fail(MERGE_ANNOTATION_FAILURES.overLimit, null);
  }
  const duplicate = firstDuplicateId(lists);
  if (duplicate !== null) {
    return fail(MERGE_ANNOTATION_FAILURES.duplicateAnnotationId, duplicate);
  }
  const marked = new Map<string, Set<string>>();
  const owner = new Map<string, string>();
  for (const a of absorbed) {
    marked.set(a.documentId, collectAnnotationMarkIds(a.document));
    for (const { id } of a.annotations) owner.set(id, a.documentId);
  }
  for (const id of chosenIds) {
    const documentId = owner.get(id);
    if (documentId === undefined) {
      return fail(MERGE_ANNOTATION_FAILURES.unknownChosenId, id);
    }
    if (!marked.get(documentId)?.has(id)) {
      return fail(MERGE_ANNOTATION_FAILURES.chosenWithoutPassage, id);
    }
  }
  return null;
}

/**
 * Carry the chosen annotations to the target and strip marks as described in
 * the module header. The inputs are not modified; carried annotations are
 * copies.
 */
export function partitionMergeAnnotations(
  input: MergeAnnotationsInput,
): MergeAnnotationsResult {
  const problem = checkInput(input);
  if (problem !== null) return problem;

  const chosen = new Set(input.chosenIds);
  const moved = input.absorbed.flatMap((a) =>
    a.annotations
      .filter((x) => chosen.has(x.id))
      .map((x) => structuredClone(x)),
  );
  const limit = ANNOTATION_LIMITS.maxPerResource;
  if (input.targetAnnotations.length + moved.length > limit) {
    return {
      outcome: "refused",
      reason: MERGE_REFUSAL_REASONS.annotationLimit,
      annotationCounts: {
        existing: input.targetAnnotations.length,
        incoming: moved.length,
        limit,
      },
    };
  }

  const absorbed = input.absorbed.map((a): MergeAnnotationAbsorbedResult => {
    const movedHere = new Set(
      a.annotations.filter((x) => chosen.has(x.id)).map((x) => x.id),
    );
    const keep = new Set(collectAnnotationMarkIds(a.document));
    for (const id of movedHere) keep.delete(id);
    return {
      documentId: a.documentId,
      annotations: a.annotations.filter((x) => !movedHere.has(x.id)),
      document: stripBodylessAnnotationMarks(a.document, keep)
        .doc as TipTapDocument,
      appendedDocument: stripBodylessAnnotationMarks(a.document, movedHere)
        .doc as TipTapDocument,
    };
  });

  return {
    outcome: "partitioned",
    targetAnnotations: [
      ...input.targetAnnotations.map((x) => structuredClone(x)),
      ...moved,
    ],
    absorbed,
  };
}
