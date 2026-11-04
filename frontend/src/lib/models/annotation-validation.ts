/**
 * @module annotation-validation
 *
 * Pure boundary validators for annotations (Feature 101, FR-11). The
 * annotation core calls them before any lock or write, so every path
 * refuses the same input with the same message. A value over a limit is
 * refused, never truncated; an unknown key is refused, never stored. Lengths
 * are counted in UTF-16 code units (`String.length`).
 */
import { UUID } from "./schemas";
import type { Annotation } from "./types";

/** Owner-approved limits (OQ-7, Gate 3, 2026-11-04). */
export const ANNOTATION_LIMITS = {
  bodyMin: 1,
  bodyMax: 5000,
  quoteMax: 500,
  maxPerResource: 500,
} as const;

/** The fields a client may supply when adding an annotation. */
export interface NewAnnotationInput {
  id: string;
  body: string;
  quote: string;
}

export type AnnotationValidation<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const NEW_ANNOTATION_KEYS: readonly string[] = ["id", "body", "quote"];

function refuse(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

/** Validate an annotation body: a string of 1 to 5000 characters. */
export function validateAnnotationBody(
  body: unknown,
): AnnotationValidation<string> {
  if (
    typeof body !== "string" ||
    body.length < ANNOTATION_LIMITS.bodyMin ||
    body.length > ANNOTATION_LIMITS.bodyMax
  ) {
    return refuse(
      `An annotation body must be ${ANNOTATION_LIMITS.bodyMin} to ${ANNOTATION_LIMITS.bodyMax} characters.`,
    );
  }
  return { ok: true, value: body };
}

/** Validate a saved quote: a string of at most 500 characters. */
export function validateAnnotationQuote(
  quote: unknown,
): AnnotationValidation<string> {
  if (typeof quote !== "string" || quote.length > ANNOTATION_LIMITS.quoteMax) {
    return refuse(
      `An annotation quote must be at most ${ANNOTATION_LIMITS.quoteMax} characters.`,
    );
  }
  return { ok: true, value: quote };
}

/**
 * Validate a new annotation against the resource's stored annotations:
 * plain object with only `id`, `body`, `quote`; well-formed id with no
 * collision; body and quote within limits; count under the cap.
 */
export function validateNewAnnotation(
  input: unknown,
  existing: readonly Annotation[],
): AnnotationValidation<NewAnnotationInput> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return refuse("An annotation must be an object.");
  }
  const record = input as Record<string, unknown>;
  const unknownKey = Object.keys(record).find(
    (key) => !NEW_ANNOTATION_KEYS.includes(key),
  );
  if (unknownKey !== undefined) {
    return refuse(`An annotation can't have a "${unknownKey}" field.`);
  }
  if (!UUID.safeParse(record.id).success) {
    return refuse("An annotation id must be a valid id.");
  }
  const id = record.id as string;
  if (existing.some((a) => a.id === id)) {
    return refuse("An annotation with this id already exists.");
  }
  if (existing.length >= ANNOTATION_LIMITS.maxPerResource) {
    return refuse(
      `A resource can't have more than ${ANNOTATION_LIMITS.maxPerResource} annotations.`,
    );
  }
  const body = validateAnnotationBody(record.body);
  if (!body.ok) return body;
  const quote = validateAnnotationQuote(record.quote);
  if (!quote.ok) return quote;
  return { ok: true, value: { id, body: body.value, quote: quote.value } };
}
