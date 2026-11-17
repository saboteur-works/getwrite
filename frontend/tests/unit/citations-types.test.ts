/**
 * Feature 116, Task 13 (FR-4, FR-5, FR-9, FR-16, OQ-10, OQ-11, OQ-13): the
 * inert citations contract. Pins constants and wording exactly as the spec
 * states them.
 */
import { describe, expect, it } from "vitest";
import {
  BUNDLED_CITATION_STYLES,
  CITATIONS_FORMAT_UNAVAILABLE_REASON,
  CITATIONS_MODULE_ID,
  CITATIONS_MODULE_LABEL,
  CITATIONS_OPEN_PROJECT_REASON,
  CITATION_DATE_PATTERN,
  CITATION_FIELDS_BY_TYPE,
  CITATION_FIELDS_KEY,
  CITATION_FIELD_LIMITS,
  CITATION_REFERENCE_TYPES,
  CSL_ITEM_TYPE_BY_REFERENCE_TYPE,
  UNNAMED_SOURCE_NAME,
  buildIncompleteCitationMarker,
  type CitationCheckResult,
  type CitationReferenceType,
} from "../../src/lib/models/citations-types";

describe("module constants", () => {
  it("names the module and the sidecar key", () => {
    expect(CITATIONS_MODULE_ID).toBe("citations");
    expect(CITATIONS_MODULE_LABEL).toBe("Citations");
    expect(CITATION_FIELDS_KEY).toBe("citationFields");
  });
});

describe("reference types (FR-5)", () => {
  it("lists exactly the four types", () => {
    expect([...CITATION_REFERENCE_TYPES]).toEqual([
      "book",
      "article",
      "web-page",
      "interview",
    ]);
  });

  it("maps each to its CSL item type", () => {
    expect(CSL_ITEM_TYPE_BY_REFERENCE_TYPE).toEqual({
      book: "book",
      article: "article-journal",
      "web-page": "webpage",
      interview: "interview",
    });
  });

  it("gives each type its fixed field list", () => {
    const names = (t: CitationReferenceType): string[] =>
      CITATION_FIELDS_BY_TYPE[t].map((f) => f.name);
    expect(names("book")).toEqual([
      "authors",
      "editors",
      "title",
      "edition",
      "publisher",
      "place",
      "date",
      "url",
      "accessed",
    ]);
    expect(names("article")).toEqual([
      "authors",
      "title",
      "journal",
      "volume",
      "issue",
      "pages",
      "date",
      "url",
      "accessed",
    ]);
    expect(names("web-page")).toEqual([
      "authors",
      "title",
      "website",
      "publisher",
      "date",
      "url",
      "accessed",
    ]);
    expect(names("interview")).toEqual([
      "interviewee",
      "interviewer",
      "title",
      "medium",
      "place",
      "date",
      "url",
    ]);
  });

  it("tags each field with a kind", () => {
    const kinds = new Set(
      CITATION_REFERENCE_TYPES.flatMap((t) =>
        CITATION_FIELDS_BY_TYPE[t].map((f) => f.kind),
      ),
    );
    expect([...kinds].sort()).toEqual(["date", "people", "text"]);
  });
});

describe("limits (OQ-3)", () => {
  it("states 50 people per role and 500 characters of text", () => {
    expect(CITATION_FIELD_LIMITS.maxPeoplePerRole).toBe(50);
    expect(CITATION_FIELD_LIMITS.maxTextLength).toBe(500);
  });

  it("accepts YYYY, YYYY-MM and YYYY-MM-DD only", () => {
    for (const ok of ["2024", "2024-05", "2024-05-17"]) {
      expect(CITATION_DATE_PATTERN.test(ok)).toBe(true);
    }
    for (const bad of [
      "24",
      "2024-5",
      "2024-05-1",
      "2024/05/17",
      " 2024",
      "2024-05-17\n",
      "",
    ]) {
      expect(CITATION_DATE_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe("bundled styles (OQ-6, FR-18)", () => {
  it("has exactly one entry, Chicago notes and bibliography, en-US", () => {
    expect(BUNDLED_CITATION_STYLES).toHaveLength(1);
    const [style] = BUNDLED_CITATION_STYLES;
    expect(style.locale).toBe("en-US");
    expect(style.label).toBe("Chicago notes and bibliography");
    expect(style.id.length).toBeGreaterThan(0);
  });
});

describe("stated reasons (OQ-10, OQ-11)", () => {
  it("uses the exact wording", () => {
    expect(CITATIONS_OPEN_PROJECT_REASON).toBe(
      "Open the project to turn on citations",
    );
    expect(CITATIONS_FORMAT_UNAVAILABLE_REASON).toBe(
      "Citations are available for PDF and DOCX",
    );
  });
});

describe("incomplete marker (FR-16, OQ-13)", () => {
  it("embeds the Source name", () => {
    expect(buildIncompleteCitationMarker("Field Notes")).toBe(
      "[citation incomplete: Field Notes]",
    );
  });

  it("falls back to the literal for an undefined or empty name", () => {
    expect(UNNAMED_SOURCE_NAME).toBe("unnamed Source");
    expect(buildIncompleteCitationMarker(undefined)).toBe(
      "[citation incomplete: unnamed Source]",
    );
    expect(buildIncompleteCitationMarker("")).toBe(
      "[citation incomplete: unnamed Source]",
    );
  });

  it("does not escape; escaping is the output format's job", () => {
    expect(buildIncompleteCitationMarker("A & <B>")).toBe(
      "[citation incomplete: A & <B>]",
    );
  });
});

describe("result unions (FR-15, FR-17)", () => {
  it("keeps failed and empty distinct by discriminant", () => {
    const empty: CitationCheckResult = {
      status: "ok",
      gaps: [],
      citationCount: 0,
      incompleteSourceCount: 0,
    };
    const failed: CitationCheckResult = {
      status: "failed",
      failure: "read-failed",
      message: "Could not read a Source",
    };
    expect(empty.status).not.toBe(failed.status);
  });
});
