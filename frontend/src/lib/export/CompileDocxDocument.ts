import {
  Document,
  Paragraph,
  TextRun,
  Packer,
  LineRuleType,
  BorderStyle,
  AlignmentType,
  FootnoteReferenceRun,
} from "docx";
import type { CompileSection } from "./compile-text";
import type { CitationRun } from "../citations/citation-engine";

// 1 inch = 1440 twips
const MARGIN = 1440;
// 11pt = 22 half-points
const BODY_SIZE = 22;
// 13pt = 26 half-points
const HEADER_SIZE = 26;
// 1.8× line height: 1.8 * 240 = 432
const LINE_SPACING = { line: 432, lineRule: LineRuleType.AUTO };
// ~33pt gap before each section start
const SECTION_SPACING_BEFORE = 480;

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: "Times New Roman", size: BODY_SIZE })],
    spacing: { ...LINE_SPACING, before: 0, after: 0 },
  });
}

function headerParagraph(name: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: name,
        font: "Calibri",
        size: HEADER_SIZE,
        bold: true,
      }),
    ],
    spacing: { ...LINE_SPACING, before: SECTION_SPACING_BEFORE, after: 120 },
    border: {
      bottom: { color: "000000", space: 4, style: BorderStyle.SINGLE, size: 6 },
    },
    alignment: AlignmentType.LEFT,
  });
}

/** One rendered citation placed in a section's text (Feature 116, Task 41). */
export interface DocxCitationNote {
  /** UTF-16 offset into the section's `content`; the note follows that many characters. */
  offset: number;
  /** Manuscript-wide note number (the Word footnote id), or null for an in-text citation. */
  noteNumber: number | null;
  runs: readonly CitationRun[];
}

/** The rendered citations of one section; aligned by index with the sections. */
export interface DocxCitationsSection {
  notes: readonly DocxCitationNote[];
}

/** Optional citations input; absent means today's output, unchanged. */
export interface DocxCitationsInput {
  sections: readonly DocxCitationsSection[];
  bibliography?: {
    heading: string;
    entries: readonly { runs: readonly CitationRun[] }[];
  };
}

/**
 * Engine runs become text runs with their formatting. A run's `link` is never
 * made a hyperlink and is not printed (FR-21); the run text is escaped by the
 * XML writer and never read as markup.
 */
function citationTextRuns(runs: readonly CitationRun[]): TextRun[] {
  return runs.map(
    (run) =>
      new TextRun({
        text: run.text,
        font: "Times New Roman",
        size: BODY_SIZE,
        italics: run.italic === true ? true : undefined,
        bold: run.bold === true ? true : undefined,
        smallCaps: run.smallCaps === true ? true : undefined,
        superScript: run.superscript === true ? true : undefined,
        subScript: run.subscript === true ? true : undefined,
      }),
  );
}

type DocxInline = TextRun | FootnoteReferenceRun;

/** One line of a section with the citations that fall inside it. */
function lineParagraph(
  line: string,
  lineStart: number,
  notes: readonly DocxCitationNote[],
): Paragraph {
  const children: DocxInline[] = [];
  let cursor = 0;
  for (const note of notes) {
    const at = note.offset - lineStart;
    if (at > cursor) {
      children.push(
        new TextRun({
          text: line.slice(cursor, at),
          font: "Times New Roman",
          size: BODY_SIZE,
        }),
      );
      cursor = at;
    }
    if (note.noteNumber === null) {
      children.push(...citationTextRuns(note.runs));
    } else {
      children.push(new FootnoteReferenceRun(note.noteNumber));
    }
  }
  if (cursor < line.length || children.length === 0) {
    children.push(
      new TextRun({
        text: line.slice(cursor),
        font: "Times New Roman",
        size: BODY_SIZE,
      }),
    );
  }
  return new Paragraph({
    children,
    spacing: { ...LINE_SPACING, before: 0, after: 0 },
  });
}

/** Splits a section into paragraphs, placing each note in the line holding its offset. */
function sectionParagraphs(
  content: string,
  notes: readonly DocxCitationNote[],
): Paragraph[] {
  for (const note of notes) {
    if (
      !Number.isInteger(note.offset) ||
      note.offset < 0 ||
      note.offset > content.length
    ) {
      throw new RangeError(
        "A citation is anchored outside the text of its section.",
      );
    }
  }
  const ordered = [...notes].sort((a, b) => a.offset - b.offset);
  const paragraphs: Paragraph[] = [];
  let lineStart = 0;
  let next = 0;
  for (const line of content.split("\n")) {
    const lineEnd = lineStart + line.length;
    const here: DocxCitationNote[] = [];
    while (next < ordered.length && ordered[next].offset <= lineEnd) {
      here.push(ordered[next]);
      next += 1;
    }
    paragraphs.push(lineParagraph(line, lineStart, here));
    lineStart = lineEnd + 1;
  }
  return paragraphs;
}

/** The footnote table: one Word footnote per note-style citation, keyed by its number. */
function footnoteTable(
  citations: DocxCitationsInput,
): Record<number, { children: Paragraph[] }> | undefined {
  const table: Record<number, { children: Paragraph[] }> = {};
  for (const section of citations.sections) {
    for (const note of section.notes) {
      if (note.noteNumber === null) continue;
      if (!Number.isInteger(note.noteNumber) || note.noteNumber < 1) {
        throw new RangeError("A note number must be a whole number from 1.");
      }
      if (table[note.noteNumber] !== undefined) {
        throw new RangeError(`Note number ${note.noteNumber} is used twice.`);
      }
      table[note.noteNumber] = {
        children: [new Paragraph({ children: citationTextRuns(note.runs) })],
      };
    }
  }
  return Object.keys(table).length > 0 ? table : undefined;
}

function bibliographyParagraphs(
  bibliography: NonNullable<DocxCitationsInput["bibliography"]>,
): Paragraph[] {
  return [
    headerParagraph(bibliography.heading),
    ...bibliography.entries.map(
      (entry) =>
        new Paragraph({
          children: citationTextRuns(entry.runs),
          spacing: { ...LINE_SPACING, before: 0, after: 120 },
        }),
    ),
  ];
}

export function buildDocxDocument(
  sections: CompileSection[],
  options: { includeHeaders: boolean },
  citations?: DocxCitationsInput,
): Document {
  if (
    citations !== undefined &&
    citations.sections.length !== sections.length
  ) {
    throw new RangeError(
      "The citations do not match the sections of the manuscript.",
    );
  }
  const children: Paragraph[] = [];

  sections.forEach((section, index) => {
    if (options.includeHeaders) {
      children.push(headerParagraph(section.name));
    }
    if (citations === undefined) {
      for (const line of section.content.split("\n")) {
        children.push(bodyParagraph(line));
      }
    } else {
      children.push(
        ...sectionParagraphs(section.content, citations.sections[index].notes),
      );
    }
  });
  if (citations?.bibliography !== undefined) {
    children.push(...bibliographyParagraphs(citations.bibliography));
  }
  const footnotes =
    citations === undefined ? undefined : footnoteTable(citations);

  return new Document({
    ...(footnotes === undefined ? {} : { footnotes }),
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: MARGIN,
              right: MARGIN,
              bottom: MARGIN,
              left: MARGIN,
            },
          },
        },
        children,
      },
    ],
  });
}

export { Packer };
