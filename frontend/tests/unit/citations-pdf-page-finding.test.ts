/**
 * Feature 116, Task 57 (FR-12, FR-25): PDF page-finding without text
 * extraction in production code (experiment).
 *
 * A throwaway harness that calls `@react-pdf/renderer` 4.5.1 directly;
 * `CompilePDFDocument.tsx` is not edited. Part A tries the library facilities
 * that could report the page of a reference mark (a `render` prop on `Text`, a
 * `fixed` element's `render`, `Document` `onRender` and the layout data it is
 * handed). Part B builds the Task 36 corpus (3 resources, 24 notes), finds each
 * mark's page from the layout data handed to `onRender` in pass 1 (no PDF text
 * is read), draws each note in a fixed footer in pass 2, and checks the result
 * with the `pdfjs-dist` text extractor of `tests/helpers/pdf-text.ts`. Part C
 * runs the footer with and without `lineHeight: 1`, and checks page counts of
 * pass 1 against pass 2, including tall footers. Part D greps production code
 * for `pdfjs-dist`.
 *
 * Measured values are logged as `TASK57 <label> <json>` lines and pinned by
 * assertions; `experiments/task-57.md` quotes them.
 */
// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import React from "react";
import {
  Document as PdfDocument,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { registerIBMPlexFonts } from "../../src/lib/export/CompilePDFDocument";
import { extractPdfPageTexts } from "../helpers/pdf-text";

const h = React.createElement;

const FILLER =
  "The quick brown fox jumps over the lazy dog while the river keeps running past the old mill and the writers argue about commas. ";
const MARK_FONT_SIZE = 7;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function report(label: string, value: unknown): void {
  console.info(`TASK57 ${label} ${JSON.stringify(value)}`);
}

/** The part of a react-pdf layout node this harness reads. */
interface LayoutNode {
  type: string;
  box?: { top: number; height: number };
  lines?: {
    string: string;
    runs: { start: number; end: number; attributes: { fontSize?: number } }[];
  }[];
  children?: LayoutNode[];
}

interface RenderOutcome {
  buffer: Buffer;
  layout: LayoutNode;
  onRenderKeys: string[];
}

/** Renders with `Document onRender` capturing the layout data it is handed. */
async function renderWithLayout(
  build: (onRender: (p: Record<string, unknown>) => void) => React.ReactElement,
): Promise<RenderOutcome> {
  let layout: LayoutNode | undefined;
  let keys: string[] = [];
  const element = build((p) => {
    keys = Object.keys(p);
    layout = p._INTERNAL__LAYOUT__DATA_ as LayoutNode;
  });
  const buffer = await renderToBuffer(element as never);
  if (layout === undefined) throw new Error("onRender gave no layout data");
  return { buffer, layout, onRenderKeys: keys };
}

function* walk(node: LayoutNode): Generator<LayoutNode> {
  yield node;
  for (const c of node.children ?? []) yield* walk(c);
}

/** Page numbers (1-based) of each mark run, in layout order. */
function markPages(layout: LayoutNode): { text: string; page: number }[] {
  const out: { text: string; page: number }[] = [];
  (layout.children ?? []).forEach((page, i) => {
    for (const node of walk(page)) {
      for (const line of node.lines ?? []) {
        for (const run of line.runs) {
          const text = line.string.slice(run.start, run.end);
          if (run.attributes.fontSize === MARK_FONT_SIZE && /^\d+$/.test(text))
            out.push({ text, page: i + 1 });
        }
      }
    }
  });
  return out;
}

function squash(s: string): string {
  return s.replace(/\s+/g, "");
}

interface Corpus {
  resources: { name: string; paragraphs: { text: string; n: number }[] }[];
  noteCount: number;
}

function buildCorpus(): Corpus {
  const resources: Corpus["resources"] = [];
  let n = 0;
  for (let r = 0; r < 3; r += 1) {
    const paragraphs: { text: string; n: number }[] = [];
    for (let p = 0; p < 8; p += 1) {
      n += 1;
      paragraphs.push({
        text: `${FILLER.repeat(6)}Claim ${pad(n)} ends here.`,
        n,
      });
    }
    resources.push({ name: `Chapter ${r + 1}`, paragraphs });
  }
  return { resources, noteCount: n };
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
  mark: { fontSize: MARK_FONT_SIZE, verticalAlign: "super" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 72,
    right: 72,
    fontFamily: "IBM Plex Serif",
    fontSize: 8,
  },
  footerNoteLh1: { lineHeight: 1, marginTop: 1 },
  footerNotePlain: { marginTop: 1 },
});

function noteText(n: number, tall: boolean): string {
  const base = `NOTE-${pad(n)} Author, Title ${pad(n)}, 19${pad(n)}.`;
  return tall
    ? `${base} ${"Long note sentence for height. ".repeat(14)}`
    : base;
}

interface DocOptions {
  corpus: Corpus;
  /** Page (1-based) to note numbers drawn in the footer; null = pass 1. */
  placement: Map<number, number[]> | null;
  footerLineHeight1: boolean;
  tall: boolean;
  onRender: (p: Record<string, unknown>) => void;
}

function pdfDoc(o: DocOptions): React.ReactElement {
  const body = o.corpus.resources.map((res) =>
    h(
      View,
      { key: res.name, style: { marginBottom: 36 } },
      h(Text, null, res.name),
      ...res.paragraphs.map((p) =>
        h(
          Text,
          { key: p.n },
          p.text,
          h(Text, { style: styles.mark }, String(p.n)),
          " ",
        ),
      ),
    ),
  );
  const noteStyle = o.footerLineHeight1
    ? styles.footerNoteLh1
    : styles.footerNotePlain;
  const footer =
    o.placement === null
      ? []
      : [
          h(View, {
            key: "footer",
            fixed: true,
            style: styles.footer,
            render: ({ pageNumber }: { pageNumber: number }) =>
              h(
                View,
                null,
                ...(o.placement?.get(pageNumber) ?? []).map((n) =>
                  h(
                    Text,
                    { key: n, style: noteStyle },
                    h(Text, { style: styles.mark }, String(n)),
                    ` ${noteText(n, o.tall)}`,
                  ),
                ),
              ),
          }),
        ];
  return h(
    PdfDocument,
    { onRender: o.onRender } as never,
    h(Page, { size: "A4", style: styles.page }, ...body, ...footer),
  );
}

function placementFromMarks(
  marks: { text: string; page: number }[],
): Map<number, number[]> {
  const placement = new Map<number, number[]>();
  for (const m of marks) {
    placement.set(m.page, [...(placement.get(m.page) ?? []), Number(m.text)]);
  }
  return placement;
}

/** Independent check: page of the paragraph end plus its glued mark, by pdfjs text. */
function referencePagesByText(pages: string[], n: number): number[] {
  const needle = squash(`Claim ${pad(n)} ends here.${n}`);
  const out: number[] = [];
  pages.forEach((t, i) => {
    if (squash(t).includes(needle)) out.push(i + 1);
  });
  return out;
}

function notePagesByText(pages: string[], n: number): number[] {
  const out: number[] = [];
  pages.forEach((t, i) => {
    if (t.includes(`NOTE-${pad(n)}`)) out.push(i + 1);
  });
  return out;
}

/** Per page: top of the fixed footer's box and bottom of the lowest body box. */
function footerClearance(
  layout: LayoutNode,
): { page: number; footerTop: number; bodyBottom: number }[] {
  const out: { page: number; footerTop: number; bodyBottom: number }[] = [];
  (layout.children ?? []).forEach((page, i) => {
    const kids = page.children ?? [];
    const footer = kids[kids.length - 1];
    const top = (n: LayoutNode): number => n.box?.top ?? 0;
    const bottom = (n: LayoutNode): number => top(n) + (n.box?.height ?? 0);
    const body = kids.slice(0, -1);
    if (footer === undefined || body.length === 0) return;
    out.push({
      page: i + 1,
      footerTop: Math.round(top(footer)),
      bodyBottom: Math.round(Math.max(...body.map(bottom))),
    });
  });
  return out;
}

interface Measured {
  pass1Pages: number;
  pass2Pages: number;
  pdfjsPass2Pages: number;
  notes: number;
  marksFound: number;
  sameLayoutAndText: number;
  noteNotFound: number;
  sameNotePage: number;
  notSameNotePage: number;
  clearance: { page: number; footerTop: number; bodyBottom: number }[];
}

async function runTwoPass(
  footerLineHeight1: boolean,
  tall: boolean,
): Promise<Measured> {
  registerIBMPlexFonts();
  const corpus = buildCorpus();
  const pass1 = await renderWithLayout((onRender) =>
    pdfDoc({ corpus, placement: null, footerLineHeight1, tall, onRender }),
  );
  const marks = markPages(pass1.layout);
  const placement = placementFromMarks(marks);
  const pass2 = await renderWithLayout((onRender) =>
    pdfDoc({ corpus, placement, footerLineHeight1, tall, onRender }),
  );
  const texts = await extractPdfPageTexts(pass2.buffer);
  const markPage = new Map(marks.map((m) => [Number(m.text), m.page]));
  let same = 0;
  let notFound = 0;
  let sameLayoutAndText = 0;
  for (let n = 1; n <= corpus.noteCount; n += 1) {
    const ref = referencePagesByText(texts, n);
    const note = notePagesByText(texts, n);
    if (ref.length === 1 && ref[0] === markPage.get(n)) sameLayoutAndText += 1;
    if (note.length === 0 || ref.length === 0) {
      notFound += 1;
      continue;
    }
    if (note.length === 1 && ref.length === 1 && note[0] === ref[0]) same += 1;
  }
  return {
    pass1Pages: pass1.layout.children?.length ?? 0,
    pass2Pages: pass2.layout.children?.length ?? 0,
    pdfjsPass2Pages: texts.length,
    notes: corpus.noteCount,
    marksFound: marks.length,
    sameLayoutAndText,
    noteNotFound: notFound,
    sameNotePage: same,
    notSameNotePage: corpus.noteCount - same - notFound,
    clearance: footerClearance(pass2.layout),
  };
}

describe("Task 57 part A: facilities tried to learn a reference's page", () => {
  it("A1 Text render prop, A2 nested Text render, A3 fixed render, A4 onRender", async () => {
    registerIBMPlexFonts();
    const textCalls: { pageNumber: number; totalPages: number }[] = [];
    const nestedCalls: number[] = [];
    const fixedPages: number[] = [];
    const paragraphs = Array.from({ length: 60 }, (_, i) => i);
    const outcome = await renderWithLayout((onRender) =>
      h(
        PdfDocument,
        { onRender } as never,
        h(
          Page,
          { size: "A4", style: styles.page },
          ...paragraphs.map((i) =>
            i === 0
              ? h(Text, {
                  key: i,
                  render: ({
                    pageNumber,
                    totalPages,
                  }: {
                    pageNumber: number;
                    totalPages: number;
                  }) => {
                    textCalls.push({ pageNumber, totalPages });
                    return `P0 ${FILLER}`;
                  },
                })
              : i === 59
                ? h(
                    Text,
                    { key: i },
                    FILLER.repeat(4),
                    h(Text, {
                      render: ({ pageNumber }: { pageNumber: number }) => {
                        nestedCalls.push(pageNumber);
                        return "NESTED";
                      },
                    }),
                  )
                : h(Text, { key: i }, FILLER.repeat(4)),
          ),
          h(View, {
            fixed: true,
            render: ({ pageNumber }: { pageNumber: number }) => {
              fixedPages.push(pageNumber);
              return h(Text, null, `F${pageNumber}`);
            },
          }),
        ),
      ),
    );
    const texts = await extractPdfPageTexts(outcome.buffer);
    const lastPage = texts.length;
    const value = {
      pages: lastPage,
      textRenderCalls: textCalls,
      nestedRenderCalls: nestedCalls,
      nestedTextPresentOnPage: texts
        .map((t, i) => (t.includes("NESTED") ? i + 1 : 0))
        .filter((x) => x > 0),
      fixedRenderPages: fixedPages,
      onRenderKeys: outcome.onRenderKeys,
    };
    report("A", value);
    expect(value.pages).toBeGreaterThan(3);
    expect(value.onRenderKeys).toContain("_INTERNAL__LAYOUT__DATA_");
    // A fixed element is rendered once per page and learns only its page number.
    expect(new Set(fixedPages)).toEqual(
      new Set(Array.from({ length: lastPage }, (_, i) => i + 1)),
    );
  });
});

describe("Task 57 part B: corpus, layout-data page finding, pdfjs check", () => {
  it("B1 24 notes, 3 resources, at least 3 page breaks; footer with lineHeight 1", async () => {
    const m = await runTwoPass(true, false);
    report("B1", m);
    expect(m.notes).toBe(24);
    expect(m.pass1Pages - 1).toBeGreaterThanOrEqual(3);
    expect(m.marksFound).toBe(24);
    expect(m.sameNotePage).toBe(24);
    expect(m.notSameNotePage).toBe(0);
    expect(m.noteNotFound).toBe(0);
    expect(m.sameLayoutAndText).toBe(24);
    expect(m.pass2Pages).toBe(m.pass1Pages);
  });
});

describe("Task 57 part C: lineHeight 1 and page-count stability", () => {
  it("C1 footer without lineHeight 1 (measured, no cause stated)", async () => {
    const m = await runTwoPass(false, false);
    report("C1", m);
    expect(m.notes).toBe(24);
    expect(m.sameNotePage + m.notSameNotePage + m.noteNotFound).toBe(24);
    // Measured: no note text was extracted on any page without lineHeight 1.
    expect(m.noteNotFound).toBe(24);
    expect(m.pass2Pages).toBe(m.pass1Pages);
  });

  it("C2 tall footers: page counts of pass 1 and pass 2", async () => {
    const withLh = await runTwoPass(true, true);
    const without = await runTwoPass(false, true);
    report("C2 lineHeight1", withLh);
    report("C2 no lineHeight", without);
    expect(withLh.pass1Pages).toBeGreaterThan(0);
    expect(withLh.pass2Pages).toBe(withLh.pdfjsPass2Pages);
    expect(withLh.pass2Pages).toBe(withLh.pass1Pages);
    expect(without.pass2Pages).toBe(without.pass1Pages);
    expect(withLh.sameNotePage).toBe(24);
    expect(without.noteNotFound).toBe(24);
    // Measured: with tall footers the footer box top is above the body box bottom.
    expect(withLh.clearance[0]?.footerTop).toBeLessThan(
      withLh.clearance[0]?.bodyBottom ?? 0,
    );
  });
});

describe("Task 57 part D: production code does not import pdfjs-dist", () => {
  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        out.push(...sourceFiles(full));
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  it("D1 0 imports of pdfjs-dist under frontend/src and frontend/app", () => {
    const root = path.resolve(__dirname, "../..");
    const hits = [
      ...sourceFiles(path.join(root, "src")),
      ...sourceFiles(path.join(root, "app")),
    ]
      .filter((f) => fs.readFileSync(f, "utf8").includes("pdfjs-dist"))
      .map((f) => path.relative(root, f));
    report("D1", { imports: hits.length, files: hits });
    expect(hits).toEqual([]);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["pdfjs-dist"]).toBeUndefined();
    expect(pkg.devDependencies?.["pdfjs-dist"]).toBeDefined();
  });
});
