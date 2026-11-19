/**
 * Feature 120, Task 30: rollback of a failed Undo split (FR-6 rules applied to
 * FR-17). A failure is injected after each write step of Undo's order; the
 * directory is then compared with the directory taken just before the Undo.
 *
 * The comparison is the one `split-core-compensation.test.ts` makes (Task 21)
 * and excludes the same two things and nothing else: `config.metadataRevision`
 * in `project.json` (allowed to advance), and the key order of the files
 * under `meta/index/` (compared as JSON with sorted keys).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as io from "../../src/lib/models/io";
import * as projectJsonWrite from "../../src/lib/models/project-json-write";
import * as revisionCore from "../../src/lib/models/revision-core";
import * as savedDefaults from "../../src/lib/models/saved-defaults-core";
import * as sidecarModule from "../../src/lib/models/sidecar";
import * as records from "../../src/lib/models/split-records-core";
import * as indexUpdate from "../../src/lib/models/split-index-update";
import * as resourceCrud from "../../src/lib/models/resource-crud-core";
import * as trash from "../../src/lib/models/trash";
import {
  createResourceCore,
  deleteResourceCore,
} from "../../src/lib/models/resource-crud-core";
import { mutateSidecar } from "../../src/lib/models/sidecar";
import { listRevisions } from "../../src/lib/models/revision";
import {
  deleteRevision,
  PROTECTED_REVISION_DELETE_MESSAGE,
  readRevision,
  updateRevisionInPlace,
} from "../../src/lib/models/revision-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import type {
  Annotation,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";
import { hashSplitContent } from "../../src/lib/models/split-preview-core";
import {
  applySplit,
  type SplitApplyRequest,
} from "../../src/lib/models/split-core";
import {
  undoLatestSplit,
  type SplitUndoResult,
} from "../../src/lib/models/split-undo-core";

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

const INJECTED = "injected failure";

/**
 * Wraps `original` so that its `nth` call, counted only while `isArmed()` is
 * true, runs the real function and then throws once. The real write has
 * happened when the throw comes, which is a failure "after" the step.
 */
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

/** Sorts object keys recursively, so a file is compared by its data. */
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

describe("Undo split rollback on a real project", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-split-undo-comp-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Split Undo Rollback",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await flushIndexer();
    if (previousEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousEnv;
    await removeDirRetry(tmp);
  });

  async function makeDoc(name = "Chapter 1"): Promise<string> {
    const resource = await createResourceCore(projectId, {
      name,
      type: "text",
      text: { tiptap: DOC },
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

  async function splitOk(
    resourceId: string,
  ): Promise<{ newId: string; snapshotId: string }> {
    const { revisionId, content } = await canonicalOf(resourceId);
    const text = tiptapToPlainText(DOC);
    const request: SplitApplyRequest = {
      resourceId,
      revisionId,
      contentHash: hashSplitContent(content),
      offset: text.indexOf(CUT_AFTER) + CUT_AFTER.length,
      carryOver: { annotationIds: CARRIED, fields: [], newName: "" },
    };
    const result = await applySplit(projectId, request);
    if (result.outcome !== "applied") throw new Error(JSON.stringify(result));
    return {
      newId: result.newDocumentId,
      snapshotId: result.snapshotRevisionId,
    };
  }

  /** See `settleIndexing` in `split-undo-core.test.ts` (Task 29 follow-up). */
  async function settleIndexing(): Promise<void> {
    for (let round = 0; round < 2; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      await flushIndexer();
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
    }
    await flushIndexer();
  }

  /** Every file (normalised as the module comment says) and directory under the project. */
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

  async function editDocument(id: string, text: string): Promise<void> {
    const { revisionId } = await canonicalOf(id);
    await updateRevisionInPlace(
      projectPath,
      id,
      revisionId,
      JSON.stringify(docOf(text)),
    );
    await flushIndexer();
  }

  async function excludeInProject(...ids: string[]): Promise<void> {
    const raw = JSON.parse(
      await fs.readFile(path.join(projectPath, "project.json"), "utf8"),
    ) as { config: Record<string, unknown> };
    await fs.writeFile(
      path.join(projectPath, "project.json"),
      JSON.stringify({
        ...raw,
        config: {
          ...raw.config,
          compileDefaults: { excludedResourceIds: ids },
        },
      }),
    );
  }

  interface Scenario {
    id: string;
    newId: string;
    before: Map<string, string>;
  }

  /**
   * A split, then an edit of each document, a saved compile exclusion naming
   * both, and (optionally) another document already in Trash. The returned
   * snapshot is the state just before Undo.
   */
  async function scenario(
    options: { otherInTrash?: boolean; splitOffInTrash?: boolean } = {},
  ): Promise<Scenario> {
    const id = await makeDoc();
    const { newId } = await splitOk(id);
    await editDocument(id, "Edited original after the split");
    await editDocument(newId, "Edited split-off after the split");
    await excludeInProject(id, newId);
    if (options.otherInTrash === true) {
      const other = await makeDoc("Other");
      await deleteResourceCore(projectId, other);
    }
    if (options.splitOffInTrash === true) {
      await flushIndexer();
      await deleteResourceCore(projectId, newId);
    }
    return { id, newId, before: await dirSnapshot() };
  }

  async function recordText(): Promise<string> {
    return fs.readFile(
      path.join(projectPath, "meta", "latest-operation.json"),
      "utf8",
    );
  }

  async function undoSavedRevisions(id: string): Promise<number> {
    const base = path.join(projectPath, "revisions", id);
    let count = 0;
    for (const name of await fs.readdir(base)) {
      const meta = JSON.parse(
        await fs.readFile(path.join(base, name, "metadata.json"), "utf8"),
      ) as { metadata?: { splitUndoSave?: boolean } };
      if (meta.metadata?.splitUndoSave === true) count += 1;
    }
    return count;
  }

  type Failed = Extract<SplitUndoResult, { outcome: "failed" }>;

  function expectFailed(result: SplitUndoResult): Failed {
    expect(result.outcome).toBe("failed");
    return result as Failed;
  }

  /** Counts `mutateSidecar` calls made after the original's overwrite returned. */
  function armedSidecarFailure(nth: number): void {
    let isArmed = false;
    const realWrite = revisionCore.writeCanonicalContentWithoutLog;
    vi.spyOn(
      revisionCore,
      "writeCanonicalContentWithoutLog",
    ).mockImplementation(async (...args) => {
      const result = await realWrite(...args);
      isArmed = true;
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
      step: string;
      inject: () => void;
    }

    const cases: Case[] = [
      {
        name: "after the first preserved revision (the original's)",
        step: "save-current-text",
        inject: () => {
          const real = revisionCore.createRevision;
          vi.spyOn(revisionCore, "createRevision").mockImplementation(
            failAfter(real, 1),
          );
        },
      },
      {
        name: "after the second preserved revision (the split-off's)",
        step: "save-current-text",
        inject: () => {
          const real = revisionCore.createRevision;
          vi.spyOn(revisionCore, "createRevision").mockImplementation(
            failAfter(real, 2),
          );
        },
      },
      {
        name: "after the original's overwrite",
        step: "restore-original",
        inject: () => {
          const real = revisionCore.writeCanonicalContentWithoutLog;
          vi.spyOn(
            revisionCore,
            "writeCanonicalContentWithoutLog",
          ).mockImplementation(failAfter(real, 1));
        },
      },
      {
        name: "after the notes were added to the original",
        step: "move-annotations",
        inject: () => armedSidecarFailure(1),
      },
      {
        name: "after the notes were removed from the split-off document",
        step: "move-annotations",
        inject: () => armedSidecarFailure(2),
      },
      {
        name: "after the soft delete",
        step: "trash-split-off",
        inject: () => {
          const real = resourceCrud.deleteResourceCore;
          vi.spyOn(resourceCrud, "deleteResourceCore").mockImplementation(
            failAfter(real, 1),
          );
        },
      },
      {
        name: "after the exclusion removal",
        step: "remove-exclusion",
        inject: () => {
          const real = savedDefaults.removeCompileExclusions;
          vi.spyOn(savedDefaults, "removeCompileExclusions").mockImplementation(
            failAfter(real, 1),
          );
        },
      },
      {
        name: "after the record clear",
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
      "restores the split state when a failure comes $name",
      async ({ step, inject }) => {
        const { id, newId, before } = await scenario();
        const recordBefore = await recordText();
        const update = vi.spyOn(indexUpdate, "updateDocumentIndexes");
        inject();
        const failed = expectFailed(await undoLatestSplit(projectId));
        expect(failed.failedStep).toBe(step);
        expect(failed.cause).toBe("Error");
        expect(failed.remainingState).toBe("split-restored");
        expect(await recordText()).toBe(recordBefore);
        expect(await undoSavedRevisions(id)).toBe(0);
        expect(await exists(`meta/resource-${newId}.meta.json`)).toBe(true);
        expect(await undoSavedRevisions(newId)).toBe(0);
        expect(update).not.toHaveBeenCalled();
        const after = await dirSnapshot();
        expect(after).toEqual(before);
        vi.restoreAllMocks();
        // The split is still undoable once the failure is gone.
        expect((await undoLatestSplit(projectId)).outcome).toBe("applied");
      },
    );

    it("leaves a Trash that held another document as it was", async () => {
      const first = await scenario({ otherInTrash: true });
      const real = resourceCrud.deleteResourceCore;
      vi.spyOn(resourceCrud, "deleteResourceCore").mockImplementation(
        failAfter(real, 1),
      );
      expectFailed(await undoLatestSplit(projectId));
      expect(await dirSnapshot()).toEqual(first.before);
    });

    it("creates no .trash directory when there was none", async () => {
      const { before } = await scenario();
      expect([...before.keys()].some((k) => k.startsWith(".trash"))).toBe(
        false,
      );
      const real = resourceCrud.deleteResourceCore;
      vi.spyOn(resourceCrud, "deleteResourceCore").mockImplementation(
        failAfter(real, 1),
      );
      expectFailed(await undoLatestSplit(projectId));
      expect(await exists(".trash")).toBe(false);
    });

    it("restores a split state whose split-off document was already in Trash, without touching Trash", async () => {
      const { before } = await scenario({ splitOffInTrash: true });
      const restore = vi.spyOn(trash, "restoreResource");
      const del = vi.spyOn(resourceCrud, "deleteResourceCore");
      const real = records.clearLatestOperation;
      vi.spyOn(records, "clearLatestOperation").mockImplementation(
        failAfter(real, 1),
      );
      const failed = expectFailed(await undoLatestSplit(projectId));
      expect(failed.failedStep).toBe("clear-record");
      expect(failed.remainingState).toBe("split-restored");
      expect(restore).not.toHaveBeenCalled();
      expect(del).not.toHaveBeenCalled();
      expect(await dirSnapshot()).toEqual(before);
    });
  });

  describe("the preserved revisions Undo made", () => {
    it("clears the preserve flag before deleting each, and a delete that skipped the flag is refused", async () => {
      const { id, before } = await scenario();
      const order: string[] = [];
      const realPreserve = revisionCore.setRevisionPreserve;
      vi.spyOn(revisionCore, "setRevisionPreserve").mockImplementation(
        async (...args) => {
          order.push(`preserve:${String(args[3])}`);
          return realPreserve(...args);
        },
      );
      const realDelete = revisionCore.deleteRevision;
      vi.spyOn(revisionCore, "deleteRevision").mockImplementation(
        async (...args) => {
          order.push("delete");
          return realDelete(...args);
        },
      );
      const realClear = records.clearLatestOperation;
      vi.spyOn(records, "clearLatestOperation").mockImplementation(
        failAfter(realClear, 1),
      );
      expectFailed(await undoLatestSplit(projectId));
      expect(order).toEqual([
        "preserve:false",
        "delete",
        "preserve:false",
        "delete",
      ]);
      expect(await dirSnapshot()).toEqual(before);
      vi.restoreAllMocks();
      // After a real Undo the saved revision is preserved: a bare delete is refused.
      const applied = await undoLatestSplit(projectId);
      if (applied.outcome !== "applied") throw new Error("expected applied");
      const saved = applied.preservedRevisions.find((r) => r.documentId === id);
      if (!saved) throw new Error("no saved revision");
      await expect(
        deleteRevision(projectPath, id, saved.revisionId),
      ).rejects.toThrow(PROTECTED_REVISION_DELETE_MESSAGE);
    });
  });

  describe("a step that cannot be undone", () => {
    /** Fails the record clear after it ran; `onFire` marks that rollback has begun. */
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
      const { id, newId } = await scenario();
      failClearRecord();
      vi.spyOn(revisionCore, "deleteRevision").mockRejectedValue(
        new Error("injected undo failure"),
      );
      const failed = expectFailed(await undoLatestSplit(projectId));
      expect(failed.failedStep).toBe("clear-record");
      expect(failed.remainingState).toBe("preserved-revisions-kept");
      expect(await undoSavedRevisions(id)).toBe(1);
      expect(await undoSavedRevisions(newId)).toBe(1);
    });

    it("names the remaining state when the split-off document cannot be taken out of Trash", async () => {
      const { newId } = await scenario();
      failClearRecord();
      vi.spyOn(trash, "restoreResource").mockRejectedValue(
        new Error("injected undo failure"),
      );
      const failed = expectFailed(await undoLatestSplit(projectId));
      expect(failed.remainingState).toBe("split-off-in-trash");
      expect(await exists(`.trash/meta/resource-${newId}.meta.json`)).toBe(
        true,
      );
      // Its saved revision stays with it, in Trash.
      expect(await exists(`.trash/revisions/${newId}`)).toBe(true);
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
      const failed = expectFailed(await undoLatestSplit(projectId));
      expect(failed.remainingState).toBe("record-not-restored");
      expect(await exists("meta/latest-operation.json")).toBe(false);
    });

    it("names the remaining state when the original's text cannot be put back, and keeps its saved text", async () => {
      const { id } = await scenario();
      const pre = (await canonicalOf(id)).content;
      let isFired = false;
      failClearRecord(() => {
        isFired = true;
      });
      const realAtomic = io.atomicWriteFile;
      vi.spyOn(io, "atomicWriteFile").mockImplementation(async (...args) => {
        if (isFired && String(args[0]).endsWith("content.bin")) {
          throw new Error("injected undo failure");
        }
        return realAtomic(...args);
      });
      const failed = expectFailed(await undoLatestSplit(projectId));
      expect(failed.remainingState).toBe("original-not-restored");
      expect(await undoSavedRevisions(id)).toBe(1);
      const saved = (await listRevisions(projectPath, id)).find(
        (r) => r.metadata?.splitUndoSave === true,
      );
      if (!saved) throw new Error("saved revision gone");
      expect((await readRevision(projectPath, id, saved.id)).content).toBe(pre);
    });

    it("names the remaining state when the exclusion cannot be put back", async () => {
      await scenario();
      let isFired = false;
      failClearRecord(() => {
        isFired = true;
      });
      // The first write to project.json after the failure is the exclusion
      // restore; sidecar writes touch project.json too, so rejecting every
      // call would fail those undos as well.
      let isRejected = false;
      const realUpdate = projectJsonWrite.updateProjectJson;
      vi.spyOn(projectJsonWrite, "updateProjectJson").mockImplementation(((
        ...args: Parameters<typeof realUpdate>
      ) => {
        if (isFired && !isRejected) {
          isRejected = true;
          return Promise.reject(new Error("injected undo failure"));
        }
        return realUpdate(...args);
      }) as typeof realUpdate);
      const failed = expectFailed(await undoLatestSplit(projectId));
      expect(failed.remainingState).toBe("exclusion-not-restored");
    });

    it("names the remaining state when the split-off document's notes cannot be put back", async () => {
      const { newId } = await scenario();
      let isFired = false;
      failClearRecord(() => {
        isFired = true;
      });
      const realMutate = sidecarModule.mutateSidecar;
      vi.spyOn(sidecarModule, "mutateSidecar").mockImplementation(((
        ...args: Parameters<typeof realMutate>
      ) => {
        if (isFired && args[1] === newId) {
          return Promise.reject(new Error("injected undo failure"));
        }
        return realMutate(...args);
      }) as typeof realMutate);
      const failed = expectFailed(await undoLatestSplit(projectId));
      expect(failed.remainingState).toBe("notes-not-restored");
    });

    it("answers state-unknown when two undo steps fail", async () => {
      await scenario();
      let isFired = false;
      failClearRecord(() => {
        isFired = true;
      });
      vi.spyOn(revisionCore, "deleteRevision").mockRejectedValue(
        new Error("injected undo failure"),
      );
      // The first write to project.json after the failure is the exclusion
      // restore; sidecar writes touch project.json too, so rejecting every
      // call would fail those undos as well.
      let isRejected = false;
      const realUpdate = projectJsonWrite.updateProjectJson;
      vi.spyOn(projectJsonWrite, "updateProjectJson").mockImplementation(((
        ...args: Parameters<typeof realUpdate>
      ) => {
        if (isFired && !isRejected) {
          isRejected = true;
          return Promise.reject(new Error("injected undo failure"));
        }
        return realUpdate(...args);
      }) as typeof realUpdate);
      const failed = expectFailed(await undoLatestSplit(projectId));
      expect(failed.remainingState).toBe("state-unknown");
    });
  });

  describe("overlapping calls", () => {
    it("ends with one applied and one answered as nothing to undo", async () => {
      await scenario();
      const [a, b] = await Promise.all([
        undoLatestSplit(projectId),
        undoLatestSplit(projectId),
      ]);
      expect([a.outcome, b.outcome].sort()).toEqual([
        "applied",
        "nothing-to-undo",
      ]);
    });
  });
});
