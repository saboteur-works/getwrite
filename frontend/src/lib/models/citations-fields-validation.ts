/**
 * Feature 116 (citations at compile), FR-5 and FR-6: the pure write-boundary
 * check of a Source's `citationFields` value. No I/O, no React, JSX, JSON or
 * `node:*` import. Every field is optional; only the reference type is
 * required, because it selects the fixed field set.
 *
 * Every refusal returns the same text and never echoes the input
 * (`docs/standards/security.md`). Values are checked as text and returned
 * unchanged: a URL, a script or markup is never interpreted or fetched.
 */
import {
  CITATION_DATE_PATTERN,
  CITATION_FIELDS_BY_TYPE,
  CITATION_FIELD_LIMITS,
  CITATION_REFERENCE_TYPES,
  type CitationPerson,
  type CitationReferenceType,
} from "./citations-types";

/** A validated `citationFields` value. */
export interface CitationFields {
  referenceType: CitationReferenceType;
  [field: string]: string | readonly CitationPerson[];
}

/** The one refusal text, identical on every path. */
export const CITATION_FIELDS_REFUSAL =
  "The citation fields are not valid." as const;

export type CitationFieldsValidation =
  | { ok: true; value: CitationFields }
  | { ok: false; message: typeof CITATION_FIELDS_REFUSAL };

const REFUSED: CitationFieldsValidation = {
  ok: false,
  message: CITATION_FIELDS_REFUSAL,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= CITATION_FIELD_LIMITS.maxTextLength
  );
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && CITATION_DATE_PATTERN.test(value);
}

function isPerson(value: unknown): value is CitationPerson {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length === 1 && keys[0] === "literal") return isText(value.literal);
  if (keys.length === 2 && keys[0] === "family" && keys[1] === "given") {
    return isText(value.family) && isText(value.given);
  }
  return false;
}

function isPeople(value: unknown): value is readonly CitationPerson[] {
  return (
    Array.isArray(value) &&
    value.length <= CITATION_FIELD_LIMITS.maxPeoplePerRole &&
    value.every(isPerson)
  );
}

function isReferenceType(value: unknown): value is CitationReferenceType {
  return (
    typeof value === "string" &&
    (CITATION_REFERENCE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Validate a `citationFields` value. Returns the value unchanged when valid.
 *
 * @param input - Untrusted value from the write boundary.
 */
export function validateCitationFields(
  input: unknown,
): CitationFieldsValidation {
  if (!isPlainObject(input) || !isReferenceType(input.referenceType)) {
    return REFUSED;
  }
  const specs = CITATION_FIELDS_BY_TYPE[input.referenceType];
  for (const key of Object.keys(input)) {
    if (key === "referenceType") continue;
    const spec = specs.find((s) => s.name === key);
    if (spec === undefined) return REFUSED;
    const value = input[key];
    const isValid =
      spec.kind === "people"
        ? isPeople(value)
        : spec.kind === "date"
          ? isDate(value)
          : isText(value);
    if (!isValid) return REFUSED;
  }
  return { ok: true, value: input as CitationFields };
}
