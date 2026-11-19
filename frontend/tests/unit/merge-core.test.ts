/**
 * Feature 121, Task 25: the merge apply core (FR-3 to FR-10, FR-6 forward
 * path, FR-8, FR-21). Real-directory tests: a project is scaffolded, documents
 * with annotations and metadata are written, and the merge runs against them.
 * Reverse compensation is Task 26 and is not asserted here.
 *
 * `tests/setup.ts` installs the Feature 93 lock-order guard for every file, so
 * a non-reentrant lock nested by the merge throws `LockOrderViolationError`
 * and fails a test below.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as locks from "../../src/lib/models/locks";
import * as sidecarModule from "../../src/lib/models/sidecar";
import * as revisionCore from "../../src/lib/models/revision-core";
import * as records from "../../src/lib/models/split-records-core";
import * as markCore from "../../src/lib/models/merge-mark-core";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { listRevisions } from "../../src/lib/models/revision";
import { readRevision } from "../../src/lib/models/revision-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import type {
  Annotation,
  MetadataValue,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";
import {
  hashSplitContent,
  revisionContentLockKey,
} from "../../src/lib/models/split-preview-core";
import {
  applyMerge,
  type MergeApplyRequest,
  type MergeApplyResult,
} from "../../src/lib/models/merge-core";
import { MERGE_DOCUMENT_CAP } from "../../src/lib/models/merge-limits";
import {
  MERGE_REFUSAL_REASONS,
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

const NOW = new Date("2026-11-19T08:30:15.123Z");

function para(text: string, runs?: TipTapNode[]): TipTapNode {
  return {
    type: "paragraph",
    attrs: { id: generateUUID() },
    content: runs ?? (text === "" ? [] : [{ type: "text", text }]),
  } as TipTapNode;
}

function markedRun(id: string, text: string): TipTapNode {
  return { type: "text", text, marks: [{ type: "annotation", attrs: { id } }] };
}

function docOf(...paragraphs: string[]): TipTapDocument {
  return { type: "doc", content: paragraphs.map((p) => para(p)) };
}

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

function nodeIds(node: unknown, into: string[] = []): string[] {
  if (typeof node !== "object" || node === null) return into;
  const n = node as { attrs?: { id?: unknown }; content?: unknown[] };
  if (typeof n.attrs?.id === "string") into.push(n.attrs.id);
  for (const child of n.content ?? []) nodeIds(child, into);
  return into;
}

const NO_CARRY: MergeCarryOverChoice = {
  annotationIds: [],
  fields: [],
  unitedMultiselectFields: [],
};

describe("merge apply on a real project", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-merge-core-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Merge Core",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await flushIndexer();
    if (previousEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousEnv;
    await removeDirRetry(tmp);
  });

  interface DocOpts {
    name: string;
    doc?: TipTapDocument;
    orderIndex?: number;
    annotations?: Annotation[];
    userMetadata?: Record<string, MetadataValue>;
  }

  async function makeDoc(opts: DocOpts): Promise<string> {
    const resource = await createResourceCore(projectId, {
      name: opts.name,
      type: "text",
      text: { tiptap: opts.doc ?? docOf(`Text of ${opts.name}.`) },
    });
    await sidecarModule.mutateSidecar(projectPath, resource.id, (current) => {
      const next: Record<string, MetadataValue> = { ...(current ?? {}) };
      if (opts.orderIndex !== undefined) next.orderIndex = opts.orderIndex;
      if (opts.annotations)
        next.annotations = opts.annotations as unknown as MetadataValue;
      if (opts.userMetadata) next.userMetadata = opts.userMetadata;
      return next;
    });
    await flushIndexer();
    return resource.id;
  }

  async function refFor(
    resourceId: string,
  ): Promise<{ resourceId: string; revisionId: string; contentHash: string }> {
    const canonical = (await listRevisions(projectPath, resourceId)).find(
      (r) => r.isCanonical,
    );
    if (!canonical) throw new Error("no canonical revision in fixture");
    const { content } = await readRevision(
      projectPath,
      resourceId,
      canonical.id,
    );
    return {
      resourceId,
      revisionId: canonical.id,
      contentHash: hashSplitContent(content),
    };
  }

  async function requestFor(
    ids: string[],
    carryOver: Partial<MergeCarryOverChoice> = {},
  ): Promise<MergeApplyRequest> {
    return {
      documents: await Promise.all(ids.map(refFor)),
      carryOver: { ...NO_CARRY, ...carryOver },
    };
  }

  async function applyOk(
    request: MergeApplyRequest,
  ): Promise<Extract<MergeApplyResult, { outcome: "applied" }>> {
    const result = await applyMerge(projectId, request, { now: () => NOW });
    if (result.outcome !== "applied") throw new Error(JSON.stringify(result));
    return result;
  }

  async function snapshot(): Promise<Map<string, string>> {
    await flushIndexer();
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

  async function readJson(rel: string): Promise<Record<string, unknown>> {
    return JSON.parse(
      await fs.readFile(path.join(projectPath, rel), "utf8"),
    ) as Record<string, unknown>;
  }

  async function sidecarOf(id: string): Promise<Record<string, unknown>> {
    return readJson(`meta/resource-${id}.meta.json`);
  }

  async function canonicalContent(id: string): Promise<TipTapDocument> {
    const canonical = (await listRevisions(projectPath, id)).find(
      (r) => r.isCanonical,
    );
    const { content } = await readRevision(
      projectPath,
      id,
      canonical?.id ?? "",
    );
    return JSON.parse(content) as TipTapDocument;
  }

  async function editProject(
    edit: (config: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    const file = path.join(projectPath, "project.json");
    const project = (await readJson("project.json")) as {
      config: Record<string, unknown>;
    };
    await fs.writeFile(
      file,
      JSON.stringify({ ...project, config: edit(project.config) }),
    );
  }

  /** Three documents: target T and absorbed A, B (appended in tree order A, B). */
  async function threeDocs(): Promise<{ t: string; a: string; b: string }> {
    const t = await makeDoc({ name: "T", orderIndex: 0 });
    const a = await makeDoc({ name: "A", orderIndex: 1 });
    const b = await makeDoc({ name: "B", orderIndex: 2 });
    return { t, a, b };
  }

  describe("the merged result", () => {
    it("keeps every revision, adds one preserved non-canonical snapshot per document, and leaves one canonical revision each", async () => {
      const { t, a, b } = await threeDocs();
      const before = new Map<string, string[]>();
      for (const id of [t, a, b])
        before.set(
          id,
          (await listRevisions(projectPath, id)).map((r) => r.id),
        );
      await applyOk(await requestFor([t, a, b]));
      for (const id of [t, a, b]) {
        const revisions = await listRevisions(projectPath, id);
        const ids = revisions.map((r) => r.id);
        for (const earlier of before.get(id) ?? [])
          expect(ids).toContain(earlier);
        const snapshots = revisions.filter((r) => r.metadata?.mergeSnapshot);
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].isCanonical).toBe(false);
        expect(snapshots[0].metadata).toMatchObject({
          name: "Before merge 2026-11-19",
          preserve: true,
          mergeSnapshot: true,
        });
        expect(revisions.length).toBe((before.get(id) ?? []).length + 1);
        expect(revisions.filter((r) => r.isCanonical)).toHaveLength(1);
      }
    });

    it("snapshots the full stored text of each document as it was before the merge", async () => {
      const { t, a, b } = await threeDocs();
      const stored = new Map<string, string>();
      for (const id of [t, a, b]) {
        const ref = await refFor(id);
        stored.set(
          id,
          (await readRevision(projectPath, id, ref.revisionId)).content,
        );
      }
      await applyOk(await requestFor([t, a, b]));
      for (const id of [t, a, b]) {
        const snap = (await listRevisions(projectPath, id)).find(
          (r) => r.metadata?.mergeSnapshot,
        );
        const { content } = await readRevision(projectPath, id, snap?.id ?? "");
        expect(content).toBe(stored.get(id));
      }
    });

    it("appends each absorbed text to the target in tree order with one empty paragraph at each joint", async () => {
      const t = await makeDoc({ name: "T", doc: docOf("target text") });
      // Selected B then A; tree order is A (1) then B (2).
      const b = await makeDoc({
        name: "B",
        doc: docOf("text of b"),
        orderIndex: 2,
      });
      const a = await makeDoc({
        name: "A",
        doc: docOf("text of a"),
        orderIndex: 1,
      });
      const result = await applyOk(await requestFor([t, b, a]));
      expect(result.targetDocumentId).toBe(t);
      expect(result.absorbedDocumentIds).toEqual([a, b]);
      const merged = await canonicalContent(t);
      const texts = (merged.content ?? []).map(
        (n) =>
          ((n.content ?? [])[0] as { text?: string } | undefined)?.text ?? "",
      );
      expect(texts).toEqual(["target text", "", "text of a", "", "text of b"]);
    });

    it("writes the mark on each absorbed document naming the target and the target's snapshot, with a full instant", async () => {
      const { t, a, b } = await threeDocs();
      await applyOk(await requestFor([t, a, b]));
      const targetSnapshot = (await listRevisions(projectPath, t)).find(
        (r) => r.metadata?.mergeSnapshot,
      );
      for (const id of [a, b]) {
        expect((await sidecarOf(id))[MERGED_MARK_SIDECAR_KEY]).toEqual({
          targetDocumentId: t,
          targetSnapshotRevisionId: targetSnapshot?.id,
          date: NOW.toISOString(),
        });
      }
      expect((await sidecarOf(t))[MERGED_MARK_SIDECAR_KEY]).toBeUndefined();
    });

    it("writes the latest-operation record last: target first, absorbed in append order, a snapshot for each", async () => {
      const t = await makeDoc({ name: "T" });
      const b = await makeDoc({ name: "B", orderIndex: 2 });
      const a = await makeDoc({ name: "A", orderIndex: 1 });
      await applyOk(await requestFor([t, b, a]));
      const record = (await readJson("meta/latest-operation.json")) as {
        kind: string;
        affectedDocumentIds: string[];
        snapshotRevisions: {
          documentId: string;
          revisionId: string;
          revisionNumber: number;
        }[];
        date: string;
        newDocumentId?: string;
      };
      expect(record.kind).toBe("merge");
      expect(record.newDocumentId).toBeUndefined();
      expect(record.affectedDocumentIds).toEqual([t, a, b]);
      expect(record.date).toBe(NOW.toISOString());
      for (const ref of record.snapshotRevisions) {
        const revision = (
          await listRevisions(projectPath, ref.documentId)
        ).find((r) => r.id === ref.revisionId);
        expect(revision?.versionNumber).toBe(ref.revisionNumber);
        expect(revision?.metadata?.mergeSnapshot).toBe(true);
      }
      expect(record.snapshotRevisions.map((s) => s.documentId).sort()).toEqual(
        [t, a, b].sort(),
      );
    });

    it("replaces an earlier latest-operation record", async () => {
      const { t, a, b } = await threeDocs();
      await records.writeLatestOperation(projectPath, {
        kind: "split",
        affectedDocumentIds: [t, a],
        snapshotRevisions: [],
        newDocumentId: a,
        date: "2026-01-01T00:00:00.000Z",
      });
      await applyOk(await requestFor([t, a, b]));
      expect((await readJson("meta/latest-operation.json")).kind).toBe("merge");
    });

    it("leaves the target's name, folder, position and unchosen values, moves and renames no absorbed document, and purges none", async () => {
      const t = await makeDoc({
        name: "Target name",
        orderIndex: 4,
        userMetadata: { status: "Draft", pov: "first" },
      });
      const a = await makeDoc({
        name: "A name",
        orderIndex: 5,
        userMetadata: { status: "Final", pov: "third" },
      });
      const sideBefore = { t: await sidecarOf(t), a: await sidecarOf(a) };
      await applyOk(await requestFor([t, a]));
      const tAfter = await sidecarOf(t);
      const aAfter = await sidecarOf(a);
      for (const key of ["name", "folderId", "orderIndex", "userMetadata"])
        expect(tAfter[key]).toEqual(sideBefore.t[key]);
      for (const key of ["name", "folderId", "orderIndex", "userMetadata"])
        expect(aAfter[key]).toEqual(sideBefore.a[key]);
      const files = await snapshot();
      expect([...files.keys()].some((k) => k.startsWith(".trash"))).toBe(false);
      expect(files.has(`meta/resource-${a}.meta.json`)).toBe(true);
    });

    it("writes nothing to compileDefaults", async () => {
      const { t, a, b } = await threeDocs();
      await editProject((config) => ({
        ...config,
        compileDefaults: { excludedResourceIds: [t] },
      }));
      await applyOk(await requestFor([t, a, b]));
      const config = (await readJson("project.json")).config as Record<
        string,
        unknown
      >;
      expect(config.compileDefaults).toEqual({ excludedResourceIds: [t] });
    });

    it("shares no node id between the target's stored text read from disk and any absorbed document's stored text", async () => {
      const t = await makeDoc({
        name: "T",
        doc: docOf("target one", "target two"),
      });
      const a = await makeDoc({
        name: "A",
        doc: docOf("a one", "a two"),
        orderIndex: 1,
      });
      const b = await makeDoc({
        name: "B",
        doc: docOf("b one"),
        orderIndex: 2,
      });
      await applyOk(await requestFor([t, a, b]));
      const targetIds = new Set(nodeIds(await canonicalContent(t)));
      expect(targetIds.size).toBeGreaterThan(0);
      for (const id of [a, b]) {
        const absorbedIds = nodeIds(await canonicalContent(id));
        expect(absorbedIds.length).toBeGreaterThan(0);
        expect(absorbedIds.filter((x) => targetIds.has(x))).toEqual([]);
      }
    });
  });

  describe("annotations and metadata", () => {
    it("moves the chosen annotations to the target and strips their marks from the absorbed text, leaving the unchosen ones", async () => {
      const moved = generateUUID();
      const kept = generateUUID();
      const t = await makeDoc({
        name: "T",
        annotations: [annotation("t1", "t")],
      });
      const a = await makeDoc({
        name: "A",
        orderIndex: 1,
        doc: {
          type: "doc",
          content: [
            para("", [
              markedRun(moved, "moved passage"),
              markedRun(kept, "kept passage"),
            ]),
          ],
        },
        annotations: [annotation(moved, "moved"), annotation(kept, "kept")],
      });
      await applyOk(await requestFor([t, a], { annotationIds: [moved] }));
      const tNotes = (await sidecarOf(t)).annotations as Annotation[];
      expect(tNotes.map((x) => x.id)).toEqual(["t1", moved]);
      const aNotes = (await sidecarOf(a)).annotations as Annotation[];
      expect(aNotes.map((x) => x.id)).toEqual([kept]);
      const aText = JSON.stringify(await canonicalContent(a));
      expect(aText).not.toContain(moved);
      expect(aText).toContain(kept);
      const tText = JSON.stringify(await canonicalContent(t));
      expect(tText).toContain(moved);
      expect(tText).not.toContain(kept);
    });

    it("leaves every annotation on its document when none is chosen", async () => {
      const id = generateUUID();
      const t = await makeDoc({ name: "T" });
      const a = await makeDoc({
        name: "A",
        orderIndex: 1,
        doc: { type: "doc", content: [para("", [markedRun(id, "passage")])] },
        annotations: [annotation(id, "stay")],
      });
      await applyOk(await requestFor([t, a]));
      expect(((await sidecarOf(a)).annotations as Annotation[]).length).toBe(1);
      expect((await sidecarOf(t)).annotations ?? []).toEqual([]);
      expect(JSON.stringify(await canonicalContent(a))).toContain(id);
      expect(JSON.stringify(await canonicalContent(t))).not.toContain(id);
    });

    it("refuses with the counts when the target could not hold the chosen annotations, writing nothing", async () => {
      const id = generateUUID();
      const existing = Array.from({ length: 499 }, (_, i) =>
        annotation(`t-${i}`, `t${i}`),
      );
      const t = await makeDoc({ name: "T", annotations: existing });
      const a = await makeDoc({
        name: "A",
        orderIndex: 1,
        doc: { type: "doc", content: [para("", [markedRun(id, "p")])] },
        annotations: [annotation(id, "x")],
      });
      const other = generateUUID();
      const b = await makeDoc({
        name: "B",
        orderIndex: 2,
        doc: { type: "doc", content: [para("", [markedRun(other, "q")])] },
        annotations: [annotation(other, "y")],
      });
      const request = await requestFor([t, a, b], {
        annotationIds: [id, other],
      });
      const before = await snapshot();
      const result = await applyMerge(projectId, request, { now: () => NOW });
      expect(result).toEqual({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.annotationLimit,
        documentId: null,
        annotationCounts: { existing: 499, incoming: 2, limit: 500 },
      });
      expect(await snapshot()).toEqual(before);
    });

    it("carries the chosen metadata values to the target and leaves the unchosen ones", async () => {
      const t = await makeDoc({
        name: "T",
        userMetadata: { status: "Draft", pov: "first" },
      });
      const a = await makeDoc({
        name: "A",
        orderIndex: 1,
        userMetadata: { status: "Final", pov: "third" },
      });
      await applyOk(
        await requestFor([t, a], {
          fields: [{ field: "status", sourceDocumentId: a }],
        }),
      );
      expect((await sidecarOf(t)).userMetadata).toEqual({
        status: "Final",
        pov: "first",
      });
      expect((await sidecarOf(a)).userMetadata).toEqual({
        status: "Final",
        pov: "third",
      });
    });

    it("leaves the target's metadata as it was when no field is chosen", async () => {
      const t = await makeDoc({ name: "T", userMetadata: { status: "Draft" } });
      const a = await makeDoc({
        name: "A",
        orderIndex: 1,
        userMetadata: { status: "Final" },
      });
      await applyOk(await requestFor([t, a]));
      expect((await sidecarOf(t)).userMetadata).toEqual({ status: "Draft" });
    });
  });

  describe("writing log and goals", () => {
    it("leaves the writing-log directory byte-identical, adds no Auto-backup revision and leaves the daily goal unchanged", async () => {
      const { t, a, b } = await threeDocs();
      const listLog = async (): Promise<Record<string, string>> => {
        const dir = path.join(projectPath, "meta", "writing-log");
        const names = await fs.readdir(dir).catch(() => [] as string[]);
        const out: Record<string, string> = {};
        for (const name of names.sort())
          out[name] = await fs.readFile(path.join(dir, name), "utf8");
        return out;
      };
      const logBefore = await listLog();
      const goalBefore = (
        (await readJson("project.json")).config as Record<string, unknown>
      ).dailyWordGoal;
      await applyOk(await requestFor([t, a, b]));
      expect(await listLog()).toEqual(logBefore);
      expect(
        ((await readJson("project.json")).config as Record<string, unknown>)
          .dailyWordGoal,
      ).toBe(goalBefore);
      for (const id of [t, a, b]) {
        const extra = (await listRevisions(projectPath, id)).filter(
          (r) =>
            !r.metadata?.mergeSnapshot &&
            JSON.stringify(r.metadata ?? {}).includes("Auto-backup"),
        );
        expect(extra).toEqual([]);
      }
    });
  });

  describe("order of writes and locks", () => {
    it("takes each document's revision lock once, in ascending id order, and takes no other lock by key", async () => {
      const { t, a, b } = await threeDocs();
      const acquire = vi.spyOn(locks, "acquireLock");
      await applyOk(await requestFor([t, a, b]));
      const keys = acquire.mock.calls.map((c) => c[0]);
      expect(keys).toEqual(
        [t, a, b].sort().map((id) => revisionContentLockKey(projectPath, id)),
      );
    });

    it("takes the locks in ascending id order whichever document is the target", async () => {
      const x = await makeDoc({ name: "X" });
      const y = await makeDoc({ name: "Y", orderIndex: 1 });
      const [low, high] = [x, y].sort();
      const acquire = vi.spyOn(locks, "acquireLock");
      await applyOk(await requestFor([high, low]));
      expect(acquire.mock.calls.map((c) => c[0])).toEqual([
        revisionContentLockKey(projectPath, low),
        revisionContentLockKey(projectPath, high),
      ]);
    });

    it("writes text only with the no-log write and lockHeld: true", async () => {
      const id = generateUUID();
      const t = await makeDoc({ name: "T" });
      const a = await makeDoc({
        name: "A",
        orderIndex: 1,
        doc: { type: "doc", content: [para("", [markedRun(id, "p")])] },
        annotations: [annotation(id, "n")],
      });
      const write = vi.spyOn(revisionCore, "writeCanonicalContentWithoutLog");
      await applyOk(await requestFor([t, a], { annotationIds: [id] }));
      // One strip for A, one append for T.
      expect(write.mock.calls.map((c) => c[1]).sort()).toEqual([t, a].sort());
      for (const call of write.mock.calls)
        expect(call[4]).toEqual({ lockHeld: true });
    });

    it("writes in the decided order: snapshots, annotations moved, marks, strips, append, latest-operation record", async () => {
      const id = generateUUID();
      const t = await makeDoc({ name: "T" });
      const a = await makeDoc({
        name: "A",
        orderIndex: 1,
        doc: { type: "doc", content: [para("", [markedRun(id, "p")])] },
        annotations: [annotation(id, "n")],
      });
      const b = await makeDoc({ name: "B", orderIndex: 2 });
      const calls: string[] = [];
      const wrap = <T extends object, K extends keyof T>(
        target: T,
        key: K,
        label: (...args: unknown[]) => string,
      ): void => {
        const original = target[key] as unknown as (...a: unknown[]) => unknown;
        vi.spyOn(target, key as never).mockImplementation(((
          ...args: unknown[]
        ) => {
          calls.push(label(...args));
          return original(...args);
        }) as never);
      };
      wrap(revisionCore, "createRevision", (_r, rid) => `snapshot:${rid}`);
      wrap(sidecarModule, "mutateSidecar", (_r, rid) => `sidecar:${rid}`);
      wrap(markCore, "writeMergedMark", (_r, rid) => `mark:${rid}`);
      wrap(
        revisionCore,
        "writeCanonicalContentWithoutLog",
        (_r, rid) => `text:${rid}`,
      );
      wrap(records, "writeLatestOperation", () => "record");
      await applyOk(await requestFor([t, a, b], { annotationIds: [id] }));

      const last = (label: string): number => calls.lastIndexOf(label);
      const first = (label: string): number => calls.indexOf(label);
      // (1) every snapshot precedes every other write.
      const lastSnapshot = Math.max(
        ...[t, a, b].map((x) => last(`snapshot:${x}`)),
      );
      expect(lastSnapshot).toBe(2);
      expect(first(`sidecar:${t}`)).toBeGreaterThan(lastSnapshot);
      // (2) annotations move (the target's sidecar and A's), before any mark.
      const firstMark = Math.min(first(`mark:${a}`), first(`mark:${b}`));
      expect(first(`sidecar:${t}`)).toBeLessThan(firstMark);
      expect(first(`sidecar:${a}`)).toBeLessThan(firstMark);
      // (3) marks, then the strip of A's text, then the append to T, then the record.
      expect(last(`mark:${a}`)).toBeLessThan(first(`text:${a}`));
      expect(last(`mark:${b}`)).toBeLessThan(first(`text:${a}`));
      expect(first(`text:${a}`)).toBeLessThan(first(`text:${t}`));
      expect(first(`text:${t}`)).toBeLessThan(first("record"));
      expect(calls[calls.length - 1]).toBe("record");
    });

    it("says in a comment that the claim holds under one writer instance per tenant", async () => {
      const source = await fs.readFile(
        path.join(process.cwd(), "src/lib/models/merge-core.ts"),
        "utf8",
      );
      expect(source).toMatch(/one writer instance per tenant/);
    });
  });

  describe("refusals and failures write nothing", () => {
    it("checks staleness inside the locks and refuses a text that changed while it waited", async () => {
      const { t, a } = await threeDocs();
      const request = await requestFor([t, a]);
      const held = await locks.acquireLock(
        revisionContentLockKey(projectPath, a),
      );
      const pending = applyMerge(projectId, request, { now: () => NOW });
      // The merge is now waiting on A's lock (T's was granted first or last by id).
      await new Promise((resolve) => setTimeout(resolve, 30));
      await revisionCore.writeCanonicalContentWithoutLog(
        projectPath,
        a,
        request.documents[1].revisionId,
        JSON.stringify(docOf("edited while the merge waited")),
        { lockHeld: true },
      );
      held();
      const result = await pending;
      expect(result).toEqual({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.staleContent,
        documentId: a,
      });
      for (const id of [t, a])
        expect(
          (await listRevisions(projectPath, id)).filter(
            (r) => r.metadata?.mergeSnapshot,
          ),
        ).toEqual([]);
      await expect(
        fs.stat(path.join(projectPath, "meta", "latest-operation.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("refuses a stale hash before any write", async () => {
      const { t, a } = await threeDocs();
      const request = await requestFor([t, a]);
      request.documents[0].contentHash = "0".repeat(64);
      const before = await snapshot();
      const result = await applyMerge(projectId, request, { now: () => NOW });
      expect(result).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.staleContent,
      });
      expect(await snapshot()).toEqual(before);
    });

    it("refuses a single document, an already merged document and a count over the cap, writing nothing", async () => {
      const { t, a, b } = await threeDocs();
      const before = await snapshot();
      const single = await applyMerge(projectId, await requestFor([t]), {
        now: () => NOW,
      });
      expect(single).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.fewerThanTwo,
      });
      const tooMany = await requestFor([t, a, b]);
      tooMany.documents = Array.from(
        { length: MERGE_DOCUMENT_CAP + 1 },
        () => tooMany.documents[0],
      );
      const over = await applyMerge(projectId, tooMany, { now: () => NOW });
      expect(over).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.tooManyDocuments,
      });
      expect(await snapshot()).toEqual(before);

      const request = await requestFor([t, a]);
      await applyOk(request);
      const after = await snapshot();
      const again = await applyMerge(projectId, await requestFor([b, a]), {
        now: () => NOW,
      });
      expect(again).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.mergedAbsorbed,
        documentId: a,
      });
      expect(await snapshot()).toEqual(after);
    });

    it("returns a failure for an id that is not a resource id, taking no lock", async () => {
      const { t, a } = await threeDocs();
      const request = await requestFor([t, a]);
      request.documents[1].resourceId = "../escape";
      const acquire = vi.spyOn(locks, "acquireLock");
      const result = await applyMerge(projectId, request, { now: () => NOW });
      expect(result.outcome).toBe("failed");
      expect(acquire).not.toHaveBeenCalled();
    });

    it("rethrows the locked-access error and writes nothing", async () => {
      const { t, a } = await threeDocs();
      const request = await requestFor([t, a]);
      const before = await snapshot();
      vi.spyOn(sidecarModule, "readSidecar").mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );
      await expect(
        applyMerge(projectId, request, { now: () => NOW }),
      ).rejects.toBeInstanceOf(ProjectLockedError);
      vi.restoreAllMocks();
      expect(await snapshot()).toEqual(before);
    });

    it("returns failed with the step that stopped it, never applied, and releases its locks", async () => {
      const { t, a, b } = await threeDocs();
      vi.spyOn(markCore, "writeMergedMark").mockRejectedValueOnce(
        new Error("disk gone"),
      );
      const result = await applyMerge(projectId, await requestFor([t, a, b]), {
        now: () => NOW,
      });
      expect(result).toMatchObject({
        outcome: "failed",
        failedStep: "write-marks",
        remainingState: "partially-written",
      });
      // A copy of each text precedes any change (the message promises it).
      for (const id of [t, a, b])
        expect(
          (await listRevisions(projectPath, id)).filter(
            (r) => r.metadata?.mergeSnapshot,
          ),
        ).toHaveLength(1);
      // The locks were released: taking each again does not wait.
      for (const id of [t, a, b]) {
        const release = await Promise.race([
          locks.acquireLock(revisionContentLockKey(projectPath, id)),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("lock still held")), 1000),
          ),
        ]);
        release();
      }
    });

    it("names the snapshot step when a snapshot cannot be written, before any other document write", async () => {
      const { t, a } = await threeDocs();
      vi.spyOn(revisionCore, "createRevision").mockRejectedValueOnce(
        new Error("disk gone"),
      );
      const result = await applyMerge(projectId, await requestFor([t, a]), {
        now: () => NOW,
      });
      expect(result).toMatchObject({
        outcome: "failed",
        failedStep: "snapshot",
      });
      expect((await sidecarOf(a))[MERGED_MARK_SIDECAR_KEY]).toBeUndefined();
      expect(JSON.stringify(await canonicalContent(t))).not.toContain(
        "Text of A.",
      );
    });

    it("returns a failure when a document's annotations changed after they were read", async () => {
      const id = generateUUID();
      const t = await makeDoc({ name: "T" });
      const a = await makeDoc({
        name: "A",
        orderIndex: 1,
        doc: { type: "doc", content: [para("", [markedRun(id, "p")])] },
        annotations: [annotation(id, "n")],
      });
      const request = await requestFor([t, a], { annotationIds: [id] });
      const real = sidecarModule.mutateSidecar;
      let isInjected = false;
      vi.spyOn(sidecarModule, "mutateSidecar").mockImplementation(((
        root: string,
        rid: string,
        fn: Parameters<typeof real>[2],
        opts?: Parameters<typeof real>[3],
      ) => {
        if (!isInjected && rid === a) {
          isInjected = true;
          return real(
            root,
            rid,
            (cur) => ({
              ...(cur ?? {}),
              annotations: [
                annotation(id, "n"),
                annotation(generateUUID(), "added meanwhile"),
              ] as unknown as MetadataValue,
            }),
            opts,
          ).then(() => real(root, rid, fn, opts));
        }
        return real(root, rid, fn, opts);
      }) as typeof real);
      const result = await applyMerge(projectId, request, { now: () => NOW });
      expect(result).toMatchObject({
        outcome: "failed",
        failedStep: "move-annotations",
      });
    });
  });

  describe("overlap", () => {
    const within = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timed out")), ms),
        ),
      ]);

    it("ends with one applied and one refused, none timed out, for two merges with swapped roles", async () => {
      const x = await makeDoc({ name: "X" });
      const y = await makeDoc({ name: "Y", orderIndex: 1 });
      const first = await requestFor([x, y]);
      const second = await requestFor([y, x]);
      const results = await within(
        Promise.all([
          applyMerge(projectId, first, { now: () => NOW }),
          applyMerge(projectId, second, { now: () => NOW }),
        ]),
        5000,
      );
      expect(results.map((r) => r.outcome).sort()).toEqual([
        "applied",
        "refused",
      ]);
      const snapshots = async (id: string): Promise<number> =>
        (await listRevisions(projectPath, id)).filter(
          (r) => r.metadata?.mergeSnapshot,
        ).length;
      expect((await snapshots(x)) + (await snapshots(y))).toBe(2);
    });

    it("ends with one applied and one refused for two merges that share an absorbed document", async () => {
      const x = await makeDoc({ name: "X" });
      const y = await makeDoc({ name: "Y", orderIndex: 1 });
      const z = await makeDoc({ name: "Z", orderIndex: 2 });
      const first = await requestFor([x, z]);
      const second = await requestFor([y, z]);
      const results = await within(
        Promise.all([
          applyMerge(projectId, first, { now: () => NOW }),
          applyMerge(projectId, second, { now: () => NOW }),
        ]),
        5000,
      );
      expect(results.map((r) => r.outcome).sort()).toEqual([
        "applied",
        "refused",
      ]);
      const record = await readJson("meta/latest-operation.json");
      expect(record.kind).toBe("merge");
    });

    it("ends with one applied and one refused for two identical concurrent merges", async () => {
      const { t, a } = await threeDocs();
      const request = await requestFor([t, a]);
      const results = await within(
        Promise.all([
          applyMerge(projectId, request, { now: () => NOW }),
          applyMerge(projectId, request, { now: () => NOW }),
        ]),
        5000,
      );
      expect(results.map((r) => r.outcome).sort()).toEqual([
        "applied",
        "refused",
      ]);
      expect(
        (await listRevisions(projectPath, t)).filter(
          (r) => r.metadata?.mergeSnapshot,
        ),
      ).toHaveLength(1);
    });
  });
});
