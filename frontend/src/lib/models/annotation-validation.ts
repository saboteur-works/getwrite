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
import type { Annotation, AnnotationTarget } from "./types";

/** Owner-approved limits (OQ-7, Gate 3, 2026-11-04). */
export const ANNOTATION_LIMITS = {
  bodyMin: 1,
  bodyMax: 5000,
  quoteMax: 500,
  maxPerResource: 500,
  /**
   * Feature 103: a locator's free text. No resource-name limit constant
   * exists in the repo, so both reuse `quoteMax`, the nearest short-text bound.
   */
  locatorValueMax: 500,
  /** Feature 103 (OQ-2): the Source's name at citing time. */
  sourceNameMax: 500,
} as const;

/** The fields a client may supply when adding an annotation. */
export interface NewAnnotationInput {
  id: string;
  body: string;
  quote: string;
  /** Feature 103, FR-24: the Source this annotation cites; absent for a plain note. */
  target?: AnnotationTarget;
}

export type AnnotationValidation<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const NEW_ANNOTATION_KEYS: readonly string[] = [
  "id",
  "body",
  "quote",
  "target",
];

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

const TARGET_KEYS: readonly string[] = [
  "sourceId",
  "attachmentId",
  "excerptId",
  "locator",
  "sourceName",
];
const LOCATOR_KEYS: readonly string[] = ["type", "value"];
const LOCATOR_TYPES: readonly string[] = [
  "page",
  "timestamp",
  "paragraph",
  "line",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateLocator(
  input: unknown,
): AnnotationValidation<NonNullable<AnnotationTarget["locator"]>> {
  if (!isPlainObject(input)) {
    return refuse("An annotation target locator must be an object.");
  }
  const unknownKey = Object.keys(input).find((k) => !LOCATOR_KEYS.includes(k));
  if (unknownKey !== undefined) {
    return refuse(
      `An annotation target locator can't have a "${unknownKey}" field.`,
    );
  }
  const { type, value } = input;
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > ANNOTATION_LIMITS.locatorValueMax
  ) {
    return refuse(
      `An annotation target locator value must be 1 to ${ANNOTATION_LIMITS.locatorValueMax} characters.`,
    );
  }
  if (type === undefined) return { ok: true, value: { value } };
  if (typeof type !== "string" || !LOCATOR_TYPES.includes(type)) {
    return refuse(
      "An annotation target locator type must be page, timestamp, paragraph or line.",
    );
  }
  return {
    ok: true,
    value: { type: type as "page" | "timestamp" | "paragraph" | "line", value },
  };
}

/**
 * Validate an annotation `target` (Feature 103, FR-21, FR-24): a plain
 * object with a well-formed `sourceId` and only the declared optional keys.
 * A timestamp locator is free text; it is never checked against the
 * attachment. The result carries only the keys that were supplied.
 */
export function validateAnnotationTarget(
  input: unknown,
): AnnotationValidation<AnnotationTarget> {
  if (!isPlainObject(input)) {
    return refuse("An annotation target must be an object.");
  }
  const unknownKey = Object.keys(input).find((k) => !TARGET_KEYS.includes(k));
  if (unknownKey !== undefined) {
    return refuse(`An annotation target can't have a "${unknownKey}" field.`);
  }
  if (!UUID.safeParse(input.sourceId).success) {
    return refuse("An annotation target sourceId must be a valid id.");
  }
  const target: AnnotationTarget = { sourceId: input.sourceId as string };
  for (const key of ["attachmentId", "excerptId"] as const) {
    const id = input[key];
    if (id === undefined) continue;
    if (!UUID.safeParse(id).success) {
      return refuse(`An annotation target ${key} must be a valid id.`);
    }
    target[key] = id as string;
  }
  if (input.locator !== undefined) {
    const locator = validateLocator(input.locator);
    if (!locator.ok) return locator;
    target.locator = locator.value;
  }
  const name = input.sourceName;
  if (name !== undefined) {
    if (
      typeof name !== "string" ||
      name.length > ANNOTATION_LIMITS.sourceNameMax
    ) {
      return refuse(
        `An annotation target sourceName must be at most ${ANNOTATION_LIMITS.sourceNameMax} characters.`,
      );
    }
    target.sourceName = name;
  }
  return { ok: true, value: target };
}

/**
 * Validate a new annotation against the resource's stored annotations:
 * plain object with only `id`, `body`, `quote` and an optional `target`; well-formed id with no
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
  const value: NewAnnotationInput = {
    id,
    body: body.value,
    quote: quote.value,
  };
  if (record.target !== undefined) {
    const target = validateAnnotationTarget(record.target);
    if (!target.ok) return target;
    value.target = target.value;
  }
  return { ok: true, value };
}
