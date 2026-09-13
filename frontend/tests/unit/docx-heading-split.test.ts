import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  convertDocxToTiptap,
  type DocxTipTapDocument,
} from "../../src/lib/models/docx/mammoth-to-tiptap";
import {
  splitDocxAtHeadingLevel,
  UNTITLED_SECTION_TITLE,
} from "../../src/lib/models/docx/heading-split";

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "docx");

function readFixture(name: string): Buffer {
  return readFileSync(path.join(FIXTURES_DIR, name));
}

describe("splitDocxAtHeadingLevel", () => {
  it("splits multi-heading.docx into one section per level-1 heading", async () => {
    const { document, notes } = await convertDocxToTiptap(
      readFixture("multi-heading.docx"),
    );
    const { sections, noHeadingFound: isNoHeadingFound } =
      splitDocxAtHeadingLevel(document, notes, 1);

    expect(isNoHeadingFound).toBe(false);
    // A single H1 ("Chapter One") with no content before it: exactly one
    // section, carrying the H2/H3 headings and the trailing paragraph as
    // part of its own content (they don't start sections of their own at
    // level 1).
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Chapter One");
    expect(sections[0].content.content.map((node) => node.type)).toEqual([
      "heading",
      "heading",
      "heading",
      "paragraph",
    ]);
    expect(sections[0].notes).toEqual([]);
  });

  it("splits multi-heading.docx into one section per level-2 heading, leaving the level-1 heading in the leading section", async () => {
    const { document, notes } = await convertDocxToTiptap(
      readFixture("multi-heading.docx"),
    );
    const { sections, noHeadingFound: isNoHeadingFound } =
      splitDocxAtHeadingLevel(document, notes, 2);

    expect(isNoHeadingFound).toBe(false);
    // "Chapter One" (H1) precedes the first H2 and is non-empty content, so
    // it becomes its own untitled leading section.
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe(UNTITLED_SECTION_TITLE);
    expect(sections[0].content.content.map((node) => node.type)).toEqual([
      "heading",
    ]);
    expect(sections[1].title).toBe("A Section");
    expect(sections[1].content.content.map((node) => node.type)).toEqual([
      "heading",
      "heading",
      "paragraph",
    ]);
  });

  it("splits multi-heading.docx into one section per level-3 heading, leaving H1+H2 in the leading section", async () => {
    const { document, notes } = await convertDocxToTiptap(
      readFixture("multi-heading.docx"),
    );
    const { sections, noHeadingFound: isNoHeadingFound } =
      splitDocxAtHeadingLevel(document, notes, 3);

    expect(isNoHeadingFound).toBe(false);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe(UNTITLED_SECTION_TITLE);
    expect(sections[0].content.content.map((node) => node.type)).toEqual([
      "heading",
      "heading",
    ]);
    expect(sections[1].title).toBe("A Subsection");
    expect(sections[1].content.content.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
    ]);
  });

  it("returns a single section with noHeadingFound: true for no-headings.docx at the default level", async () => {
    const { document, notes } = await convertDocxToTiptap(
      readFixture("no-headings.docx"),
    );
    const result = splitDocxAtHeadingLevel(document, notes, 1);

    expect(result.noHeadingFound).toBe(true);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe(UNTITLED_SECTION_TITLE);
    expect(result.sections[0].content).toEqual(document);
  });

  it("returns exactly one section containing the whole document for level: 'none', with noHeadingFound false", async () => {
    const { document, notes } = await convertDocxToTiptap(
      readFixture("multi-heading.docx"),
    );
    const result = splitDocxAtHeadingLevel(document, notes, "none");

    expect(result.noHeadingFound).toBe(false);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].content).toEqual(document);
  });

  // footnotes-endnotes.docx (per Task 2/6) has both note references inside
  // a single paragraph with no heading at all, so it cannot exercise
  // cross-section note attribution as committed. To test the attribution
  // rule described in heading-split.ts's module doc — scanning each
  // section's own text for "[n]" markers — this test reuses that fixture's
  // real, converted `notes` array (real footnote/endnote text, from Task 6)
  // but assembles a synthetic multi-section document by hand: the footnote
  // reference "[1]" before a mid-document heading, and the endnote
  // reference "[2]" after it. This is the one deviation from "run directly
  // against the fixture's own conversion output" in this test file, and is
  // called out here rather than left implicit.
  it("attributes a footnote referenced after a mid-document heading to that later section, not the first (footnotes-endnotes.docx notes)", async () => {
    const { notes } = await convertDocxToTiptap(
      readFixture("footnotes-endnotes.docx"),
    );
    expect(notes).toEqual([
      { n: 1, text: "This is the footnote text." },
      { n: 2, text: "This is the endnote text." },
    ]);

    const syntheticDocument: DocxTipTapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "A sentence with a footnote. [1]" }],
        },
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Later Section" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "And one with an endnote. [2]" }],
        },
      ],
    };

    const { sections, noHeadingFound: isNoHeadingFound } =
      splitDocxAtHeadingLevel(syntheticDocument, notes, 1);

    expect(isNoHeadingFound).toBe(false);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe(UNTITLED_SECTION_TITLE);
    expect(sections[0].notes).toEqual([
      { n: 1, text: "This is the footnote text." },
    ]);
    expect(sections[1].title).toBe("Later Section");
    expect(sections[1].notes).toEqual([
      { n: 2, text: "This is the endnote text." },
    ]);
  });

  it("drops a purely blank leading section rather than emitting an empty placeholder-titled one", () => {
    const document: DocxTipTapDocument = {
      type: "doc",
      content: [
        { type: "paragraph", content: [] },
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "First Heading" }],
        },
      ],
    };

    const { sections } = splitDocxAtHeadingLevel(document, [], 1);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("First Heading");
  });
});
