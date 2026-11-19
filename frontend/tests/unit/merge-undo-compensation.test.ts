/**
 * Feature 121, Task 39: rollback of a failed Undo merge (FR-22, FR-6 rules).
 * A failure is injected after each write step of Undo merge's order
 * (`MERGE_UNDO_STEPS`); the directory is then compared with the directory
 * taken just before the Undo.
 *
 * The comparison is the one `split-undo-compensation.test.ts` makes and
 * excludes the same two things and nothing else: `config.metadataRevision` in
 * `project.json` (allowed to advance), and the key order of the files under
 * `meta/index/` (compared as JSON with sorted keys).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as io from "../../src/lib/models/io";
import * as mergeMark from "../../src/lib/models/merge-mark-core";
import * as revisionCore from "../../src/lib/models/revision-core";
import * as sidecarModule from "../../src/lib/models/sidecar";
import * as records from "../../src/lib/models/split-records-core";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { mutateSidecar } from "../../src/lib/models/sidecar";
import { listRevisions } from "../../src/lib/models/revision";
import {
  readRevision,
  updateRevisionInPlace,
} from "../../src/lib/models/revision-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
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
import {
  MERGE_UNDO_STEPS,
  undoLatestOperation,
  type MergeUndoResult,
} from "../../src/lib/models/split-undo-core";
import type { MergeCarryOverChoice } from "../../src/lib/models/merge-types";

const NOVEL_SPEC = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

const INJECTED = "injected failure";

function para(runs: TipTapNode[]): TipTapNode {
  return {
    type: "paragraph",
    attrs: { id: generateUUID() },
    content: runs,
  } as TipTapNode;
}

function docOf(text: string, noteId?: string): TipTapDocument {
  const run: TipTapNode =
    noteId === undefined
      ? ({ type: "text", text } as TipTapNode)
      : ({
          type: "text",
          text,
          marks: [{ type: "annotation", attrs: { id: noteId } }],
        } as TipTapNode);
  return { type: "doc", content: [para([run])] };
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

/** Runs the real function, then throws once on its `nth` armed call: a failure "after" the step. */
function failAfter<A extends unknown[], R>(
  original: (...args: A) => Promise<R>,
  nth: number,
  isArmed: () => boolean = () => true,
): (...args: A) => Promise<R> {
  let count = 0;
  let isFired = false;
  return async (...args: A): Promise<R> => {
    const result = await original(...args);
    if (isArmed() && !isFired) {
      count += 1;
      if (count === nth) {
        isFired = true;
        throw new Error(INJECTED);
      }
    }
    return result;
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

function normalise(rel: string, raw: string): string {
  if (rel === "project.json") {
    const project = JSON.parse(raw) as { config?: Record<string, unknown> };
    const config = { ...(project.config ?? {}) };
    delete config.metadataRevision;
    return JSON.stringify({ ...project, config });
  }
  if (
    rel.startsWith(`meta${path.sep}index${path.sep}`) &&
    rel.endsWith(".json")
  ) {
    return JSON.stringify(sortKeys(JSON.parse(raw)));
  }
  return raw;
}

describe("Undo merge rollback on a real project", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-merge-undo-comp-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Merge Undo Rollback",
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

  async function edit(id: string, text: string): Promise<void> {
    const { revisionId } = await canonicalOf(id);
    await updateRevisionInPlace(
      projectPath,
      id,
      revisionId,
      JSON.stringify(docOf(text)),
    );
    await flushIndexer();
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 2; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      await flushIndexer();
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
    }
    await flushIndexer();
  }

  async function dirSnapshot(): Promise<Map<string, string>> {
    await settle();
    const out = new Map<string, string>();
    async function walk(dir: string): Promise<void> {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        const rel = path.relative(projectPath, p);
        if (e.isDirectory()) {
          out.set(`${rel}/`, "");
          await walk(p);
        } else out.set(rel, normalise(rel, await fs.readFile(p, "utf8")));
      }
    }
    await walk(projectPath);
    return out;
  }

  const exists = async (rel: string): Promise<boolean> =>
    fs
      .stat(path.join(projectPath, rel))
      .then(() => true)
      .catch(() => false);

  interface Scenario {
    t: string;
    a: string;
    b: string;
    before: Map<string, string>;
  }

  /**
   * A merge of three documents (A and B each carry a chosen note), then an
   * edit to each of them, so every Undo step has something to write. The
   * returned snapshot is the state just before Undo.
   */
  async function scenario(): Promise<Scenario> {
    const noteA = generateUUID();
    const noteB = generateUUID();
    const t = await makeDoc("T", 0, docOf("Text of T."));
    const a = await makeDoc("A", 1, docOf("Text of A.", noteA), [
      annotation(noteA, "note of A"),
    ]);
    const b = await makeDoc("B", 2, docOf("Text of B.", noteB), [
      annotation(noteB, "note of B"),
    ]);
    const documents = await Promise.all(
      [t, a, b].map(async (resourceId) => {
        const { revisionId, content } = await canonicalOf(resourceId);
        return {
          resourceId,
          revisionId,
          contentHash: hashSplitContent(content),
        };
      }),
    );
    const carryOver: MergeCarryOverChoice = {
      annotationIds: [noteA, noteB],
      fields: [],
      unitedMultiselectFields: [],
    };
    const request: MergeApplyRequest = { documents, carryOver };
    const result = await applyMerge(projectId, request);
    if (result.outcome !== "applied") throw new Error(JSON.stringify(result));
    await flushIndexer();
    await edit(t, "Target edited after the merge");
    await edit(a, "A edited after the merge");
    await edit(b, "B edited after the merge");
    return { t, a, b, before: await dirSnapshot() };
  }

  type Failed = Extract<MergeUndoResult, { outcome: "failed" }>;

  async function undoMerge(): Promise<MergeUndoResult> {
    return (await undoLatestOperation(projectId)) as MergeUndoResult;
  }

  function expectFailed(result: MergeUndoResult): Failed {
    expect(result.outcome).toBe("failed");
    return result as Failed;
  }

  async function expectRestored(before: Map<string, string>): Promise<void> {
    const after = await dirSnapshot();
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, value] of before) {
      expect(after.get(key), key).toBe(value);
    }
    expect(await exists("meta/latest-operation.json")).toBe(true);
  }

  /** Arms after the third overwrite returned, then counts sidecar mutations. */
  function armedSidecarFailure(nth: number): void {
    let writes = 0;
    let isArmed = false;
    const realWrite = revisionCore.writeCanonicalContentWithoutLog;
    vi.spyOn(
      revisionCore,
      "writeCanonicalContentWithoutLog",
    ).mockImplementation(async (...args) => {
      const result = await realWrite(...args);
      writes += 1;
      if (writes === 3) isArmed = true;
      return result;
    });
    const realMutate = sidecarModule.mutateSidecar;
    vi.spyOn(sidecarModule, "mutateSidecar").mockImplementation(
      failAfter(realMutate, nth, () => isArmed),
    );
  }

  describe("a failure injected after each write step", () => {
    interface Case {
      name: string;
      step: (typeof MERGE_UNDO_STEPS)[number];
      inject: () => void;
    }

    const failCreateRevisionAt = (nth: number): void => {
      const real = revisionCore.createRevision;
      vi.spyOn(revisionCore, "createRevision").mockImplementation(
        failAfter(real, nth),
      );
    };
    const failOverwriteAt = (nth: number): void => {
      const real = revisionCore.writeCanonicalContentWithoutLog;
      vi.spyOn(
        revisionCore,
        "writeCanonicalContentWithoutLog",
      ).mockImplementation(failAfter(real, nth));
    };
    const failMarkClearAt = (nth: number): void => {
      const real = mergeMark.removeMergedMark;
      vi.spyOn(mergeMark, "removeMergedMark").mockImplementation(
        failAfter(real, nth),
      );
    };

    const cases: Case[] = [
      {
        name: "after the target's preserved revision",
        step: "save-current-text",
        inject: () => failCreateRevisionAt(1),
      },
      {
        name: "after the first absorbed document's preserved revision",
        step: "save-current-text",
        inject: () => failCreateRevisionAt(2),
      },
      {
        name: "after the last absorbed document's preserved revision",
        step: "save-current-text",
        inject: () => failCreateRevisionAt(3),
      },
      {
        name: "after the target's overwrite",
        step: "restore-target",
        inject: () => failOverwriteAt(1),
      },
      {
        name: "after the first absorbed document's text was put back",
        step: "restore-absorbed",
        inject: () => failOverwriteAt(2),
      },
      {
        name: "after the last absorbed document's text was put back",
        step: "restore-absorbed",
        inject: () => failOverwriteAt(3),
      },
      {
        name: "after a note was put back on the first absorbed document",
        step: "move-annotations",
        inject: () => armedSidecarFailure(1),
      },
      {
        name: "after a note was put back on the last absorbed document",
        step: "move-annotations",
        inject: () => armedSidecarFailure(2),
      },
      {
        name: "after the notes were taken off the target",
        step: "move-annotations",
        inject: () => armedSidecarFailure(3),
      },
      {
        name: "after the first mark was cleared",
        step: "clear-marks",
        inject: () => failMarkClearAt(1),
      },
      {
        name: "after the last mark was cleared",
        step: "clear-marks",
        inject: () => failMarkClearAt(2),
      },
      {
        name: "after the record was cleared",
        step: "clear-record",
        inject: () => {
          const real = records.clearLatestOperation;
          vi.spyOn(records, "clearLatestOperation").mockImplementation(
            failAfter(real, 1),
          );
        },
      },
    ];

    it.each(cases)(
      "restores the merged state $name",
      async ({ step, inject }) => {
        const { before } = await scenario();
        inject();
        const failed = expectFailed(await undoMerge());
        expect(failed.failedStep).toBe(step);
        expect(failed.cause.length).toBeGreaterThan(0);
        expect(failed.remainingState).toBe("merge-restored");
        vi.restoreAllMocks();
        await expectRestored(before);
      },
    );

    it("covers every step of the order", () => {
      expect(new Set(cases.map((c) => c.step))).toEqual(
        new Set(MERGE_UNDO_STEPS),
      );
    });

    it("leaves Undo available: the same Undo works once the failure is gone", async () => {
      await scenario();
      const real = records.clearLatestOperation;
      vi.spyOn(records, "clearLatestOperation").mockImplementation(
        failAfter(real, 1),
      );
      expectFailed(await undoMerge());
      vi.restoreAllMocks();
      expect((await undoMerge()).outcome).toBe("applied");
    });
  });

  describe("a step that cannot be undone", () => {
    function failClearRecord(onFire?: () => void): void {
      const real = records.clearLatestOperation;
      vi.spyOn(records, "clearLatestOperation").mockImplementation(
        async (...args) => {
          await real(...args);
          onFire?.();
          throw new Error(INJECTED);
        },
      );
    }

    it("names the remaining state when the preserved revisions cannot be deleted", async () => {
      const { t } = await scenario();
      const revisionsBefore = (
        await fs.readdir(path.join(projectPath, "revisions", t))
      ).length;
      failClearRecord();
      vi.spyOn(revisionCore, "deleteRevision").mockRejectedValue(
        new Error("injected undo failure"),
      );
      const failed = expectFailed(await undoMerge());
      expect(failed.failedStep).toBe("clear-record");
      expect(failed.remainingState).toBe("preserved-revisions-kept");
      const revisionsAfter = (
        await fs.readdir(path.join(projectPath, "revisions", t))
      ).length;
      expect(revisionsAfter).toBe(revisionsBefore + 1);
    });

    it("names the remaining state when the record cannot be put back", async () => {
      await scenario();
      let isFired = false;
      failClearRecord(() => {
        isFired = true;
      });
      const realAtomic = io.atomicWriteFile;
      vi.spyOn(io, "atomicWriteFile").mockImplementation(async (...args) => {
        if (isFired && String(args[0]).endsWith("latest-operation.json")) {
          throw new Error("injected undo failure");
        }
        return realAtomic(...args);
      });
      const failed = expectFailed(await undoMerge());
      expect(failed.remainingState).toBe("record-not-restored");
      expect(await exists("meta/latest-operation.json")).toBe(false);
    });

    it("names the remaining state when a mark cannot be put back", async () => {
      await scenario();
      const realMutate = sidecarModule.mutateSidecar;
      failClearRecord(() => {
        vi.spyOn(sidecarModule, "mutateSidecar").mockImplementation(
          async (root, id, fn) => {
            const current = await sidecarModule.readSidecar(root, id);
            const next = await fn(current);
            if (
              next !== sidecarModule.SIDECAR_UNCHANGED &&
              next !== null &&
              "mergedMark" in next
            ) {
              throw new Error("injected undo failure");
            }
            return realMutate(root, id, fn);
          },
        );
      });
      const failed = expectFailed(await undoMerge());
      expect(failed.remainingState).toBe("marks-not-restored");
    });

    it("names the state as unknown when two things cannot be put back", async () => {
      await scenario();
      let isFired = false;
      failClearRecord(() => {
        isFired = true;
      });
      const realAtomic = io.atomicWriteFile;
      vi.spyOn(io, "atomicWriteFile").mockImplementation(async (...args) => {
        if (isFired) throw new Error("injected undo failure");
        return realAtomic(...args);
      });
      const failed = expectFailed(await undoMerge());
      expect(failed.remainingState).toBe("state-unknown");
    });
  });

  describe("overlapping calls", () => {
    it("ends with one applied and one answered as nothing to undo", async () => {
      await scenario();
      const [x, y] = await Promise.all([undoMerge(), undoMerge()]);
      expect([x.outcome, y.outcome].sort()).toEqual([
        "applied",
        "nothing-to-undo",
      ]);
    });
  });
});
