/**
 * Feature 121, Task 26: reverse compensation of the merge apply core (FR-6).
 * Real project directories. A failure is injected after (and, for the
 * sidecar writes inside a text write, before) each write step of Task 25's
 * order; every case compares a directory snapshot taken before the merge with
 * one taken after the compensation. `project.json`'s `metadataRevision`
 * counter is excluded from that comparison and asserted separately.
 *
 * `tests/setup.ts` installs the Feature 93 lock-order guard for every file.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as sidecarModule from "../../src/lib/models/sidecar";
import * as revisionCore from "../../src/lib/models/revision-core";
import * as revisionListing from "../../src/lib/models/revision";
import * as records from "../../src/lib/models/split-records-core";
import * as markCore from "../../src/lib/models/merge-mark-core";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { listRevisions } from "../../src/lib/models/revision";
import {
  PROTECTED_REVISION_DELETE_MESSAGE,
  readRevision,
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
  type MergeApplyResult,
} from "../../src/lib/models/merge-core";
import {
  MERGE_FAILED_REMAINING_STATE_MESSAGES,
  describeMergeFailure,
} from "../../src/lib/models/merge-messages";
import type {
  MergeRemainingState,
  MergeStep,
} from "../../src/lib/models/merge-types";

const NOVEL_SPEC = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

/**
 * Two derived index files are rewritten by the indexer after each sidecar
 * write and came back with the same content in another key order
 * (`experiments/task-5.md`, I3; `experiments/task-26.md`). They are compared
 * with their keys sorted; every other file is compared byte for byte.
 */
const SORTED_KEY_FILES = new Set([
  "meta/index/annotations.json",
  "meta/index/inverted.json",
]);

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
      .map(([k, v]) => [k, sortKeys(v)]),
  );
}

const NOW = new Date("2026-11-19T08:30:15.123Z");

class InjectedFailure extends Error {
  constructor() {
    super("injected");
    this.name = "InjectedFailure";
  }
}

function para(runs: TipTapNode[]): TipTapNode {
  return {
    type: "paragraph",
    attrs: { id: generateUUID() },
    content: runs,
  } as TipTapNode;
}

function run(text: string, annotationId?: string): TipTapNode {
  return annotationId === undefined
    ? { type: "text", text }
    : {
        type: "text",
        text,
        marks: [{ type: "annotation", attrs: { id: annotationId } }],
      };
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

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

/** `vi.spyOn` for a function named at run time, typed loosely on purpose. */
function spyOnKey(
  target: object,
  key: string,
): MockInstance<(...args: unknown[]) => unknown> {
  return vi.spyOn(
    target as Record<string, (...args: unknown[]) => unknown>,
    key,
  );
}

/** Wraps `target[key]` so the `occurrence`-th call throws after (or instead of) the real one. */
function inject(
  target: object,
  key: string,
  occurrence: number,
  mode: "after" | "before",
): void {
  const holder = target as Record<string, AsyncFn>;
  const original = holder[key];
  let count = 0;
  spyOnKey(holder, key).mockImplementation(((...args: unknown[]) => {
    count += 1;
    const isTarget = count === occurrence;
    if (isTarget && mode === "before")
      return Promise.reject(new InjectedFailure());
    const result = original(...args);
    if (isTarget && mode === "after")
      return result.then(() => {
        throw new InjectedFailure();
      });
    return result;
  }) as never);
}

interface Point {
  label: string;
  module: "revision" | "sidecar" | "mark" | "record";
  key: string;
  occurrence: number;
  mode: "after" | "before";
  step: MergeStep;
}

function point(
  label: string,
  module: Point["module"],
  key: string,
  occurrence: number,
  mode: Point["mode"],
  step: MergeStep,
): Point {
  return { label, module, key, occurrence, mode, step };
}

/**
 * One row per write step of Task 25's order for the fixture. The sidecar
 * calls are, in order: T's notes (1), A's notes (2), the mark on A (3) and on
 * B (4), the sidecar update of A's strip (5) and of T's append (6), T's
 * metadata (7). "before" on 5 and 6 leaves the text written and the sidecar
 * not.
 */
const POINTS: Point[] = [
  point("snapshot 1", "revision", "createRevision", 1, "after", "snapshot"),
  point("snapshot 2", "revision", "createRevision", 2, "after", "snapshot"),
  point("snapshot 3", "revision", "createRevision", 3, "after", "snapshot"),
  point(
    "snapshot 2, before it is written",
    "revision",
    "createRevision",
    2,
    "before",
    "snapshot",
  ),
  point(
    "sidecar write 1 (notes added to the target)",
    "sidecar",
    "mutateSidecar",
    1,
    "after",
    "move-annotations",
  ),
  point(
    "sidecar write 2 (notes removed from the absorbed document)",
    "sidecar",
    "mutateSidecar",
    2,
    "after",
    "move-annotations",
  ),
  point(
    "sidecar write 3 (mark on the first absorbed document)",
    "sidecar",
    "mutateSidecar",
    3,
    "after",
    "write-marks",
  ),
  point(
    "sidecar write 4 (mark on the second absorbed document)",
    "sidecar",
    "mutateSidecar",
    4,
    "after",
    "write-marks",
  ),
  point(
    "sidecar write 5 (sidecar of the strip)",
    "sidecar",
    "mutateSidecar",
    5,
    "after",
    "strip-absorbed-marks",
  ),
  point(
    "sidecar write 5, before it is written (text stripped, sidecar not)",
    "sidecar",
    "mutateSidecar",
    5,
    "before",
    "strip-absorbed-marks",
  ),
  point(
    "sidecar write 6 (sidecar of the append)",
    "sidecar",
    "mutateSidecar",
    6,
    "after",
    "append-to-target",
  ),
  point(
    "sidecar write 6, before it is written (text appended, sidecar not)",
    "sidecar",
    "mutateSidecar",
    6,
    "before",
    "append-to-target",
  ),
  point(
    "sidecar write 7 (carried metadata)",
    "sidecar",
    "mutateSidecar",
    7,
    "after",
    "append-to-target",
  ),
  point(
    "sidecar write 7, before it is written",
    "sidecar",
    "mutateSidecar",
    7,
    "before",
    "append-to-target",
  ),
  point(
    "mark 2 returned",
    "mark",
    "writeMergedMark",
    2,
    "after",
    "write-marks",
  ),
  point(
    "the strip returned",
    "revision",
    "writeCanonicalContentWithoutLog",
    1,
    "after",
    "strip-absorbed-marks",
  ),
  point(
    "the append returned",
    "revision",
    "writeCanonicalContentWithoutLog",
    2,
    "after",
    "append-to-target",
  ),
  point(
    "the latest-operation record written",
    "record",
    "writeLatestOperation",
    1,
    "after",
    "write-records",
  ),
  point(
    "the latest-operation record, before it is written",
    "record",
    "writeLatestOperation",
    1,
    "before",
    "write-records",
  ),
];

const MODULES = {
  revision: revisionCore,
  sidecar: sidecarModule,
  mark: markCore,
  record: records,
} as const;

describe("merge reverse compensation on a real project", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-merge-comp-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Merge Compensation",
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
    extra: Record<string, MetadataValue>,
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

  interface Fixture {
    t: string;
    a: string;
    b: string;
    moved: string;
    request: MergeApplyRequest;
  }

  /**
   * T (a note, listed in the saved compile exclusions), A (a note that moves,
   * one that stays, `status` to carry) and B (a note that stays), with an
   * earlier latest-operation record in place so its restoration is compared.
   */
  async function fixture(): Promise<Fixture> {
    const moved = generateUUID();
    const kept = generateUUID();
    const other = generateUUID();
    const t = await makeDoc(
      "T",
      0,
      { type: "doc", content: [para([run("Text of T.")])] },
      {
        annotations: [annotation("t1", "t")] as unknown as MetadataValue,
        userMetadata: { status: "Draft" },
      },
    );
    const a = await makeDoc(
      "A",
      1,
      {
        type: "doc",
        content: [para([run("moved passage", moved), run(" kept", kept)])],
      },
      {
        annotations: [
          annotation(moved, "moved"),
          annotation(kept, "kept"),
        ] as unknown as MetadataValue,
        userMetadata: { status: "Final" },
      },
    );
    const b = await makeDoc(
      "B",
      2,
      { type: "doc", content: [para([run("b text", other)])] },
      {
        annotations: [annotation(other, "b note")] as unknown as MetadataValue,
      },
    );
    const file = path.join(projectPath, "project.json");
    const project = JSON.parse(await fs.readFile(file, "utf8")) as {
      config: Record<string, unknown>;
    };
    project.config.compileDefaults = { excludedResourceIds: [t] };
    await fs.writeFile(file, JSON.stringify(project));
    const earlierA = await refFor(a);
    await records.writeLatestOperation(projectPath, {
      kind: "merge",
      affectedDocumentIds: [t, a],
      snapshotRevisions: [
        { documentId: t, revisionId: earlierA.revisionId, revisionNumber: 1 },
        { documentId: a, revisionId: earlierA.revisionId, revisionNumber: 1 },
      ],
      date: "2026-11-01T00:00:00.000Z",
    });
    await flushIndexer();
    return {
      t,
      a,
      b,
      moved,
      request: {
        documents: await Promise.all([t, a, b].map(refFor)),
        carryOver: {
          annotationIds: [moved],
          fields: [{ field: "status", sourceDocumentId: a }],
          unitedMultiselectFields: [],
        },
      },
    };
  }

  /** Every file of the project with its text, the counter in `project.json` removed. */
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
        } else {
          let text = await fs.readFile(p, "utf8");
          if (rel === "project.json") {
            const project = JSON.parse(text) as {
              config: Record<string, unknown>;
            };
            delete project.config.metadataRevision;
            text = JSON.stringify(project);
          }
          if (SORTED_KEY_FILES.has(rel)) {
            text = JSON.stringify(sortKeys(JSON.parse(text)));
          }
          out.set(rel, text);
        }
      }
    }
    await walk(projectPath);
    return out;
  }

  async function readProjectJson(): Promise<{
    config: Record<string, unknown>;
  }> {
    return JSON.parse(
      await fs.readFile(path.join(projectPath, "project.json"), "utf8"),
    ) as { config: Record<string, unknown> };
  }

  async function snapshotRevisionsOf(id: string): Promise<number> {
    return (await listRevisions(projectPath, id)).filter(
      (r) => r.metadata?.mergeSnapshot,
    ).length;
  }

  async function sidecarOf(id: string): Promise<Record<string, unknown>> {
    return JSON.parse(
      await fs.readFile(
        path.join(projectPath, "meta", `resource-${id}.meta.json`),
        "utf8",
      ),
    ) as Record<string, unknown>;
  }

  function merge(request: MergeApplyRequest): Promise<MergeApplyResult> {
    return applyMerge(projectId, request, { now: () => NOW });
  }

  it("makes the forward path call each write primitive the number of times the injection table assumes", async () => {
    const f = await fixture();
    const counts = new Map<string, number>();
    const count = (target: object, key: string, label: string): void => {
      const holder = target as Record<string, (...a: unknown[]) => unknown>;
      const original = holder[key];
      spyOnKey(holder, key).mockImplementation(((...args: unknown[]) => {
        counts.set(label, (counts.get(label) ?? 0) + 1);
        return original(...args);
      }) as never);
    };
    count(revisionCore, "createRevision", "createRevision");
    count(sidecarModule, "mutateSidecar", "mutateSidecar");
    count(markCore, "writeMergedMark", "writeMergedMark");
    count(revisionCore, "writeCanonicalContentWithoutLog", "text");
    count(records, "writeLatestOperation", "record");
    expect((await merge(f.request)).outcome).toBe("applied");
    expect(Object.fromEntries(counts)).toEqual({
      createRevision: 3,
      mutateSidecar: 7,
      writeMergedMark: 2,
      text: 2,
      record: 1,
    });
  });

  describe.each(POINTS)("a failure injected at $label", (p) => {
    it("undoes the earlier steps and leaves the project as it was", async () => {
      const f = await fixture();
      const before = await snapshot();
      inject(MODULES[p.module], p.key, p.occurrence, p.mode);
      const result = await merge(f.request);
      vi.restoreAllMocks();
      expect(result).toEqual({
        outcome: "failed",
        failedStep: p.step,
        remainingState: "documents-restored",
        cause: "InjectedFailure",
      });
      expect(await snapshot()).toEqual(before);
      for (const id of [f.t, f.a, f.b])
        expect(await snapshotRevisionsOf(id)).toBe(0);
    });
  });

  it("leaves no half-marked and no half-appended document after a failure at the last step", async () => {
    const f = await fixture();
    inject(records, "writeLatestOperation", 1, "before");
    await merge(f.request);
    vi.restoreAllMocks();
    expect((await sidecarOf(f.a)).mergedMark).toBeUndefined();
    expect((await sidecarOf(f.b)).mergedMark).toBeUndefined();
    expect((await refFor(f.t)).contentHash).toBe(
      f.request.documents[0].contentHash,
    );
    expect((await refFor(f.a)).contentHash).toBe(
      f.request.documents[1].contentHash,
    );
  });

  it("lets the metadataRevision counter advance and nothing else in project.json differ", async () => {
    const f = await fixture();
    const before = await readProjectJson();
    inject(records, "writeLatestOperation", 1, "before");
    const result = await merge(f.request);
    vi.restoreAllMocks();
    expect(result.outcome).toBe("failed");
    await flushIndexer();
    const after = await readProjectJson();
    expect(Number(after.config.metadataRevision ?? 0)).toBeGreaterThan(
      Number(before.config.metadataRevision ?? 0),
    );
    const strip = (p: { config: Record<string, unknown> }): string => {
      const copy = structuredClone(p);
      delete copy.config.metadataRevision;
      return JSON.stringify(copy);
    };
    expect(strip(after)).toBe(strip(before));
  });

  describe("snapshots", () => {
    it("are refused by deleteRevision while preserved, so a compensation that skipped the flag would fail", async () => {
      const f = await fixture();
      expect((await merge(f.request)).outcome).toBe("applied");
      const snapshots = (await listRevisions(projectPath, f.a)).filter(
        (r) => r.metadata?.mergeSnapshot,
      );
      expect(snapshots).toHaveLength(1);
      await expect(
        revisionCore.deleteRevision(projectPath, f.a, snapshots[0].id),
      ).rejects.toThrow(PROTECTED_REVISION_DELETE_MESSAGE);
    });

    it("are removed by clearing the preserve flag first, then deleting, for every document, last snapshot first", async () => {
      const f = await fixture();
      const calls: string[] = [];
      const wrap = (key: "setRevisionPreserve" | "deleteRevision"): void => {
        const original = revisionCore[key] as AsyncFn;
        spyOnKey(revisionCore, key).mockImplementation(((
          ...args: unknown[]
        ) => {
          const flag =
            key === "setRevisionPreserve" ? `:${String(args[3])}` : "";
          calls.push(`${key}:${String(args[1])}:${String(args[2])}${flag}`);
          return original(...args);
        }) as never);
      };
      wrap("setRevisionPreserve");
      wrap("deleteRevision");
      inject(records, "writeLatestOperation", 1, "before");
      const result = await merge(f.request);
      expect(result).toMatchObject({
        outcome: "failed",
        remainingState: "documents-restored",
      });
      expect(calls).toHaveLength(6);
      for (let i = 0; i < calls.length; i += 2) {
        const [fn, doc, rev, flag] = calls[i].split(":");
        expect(fn).toBe("setRevisionPreserve");
        expect(flag).toBe("false");
        expect(calls[i + 1]).toBe(`deleteRevision:${doc}:${rev}`);
      }
      const deleted = calls
        .filter((c) => c.startsWith("deleteRevision"))
        .map((c) => c.split(":")[1]);
      expect(deleted).toEqual([f.b, f.a, f.t]);
    });
  });

  describe("reverse order", () => {
    it("removes the marks, the last one first, before it clears any snapshot", async () => {
      const f = await fixture();
      const order: string[] = [];
      const unmark = markCore.removeMergedMark;
      vi.spyOn(markCore, "removeMergedMark").mockImplementation(((
        root: string,
        id: string,
      ) => {
        order.push(`unmark:${id}`);
        return unmark(root, id);
      }) as typeof unmark);
      const preserve = revisionCore.setRevisionPreserve;
      vi.spyOn(revisionCore, "setRevisionPreserve").mockImplementation(((
        ...args: Parameters<typeof preserve>
      ) => {
        order.push("unpreserve");
        return preserve(...args);
      }) as typeof preserve);
      inject(records, "writeLatestOperation", 1, "before");
      await merge(f.request);
      expect(order).toEqual([
        `unmark:${f.b}`,
        `unmark:${f.a}`,
        "unpreserve",
        "unpreserve",
        "unpreserve",
      ]);
    });
  });

  describe("a step that cannot be undone", () => {
    it("names the partially-written state when a mark cannot be removed, and keeps the snapshots", async () => {
      const f = await fixture();
      inject(records, "writeLatestOperation", 1, "before");
      vi.spyOn(markCore, "removeMergedMark").mockRejectedValue(
        new Error("disk gone"),
      );
      const result = await merge(f.request);
      expect(result).toMatchObject({
        outcome: "failed",
        failedStep: "write-records",
        remainingState: "partially-written",
      });
      if (result.outcome !== "failed") throw new Error("not failed");
      for (const id of [f.t, f.a, f.b])
        expect(await snapshotRevisionsOf(id)).toBe(1);
      const text = describeMergeFailure(
        result.failedStep,
        result.remainingState,
      );
      expect(text).toContain(
        MERGE_FAILED_REMAINING_STATE_MESSAGES["partially-written"],
      );
      expect(text).not.toMatch(/as they were before/);
    });

    it("names the snapshot-revisions-kept state when only a snapshot cannot be deleted", async () => {
      const f = await fixture();
      const before = await snapshot();
      inject(records, "writeLatestOperation", 1, "before");
      vi.spyOn(revisionCore, "deleteRevision").mockRejectedValue(
        new Error("disk gone"),
      );
      const result = await merge(f.request);
      vi.restoreAllMocks();
      expect(result).toMatchObject({
        outcome: "failed",
        remainingState: "snapshot-revisions-kept",
      });
      const after = await snapshot();
      for (const id of [f.t, f.a, f.b]) {
        const sidecar = `meta/resource-${id}.meta.json`;
        expect(after.get(sidecar)).toBe(before.get(sidecar));
        expect(await snapshotRevisionsOf(id)).toBe(1);
      }
      expect(after.get("meta/latest-operation.json")).toBe(
        before.get("meta/latest-operation.json"),
      );
    });

    it("names the state-unknown state when the snapshot step failed before any snapshot completed and the revisions cannot be listed", async () => {
      const f = await fixture();
      // Listing works until the first snapshot has failed, then it does not.
      const realList = revisionListing.listRevisions;
      let isSnapshotFailed = false;
      vi.spyOn(revisionCore, "createRevision").mockImplementation((() => {
        isSnapshotFailed = true;
        return Promise.reject(new InjectedFailure());
      }) as never);
      vi.spyOn(revisionListing, "listRevisions").mockImplementation(((
        ...args: Parameters<typeof realList>
      ) =>
        isSnapshotFailed
          ? Promise.reject(new Error("disk gone"))
          : realList(...args)) as typeof realList);
      const result = await merge(f.request);
      expect(result).toMatchObject({
        outcome: "failed",
        failedStep: "snapshot",
        remainingState: "state-unknown",
      });
    });

    it("never reads as success: every failed state's text says the merge did not finish", () => {
      const states: MergeRemainingState[] = [
        "documents-restored",
        "snapshot-revisions-kept",
        "partially-written",
        "state-unknown",
      ];
      for (const state of states)
        expect(describeMergeFailure("write-records", state)).toMatch(
          /did not finish/,
        );
    });
  });

  it("puts a note added meanwhile back with the others when it restores the notes", async () => {
    const f = await fixture();
    const real = sidecarModule.mutateSidecar;
    const extra = annotation(generateUUID(), "added meanwhile");
    let isInjected = false;
    vi.spyOn(sidecarModule, "mutateSidecar").mockImplementation(((
      root: string,
      rid: string,
      fn: Parameters<typeof real>[2],
      opts?: Parameters<typeof real>[3],
    ) => {
      if (!isInjected && rid === f.a) {
        isInjected = true;
        return real(
          root,
          rid,
          (cur) => ({
            ...(cur ?? {}),
            annotations: [
              ...((cur?.annotations as unknown as Annotation[]) ?? []),
              extra,
            ] as unknown as MetadataValue,
          }),
          opts,
        ).then(() => real(root, rid, fn, opts));
      }
      return real(root, rid, fn, opts);
    }) as typeof real);
    const result = await merge(f.request);
    vi.restoreAllMocks();
    expect(result).toMatchObject({
      outcome: "failed",
      failedStep: "move-annotations",
      remainingState: "documents-restored",
    });
    const ids = (
      (await sidecarOf(f.a)).annotations as unknown as Annotation[]
    ).map((n) => n.id);
    expect(ids).toContain(extra.id);
    expect(ids).toContain(f.moved);
  });
});
