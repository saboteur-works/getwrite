/**
 * Feature 120, Task 18: the new-document builder of a split (FR-3, FR-10) and
 * the function that removes it again. Real-directory tests: a project is
 * scaffolded, a folder and sibling documents are added, and the builder runs
 * against it.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as crud from "../../src/lib/models/resource-crud-core";
import {
  createResourceCore,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import { createRevision } from "../../src/lib/models/revision-core";
import { listRevisions } from "../../src/lib/models/revision";
import { getLocalResources } from "../../src/lib/models/resource-persistence";
import { mutateSidecar, readSidecar } from "../../src/lib/models/sidecar";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import type { TipTapDocument } from "../../src/lib/models/types";
import {
  createSplitDocument,
  defaultSplitDocumentName,
  planSplitPlacement,
  removeSplitDocument,
  SplitNewDocumentError,
  type SplitNewDocumentUndo,
} from "../../src/lib/models/split-new-document";

const NOVEL_SPEC = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

const SECOND_HALF: TipTapDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { id: "11111111-1111-4111-8111-111111111111" },
      content: [{ type: "text", text: "after the cut" }],
    },
  ],
} as TipTapDocument;

describe("planSplitPlacement (pure)", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const N = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  it("puts the new document directly after the original and renumbers only what moves", () => {
    const plan = planSplitPlacement(
      [
        { id: A, kind: "resource", orderIndex: 0 },
        { id: B, kind: "resource", orderIndex: 1 },
        { id: C, kind: "folder", orderIndex: 2 },
      ],
      A,
      N,
      null,
    );
    expect(plan.placement.resourceOrder).toEqual([
      { id: N, orderIndex: 1, folderId: null },
      { id: B, orderIndex: 2, folderId: null },
    ]);
    expect(plan.placement.folderOrder).toEqual([
      { id: C, orderIndex: 3, folderId: null },
    ]);
    expect(plan.previous.resourceOrder).toEqual([
      { id: B, orderIndex: 1, folderId: null },
    ]);
    expect(plan.previous.folderOrder).toEqual([
      { id: C, orderIndex: 2, folderId: null },
    ]);
  });

  it("keeps the new document's own entry when the original is last", () => {
    const plan = planSplitPlacement(
      [{ id: A, kind: "resource", orderIndex: 0 }],
      A,
      N,
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
    );
    expect(plan.placement.resourceOrder).toEqual([
      {
        id: N,
        orderIndex: 1,
        folderId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      },
    ]);
    expect(plan.previous.resourceOrder).toEqual([]);
  });

  it("throws when the original is not among the siblings", () => {
    expect(() =>
      planSplitPlacement(
        [{ id: B, kind: "resource", orderIndex: 0 }],
        A,
        N,
        null,
      ),
    ).toThrow();
  });
});

describe("defaultSplitDocumentName", () => {
  it("appends (part 2)", () => {
    expect(defaultSplitDocumentName("Chapter 1")).toBe("Chapter 1 (part 2)");
  });
});

describe("split new document on a real project", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-split-newdoc-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Split New Document",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await flushIndexer();
    if (previousEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousEnv;
    await removeDirRetry(tmp);
  });

  async function makeDoc(
    name: string,
    folderId: string | null,
    orderIndex: number,
    text = "one two three",
  ): Promise<string> {
    const r = await createResourceCore(projectId, {
      name,
      type: "text",
      folderId,
      orderIndex,
      text: { plainText: text },
    });
    return r.id;
  }

  async function makeFolder(
    name: string,
    parent: string | null,
    orderIndex: number,
  ): Promise<string> {
    const r = await createResourceCore(projectId, {
      name,
      type: "folder",
      folderId: parent,
      orderIndex,
    });
    return r.id;
  }

  /** Reads `folder.json` of the folder with this id. */
  async function folderJson(
    id: string,
  ): Promise<{ orderIndex: number; parentId: string | null }> {
    const base = path.join(projectPath, "folders");
    async function search(dir: string): Promise<string | null> {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const sub = path.join(dir, e.name);
        const raw = await fs
          .readFile(path.join(sub, "folder.json"), "utf8")
          .catch(() => null);
        if (raw !== null && (JSON.parse(raw) as { id: string }).id === id) {
          return raw;
        }
        const nested = await search(sub);
        if (nested !== null) return nested;
      }
      return null;
    }
    const found = await search(base);
    if (found === null) throw new Error("folder not found");
    return JSON.parse(found) as { orderIndex: number; parentId: string | null };
  }

  /** Every file and directory under the project: relative path -> content. */
  async function snapshot(): Promise<Map<string, string>> {
    await flushIndexer();
    const out = new Map<string, string>();
    async function walk(dir: string): Promise<void> {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        const rel = path.relative(projectPath, p);
        if (e.name.endsWith(".tmp")) continue;
        if (e.isDirectory()) {
          out.set(`${rel}/`, "");
          await walk(p);
        } else out.set(rel, await fs.readFile(p, "utf8"));
      }
    }
    await walk(projectPath);
    return out;
  }

  async function treeOrder(folderId: string | null): Promise<string[]> {
    const all = await getLocalResources(projectPath);
    return all
      .filter((r) => (r.folderId ?? null) === folderId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((r) => r.id);
  }

  it("creates the document at the end of the folder, then places it directly after the original", async () => {
    const folder = await makeFolder("Part", null, 0);
    const a = await makeDoc("A", folder, 0);
    const b = await makeDoc("B", folder, 1);
    const c = await makeDoc("C", folder, 2);
    const reorder = vi.spyOn(crud, "reorderResourcesCore");
    const { documentId } = await createSplitDocument(projectId, {
      originalId: a,
      text: SECOND_HALF,
      carriedFields: [],
    });
    expect(reorder).toHaveBeenCalledTimes(1);
    expect(await treeOrder(folder)).toEqual([a, documentId, b, c]);
    const created = await readSidecar(projectPath, documentId);
    expect(created?.folderId).toBe(folder);
  });

  it("works in the project root, sharing one order with a folder sibling", async () => {
    const a = await makeDoc("A", null, 0);
    const f = await makeFolder("F", null, 1);
    const { documentId } = await createSplitDocument(projectId, {
      originalId: a,
      text: SECOND_HALF,
      carriedFields: [],
    });
    const folder = await folderJson(f);
    expect(folder.parentId).toBeNull();
    const docs = await getLocalResources(projectPath);
    const original = docs.find((r) => r.id === a);
    const created = docs.find((r) => r.id === documentId);
    expect(created?.orderIndex).toBe((original?.orderIndex ?? -1) + 1);
    expect(folder.orderIndex).toBeGreaterThan(created?.orderIndex ?? Infinity);
  });

  it("changes no other document's content or revision, only sibling orderIndex values", async () => {
    const a = await makeDoc("A", null, 0);
    const b = await makeDoc("B", null, 1);
    await flushIndexer();
    const before = await snapshot();
    await createSplitDocument(projectId, {
      originalId: a,
      text: SECOND_HALF,
      carriedFields: [],
    });
    await flushIndexer();
    const after = await snapshot();
    const sidecarB = path.join("meta", `resource-${b}.meta.json`);
    const sidecarA = path.join("meta", `resource-${a}.meta.json`);
    const changed = listDiff(before, after, []).filter(
      (k) => before.has(k) && after.has(k),
    );
    const sidecarsChanged = changed.filter((k) => /^meta\/resource-/.test(k));
    expect(sidecarsChanged).toEqual([sidecarB]);
    const beforeB = JSON.parse(before.get(sidecarB) ?? "{}") as Record<
      string,
      unknown
    >;
    const afterB = JSON.parse(after.get(sidecarB) ?? "{}") as Record<
      string,
      unknown
    >;
    expect({ ...afterB, orderIndex: beforeB.orderIndex }).toEqual(beforeB);
    expect(after.get(sidecarA)).toBe(before.get(sidecarA));
    for (const k of before.keys()) {
      if (
        k.startsWith(`revisions/${a}/`) ||
        k.startsWith(`revisions/${b}/`) ||
        k.startsWith(`resources/${a}/`) ||
        k.startsWith(`resources/${b}/`)
      ) {
        expect(after.get(k), k).toBe(before.get(k));
      }
    }
  });

  it("names it '<name> (part 2)' by default and takes a given name", async () => {
    const a = await makeDoc("Chapter 1", null, 0);
    const first = await createSplitDocument(projectId, {
      originalId: a,
      text: SECOND_HALF,
      carriedFields: [],
    });
    expect((await readSidecar(projectPath, first.documentId))?.name).toBe(
      "Chapter 1 (part 2)",
    );
    const second = await createSplitDocument(projectId, {
      originalId: a,
      text: SECOND_HALF,
      newName: "The aftermath",
      carriedFields: [],
    });
    expect((await readSidecar(projectPath, second.documentId))?.name).toBe(
      "The aftermath",
    );
  });

  it("follows the existing name rule: a same-named sibling is neither renamed nor refused", async () => {
    const a = await makeDoc("Chapter 1", null, 0);
    await makeDoc("Chapter 1 (part 2)", null, 1);
    const { documentId } = await createSplitDocument(projectId, {
      originalId: a,
      text: SECOND_HALF,
      carriedFields: [],
    });
    const names = (await getLocalResources(projectPath)).map((r) => r.name);
    expect(names.filter((n) => n === "Chapter 1 (part 2)")).toHaveLength(2);
    expect((await readSidecar(projectPath, documentId))?.name).toBe(
      "Chapter 1 (part 2)",
    );
  });

  it("has its own id and one canonical v-1 holding the given text, with no copied revisions", async () => {
    const a = await makeDoc("A", null, 0);
    await createRevision(projectPath, a, { metadata: { name: "older" } });
    const { documentId } = await createSplitDocument(projectId, {
      originalId: a,
      text: SECOND_HALF,
      carriedFields: [],
    });
    expect(documentId).not.toBe(a);
    const revs = await listRevisions(projectPath, documentId);
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ versionNumber: 1, isCanonical: true });
    const stored = await fs.readFile(
      path.join(projectPath, "revisions", documentId, "v-1", "content.bin"),
      "utf8",
    );
    expect(JSON.parse(stored)).toEqual(SECOND_HALF);
    expect(
      await fs.readFile(
        path.join(projectPath, "resources", documentId, "content.txt"),
        "utf8",
      ),
    ).toBe(tiptapToPlainText(SECOND_HALF));
  });

  describe("sidecar", () => {
    async function richOriginal(): Promise<string> {
      const a = await makeDoc("Rich", null, 0);
      await updateSidecarCore(projectId, a, {
        resourceSubtype: "Scene",
        entityKind: "character",
        aliases: ["Rick"],
        wordCountGoal: 500,
        userMetadata: {
          status: "Draft",
          pointOfView: "first",
          synopsis: "short",
        },
      } as never);
      await mutateSidecar(projectPath, a, (cur) => ({
        ...(cur ?? {}),
        annotations: [
          {
            id: generateUUID(),
            body: "note",
            quote: "one",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ] as never,
        capturedAt: "2026-01-01T00:00:00.000Z",
      }));
      return a;
    }

    it("inherits the subtype and carries nothing else unless chosen", async () => {
      const a = await richOriginal();
      const { documentId } = await createSplitDocument(projectId, {
        originalId: a,
        text: SECOND_HALF,
        carriedFields: [],
      });
      const sc = (await readSidecar(projectPath, documentId)) ?? {};
      expect(sc.resourceSubtype).toBe("Scene");
      for (const key of [
        "entityKind",
        "aliases",
        "wordCountGoal",
        "annotations",
        "capturedAt",
        "dismissedNoiseTerms",
      ]) {
        expect(key in sc, key).toBe(false);
      }
      expect(sc.userMetadata).toEqual({});
      expect(sc.wordCount).toBe(3);
      expect(sc.id).toBe(documentId);
    });

    it("carries the fields the choice names and invents none", async () => {
      const a = await richOriginal();
      const { documentId } = await createSplitDocument(projectId, {
        originalId: a,
        text: SECOND_HALF,
        carriedFields: ["status", "pointOfView", "wordCountGoal", "missing"],
      });
      const sc = (await readSidecar(projectPath, documentId)) ?? {};
      expect(sc.userMetadata).toEqual({
        status: "Draft",
        pointOfView: "first",
      });
      expect(sc.wordCountGoal).toBe(500);
    });

    it("never carries a status the original lacks, and ignores names that are not metadata fields", async () => {
      const a = await makeDoc("Plain", null, 0);
      const { documentId } = await createSplitDocument(projectId, {
        originalId: a,
        text: SECOND_HALF,
        carriedFields: ["status", "entityKind", "annotations", "__proto__"],
      });
      const sc = (await readSidecar(projectPath, documentId)) ?? {};
      expect(sc.userMetadata).toEqual({});
      expect("entityKind" in sc).toBe(false);
      expect("annotations" in sc).toBe(false);
      expect("wordCountGoal" in sc).toBe(false);
    });

    it("leaves the original's own sidecar and revisions unchanged", async () => {
      const a = await richOriginal();
      await flushIndexer();
      const sidecarBefore = await readSidecar(projectPath, a);
      const revBefore = await listRevisions(projectPath, a);
      await createSplitDocument(projectId, {
        originalId: a,
        text: SECOND_HALF,
        carriedFields: ["status"],
      });
      await flushIndexer();
      expect(await readSidecar(projectPath, a)).toEqual(sidecarBefore);
      expect(await listRevisions(projectPath, a)).toEqual(revBefore);
    });

    it("does not share metadata objects with the original", async () => {
      const a = await richOriginal();
      const { documentId } = await createSplitDocument(projectId, {
        originalId: a,
        text: SECOND_HALF,
        carriedFields: ["status"],
      });
      await updateSidecarCore(projectId, documentId, {
        userMetadata: { status: "Final" },
      } as never);
      expect((await readSidecar(projectPath, a))?.userMetadata).toMatchObject({
        status: "Draft",
      });
    });
  });

  describe("refusals and errors", () => {
    it("rejects an original id that is not a UUID and writes nothing", async () => {
      const before = await snapshot();
      await expect(
        createSplitDocument(projectId, {
          originalId: "../escape",
          text: SECOND_HALF,
          carriedFields: [],
        }),
      ).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    });

    it("throws for an original that does not exist and writes nothing", async () => {
      const before = await snapshot();
      await expect(
        createSplitDocument(projectId, {
          originalId: generateUUID(),
          text: SECOND_HALF,
          carriedFields: [],
        }),
      ).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    });

    it("throws for a malformed project id", async () => {
      await expect(
        createSplitDocument("nope", {
          originalId: generateUUID(),
          text: SECOND_HALF,
          carriedFields: [],
        }),
      ).rejects.toThrow();
    });

    it("removes the document it created when the placement fails, and says so", async () => {
      const a = await makeDoc("A", null, 0);
      const b = await makeDoc("B", null, 1);
      await flushIndexer();
      const before = await snapshot();
      vi.spyOn(crud, "reorderResourcesCore").mockRejectedValueOnce(
        new crud.ReorderSaveError([b]),
      );
      const err = await createSplitDocument(projectId, {
        originalId: a,
        text: SECOND_HALF,
        carriedFields: [],
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SplitNewDocumentError);
      expect((err as SplitNewDocumentError).step).toBe("place");
      expect((err as SplitNewDocumentError).cleanedUp).toBe(true);
      await flushIndexer();
      expect(listDiff(before, await snapshot(), ["project.json"])).toEqual([]);
    });
  });

  describe("removeSplitDocument", () => {
    it("restores the folder, the order and the listing as before the creation", async () => {
      const folder = await makeFolder("Part", null, 0);
      const a = await makeDoc("A", folder, 0);
      await makeDoc("B", folder, 1);
      await makeDoc("C", folder, 2);
      await flushIndexer();
      const before = await snapshot();
      const orderBefore = await treeOrder(folder);
      const undo: SplitNewDocumentUndo = (
        await createSplitDocument(projectId, {
          originalId: a,
          text: SECOND_HALF,
          carriedFields: [],
        })
      ).undo;
      await flushIndexer();
      await removeSplitDocument(projectId, undo);
      await flushIndexer();
      expect(await treeOrder(folder)).toEqual(orderBefore);
      // project.json holds the metadataRevision counter, allowed to advance.
      expect(listDiff(before, await snapshot(), ["project.json"])).toEqual([]);
    });

    it("leaves no empty .trash directory it created and no diagnostics record", async () => {
      const a = await makeDoc("A", null, 0);
      await flushIndexer();
      const { documentId, undo } = await createSplitDocument(projectId, {
        originalId: a,
        text: SECOND_HALF,
        carriedFields: [],
      });
      await flushIndexer();
      await removeSplitDocument(projectId, undo);
      await flushIndexer();
      await expect(
        fs.stat(path.join(projectPath, ".trash")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      const diag = await fs
        .readFile(
          path.join(projectPath, "meta", "index", "diagnostics.json"),
          "utf8",
        )
        .catch(() => "{}");
      expect(Object.keys(JSON.parse(diag) as object)).not.toContain(documentId);
      expect(
        (await getLocalResources(projectPath)).some((r) => r.id === documentId),
      ).toBe(false);
    });

    it("keeps a .trash directory that existed before the creation", async () => {
      const a = await makeDoc("A", null, 0);
      await fs.mkdir(path.join(projectPath, ".trash", "meta"), {
        recursive: true,
      });
      const { undo } = await createSplitDocument(projectId, {
        originalId: a,
        text: SECOND_HALF,
        carriedFields: [],
      });
      await removeSplitDocument(projectId, undo);
      await flushIndexer();
      const kept = await fs.stat(path.join(projectPath, ".trash", "meta"));
      expect(kept.isDirectory()).toBe(true);
    });

    it("does not remove a Trash directory that is not empty", async () => {
      const a = await makeDoc("A", null, 0);
      const other = await makeDoc("Other", null, 1);
      await crud.deleteResourceCore(projectId, other);
      const { undo } = await createSplitDocument(projectId, {
        originalId: a,
        text: SECOND_HALF,
        carriedFields: [],
      });
      await removeSplitDocument(projectId, undo);
      await flushIndexer();
      const trashed = await fs.readdir(
        path.join(projectPath, ".trash", "meta"),
      );
      expect(trashed.some((n) => n.includes(other))).toBe(true);
    });

    it("refuses an undo handle whose document id is not a UUID", async () => {
      await expect(
        removeSplitDocument(projectId, {
          documentId: "../x",
          preexistingTrashDirs: [],
          previousOrder: { folderOrder: [], resourceOrder: [] },
        }),
      ).rejects.toThrow();
    });
  });
});

/** Entries (files and directories) whose presence or content differs. */
function listDiff(
  before: Map<string, string>,
  after: Map<string, string>,
  ignore: string[],
): string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys]
    .filter((k) => !ignore.includes(k) && before.get(k) !== after.get(k))
    .sort();
}
