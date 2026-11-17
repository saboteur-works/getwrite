/**
 * Feature 116, Task 42 (FR-11, FR-12, FR-13, FR-21): the PDF document with
 * citations. The construction is the two-pass build of
 * `experiments/task-36.md`: pass 1 renders the body and finds the page of each
 * reference mark by per-page extracted text; pass 2 renders the same body with
 * a `fixed` footer drawing the notes of each page. Placement is checked by
 * ordered per-page extracted text, never by raw bytes.
 */
// @vitest-environment node
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { describe, expect, it } from "vitest";

import type { CitationRun } from "../../src/lib/citations/citation-engine";
import {
  CompilePDFDocument,
  citationRunStyle,
  placeNotesOnPages,
  registerIBMPlexFonts,
  validateNotes,
  type PdfCitationsInput,
  type PdfNote,
} from "../../src/lib/export/CompilePDFDocument";
import type { CompileSection } from "../../src/lib/export/compile-text";
import { extractPdfPageTexts } from "../helpers/pdf-text";

const FILLER =
  "The quick brown fox jumps over the lazy dog while the river keeps running past the old mill and the writers argue about commas. ";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface Corpus {
  sections: CompileSection[];
  notes: PdfNote[];
}

/** 3 sections of 8 paragraphs, each paragraph ending in a sentence with a note. */
function corpus(
  noteRuns: (n: number) => CitationRun[] = (n) => [
    { text: `NOTE-${pad(n)} Author, ` },
    { text: `Title ${pad(n)}`, italic: true },
    { text: `, 19${pad(n)}.` },
  ],
): Corpus {
  const sections: CompileSection[] = [];
  const notes: PdfNote[] = [];
  let n = 0;
  for (let s = 0; s < 3; s += 1) {
    const paragraphs: string[] = [];
    for (let p = 0; p < 8; p += 1) {
      n += 1;
      paragraphs.push(`${FILLER.repeat(6)}Claim ${pad(n)} ends here.`);
      notes.push({
        sectionIndex: s,
        // After the final "." of the paragraph's text.
        offset: paragraphs.join("\n\n").length,
        noteNumber: n,
        runs: noteRuns(n),
      });
    }
    sections.push({
      name: `Chapter ${s + 1}`,
      content: paragraphs.join("\n\n"),
    });
  }
  return { sections, notes };
}

type Element = React.ReactElement<DocumentProps>;

async function render(
  sections: CompileSection[],
  citations?: PdfCitationsInput,
  notePlacement?: ReadonlyMap<number, readonly number[]>,
): Promise<Uint8Array> {
  registerIBMPlexFonts();
  const el = React.createElement(CompilePDFDocument, {
    sections,
    includeHeaders: true,
    citations,
    notePlacement,
  }) as Element;
  return new Uint8Array(await renderToBuffer(el));
}

interface TwoPass {
  pass1: string[];
  pass2: string[];
  bytes2: Uint8Array;
  placement: Map<number, number[]>;
}

async function twoPass(
  sections: CompileSection[],
  citations: PdfCitationsInput,
): Promise<TwoPass> {
  const bytes1 = await render(sections, citations);
  const pass1 = await extractPdfPageTexts(bytes1);
  const located = placeNotesOnPages(pass1, sections, citations.notes);
  if (!located.ok) throw new Error(located.message);
  const bytes2 = await render(sections, citations, located.placement);
  const pass2 = await extractPdfPageTexts(bytes2);
  return { pass1, pass2, bytes2, placement: located.placement };
}

function squash(s: string): string {
  return s.replace(/\s+/g, "");
}

function pagesContaining(pages: string[], needle: string): number[] {
  const out: number[] = [];
  pages.forEach((t, i) => {
    if (squash(t).includes(squash(needle))) out.push(i + 1);
  });
  return out;
}

describe("PDF citations: two-pass note placement (experiments/task-36.md)", () => {
  it("puts each note's text on the page of its reference mark (24 notes)", async () => {
    const { sections, notes } = corpus();
    const { pass1, pass2, placement } = await twoPass(sections, { notes });
    const rows = notes.map((note) => {
      const n = note.noteNumber;
      const markPages = pagesContaining(
        pass2,
        `Claim ${pad(n)} ends here.${n}`,
      );
      const notePages = pagesContaining(
        pass2,
        `NOTE-${pad(n)} Author, Title ${pad(n)}, 19${pad(n)}.`,
      );
      return { n, markPages, notePages };
    });
    const bad = rows.filter(
      (r) =>
        r.markPages.length !== 1 ||
        r.notePages.length !== 1 ||
        r.markPages[0] !== r.notePages[0],
    );
    console.log(
      `task-42 pass1 pages=${pass1.length} pass2 pages=${pass2.length} notes=${notes.length} notes-on-mark-page=${rows.length - bad.length} not=${bad.length} pages-with-footer=${placement.size}`,
    );
    expect(pass1.length - 1).toBeGreaterThanOrEqual(3);
    expect(pass2.length).toBe(pass1.length);
    expect(bad).toEqual([]);
  });

  it("keeps the notes of one page in note-number order in the extracted text", async () => {
    const { sections, notes } = corpus();
    const { pass2, placement } = await twoPass(sections, { notes });
    expect(placement.size).toBeGreaterThan(0);
    placement.forEach((numbers, page) => {
      const text = squash(pass2[page - 1] ?? "");
      const idx = numbers.map((n) => text.indexOf(`NOTE-${pad(n)}Author`));
      expect(idx.every((i) => i >= 0)).toBe(true);
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    });
  });

  it("placeNotesOnPages names the note it cannot find and never drops it", () => {
    const sections: CompileSection[] = [{ name: "A", content: "Hello world." }];
    const notes: PdfNote[] = [
      { sectionIndex: 0, offset: 12, noteNumber: 7, runs: [{ text: "n" }] },
    ];
    const result = placeNotesOnPages(["nothing here"], sections, notes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("7");
  });

  it("refuses an offset outside the section and a repeated note number", async () => {
    const sections: CompileSection[] = [{ name: "A", content: "Hello." }];
    const far: PdfNote[] = [
      { sectionIndex: 0, offset: 99, noteNumber: 1, runs: [{ text: "n" }] },
    ];
    const twice: PdfNote[] = [
      { sectionIndex: 0, offset: 1, noteNumber: 1, runs: [{ text: "n" }] },
      { sectionIndex: 0, offset: 2, noteNumber: 1, runs: [{ text: "m" }] },
    ];
    // The named message comes from the validator that the pass-1 helper runs.
    expect(() => validateNotes(sections, far)).toThrow(/offset/i);
    expect(() => validateNotes(sections, twice)).toThrow(/note number/i);
    expect(() => placeNotesOnPages(["x"], sections, far)).toThrow(/offset/i);
    // The document itself also refuses (the renderer wraps the message).
    await expect(render(sections, { notes: far })).rejects.toThrow();
    await expect(render(sections, { notes: twice })).rejects.toThrow();
  });
});

interface Glyph {
  str: string;
  y: number;
  h: number;
}

async function glyphsByPage(bytes: Uint8Array): Promise<Glyph[][]> {
  const doc = await getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const pages: Glyph[][] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();
    const rows: Glyph[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const t = item as TextItem;
      if (t.str.trim() === "") continue;
      rows.push({ str: t.str, y: t.transform[5] ?? 0, h: t.height });
    }
    pages.push(rows);
  }
  return pages;
}

describe("PDF citations: measurements the prototype did not take", () => {
  it("records footer-versus-body position, long notes and page count", async () => {
    const longRuns = (n: number): CitationRun[] => [
      {
        text: `NOTE-${pad(n)} ${"Long note words wrapping over several lines. ".repeat(n % 8 === 0 ? 6 : 1)}`,
      },
    ];
    const { sections, notes } = corpus(longRuns);
    const { pass1, pass2, bytes2, placement } = await twoPass(sections, {
      notes,
    });
    const pages = await glyphsByPage(bytes2);
    const lines: string[] = [];
    pages.forEach((rows, i) => {
      const footer = rows.filter((r) =>
        /NOTE-|[Ll]ong|wrapping|several|lines\.|words/.test(r.str),
      );
      const body = rows.filter(
        (r) => !footer.includes(r) && !/^\d+$/.test(r.str),
      );
      if (footer.length === 0 || body.length === 0) return;
      const footerTop = Math.max(...footer.map((r) => r.y + r.h));
      const bodyBottom = Math.min(...body.map((r) => r.y));
      lines.push(
        `page ${i + 1}: notes=${placement.get(i + 1)?.length ?? 0} footerLines=${footer.length} bodyLowestY=${bodyBottom.toFixed(1)} footerTopY=${footerTop.toFixed(1)} footerReachesBody=${bodyBottom < footerTop}`,
      );
    });
    console.log(
      `task-42 long-note run: pass1 pages=${pass1.length} pass2 pages=${pass2.length}\n${lines.join("\n")}`,
    );
    expect(pass2.length).toBe(pass1.length);
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe("PDF citations: a reference at the bottom of a page", () => {
  it("finds the largest one-page body, then places the note at its end and just past it", async () => {
    const words = (n: number): string =>
      Array.from({ length: n }, (_, i) => `w${pad(i % 100)}x`).join(" ");
    const note = (offset: number): PdfNote => ({
      sectionIndex: 0,
      offset,
      noteNumber: 1,
      runs: [{ text: "NOTE-EDGE Author, Title." }],
    });
    const pagesFor = async (n: number): Promise<number> => {
      const sections: CompileSection[] = [
        { name: "A", content: `${words(n)}.` },
      ];
      const bytes = await render(sections, {
        notes: [note(sections[0]!.content.length)],
      });
      return (await extractPdfPageTexts(bytes)).length;
    };
    let lo = 1;
    let hi = 600;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if ((await pagesFor(mid)) === 1) lo = mid;
      else hi = mid - 1;
    }
    const results: string[] = [];
    for (const n of [lo, lo + 1]) {
      const sections: CompileSection[] = [
        { name: "A", content: `${words(n)}.` },
      ];
      const citations: PdfCitationsInput = {
        notes: [note(sections[0]!.content.length)],
      };
      const { pass1, pass2 } = await twoPass(sections, citations);
      const markPages = pagesContaining(pass2, `w${pad((n - 1) % 100)}x.1`);
      const notePages = pagesContaining(pass2, "NOTE-EDGE Author, Title.");
      results.push(
        `words=${n} pass1 pages=${pass1.length} pass2 pages=${pass2.length} markPages=${JSON.stringify(markPages)} notePages=${JSON.stringify(notePages)}`,
      );
      expect(notePages).toEqual(markPages);
      expect(markPages.length).toBe(1);
    }
    console.log(`task-42 page-bottom run: ${results.join(" | ")}`);
  });
});

describe("PDF citations: bibliography", () => {
  it("follows the manuscript with its heading, entries in order", async () => {
    const { sections, notes } = corpus();
    const citations: PdfCitationsInput = {
      notes,
      bibliography: {
        heading: "Bibliography",
        entries: [
          {
            runs: [{ text: "BIB-A Adams, " }, { text: "First", italic: true }],
          },
          { runs: [{ text: "BIB-B Brown, Second." }] },
        ],
      },
    };
    const { pass2 } = await twoPass(sections, citations);
    const all = squash(pass2.join(""));
    const lastBody = all.lastIndexOf(squash("Claim 24 ends here."));
    const heading = all.indexOf("Bibliography", lastBody);
    const a = all.indexOf("BIB-AAdams,First");
    const b = all.indexOf("BIB-BBrown,Second.");
    expect(lastBody).toBeGreaterThan(0);
    expect(heading).toBeGreaterThan(lastBody);
    expect(a).toBeGreaterThan(heading);
    expect(b).toBeGreaterThan(a);
  });
});

describe("PDF citations: formatting runs and escaping", () => {
  it("maps each run flag to a style", () => {
    expect(citationRunStyle({ text: "x", italic: true }, 8).fontStyle).toBe(
      "italic",
    );
    expect(citationRunStyle({ text: "x", bold: true }, 8)).toMatchObject({
      fontFamily: "IBM Plex Sans",
      fontWeight: 700,
    });
    expect(citationRunStyle({ text: "x", superscript: true }, 8)).toMatchObject(
      { verticalAlign: "super" },
    );
    expect(citationRunStyle({ text: "x", subscript: true }, 8)).toMatchObject({
      verticalAlign: "sub",
    });
    expect(citationRunStyle({ text: "x", smallCaps: true }, 8)).toMatchObject({
      textTransform: "uppercase",
    });
    expect(citationRunStyle({ text: "x" }, 8)).toEqual({});
  });

  it("the italic, bold, small-caps, superscript and subscript runs reach the PDF", async () => {
    const sections: CompileSection[] = [{ name: "A", content: "Body text." }];
    const notes: PdfNote[] = [
      {
        sectionIndex: 0,
        offset: 10,
        noteNumber: 1,
        runs: [
          { text: "ITAL", italic: true },
          { text: " " },
          { text: "BOLD", bold: true },
          { text: " " },
          { text: "Smcap", smallCaps: true },
          { text: " " },
          { text: "SUPR", superscript: true },
          { text: " " },
          { text: "SUBR", subscript: true },
        ],
      },
    ];
    const bodyOnly = await render(sections);
    const { pass2, bytes2 } = await twoPass(sections, { notes });
    const text = squash(pass2.join(""));
    for (const word of ["ITAL", "BOLD", "SMCAP", "SUPR", "SUBR"]) {
      expect(text).toContain(word);
    }
    const raw = Buffer.from(bytes2).toString("latin1");
    expect(raw).toMatch(/IBMPlexSerif-Italic/);
    expect(raw).toMatch(/IBMPlexSans-Bold/);
    // A body with no italic or bold run embeds neither face.
    const rawBody = Buffer.from(bodyOnly).toString("latin1");
    expect(rawBody).not.toMatch(/IBMPlexSerif-Italic/);
  });

  it("prints markup and a link as plain text and writes no link annotation", async () => {
    const sections: CompileSection[] = [{ name: "A", content: "Body text." }];
    const notes: PdfNote[] = [
      {
        sectionIndex: 0,
        offset: 10,
        noteNumber: 1,
        runs: [
          { text: "<b>bold</b> &amp <script>x</script> " },
          { text: "see site", link: "https://example.test/path?q=1" },
        ],
      },
    ];
    const { pass2, bytes2 } = await twoPass(sections, {
      notes,
      bibliography: {
        heading: "Bibliography",
        entries: [
          { runs: [{ text: "<i>raw</i>", link: "https://example.test/b" }] },
        ],
      },
    });
    const text = squash(pass2.join(""));
    expect(text).toContain(squash("<b>bold</b> &amp <script>x</script>"));
    expect(text).toContain("<i>raw</i>");
    const raw = Buffer.from(bytes2).toString("latin1");
    expect(raw).not.toMatch(/\/URI/);
    expect(raw).not.toMatch(/\/Subtype\s*\/Link/);
    expect(raw).not.toContain("example.test");
  });
});

describe("PDF citations: no citations input", () => {
  it("renders the same pages with an absent input and with an empty one", async () => {
    const sections: CompileSection[] = [
      { name: "One", content: "First body.\n\nSecond paragraph." },
      { name: "Two", content: FILLER.repeat(40) },
    ];
    const today = await extractPdfPageTexts(await render(sections));
    const withEmpty = await extractPdfPageTexts(
      await render(sections, { notes: [] }),
    );
    expect(withEmpty).toEqual(today);
    expect(today.join("")).toContain("First body.");
  });
});
