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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";

import {
  compileDocxCore,
  compileMarkdownCore,
  compilePdfCore,
  compileTextCore,
  registerCitationsPass,
  type CompileCitationsPass,
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

/** Extra project state and request fields for one Feature 116 state. */
interface RunExtras {
  /** Writes extra files into the project directory (a Source, project.json). */
  setup?: (projectDir: string) => Promise<void>;
  /** Fields merged into the compile request body (never `citations` with a value). */
  bodyExtras?: Record<string, unknown>;
}

async function runAll(
  doc: JSONContent,
  annotations: Annotation[],
  extras: RunExtras = {},
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
  if (extras.setup) await extras.setup(projectDir);
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;

  const resources = [{ id: RESOURCE_ID, name: "Chapter", type: "text" }];
  const compileBody = {
    projectId,
    resourceIds: [RESOURCE_ID],
    resources,
    includeHeaders: true,
    projectName: "Citation Check",
    ...extras.bodyExtras,
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

/**
 * Feature 116 Task 25 (FR-10): with the switch off, the module off, or the
 * option absent, a document citing a Source with filled citation fields
 * compiles exactly as the same document without the citation. PDF is compared
 * as ordered per-page extracted text, not raw bytes: a fixed creation date
 * does not make two renders byte-identical (the random font-subset tag differs;
 * `experiments/task-12.md` (f)).
 */
const SOURCE_RESOURCE_ID = SOURCE_ID;
const CITATION_FIELDS = {
  referenceType: "book",
  authors: [{ family: "Quimby", given: "Zora" }],
  title: "The Zebra Atlas",
  publisher: "Plugh Press",
  place: "Xyzzyville",
  date: "1887",
};

async function writeSourceAndConfig(
  projectDir: string,
  modules: Record<string, boolean> | undefined,
): Promise<void> {
  const sourceDir = path.join(projectDir, "resources", SOURCE_RESOURCE_ID);
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "content.txt"), "Source body");
  await fs.mkdir(path.join(projectDir, "meta"), { recursive: true });
  const sidecarPath = path.join(
    projectDir,
    "meta",
    `resource-${SOURCE_RESOURCE_ID}.meta.json`,
  );
  await fs.writeFile(
    sidecarPath,
    JSON.stringify({ citationFields: CITATION_FIELDS }),
  );
  if (modules !== undefined) {
    await fs.writeFile(
      path.join(projectDir, "project.json"),
      JSON.stringify({ config: { modules } }),
    );
  }
}

/** The three states of FR-10. None of them carries a citations option. */
const STATES: { name: string; extras: RunExtras }[] = [
  {
    name: "switch off (module on, no option sent)",
    extras: {
      setup: (dir) => writeSourceAndConfig(dir, { citations: true }),
      bodyExtras: { citations: undefined },
    },
  },
  {
    name: "module off (config.modules.citations false)",
    extras: { setup: (dir) => writeSourceAndConfig(dir, { citations: false }) },
  },
  {
    name: "option absent (no module entry)",
    extras: { setup: (dir) => writeSourceAndConfig(dir, undefined) },
  },
];

describe("a citation to a Source with filled fields compiles as today (FR-10)", () => {
  const spy = vi.fn<CompileCitationsPass>(async () => ({
    arrayBuffer: new Uint8Array([1]).buffer,
  }));

  describe.each(STATES)("$name", ({ extras }) => {
    let plain: Outputs;
    let control: Outputs;
    let cited: Outputs;
    let seamCalls = -1;

    beforeAll(async () => {
      spy.mockClear();
      registerCitationsPass(spy);
      try {
        plain = await runAll(PLAIN, [], extras);
        control = await runAll(CONTROL, [], extras);
        cited = await runAll(CITED, [CITATION], extras);
        seamCalls = spy.mock.calls.length;
      } finally {
        registerCitationsPass(undefined);
      }
    });

    it.each(FORMATS)("citation equals plain: $name", ({ pick }) => {
      expect(pick(cited)).toEqual(pick(plain));
    });

    it.each(FORMATS)(
      "non-vacuity, a one-letter change differs: $name",
      ({ pick }) => {
        expect(pick(control)).not.toEqual(pick(plain));
      },
    );

    it("the Task 24 seam is not entered", () => {
      expect(seamCalls).toBe(0);
    });
  });

  it("equals the output with no Source and no config at all", async () => {
    const bare = await runAll(PLAIN, []);
    const state = await runAll(CITED, [CITATION], STATES[0].extras);
    for (const { pick } of FORMATS) {
      expect(pick(state)).toEqual(pick(bare));
    }
  });
});
