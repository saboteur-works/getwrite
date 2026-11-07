/**
 * Feature 101, Task 9 (FR-7, FR-8): a document carrying `annotation` marks must
 * compile and export exactly like the same document without them, in every
 * format. Documents are built as TipTap JSON; the editor mark need not exist.
 *
 * Comparisons: TXT and Markdown byte-identical (`compileTextCore`,
 * `compileMarkdownCore`, `exportTextCore`, `exportMarkdownCore`); PDF by ordered
 * per-page extracted text (never raw bytes: PDFs embed a date and id); DOCX by
 * the `<w:body>` of `word/document.xml`; `collectMarkdownWarnings` the same list.
 * A control document with one changed letter must differ in every comparison.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";

import {
  compileDocxCore,
  compileMarkdownCore,
  compilePdfCore,
  compileTextCore,
} from "../../src/lib/models/compile-core";
import {
  exportMarkdownCore,
  exportTextCore,
} from "../../src/lib/models/export-core";
import { collectMarkdownWarnings } from "../../src/lib/export/markdown-serializer";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MarkdownConstructWarning } from "../../src/lib/export/types";
import { removeDirRetry } from "./helpers/fs-utils";
import { extractPdfPageTexts } from "../helpers/pdf-text";

const RESOURCE_ID = "00000000-0000-4000-8000-000000000009";

/** Everything one document produces across the compile and export paths. */
interface Outputs {
  compileText: string;
  compileMarkdown: string;
  exportText: string;
  exportMarkdown: string;
  pdfPages: string[];
  docxBody: string;
  warnings: MarkdownConstructWarning[];
  compileMarkdownWarnings: MarkdownConstructWarning[];
  exportMarkdownWarnings: MarkdownConstructWarning[];
}

type Run = JSONContent;

function ann(id: string): { type: string; attrs: { id: string } } {
  return { type: "annotation", attrs: { id } };
}

function text(
  value: string,
  marks: { type: string; attrs?: Record<string, unknown> }[] = [],
): Run {
  return marks.length > 0
    ? { type: "text", text: value, marks }
    : { type: "text", text: value };
}

function docOf(...paragraphs: Run[][]): JSONContent {
  return {
    type: "doc",
    content: paragraphs.map((content) => ({ type: "paragraph", content })),
  };
}

const BOLD = { type: "bold" };

interface Case {
  label: string;
  annotated: JSONContent;
  /** The same text and non-annotation marks, with no annotation marks. */
  plain: JSONContent;
  /** The plain document with exactly one letter changed. */
  control: JSONContent;
}

const CASES: Case[] = [
  {
    label: "(a) plain annotation on a word",
    annotated: docOf([
      text("The "),
      text("quick", [ann("a1")]),
      text(" brown fox"),
    ]),
    plain: docOf([text("The quick brown fox")]),
    control: docOf([text("The quick brown fax")]),
  },
  {
    label: "(b) edge partway inside a bold run",
    annotated: docOf([
      text("Say "),
      text("bo", [BOLD]),
      text("ld te", [BOLD, ann("b1")]),
      text("xt", [BOLD]),
      text(" now"),
    ]),
    plain: docOf([text("Say "), text("bold text", [BOLD]), text(" now")]),
    control: docOf([text("Say "), text("bold tent", [BOLD]), text(" now")]),
  },
  {
    label: "(c) two overlapping annotations",
    annotated: docOf([
      text("one t", [ann("c1")]),
      text("wo", [ann("c1"), ann("c2")]),
      text(" thr", [ann("c2")]),
      text("ee four"),
    ]),
    plain: docOf([text("one two three four")]),
    control: docOf([text("one two three foul")]),
  },
  {
    label: "(d) leading and trailing whitespace, paragraph-edge end",
    annotated: docOf(
      [text("  pad", [ann("d1")]), text("ded word"), text("  ", [ann("d2")])],
      [text("first "), text("last words", [ann("d3")])],
    ),
    plain: docOf([text("  padded word  ")], [text("first last words")]),
    control: docOf([text("  padded word  ")], [text("first last wards")]),
  },
];

const tmpDirs: string[] = [];
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

afterAll(async () => {
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function docxBodyOf(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("word/document.xml missing from DOCX");
  const xml = await entry.async("string");
  const match = /<w:body>([\s\S]*)<\/w:body>/.exec(xml);
  if (!match) throw new Error("<w:body> missing from word/document.xml");
  return match[1];
}

/** Writes `doc` as a one-resource project and runs every path over it. */
async function runAll(
  doc: JSONContent,
  resourceType: "text" | "source" = "text",
): Promise<Outputs> {
  const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-annot-"));
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const dir = path.join(projectsDir, projectId, "resources", RESOURCE_ID);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "content.tiptap.json"),
    JSON.stringify(doc),
  );
  await fs.writeFile(
    path.join(dir, "content.txt"),
    tiptapToPlainText(doc as Parameters<typeof tiptapToPlainText>[0]),
  );
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;

  const resources = [{ id: RESOURCE_ID, name: "Chapter", type: resourceType }];
  const compileBody = {
    projectId,
    resourceIds: [RESOURCE_ID],
    resources,
    includeHeaders: true,
    projectName: "Annotation Check",
  };
  const exportBody = {
    projectId,
    resourceIds: [RESOURCE_ID],
    resources,
    exportName: "Annotation Check",
  };
  const md = await compileMarkdownCore(compileBody);
  const exportMd = await exportMarkdownCore(exportBody);
  return {
    compileText: (await compileTextCore(compileBody)).text,
    compileMarkdown: md.markdown,
    exportText: (await exportTextCore(exportBody)).text,
    exportMarkdown: exportMd.markdown,
    pdfPages: await extractPdfPageTexts(
      (await compilePdfCore(compileBody)).arrayBuffer,
    ),
    docxBody: await docxBodyOf(
      (await compileDocxCore(compileBody)).arrayBuffer,
    ),
    warnings: collectMarkdownWarnings(doc),
    compileMarkdownWarnings: md.warnings,
    exportMarkdownWarnings: exportMd.warnings,
  };
}

/** Each comparison returns true when the two outputs are equal. */
const COMPARISONS: {
  name: string;
  equal: (a: Outputs, b: Outputs) => boolean;
}[] = [
  { name: "compileTextCore", equal: (a, b) => a.compileText === b.compileText },
  {
    name: "compileMarkdownCore",
    equal: (a, b) => a.compileMarkdown === b.compileMarkdown,
  },
  { name: "exportTextCore", equal: (a, b) => a.exportText === b.exportText },
  {
    name: "exportMarkdownCore",
    equal: (a, b) => a.exportMarkdown === b.exportMarkdown,
  },
  {
    name: "PDF extracted text per page",
    equal: (a, b) => JSON.stringify(a.pdfPages) === JSON.stringify(b.pdfPages),
  },
  { name: "DOCX <w:body>", equal: (a, b) => a.docxBody === b.docxBody },
  {
    name: "collectMarkdownWarnings",
    equal: (a, b) => JSON.stringify(a.warnings) === JSON.stringify(b.warnings),
  },
];

describe("compile and export of a Source with annotation marks (Feature 102, FR-38)", () => {
  const { annotated, plain } = CASES[0];
  let annotatedOut: Outputs;
  let plainOut: Outputs;
  let textTwin: Outputs;

  beforeAll(async () => {
    annotatedOut = await runAll(annotated, "source");
    plainOut = await runAll(plain, "source");
    textTwin = await runAll(annotated, "text");
  });

  it.each(COMPARISONS)(
    "annotated Source equals the plain Source: $name",
    ({ equal }) => {
      expect(equal(annotatedOut, plainOut)).toBe(true);
    },
  );

  it("compiles the Source body, as it compiles the same text document", () => {
    expect(annotatedOut.compileText).toContain("The quick brown fox");
    expect(annotatedOut.exportText).toContain("The quick brown fox");
    expect(annotatedOut.compileText).toBe(textTwin.compileText);
    expect(annotatedOut.exportMarkdown).toBe(textTwin.exportMarkdown);
  });
});

describe("compile and export output with annotation marks (FR-8)", () => {
  describe.each(CASES)("$label", ({ annotated, plain, control }) => {
    let annotatedOut: Outputs;
    let plainOut: Outputs;
    let controlOut: Outputs;

    beforeAll(async () => {
      annotatedOut = await runAll(annotated);
      plainOut = await runAll(plain);
      controlOut = await runAll(control);
    });

    it.each(
      COMPARISONS.filter(({ name }) => name !== "collectMarkdownWarnings"),
    )("control (one changed letter) differs: $name", ({ equal }) => {
      expect(equal(plainOut, controlOut)).toBe(false);
    });

    it("control for collectMarkdownWarnings: a lossy construct (not a letter) differs", () => {
      // A changed letter cannot change a construct warning list (observed: both
      // are empty), so this control adds a text colour, which Markdown drops.
      const lossy = JSON.parse(JSON.stringify(plain)) as JSONContent;
      const first = lossy.content?.[0]?.content?.[0];
      if (!first) throw new Error("control document has no text run");
      first.marks = [
        ...(first.marks ?? []),
        { type: "textStyle", attrs: { color: "#ff0000" } },
      ];
      expect(collectMarkdownWarnings(lossy)).not.toEqual(
        collectMarkdownWarnings(plain),
      );
    });

    it.each(COMPARISONS)("annotated equals plain: $name", ({ equal }) => {
      expect(equal(annotatedOut, plainOut)).toBe(true);
    });

    it("the Markdown cores return the same warnings with and without marks", () => {
      expect(annotatedOut.compileMarkdownWarnings).toEqual(
        plainOut.compileMarkdownWarnings,
      );
      expect(annotatedOut.exportMarkdownWarnings).toEqual(
        plainOut.exportMarkdownWarnings,
      );
    });
  });
});
