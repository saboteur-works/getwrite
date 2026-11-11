/**
 * @module annotation-validation
 *
 * Pure boundary validators for annotations (Feature 101, FR-11). The
 * annotation core calls them before any lock or write, so every path
 * refuses the same input with the same message. A value over a limit is
 * refused, never truncated; an unknown key is refused, never stored. Lengths
 * are counted in UTF-16 code units (`String.length`).
 */
import { CLAIM_STATUSES } from "./claim-types";
import type {
  ClaimStatus,
  NewClaimInput,
  UpdateClaimInput,
} from "./claim-types";
import { UUID } from "./schemas";
import type { Annotation, AnnotationTarget, ClaimMarker } from "./types";

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

/**
 * Validate an annotation body. Without a `target` it is 1 to 5000 characters;
 * with one (`hasTarget`, Feature 103, FR-26) it is 0 to 5000. The upper bound
 * is the same for both.
 */
export function validateAnnotationBody(
  body: unknown,
  hasTarget = false,
): AnnotationValidation<string> {
  const min = hasTarget ? 0 : ANNOTATION_LIMITS.bodyMin;
  if (
    typeof body !== "string" ||
    body.length < min ||
    body.length > ANNOTATION_LIMITS.bodyMax
  ) {
    return refuse(
      `An annotation body must be ${min === 0 ? "at most" : `${min} to`} ${ANNOTATION_LIMITS.bodyMax} characters.`,
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
  let target: AnnotationTarget | undefined;
  if (record.target !== undefined) {
    const checkedTarget = validateAnnotationTarget(record.target);
    if (!checkedTarget.ok) return checkedTarget;
    target = checkedTarget.value;
  }
  const body = validateAnnotationBody(record.body, target !== undefined);
  if (!body.ok) return body;
  const quote = validateAnnotationQuote(record.quote);
  if (!quote.ok) return quote;
  const value: NewAnnotationInput = {
    id,
    body: body.value,
    quote: quote.value,
  };
  if (target !== undefined) value.target = target;
  return { ok: true, value };
}

const NEW_CLAIM_KEYS: readonly string[] = [
  "id",
  "statement",
  "quote",
  "target",
];
const UPDATE_CLAIM_KEYS: readonly string[] = ["status", "statement", "target"];
const CARRIED_CLAIM_KEYS: readonly string[] = ["status", "statusChangedAt"];
const ISO_DATE_SHAPE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isClaimStatus(value: unknown): value is ClaimStatus {
  return (
    typeof value === "string" &&
    (CLAIM_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Validate a claim statement (Feature 108, FR-8): 1 to 5000 UTF-16 code
 * units, refused rather than truncated. Unlike a note, it is never allowed
 * to be empty, even when the claim has a Source link.
 */
export function validateClaimStatement(
  statement: unknown,
): AnnotationValidation<string> {
  if (
    typeof statement !== "string" ||
    statement.length < ANNOTATION_LIMITS.bodyMin ||
    statement.length > ANNOTATION_LIMITS.bodyMax
  ) {
    return refuse(
      `A claim statement must be ${ANNOTATION_LIMITS.bodyMin} to ${ANNOTATION_LIMITS.bodyMax} characters.`,
    );
  }
  return { ok: true, value: statement };
}

/**
 * Validate a new claim against the resource's stored annotations (FR-8):
 * a plain object with only `id`, `statement`, `quote` and an optional
 * `target`. A status or a status date is never accepted from the client
 * (FR-10); the core starts every claim as `unverified`. The message never
 * echoes the input.
 */
export function validateNewClaim(
  input: unknown,
  existing: readonly Annotation[],
): AnnotationValidation<NewClaimInput> {
  if (!isPlainObject(input)) return refuse("A claim must be an object.");
  if (Object.keys(input).some((key) => !NEW_CLAIM_KEYS.includes(key))) {
    return refuse("A claim has a field that is not allowed.");
  }
  if (!UUID.safeParse(input.id).success) {
    return refuse("A claim id must be a valid id.");
  }
  const id = input.id as string;
  if (existing.some((a) => a.id === id)) {
    return refuse("An annotation with this id already exists.");
  }
  if (existing.length >= ANNOTATION_LIMITS.maxPerResource) {
    return refuse(
      `A resource can't have more than ${ANNOTATION_LIMITS.maxPerResource} annotations.`,
    );
  }
  const statement = validateClaimStatement(input.statement);
  if (!statement.ok) return statement;
  const quote = validateAnnotationQuote(input.quote);
  if (!quote.ok) return quote;
  const value: NewClaimInput = {
    id,
    statement: statement.value,
    quote: quote.value,
  };
  if (input.target !== undefined) {
    const target = validateAnnotationTarget(input.target);
    if (!target.ok) return target;
    value.target = target.value;
  }
  return { ok: true, value };
}

/**
 * Validate the "update claim" operation (FR-9, FR-11, FR-12): only `status`,
 * `statement` and `target` (`null` removes the Source link), at least one
 * present. A status must be one of the four identifiers, so `unsourced`
 * (derived, never stored) is refused. A client-supplied `statusChangedAt` is
 * an unknown key. The message never echoes the input.
 */
export function validateUpdateClaim(
  input: unknown,
): AnnotationValidation<UpdateClaimInput> {
  if (!isPlainObject(input)) return refuse("A claim update must be an object.");
  if (Object.keys(input).some((key) => !UPDATE_CLAIM_KEYS.includes(key))) {
    return refuse("A claim update has a field that is not allowed.");
  }
  const value: UpdateClaimInput = {};
  if (input.status !== undefined) {
    if (!isClaimStatus(input.status)) {
      return refuse(
        "A claim status must be unverified, verified, disputed or needs-review.",
      );
    }
    value.status = input.status;
  }
  if (input.statement !== undefined) {
    const statement = validateClaimStatement(input.statement);
    if (!statement.ok) return statement;
    value.statement = statement.value;
  }
  if (input.target !== undefined) {
    if (input.target === null) {
      value.target = null;
    } else {
      const target = validateAnnotationTarget(input.target);
      if (!target.ok) return target;
      value.target = target.value;
    }
  }
  if (Object.keys(value).length === 0) {
    return refuse(
      "A claim update needs a status, a statement or a Source link.",
    );
  }
  return { ok: true, value };
}

/**
 * Validate a claim marker carried by paste (FR-18): exactly a known status
 * and a valid ISO `statusChangedAt`. Only the paste path may accept it;
 * mark-as-claim creation never does. The message never echoes the input.
 */
export function validateCarriedClaim(
  input: unknown,
): AnnotationValidation<ClaimMarker> {
  if (!isPlainObject(input)) {
    return refuse("A carried claim must be an object.");
  }
  if (
    Object.keys(input).some((key) => !CARRIED_CLAIM_KEYS.includes(key)) ||
    !CARRIED_CLAIM_KEYS.every((key) => key in input)
  ) {
    return refuse("A carried claim needs exactly a status and a status date.");
  }
  if (!isClaimStatus(input.status)) {
    return refuse(
      "A claim status must be unverified, verified, disputed or needs-review.",
    );
  }
  const date = input.statusChangedAt;
  if (
    typeof date !== "string" ||
    !ISO_DATE_SHAPE.test(date) ||
    Number.isNaN(Date.parse(date))
  ) {
    return refuse("A claim status date must be a valid ISO date.");
  }
  return { ok: true, value: { status: input.status, statusChangedAt: date } };
}
