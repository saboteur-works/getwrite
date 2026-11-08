/**
 * Feature 103, Task 35 (FR-28): a document carrying a citation (an `annotation`
 * mark whose sidecar annotation has a `target`) or a locator-only citation
 * (target with attachmentId and locator, empty body) compiles and exports like
 * the same document without it, in txt, md, docx and pdf.
 *
 * The sidecar fixtures are written directly (no annotation core). Normalization:
 * TXT and Markdown are compared as exact strings. DOCX: the archive's entry
 * names and the exact `word/document.xml` text. PDF: compared as ordered per-page
 * extracted text, never raw bytes, because a PDF embeds a date and an id. Each
 * format has a non-vacuity check: a one-letter change must make it differ.
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
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import { generateUUID } from "../../src/lib/models/uuid";
import type { Annotation } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";
import { extractPdfPageTexts } from "../helpers/pdf-text";

const RESOURCE_ID = "00000000-0000-4000-8000-000000000035";
const SOURCE_ID = "00000000-0000-4000-8000-0000000000a1";
const ATTACHMENT_ID = "00000000-0000-4000-8000-0000000000a2";
const SOURCE_NAME = "Zebra Gazette 1887";
const LOCATOR_VALUE = "Locator-xyzzy-42";
const CITE_BODY = "Citation-note-plugh";
const NOW = "2026-11-07T00:00:00.000Z";

interface Outputs {
  compileText: string;
  compileMarkdown: string;
  exportText: string;
  exportMarkdown: string;
  pdfPages: string[];
  docxEntries: string[];
  docxDocumentXml: string;
}

function text(value: string, id?: string): JSONContent {
  return id
    ? {
        type: "text",
        text: value,
        marks: [{ type: "annotation", attrs: { id } }],
      }
    : { type: "text", text: value };
}

function docOf(...runs: JSONContent[][]): JSONContent {
  return {
    type: "doc",
    content: runs.map((content) => ({ type: "paragraph", content })),
  };
}

const CITE_ID = "00000000-0000-4000-8000-0000000000c1";
const LOCATOR_ID = "00000000-0000-4000-8000-0000000000c2";

const CITATION: Annotation = {
  id: CITE_ID,
  body: CITE_BODY,
  quote: "quick",
  target: {
    sourceId: SOURCE_ID,
    attachmentId: ATTACHMENT_ID,
    locator: { type: "page", value: LOCATOR_VALUE },
    sourceName: SOURCE_NAME,
  },
  createdAt: NOW,
  updatedAt: NOW,
};
const LOCATOR_ONLY: Annotation = {
  id: LOCATOR_ID,
  body: "",
  quote: "brown",
  target: {
    sourceId: SOURCE_ID,
    attachmentId: ATTACHMENT_ID,
    locator: { type: "page", value: LOCATOR_VALUE },
  },
  createdAt: NOW,
  updatedAt: NOW,
};

const PLAIN = docOf([text("The quick brown fox")], [text("Second paragraph.")]);
const CONTROL = docOf(
  [text("The quick brown fax")],
  [text("Second paragraph.")],
);
const CITED = docOf(
  [text("The "), text("quick", CITE_ID), text(" brown fox")],
  [text("Second paragraph.")],
);
const LOCATOR_CITED = docOf(
  [text("The quick "), text("brown", LOCATOR_ID), text(" fox")],
  [text("Second paragraph.")],
);

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

async function docxParts(
  arrayBuffer: ArrayBuffer,
): Promise<{ entries: string[]; documentXml: string }> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("word/document.xml missing from DOCX");
  return {
    entries: Object.keys(zip.files).sort(),
    documentXml: await entry.async("string"),
  };
}

async function runAll(
  doc: JSONContent,
  annotations: Annotation[],
): Promise<Outputs> {
  const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-cite-"));
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectDir = path.join(projectsDir, projectId);
  const dir = path.join(projectDir, "resources", RESOURCE_ID);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "content.tiptap.json"),
    JSON.stringify(doc),
  );
  await fs.writeFile(
    path.join(dir, "content.txt"),
    tiptapToPlainText(doc as Parameters<typeof tiptapToPlainText>[0]),
  );
  if (annotations.length > 0) {
    await fs.mkdir(path.join(projectDir, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, "meta", `resource-${RESOURCE_ID}.meta.json`),
      JSON.stringify({ annotations }),
    );
  }
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;

  const resources = [{ id: RESOURCE_ID, name: "Chapter", type: "text" }];
  const compileBody = {
    projectId,
    resourceIds: [RESOURCE_ID],
    resources,
    includeHeaders: true,
    projectName: "Citation Check",
  };
  const exportBody = {
    projectId,
    resourceIds: [RESOURCE_ID],
    resources,
    exportName: "Citation Check",
  };
  const docx = await docxParts(
    (await compileDocxCore(compileBody)).arrayBuffer,
  );
  return {
    compileText: (await compileTextCore(compileBody)).text,
    compileMarkdown: (await compileMarkdownCore(compileBody)).markdown,
    exportText: (await exportTextCore(exportBody)).text,
    exportMarkdown: (await exportMarkdownCore(exportBody)).markdown,
    pdfPages: await extractPdfPageTexts(
      (await compilePdfCore(compileBody)).arrayBuffer,
    ),
    docxEntries: docx.entries,
    docxDocumentXml: docx.documentXml,
  };
}

const FORMATS: { name: string; pick: (o: Outputs) => unknown }[] = [
  { name: "txt (compile)", pick: (o) => o.compileText },
  { name: "txt (export)", pick: (o) => o.exportText },
  { name: "md (compile)", pick: (o) => o.compileMarkdown },
  { name: "md (export)", pick: (o) => o.exportMarkdown },
  {
    name: "docx (entry names and word/document.xml)",
    pick: (o) => [o.docxEntries, o.docxDocumentXml],
  },
  { name: "pdf (per-page extracted text)", pick: (o) => o.pdfPages },
];

describe("a citation does not change compile or export output (FR-28)", () => {
  let plain: Outputs;
  let control: Outputs;
  let cited: Outputs;
  let locatorOnly: Outputs;

  beforeAll(async () => {
    plain = await runAll(PLAIN, []);
    control = await runAll(CONTROL, []);
    cited = await runAll(CITED, [CITATION]);
    locatorOnly = await runAll(LOCATOR_CITED, [LOCATOR_ONLY]);
  });

  it.each(FORMATS)("citation equals plain: $name", ({ pick }) => {
    expect(pick(cited)).toEqual(pick(plain));
  });

  it.each(FORMATS)("locator-only citation equals plain: $name", ({ pick }) => {
    expect(pick(locatorOnly)).toEqual(pick(plain));
  });

  it.each(FORMATS)(
    "non-vacuity, a one-letter change differs: $name",
    ({ pick }) => {
      expect(pick(control)).not.toEqual(pick(plain));
    },
  );

  it("no bibliography, footnote reference, source name, locator or note text in any output", () => {
    for (const out of [cited, locatorOnly]) {
      const everything = [
        out.compileText,
        out.compileMarkdown,
        out.exportText,
        out.exportMarkdown,
        out.pdfPages.join("\n"),
        out.docxDocumentXml,
      ].join("\n");
      for (const needle of [
        SOURCE_NAME,
        LOCATOR_VALUE,
        CITE_BODY,
        "Bibliography",
        "References",
        "[^",
        "footnoteReference",
        "endnoteReference",
      ]) {
        expect(everything).not.toContain(needle);
      }
    }
  });
});
