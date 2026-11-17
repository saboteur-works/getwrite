/**
 * Feature 116 (citations at compile), OQ-4: the hand-written table of the
 * details the bundled style needs for each reference type, and the function
 * that lists what a `citationFields` value lacks. One table, read by both the
 * editor line and the pre-run check.
 *
 * The table is written by hand, not inferred from the style file.
 * `tests/unit/citations-required-details.test.ts` checks it against the
 * engine's output: with a required detail removed, the rendered note lacks
 * that detail's text. Measured there (Hayagriva 0.10.1, bundled Chicago):
 * the engine prints no placeholder for a missing detail; the detail is left
 * out, a missing date prints "n.d." and a book's place stands in for a missing
 * publisher. Optional details (edition, editors, place, volume, issue, pages,
 * accessed date, medium, an interview title, a web page's author) change the
 * output when present but do not make the citation incomplete.
 *
 * Pure: no React, JSX, JSON or engine import.
 */
import type { CitationFieldsInput } from "./citations-csl-mapper";
import { validateCitationDate } from "./citations-fields-validation";
import {
  CITATION_FIELDS_BY_TYPE,
  type CitationReferenceType,
} from "./citations-types";

/** Ids of the styles this table covers (the bundled list, FR-18). */
export type RequiredDetailsStyleId = "chicago-notes-bibliography";

/** One required detail: the stored field name and the writer-facing label. */
export interface RequiredDetail {
  readonly field: string;
  readonly label: string;
}

const AUTHORS: RequiredDetail = { field: "authors", label: "Authors" };
const TITLE: RequiredDetail = { field: "title", label: "Title" };
const DATE: RequiredDetail = { field: "date", label: "Date" };
const URL: RequiredDetail = { field: "url", label: "URL" };

/** Required details per style and reference type, in display order. */
export const REQUIRED_DETAILS_BY_STYLE: Readonly<
  Record<
    RequiredDetailsStyleId,
    Readonly<Record<CitationReferenceType, readonly RequiredDetail[]>>
  >
> = {
  "chicago-notes-bibliography": {
    book: [AUTHORS, TITLE, { field: "publisher", label: "Publisher" }, DATE],
    article: [AUTHORS, TITLE, { field: "journal", label: "Journal" }, DATE],
    "web-page": [TITLE, { field: "website", label: "Website" }, DATE, URL],
    interview: [
      { field: "interviewee", label: "Interviewee" },
      { field: "interviewer", label: "Interviewer" },
      DATE,
    ],
  },
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function isNamedPerson(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const person = value as Record<string, unknown>;
  return (
    hasText(person.literal) || hasText(person.family) || hasText(person.given)
  );
}

function isPresent(value: unknown): boolean {
  return Array.isArray(value) ? value.some(isNamedPerson) : hasText(value);
}

const DATE_FIELD_LABELS: Readonly<Record<string, string>> = {
  date: "Date",
  accessed: "Accessed",
};

/** Labels of the date fields whose stored text fails the date rule. */
function invalidDateLabels(fields: CitationFieldsInput, now: Date): string[] {
  return CITATION_FIELDS_BY_TYPE[fields.referenceType]
    .filter((spec) => spec.kind === "date")
    .filter((spec) => {
      const value = fields[spec.name];
      return (
        typeof value === "string" &&
        value.trim() !== "" &&
        !validateCitationDate(value, now).ok
      );
    })
    .map((spec) => DATE_FIELD_LABELS[spec.name] ?? spec.name);
}

/**
 * The labels of the details a value lacks, in table order, then any stored
 * `date` or `accessed` that fails the date rule (Task 65, OQ-18), each once.
 * Blank text, an empty list and a list of blank names all count as missing.
 * Reads only; the stored value is never altered.
 *
 * @param styleId - A bundled style the table covers.
 * @param fields - A `citationFields` value.
 * @param now - The instant for the "not later than today" rule.
 */
export function findMissingDetails(
  styleId: RequiredDetailsStyleId,
  fields: CitationFieldsInput,
  now: Date = new Date(),
): readonly string[] {
  const missing = REQUIRED_DETAILS_BY_STYLE[styleId][fields.referenceType]
    .filter((detail) => !isPresent(fields[detail.field]))
    .map((detail) => detail.label);
  const invalid = invalidDateLabels(fields, now).filter(
    (label) => !missing.includes(label),
  );
  return [...missing, ...invalid];
}
