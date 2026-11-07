/**
 * Feature 73, Task 3 (FR-20, FR-28, FR-30, FR-31 copy half, FR-33 copy):
 * `copyResourceCore` leaves a copied TEXT resource with its own initial
 * canonical revision, fails before any write when a text source has no
 * content, and keeps `resourceSubtype` for every resource type.
 *
 * Feature 73, Task 6 (FR-22, FR-29, FR-30, FR-31 duplicate half, FR-33
 * duplicate): the same guarantees for `duplicateResource`, at the end of
 * this file.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/resource-initial-revision", async (orig) => {
  const actual =
    await orig<
      typeof import("../../src/lib/models/resource-initial-revision")
    >();
  return {
    ...actual,
    writeInitialCanonicalRevision: vi.fn(actual.writeInitialCanonicalRevision),
  };
});

import {
  copyResourceCore,
  createResourceCore,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import { duplicateResource } from "../../src/lib/models/resource-templates";
import * as initialRevision from "../../src/lib/models/resource-initial-revision";
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { listRevisions } from "../../src/lib/models/revision";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { loadProjectConfig } from "../../src/lib/models/project-config";
import { resolveInitialRevisionName } from "../../src/lib/models/resource-revision";
import { loadProjectFromDisk } from "../../src/lib/models/project-loader";
import { getLocalResources } from "../../src/lib/models/resource";
import { readSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import { addAnnotationCore } from "../../src/lib/models/annotations-core";
import type { Annotation, TipTapDocument } from "../../src/lib/models/types";

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
  projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-copy-rev-"));
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  projectId = generateUUID();
  projectRoot = path.join(projectsDir, projectId);
  await createAndAssertProject(SPEC_PATH, {
    projectRoot,
    name: "Copy Revision Test",
  });
});

afterEach(async () => {
  vi.mocked(initialRevision.writeInitialCanonicalRevision).mockClear();
  if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  await removeDirRetry(projectsDir);
});

async function listTree(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      out.push(path.relative(dir, full));
      if (e.isDirectory()) await walk(full);
    }
  }
  await walk(dir);
  return out.sort();
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, "utf8")) as T;
}

function doc(text: string): TipTapDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

/** Text source whose current content differs from its initial content. */
async function makeEditedTextSource(): Promise<string> {
  const created = await createResourceCore(projectId, {
    type: "text",
    name: "Source",
    text: { plainText: "initial words" },
  });
  const [rev] = await listRevisions(projectRoot, created.id);
  await updateRevisionInPlace(
    projectRoot,
    created.id,
    rev.id,
    JSON.stringify(doc("edited words")),
  );
  // Let background indexing settle so directory-listing snapshots are stable.
  await flushIndexer();
  return created.id;
}

describe("copyResourceCore — initial canonical revision (FR-28, FR-31)", () => {
  it("gives a text copy exactly one canonical v-1 revision holding the copy's own document", async () => {
    const sourceId = await makeEditedTextSource();
    const sourceRevsBefore = await listRevisions(projectRoot, sourceId);
    const sourceBinBefore = await fs.readFile(
      path.join(projectRoot, "revisions", sourceId, "v-1", "content.bin"),
      "utf8",
    );

    const copy = (await copyResourceCore(
      projectId,
      sourceId,
      "Source Copy",
    )) as { id: string };

    const revs = await listRevisions(projectRoot, copy.id);
    expect(revs).toHaveLength(1);
    expect(revs[0].versionNumber).toBe(1);
    expect(revs[0].isCanonical).toBe(true);
    expect(revs[0].resourceId).toBe(copy.id);
    expect(revs.filter((r) => r.isCanonical)).toHaveLength(1);
    expect(revs[0].metadata?.name).toBe(
      resolveInitialRevisionName(await loadProjectConfig(projectRoot)),
    );

    const revContent = await readJson<TipTapDocument>(
      path.join(projectRoot, "revisions", copy.id, "v-1", "content.bin"),
    );
    const copyContent = await readJson<TipTapDocument>(
      path.join(projectRoot, "resources", copy.id, "content.tiptap.json"),
    );
    expect(revContent).toEqual(copyContent);
    expect(revContent).toEqual(doc("edited words"));

    // Source untouched; its history is not copied (FR-30).
    const sourceRevsAfter = await listRevisions(projectRoot, sourceId);
    expect(sourceRevsAfter).toEqual(sourceRevsBefore);
    expect(
      await fs.readFile(
        path.join(projectRoot, "revisions", sourceId, "v-1", "content.bin"),
        "utf8",
      ),
    ).toBe(sourceBinBefore);

    await expect(loadProjectFromDisk(projectRoot)).resolves.toBeDefined();
    await expect(getLocalResources(projectRoot)).resolves.toBeDefined();

    const updated = await updateRevisionInPlace(
      projectRoot,
      copy.id,
      revs[0].id,
      JSON.stringify(doc("typed in the copy")),
    );
    expect(updated.id).toBe(revs[0].id);
    expect(
      await readJson<TipTapDocument>(
        path.join(projectRoot, "revisions", copy.id, "v-1", "content.bin"),
      ),
    ).toEqual(doc("typed in the copy"));
  });

  it("falls back to the copy's content.txt as a TipTap document when no TipTap file exists", async () => {
    const sourceId = await makeEditedTextSource();
    await fs.rm(
      path.join(projectRoot, "resources", sourceId, "content.tiptap.json"),
    );
    await fs.writeFile(
      path.join(projectRoot, "resources", sourceId, "content.txt"),
      "line one\nline two",
      "utf8",
    );

    const copy = (await copyResourceCore(projectId, sourceId, "C")) as {
      id: string;
    };
    const content = await readJson<TipTapDocument>(
      path.join(projectRoot, "revisions", copy.id, "v-1", "content.bin"),
    );
    expect(content.content).toHaveLength(2);
    expect(content.content[1].content?.[0]?.text).toBe("line two");
  });

  it.each(["image", "audio"] as const)(
    "writes no revisions directory for a %s copy",
    async (type) => {
      const created = await createResourceCore(projectId, {
        type,
        name: "Media",
        ...(type === "image"
          ? { image: { file: "original.png" } }
          : { audio: { file: "original.mp3" } }),
      });
      const copy = (await copyResourceCore(projectId, created.id, "M2")) as {
        id: string;
      };
      await expect(
        fs.stat(path.join(projectRoot, "revisions", copy.id)),
      ).rejects.toThrow();
      expect(await listRevisions(projectRoot, copy.id)).toEqual([]);
    },
  );

  it("gives a source with no sidecar no revision", async () => {
    const sourceId = generateUUID();
    await fs.mkdir(path.join(projectRoot, "resources", sourceId), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, "resources", sourceId, "content.txt"),
      "x",
      "utf8",
    );
    const copy = (await copyResourceCore(projectId, sourceId, "C")) as {
      id: string;
    };
    expect(await listRevisions(projectRoot, copy.id)).toEqual([]);
  });
});

describe("copyResourceCore — failures before any write (FR-28, FR-33)", () => {
  it("rejects naming the source id when a text source has no content files, writing nothing", async () => {
    const sourceId = await makeEditedTextSource();
    await fs.rm(path.join(projectRoot, "resources", sourceId), {
      recursive: true,
    });
    const before = await listTree(projectRoot);

    await expect(copyResourceCore(projectId, sourceId, "Nope")).rejects.toThrow(
      sourceId,
    );

    expect(await listTree(projectRoot)).toEqual(before);
  });

  it("rejects when the content directory exists but holds neither content file", async () => {
    const sourceId = await makeEditedTextSource();
    await fs.rm(
      path.join(projectRoot, "resources", sourceId, "content.tiptap.json"),
    );
    await fs.rm(path.join(projectRoot, "resources", sourceId, "content.txt"), {
      force: true,
    });
    const before = await listTree(projectRoot);
    await expect(copyResourceCore(projectId, sourceId, "Nope")).rejects.toThrow(
      sourceId,
    );
    expect(await listTree(projectRoot)).toEqual(before);
  });

  it("leaves the directory listing unchanged when the source sidecar read fails", async () => {
    const sourceId = await makeEditedTextSource();
    await fs.writeFile(
      path.join(projectRoot, "meta", `resource-${sourceId}.meta.json`),
      "{not json",
      "utf8",
    );
    const before = await listTree(projectRoot);
    await expect(
      copyResourceCore(projectId, sourceId, "Nope"),
    ).rejects.toThrow();
    expect(await listTree(projectRoot)).toEqual(before);
  });

  it("propagates a locked-access error from the shared writer", async () => {
    const sourceId = await makeEditedTextSource();
    vi.mocked(
      initialRevision.writeInitialCanonicalRevision,
    ).mockRejectedValueOnce(new ProjectLockedError(projectId));
    await expect(
      copyResourceCore(projectId, sourceId, "Locked"),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });
});

describe("copyResourceCore — resourceSubtype kept (FR-20)", () => {
  it.each(["text", "image", "audio"] as const)(
    "persists and returns the source's resourceSubtype for a %s source",
    async (type) => {
      const created = await createResourceCore(projectId, {
        type,
        name: "Typed",
        ...(type === "text"
          ? { text: { plainText: "hi" } }
          : type === "image"
            ? { image: { file: "original.png" } }
            : { audio: { file: "original.mp3" } }),
      });
      await updateSidecarCore(projectId, created.id, {
        resourceSubtype: "scene",
      });
      const copy = await copyResourceCore(projectId, created.id, "Typed 2");
      expect(copy.resourceSubtype).toBe("scene");
      const persisted = await readSidecar(projectRoot, copy.id as string);
      expect(persisted?.resourceSubtype).toBe("scene");
    },
  );

  it("gives the copy no resourceSubtype when the source has none", async () => {
    const created = await createResourceCore(projectId, {
      type: "text",
      name: "Plain",
      text: { plainText: "hi" },
    });
    const copy = await copyResourceCore(projectId, created.id, "Plain 2");
    expect("resourceSubtype" in copy).toBe(false);
    const persisted = await readSidecar(projectRoot, copy.id as string);
    expect(persisted && "resourceSubtype" in persisted).toBe(false);
  });
});

describe("duplicateResource — initial canonical revision (FR-29, FR-31)", () => {
  it("gives a text duplicate exactly one canonical v-1 revision holding the duplicate's own document", async () => {
    const sourceId = await makeEditedTextSource();
    const sourceRevsBefore = await listRevisions(projectRoot, sourceId);
    const sourceBinBefore = await fs.readFile(
      path.join(projectRoot, "revisions", sourceId, "v-1", "content.bin"),
      "utf8",
    );

    const { newId } = await duplicateResource(projectRoot, sourceId);

    const revs = await listRevisions(projectRoot, newId);
    expect(revs).toHaveLength(1);
    expect(revs[0].versionNumber).toBe(1);
    expect(revs[0].isCanonical).toBe(true);
    expect(revs[0].resourceId).toBe(newId);
    expect(revs.filter((r) => r.isCanonical)).toHaveLength(1);
    expect(revs[0].metadata?.name).toBe(
      resolveInitialRevisionName(await loadProjectConfig(projectRoot)),
    );

    const revContent = await readJson<TipTapDocument>(
      path.join(projectRoot, "revisions", newId, "v-1", "content.bin"),
    );
    const dupContent = await readJson<TipTapDocument>(
      path.join(projectRoot, "resources", newId, "content.tiptap.json"),
    );
    expect(revContent).toEqual(dupContent);
    expect(revContent).toEqual(doc("edited words"));

    // Source untouched; its history is not copied (FR-30).
    expect(await listRevisions(projectRoot, sourceId)).toEqual(
      sourceRevsBefore,
    );
    expect(
      await fs.readFile(
        path.join(projectRoot, "revisions", sourceId, "v-1", "content.bin"),
        "utf8",
      ),
    ).toBe(sourceBinBefore);

    await expect(loadProjectFromDisk(projectRoot)).resolves.toBeDefined();
    await expect(getLocalResources(projectRoot)).resolves.toBeDefined();

    const updated = await updateRevisionInPlace(
      projectRoot,
      newId,
      revs[0].id,
      JSON.stringify(doc("typed in the duplicate")),
    );
    expect(updated.id).toBe(revs[0].id);
    expect(
      await readJson<TipTapDocument>(
        path.join(projectRoot, "revisions", newId, "v-1", "content.bin"),
      ),
    ).toEqual(doc("typed in the duplicate"));
    await flushIndexer();
  });

  it("re-duplicates a resource that has no revisions, since it reads content files", async () => {
    const sourceId = await makeEditedTextSource();
    await fs.rm(path.join(projectRoot, "revisions", sourceId), {
      recursive: true,
    });
    const { newId } = await duplicateResource(projectRoot, sourceId);
    const revs = await listRevisions(projectRoot, newId);
    expect(revs).toHaveLength(1);
    expect(revs[0].isCanonical).toBe(true);
    await flushIndexer();
  });

  it.each(["image", "audio"] as const)(
    "writes no revisions directory for a %s duplicate",
    async (type) => {
      const created = await createResourceCore(projectId, {
        type,
        name: "Media",
        ...(type === "image"
          ? { image: { file: "original.png" } }
          : { audio: { file: "original.mp3" } }),
      });
      const { newId } = await duplicateResource(projectRoot, created.id);
      await expect(
        fs.stat(path.join(projectRoot, "revisions", newId)),
      ).rejects.toThrow();
      expect(await listRevisions(projectRoot, newId)).toEqual([]);
      expect(await readSidecar(projectRoot, newId)).not.toBeNull();
    },
  );
});

describe("duplicateResource — failures before any write (FR-29, FR-33)", () => {
  it("rejects naming the source id when a text source has no content files, writing nothing", async () => {
    const sourceId = await makeEditedTextSource();
    await fs.rm(path.join(projectRoot, "resources", sourceId), {
      recursive: true,
    });
    const before = await listTree(projectRoot);

    await expect(duplicateResource(projectRoot, sourceId)).rejects.toThrow(
      sourceId,
    );

    expect(await listTree(projectRoot)).toEqual(before);
  });

  it("rejects a text source in the old flat layout, writing nothing", async () => {
    const sourceId = await makeEditedTextSource();
    await fs.rm(path.join(projectRoot, "resources", sourceId), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, "resources", `old-slug-${sourceId}.txt`),
      "flat layout text",
      "utf8",
    );
    const before = await listTree(projectRoot);

    await expect(duplicateResource(projectRoot, sourceId)).rejects.toThrow(
      sourceId,
    );

    expect(await listTree(projectRoot)).toEqual(before);
  });

  it("rejects without writing when the source sidecar is missing", async () => {
    const missing = generateUUID();
    await flushIndexer();
    const before = await listTree(projectRoot);
    await expect(duplicateResource(projectRoot, missing)).rejects.toThrow(
      missing,
    );
    expect(await listTree(projectRoot)).toEqual(before);
  });

  it("propagates a locked-access error from the shared writer", async () => {
    const sourceId = await makeEditedTextSource();
    vi.mocked(
      initialRevision.writeInitialCanonicalRevision,
    ).mockRejectedValueOnce(new ProjectLockedError(projectId));
    await expect(
      duplicateResource(projectRoot, sourceId),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });

  it("writes the revision last, after the content directory and sidecar exist", async () => {
    const sourceId = await makeEditedTextSource();
    let seen: { hasContent: boolean; hasSidecar: boolean } | null = null;
    vi.mocked(
      initialRevision.writeInitialCanonicalRevision,
    ).mockImplementationOnce(async (root, id) => {
      const hasContent = await fs
        .stat(path.join(root, "resources", id, "content.tiptap.json"))
        .then(() => true)
        .catch(() => false);
      const hasSidecar = (await readSidecar(root, id)) !== null;
      seen = { hasContent, hasSidecar };
    });
    await duplicateResource(projectRoot, sourceId);
    expect(seen).toEqual({ hasContent: true, hasSidecar: true });
    await flushIndexer();
  });
});

describe("duplicateResource — resourceSubtype kept (FR-22)", () => {
  it("keeps the source's resourceSubtype and leaves name, createdAt, orderIndex, folderId as the source's", async () => {
    const created = await createResourceCore(projectId, {
      type: "text",
      name: "Typed",
      text: { plainText: "hi" },
    });
    await updateSidecarCore(projectId, created.id, {
      resourceSubtype: "scene",
    });
    const source = await readSidecar(projectRoot, created.id);

    const { newId } = await duplicateResource(projectRoot, created.id);
    const dup = await readSidecar(projectRoot, newId);

    expect(dup?.resourceSubtype).toBe("scene");
    expect(dup?.id).toBe(newId);
    expect(dup?.name).toBe(source?.name);
    expect(dup?.createdAt).toBe(source?.createdAt);
    expect(dup?.orderIndex).toBe(source?.orderIndex);
    expect(dup?.folderId).toBe(source?.folderId);
    await flushIndexer();
  });

  it("gives the duplicate no resourceSubtype when the source has none", async () => {
    const created = await createResourceCore(projectId, {
      type: "text",
      name: "Plain",
      text: { plainText: "hi" },
    });
    const { newId } = await duplicateResource(projectRoot, created.id);
    const dup = await readSidecar(projectRoot, newId);
    expect(dup && "resourceSubtype" in dup).toBe(false);
    await flushIndexer();
  });
});

// ---------------------------------------------------------------------------
// Feature 101, Task 13 (FR-21, OQ-14): annotations on copy and duplicate.
// ---------------------------------------------------------------------------

const NOTE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOTE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOTE_DETACHED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOTE_BODYLESS = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function annotatedDoc(): TipTapDocument {
  const mark = (id: string) => ({ type: "annotation", attrs: { id } });
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "one " },
          { type: "text", text: "two", marks: [mark(NOTE_A), mark(NOTE_B)] },
          { type: "text", text: " three", marks: [mark(NOTE_BODYLESS)] },
        ],
      },
    ],
  };
}

/** A text resource with two marked annotations, one detached body and one body-less mark. */
async function makeAnnotatedSource(
  type: "text" | "source" = "text",
): Promise<string> {
  const created = await createResourceCore(projectId, {
    type,
    name: "Annotated",
    text: { plainText: "one two three" },
  });
  const [rev] = await listRevisions(projectRoot, created.id);
  await updateRevisionInPlace(
    projectRoot,
    created.id,
    rev.id,
    JSON.stringify(annotatedDoc()),
  );
  await addAnnotationCore(projectId, created.id, {
    id: NOTE_A,
    body: "body a",
    quote: "two",
  });
  await addAnnotationCore(projectId, created.id, {
    id: NOTE_B,
    body: "body b",
    quote: "two",
  });
  await addAnnotationCore(projectId, created.id, {
    id: NOTE_DETACHED,
    body: "body d",
    quote: "gone",
  });
  await flushIndexer();
  return created.id;
}

async function readAnnotations(id: string): Promise<Annotation[]> {
  const sc = await readSidecar(projectRoot, id);
  return (sc?.annotations ?? []) as unknown as Annotation[];
}

function markIdsOf(d: TipTapDocument): string[] {
  const ids: string[] = [];
  const walk = (n: TipTapDocument["content"][number]): void => {
    for (const m of n.marks ?? []) {
      if (m.type === "annotation") ids.push(String(m.attrs?.id));
    }
    n.content?.forEach(walk);
  };
  d.content.forEach(walk);
  return ids;
}

async function readTiptap(id: string): Promise<TipTapDocument> {
  return readJson<TipTapDocument>(
    path.join(projectRoot, "resources", id, "content.tiptap.json"),
  );
}

describe.each([
  [
    "copyResourceCore",
    async (sourceId: string): Promise<string> =>
      ((await copyResourceCore(projectId, sourceId, "Copy")) as { id: string })
        .id,
  ],
  [
    "duplicateResource",
    async (sourceId: string): Promise<string> =>
      (await duplicateResource(projectRoot, sourceId)).newId,
  ],
])("%s — annotations get new ids (FR-21, OQ-14)", (_name, copy) => {
  it("gives every annotation a new id, remapped in the sidecar array and the document marks, bodies and quotes copied", async () => {
    const sourceId = await makeAnnotatedSource();
    const sourceDocBefore = await readTiptap(sourceId);
    const sourceNotesBefore = await readAnnotations(sourceId);

    const copyId = await copy(sourceId);

    const copied = await readAnnotations(copyId);
    expect(copied).toHaveLength(3);
    const sourceIds = new Set(sourceNotesBefore.map((n) => n.id));
    for (const n of copied) expect(sourceIds.has(n.id)).toBe(false);
    expect(copied.map((n) => [n.body, n.quote])).toEqual(
      sourceNotesBefore.map((n) => [n.body, n.quote]),
    );

    const copiedDoc = await readTiptap(copyId);
    const ids = markIdsOf(copiedDoc);
    expect(ids).toHaveLength(3);
    const newA = copied[0]!.id;
    const newB = copied[1]!.id;
    expect(ids.slice(0, 2)).toEqual([newA, newB]);
    // the body-less mark is kept under an id that no source or copy body owns
    expect(ids[2]).not.toBe(NOTE_BODYLESS);
    expect(copied.map((n) => n.id)).not.toContain(ids[2]);

    // the source is untouched, ids never shared
    expect(await readTiptap(sourceId)).toEqual(sourceDocBefore);
    expect(await readAnnotations(sourceId)).toEqual(sourceNotesBefore);
    expect(markIdsOf(sourceDocBefore)).not.toContain(newA);
    await flushIndexer();
  });

  it("keeps the copied text and the copy's revision document in step with the remapped marks", async () => {
    const sourceId = await makeAnnotatedSource();
    const copyId = await copy(sourceId);
    const copiedDoc = await readTiptap(copyId);
    const plain = await fs.readFile(
      path.join(projectRoot, "resources", copyId, "content.txt"),
      "utf8",
    );
    expect(plain).toBe("one two three");
    const bin = await readJson<TipTapDocument>(
      path.join(projectRoot, "revisions", copyId, "v-1", "content.bin"),
    );
    expect(bin).toEqual(copiedDoc);
    await flushIndexer();
  });

  it("adds no annotations key to a copy of a resource that has none", async () => {
    const created = await createResourceCore(projectId, {
      type: "text",
      name: "Plain",
      text: { plainText: "hi" },
    });
    const copyId = await copy(created.id);
    const sc = await readSidecar(projectRoot, copyId);
    expect(sc && "annotations" in sc).toBe(false);
    await flushIndexer();
  });
});

// Feature 102, Task 32 (FR-38): a Source takes annotations, so a copy of one
// remaps them as for text (annotation-copy.ts).
describe.each([
  [
    "copyResourceCore",
    async (sourceId: string): Promise<string> =>
      ((await copyResourceCore(projectId, sourceId, "Copy")) as { id: string })
        .id,
  ],
  [
    "duplicateResource",
    async (sourceId: string): Promise<string> =>
      (await duplicateResource(projectRoot, sourceId)).newId,
  ],
])("%s of a Source — annotations get new ids (FR-38)", (_name, copy) => {
  it("remaps the sidecar array and the document marks and leaves the original alone", async () => {
    const sourceId = await makeAnnotatedSource("source");
    const notesBefore = await readAnnotations(sourceId);
    const docBefore = await readTiptap(sourceId);

    const copyId = await copy(sourceId);

    const copied = await readAnnotations(copyId);
    expect(copied).toHaveLength(3);
    const originalIds = new Set(notesBefore.map((n) => n.id));
    for (const n of copied) expect(originalIds.has(n.id)).toBe(false);
    expect(copied.map((n) => [n.body, n.quote])).toEqual(
      notesBefore.map((n) => [n.body, n.quote]),
    );
    expect(markIdsOf(await readTiptap(copyId)).slice(0, 2)).toEqual([
      copied[0]!.id,
      copied[1]!.id,
    ]);
    expect(await readAnnotations(sourceId)).toEqual(notesBefore);
    expect(await readTiptap(sourceId)).toEqual(docBefore);
    await flushIndexer();
  });
});
