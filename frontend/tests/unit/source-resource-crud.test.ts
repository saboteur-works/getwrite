/**
 * Feature 102, Task 20 (FR-19, FR-22): a Source (`type: "source"`) goes
 * through the generic resource cores end to end: create (with canonical
 * `v-1`), body save and reload, rename, move, delete to Trash and restore,
 * repair of a missing `v-1`, and loading a project that holds one. Text,
 * image and audio behaviour is pinned by their existing tests.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createResourceCore,
  deleteResourceCore,
  fetchResourceContentCore,
  renameResourceSidecarCore,
  reorderResourcesCore,
  copyResourceCore,
} from "../../src/lib/models/resource-crud-core";
import { restoreOneCore } from "../../src/lib/models/trash-core";
import { listRevisions } from "../../src/lib/models/revision";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { repairMissingInitialRevisions } from "../../src/lib/models/revision-repair";
import { loadProjectFromDisk } from "../../src/lib/models/project-loader";
import {
  getLocalResources,
  writeResourceToFile,
} from "../../src/lib/models/resource-persistence";
import {
  createResourceOfType,
  validateResource,
} from "../../src/lib/models/resource-factory";
import { readSidecar } from "../../src/lib/models/sidecar";
import { executeSearch } from "../../src/lib/search/execute-search";
import { loadBacklinks } from "../../src/lib/models/backlinks";
import { generatePreview, loadPreview } from "../../src/lib/models/previews";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import type { TipTapDocument } from "../../src/lib/models/types";

const SPEC_PATH = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

let projectsDir: string;
let projectId: string;
let projectRoot: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-source-crud-"));
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  projectId = generateUUID();
  projectRoot = path.join(projectsDir, projectId);
  await createAndAssertProject(SPEC_PATH, {
    projectRoot,
    name: "Source CRUD Test",
  });
});

afterEach(async () => {
  await flushIndexer();
  if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  await removeDirRetry(projectsDir);
});

function doc(text: string): TipTapDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function createSource(name = "Interview"): Promise<string> {
  const created = await createResourceCore(projectId, {
    type: "source",
    name,
    text: { plainText: "first words" },
  });
  return created.id;
}

describe("create a Source", () => {
  it("writes a sidecar of type source, the text body files and an empty attachment list", async () => {
    const id = await createSource();

    const sidecar = await readSidecar(projectRoot, id);
    expect(sidecar?.type).toBe("source");
    expect(sidecar?.attachments).toEqual([]);

    const base = path.join(projectRoot, "resources", id);
    expect(await fs.readFile(path.join(base, "content.txt"), "utf8")).toBe(
      "first words",
    );
    const tiptap = JSON.parse(
      await fs.readFile(path.join(base, "content.tiptap.json"), "utf8"),
    ) as TipTapDocument;
    expect(tiptap.type).toBe("doc");
  });

  it("creates the canonical revision v-1 with the Source", async () => {
    const id = await createSource();

    const revs = await listRevisions(projectRoot, id);
    expect(revs).toHaveLength(1);
    expect(revs[0].versionNumber).toBe(1);
    expect(revs[0].isCanonical).toBe(true);
  });

  it("creates a Source with an empty body when none is supplied", async () => {
    const created = await createResourceCore(projectId, {
      type: "source",
      name: "Blank",
    });
    const revs = await listRevisions(projectRoot, created.id);
    expect(revs).toHaveLength(1);
    expect(created.type).toBe("source");
  });

  it("keeps the attachment list off an image resource", () => {
    const image = createResourceOfType("image", { name: "pic", type: "image" });
    expect("attachments" in image).toBe(false);
  });
});

describe("Source body", () => {
  it("saves into the canonical revision and reloads with content.txt and content.tiptap.json", async () => {
    const id = await createSource();
    const [rev] = await listRevisions(projectRoot, id);

    await updateRevisionInPlace(
      projectRoot,
      id,
      rev.id,
      JSON.stringify(doc("edited source body")),
    );

    const fetched = await fetchResourceContentCore(projectId, id);
    expect(fetched.resourceContent.plaintextContent).toBe("edited source body");
    expect(fetched.resourceContent.tipTapContent).toEqual(
      doc("edited source body"),
    );
    expect(fetched.revisions).toHaveLength(1);
  });
});

describe("rename, move, delete and restore a Source", () => {
  it("renames", async () => {
    const id = await createSource();
    const stored = await renameResourceSidecarCore(projectId, id, "Renamed");
    expect(stored?.name).toBe("Renamed");
    expect((await readSidecar(projectRoot, id))?.type).toBe("source");
  });

  it("moves into a folder and keeps its attachment list", async () => {
    const id = await createSource();
    const folder = (await loadProjectFromDisk(projectRoot)).folders[0] as {
      id: string;
    };

    await reorderResourcesCore(projectId, {
      folderOrder: [],
      resourceOrder: [{ id, orderIndex: 3, folderId: folder.id }],
    });

    const sidecar = await readSidecar(projectRoot, id);
    expect(sidecar?.folderId).toBe(folder.id);
    expect(sidecar?.orderIndex).toBe(3);
    expect(sidecar?.attachments).toEqual([]);
  });

  it("deletes to Trash and restore returns it with its body and revision", async () => {
    const id = await createSource();

    await deleteResourceCore(projectId, id);
    expect(await readSidecar(projectRoot, id)).toBeNull();
    expect(
      (await getLocalResources(projectRoot)).map((r) => r.id),
    ).not.toContain(id);

    const result = await restoreOneCore(projectRoot, id);
    expect(result.ok).toBe(true);

    const sidecar = await readSidecar(projectRoot, id);
    expect(sidecar?.type).toBe("source");
    expect(sidecar?.attachments).toEqual([]);
    const fetched = await fetchResourceContentCore(projectId, id);
    expect(fetched.resourceContent.plaintextContent).toBe("first words");
    expect(fetched.revisions).toHaveLength(1);
  });

  it("copies with its own canonical v-1", async () => {
    const id = await createSource();
    const copy = (await copyResourceCore(projectId, id, "Copy")) as {
      id: string;
    };
    const revs = await listRevisions(projectRoot, copy.id);
    expect(revs).toHaveLength(1);
    expect(revs[0].isCanonical).toBe(true);
  });
});

describe("a project holding a Source", () => {
  it("loads through getLocalResources and loadProjectFromDisk", async () => {
    const id = await createSource();

    const local = await getLocalResources(projectRoot);
    expect(local.find((r) => r.id === id)?.type).toBe("source");

    const loaded = await loadProjectFromDisk(projectRoot);
    expect(loaded.resources.find((r) => r.id === id)?.type).toBe("source");
  });

  it("repairs a missing v-1 for a Source", async () => {
    const source = createResourceOfType("source", {
      name: "Revisionless",
      type: "source",
      text: { plainText: "orphan body" },
    });
    await writeResourceToFile(projectRoot, source);

    const report = await repairMissingInitialRevisions(projectRoot);

    expect(report.repaired.map((r) => r.id)).toContain(source.id);
    const revs = await listRevisions(projectRoot, source.id);
    expect(revs).toHaveLength(1);
    expect(revs[0].isCanonical).toBe(true);
  });
});

describe("a Source in search, backlinks and previews (Feature 102, FR-38)", () => {
  it("finds a Source body by full-text search with a snippet, as a text twin is found", async () => {
    const source = await createResourceCore(projectId, {
      type: "source",
      name: "Field Interview",
      text: { plainText: "the harbourmaster remembered the storm" },
    });
    const twin = await createResourceCore(projectId, {
      type: "text",
      name: "Field Twin",
      text: { plainText: "the harbourmaster remembered the storm" },
    });
    await flushIndexer();

    const hits = await executeSearch(projectRoot, "harbourmaster", {}, 10);

    const sourceHit = hits.find((h) => h.resourceId === source.id);
    const twinHit = hits.find((h) => h.resourceId === twin.id);
    expect(sourceHit).toBeDefined();
    expect(sourceHit?.snippet).toContain("harbourmaster");
    expect(sourceHit?.snippet).toBe(twinHit?.snippet);
    expect(sourceHit?.snippetKind).toBe(twinHit?.snippetKind);
  });

  it("records a backlink written in a Source body and to a Source, through the save-time index", async () => {
    const target = await createResourceCore(projectId, {
      type: "text",
      name: "Target",
      text: { plainText: "target body" },
    });
    const source = await createResourceCore(projectId, {
      type: "source",
      name: "Citing Source",
      text: { plainText: `cites ${target.id}` },
    });
    const reader = await createResourceCore(projectId, {
      type: "text",
      name: "Reader",
      text: { plainText: `reads ${source.id}` },
    });
    await flushIndexer();

    const index = await loadBacklinks(projectRoot);

    expect(index[source.id]).toEqual([target.id]);
    expect(index[reader.id]).toEqual([source.id]);
  });

  it("generates and loads a preview for a Source: the text excerpt and word count", async () => {
    const source = await createResourceCore(projectId, {
      type: "source",
      name: "Previewed",
      text: { plainText: "one two three" },
    });
    await flushIndexer();

    // `generatePreview` is typed for text, image and audio; a Source takes its
    // text branch at run time, so the argument is cast here.
    const out = await generatePreview(projectRoot, {
      id: source.id,
      type: "source",
      plainText: "one two three",
    } as never);

    expect(out).toEqual({
      type: "text",
      excerpt: "one two three",
      wordCount: 3,
    });
    expect(await loadPreview(projectRoot, source.id)).toEqual(out);
  });
});

describe("source resource schema", () => {
  const base = {
    id: generateUUID(),
    slug: "s",
    name: "S",
    type: "source",
    orderIndex: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts a Source with an attachment list", () => {
    const parsed = validateResource({
      ...base,
      attachments: [
        {
          id: generateUUID(),
          fileName: "a.png",
          originalName: "a.png",
          mime: "image/png",
          size: 1,
          addedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(parsed.type).toBe("source");
  });

  it("rejects a malformed attachment entry", () => {
    expect(() =>
      validateResource({ ...base, attachments: [{ fileName: "" }] }),
    ).toThrow();
  });
});
