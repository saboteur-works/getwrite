/**
 * Feature 120, Task 21: reverse compensation of a split and failure injection
 * after each write step (FR-6). Real-directory tests: a failure is injected by
 * wrapping the function a step calls (the real function runs, then the wrapper
 * throws, unless a case says it throws first), and the whole project directory
 * is compared with a snapshot taken before the split.
 *
 * `project.json`'s `config.metadataRevision` is excluded from the directory
 * comparison, because every sidecar write advances it and nothing writes it
 * back (Owner decision, Gate 5, 2026-11-16); a separate test asserts the
 * counter may be higher and that no other `project.json` field differs.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as io from "../../src/lib/models/io";
import * as sidecarModule from "../../src/lib/models/sidecar";
import * as revisionCore from "../../src/lib/models/revision-core";
import * as savedDefaults from "../../src/lib/models/saved-defaults-core";
import * as newDocument from "../../src/lib/models/split-new-document";
import * as records from "../../src/lib/models/split-records-core";
import * as indexUpdate from "../../src/lib/models/split-index-update";
import * as rebuild from "../../src/lib/models/derived-index-rebuild";
import * as crud from "../../src/lib/models/resource-crud-core";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { listRevisions } from "../../src/lib/models/revision";
import {
  PROTECTED_REVISION_DELETE_MESSAGE,
  deleteRevision,
  readRevision,
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
import { SPLIT_STEPS, type SplitStep } from "../../src/lib/models/split-types";
import { describeSplitFailure } from "../../src/lib/models/split-messages";

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

const marked = (text: string, id: string): TipTapNode =>
  ({
    type: "text",
    text,
    marks: [{ type: "annotation", attrs: { id } }],
  }) as TipTapNode;
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

const annotation = (
  id: string,
  body: string,
  extra: Partial<Annotation> = {},
): Annotation =>
  ({
    id,
    body,
    quote: `quote of ${body}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  }) as Annotation;

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

type AnyFn = (...args: unknown[]) => unknown;

describe("split reverse compensation", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-split-comp-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Split Compensation",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await flushIndexer();
    if (previousEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousEnv;
    await removeDirRetry(tmp);
  });

  const readJson = async (rel: string): Promise<Record<string, unknown>> =>
    JSON.parse(
      await fs.readFile(path.join(projectPath, rel), "utf8"),
    ) as Record<string, unknown>;

  /** A document that is in the saved compile exclusions and carries annotations. */
  async function setup(): Promise<{
    id: string;
    other: string;
    request: SplitApplyRequest;
  }> {
    const make = async (name: string, orderIndex: number): Promise<string> =>
      (
        await createResourceCore(projectId, {
          name,
          type: "text",
          orderIndex,
          text: { tiptap: DOC },
        })
      ).id;
    const id = await make("Chapter 1", 0);
    const other = await make("Next", 1);
    await sidecarModule.mutateSidecar(projectPath, id, (current) => ({
      ...(current ?? {}),
      annotations: ANNOTATIONS as never,
    }));
    const project = await readJson("project.json");
    await fs.writeFile(
      path.join(projectPath, "project.json"),
      JSON.stringify(
        {
          ...project,
          config: {
            ...(project.config as object),
            compileDefaults: { excludedResourceIds: [id] },
          },
        },
        null,
        2,
      ),
    );
    await flushIndexer();
    const canonical = (await listRevisions(projectPath, id)).find(
      (r) => r.isCanonical,
    );
    const { content } = await readRevision(
      projectPath,
      id,
      canonical?.id ?? "",
    );
    const text = tiptapToPlainText(DOC);
    return {
      id,
      other,
      request: {
        resourceId: id,
        revisionId: canonical?.id ?? "",
        contentHash: hashSplitContent(content),
        offset: text.indexOf(CUT_AFTER) + CUT_AFTER.length,
        carryOver: {
          annotationIds: [ID.claim, ID.citation, ID.note],
          fields: [],
          newName: "",
        },
      },
    };
  }

  /** Every file and directory under the project; `project.json` without the counter. */
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
          const raw = await fs.readFile(p, "utf8");
          out.set(rel, normalizeFile(rel, raw));
        }
      }
    }
    await walk(projectPath);
    return out;
  }

  /** Recursively sorts object keys, so two orders of one JSON value compare equal. */
  function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }

  /**
   * `project.json` without the counter; derived index files as sorted-key JSON
   * (their key order follows indexing order, which differs after a rebuild by
   * the background indexer; the content is compared); everything else raw.
   */
  function normalizeFile(rel: string, raw: string): string {
    if (rel === "project.json") return withoutCounter(raw);
    if (/^meta\/index\/.*\.json$/.test(rel))
      return JSON.stringify(sortKeys(JSON.parse(raw)));
    return raw;
  }

  function withoutCounter(raw: string): string {
    const project = JSON.parse(raw) as { config?: Record<string, unknown> };
    if (project.config) delete project.config.metadataRevision;
    return JSON.stringify(project);
  }

  const counter = async (): Promise<number> =>
    Number(
      ((await readJson("project.json")).config as Record<string, unknown>)
        .metadataRevision ?? 0,
    );

  /** Wraps `target[key]`: the real call runs, then the wrapper throws. */
  function failAfter<T extends object, K extends keyof T>(
    target: T,
    key: K,
    when: (args: unknown[], call: number) => boolean = () => true,
    options: { isBefore?: boolean } = {},
  ): void {
    const original = target[key] as unknown as AnyFn;
    let calls = 0;
    let hasFired = false;
    vi.spyOn(target, key as never).mockImplementation((async (
      ...args: unknown[]
    ) => {
      calls += 1;
      const isHit = !hasFired && when(args, calls);
      if (isHit) hasFired = true;
      if (isHit && options.isBefore) throw new Error("injected failure");
      const result = await original(...args);
      if (isHit) throw new Error("injected failure");
      return result;
    }) as never);
  }

  const CASES: ReadonlyArray<{
    name: string;
    step: SplitStep;
    inject: (ids: { id: string }) => void;
  }> = [
    {
      name: "after the snapshot",
      step: "snapshot",
      inject: () => failAfter(revisionCore, "createRevision"),
    },
    {
      name: "inside the new document's placement (the builder cleans up itself)",
      step: "create-document",
      inject: () =>
        vi
          .spyOn(crud, "reorderResourcesCore")
          .mockRejectedValueOnce(new Error("injected failure")),
    },
    {
      name: "after the new document (the annotation move fails before it writes)",
      step: "move-annotations",
      inject: () => {
        // The builder itself calls mutateSidecar (placement), so the injected
        // failure waits until the builder has returned.
        let isCreated = false;
        const real = newDocument.createSplitDocument as unknown as AnyFn;
        vi.spyOn(newDocument, "createSplitDocument").mockImplementation((async (
          ...args: unknown[]
        ) => {
          const result = await real(...args);
          isCreated = true;
          return result;
        }) as never);
        failAfter(sidecarModule, "mutateSidecar", () => isCreated, {
          isBefore: true,
        });
      },
    },
    {
      name: "after the annotations moved",
      step: "move-annotations",
      inject: ({ id }) =>
        failAfter(sidecarModule, "mutateSidecar", (args) => args[1] === id),
    },
    {
      name: "after the exclusion was seeded",
      step: "seed-exclusion",
      inject: () => failAfter(savedDefaults, "seedCompileExclusion"),
    },
    {
      name: "after the truncation",
      step: "truncate",
      inject: () => failAfter(revisionCore, "writeCanonicalContentWithoutLog"),
    },
    {
      name: "after the lineage record",
      step: "write-records",
      inject: () => failAfter(records, "writeLineageEntry"),
    },
    {
      name: "after the latest-operation record",
      step: "write-records",
      inject: () => failAfter(records, "writeLatestOperation"),
    },
  ];

  describe.each(CASES)("a failure $name", ({ step, inject }) => {
    it("undoes the earlier steps and leaves the directory as it was", async () => {
      const { id, request } = await setup();
      const before = await snapshot();
      const hasTrashBefore = before.has(".trash/");
      inject({ id });
      const result = await applySplit(projectId, request);
      expect(result).toMatchObject({
        outcome: "failed",
        failedStep: step,
        remainingState: "original-restored",
      });
      expect(result).not.toHaveProperty("newDocumentId");
      vi.restoreAllMocks();
      const after = await snapshot();
      expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
      for (const [key, value] of before)
        expect(after.get(key), key).toBe(value);
      // Compensation leaves no empty Trash directories and no diagnostics
      // record of the discarded document.
      expect(after.has(".trash/")).toBe(hasTrashBefore);
      const diagnostics = JSON.parse(
        after.get("meta/index/diagnostics.json") ?? "{}",
      ) as Record<string, unknown>;
      expect(Object.keys(diagnostics).sort()).toEqual(
        Object.keys(
          JSON.parse(before.get("meta/index/diagnostics.json") ?? "{}"),
        ).sort(),
      );
      // The tree lists only the two documents.
      const listed = (await fs.readdir(path.join(projectPath, "meta"))).filter(
        (n) => /^resource-.*\.meta\.json$/.test(n),
      );
      const beforeListed = [...before.keys()].filter((k) =>
        /^meta\/resource-.*\.meta\.json$/.test(k),
      );
      expect(listed).toHaveLength(beforeListed.length);
    });
  });

  it("covers every write step of the order with at least one case", () => {
    const covered = new Set(CASES.map((c) => c.step));
    for (const step of SPLIT_STEPS) {
      if (step === "lock-original") continue;
      expect(covered.has(step), step).toBe(true);
    }
  });

  it("allows the metadataRevision counter to advance and nothing else in project.json to differ", async () => {
    const { id, request } = await setup();
    const before = await readJson("project.json");
    const counterBefore = await counter();
    failAfter(revisionCore, "writeCanonicalContentWithoutLog");
    const result = await applySplit(projectId, request);
    expect(result.outcome).toBe("failed");
    vi.restoreAllMocks();
    await flushIndexer();
    expect(await counter()).toBeGreaterThanOrEqual(counterBefore);
    const after = await readJson("project.json");
    const strip = (p: Record<string, unknown>): string =>
      withoutCounter(JSON.stringify(p));
    expect(strip(after)).toBe(strip(before));
    expect(id).toBeTruthy();
  });

  it("clears the preserve flag before it deletes the snapshot; deleting a preserved snapshot is refused", async () => {
    const { id, request } = await setup();
    const preserve = vi.spyOn(revisionCore, "setRevisionPreserve");
    const remove = vi.spyOn(revisionCore, "deleteRevision");
    failAfter(revisionCore, "writeCanonicalContentWithoutLog");
    const result = await applySplit(projectId, request);
    expect(result.outcome).toBe("failed");
    expect(preserve).toHaveBeenCalledTimes(1);
    expect(preserve.mock.calls[0][3]).toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(preserve.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0],
    );
    const revisions = await listRevisions(projectPath, id);
    expect(revisions.some((r) => r.metadata?.splitSnapshot)).toBe(false);
  });

  it("shows that skipping the flag would be refused: a preserved snapshot cannot be deleted directly", async () => {
    const { id, request } = await setup();
    const applied = await applySplit(projectId, request);
    if (applied.outcome !== "applied") throw new Error(applied.outcome);
    await expect(
      deleteRevision(projectPath, id, applied.snapshotRevisionId),
    ).rejects.toThrow(PROTECTED_REVISION_DELETE_MESSAGE);
    await revisionCore.setRevisionPreserve(
      projectPath,
      id,
      applied.snapshotRevisionId,
      false,
    );
    await deleteRevision(projectPath, id, applied.snapshotRevisionId);
    expect(
      (await listRevisions(projectPath, id)).some(
        (r) => r.metadata?.splitSnapshot,
      ),
    ).toBe(false);
  });

  it("does not run the derived-index update or a rebuild during compensation", async () => {
    const { request } = await setup();
    const update = vi.spyOn(indexUpdate, "updateDocumentIndexes");
    const rebuilt = vi.spyOn(rebuild, "rebuildDerivedIndexes");
    failAfter(records, "writeLatestOperation");
    await applySplit(projectId, request);
    expect(update).not.toHaveBeenCalled();
    expect(rebuilt).not.toHaveBeenCalled();
  });

  describe("a step that cannot be undone is returned with the state that remains", () => {
    it("truncation: the original stays shortened, the snapshot is kept", async () => {
      const { id, request } = await setup();
      let isFailing = false;
      const realTruncate =
        revisionCore.writeCanonicalContentWithoutLog as unknown as AnyFn;
      // The real truncation runs, then fails; from then on content.bin writes
      // fail, which is what restoring the original needs.
      vi.spyOn(
        revisionCore,
        "writeCanonicalContentWithoutLog",
      ).mockImplementation((async (...args: unknown[]) => {
        await realTruncate(...args);
        isFailing = true;
        throw new Error("injected failure");
      }) as never);
      const realWrite = io.atomicWriteFile as unknown as AnyFn;
      vi.spyOn(io, "atomicWriteFile").mockImplementation((async (
        ...args: unknown[]
      ) => {
        if (isFailing && String(args[0]).endsWith("content.bin"))
          throw new Error("injected compensation failure");
        return realWrite(...args);
      }) as never);
      const result = await applySplit(projectId, request);
      expect(result).toMatchObject({
        outcome: "failed",
        failedStep: "truncate",
        remainingState: "original-truncated",
      });
      vi.restoreAllMocks();
      const revisions = await listRevisions(projectPath, id);
      expect(revisions.some((r) => r.metadata?.splitSnapshot)).toBe(true);
    });

    it("snapshot removal: everything else is restored, the snapshot is kept", async () => {
      const { id, request } = await setup();
      failAfter(records, "writeLatestOperation");
      vi.spyOn(revisionCore, "deleteRevision").mockRejectedValue(
        new Error("injected compensation failure"),
      );
      const result = await applySplit(projectId, request);
      expect(result).toMatchObject({
        outcome: "failed",
        failedStep: "write-records",
        remainingState: "snapshot-revision-kept",
      });
      vi.restoreAllMocks();
      expect(
        (await listRevisions(projectPath, id)).some(
          (r) => r.metadata?.splitSnapshot,
        ),
      ).toBe(true);
    });

    it("new document removal: the new document remains", async () => {
      const { request } = await setup();
      failAfter(records, "writeLatestOperation");
      vi.spyOn(newDocument, "removeSplitDocument").mockRejectedValue(
        new Error("injected compensation failure"),
      );
      const result = await applySplit(projectId, request);
      expect(result).toMatchObject({
        outcome: "failed",
        remainingState: "new-document-remains",
      });
    });

    it("annotation restore: state unknown, and the new document is kept because it holds the notes", async () => {
      const { id, request } = await setup();
      const countBefore = (
        await fs.readdir(path.join(projectPath, "meta"))
      ).filter((n) => /^resource-.*\.meta\.json$/.test(n)).length;
      failAfter(savedDefaults, "seedCompileExclusion");
      const realMutate = sidecarModule.mutateSidecar as unknown as AnyFn;
      let originalCalls = 0;
      vi.spyOn(sidecarModule, "mutateSidecar").mockImplementation((async (
        ...args: unknown[]
      ) => {
        if (args[1] === id) {
          originalCalls += 1;
          // First call is the move out of the original; the second is its restore.
          if (originalCalls === 2)
            throw new Error("injected compensation failure");
        }
        return realMutate(...args);
      }) as never);
      const result = await applySplit(projectId, request);
      expect(result).toMatchObject({
        outcome: "failed",
        failedStep: "seed-exclusion",
        remainingState: "state-unknown",
      });
      vi.restoreAllMocks();
      const documents = (
        await fs.readdir(path.join(projectPath, "meta"))
      ).filter((n) => /^resource-.*\.meta\.json$/.test(n));
      expect(documents).toHaveLength(countBefore + 1);
    });

    it("two failed undo steps give state unknown", async () => {
      const { request } = await setup();
      failAfter(records, "writeLatestOperation");
      vi.spyOn(revisionCore, "deleteRevision").mockRejectedValue(
        new Error("injected compensation failure"),
      );
      vi.spyOn(newDocument, "removeSplitDocument").mockRejectedValue(
        new Error("injected compensation failure"),
      );
      const result = await applySplit(projectId, request);
      expect(result).toMatchObject({
        outcome: "failed",
        remainingState: "state-unknown",
      });
    });

    it("each returned state has a text that says the split did not finish", () => {
      for (const state of [
        "original-restored",
        "snapshot-revision-kept",
        "new-document-remains",
        "original-truncated",
        "state-unknown",
      ] as const) {
        expect(describeSplitFailure("truncate", state)).toMatch(
          /did not finish/,
        );
      }
    });
  });

  it("an applied split still reads as applied, with the records in place", async () => {
    const { request } = await setup();
    const result = await applySplit(projectId, request);
    expect(result.outcome).toBe("applied");
    expect(await readJson("meta/latest-operation.json")).toMatchObject({
      kind: "split",
    });
  });
});
