/**
 * Feature 116, Task 36 (FR-12): footnote placement experiment.
 *
 * A throwaway harness, not the production documents: it builds a compile of 3
 * resources carrying 24 notes that cross page breaks and measures (a) in PDF,
 * whether each note's text is on the same page as its reference mark, by ordered
 * per-page extracted text, and (b) in DOCX, whether `word/footnotes.xml` is
 * present and every reference in `word/document.xml` resolves to a note. DOCX page
 * placement is left to Word and is not claimed.
 *
 * `CompilePDFDocument.tsx` and `CompileDocxDocument.ts` are not edited and not
 * called for the notes; only their libraries (`@react-pdf/renderer`, `docx`) are.
 */
// @vitest-environment node
import React from "react";
import JSZip from "jszip";
import {
  Document as DocxDocument,
  FootnoteReferenceRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  type DocumentProps,
  Document as PdfDocument,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import * as reactPdf from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { registerIBMPlexFonts } from "../../src/lib/export/CompilePDFDocument";
import { extractPdfPageTexts } from "../helpers/pdf-text";

const RESOURCES = 3;
const NOTES_PER_RESOURCE = 8;
const PARAGRAPHS_PER_NOTE = 1;
const FILLER =
  "The quick brown fox jumps over the lazy dog while the river keeps running past the old mill and the writers argue about commas. ";

interface Note {
  n: number;
  /** Body token placed at the reference point. */
  ref: string;
  /** Text of the note itself. */
  text: string;
}
interface Res {
  name: string;
  paragraphs: { text: string; note: Note }[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function buildCorpus(): { resources: Res[]; notes: Note[] } {
  const resources: Res[] = [];
  const notes: Note[] = [];
  let n = 0;
  for (let r = 0; r < RESOURCES; r += 1) {
    const paragraphs: Res["paragraphs"] = [];
    for (let i = 0; i < NOTES_PER_RESOURCE * PARAGRAPHS_PER_NOTE; i += 1) {
      n += 1;
      const note: Note = {
        n,
        ref: `[^${pad(n)}]`,
        text: `NOTE-${pad(n)} Author, Title ${pad(n)}, 19${pad(n)}.`,
      };
      notes.push(note);
      paragraphs.push({ text: FILLER.repeat(6), note });
    }
    resources.push({ name: `Chapter ${r + 1}`, paragraphs });
  }
  return { resources, notes };
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "IBM Plex Serif",
    fontSize: 11,
    lineHeight: 1.8,
    paddingTop: 72,
    paddingBottom: 72,
    paddingLeft: 72,
    paddingRight: 72,
  },
  footer: {
    position: "absolute",
    bottom: 12,
    left: 72,
    right: 72,
    fontSize: 6,
  },
  footerText: { lineHeight: 1 },
});

/**
 * PDF prototype. Body paragraphs carry the reference token inline. When
 * `placement` is given, a `fixed` footer renders, per page, the notes listed for
 * that page number.
 */
function pdfDoc(
  resources: Res[],
  placement: Map<number, Note[]> | null,
): React.ReactElement<DocumentProps> {
  const h = React.createElement;
  const body = resources.map((res) =>
    h(
      View,
      { key: res.name },
      h(Text, null, res.name),
      ...res.paragraphs.map((p) =>
        h(Text, { key: p.note.n }, `${p.text}${p.note.ref} `),
      ),
    ),
  );
  const footer = placement
    ? [
        h(View, {
          key: "footer",
          fixed: true,
          style: styles.footer,
          render: ({ pageNumber }: { pageNumber: number }) =>
            h(
              View,
              null,
              ...(placement.get(pageNumber) ?? []).map((note) =>
                h(Text, { key: note.n, style: styles.footerText }, note.text),
              ),
            ),
        }),
      ]
    : [];
  return h(
    PdfDocument,
    null,
    h(Page, { size: "A4", style: styles.page }, ...body, ...footer),
  ) as React.ReactElement<DocumentProps>;
}

function pagesWithToken(pages: string[], token: string): number[] {
  const out: number[] = [];
  pages.forEach((text, i) => {
    if (text.replace(/\s+/g, "").includes(token.replace(/\s+/g, ""))) {
      out.push(i + 1);
    }
  });
  return out;
}

async function renderPdf(
  resources: Res[],
  placement: Map<number, Note[]> | null,
): Promise<string[]> {
  registerIBMPlexFonts();
  const buf = await renderToBuffer(pdfDoc(resources, placement));
  return extractPdfPageTexts(buf);
}

async function measurePdf() {
  const { resources, notes } = buildCorpus();
  // Pass 1: no notes; find the page each reference mark lands on.
  const pass1 = await renderPdf(resources, null);
  const placement = new Map<number, Note[]>();
  for (const note of notes) {
    const pages = pagesWithToken(pass1, note.ref);
    const page = pages[0];
    if (page !== undefined) {
      placement.set(page, [...(placement.get(page) ?? []), note]);
    }
  }
  // Pass 2: the same body with a per-page footer fed from pass 1.
  const pass2 = await renderPdf(resources, placement);
  const rows = notes.map((note) => {
    const refPages = pagesWithToken(pass2, note.ref);
    const notePages = pagesWithToken(pass2, note.text);
    return {
      n: note.n,
      refPages,
      notePages,
      same:
        refPages.length === 1 &&
        notePages.length === 1 &&
        refPages[0] === notePages[0],
    };
  });
  return { notes, pass1, pass2, rows };
}

describe("FR-12 PDF note placement (prototype in @react-pdf/renderer)", () => {
  it("corpus is large enough: 3 resources, at least 20 notes, at least 3 page breaks", async () => {
    const { resources, notes } = buildCorpus();
    expect(resources.length).toBe(3);
    expect(notes.length).toBeGreaterThanOrEqual(20);
    const pages = await renderPdf(resources, null);
    console.log(`PDF corpus: notes=${notes.length} pages=${pages.length}`);
    expect(pages.length - 1).toBeGreaterThanOrEqual(3);
  });

  it("the library exports no footnote component", () => {
    const names = Object.keys(reactPdf).filter((k) => /foot/i.test(k));
    console.log(
      `@react-pdf/renderer exports matching /foot/i: ${JSON.stringify(names)}`,
    );
    expect(names).toEqual([]);
  });

  it("each note's text is on the same page as its reference mark", async () => {
    const { notes, pass1, pass2, rows } = await measurePdf();
    const bad = rows.filter((r) => !r.same);
    console.log(
      `PDF pass1 pages=${pass1.length} pass2 pages=${pass2.length} notes=${notes.length} same-page=${rows.length - bad.length} not-same-page=${bad.length}`,
    );
    for (const r of rows) {
      console.log(
        `note ${r.n}: refPages=${JSON.stringify(r.refPages)} notePages=${JSON.stringify(r.notePages)} same=${r.same}`,
      );
    }
    expect(bad).toEqual([]);
  });
});

describe("FR-12 DOCX note resolution (docx library footnotes)", () => {
  it("word/footnotes.xml is present and each reference resolves to a note", async () => {
    const { resources, notes } = buildCorpus();
    const footnotes: Record<number, { children: Paragraph[] }> = {};
    for (const note of notes) {
      footnotes[note.n] = {
        children: [new Paragraph({ children: [new TextRun(note.text)] })],
      };
    }
    const children: Paragraph[] = [];
    for (const res of resources) {
      children.push(new Paragraph({ children: [new TextRun(res.name)] }));
      for (const p of res.paragraphs) {
        children.push(
          new Paragraph({
            children: [new TextRun(p.text), new FootnoteReferenceRun(p.note.n)],
          }),
        );
      }
    }
    const doc = new DocxDocument({ footnotes, sections: [{ children }] });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
    const names = Object.keys(zip.files);
    const footnotesXml = await zip.file("word/footnotes.xml")?.async("string");
    const documentXml =
      (await zip.file("word/document.xml")?.async("string")) ?? "";
    expect(footnotesXml).toBeDefined();
    const refIds = [
      ...documentXml.matchAll(/<w:footnoteReference[^>]*w:id="(\d+)"/g),
    ].map((m) => Number(m[1]));
    const noteIds = new Set(
      [
        ...(footnotesXml ?? "").matchAll(/<w:footnote\b[^>]*w:id="(-?\d+)"/g),
      ].map((m) => Number(m[1])),
    );
    const unresolved = refIds.filter((id) => !noteIds.has(id));
    const unreferenced = notes.filter((n) => !refIds.includes(n.n)).length;
    const texts = notes.filter((n) => !(footnotesXml ?? "").includes(n.text));
    console.log(
      `DOCX entries has footnotes.xml=${names.includes("word/footnotes.xml")} refs=${refIds.length} noteIds=${noteIds.size} unresolved=${unresolved.length} notesNotReferenced=${unreferenced} noteTextsMissing=${texts.length}`,
    );
    expect(refIds.length).toBe(notes.length);
    expect(unresolved).toEqual([]);
    expect(texts).toEqual([]);
  });
});
