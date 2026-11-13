/**
 * Feature 102, Task 18 (FR-16): folder notes appear in no compile or export
 * output. A project with notes on every folder must compile and export exactly
 * like the same project with none, in every format. Method and control follow
 * Feature 101 FR-8: TXT and Markdown byte-identical, PDF by ordered per-page
 * extracted text (never raw bytes), DOCX by the `<w:body>` of
 * `word/document.xml`; a control project with one changed character must differ.
 *
 * Feature 110, Task 21 (FR-20): the same method pins that a Narrative folder
 * and Variant Sources (subtype labels, a motif tag, a tale-type tag) change no
 * compile or export output against the same project without the subtypes.
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
import { updateFolderMetadataCore } from "../../src/lib/models/folder-metadata-core";
import { writeSidecar } from "../../src/lib/models/sidecar";
import {
  NARRATIVE_SUBTYPE,
  VARIANT_SUBTYPE,
} from "../../src/lib/models/folklore-types";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";
import { extractPdfPageTexts } from "../helpers/pdf-text";

const NOTE_MARKER = "FOLDERNOTEMARKER";
const TAG_MARKER = "FOLKLORETAGMARKER";
const FOLDER_IDS = [
  "00000000-0000-4000-8000-0000000000f1",
  "00000000-0000-4000-8000-0000000000f2",
];
const RESOURCE_IDS = [
  "00000000-0000-4000-8000-000000000a01",
  "00000000-0000-4000-8000-000000000a02",
];

interface Outputs {
  compileText: string;
  compileMarkdown: string;
  exportText: string;
  exportMarkdown: string;
  pdfPages: string[];
  docxBody: string;
}

function docOf(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

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

/**
 * Builds a two-folder project (one text resource in each) and, when
 * `withNotes`, writes notes on every folder through the folder metadata core.
 */
async function runAll(opts: {
  withNotes: boolean;
  secondText: string;
  /** Feature 110: Source resources, optionally under Narrative/Variant subtypes. */
  folklore?: "sources-plain" | "sources-narrative";
}): Promise<Outputs> {
  const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-fnotes-"));
  tmpDirs.push(projectsDir);
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  const projectId = generateUUID();
  const texts = ["First scene in the first folder.", opts.secondText];
  await fs.mkdir(path.join(projectsDir, projectId), { recursive: true });
  await fs.writeFile(
    path.join(projectsDir, projectId, "project.json"),
    JSON.stringify({
      id: projectId,
      name: "p",
      ...(opts.folklore === "sources-narrative"
        ? {
            config: {
              subtypes: [NARRATIVE_SUBTYPE, VARIANT_SUBTYPE],
              modules: { folklore: true },
            },
          }
        : {}),
    }),
  );
  for (const [i, resourceId] of RESOURCE_IDS.entries()) {
    const folderDir = path.join(projectsDir, projectId, "folders", `f${i + 1}`);
    await fs.mkdir(folderDir, { recursive: true });
    await fs.writeFile(
      path.join(folderDir, "folder.json"),
      JSON.stringify({
        id: FOLDER_IDS[i],
        slug: `f${i + 1}`,
        name: `Folder ${i + 1}`,
        type: "folder",
        orderIndex: i,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const dir = path.join(projectsDir, projectId, "resources", resourceId);
    await fs.mkdir(dir, { recursive: true });
    const doc = docOf(texts[i]);
    await fs.writeFile(
      path.join(dir, "content.tiptap.json"),
      JSON.stringify(doc),
    );
    await fs.writeFile(
      path.join(dir, "content.txt"),
      tiptapToPlainText(doc as Parameters<typeof tiptapToPlainText>[0]),
    );
  }
  if (opts.folklore !== undefined) {
    for (const [i, resourceId] of RESOURCE_IDS.entries()) {
      await writeSidecar(
        path.join(projectsDir, projectId),
        resourceId,
        opts.folklore === "sources-narrative"
          ? {
              id: resourceId,
              name: `Chapter ${i + 1}`,
              type: "source",
              folderId: FOLDER_IDS[i],
              resourceSubtype: VARIANT_SUBTYPE,
              userMetadata: { motifs: [`${TAG_MARKER} ${i + 1}`] },
            }
          : {
              id: resourceId,
              name: `Chapter ${i + 1}`,
              type: "source",
              folderId: FOLDER_IDS[i],
              userMetadata: {},
            },
      );
    }
    if (opts.folklore === "sources-narrative") {
      await updateFolderMetadataCore(projectId, FOLDER_IDS[0], {
        resourceSubtype: NARRATIVE_SUBTYPE,
      });
    }
  }
  if (opts.withNotes) {
    for (const [i, folderId] of FOLDER_IDS.entries()) {
      await updateFolderMetadataCore(projectId, folderId, {
        notes: `${NOTE_MARKER} ${i + 1}`,
      });
    }
    const metaFiles = await fs.readdir(
      path.join(projectsDir, projectId, "meta"),
    );
    expect(metaFiles.filter((f) => f.startsWith("folder-"))).toHaveLength(
      FOLDER_IDS.length,
    );
  }

  const resources = RESOURCE_IDS.map((id, i) => ({
    id,
    name: `Chapter ${i + 1}`,
    type: (opts.folklore === undefined ? "text" : "source") as
      | "text"
      | "source",
    folderId: FOLDER_IDS[i],
  }));
  const compileBody = {
    projectId,
    resourceIds: RESOURCE_IDS,
    resources,
    includeHeaders: true,
    projectName: "Folder Notes Check",
  };
  const exportBody = {
    projectId,
    resourceIds: RESOURCE_IDS,
    resources,
    exportName: "Folder Notes Check",
  };
  return {
    compileText: (await compileTextCore(compileBody)).text,
    compileMarkdown: (await compileMarkdownCore(compileBody)).markdown,
    exportText: (await exportTextCore(exportBody)).text,
    exportMarkdown: (await exportMarkdownCore(exportBody)).markdown,
    pdfPages: await extractPdfPageTexts(
      (await compilePdfCore(compileBody)).arrayBuffer,
    ),
    docxBody: await docxBodyOf(
      (await compileDocxCore(compileBody)).arrayBuffer,
    ),
  };
}

const FORMATS: { name: string; pick: (o: Outputs) => string }[] = [
  { name: "compileTextCore", pick: (o) => o.compileText },
  { name: "compileMarkdownCore", pick: (o) => o.compileMarkdown },
  { name: "exportTextCore", pick: (o) => o.exportText },
  { name: "exportMarkdownCore", pick: (o) => o.exportMarkdown },
  {
    name: "PDF extracted text per page",
    pick: (o) => JSON.stringify(o.pdfPages),
  },
  { name: "DOCX <w:body>", pick: (o) => o.docxBody },
];

describe("folder notes are excluded from compile and export (FR-16)", () => {
  let withNotes: Outputs;
  let withoutNotes: Outputs;
  let control: Outputs;

  beforeAll(async () => {
    withNotes = await runAll({
      withNotes: true,
      secondText: "Second scene in the second folder.",
    });
    withoutNotes = await runAll({
      withNotes: false,
      secondText: "Second scene in the second folder.",
    });
    control = await runAll({
      withNotes: false,
      secondText: "Second scene in the second folder,",
    });
  }, 60_000);

  it.each(FORMATS)(
    "control (one changed character) differs: $name",
    ({ pick }) => {
      expect(pick(withoutNotes)).not.toBe(pick(control));
    },
  );

  it.each(FORMATS)("with notes equals without notes: $name", ({ pick }) => {
    expect(pick(withNotes)).toBe(pick(withoutNotes));
  });

  it.each(FORMATS)("the note text appears in no output: $name", ({ pick }) => {
    expect(pick(withNotes)).not.toContain(NOTE_MARKER);
  });
});

describe("a narrative and its variants change no compile or export output (Feature 110 FR-20)", () => {
  let plainSources: Outputs;
  let narrativeSources: Outputs;
  let control: Outputs;

  beforeAll(async () => {
    const secondText = "Second scene in the second folder.";
    plainSources = await runAll({
      withNotes: false,
      secondText,
      folklore: "sources-plain",
    });
    narrativeSources = await runAll({
      withNotes: false,
      secondText,
      folklore: "sources-narrative",
    });
    control = await runAll({
      withNotes: false,
      secondText: "Second scene in the second folder,",
      folklore: "sources-plain",
    });
  }, 60_000);

  it.each(FORMATS)(
    "control (one changed character) differs: $name",
    ({ pick }) => {
      expect(pick(plainSources)).not.toBe(pick(control));
    },
  );

  it.each(FORMATS)(
    "Sources under Narrative and Variant equal the same Sources without them: $name",
    ({ pick }) => {
      expect(pick(narrativeSources)).toBe(pick(plainSources));
    },
  );

  it.each(FORMATS)("no tag text appears in any output: $name", ({ pick }) => {
    expect(pick(narrativeSources)).not.toContain(TAG_MARKER);
  });
});
