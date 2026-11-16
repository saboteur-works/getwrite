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

/** Why a date or accessed value fails (FR-5). */
export type CitationDateReason =
  | "bad-format"
  | "not-a-real-date"
  | "later-than-today";

export type CitationDateCheck =
  | { ok: true }
  | { ok: false; reason: CitationDateReason };

/** The writer-facing text of each reason, shared by the editor. */
export const CITATION_DATE_REASON_TEXT: Readonly<
  Record<CitationDateReason, string>
> = {
  "bad-format": "Use YYYY, YYYY-MM or YYYY-MM-DD.",
  "not-a-real-date": "This is not a real date.",
  "later-than-today": "This date is later than today.",
};

/** The furthest-ahead time zone, in milliseconds. */
const UTC_PLUS_14_MS = 14 * 60 * 60 * 1000;
const DATE_SHAPE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Check a date or accessed value: YYYY, YYYY-MM or YYYY-MM-DD, a real calendar
 * date (no lower bound on the year), not later than the current date at
 * UTC+14 (a partial date: its year, or its year and month, not after the
 * current one). Pure; the clock is the `now` parameter.
 *
 * @param value - The text to check.
 * @param now - The instant that stands for "now".
 */
export function validateCitationDate(
  value: string,
  now: Date,
): CitationDateCheck {
  const match = DATE_SHAPE.exec(value);
  if (match === null) return { ok: false, reason: "bad-format" };
  const year = Number(match[1]);
  const month = match[2] === undefined ? undefined : Number(match[2]);
  const day = match[3] === undefined ? undefined : Number(match[3]);
  if (month !== undefined && (month < 1 || month > 12)) {
    return { ok: false, reason: "not-a-real-date" };
  }
  if (
    month !== undefined &&
    day !== undefined &&
    (day < 1 || day > daysInMonth(year, month))
  ) {
    return { ok: false, reason: "not-a-real-date" };
  }
  const limit = new Date(now.getTime() + UTC_PLUS_14_MS);
  const limitParts = [
    limit.getUTCFullYear(),
    limit.getUTCMonth() + 1,
    limit.getUTCDate(),
  ];
  const parts = [year, month, day].filter((p): p is number => p !== undefined);
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] > limitParts[i])
      return { ok: false, reason: "later-than-today" };
    if (parts[i] < limitParts[i]) break;
  }
  return { ok: true };
}

/** Shape only: the pre-Task-65 check, kept for reads (no calendar rule). */
function isDateShape(value: unknown): value is string {
  return typeof value === "string" && DATE_SHAPE.test(value);
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
 * Validate the shape of a `citationFields` value (dates by pattern only).
 * Returns the value unchanged when valid.
 *
 * @param input - Untrusted value from the write boundary.
 */
export function validateCitationFields(
  input: unknown,
): CitationFieldsValidation {
  return validateWith(input, isDateShape);
}

/**
 * The write-boundary check: as `validateCitationFields`, and `date` and
 * `accessed` must also pass `validateCitationDate` at `now`. A stored value
 * is read with `validateCitationFields`, so one that fails the date rule
 * stays readable and is reported as a missing detail, never rewritten.
 *
 * @param input - Untrusted value from the write boundary.
 * @param now - The instant that stands for "now".
 */
export function validateCitationFieldsForWrite(
  input: unknown,
  now: Date,
): CitationFieldsValidation {
  return validateWith(
    input,
    (value): value is string =>
      typeof value === "string" && validateCitationDate(value, now).ok,
  );
}

function validateWith(
  input: unknown,
  isDate: (value: unknown) => value is string,
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
