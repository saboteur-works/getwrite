/**
 * @module excerpts
 *
 * Pure helpers for Source excerpts (Feature 103, FR-21, FR-22, OQ-1). An
 * excerpt is an annotation, never a new record kind: no Trash kind and no
 * index. Lives under lib/models, so no React, JSX or JSON import.
 *
 * - Text excerpt: an annotation in the Source body (mark plus stored
 *   annotation) whose `target` is the Source itself, with the locator and the
 *   excerpted text as `quote`.
 * - Locator-only excerpt of an image or audio attachment: an annotation on the
 *   Source with `target` `{ sourceId, attachmentId, locator }`, an empty body
 *   and an empty quote, and no mark by design.
 */
import {
  validateAnnotationTarget,
  type AnnotationValidation,
  type NewAnnotationInput,
} from "./annotation-validation";
import type { Annotation, AnnotationLocator } from "./types";

export interface TextExcerptInput {
  id: string;
  /** The writer's note; may be empty because the annotation has a `target`. */
  body: string;
  /** The excerpted text. */
  quote: string;
  sourceId: string;
  sourceName?: string;
  locator?: AnnotationLocator;
}

export interface AttachmentExcerptInput {
  id: string;
  sourceId: string;
  attachmentId: string;
  locator: AnnotationLocator;
  sourceName?: string;
}

/** The new-annotation record for a text excerpt, or the refusal message. */
export function buildTextExcerptInput(
  input: TextExcerptInput,
): AnnotationValidation<NewAnnotationInput> {
  if (input.quote.length === 0) {
    return { ok: false, message: "Select some text to excerpt." };
  }
  const target = validateAnnotationTarget({
    sourceId: input.sourceId,
    ...(input.sourceName === undefined ? {} : { sourceName: input.sourceName }),
    ...(input.locator === undefined ? {} : { locator: input.locator }),
  });
  if (!target.ok) return target;
  return {
    ok: true,
    value: {
      id: input.id,
      body: input.body,
      quote: input.quote,
      target: target.value,
    },
  };
}

/** The new-annotation record for a locator-only attachment excerpt. */
export function buildAttachmentExcerptInput(
  input: AttachmentExcerptInput,
): AnnotationValidation<NewAnnotationInput> {
  if (input.locator === undefined || input.locator === null) {
    return { ok: false, message: "An attachment excerpt needs a locator." };
  }
  const target = validateAnnotationTarget({
    sourceId: input.sourceId,
    attachmentId: input.attachmentId,
    locator: input.locator,
    ...(input.sourceName === undefined ? {} : { sourceName: input.sourceName }),
  });
  if (!target.ok) return target;
  return {
    ok: true,
    value: { id: input.id, body: "", quote: "", target: target.value },
  };
}

/**
 * "No mark by design": a `target` with an attachment and no passage (empty
 * quote). Such an annotation never has a mark in the body.
 */
export function isMarkLessByDesign(
  annotation: Pick<Annotation, "quote" | "target">,
): boolean {
  return (
    annotation.target?.attachmentId !== undefined && annotation.quote === ""
  );
}

/** Derived, never stored: no mark here, and not marked-less by design. */
export function isDetachedAnnotation(
  annotation: Pick<Annotation, "quote" | "target">,
  hasMark: boolean,
): boolean {
  return !hasMark && !isMarkLessByDesign(annotation);
}

/** Re-attach is offered for every annotation except a no-mark-by-design one. */
export function canReattachAnnotation(
  annotation: Pick<Annotation, "quote" | "target">,
): boolean {
  return !isMarkLessByDesign(annotation);
}
