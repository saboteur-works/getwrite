/**
 * Feature 120, Task 20: the split apply, forward path (FR-3 to FR-8, FR-10,
 * FR-11, FR-16). Real-directory tests against a scaffolded project.
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
import * as savedDefaults from "../../src/lib/models/saved-defaults-core";
import * as newDocument from "../../src/lib/models/split-new-document";
import * as records from "../../src/lib/models/split-records-core";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { listRevisions } from "../../src/lib/models/revision";
import { readRevision } from "../../src/lib/models/revision-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
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
import {
  SPLIT_REFUSAL_REASONS,
  type LatestOperationRecord,
} from "../../src/lib/models/split-types";
import { SPLIT_COMPILE_EXCLUSION_NOTICE } from "../../src/lib/models/split-messages";

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
  source: "a0000000-0000-4000-8000-0000000000ff",
} as const;

const NODE_IDS = [
  "b0000000-0000-4000-8000-000000000001",
  "b0000000-0000-4000-8000-000000000002",
  "b0000000-0000-4000-8000-000000000003",
  "b0000000-0000-4000-8000-000000000004",
] as const;

function marked(text: string, id: string): TipTapNode {
  return {
    type: "text",
    text,
    marks: [{ type: "annotation", attrs: { id } }],
  } as TipTapNode;
}
const plain = (text: string): TipTapNode =>
  ({ type: "text", text }) as TipTapNode;
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

/** Every node id carried by a document. */
function nodeIds(doc: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as {
      attrs?: { id?: unknown };
      content?: unknown;
      type?: unknown;
    };
    if (typeof n.attrs?.id === "string" && n.type !== "text")
      out.push(n.attrs.id);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return out;
}

function markIds(doc: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as { marks?: unknown; content?: unknown };
    if (Array.isArray(n.marks))
      for (const m of n.marks as { type?: string; attrs?: { id?: string } }[])
        if (m.type === "annotation" && typeof m.attrs?.id === "string")
          out.add(m.attrs.id);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return out;
}

describe("applySplit on a real project", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-split-core-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Split Core",
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
    options: {
      doc?: TipTapDocument;
      annotations?: Annotation[];
      extra?: Record<string, unknown>;
      name?: string;
      orderIndex?: number;
    } = {},
  ): Promise<string> {
    const resource = await createResourceCore(projectId, {
      name: options.name ?? "Chapter 1",
      type: "text",
      orderIndex: options.orderIndex,
      text: { tiptap: options.doc ?? DOC },
    });
    await sidecarModule.mutateSidecar(projectPath, resource.id, (current) => ({
      ...(current ?? {}),
      ...(options.extra ?? {}),
      annotations: (options.annotations ?? ANNOTATIONS) as never,
    }));
    await flushIndexer();
    return resource.id;
  }

  async function requestFor(
    resourceId: string,
    offset: number,
    carry: Partial<SplitApplyRequest["carryOver"]> = {},
  ): Promise<SplitApplyRequest> {
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
      offset,
      carryOver: {
        annotationIds: [ID.claim, ID.citation, ID.note],
        fields: [],
        newName: "",
        ...carry,
      },
    };
  }

  const offsetAt = (needle: string): number => {
    const text = tiptapToPlainText(DOC);
    const at = text.indexOf(needle);
    if (at === -1) throw new Error("needle not in fixture");
    return at + needle.length;
  };

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

  const readJson = async (rel: string): Promise<Record<string, unknown>> =>
    JSON.parse(
      await fs.readFile(path.join(projectPath, rel), "utf8"),
    ) as Record<string, unknown>;

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

  async function applyOk(
    request: SplitApplyRequest,
  ): Promise<
    Extract<Awaited<ReturnType<typeof applySplit>>, { outcome: "applied" }>
  > {
    const result = await applySplit(projectId, request);
    if (result.outcome !== "applied") throw new Error(JSON.stringify(result));
    return result;
  }

  describe("order of writes and locks", () => {
    it("writes in the decided order: snapshot, new document, annotations, exclusion, truncation, lineage, latest operation", async () => {
      const id = await makeDoc();
      await fs.writeFile(
        path.join(projectPath, "project.json"),
        JSON.stringify({
          ...(await readJson("project.json")),
          config: {
            ...((await readJson("project.json")).config as object),
            compileDefaults: { excludedResourceIds: [id] },
          },
        }),
      );
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
      wrap(revisionCore, "createRevision", "snapshot");
      wrap(newDocument, "createSplitDocument", "create");
      wrap(sidecarModule, "mutateSidecar", "sidecar");
      wrap(savedDefaults, "seedCompileExclusion", "seed");
      wrap(revisionCore, "writeCanonicalContentWithoutLog", "truncate");
      wrap(records, "writeLineageEntry", "lineage");
      wrap(records, "writeLatestOperation", "latest");
      await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      const compact = calls.filter(
        (c, i) => c !== "sidecar" || calls[i - 1] !== "sidecar",
      );
      const firstOf = (label: string): number => calls.indexOf(label);
      expect(firstOf("snapshot")).toBeLessThan(firstOf("create"));
      expect(firstOf("create")).toBeLessThan(firstOf("seed"));
      expect(firstOf("seed")).toBeLessThan(firstOf("truncate"));
      expect(firstOf("truncate")).toBeLessThan(firstOf("lineage"));
      expect(firstOf("lineage")).toBeLessThan(firstOf("latest"));
      // The annotation move (two sidecar writes) sits between create and seed.
      const between = calls.slice(firstOf("create") + 1, firstOf("seed"));
      expect(
        between.filter((c) => c === "sidecar").length,
      ).toBeGreaterThanOrEqual(2);
      expect(compact.length).toBeGreaterThan(0);
    });

    it("takes the original's revision lock once, holds it, and does not take it again for the truncation", async () => {
      const id = await makeDoc();
      const acquire = vi.spyOn(locks, "acquireLock");
      const truncate = vi.spyOn(
        revisionCore,
        "writeCanonicalContentWithoutLog",
      );
      await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      expect(acquire.mock.calls.map((c) => c[0])).toEqual([
        revisionContentLockKey(projectPath, id),
      ]);
      expect(truncate.mock.calls[0][4]).toEqual({ lockHeld: true });
    });

    it("says in a comment that the claim holds under one writer instance per tenant", async () => {
      const source = await fs.readFile(
        path.join(process.cwd(), "src/lib/models/split-core.ts"),
        "utf8",
      );
      expect(source).toMatch(/one writer instance per tenant/);
    });
  });

  describe("result on disk", () => {
    it("keeps every revision plus one preserved non-canonical snapshot, and exactly one canonical revision", async () => {
      const id = await makeDoc();
      const before = await listRevisions(projectPath, id);
      const original = (await readRevision(projectPath, id, before[0].id))
        .content;
      const result = await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      const after = await listRevisions(projectPath, id);
      expect(after).toHaveLength(before.length + 1);
      expect(after.filter((r) => r.isCanonical)).toHaveLength(1);
      expect(after[0].id).toBe(before[0].id);
      const snap = after.find((r) => r.id === result.snapshotRevisionId);
      expect(snap?.versionNumber).toBe(result.snapshotRevisionNumber);
      expect(snap?.isCanonical).toBe(false);
      expect(snap?.metadata?.preserve).toBe(true);
      expect(snap?.metadata?.splitSnapshot).toBe(true);
      expect(String(snap?.metadata?.name)).toMatch(
        /^Before split \d{4}-\d{2}-\d{2}$/,
      );
      expect(
        (await readRevision(projectPath, id, snap?.id ?? "")).content,
      ).toBe(original);
      expect(after.some((r) => r.metadata?.automaticSnapshot)).toBe(false);
    });

    it("leaves the original with its id, name and the text before the cursor in its canonical revision", async () => {
      const id = await makeDoc();
      await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      const sidecar = await sidecarModule.readSidecar(projectPath, id);
      expect(sidecar?.name).toBe("Chapter 1");
      const first = await canonicalContent(id);
      expect(tiptapToPlainText(first)).toBe("Alpha beta gamma.\nDelta epsilon");
      expect(sidecar?.wordCount).toBe(5);
      const text = await fs.readFile(
        path.join(projectPath, "resources", id, "content.txt"),
        "utf8",
      );
      expect(text).toBe("Alpha beta gamma.\nDelta epsilon");
    });

    it("creates the new document with exactly its v-1, directly after the original, named by default", async () => {
      const id = await makeDoc({ orderIndex: 0 });
      const other = await makeDoc({ name: "Next", orderIndex: 1 });
      const result = await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      const newId = result.newDocumentId;
      const revisions = await listRevisions(projectPath, newId);
      expect(revisions).toHaveLength(1);
      expect(revisions[0].versionNumber).toBe(1);
      expect(revisions[0].isCanonical).toBe(true);
      expect(tiptapToPlainText(await canonicalContent(newId))).toBe(
        " zeta\nEta theta\nIota kappa.",
      );
      const sidecar = await sidecarModule.readSidecar(projectPath, newId);
      expect(sidecar?.name).toBe("Chapter 1 (part 2)");
      const order = async (x: string): Promise<number> =>
        Number((await sidecarModule.readSidecar(projectPath, x))?.orderIndex);
      expect(await order(newId)).toBe((await order(id)) + 1);
      expect(await order(other)).toBeGreaterThan(await order(newId));
    });

    it("takes the name typed in the dialog", async () => {
      const id = await makeDoc();
      const result = await applyOk(
        await requestFor(id, offsetAt(CUT_AFTER), { newName: "The aftermath" }),
      );
      expect(
        (await sidecarModule.readSidecar(projectPath, result.newDocumentId))
          ?.name,
      ).toBe("The aftermath");
    });

    it("changes no other document's content or revisions, only sibling order", async () => {
      const id = await makeDoc({ orderIndex: 0 });
      const other = await makeDoc({ name: "Other", orderIndex: 1 });
      const before = await snapshot();
      await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      const after = await snapshot();
      for (const key of before.keys()) {
        if (
          key.startsWith(`revisions/${other}/`) ||
          key.startsWith(`resources/${other}/`)
        )
          expect(after.get(key), key).toBe(before.get(key));
      }
      const side = `meta/resource-${other}.meta.json`;
      const b = JSON.parse(before.get(side) ?? "{}") as Record<string, unknown>;
      const a = JSON.parse(after.get(side) ?? "{}") as Record<string, unknown>;
      expect({ ...a, orderIndex: b.orderIndex }).toEqual(b);
    });
  });

  describe("records", () => {
    it("writes the lineage entry naming the snapshot, and the latest-operation record last", async () => {
      const id = await makeDoc();
      const result = await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      const lineage = await readJson("meta/lineage.json");
      expect(lineage[result.newDocumentId]).toMatchObject({
        sourceDocumentId: id,
        sourceRevisionId: result.snapshotRevisionId,
        sourceRevisionNumber: result.snapshotRevisionNumber,
        operation: "split",
      });
      const latest = (await readJson(
        "meta/latest-operation.json",
      )) as unknown as LatestOperationRecord;
      expect(latest.kind).toBe("split");
      expect(latest.newDocumentId).toBe(result.newDocumentId);
      expect(latest.affectedDocumentIds).toEqual([id, result.newDocumentId]);
      expect(latest.snapshotRevisions).toEqual([
        {
          documentId: id,
          revisionId: result.snapshotRevisionId,
          revisionNumber: result.snapshotRevisionNumber,
        },
      ]);
    });

    it("replaces an earlier latest-operation record and keeps other lineage entries", async () => {
      const a = await makeDoc({ name: "A", orderIndex: 0 });
      const b = await makeDoc({ name: "B", orderIndex: 1 });
      const first = await applyOk(await requestFor(a, offsetAt(CUT_AFTER)));
      const second = await applyOk(await requestFor(b, offsetAt(CUT_AFTER)));
      const lineage = await readJson("meta/lineage.json");
      expect(Object.keys(lineage).sort()).toEqual(
        [first.newDocumentId, second.newDocumentId].sort(),
      );
      const latest = (await readJson(
        "meta/latest-operation.json",
      )) as unknown as LatestOperationRecord;
      expect(latest.newDocumentId).toBe(second.newDocumentId);
    });
  });

  describe("writing log and goals", () => {
    it("leaves the writing-log directory byte-identical and the daily goal unchanged", async () => {
      const id = await makeDoc();
      const logBefore = await listLog();
      const configBefore = (await readJson("project.json")).config as Record<
        string,
        unknown
      >;
      await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      expect(await listLog()).toEqual(logBefore);
      const configAfter = (await readJson("project.json")).config as Record<
        string,
        unknown
      >;
      expect(configAfter.dailyWordGoal).toBe(configBefore.dailyWordGoal);
    });

    async function listLog(): Promise<Record<string, string>> {
      const dir = path.join(projectPath, "meta", "writing-log");
      const names = await fs.readdir(dir).catch(() => [] as string[]);
      const out: Record<string, string> = {};
      for (const name of names.sort())
        out[name] = await fs.readFile(path.join(dir, name), "utf8");
      return out;
    }
  });

  describe("annotations", () => {
    it("moves the chosen ones with the text, keeps the rest in the original, shares no id", async () => {
      const id = await makeDoc();
      const result = await applyOk(
        await requestFor(id, offsetAt(CUT_AFTER), {
          annotationIds: [ID.claim, ID.citation],
        }),
      );
      const original = await sidecarModule.readSidecar(projectPath, id);
      const created = await sidecarModule.readSidecar(
        projectPath,
        result.newDocumentId,
      );
      const originalIds = (
        original?.annotations as unknown as Annotation[]
      ).map((a) => a.id);
      const newAnnotations = created?.annotations as unknown as Annotation[];
      expect(newAnnotations.map((a) => a.id).sort()).toEqual(
        [ID.claim, ID.citation].sort(),
      );
      expect(originalIds.sort()).toEqual([ID.before, ID.span, ID.note].sort());
      expect(newAnnotations.find((a) => a.id === ID.claim)).toEqual(
        ANNOTATIONS.find((a) => a.id === ID.claim),
      );
      expect(newAnnotations.find((a) => a.id === ID.citation)?.target).toEqual(
        ANNOTATIONS.find((a) => a.id === ID.citation)?.target,
      );
      // Marks: carried ids are marked in the new text only; the unchosen
      // note's mark is stripped there; the spanning mark stays in the original.
      const newMarks = markIds(await canonicalContent(result.newDocumentId));
      const oldMarks = markIds(await canonicalContent(id));
      expect([...newMarks].sort()).toEqual([ID.claim, ID.citation].sort());
      expect(oldMarks.has(ID.claim)).toBe(false);
      expect(oldMarks.has(ID.span)).toBe(true);
      expect(oldMarks.has(ID.before)).toBe(true);
      for (const carried of newMarks) expect(oldMarks.has(carried)).toBe(false);
      // The spanning annotation's stored quote is unchanged.
      expect(
        (original?.annotations as unknown as Annotation[]).find(
          (a) => a.id === ID.span,
        )?.quote,
      ).toBe("quote of note across");
    });

    it("leaves every annotation in the original when none is chosen", async () => {
      const id = await makeDoc();
      const result = await applyOk(
        await requestFor(id, offsetAt(CUT_AFTER), { annotationIds: [] }),
      );
      const original = await sidecarModule.readSidecar(projectPath, id);
      expect(original?.annotations).toHaveLength(ANNOTATIONS.length);
      const created = await sidecarModule.readSidecar(
        projectPath,
        result.newDocumentId,
      );
      expect(created?.annotations).toBeUndefined();
      expect(markIds(await canonicalContent(result.newDocumentId)).size).toBe(
        0,
      );
    });
  });

  describe("node ids", () => {
    it("shares no node id between the stored texts and gives every id-bearing node of the new text an id", async () => {
      const id = await makeDoc();
      const result = await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      const originalDoc = await canonicalContent(id);
      const newDoc = await canonicalContent(result.newDocumentId);
      const originalIds = new Set(nodeIds(originalDoc));
      const newIds = nodeIds(newDoc);
      expect(newIds.length).toBeGreaterThan(0);
      for (const nodeId of newIds) expect(originalIds.has(nodeId)).toBe(false);
      const paragraphs = (newDoc.content as TipTapNode[]).filter(
        (n) => n.type === "paragraph",
      );
      for (const p of paragraphs) expect(typeof p.attrs?.id).toBe("string");
      // The truncated original keeps its ids.
      expect([...originalIds]).toEqual(
        expect.arrayContaining([NODE_IDS[0], NODE_IDS[1]]),
      );
      // Same on the derived file read straight from disk.
      const tiptapFile = JSON.parse(
        await fs.readFile(
          path.join(
            projectPath,
            "resources",
            result.newDocumentId,
            "content.tiptap.json",
          ),
          "utf8",
        ),
      ) as TipTapDocument;
      for (const nodeId of nodeIds(tiptapFile))
        expect(originalIds.has(nodeId)).toBe(false);
    });
  });

  describe("compile exclusion", () => {
    const setCompileDefaults = async (value: unknown): Promise<void> => {
      const project = await readJson("project.json");
      await fs.writeFile(
        path.join(projectPath, "project.json"),
        JSON.stringify({
          ...project,
          config: { ...(project.config as object), compileDefaults: value },
        }),
      );
    };
    const excluded = async (): Promise<unknown> =>
      ((await readJson("project.json")).config as Record<string, unknown>)
        .compileDefaults;

    it("gives the new document the original's saved exclusion", async () => {
      const id = await makeDoc();
      await setCompileDefaults({ excludedResourceIds: [id] });
      const result = await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      expect(result.notices).toEqual([]);
      await expect(excluded()).resolves.toEqual({
        excludedResourceIds: [id, result.newDocumentId],
      });
    });

    it("writes no exclusion when the original is not excluded", async () => {
      const id = await makeDoc();
      await setCompileDefaults({ excludedResourceIds: [generateUUID()] });
      const before = await excluded();
      await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      expect(await excluded()).toEqual(before);
    });

    it("proceeds with the notice at the cap, writing no exclusion", async () => {
      const id = await makeDoc();
      const ids = [id, ...Array.from({ length: 4999 }, () => generateUUID())];
      await setCompileDefaults({ excludedResourceIds: ids });
      const result = await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      expect(result.notices).toEqual([SPLIT_COMPILE_EXCLUSION_NOTICE]);
      expect(await excluded()).toEqual({ excludedResourceIds: ids });
    });

    it("proceeds with the notice when the stored list is unusable, leaving it as stored", async () => {
      const id = await makeDoc();
      await setCompileDefaults("not an object");
      const result = await applyOk(await requestFor(id, offsetAt(CUT_AFTER)));
      expect(result.notices).toEqual([SPLIT_COMPILE_EXCLUSION_NOTICE]);
      expect(await excluded()).toBe("not an object");
    });
  });

  describe("metadata", () => {
    it("carries the named fields and inherits the subtype, with no entity or goal keys", async () => {
      const id = await makeDoc({
        extra: {
          resourceSubtype: "Scene",
          userMetadata: { status: "Draft", pov: "x", synopsis: "s" },
          wordCountGoal: 900,
        },
      });
      const result = await applyOk(
        await requestFor(id, offsetAt(CUT_AFTER), { fields: ["status"] }),
      );
      const created = await sidecarModule.readSidecar(
        projectPath,
        result.newDocumentId,
      );
      expect(created?.resourceSubtype).toBe("Scene");
      expect(created?.userMetadata).toEqual({ status: "Draft" });
      expect(created?.wordCountGoal).toBeUndefined();
      expect(created?.entityKind).toBeUndefined();
      const original = await sidecarModule.readSidecar(projectPath, id);
      expect(original?.userMetadata).toEqual({
        status: "Draft",
        pov: "x",
        synopsis: "s",
      });
    });
  });

  describe("refusals and failures before any write", () => {
    it("refuses an entity document, an empty half and a stale hash, writing nothing", async () => {
      const entity = await makeDoc({ extra: { entityKind: "person" } });
      const id = await makeDoc({ name: "Plain" });
      const before = await snapshot();
      const entityRequest = await requestFor(entity, offsetAt(CUT_AFTER));
      const good = await requestFor(id, offsetAt(CUT_AFTER));
      expect(await applySplit(projectId, entityRequest)).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.entityDocument,
      });
      expect(await applySplit(projectId, { ...good, offset: 0 })).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.emptyFirstHalf,
      });
      expect(
        await applySplit(projectId, {
          ...good,
          contentHash: hashSplitContent("other"),
        }),
      ).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.staleCursor,
      });
      expect(await snapshot()).toEqual(before);
    });

    it("refuses a stale cursor after an edit and writes nothing", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      await revisionCore.updateRevisionInPlace(
        projectPath,
        id,
        request.revisionId,
        JSON.stringify({
          type: "doc",
          content: [
            para(NODE_IDS[0], plain("Alpha beta gamma. Delta epsilon zeta.")),
          ],
        }),
      );
      const before = await snapshot();
      expect(await applySplit(projectId, request)).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.staleCursor,
      });
      expect(await snapshot()).toEqual(before);
    });

    it("rethrows the locked-access error and writes nothing", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      const before = await snapshot();
      vi.spyOn(sidecarModule, "readSidecar").mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );
      await expect(applySplit(projectId, request)).rejects.toBeInstanceOf(
        ProjectLockedError,
      );
      vi.restoreAllMocks();
      expect(await snapshot()).toEqual(before);
    });

    it("returns a failure naming no write when a chosen annotation has no passage", async () => {
      const id = await makeDoc();
      const before = await snapshot();
      const result = await applySplit(
        projectId,
        await requestFor(id, offsetAt(CUT_AFTER), {
          annotationIds: [generateUUID()],
        }),
      );
      expect(result.outcome).toBe("failed");
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("overlap", () => {
    it("ends with one of two concurrent splits of one document applied and one refused", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      const results = await Promise.all([
        applySplit(projectId, request),
        applySplit(projectId, request),
      ]);
      const outcomes = results.map((r) => r.outcome).sort();
      expect(outcomes).toEqual(["applied", "refused"]);
      const refusal = results.find((r) => r.outcome === "refused");
      expect(refusal).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.staleCursor,
      });
      const revisions = await listRevisions(projectPath, id);
      expect(revisions.filter((r) => r.metadata?.splitSnapshot)).toHaveLength(
        1,
      );
      const lineage = await readJson("meta/lineage.json");
      expect(Object.keys(lineage)).toHaveLength(1);
    });
  });
});
