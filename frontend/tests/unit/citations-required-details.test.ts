/**
 * Task 35: the hand-written required-details table, checked against the
 * engine's own output for the bundled Chicago style, so the table is tested
 * against the engine and not only against itself.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  initCitationEngine,
  renderCitations,
  runsToPlainText,
} from "../../src/lib/citations/citation-engine";
import { loadBundledStyle } from "../../src/lib/citations/style-loader";
import {
  mapCitationFieldsToCsl,
  type CitationFieldsInput,
} from "../../src/lib/models/citations-csl-mapper";
import {
  REQUIRED_DETAILS_BY_STYLE,
  findMissingDetails,
  type RequiredDetailsStyleId,
} from "../../src/lib/models/citations-required-details";
import {
  BUNDLED_CITATION_STYLES,
  CITATION_FIELDS_BY_TYPE,
  CITATION_REFERENCE_TYPES,
  type CitationReferenceType,
} from "../../src/lib/models/citations-types";

const STYLE_ID: RequiredDetailsStyleId = "chicago-notes-bibliography";

const WASM_PATH = path.resolve(
  process.cwd(),
  "src/lib/citations/engine/hayagriva_wasm_bg.wasm",
);

const WRITER = { family: "Quillfeather", given: "Ada" };
const OTHER = { family: "Marrowbone", given: "Bo" };

/** Every field filled, with a distinct word per field to look for in output. */
const FULL: Readonly<Record<CitationReferenceType, CitationFieldsInput>> = {
  book: {
    referenceType: "book",
    authors: [WRITER],
    editors: [OTHER],
    title: "Zorbtitle",
    edition: "Second edition",
    publisher: "Pubco",
    place: "Placeville",
    date: "2001-02-03",
    url: "http://urlhost.example/x",
    accessed: "2020-04-05",
  },
  article: {
    referenceType: "article",
    authors: [WRITER],
    title: "Zorbtitle",
    journal: "Journalname",
    volume: "Vol77",
    issue: "Iss88",
    pages: "Pg99-100",
    date: "2001-02-03",
    url: "http://urlhost.example/x",
    accessed: "2020-04-05",
  },
  "web-page": {
    referenceType: "web-page",
    authors: [WRITER],
    title: "Zorbtitle",
    website: "Sitename",
    publisher: "Pubco",
    date: "2001-02-03",
    url: "http://urlhost.example/x",
    accessed: "2020-04-05",
  },
  interview: {
    referenceType: "interview",
    interviewee: [WRITER],
    interviewer: [OTHER],
    title: "Zorbtitle",
    medium: "Radio",
    place: "Placeville",
    date: "2001-02-03",
    url: "http://urlhost.example/x",
  },
};

/** The text each required detail leaves in a rendered note when present. */
const SENTINEL: Readonly<Record<string, string>> = {
  authors: "Quillfeather",
  interviewee: "Quillfeather",
  interviewer: "Marrowbone",
  title: "Zorbtitle",
  publisher: "Pubco",
  journal: "Journalname",
  website: "Sitename",
  url: "urlhost.example",
  date: "2001",
};

function without(
  fields: CitationFieldsInput,
  name: string,
): CitationFieldsInput {
  const copy: Record<string, unknown> = { ...fields };
  delete copy[name];
  return copy as CitationFieldsInput;
}

describe("required-details table shape", () => {
  it("has exactly the bundled style ids", () => {
    expect(Object.keys(REQUIRED_DETAILS_BY_STYLE).sort()).toEqual(
      BUNDLED_CITATION_STYLES.map((s) => s.id).sort(),
    );
  });

  it.each(CITATION_REFERENCE_TYPES)(
    "%s requires details, each a real field of the type",
    (type) => {
      const details = REQUIRED_DETAILS_BY_STYLE[STYLE_ID][type];
      expect(details.length).toBeGreaterThan(0);
      const known = CITATION_FIELDS_BY_TYPE[type].map((f) => f.name);
      for (const d of details) {
        expect(known).toContain(d.field);
        expect(d.label.length).toBeGreaterThan(0);
      }
    },
  );
});

describe("findMissingDetails", () => {
  it.each(CITATION_REFERENCE_TYPES)("reports nothing for a full %s", (type) => {
    expect(findMissingDetails(STYLE_ID, FULL[type])).toEqual([]);
  });

  it("reports every required detail for a value with only a type", () => {
    for (const type of CITATION_REFERENCE_TYPES) {
      expect(
        findMissingDetails(STYLE_ID, { referenceType: type }),
      ).toHaveLength(REQUIRED_DETAILS_BY_STYLE[STYLE_ID][type].length);
    }
  });

  it("treats blank text, an empty list and blank names as missing", () => {
    const missing = findMissingDetails(STYLE_ID, {
      ...FULL.book,
      title: "   ",
      authors: [],
      publisher: "",
      date: undefined,
    });
    expect(missing).toEqual(["Authors", "Title", "Publisher", "Date"]);
    expect(
      findMissingDetails(STYLE_ID, {
        ...FULL.book,
        authors: [{ family: " ", given: "" }],
      }),
    ).toEqual(["Authors"]);
  });

  it("accepts a literal (organisation) name as a person", () => {
    expect(
      findMissingDetails(STYLE_ID, {
        ...FULL.book,
        authors: [{ literal: "Acme Press" }],
      }),
    ).toEqual([]);
  });

  it("does not count an optional detail as required", () => {
    expect(findMissingDetails(STYLE_ID, without(FULL.book, "edition"))).toEqual(
      [],
    );
  });
});

describe("findMissingDetails: a stored date that fails the date rule (Task 65)", () => {
  const NOW = new Date("2026-11-16T12:00:00Z");

  it("reports an invalid stored date under its field name, once", () => {
    expect(
      findMissingDetails(
        STYLE_ID,
        { ...FULL.interview, date: "2005-01-55" },
        NOW,
      ),
    ).toEqual(["Date"]);
    expect(
      findMissingDetails(STYLE_ID, { ...FULL.book, date: "2088" }, NOW),
    ).toEqual(["Date"]);
  });

  it("does not repeat Date when the date is also missing", () => {
    expect(
      findMissingDetails(
        STYLE_ID,
        { ...FULL.book, date: undefined, title: "" },
        NOW,
      ),
    ).toEqual(["Title", "Date"]);
  });

  it("reports an invalid stored accessed whether or not the style requires it", () => {
    expect(
      findMissingDetails(
        STYLE_ID,
        { ...FULL["web-page"], accessed: "1000-02-98" },
        NOW,
      ),
    ).toEqual(["Accessed"]);
    expect(
      findMissingDetails(STYLE_ID, { ...FULL.book, accessed: "2026-13" }, NOW),
    ).toEqual(["Accessed"]);
  });

  it("reports both invalid dates, date first", () => {
    expect(
      findMissingDetails(
        STYLE_ID,
        { ...FULL.article, date: "2023-02-29", accessed: "2088" },
        NOW,
      ),
    ).toEqual(["Date", "Accessed"]);
  });

  it("gives no new entry for valid stored dates, including a date equal to the UTC+14 date", () => {
    const rolled = new Date("2026-11-16T10:00:00Z");
    for (const type of CITATION_REFERENCE_TYPES) {
      expect(findMissingDetails(STYLE_ID, FULL[type], NOW)).toEqual([]);
    }
    expect(
      findMissingDetails(
        STYLE_ID,
        { ...FULL["web-page"], date: "2026-11-17", accessed: "2026-11-17" },
        rolled,
      ),
    ).toEqual([]);
    expect(
      findMissingDetails(
        STYLE_ID,
        { ...FULL["web-page"], date: "2026-11-18" },
        rolled,
      ),
    ).toEqual(["Date"]);
  });

  it("does not alter the value it reads", () => {
    const value = { ...FULL.book, date: "2005-01-55" };
    const copy = structuredClone(value);
    findMissingDetails(STYLE_ID, value, NOW);
    expect(value).toEqual(copy);
  });
});

describe("table checked against the engine (bundled Chicago style)", () => {
  let styleXml = "";
  let localeXml = "";

  beforeAll(async () => {
    await initCitationEngine(readFileSync(WASM_PATH));
    const loaded = await loadBundledStyle(STYLE_ID);
    if (!loaded.ok) throw new Error(loaded.message);
    styleXml = loaded.style;
    localeXml = loaded.locale;
  });

  function renderNote(fields: CitationFieldsInput): string {
    const out = renderCitations({
      styleXml,
      localeXml,
      items: [mapCitationFieldsToCsl("src-1", fields)],
      citations: [{ itemIds: ["src-1"], locator: null }],
      placement: "note",
    });
    if (!out.ok) throw new Error(`${out.stage}: ${out.message}`);
    return runsToPlainText(out.citations[0].runs).toLowerCase();
  }

  describe.each(CITATION_REFERENCE_TYPES)("%s", (type) => {
    const required = REQUIRED_DETAILS_BY_STYLE[STYLE_ID][type];

    it("renders a value with every required detail without placeholders", () => {
      const note = renderNote(FULL[type]);
      expect(note).not.toMatch(/n\.d\.|undefined|null|\?\?|[{}]/);
      for (const d of required) {
        expect(note).toContain(SENTINEL[d.field].toLowerCase());
      }
    });

    it.each(required.map((d) => d.field))(
      "with %s removed the table reports it and the engine output lacks it",
      (field) => {
        const detail = required.find((d) => d.field === field);
        const reduced = without(FULL[type], field);
        expect(findMissingDetails(STYLE_ID, reduced)).toEqual([detail?.label]);
        const note = renderNote(reduced);
        expect(note).not.toContain(SENTINEL[field].toLowerCase());
      },
    );
  });
});
