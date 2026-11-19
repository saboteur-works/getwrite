/**
 * Feature 121, Task 29 (FR-18): a document marked as merged is still exported
 * and still found by search, and a marked document taken to Trash leaves
 * search and the indexes as any trashed document does and returns on restore.
 * One test per surface; none stands for another. Real files, real indexer,
 * real cores; nothing is mocked.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { addAnnotationCore } from "../../src/lib/models/annotations-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import {
  writeRevision,
  setCanonicalRevision,
} from "../../src/lib/models/revision";
import {
  indexResource,
  search,
  searchAnnotationBodies,
} from "../../src/lib/models/inverted-index";
import {
  persistResourceContent,
  plainTextToTiptap,
} from "../../src/lib/tiptap-utils";
import { executeSearch } from "../../src/lib/search/execute-search";
import {
  exportTextCore,
  exportMarkdownCore,
} from "../../src/lib/models/export-core";
import { loadTextSections } from "../../src/lib/export/section-loader";
import { resolveInitialSelection } from "../../components/common/compile-defaults-selection";
import {
  softDeleteResource,
  restoreResource,
} from "../../src/lib/models/trash";
import { MERGED_MARK_SIDECAR_KEY } from "../../src/lib/models/merge-types";
import { isMergedDocument } from "../../src/lib/models/split-eligibility";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import type { ResourceMeta } from "../../src/lib/export/types";
import { removeDirRetry } from "./helpers/fs-utils";

const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

const PROSE_WORD = "marmalade";
const NOTE_WORD = "zeppelin";

let batchRoot = "";
let projectId = "";
let projectRoot = "";
let targetId = "";
let markedId = "";
let plainId = "";

async function makeDocument(
  id: string,
  name: string,
  content: string,
  order: number,
  extra: Record<string, MetadataValue>,
): Promise<void> {
  await writeSidecar(projectRoot, id, {
    id,
    slug: name.toLowerCase(),
    type: "text",
    name,
    orderIndex: order,
    folderId: null,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    wordCount: content.split(/\s+/).length,
    ...extra,
  } as Record<string, MetadataValue>);
  const revision = await writeRevision(projectRoot, id, 1, content, {
    isCanonical: true,
  });
  await setCanonicalRevision(projectRoot, id, revision.versionNumber);
  await persistResourceContent(projectRoot, id, plainTextToTiptap(content));
  await indexResource(projectRoot, {
    id,
    name,
    type: "text",
    slug: name.toLowerCase(),
    orderIndex: order,
    createdAt: "1970-01-01T00:00:00.000Z",
    plainText: content,
  });
}

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-merge-rule-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify({ ...createProject({ name: "merge-rule" }), id: projectId }),
    "utf8",
  );
  targetId = generateUUID();
  markedId = generateUUID();
  plainId = generateUUID();
  await makeDocument(targetId, "Target", "Opening text of the target.", 0, {});
  await makeDocument(
    markedId,
    "Absorbed",
    `The ${PROSE_WORD} jar stood on the shelf.`,
    1,
    {
      [MERGED_MARK_SIDECAR_KEY]: {
        targetDocumentId: targetId,
        targetSnapshotRevisionId: "rev-opaque",
        date: "2026-11-15T00:00:00.000Z",
      } as unknown as MetadataValue,
    },
  );
  await makeDocument(plainId, "Plain", "A plain document with no mark.", 2, {});
  await addAnnotationCore(projectId, markedId, {
    id: generateUUID(),
    body: `The ${NOTE_WORD} hangar note`,
    quote: PROSE_WORD,
  });
  await flushIndexer();
});

afterEach(async () => {
  await flushIndexer();
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  await removeDirRetry(batchRoot);
});

function metas(): ResourceMeta[] {
  return [
    { id: targetId, name: "Target", type: "text" },
    { id: markedId, name: "Absorbed", type: "text" },
    { id: plainId, name: "Plain", type: "text" },
  ];
}

describe("fixture", () => {
  it("the absorbed document carries the mark and the others do not", async () => {
    expect(isMergedDocument((await readSidecar(projectRoot, markedId))!)).toBe(
      true,
    );
    expect(isMergedDocument((await readSidecar(projectRoot, plainId))!)).toBe(
      false,
    );
  });
});

describe("Export keeps a marked document (FR-18)", () => {
  it("the Export dialog's initial selection includes the marked id", () => {
    const ids = [targetId, markedId, plainId];
    const initial = resolveInitialSelection(ids, undefined);
    expect(initial.selectedIds.has(markedId)).toBe(true);
    expect(initial.leftOutIds).toEqual([]);
  });

  it("the server section loader returns a section for the marked document", async () => {
    const sections = await loadTextSections(
      projectRoot,
      [targetId, markedId, plainId],
      metas(),
      (meta) => meta.id,
    );
    expect(sections).toEqual([targetId, markedId, plainId]);
  });

  it("plain-text export contains the marked document's name and text", async () => {
    const result = await exportTextCore({
      projectId,
      resourceIds: [targetId, markedId, plainId],
      resources: metas(),
      exportName: "All",
    });
    expect(result.text).toContain("Absorbed");
    expect(result.text).toContain(`The ${PROSE_WORD} jar stood on the shelf.`);
  });

  it("markdown export contains the marked document's text", async () => {
    const result = await exportMarkdownCore({
      projectId,
      resourceIds: [targetId, markedId, plainId],
      resources: metas(),
      exportName: "All",
    });
    expect(result.markdown).toContain(PROSE_WORD);
  });
});

describe("Search keeps a marked document (FR-18)", () => {
  it("the inverted index returns the marked document", async () => {
    expect(await search(projectRoot, PROSE_WORD)).toEqual([markedId]);
  });

  it("the annotation-body index returns the marked document", async () => {
    expect(await searchAnnotationBodies(projectRoot, NOTE_WORD)).toEqual([
      markedId,
    ]);
  });

  it("a prose search hit is the marked document with snippetKind prose", async () => {
    const results = await executeSearch(projectRoot, PROSE_WORD, {}, 10);
    expect(results.map((r) => r.resourceId)).toEqual([markedId]);
    expect(results[0]!.snippetKind).toBe("prose");
  });

  it("a note hit is the marked document with snippetKind note (a 'Note: ' hit)", async () => {
    const results = await executeSearch(projectRoot, NOTE_WORD, {}, 10);
    expect(results.map((r) => r.resourceId)).toEqual([markedId]);
    expect(results[0]!.snippetKind).toBe("note");
  });
});

describe("a marked document in Trash (FR-18)", () => {
  it("leaves the inverted index and the annotation index, and returns on restore", async () => {
    await softDeleteResource(projectRoot, markedId);
    expect(await search(projectRoot, PROSE_WORD)).toEqual([]);
    expect(await searchAnnotationBodies(projectRoot, NOTE_WORD)).toEqual([]);

    await restoreResource(projectRoot, markedId);
    await flushIndexer();
    expect(await search(projectRoot, PROSE_WORD)).toEqual([markedId]);
    expect(await searchAnnotationBodies(projectRoot, NOTE_WORD)).toEqual([
      markedId,
    ]);
  });

  it("leaves search results and returns them on restore", async () => {
    await softDeleteResource(projectRoot, markedId);
    expect(await executeSearch(projectRoot, PROSE_WORD, {}, 10)).toEqual([]);
    expect(await executeSearch(projectRoot, NOTE_WORD, {}, 10)).toEqual([]);

    await restoreResource(projectRoot, markedId);
    await flushIndexer();
    const prose = await executeSearch(projectRoot, PROSE_WORD, {}, 10);
    const note = await executeSearch(projectRoot, NOTE_WORD, {}, 10);
    expect(prose.map((r) => r.resourceId)).toEqual([markedId]);
    expect(note.map((r) => r.resourceId)).toEqual([markedId]);
  });

  it("the mark survives Trash and restore", async () => {
    await softDeleteResource(projectRoot, markedId);
    await restoreResource(projectRoot, markedId);
    await flushIndexer();
    expect(isMergedDocument((await readSidecar(projectRoot, markedId))!)).toBe(
      true,
    );
  });
});
