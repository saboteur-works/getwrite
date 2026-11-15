/**
 * Feature 116 (citations at compile): the inert shared contract.
 *
 * Constants, field tables, limits, wording and result types only. No
 * behaviour beyond the marker builder, and no React, JSX, JSON or `node:*`
 * import, so the CLI and Electron workers can reach it
 * (`tests/unit/citations-core-import-graph.test.ts`).
 */

/** Module id declared in `MODULE_MANIFEST` (FR-4). */
export const CITATIONS_MODULE_ID = "citations" as const;

/** Label the Modules screen shows for the module (FR-4, OQ-9). */
export const CITATIONS_MODULE_LABEL = "Citations" as const;

/** Name of the module-owned top-level key on a Source sidecar (FR-6). */
export const CITATION_FIELDS_KEY = "citationFields" as const;

/** The four reference types a Source can carry (FR-5). */
export const CITATION_REFERENCE_TYPES = [
  "book",
  "article",
  "web-page",
  "interview",
] as const;

export type CitationReferenceType = (typeof CITATION_REFERENCE_TYPES)[number];

/** CSL-JSON item types (FR-5). */
export type CslItemType = "book" | "article-journal" | "webpage" | "interview";

/** Each reference type's one CSL-JSON item type (FR-5). */
export const CSL_ITEM_TYPE_BY_REFERENCE_TYPE: Readonly<
  Record<CitationReferenceType, CslItemType>
> = {
  book: "book",
  article: "article-journal",
  "web-page": "webpage",
  interview: "interview",
};

/** A person: family and given name, or one literal (an organisation). */
export type CitationPerson =
  | { family: string; given: string }
  | { literal: string };

/** How a field's value is entered and validated. */
export type CitationFieldKind = "people" | "text" | "date";

export interface CitationFieldSpec {
  readonly name: string;
  readonly kind: CitationFieldKind;
}

const people = (name: string): CitationFieldSpec => ({ name, kind: "people" });
const text = (name: string): CitationFieldSpec => ({ name, kind: "text" });
const date = (name: string): CitationFieldSpec => ({ name, kind: "date" });

/**
 * Fixed field set per type, in display order (FR-5). Every field is optional
 * at the write boundary; "required" is the style table's job (OQ-4).
 */
export const CITATION_FIELDS_BY_TYPE: Readonly<
  Record<CitationReferenceType, readonly CitationFieldSpec[]>
> = {
  book: [
    people("authors"),
    people("editors"),
    text("title"),
    text("edition"),
    text("publisher"),
    text("place"),
    date("date"),
    text("url"),
    date("accessed"),
  ],
  article: [
    people("authors"),
    text("title"),
    text("journal"),
    text("volume"),
    text("issue"),
    text("pages"),
    date("date"),
    text("url"),
    date("accessed"),
  ],
  "web-page": [
    people("authors"),
    text("title"),
    text("website"),
    text("publisher"),
    date("date"),
    text("url"),
    date("accessed"),
  ],
  interview: [
    people("interviewee"),
    people("interviewer"),
    text("title"),
    text("medium"),
    text("place"),
    date("date"),
    text("url"),
  ],
};

/** Write-boundary limits (OQ-3). */
export const CITATION_FIELD_LIMITS = {
  maxPeoplePerRole: 50,
  maxTextLength: 500,
} as const;

/** YYYY, YYYY-MM or YYYY-MM-DD, checked by pattern only (OQ-3). */
export const CITATION_DATE_PATTERN: RegExp = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;

/** A style the app bundles; never fetched or client-supplied (FR-18). */
export interface BundledCitationStyle {
  readonly id: string;
  readonly label: string;
  readonly locale: string;
}

/** Exactly one bundled style: Chicago notes and bibliography, en-US (OQ-6). */
export const BUNDLED_CITATION_STYLES: readonly BundledCitationStyle[] = [
  {
    id: "chicago-notes-bibliography",
    label: "Chicago notes and bibliography",
    locale: "en-US",
  },
];

/** The compile request's optional citations option; absent means today (FR-9). */
export interface CompileCitationsOption {
  styleId: string;
}

/** Reason shown when module state is unknown on the Start Page (OQ-11). */
export const CITATIONS_OPEN_PROJECT_REASON =
  "Open the project to turn on citations" as const;

/** Reason shown for Markdown, plain text and Android (OQ-10). */
export const CITATIONS_FORMAT_UNAVAILABLE_REASON =
  "Citations are available for PDF and DOCX" as const;

/** Name used in the marker when a Source has none (OQ-13). */
export const UNNAMED_SOURCE_NAME = "unnamed Source" as const;

/**
 * The visible marker for a citation rendered with less than the style needs
 * (FR-16). The name is not escaped here; each output format escapes it.
 */
export function buildIncompleteCitationMarker(
  sourceName: string | undefined,
): string {
  const name =
    sourceName === undefined || sourceName === ""
      ? UNNAMED_SOURCE_NAME
      : sourceName;
  return `[citation incomplete: ${name}]`;
}

/** Why a citation cannot be rendered in full (FR-15). */
export type CitationGapKind =
  | "source-removed"
  | "missing-detail"
  | "could-not-be-checked";

/** One citation that cannot be rendered in full. */
export interface CitationGap {
  kind: CitationGapKind;
  resourceId: string;
  sourceId: string;
  /** Saved or current Source name, when known. */
  sourceName?: string;
  /** The missing detail names, for `missing-detail` only. */
  missingDetails?: readonly string[];
}

/** Outcomes that are failures, never an empty result (FR-17). */
export type CitationFailureKind =
  | "read-failed"
  | "engine-failed"
  | "style-load-failed";

export interface CitationFailure {
  status: "failed";
  failure: CitationFailureKind;
  /** Names what failed; never echoes client input. */
  message: string;
}

/** The pre-run check's result (FR-15); `failed` never shares `ok`'s shape. */
export type CitationCheckResult =
  | {
      status: "ok";
      gaps: readonly CitationGap[];
      citationCount: number;
      incompleteSourceCount: number;
    }
  | CitationFailure;
