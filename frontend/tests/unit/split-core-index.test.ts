/**
 * Feature 120, Task 22: the post-commit derived-data update of a split and the
 * report of its failure (FR-9). The update runs after the split commits, is
 * awaited, and a failure leaves the split applied.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as sidecarModule from "../../src/lib/models/sidecar";
import * as indexUpdate from "../../src/lib/models/split-index-update";
import * as records from "../../src/lib/models/split-records-core";
import * as rebuild from "../../src/lib/models/derived-index-rebuild";
import * as diagnostics from "../../src/lib/models/diagnostics-index";
import * as inverted from "../../src/lib/models/inverted-index";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { listRevisions } from "../../src/lib/models/revision";
import { readRevision } from "../../src/lib/models/revision-core";
import {
  enqueueIndex,
  flushIndexer,
  waitForDrain,
} from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import { countWords } from "../../src/lib/word-count";
import type { TipTapDocument, TipTapNode } from "../../src/lib/models/types";
import { hashSplitContent } from "../../src/lib/models/split-preview-core";
import {
  applySplit,
  type SplitApplyRequest,
} from "../../src/lib/models/split-core";
import { SPLIT_INDEX_FAILURE_MESSAGE } from "../../src/lib/models/split-messages";

const NOVEL_SPEC = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

const plain = (text: string): TipTapNode =>
  ({ type: "text", text }) as TipTapNode;
const para = (nodeId: string, text: string): TipTapNode =>
  ({
    type: "paragraph",
    attrs: { id: nodeId },
    content: [plain(text)],
  }) as TipTapNode;

const DOC: TipTapDocument = {
  type: "doc",
  content: [
    para("b0000000-0000-4000-8000-000000000001", "Marker alpha begins here."),
    para("b0000000-0000-4000-8000-000000000002", "Then zebra omega ends."),
  ],
} as TipTapDocument;

const CUT_AFTER = "Marker alpha begins here.";

const FOUR_INDEXES = [
  "inverted.json",
  "annotations.json",
  "backlinks.json",
  "mentions.json",
] as const;

describe("split post-commit index update", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-split-index-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Split Index",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await flushIndexer();
    if (previousEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousEnv;
    await removeDirRetry(tmp);
  });

  async function setup(): Promise<{ id: string; request: SplitApplyRequest }> {
    const id = (
      await createResourceCore(projectId, {
        name: "Chapter 1",
        type: "text",
        text: { tiptap: DOC },
      })
    ).id;
    await rebuild.rebuildDerivedIndexes(projectPath);
    await flushIndexer();
    const canonical = (await listRevisions(projectPath, id)).find(
      (r) => r.isCanonical,
    );
    const { content } = await readRevision(
      projectPath,
      id,
      canonical?.id ?? "",
    );
    return {
      id,
      request: {
        resourceId: id,
        revisionId: canonical?.id ?? "",
        contentHash: hashSplitContent(content),
        offset: tiptapToPlainText(DOC).indexOf(CUT_AFTER) + CUT_AFTER.length,
        carryOver: { annotationIds: [], fields: [], newName: "" },
      },
    };
  }

  const readIndex = async (name: string): Promise<Record<string, unknown>> =>
    JSON.parse(
      await fs.readFile(path.join(projectPath, "meta", "index", name), "utf8"),
    ) as Record<string, unknown>;

  const termHolders = (
    index: Record<string, unknown>,
    term: string,
  ): string[] => Object.keys((index[term] as Record<string, number>) ?? {});

  function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }

  async function fourIndexes(root: string): Promise<string> {
    const out: Record<string, unknown> = {};
    for (const name of FOUR_INDEXES) {
      const raw = await fs
        .readFile(path.join(root, "meta", "index", name), "utf8")
        .catch(() => "null");
      out[name] = sortKeys(JSON.parse(raw));
    }
    return JSON.stringify(out);
  }

  it("updates both documents' derived data after commit, awaited, with no whole-project reindex", async () => {
    const { id, request } = await setup();
    const rebuilt = vi.spyOn(rebuild, "rebuildDerivedIndexes");
    const update = vi.spyOn(indexUpdate, "updateDocumentIndexes");
    const latest = vi.spyOn(records, "writeLatestOperation");
    const result = await applySplit(projectId, request);
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") return;
    expect(rebuilt).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][1]).toEqual([id, result.newDocumentId]);
    expect(latest.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0],
    );
    // The update had finished when applySplit resolved: read the files now.
    const inv = await readIndex("inverted.json");
    expect(termHolders(inv, "zebra")).toEqual([result.newDocumentId]);
    expect(termHolders(inv, "marker")).toEqual([id]);
    const diag = await readIndex("diagnostics.json");
    expect(Object.keys(diag)).toEqual(
      expect.arrayContaining([id, result.newDocumentId]),
    );
  });

  describe("word counts", () => {
    it("writes both documents' wordCount as countWords over tiptapToPlainText of the stored text", async () => {
      const { id, request } = await setup();
      const result = await applySplit(projectId, request);
      if (result.outcome !== "applied") throw new Error(result.outcome);
      const stored = async (docId: string): Promise<string> => {
        const canonical = (await listRevisions(projectPath, docId)).find(
          (r) => r.isCanonical,
        );
        const { content } = await readRevision(
          projectPath,
          docId,
          canonical?.id ?? "",
        );
        return tiptapToPlainText(JSON.parse(content) as TipTapDocument);
      };
      for (const docId of [id, result.newDocumentId]) {
        const sidecar = await sidecarModule.readSidecar(projectPath, docId);
        expect(sidecar?.wordCount).toBe(countWords(await stored(docId)));
      }
      const first = await sidecarModule.readSidecar(projectPath, id);
      const second = await sidecarModule.readSidecar(
        projectPath,
        result.newDocumentId,
      );
      expect(first?.wordCount).toBe(4);
      expect(second?.wordCount).toBe(4);
    });

    it("writes the new document's wordCount through mutateSidecar after the records", async () => {
      const { request } = await setup();
      const mutate = vi.spyOn(sidecarModule, "mutateSidecar");
      const latest = vi.spyOn(records, "writeLatestOperation");
      const result = await applySplit(projectId, request);
      if (result.outcome !== "applied") throw new Error(result.outcome);
      const lastWrite = latest.mock.invocationCallOrder[0];
      const afterwards = mutate.mock.calls
        .map((call, i) => ({ call, order: mutate.mock.invocationCallOrder[i] }))
        .filter(
          ({ call, order }) =>
            order > lastWrite && call[1] === result.newDocumentId,
        );
      expect(afterwards.length).toBeGreaterThanOrEqual(1);
    });

    it("returns an index failure, not a rollback, when the wordCount write fails", async () => {
      const { id, request } = await setup();
      const real = sidecarModule.mutateSidecar as unknown as (
        ...a: unknown[]
      ) => Promise<unknown>;
      const latest = vi.spyOn(records, "writeLatestOperation");
      vi.spyOn(sidecarModule, "mutateSidecar").mockImplementation((async (
        ...args: unknown[]
      ) => {
        const isAfterRecords = latest.mock.calls.length > 0;
        if (isAfterRecords && args[1] !== id)
          throw new Error("injected wordCount failure");
        return real(...args);
      }) as never);
      const result = await applySplit(projectId, request);
      expect(result.outcome).toBe("index-failed");
      if (result.outcome !== "index-failed") return;
      expect(result.failures).toContainEqual({
        documentId: result.newDocumentId,
        step: "word-count",
      });
      vi.restoreAllMocks();
      expect((await readIndex("../latest-operation.json")).kind).toBe("split");
    });
  });

  describe("an index failure after commit", () => {
    it("leaves the split applied and returns an index-failed outcome naming what failed", async () => {
      const { id, request } = await setup();
      vi.spyOn(indexUpdate, "updateDocumentIndexes").mockResolvedValue({
        outcome: "failed",
        failures: [{ documentId: id, step: "backlinks" }],
      });
      const result = await applySplit(projectId, request);
      expect(result.outcome).toBe("index-failed");
      if (result.outcome !== "index-failed") return;
      expect(result.failures).toEqual([{ documentId: id, step: "backlinks" }]);
      expect(result.message).toContain(SPLIT_INDEX_FAILURE_MESSAGE);
      expect(result).not.toHaveProperty("failedStep");
      // Nothing was rolled back: the split-off document, the records and the
      // truncated original are all there.
      expect(result.newDocumentId).toBeTruthy();
      expect(
        await sidecarModule.readSidecar(projectPath, result.newDocumentId),
      ).not.toBeNull();
      expect((await readIndex("../latest-operation.json")).kind).toBe("split");
      expect(Object.keys(await readIndex("../lineage.json"))).toContain(
        result.newDocumentId,
      );
      const canonical = (await listRevisions(projectPath, id)).find(
        (r) => r.isCanonical,
      );
      const { content } = await readRevision(
        projectPath,
        id,
        canonical?.id ?? "",
      );
      expect(tiptapToPlainText(JSON.parse(content) as TipTapDocument)).toBe(
        "Marker alpha begins here.",
      );
    });

    it("does not start compensation: no document is removed, no snapshot deleted", async () => {
      const { id, request } = await setup();
      vi.spyOn(indexUpdate, "updateDocumentIndexes").mockResolvedValue({
        outcome: "failed",
        failures: [{ documentId: id, step: "inverted-index" }],
      });
      const result = await applySplit(projectId, request);
      expect(result.outcome).toBe("index-failed");
      const revisions = await listRevisions(projectPath, id);
      expect(revisions.some((r) => r.metadata?.splitSnapshot)).toBe(true);
    });

    it("after an injected inverted-index failure, reindex gives the result of a rebuild for the four indexes", async () => {
      const { request } = await setup();
      const real = inverted.indexResource as unknown as (
        ...a: unknown[]
      ) => Promise<unknown>;
      let newId: string | null = null;
      vi.spyOn(inverted, "indexResource").mockImplementation((async (
        ...args: unknown[]
      ) => {
        const resource = args[1] as { id: string; name?: string };
        if (resource.name === "Chapter 1 (part 2)") {
          newId = resource.id;
          throw new Error("injected inverted-index failure");
        }
        return real(...args);
      }) as never);
      const result = await applySplit(projectId, request);
      await flushIndexer();
      expect(result.outcome).toBe("index-failed");
      if (result.outcome !== "index-failed") return;
      expect(result.failures).toContainEqual({
        documentId: result.newDocumentId,
        step: "inverted-index",
      });
      expect(newId).toBe(result.newDocumentId);
      vi.restoreAllMocks();
      // Before the rebuild the new document is missing from the inverted index.
      expect(
        termHolders(await readIndex("inverted.json"), "zebra"),
      ).not.toContain(result.newDocumentId);
      const copy = path.join(tmp, "copy-of-failed-state");
      await fs.cp(projectPath, copy, { recursive: true });
      await rebuild.rebuildDerivedIndexes(projectPath);
      await rebuild.rebuildDerivedIndexes(copy);
      expect(await fourIndexes(projectPath)).toBe(await fourIndexes(copy));
      expect(termHolders(await readIndex("inverted.json"), "zebra")).toContain(
        result.newDocumentId,
      );
    });

    it("a failed diagnostics step is not repaired by reindex and is written by the document's next save", async () => {
      const { request } = await setup();
      vi.spyOn(diagnostics, "persistDiagnosticsIndex").mockRejectedValue(
        new Error("injected diagnostics failure"),
      );
      const result = await applySplit(projectId, request);
      await flushIndexer();
      expect(result.outcome).toBe("index-failed");
      if (result.outcome !== "index-failed") return;
      expect(result.failures.map((f) => f.step)).toContain("diagnostics");
      vi.restoreAllMocks();
      const before = await readIndex("diagnostics.json");
      expect(Object.keys(before)).not.toContain(result.newDocumentId);
      await rebuild.rebuildDerivedIndexes(projectPath);
      expect(Object.keys(await readIndex("diagnostics.json"))).not.toContain(
        result.newDocumentId,
      );
      enqueueIndex(projectPath, result.newDocumentId);
      await waitForDrain();
      expect(Object.keys(await readIndex("diagnostics.json"))).toContain(
        result.newDocumentId,
      );
    });

    it("the outcome of a clean split is applied with no failures field", async () => {
      const { request } = await setup();
      const result = await applySplit(projectId, request);
      expect(result.outcome).toBe("applied");
      expect(result).not.toHaveProperty("failures");
    });
  });
});
