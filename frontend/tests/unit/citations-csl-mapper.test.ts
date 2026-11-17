/**
 * Feature 116, Task 16 (FR-5): the pure CSL-JSON mapper.
 */
import { describe, expect, it } from "vitest";
import {
  mapCitationFieldsToCsl,
  type CitationFieldsInput,
} from "../../src/lib/models/citations-csl-mapper";

describe("mapCitationFieldsToCsl", () => {
  it("maps a book with people, publisher, place and dates", () => {
    const fields: CitationFieldsInput = {
      referenceType: "book",
      authors: [{ family: "Le Guin", given: "Ursula" }],
      editors: [{ literal: "The Editorial Board" }],
      title: "The Dispossessed",
      edition: "2nd",
      publisher: "Harper",
      place: "New York",
      date: "1974-05",
      url: "https://example.org/b",
      accessed: "2026-11-14",
    };
    expect(mapCitationFieldsToCsl("src-1", fields)).toEqual({
      id: "src-1",
      type: "book",
      author: [{ family: "Le Guin", given: "Ursula" }],
      editor: [{ literal: "The Editorial Board" }],
      title: "The Dispossessed",
      edition: "2nd",
      publisher: "Harper",
      "publisher-place": "New York",
      issued: { "date-parts": [[1974, 5]] },
      URL: "https://example.org/b",
      accessed: { "date-parts": [[2026, 11, 14]] },
    });
  });

  it("maps an article to article-journal with container-title and page", () => {
    const item = mapCitationFieldsToCsl("a", {
      referenceType: "article",
      title: "T",
      journal: "J",
      volume: "12",
      issue: "3",
      pages: "10-20",
      date: "1999",
    });
    expect(item).toEqual({
      id: "a",
      type: "article-journal",
      title: "T",
      "container-title": "J",
      volume: "12",
      issue: "3",
      page: "10-20",
      issued: { "date-parts": [[1999]] },
    });
  });

  it("maps a web page to webpage with the website as container-title", () => {
    const item = mapCitationFieldsToCsl("w", {
      referenceType: "web-page",
      authors: [{ literal: "ACME" }],
      website: "Site",
      url: "https://x.test",
    });
    expect(item).toEqual({
      id: "w",
      type: "webpage",
      author: [{ literal: "ACME" }],
      "container-title": "Site",
      URL: "https://x.test",
    });
  });

  it("maps an interview: interviewee to author, interviewer to interviewer", () => {
    const item = mapCitationFieldsToCsl("i", {
      referenceType: "interview",
      interviewee: [{ family: "Roe", given: "Jane" }],
      interviewer: [{ family: "Doe", given: "John" }],
      medium: "Telephone",
      place: "Oslo",
      date: "2020-02-03",
    });
    expect(item).toEqual({
      id: "i",
      type: "interview",
      author: [{ family: "Roe", given: "Jane" }],
      interviewer: [{ family: "Doe", given: "John" }],
      medium: "Telephone",
      "publisher-place": "Oslo",
      issued: { "date-parts": [[2020, 2, 3]] },
    });
  });

  it("omits missing, empty and absent fields", () => {
    const item = mapCitationFieldsToCsl("e", {
      referenceType: "book",
      title: "",
      authors: [],
      publisher: undefined,
      date: "",
    });
    expect(item).toEqual({ id: "e", type: "book" });
    expect(Object.keys(item)).not.toContain("title");
  });

  it("keeps a partial date partial", () => {
    expect(
      mapCitationFieldsToCsl("d", { referenceType: "book", date: "2001" })
        .issued,
    ).toEqual({ "date-parts": [[2001]] });
  });

  it("omits a date that does not match the pattern", () => {
    expect(
      mapCitationFieldsToCsl("d", { referenceType: "book", date: "soon" })
        .issued,
    ).toBeUndefined();
  });

  it("carries markup as plain text, unchanged", () => {
    const markup = "<script>alert(1)</script> **x**";
    const item = mapCitationFieldsToCsl("m", {
      referenceType: "book",
      title: markup,
      authors: [{ family: markup, given: "<b>g</b>" }],
    });
    expect(item.title).toBe(markup);
    expect(item.author).toEqual([{ family: markup, given: "<b>g</b>" }]);
  });

  it("returns a plain object and does not mutate its input", () => {
    const fields: CitationFieldsInput = {
      referenceType: "book",
      authors: [{ family: "A", given: "B" }],
    };
    const copy = JSON.stringify(fields);
    const item = mapCitationFieldsToCsl("p", fields);
    expect(Object.getPrototypeOf(item)).toBe(Object.prototype);
    expect(JSON.stringify(fields)).toBe(copy);
  });

  it("drops people entries that are not a name or a literal", () => {
    const item = mapCitationFieldsToCsl("x", {
      referenceType: "book",
      authors: [{ family: "A", given: "B" }, { nope: 1 }, "str", null],
    });
    expect(item.author).toEqual([{ family: "A", given: "B" }]);
  });
});
