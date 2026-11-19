/**
 * Feature 121, Task 27: the post-commit derived-data update of a merge and the
 * report of its failure (FR-12, FR-9). The update runs after the merge
 * commits, is awaited, and a failure leaves the merge applied.
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
import * as markCore from "../../src/lib/models/merge-mark-core";
import * as revisionCore from "../../src/lib/models/revision-core";
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
import { MERGE_INDEX_FAILURE_MESSAGE } from "../../src/lib/models/merge-messages";

const NOVEL_SPEC = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

const FOUR_INDEXES = [
  "inverted.json",
  "annotations.json",
  "backlinks.json",
  "mentions.json",
] as const;

function para(text: string, runs?: TipTapNode[]): TipTapNode {
  return {
    type: "paragraph",
    attrs: { id: generateUUID() },
    content: runs ?? [{ type: "text", text }],
  } as TipTapNode;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, sortKeys(v)]),
  );
}

describe("merge post-commit index update", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-merge-index-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Merge Index",
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
    doc: TipTapDocument,
    extra: Record<string, MetadataValue> = {},
  ): Promise<string> {
    const resource = await createResourceCore(projectId, {
      name,
      type: "text",
      text: { tiptap: doc },
    });
    await sidecarModule.mutateSidecar(projectPath, resource.id, (current) => ({
      ...(current ?? {}),
      orderIndex,
      ...extra,
    }));
    // `createResourceCore` leaves `content.txt` empty; the backlinks scan and
    // the rebuild read it, so write the plain text of the stored document.
    await fs.writeFile(
      path.join(projectPath, "resources", resource.id, "content.txt"),
      tiptapToPlainText(doc),
      "utf8",
    );
    return resource.id;
  }

  async function refFor(
    resourceId: string,
  ): Promise<{ resourceId: string; revisionId: string; contentHash: string }> {
    const canonical = (await listRevisions(projectPath, resourceId)).find(
      (r) => r.isCanonical,
    );
    const { content } = await readRevision(
      projectPath,
      resourceId,
      canonical?.id ?? "",
    );
    return {
      resourceId,
      revisionId: canonical?.id ?? "",
      contentHash: hashSplitContent(content),
    };
  }

  interface Fixture {
    t: string;
    a: string;
    b: string;
    linker: string;
    entity: string;
    otherDoc: string;
    movedNote: string;
    request: MergeApplyRequest;
  }

  /**
   * T (marker "tmarker"), A (marker "amarker", a mention of the entity Aria, a
   * link to another document by its id, one note that moves) and B; a Linker
   * document that points at A; an entity Aria. Derived indexes are rebuilt
   * and drained before the merge so the merge's own update is what changes
   * them.
   */
  async function fixture(): Promise<Fixture> {
    const movedNote = generateUUID();
    const otherDoc = await makeDoc("Other", 9, {
      type: "doc",
      content: [para("Some other text.")],
    });
    const entity = await makeDoc(
      "Aria",
      8,
      { type: "doc", content: [para("Aria.")] },
      { entityKind: "character" },
    );
    const t = await makeDoc("T", 0, {
      type: "doc",
      content: [para("tmarker opening.")],
    });
    const a = await makeDoc(
      "A",
      1,
      {
        type: "doc",
        content: [
          para("", [
            { type: "text", text: "amarker " },
            {
              type: "text",
              text: "quokkapassage",
              marks: [{ type: "annotation", attrs: { id: movedNote } }],
            },
            { type: "text", text: ` Aria walks and links ${otherDoc} here.` },
          ]),
        ],
      },
      {
        annotations: [
          {
            id: movedNote,
            body: "quokkanote body",
            quote: "quokkapassage",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          } as Annotation,
        ] as unknown as MetadataValue,
      },
    );
    const b = await makeDoc("B", 2, {
      type: "doc",
      content: [para("bmarker closing.")],
    });
    const linker = await makeDoc("Linker", 3, {
      type: "doc",
      content: [para(`Points at ${a} directly.`)],
    });
    await rebuild.rebuildDerivedIndexes(projectPath);
    await flushIndexer();
    return {
      t,
      a,
      b,
      linker,
      entity,
      otherDoc,
      movedNote,
      request: {
        documents: await Promise.all([t, a, b].map(refFor)),
        carryOver: {
          annotationIds: [movedNote],
          fields: [],
          unitedMultiselectFields: [],
        },
      },
    };
  }

  /** Backlinks live in `meta/`, the other indexes in `meta/index/`. */
  const indexPath = (root: string, name: string): string =>
    name === "backlinks.json"
      ? path.join(root, "meta", name)
      : path.join(root, "meta", "index", name);

  const readIndex = async (name: string): Promise<Record<string, unknown>> =>
    JSON.parse(
      await fs.readFile(indexPath(projectPath, name), "utf8"),
    ) as Record<string, unknown>;

  const holders = (index: Record<string, unknown>, term: string): string[] =>
    Object.keys((index[term] as Record<string, number>) ?? {});

  async function fourIndexes(root: string): Promise<string> {
    const out: Record<string, unknown> = {};
    for (const name of FOUR_INDEXES) {
      const raw = await fs
        .readFile(indexPath(root, name), "utf8")
        .catch(() => "null");
      out[name] = sortKeys(JSON.parse(raw));
    }
    return JSON.stringify(out);
  }

  async function storedText(id: string): Promise<string> {
    const canonical = (await listRevisions(projectPath, id)).find(
      (r) => r.isCanonical,
    );
    const { content } = await readRevision(
      projectPath,
      id,
      canonical?.id ?? "",
    );
    return tiptapToPlainText(JSON.parse(content) as TipTapDocument);
  }

  it("updates the target and each changed absorbed document after commit, awaited, with no whole-project reindex", async () => {
    const f = await fixture();
    const rebuilt = vi.spyOn(rebuild, "rebuildDerivedIndexes");
    const update = vi.spyOn(indexUpdate, "updateDocumentIndexes");
    const latest = vi.spyOn(records, "writeLatestOperation");
    const result = await applyMerge(projectId, f.request);
    expect(result.outcome).toBe("applied");
    expect(rebuilt).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    // The target, then the absorbed document that lost a note; B changed nothing but its mark.
    expect(update.mock.calls[0][1]).toEqual([f.t, f.a]);
    expect(latest.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0],
    );
  });

  it("brings the indexes up to date: the appended text, the moved note, links, mentions and diagnostics, with the absorbed document kept", async () => {
    const f = await fixture();
    const result = await applyMerge(projectId, f.request);
    expect(result.outcome).toBe("applied");
    // The update had finished when applyMerge resolved: read the files now.
    const inv = await readIndex("inverted.json");
    expect(holders(inv, "tmarker")).toEqual([f.t]);
    expect(holders(inv, "amarker")).toEqual(expect.arrayContaining([f.t, f.a]));
    expect(holders(inv, "bmarker")).toEqual(expect.arrayContaining([f.t]));
    // An absorbed document stays in the search index.
    expect(holders(inv, "bmarker")).toContain(f.b);
    const notes = await readIndex("annotations.json");
    expect(holders(notes, "quokkanote")).toEqual([f.t]);
    const links = (await readIndex("backlinks.json")) as Record<
      string,
      string[]
    >;
    // The index maps a document to the documents it references. A link in an
    // appended passage now resolves from the target; the absorbed document
    // keeps its own link; a link to the absorbed document still resolves.
    expect(links[f.t]).toContain(f.otherDoc);
    expect(links[f.a]).toContain(f.otherDoc);
    expect(links[f.linker]).toContain(f.a);
    const mentions = (await readIndex("mentions.json")) as Record<
      string,
      { entityId: string; count: number; offsets: number[] }[]
    >;
    const ofTarget = mentions[f.t]?.find((m) => m.entityId === f.entity);
    expect(ofTarget?.count).toBe(1);
    // Recomputed from the target's own text, not copied from the absorbed document.
    const targetText = await storedText(f.t);
    expect(ofTarget?.offsets[0]).toBe(targetText.indexOf("Aria walks"));
    const ofAbsorbed = mentions[f.a]?.find((m) => m.entityId === f.entity);
    expect(ofAbsorbed?.count).toBe(1);
    const diag = await readIndex("diagnostics.json");
    expect(Object.keys(diag)).toEqual(expect.arrayContaining([f.t, f.a]));
  });

  it("writes the target's wordCount as countWords over tiptapToPlainText of the stored text", async () => {
    const f = await fixture();
    const result = await applyMerge(projectId, f.request);
    expect(result.outcome).toBe("applied");
    for (const id of [f.t, f.a]) {
      const sidecar = await sidecarModule.readSidecar(projectPath, id);
      expect(sidecar?.wordCount).toBe(countWords(await storedText(id)));
    }
    const target = await sidecarModule.readSidecar(projectPath, f.t);
    expect(Number(target?.wordCount)).toBeGreaterThan(3);
  });

  describe("an index failure after commit", () => {
    it("leaves the merge applied and returns an index-failed outcome naming what failed", async () => {
      const f = await fixture();
      vi.spyOn(indexUpdate, "updateDocumentIndexes").mockResolvedValue({
        outcome: "failed",
        failures: [{ documentId: f.t, step: "backlinks" }],
      });
      const unmark = vi.spyOn(markCore, "removeMergedMark");
      const unpreserve = vi.spyOn(revisionCore, "setRevisionPreserve");
      const result = await applyMerge(projectId, f.request);
      expect(result.outcome).toBe("index-failed");
      if (result.outcome !== "index-failed") return;
      expect(result.failures).toEqual([{ documentId: f.t, step: "backlinks" }]);
      expect(result.message).toContain(MERGE_INDEX_FAILURE_MESSAGE);
      expect(result.targetDocumentId).toBe(f.t);
      expect(result.absorbedDocumentIds).toEqual([f.a, f.b]);
      expect(result).not.toHaveProperty("failedStep");
      // Nothing was rolled back: no compensation call, the records and the text are there.
      expect(unmark).not.toHaveBeenCalled();
      expect(unpreserve).not.toHaveBeenCalled();
      const record = JSON.parse(
        await fs.readFile(
          path.join(projectPath, "meta", "latest-operation.json"),
          "utf8",
        ),
      ) as { kind: string };
      expect(record.kind).toBe("merge");
      expect(await storedText(f.t)).toContain("amarker");
      expect(
        (await listRevisions(projectPath, f.a)).some(
          (r) => r.metadata?.mergeSnapshot,
        ),
      ).toBe(true);
    });

    it("after an injected inverted-index failure, reindex gives the result of a rebuild for the four indexes", async () => {
      const f = await fixture();
      const real = inverted.indexResource as unknown as (
        ...a: unknown[]
      ) => Promise<unknown>;
      vi.spyOn(inverted, "indexResource").mockImplementation((async (
        ...args: unknown[]
      ) => {
        const resource = args[1] as { id: string };
        if (resource.id === f.t)
          throw new Error("injected inverted-index failure");
        return real(...args);
      }) as never);
      const result = await applyMerge(projectId, f.request);
      await flushIndexer();
      expect(result.outcome).toBe("index-failed");
      if (result.outcome !== "index-failed") return;
      expect(result.failures).toContainEqual({
        documentId: f.t,
        step: "inverted-index",
      });
      vi.restoreAllMocks();
      expect(
        holders(await readIndex("inverted.json"), "bmarker"),
      ).not.toContain(f.t);
      const copy = path.join(tmp, "copy-of-failed-state");
      await fs.cp(projectPath, copy, { recursive: true });
      await rebuild.rebuildDerivedIndexes(projectPath);
      await rebuild.rebuildDerivedIndexes(copy);
      expect(await fourIndexes(projectPath)).toBe(await fourIndexes(copy));
      expect(holders(await readIndex("inverted.json"), "bmarker")).toContain(
        f.t,
      );
    });

    it("a failed diagnostics step is not repaired by reindex and is written by the document's next save", async () => {
      const f = await fixture();
      const before = await readIndex("diagnostics.json");
      vi.spyOn(diagnostics, "persistDiagnosticsIndex").mockRejectedValue(
        new Error("injected diagnostics failure"),
      );
      const result = await applyMerge(projectId, f.request);
      await flushIndexer();
      expect(result.outcome).toBe("index-failed");
      if (result.outcome !== "index-failed") return;
      expect(result.failures.map((x) => x.step)).toContain("diagnostics");
      vi.restoreAllMocks();
      const stale = JSON.stringify(
        (await readIndex("diagnostics.json"))[f.t] ?? null,
      );
      expect(stale).toBe(JSON.stringify(before[f.t] ?? null));
      await rebuild.rebuildDerivedIndexes(projectPath);
      expect(
        JSON.stringify((await readIndex("diagnostics.json"))[f.t] ?? null),
      ).toBe(stale);
      enqueueIndex(projectPath, f.t);
      await waitForDrain();
      expect(
        JSON.stringify((await readIndex("diagnostics.json"))[f.t] ?? null),
      ).not.toBe(stale);
    });
  });

  it("the outcome of a clean merge is applied with no failures field", async () => {
    const f = await fixture();
    const result = await applyMerge(projectId, f.request);
    expect(result.outcome).toBe("applied");
    expect(result).not.toHaveProperty("failures");
  });

  it("does not run the index update for a refused or failed merge", async () => {
    const f = await fixture();
    const update = vi.spyOn(indexUpdate, "updateDocumentIndexes");
    const stale = structuredClone(f.request);
    stale.documents[0].contentHash = "0".repeat(64);
    expect((await applyMerge(projectId, stale)).outcome).toBe("refused");
    vi.spyOn(markCore, "writeMergedMark").mockRejectedValueOnce(
      new Error("disk gone"),
    );
    expect((await applyMerge(projectId, f.request)).outcome).toBe("failed");
    expect(update).not.toHaveBeenCalled();
  });
});
