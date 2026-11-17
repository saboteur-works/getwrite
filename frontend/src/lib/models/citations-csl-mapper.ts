/**
 * Feature 116 (FR-5): maps a validated `citationFields` value to a CSL-JSON
 * item. Pure: no engine, React, Redux or I/O. Values are copied as plain text
 * and never interpreted as markup.
 */
import {
  CSL_ITEM_TYPE_BY_REFERENCE_TYPE,
  CITATION_DATE_PATTERN,
  type CitationPerson,
  type CitationReferenceType,
  type CslItemType,
} from "./citations-types";

/**
 * The stored value after validation: the reference type plus flat per-type
 * fields. Field values are `unknown` here; Task 15 validates them at the write
 * boundary and the mapper still copies only what has the expected shape.
 */
export type CitationFieldsInput = { referenceType: CitationReferenceType } & {
  [field: string]: unknown;
};

/** A CSL-JSON name variable entry. */
export type CslName = CitationPerson;

/** A CSL-JSON date variable; a partial date has fewer parts. */
export interface CslDate {
  "date-parts": number[][];
}

/** The CSL-JSON item the engine adapter receives. */
export interface CslItem {
  id: string;
  type: CslItemType;
  author?: CslName[];
  editor?: CslName[];
  interviewer?: CslName[];
  title?: string;
  edition?: string;
  publisher?: string;
  "publisher-place"?: string;
  "container-title"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  medium?: string;
  URL?: string;
  issued?: CslDate;
  accessed?: CslDate;
}

type CslNameKey = "author" | "editor" | "interviewer";
type CslTextKey =
  | "title"
  | "edition"
  | "publisher"
  | "publisher-place"
  | "container-title"
  | "volume"
  | "issue"
  | "page"
  | "medium"
  | "URL";
type CslDateKey = "issued" | "accessed";

/** Stored people field to CSL name variable. An interviewee is `author`. */
const PEOPLE_FIELDS: Readonly<Record<string, CslNameKey>> = {
  authors: "author",
  editors: "editor",
  interviewee: "author",
  interviewer: "interviewer",
};

/** Stored text field to CSL variable. */
const TEXT_FIELDS: Readonly<Record<string, CslTextKey>> = {
  title: "title",
  edition: "edition",
  publisher: "publisher",
  place: "publisher-place",
  journal: "container-title",
  website: "container-title",
  volume: "volume",
  issue: "issue",
  pages: "page",
  medium: "medium",
  url: "URL",
};

/** Stored date field to CSL variable. */
const DATE_FIELDS: Readonly<Record<string, CslDateKey>> = {
  date: "issued",
  accessed: "accessed",
};

function toPerson(value: unknown): CitationPerson | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.family === "string" && typeof record.given === "string") {
    return { family: record.family, given: record.given };
  }
  if (typeof record.literal === "string") return { literal: record.literal };
  return null;
}

function toPeople(value: unknown): CslName[] {
  if (!Array.isArray(value)) return [];
  const people: CslName[] = [];
  for (const entry of value) {
    const person = toPerson(entry);
    if (person !== null) people.push(person);
  }
  return people;
}

function toDate(value: unknown): CslDate | null {
  if (typeof value !== "string" || !CITATION_DATE_PATTERN.test(value)) {
    return null;
  }
  return { "date-parts": [value.split("-").map((part) => Number(part))] };
}

/**
 * Map a Source's citation fields to a CSL-JSON item carrying `sourceId` as the
 * item id. A missing, empty or malformed optional field is omitted.
 */
export function mapCitationFieldsToCsl(
  sourceId: string,
  fields: CitationFieldsInput,
): CslItem {
  const item: CslItem = {
    id: sourceId,
    type: CSL_ITEM_TYPE_BY_REFERENCE_TYPE[fields.referenceType],
  };
  for (const [field, key] of Object.entries(PEOPLE_FIELDS)) {
    const people = toPeople(fields[field]);
    if (people.length > 0) item[key] = [...(item[key] ?? []), ...people];
  }
  for (const [field, key] of Object.entries(TEXT_FIELDS)) {
    const value = fields[field];
    if (typeof value === "string" && value !== "") item[key] = value;
  }
  for (const [field, key] of Object.entries(DATE_FIELDS)) {
    const date = toDate(fields[field]);
    if (date !== null) item[key] = date;
  }
  return item;
}
