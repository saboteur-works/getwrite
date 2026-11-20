/**
 * Feature 120, Task 29: Undo split, forward path and refusals (FR-15 read
 * side, FR-17). Real-directory tests against a scaffolded project; the split
 * itself is made by `applySplit`, so the stored record is the one Task 20
 * writes.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as locks from "../../src/lib/models/locks";
import * as revisionCore from "../../src/lib/models/revision-core";
import * as savedDefaults from "../../src/lib/models/saved-defaults-core";
import * as records from "../../src/lib/models/split-records-core";
import * as indexUpdate from "../../src/lib/models/split-index-update";
import * as resourceCrud from "../../src/lib/models/resource-crud-core";
import {
  createResourceCore,
  deleteResourceCore,
} from "../../src/lib/models/resource-crud-core";
import { mutateSidecar, readSidecar } from "../../src/lib/models/sidecar";
import { listRevisions } from "../../src/lib/models/revision";
import {
  readRevision,
  setRevisionPreserve,
  deleteRevision,
  updateRevisionInPlace,
} from "../../src/lib/models/revision-core";
import { purgeResource, softDeleteResource } from "../../src/lib/models/trash";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import { countWords } from "../../src/lib/word-count";
import type {
  Annotation,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";
import {
  hashSplitContent,
  revisionContentLockKey,
} from "../../src/lib/models/split-preview-core";
import {
  applySplit,
  type SplitApplyRequest,
} from "../../src/lib/models/split-core";
import { undoLatestSplit } from "../../src/lib/models/split-undo-core";
import { SPLIT_UNDO_REFUSAL_MESSAGES } from "../../src/lib/models/split-messages";
import type { LatestOperationRecord } from "../../src/lib/models/split-types";

const NOVEL_SPEC = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

const ID = {
  before: "a0000000-0000-4000-8000-000000000001",
  span: "a0000000-0000-4000-8000-000000000002",
  claim: "a0000000-0000-4000-8000-000000000003",
  citation: "a0000000-0000-4000-8000-000000000004",
  note: "a0000000-0000-4000-8000-000000000005",
  later: "a0000000-0000-4000-8000-000000000006",
  laterOriginal: "a0000000-0000-4000-8000-000000000007",
  source: "a0000000-0000-4000-8000-0000000000ff",
} as const;

const NODE_IDS = [
  "b0000000-0000-4000-8000-000000000001",
  "b0000000-0000-4000-8000-000000000002",
  "b0000000-0000-4000-8000-000000000003",
  "b0000000-0000-4000-8000-000000000004",
] as const;

const plain = (text: string): TipTapNode =>
  ({ type: "text", text }) as TipTapNode;
const marked = (text: string, id: string): TipTapNode =>
  ({
    type: "text",
    text,
    marks: [{ type: "annotation", attrs: { id } }],
  }) as TipTapNode;
const para = (nodeId: string, ...content: TipTapNode[]): TipTapNode =>
  ({ type: "paragraph", attrs: { id: nodeId }, content }) as TipTapNode;

const DOC: TipTapDocument = {
  type: "doc",
  content: [
    para(
      NODE_IDS[0],
      plain("Alpha "),
      marked("beta", ID.before),
      plain(" gamma."),
    ),
    para(NODE_IDS[1], plain("Delta "), marked("epsilon zeta", ID.span)),
    para(NODE_IDS[2], plain("Eta "), marked("theta", ID.claim)),
    para(
      NODE_IDS[3],
      marked("Iota", ID.note),
      plain(" "),
      marked("kappa.", ID.citation),
    ),
  ],
} as TipTapDocument;

const CUT_AFTER = "Delta epsilon";

function annotation(
  id: string,
  body: string,
  extra: Partial<Annotation> = {},
): Annotation {
  return {
    id,
    body,
    quote: `quote of ${body}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  } as Annotation;
}

const ANNOTATIONS: Annotation[] = [
  annotation(ID.before, "note before"),
  annotation(ID.span, "note across"),
  annotation(ID.claim, "claim after", {
    claim: { status: "unverified", statusChangedAt: "2026-01-01T00:00:00Z" },
  }),
  annotation(ID.citation, "citation after", {
    target: { sourceId: ID.source, sourceName: "A source" },
  }),
  annotation(ID.note, "note after"),
];

const CARRIED = [ID.claim, ID.citation, ID.note];

function docOf(...paragraphs: string[]): TipTapDocument {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  } as TipTapDocument;
}

describe("undoLatestSplit on a real project", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-split-undo-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Split Undo",
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
    options: { doc?: TipTapDocument; name?: string } = {},
  ): Promise<string> {
    const resource = await createResourceCore(projectId, {
      name: options.name ?? "Chapter 1",
      type: "text",
      text: { tiptap: options.doc ?? DOC },
    });
    await mutateSidecar(projectPath, resource.id, (current) => ({
      ...(current ?? {}),
      annotations: ANNOTATIONS as never,
    }));
    await flushIndexer();
    return resource.id;
  }

  async function canonicalOf(
    id: string,
  ): Promise<{ revisionId: string; content: string }> {
    const canonical = (await listRevisions(projectPath, id)).find(
      (r) => r.isCanonical,
    );
    if (!canonical) throw new Error("no canonical revision");
    const { content } = await readRevision(projectPath, id, canonical.id);
    return { revisionId: canonical.id, content };
  }

  async function requestFor(
    resourceId: string,
    offset: number,
    carry: Partial<SplitApplyRequest["carryOver"]> = {},
  ): Promise<SplitApplyRequest> {
    const { revisionId, content } = await canonicalOf(resourceId);
    return {
      resourceId,
      revisionId,
      contentHash: hashSplitContent(content),
      offset,
      carryOver: { annotationIds: CARRIED, fields: [], newName: "", ...carry },
    };
  }

  const offsetAt = (needle: string): number => {
    const text = tiptapToPlainText(DOC);
    const at = text.indexOf(needle);
    if (at === -1) throw new Error("needle not in fixture");
    return at + needle.length;
  };

  async function splitOk(
    resourceId: string,
    offset = offsetAt(CUT_AFTER),
    text: TipTapDocument = DOC,
  ): Promise<{ newId: string; snapshotId: string }> {
    const request = await requestFor(resourceId, offset);
    void text;
    const result = await applySplit(projectId, request);
    if (result.outcome !== "applied") throw new Error(JSON.stringify(result));
    return {
      newId: result.newDocumentId,
      snapshotId: result.snapshotRevisionId,
    };
  }

  /**
   * Waits out background indexing. A sidecar write schedules its enqueue with
   * `setImmediate` plus a dynamic import, so the queue can read as empty
   * before the enqueue has happened; `flushIndexer` alone returns at once in
   * that gap. Two rounds, with a pause after each, let a late enqueue land
   * and drain before a snapshot is taken.
   */
  async function settleIndexing(): Promise<void> {
    for (let round = 0; round < 2; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      await flushIndexer();
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
    }
    await flushIndexer();
  }

  async function dirSnapshot(): Promise<Map<string, string>> {
    await settleIndexing();
    const out = new Map<string, string>();
    async function walk(dir: string): Promise<void> {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        const rel = path.relative(projectPath, p);
        if (e.isDirectory()) {
          out.set(`${rel}/`, "");
          await walk(p);
        } else out.set(rel, await fs.readFile(p, "utf8"));
      }
    }
    await walk(projectPath);
    return out;
  }

  async function subtree(rel: string): Promise<Map<string, string>> {
    const all = await dirSnapshot();
    return new Map([...all].filter(([k]) => k.startsWith(rel)));
  }

  const readJson = async (rel: string): Promise<Record<string, unknown>> =>
    JSON.parse(
      await fs.readFile(path.join(projectPath, rel), "utf8"),
    ) as Record<string, unknown>;

  const exists = async (rel: string): Promise<boolean> =>
    fs
      .stat(path.join(projectPath, rel))
      .then(() => true)
      .catch(() => false);

  async function editDocument(id: string, text: string): Promise<string> {
    const { revisionId } = await canonicalOf(id);
    const content = JSON.stringify(docOf(text));
    await updateRevisionInPlace(projectPath, id, revisionId, content);
    await flushIndexer();
    return content;
  }

  /** Contents of every preserved revision of a document, live or trashed. */
  async function preservedContents(
    id: string,
    base = "revisions",
  ): Promise<string[]> {
    const dir = path.join(projectPath, base, id);
    const out: string[] = [];
    for (const name of await fs.readdir(dir)) {
      const meta = JSON.parse(
        await fs.readFile(path.join(dir, name, "metadata.json"), "utf8"),
      ) as { metadata?: { preserve?: boolean } };
      if (meta.metadata?.preserve === true)
        out.push(
          await fs.readFile(path.join(dir, name, "content.bin"), "utf8"),
        );
    }
    return out;
  }

  async function excludeInProject(...ids: string[]): Promise<void> {
    const project = await readJson("project.json");
    await fs.writeFile(
      path.join(projectPath, "project.json"),
      JSON.stringify({
        ...project,
        config: {
          ...(project.config as object),
          compileDefaults: { excludedResourceIds: ids },
        },
      }),
    );
  }

  async function undoOk(): Promise<
    Extract<Awaited<ReturnType<typeof undoLatestSplit>>, { outcome: "applied" }>
  > {
    const result = await undoLatestSplit(projectId);
    if (result.outcome !== "applied") throw new Error(JSON.stringify(result));
    return result;
  }

  describe("nothing to undo", () => {
    it("answers nothing-to-undo when no operation is recorded, and changes nothing", async () => {
      await makeDoc();
      const before = await dirSnapshot();
      expect(await undoLatestSplit(projectId)).toEqual({
        outcome: "nothing-to-undo",
      });
      expect(await dirSnapshot()).toEqual(before);
    });

    it("answers could-not-be-checked, not nothing-to-undo, for an unreadable record", async () => {
      await makeDoc();
      await fs.mkdir(path.join(projectPath, "meta"), { recursive: true });
      await fs.writeFile(
        path.join(projectPath, "meta", "latest-operation.json"),
        "{ not json",
      );
      const before = await dirSnapshot();
      const result = await undoLatestSplit(projectId);
      expect(result.outcome).toBe("could-not-be-checked");
      expect(await dirSnapshot()).toEqual(before);
    });

    it("does not undo a merge record", async () => {
      const id = await makeDoc();
      const { newId, snapshotId } = await splitOk(id);
      const record = (await records.readLatestOperation(projectPath)) as {
        outcome: "found";
        record: LatestOperationRecord;
      };
      await records.writeLatestOperation(projectPath, {
        ...record.record,
        kind: "merge",
      });
      const before = await dirSnapshot();
      expect(await undoLatestSplit(projectId)).toEqual({
        outcome: "unsupported-operation",
        kind: "merge",
      });
      expect(await dirSnapshot()).toEqual(before);
      expect(newId).toBeTruthy();
      expect(snapshotId).toBeTruthy();
    });
  });

  describe("a split undone", () => {
    it("restores the original's text to its text before the split, in every stored copy", async () => {
      const id = await makeDoc();
      const before = (await canonicalOf(id)).content;
      await splitOk(id);
      expect((await canonicalOf(id)).content).not.toBe(before);
      await undoOk();
      const after = await canonicalOf(id);
      expect(after.content).toBe(before);
      const plainText = tiptapToPlainText(JSON.parse(before) as TipTapDocument);
      expect(
        await fs.readFile(
          path.join(projectPath, "resources", id, "content.txt"),
          "utf8",
        ),
      ).toBe(plainText);
      const sidecar = (await readSidecar(projectPath, id)) as Record<
        string,
        unknown
      >;
      expect(sidecar.wordCount).toBe(countWords(plainText));
      const canonicals = (await listRevisions(projectPath, id)).filter(
        (r) => r.isCanonical,
      );
      expect(canonicals).toHaveLength(1);
    });

    it("sends the split-off document to Trash, clears the record and keeps the lineage entry and the snapshot", async () => {
      const id = await makeDoc();
      const { newId, snapshotId } = await splitOk(id);
      const result = await undoOk();
      expect(result.splitOffDocumentId).toBe(newId);
      expect(result.splitOffState).toBe("moved-to-trash");
      expect(await exists(`meta/resource-${newId}.meta.json`)).toBe(false);
      expect(await exists(`.trash/meta/resource-${newId}.meta.json`)).toBe(
        true,
      );
      expect(await exists("meta/latest-operation.json")).toBe(false);
      expect(await records.readLatestOperation(projectPath)).toEqual({
        outcome: "none",
      });
      expect((await records.readLineageEntry(projectPath, newId)).outcome).toBe(
        "found",
      );
      const snapshot = (await listRevisions(projectPath, id)).find(
        (r) => r.id === snapshotId,
      );
      expect(snapshot?.metadata?.preserve).toBe(true);
      expect(snapshot?.metadata?.splitSnapshot).toBe(true);
    });

    it("runs once: a second call finds nothing to undo and changes nothing", async () => {
      const id = await makeDoc();
      await splitOk(id);
      await undoOk();
      const before = await dirSnapshot();
      expect(await undoLatestSplit(projectId)).toEqual({
        outcome: "nothing-to-undo",
      });
      expect(await dirSnapshot()).toEqual(before);
    });

    it("removes the split-off document's compile exclusion and keeps the original's", async () => {
      const id = await makeDoc();
      await excludeInProject(id);
      const { newId } = await splitOk(id);
      const during = (await readJson("project.json")).config as {
        compileDefaults: { excludedResourceIds: string[] };
      };
      expect(during.compileDefaults.excludedResourceIds).toEqual([id, newId]);
      await undoOk();
      const after = (await readJson("project.json")).config as {
        compileDefaults: { excludedResourceIds: string[] };
      };
      expect(after.compileDefaults.excludedResourceIds).toEqual([id]);
    });

    it("moves the carried annotations back unchanged and out of the trashed document", async () => {
      const id = await makeDoc();
      const { newId } = await splitOk(id);
      const result = await undoOk();
      expect([...result.movedAnnotationIds].sort()).toEqual(
        [...CARRIED].sort(),
      );
      const sidecar = (await readSidecar(projectPath, id)) as Record<
        string,
        unknown
      >;
      const list = sidecar.annotations as Annotation[];
      expect(list.map((a) => a.id).sort()).toEqual(
        ANNOTATIONS.map((a) => a.id).sort(),
      );
      for (const original of ANNOTATIONS) {
        expect(list.find((a) => a.id === original.id)).toEqual(original);
      }
      const trashed = await readJson(`.trash/meta/resource-${newId}.meta.json`);
      expect(
        ((trashed.annotations as Annotation[] | undefined) ?? []).map(
          (a) => a.id,
        ),
      ).toEqual([]);
    });

    it("adds nothing to the writing log: the directory is byte-identical across Undo", async () => {
      const id = await makeDoc();
      const { newId } = await splitOk(id);
      await editDocument(id, "A later edit with several words in it");
      await editDocument(newId, "Another edit in the new document");
      const before = await subtree("meta/writing-log");
      expect(before.size).toBeGreaterThan(0);
      await undoOk();
      expect(await subtree("meta/writing-log")).toEqual(before);
    });

    it("takes the original's revision lock then the split-off's, once each, and writes the original with lockHeld", async () => {
      const id = await makeDoc();
      const { newId } = await splitOk(id);
      const acquire = vi.spyOn(locks, "acquireLock");
      const write = vi.spyOn(revisionCore, "writeCanonicalContentWithoutLog");
      await undoOk();
      expect(acquire.mock.calls.map((c) => c[0])).toEqual([
        revisionContentLockKey(projectPath, id),
        revisionContentLockKey(projectPath, newId),
      ]);
      expect(write.mock.calls[0][4]).toEqual({ lockHeld: true });
    });

    it("runs its writes in the decided order", async () => {
      const id = await makeDoc();
      await excludeInProject(id);
      await splitOk(id);
      const calls: string[] = [];
      const wrap = <T extends object, K extends keyof T>(
        target: T,
        key: K,
        label: string,
      ): void => {
        const original = target[key] as unknown as (...a: unknown[]) => unknown;
        vi.spyOn(target, key as never).mockImplementation(((
          ...args: unknown[]
        ) => {
          calls.push(label);
          return original(...args);
        }) as never);
      };
      wrap(revisionCore, "createRevision", "save-text");
      wrap(revisionCore, "writeCanonicalContentWithoutLog", "restore");
      wrap(resourceCrud, "deleteResourceCore", "trash");
      wrap(savedDefaults, "removeCompileExclusions", "exclusion");
      wrap(records, "clearLatestOperation", "clear");
      wrap(indexUpdate, "updateDocumentIndexes", "index");
      await undoOk();
      expect(calls).toEqual([
        "save-text",
        "save-text",
        "restore",
        "trash",
        "exclusion",
        "clear",
        "index",
      ]);
    });
  });

  describe("edits between the split and Undo", () => {
    it("keeps an edit of the original in a preserved revision of the original", async () => {
      const id = await makeDoc();
      await splitOk(id);
      const edited = await editDocument(
        id,
        "Edited original, written after the split",
      );
      await undoOk();
      expect(await preservedContents(id)).toContain(edited);
      expect(
        tiptapToPlainText(
          JSON.parse((await canonicalOf(id)).content) as TipTapDocument,
        ),
      ).toContain("Alpha");
    });

    it("keeps an edit of the split-off document in a preserved revision of the trashed document", async () => {
      const id = await makeDoc();
      const { newId } = await splitOk(id);
      const edited = await editDocument(
        newId,
        "Edited split-off text after the split",
      );
      await undoOk();
      expect(await preservedContents(newId, ".trash/revisions")).toContain(
        edited,
      );
    });

    it("saves both documents' current text as preserved revisions even when nothing was edited", async () => {
      const id = await makeDoc();
      const { newId } = await splitOk(id);
      const originalNow = (await canonicalOf(id)).content;
      const splitOffNow = (await canonicalOf(newId)).content;
      const result = await undoOk();
      expect(result.preservedRevisions.map((r) => r.documentId).sort()).toEqual(
        [id, newId].sort(),
      );
      expect(await preservedContents(id)).toContain(originalNow);
      expect(await preservedContents(newId, ".trash/revisions")).toContain(
        splitOffNow,
      );
    });

    it("keeps a note body written after the split: on the original, or in the trashed document", async () => {
      const id = await makeDoc();
      const { newId } = await splitOk(id);
      await mutateSidecar(projectPath, id, (current) => ({
        ...(current ?? {}),
        annotations: [
          ...((current?.annotations as Annotation[] | undefined) ?? []),
          annotation(ID.laterOriginal, "written on the original"),
        ] as never,
      }));
      await mutateSidecar(projectPath, newId, (current) => ({
        ...(current ?? {}),
        annotations: [
          ...((current?.annotations as Annotation[] | undefined) ?? []),
          annotation(ID.later, "written on the split-off"),
        ] as never,
      }));
      await flushIndexer();
      await undoOk();
      const original = (await readSidecar(projectPath, id)) as Record<
        string,
        unknown
      >;
      const trashed = await readJson(`.trash/meta/resource-${newId}.meta.json`);
      const bodies = [
        ...(original.annotations as Annotation[]),
        ...((trashed.annotations as Annotation[] | undefined) ?? []),
      ].map((a) => a.body);
      for (const a of ANNOTATIONS) expect(bodies).toContain(a.body);
      expect(bodies).toContain("written on the original");
      expect(bodies).toContain("written on the split-off");
      expect((original.annotations as Annotation[]).map((a) => a.id)).toContain(
        ID.laterOriginal,
      );
      expect(
        ((trashed.annotations as Annotation[]) ?? []).map((a) => a.id),
      ).toEqual([ID.later]);
    });
  });

  describe("from the stored record only", () => {
    it("works after a reload: modules are reloaded and the record is read from disk", async () => {
      const id = await makeDoc();
      const before = (await canonicalOf(id)).content;
      const { newId } = await splitOk(id);
      await flushIndexer();
      vi.resetModules();
      const fresh = await import("../../src/lib/models/split-undo-core");
      const result = await fresh.undoLatestSplit(projectId);
      expect(result.outcome).toBe("applied");
      expect((await canonicalOf(id)).content).toBe(before);
      expect(await exists(`.trash/meta/resource-${newId}.meta.json`)).toBe(
        true,
      );
    });
  });

  describe("a split-off document already out of the tree", () => {
    it("makes the Trash step a no-op for a document already in Trash, and never purges it", async () => {
      const id = await makeDoc();
      const { newId } = await splitOk(id);
      await deleteResourceCore(projectId, newId);
      await flushIndexer();
      const trashedBefore = await subtree(`.trash/revisions/${newId}`);
      const sidecarBefore = await subtree(
        `.trash/meta/resource-${newId}.meta.json`,
      );
      const del = vi.spyOn(resourceCrud, "deleteResourceCore");
      const result = await undoOk();
      expect(result.splitOffState).toBe("was-in-trash");
      expect(del).not.toHaveBeenCalled();
      expect(await subtree(`.trash/revisions/${newId}`)).toEqual(trashedBefore);
      expect(await subtree(`.trash/meta/resource-${newId}.meta.json`)).toEqual(
        sidecarBefore,
      );
      expect(result.preservedRevisions.map((r) => r.documentId)).toEqual([id]);
      const original = (await readSidecar(projectPath, id)) as Record<
        string,
        unknown
      >;
      expect(
        (original.annotations as Annotation[]).map((a) => a.id).sort(),
      ).toEqual(ANNOTATIONS.map((a) => a.id).sort());
    });

    it("treats a purged split-off document as nothing left to trash", async () => {
      const id = await makeDoc();
      const before = (await canonicalOf(id)).content;
      const { newId } = await splitOk(id);
      await softDeleteResource(projectPath, newId);
      await purgeResource(projectPath, newId);
      const result = await undoOk();
      expect(result.splitOffState).toBe("was-purged");
      expect((await canonicalOf(id)).content).toBe(before);
      expect(result.movedAnnotationIds).toEqual([]);
    });
  });

  describe("refusals change nothing", () => {
    async function expectRefused(
      reason: keyof typeof SPLIT_UNDO_REFUSAL_MESSAGES,
    ): Promise<void> {
      const before = await dirSnapshot();
      const result = await undoLatestSplit(projectId);
      expect(result).toEqual({
        outcome: "refused",
        reason,
        message: SPLIT_UNDO_REFUSAL_MESSAGES[reason],
      });
      expect(await dirSnapshot()).toEqual(before);
      expect(await records.readLatestOperation(projectPath)).toMatchObject({
        outcome: "found",
      });
    }

    it("refuses when the original is in Trash", async () => {
      const id = await makeDoc();
      await splitOk(id);
      await deleteResourceCore(projectId, id);
      await expectRefused("original-in-trash");
    });

    it("refuses when the original has been permanently removed", async () => {
      const id = await makeDoc();
      await splitOk(id);
      await softDeleteResource(projectPath, id);
      await purgeResource(projectPath, id);
      await expectRefused("original-purged");
    });

    it("refuses when the snapshot revision is gone", async () => {
      const id = await makeDoc();
      const { snapshotId } = await splitOk(id);
      await setRevisionPreserve(projectPath, id, snapshotId, false);
      await deleteRevision(projectPath, id, snapshotId);
      await expectRefused("snapshot-gone");
    });

    it("refuses when the split-off document has been split since", async () => {
      const id = await makeDoc();
      await splitOk(id);
      const first = (await records.readLatestOperation(projectPath)) as {
        outcome: "found";
        record: LatestOperationRecord & { kind: "split" };
      };
      const second = await splitOk(
        first.record.newDocumentId,
        tiptapToPlainText(
          JSON.parse(
            (await canonicalOf(first.record.newDocumentId)).content,
          ) as TipTapDocument,
        ).indexOf("Eta") + 3,
      );
      expect(second.newId).not.toBe(first.record.newDocumentId);
      // The later split replaced the record; put the first one back, as a
      // stale record would stand.
      await records.writeLatestOperation(projectPath, first.record);
      await expectRefused("split-off-split-since");
    });

    it("names each cause by its own text", () => {
      const texts = Object.values(SPLIT_UNDO_REFUSAL_MESSAGES);
      expect(new Set(texts).size).toBe(texts.length);
    });

    it("answers could-not-be-checked, not a refusal, when the original's sidecar cannot be read", async () => {
      const id = await makeDoc();
      await splitOk(id);
      await fs.writeFile(
        path.join(projectPath, "meta", `resource-${id}.meta.json`),
        "{ broken",
      );
      const before = await dirSnapshot();
      const result = await undoLatestSplit(projectId);
      expect(result.outcome).toBe("could-not-be-checked");
      expect(await dirSnapshot()).toEqual(before);
    });
  });

  describe("after the writes", () => {
    it("brings only the original's indexes up to date, after the record is cleared", async () => {
      const id = await makeDoc();
      await splitOk(id);
      const update = vi.spyOn(indexUpdate, "updateDocumentIndexes");
      await undoOk();
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1]).toEqual([id]);
    });

    it("reports an index failure without rolling back", async () => {
      const id = await makeDoc();
      const before = (await canonicalOf(id)).content;
      const { newId } = await splitOk(id);
      vi.spyOn(indexUpdate, "updateDocumentIndexes").mockResolvedValue({
        outcome: "failed",
        failures: [{ documentId: id, step: "inverted-index" }],
      });
      const result = await undoLatestSplit(projectId);
      expect(result).toMatchObject({
        outcome: "index-failed",
        failures: [{ documentId: id, step: "inverted-index" }],
      });
      expect((await canonicalOf(id)).content).toBe(before);
      expect(await exists(`.trash/meta/resource-${newId}.meta.json`)).toBe(
        true,
      );
      expect(await exists("meta/latest-operation.json")).toBe(false);
    });
  });

  describe("a failed step is returned, never success", () => {
    it("names the step when the record cannot be cleared", async () => {
      const id = await makeDoc();
      await splitOk(id);
      vi.spyOn(records, "clearLatestOperation").mockRejectedValue(
        new Error("injected"),
      );
      const result = await undoLatestSplit(projectId);
      expect(result).toMatchObject({
        outcome: "failed",
        failedStep: "clear-record",
        cause: "Error",
      });
    });
  });

  describe("overlapping calls", () => {
    it("ends with one applied and one answered as nothing to undo", async () => {
      const id = await makeDoc();
      await splitOk(id);
      const results = await Promise.all([
        undoLatestSplit(projectId),
        undoLatestSplit(projectId),
      ]);
      expect(results.map((r) => r.outcome).sort()).toEqual([
        "applied",
        "nothing-to-undo",
      ]);
      expect(
        (await listRevisions(projectPath, id)).filter((r) => r.isCanonical),
      ).toHaveLength(1);
    });
  });
});
