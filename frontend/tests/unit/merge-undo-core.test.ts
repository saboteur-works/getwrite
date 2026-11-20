/**
 * Feature 121, Task 38: Undo merge, forward path and refusals (FR-22).
 * Real-directory tests: the merge is made by `applyMerge`, so the stored
 * record is the one Task 25 writes. Rollback of a failed Undo is Task 39 and
 * is not asserted here.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as indexUpdate from "../../src/lib/models/split-index-update";
import * as records from "../../src/lib/models/split-records-core";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { mutateSidecar, readSidecar } from "../../src/lib/models/sidecar";
import { listRevisions } from "../../src/lib/models/revision";
import {
  deleteRevision,
  readRevision,
  setRevisionPreserve,
  updateRevisionInPlace,
} from "../../src/lib/models/revision-core";
import { purgeResource, softDeleteResource } from "../../src/lib/models/trash";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import { countWords } from "../../src/lib/word-count";
import type {
  Annotation,
  MetadataValue,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";
import { hashSplitContent } from "../../src/lib/models/split-preview-core";
import {
  applyMerge,
  type MergeApplyRequest,
} from "../../src/lib/models/merge-core";
import { applySplit } from "../../src/lib/models/split-core";
import {
  undoLatestOperation,
  undoLatestSplit,
  type MergeUndoResult,
} from "../../src/lib/models/split-undo-core";
import { MERGE_UNDO_REFUSAL_MESSAGES } from "../../src/lib/models/merge-undo-messages";
import {
  MERGED_MARK_SIDECAR_KEY,
  type MergeCarryOverChoice,
} from "../../src/lib/models/merge-types";

const NOVEL_SPEC = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

const NO_CARRY: MergeCarryOverChoice = {
  annotationIds: [],
  fields: [],
  unitedMultiselectFields: [],
};

function para(text: string, runs?: TipTapNode[]): TipTapNode {
  return {
    type: "paragraph",
    attrs: { id: generateUUID() },
    content: runs ?? (text === "" ? [] : [{ type: "text", text }]),
  } as TipTapNode;
}

function docOf(...paragraphs: string[]): TipTapDocument {
  return { type: "doc", content: paragraphs.map((p) => para(p)) };
}

function annotation(id: string, body: string): Annotation {
  return {
    id,
    body,
    quote: `quote of ${body}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Annotation;
}

describe("undo of a merge on a real project", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-merge-undo-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Merge Undo",
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
    orderIndex: number,
    doc: TipTapDocument = docOf(`Text of ${name}.`),
    annotations?: Annotation[],
  ): Promise<string> {
    const resource = await createResourceCore(projectId, {
      name,
      type: "text",
      text: { tiptap: doc },
    });
    await mutateSidecar(projectPath, resource.id, (current) => ({
      ...(current ?? {}),
      orderIndex,
      ...(annotations
        ? { annotations: annotations as unknown as MetadataValue }
        : {}),
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
    ids: string[],
    carryOver: Partial<MergeCarryOverChoice> = {},
  ): Promise<MergeApplyRequest> {
    const documents = await Promise.all(
      ids.map(async (resourceId) => {
        const { revisionId, content } = await canonicalOf(resourceId);
        return {
          resourceId,
          revisionId,
          contentHash: hashSplitContent(content),
        };
      }),
    );
    return { documents, carryOver: { ...NO_CARRY, ...carryOver } };
  }

  async function mergeOk(
    ids: string[],
    carryOver: Partial<MergeCarryOverChoice> = {},
  ): Promise<void> {
    const result = await applyMerge(
      projectId,
      await requestFor(ids, carryOver),
    );
    if (result.outcome !== "applied") throw new Error(JSON.stringify(result));
    await flushIndexer();
  }

  async function undoMerge(): Promise<MergeUndoResult> {
    const result = await undoLatestOperation(projectId);
    return result as MergeUndoResult;
  }

  async function undoOk(): Promise<
    Extract<MergeUndoResult, { outcome: "applied" }>
  > {
    const result = await undoMerge();
    if (result.outcome !== "applied") throw new Error(JSON.stringify(result));
    return result;
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 2; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      await flushIndexer();
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
    }
    await flushIndexer();
  }

  async function dirSnapshot(prefix = ""): Promise<Map<string, string>> {
    await settle();
    const out = new Map<string, string>();
    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        const rel = path.relative(projectPath, p);
        if (e.isDirectory()) {
          out.set(`${rel}/`, "");
          await walk(p);
        } else out.set(rel, await fs.readFile(p, "utf8"));
      }
    }
    await walk(path.join(projectPath, prefix));
    return out;
  }

  async function sidecarOf(id: string): Promise<Record<string, unknown>> {
    return JSON.parse(
      await fs.readFile(
        path.join(projectPath, "meta", `resource-${id}.meta.json`),
        "utf8",
      ),
    ) as Record<string, unknown>;
  }

  async function edit(id: string, text: string): Promise<string> {
    const { revisionId } = await canonicalOf(id);
    const content = JSON.stringify(docOf(text));
    await updateRevisionInPlace(projectPath, id, revisionId, content);
    await flushIndexer();
    return content;
  }

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
      if (meta.metadata?.preserve === true) {
        out.push(
          await fs.readFile(path.join(dir, name, "content.bin"), "utf8"),
        );
      }
    }
    return out;
  }

  async function trio(): Promise<{ t: string; a: string; b: string }> {
    const t = await makeDoc("T", 0);
    const a = await makeDoc("A", 1);
    const b = await makeDoc("B", 2);
    return { t, a, b };
  }

  describe("a merge undone", () => {
    it("puts every document's text back, clears every mark and the record, and keeps each current text in a preserved revision", async () => {
      const { t, a, b } = await trio();
      const before = new Map<string, string>();
      for (const id of [t, a, b])
        before.set(id, (await canonicalOf(id)).content);
      await mergeOk([t, a, b]);
      expect((await canonicalOf(t)).content).not.toBe(before.get(t));
      const mergedTarget = (await canonicalOf(t)).content;

      const result = await undoOk();

      for (const id of [t, a, b]) {
        expect((await canonicalOf(id)).content).toBe(before.get(id));
      }
      for (const id of [a, b]) {
        expect(await sidecarOf(id)).not.toHaveProperty(MERGED_MARK_SIDECAR_KEY);
      }
      expect(await records.readLatestOperation(projectPath)).toEqual({
        outcome: "none",
      });
      expect(result.targetDocumentId).toBe(t);
      expect(result.absorbedDocumentIds).toEqual([a, b]);
      expect(result.preservedRevisions.map((r) => r.documentId)).toEqual([
        t,
        a,
        b,
      ]);
      expect(await preservedContents(t)).toContain(mergedTarget);
      for (const ref of result.preservedRevisions) {
        const revisions = await listRevisions(projectPath, ref.documentId);
        const saved = revisions.find((r) => r.id === ref.revisionId);
        expect(saved?.isCanonical).toBe(false);
        expect(saved?.metadata?.preserve).toBe(true);
      }
    });

    it("does not leave the target's merged text only in a place Undo made unreachable: wordCount and derived files follow the restored text", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      await undoOk();
      await flushIndexer();
      const stored = (await canonicalOf(t)).content;
      const plain = tiptapToPlainText(JSON.parse(stored) as TipTapDocument);
      expect((await sidecarOf(t)).wordCount).toBe(countWords(plain));
      expect(
        await fs.readFile(
          path.join(projectPath, "resources", t, "content.txt"),
          "utf8",
        ),
      ).toBe(plain);
    });

    it("reports the target's name (Task 40: the route and client show it)", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      const result = await undoOk();
      expect(result.targetName).toBe("T");
    });

    it("keeps an edit made to the target since the merge in a preserved revision of the target", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      const edited = await edit(
        t,
        "Words typed into the target after the merge",
      );
      await undoOk();
      expect(await preservedContents(t)).toContain(edited);
      expect((await canonicalOf(t)).content).not.toBe(edited);
    });

    it("keeps an edit made to an absorbed document since the merge in a preserved revision of that document", async () => {
      const { t, a, b } = await trio();
      await mergeOk([t, a, b]);
      const edited = await edit(a, "Words typed into an absorbed document");
      const result = await undoOk();
      expect(await preservedContents(a)).toContain(edited);
      expect((await canonicalOf(a)).content).not.toBe(edited);
      expect(result.preservedRevisions.map((r) => r.documentId)).toContain(a);
    });

    it("is not refused when both the target and an absorbed document were edited since", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      const targetEdit = await edit(t, "target edit");
      const absorbedEdit = await edit(a, "absorbed edit");
      await undoOk();
      expect(await preservedContents(t)).toContain(targetEdit);
      expect(await preservedContents(a)).toContain(absorbedEdit);
    });

    it("moves a chosen note back to its absorbed document with its mark, and off the target", async () => {
      const noteId = generateUUID();
      const t = await makeDoc("T", 0);
      const a = await makeDoc(
        "A",
        1,
        {
          type: "doc",
          content: [
            para("", [
              { type: "text", text: "plain " },
              {
                type: "text",
                text: "marked",
                marks: [{ type: "annotation", attrs: { id: noteId } }],
              },
            ]),
          ],
        } as TipTapDocument,
        [annotation(noteId, "a chosen note")],
      );
      const beforeA = (await canonicalOf(a)).content;
      await mergeOk([t, a], { annotationIds: [noteId] });
      const targetNotes = ((await sidecarOf(t)).annotations ??
        []) as Annotation[];
      expect(targetNotes.map((n) => n.id)).toContain(noteId);

      const result = await undoOk();

      expect(result.movedAnnotationIds).toEqual([noteId]);
      const onA = ((await sidecarOf(a)).annotations ?? []) as Annotation[];
      expect(onA.map((n) => n.id)).toEqual([noteId]);
      expect(onA[0].body).toBe("a chosen note");
      const onT = ((await sidecarOf(t)).annotations ?? []) as Annotation[];
      expect(onT.map((n) => n.id)).not.toContain(noteId);
      expect((await canonicalOf(a)).content).toBe(beforeA);
    });

    it("leaves a note that was not chosen where it was", async () => {
      const noteId = generateUUID();
      const t = await makeDoc("T", 0);
      const a = await makeDoc("A", 1, docOf("body"), [annotation(noteId, "n")]);
      await mergeOk([t, a]);
      await undoOk();
      const onA = ((await sidecarOf(a)).annotations ?? []) as Annotation[];
      expect(onA.map((n) => n.id)).toEqual([noteId]);
    });

    it("leaves the writing-log directory byte-identical across Undo", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      await edit(t, "an edit that the writing log may record");
      await edit(a, "another edit");
      const before = await dirSnapshot("meta/writing-log");
      await undoOk();
      expect(await dirSnapshot("meta/writing-log")).toEqual(before);
    });

    it("works from the stored record alone: the record on disk is a merge record and Undo takes no argument but the project", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      const raw = JSON.parse(
        await fs.readFile(
          path.join(projectPath, "meta", "latest-operation.json"),
          "utf8",
        ),
      ) as { kind: string };
      expect(raw.kind).toBe("merge");
      const result = await undoLatestOperation(projectId);
      expect(result.outcome).toBe("applied");
      expect(await undoMerge()).toEqual({ outcome: "nothing-to-undo" });
    });

    it("reports an index failure without undoing the Undo", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      const before = (await canonicalOf(t)).content;
      void before;
      vi.spyOn(indexUpdate, "updateDocumentIndexes").mockResolvedValue({
        outcome: "failed",
        failures: [{ step: "inverted-index", cause: "boom" }],
      } as never);
      const result = await undoMerge();
      expect(result.outcome).toBe("index-failed");
      expect(await records.readLatestOperation(projectPath)).toEqual({
        outcome: "none",
      });
      expect(await sidecarOf(a)).not.toHaveProperty(MERGED_MARK_SIDECAR_KEY);
    });
  });

  describe("refusals change nothing", () => {
    it("refuses when the target is in the Trash", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      await softDeleteResource(projectPath, t);
      const before = await dirSnapshot();
      const result = await undoMerge();
      expect(result).toMatchObject({
        outcome: "refused",
        operation: "merge",
        reason: "target-in-trash",
        message: MERGE_UNDO_REFUSAL_MESSAGES["target-in-trash"],
        documentId: t,
      });
      expect(await dirSnapshot()).toEqual(before);
    });

    it("refuses when the target is purged", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      await softDeleteResource(projectPath, t);
      await purgeResource(projectPath, t);
      const before = await dirSnapshot();
      const result = await undoMerge();
      expect(result).toMatchObject({
        outcome: "refused",
        reason: "target-purged",
        message: MERGE_UNDO_REFUSAL_MESSAGES["target-purged"],
      });
      expect(await dirSnapshot()).toEqual(before);
    });

    it("refuses when the target's snapshot is no longer kept", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      const snapshot = (await listRevisions(projectPath, t)).find(
        (r) => r.metadata?.mergeSnapshot,
      );
      await setRevisionPreserve(projectPath, t, snapshot?.id ?? "", false);
      await deleteRevision(projectPath, t, snapshot?.id ?? "");
      const before = await dirSnapshot();
      const result = await undoMerge();
      expect(result).toMatchObject({
        outcome: "refused",
        reason: "snapshot-gone",
        message: MERGE_UNDO_REFUSAL_MESSAGES["snapshot-gone"],
        documentId: t,
      });
      expect(await dirSnapshot()).toEqual(before);
    });

    it("refuses when an absorbed document's snapshot is no longer kept", async () => {
      const { t, a, b } = await trio();
      await mergeOk([t, a, b]);
      const snapshot = (await listRevisions(projectPath, b)).find(
        (r) => r.metadata?.mergeSnapshot,
      );
      await setRevisionPreserve(projectPath, b, snapshot?.id ?? "", false);
      await deleteRevision(projectPath, b, snapshot?.id ?? "");
      const before = await dirSnapshot();
      const result = await undoMerge();
      expect(result).toMatchObject({
        outcome: "refused",
        reason: "absorbed-snapshot-gone",
        documentId: b,
      });
      expect(await dirSnapshot()).toEqual(before);
    });

    it("gives each refusal cause its own text", () => {
      const texts = Object.values(MERGE_UNDO_REFUSAL_MESSAGES);
      expect(new Set(texts).size).toBe(texts.length);
    });
  });

  describe("an absorbed document that is gone", () => {
    it("leaves an absorbed document in the Trash alone, never purges it, and undoes the rest", async () => {
      const { t, a, b } = await trio();
      const beforeT = (await canonicalOf(t)).content;
      const beforeB = (await canonicalOf(b)).content;
      await mergeOk([t, a, b]);
      await softDeleteResource(projectPath, a);
      const trashedBefore = await dirSnapshot(".trash");

      const result = await undoOk();

      expect(result.skippedDocuments).toEqual([
        { documentId: a, state: "in-trash" },
      ]);
      expect(await dirSnapshot(".trash")).toEqual(trashedBefore);
      expect((await canonicalOf(t)).content).toBe(beforeT);
      expect((await canonicalOf(b)).content).toBe(beforeB);
      expect(await sidecarOf(b)).not.toHaveProperty(MERGED_MARK_SIDECAR_KEY);
      expect(result.preservedRevisions.map((r) => r.documentId)).toEqual([
        t,
        b,
      ]);
    });

    it("treats a purged absorbed document as a no-op for that document", async () => {
      const { t, a, b } = await trio();
      const beforeT = (await canonicalOf(t)).content;
      await mergeOk([t, a, b]);
      await softDeleteResource(projectPath, a);
      await purgeResource(projectPath, a);

      const result = await undoOk();

      expect(result.skippedDocuments).toEqual([
        { documentId: a, state: "purged" },
      ]);
      expect((await canonicalOf(t)).content).toBe(beforeT);
      await expect(readSidecar(projectPath, a)).resolves.toBeNull();
      await expect(
        fs.stat(
          path.join(projectPath, ".trash", "meta", `resource-${a}.meta.json`),
        ),
      ).rejects.toThrow();
    });
  });

  describe("dispatch on the record's kind", () => {
    it("undoes a split and a merge, each through the same entry", async () => {
      const t = await makeDoc("T", 0);
      const a = await makeDoc("A", 1);
      await mergeOk([t, a]);
      const merged = await undoLatestOperation(projectId);
      expect(merged).toMatchObject({ outcome: "applied", operation: "merge" });

      const doc = docOf("First part of the text.", "Second part of the text.");
      const s = await makeDoc("S", 3, doc);
      const { revisionId, content } = await canonicalOf(s);
      const split = await applySplit(projectId, {
        resourceId: s,
        revisionId,
        contentHash: hashSplitContent(content),
        offset: tiptapToPlainText(doc).indexOf("Second"),
        carryOver: { annotationIds: [], fields: [], newName: "" },
      });
      if (split.outcome !== "applied") throw new Error(JSON.stringify(split));
      const undone = await undoLatestOperation(projectId);
      expect(undone).toMatchObject({
        outcome: "applied",
        originalDocumentId: s,
        splitOffDocumentId: split.newDocumentId,
      });
      expect(undone).not.toHaveProperty("operation");
    });

    it("answers nothing-to-undo with no record", async () => {
      expect(await undoLatestOperation(projectId)).toEqual({
        outcome: "nothing-to-undo",
      });
    });

    it("reports a malformed merge record as could-not-be-checked and changes nothing", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      const file = path.join(projectPath, "meta", "latest-operation.json");
      const record = JSON.parse(await fs.readFile(file, "utf8")) as {
        snapshotRevisions: unknown[];
        newDocumentId?: string;
      };
      record.snapshotRevisions = record.snapshotRevisions.slice(0, 1);
      record.newDocumentId = a;
      await fs.writeFile(file, JSON.stringify(record));
      const before = await dirSnapshot();
      expect(await undoMerge()).toEqual({
        outcome: "could-not-be-checked",
        cause: "record-malformed",
      });
      expect(await dirSnapshot()).toEqual(before);
    });

    it("keeps undoLatestSplit answering unsupported-operation for a merge record", async () => {
      const { t, a } = await trio();
      await mergeOk([t, a]);
      expect(await undoLatestSplit(projectId)).toEqual({
        outcome: "unsupported-operation",
        kind: "merge",
      });
    });
  });
});
