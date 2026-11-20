/**
 * Feature 121, Task 24: the preview and staleness core of a merge (FR-7 server
 * half, FR-11 data). Real-directory tests: a project is scaffolded, documents
 * with annotations and metadata are written, and the read runs against them.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as locks from "../../src/lib/models/locks";
import * as sidecarModule from "../../src/lib/models/sidecar";
import * as io from "../../src/lib/models/io";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { listRevisions } from "../../src/lib/models/revision";
import { readRevision } from "../../src/lib/models/revision-core";
import { softDeleteResource } from "../../src/lib/models/trash";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { countWords } from "../../src/lib/word-count";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import type {
  Annotation,
  MetadataValue,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";
import { hashSplitContent } from "../../src/lib/models/split-preview-core";
import {
  evaluateMergeRequest,
  previewMerge,
  type MergePreviewRequest,
} from "../../src/lib/models/merge-preview-core";
import { MERGE_DOCUMENT_CAP } from "../../src/lib/models/merge-limits";
import {
  MERGE_REFUSAL_REASONS,
  MERGED_MARK_SIDECAR_KEY,
} from "../../src/lib/models/merge-types";
import {
  describeMergeDocumentCap,
  MERGED_RULE_TEXTS,
  MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
  MERGE_TARGET_IN_INBOX_WARNING,
} from "../../src/lib/models/merge-messages";

const NOVEL_SPEC = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

const SOURCE_ID = "a0000000-0000-4000-8000-0000000000ff";
const FOLDER_A = "f0000000-0000-4000-8000-00000000000a";
const FOLDER_B = "f0000000-0000-4000-8000-00000000000b";
const FOLDER_INBOX = "f0000000-0000-4000-8000-0000000000ee";

function para(text: string): TipTapNode {
  return {
    type: "paragraph",
    content: text === "" ? [] : [{ type: "text", text }],
  } as TipTapNode;
}

function docOf(...paragraphs: string[]): TipTapDocument {
  return { type: "doc", content: paragraphs.map(para) } as TipTapDocument;
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

describe("merge preview on a real project", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-merge-preview-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Merge Preview",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await flushIndexer();
    if (previousEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousEnv;
    await removeDirRetry(tmp);
  });

  async function seedFolder(
    id: string,
    name: string,
    parentId?: string,
    orderIndex = 0,
  ): Promise<void> {
    const dir = path.join(projectPath, "folders", id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "folder.json"),
      JSON.stringify({ id, name, parentId, orderIndex, type: "folder" }),
    );
  }

  interface DocOpts {
    name: string;
    doc?: TipTapDocument;
    folderId?: string | null;
    orderIndex?: number;
    annotations?: Annotation[];
    sidecarExtra?: Record<string, unknown>;
  }

  async function makeDoc(opts: DocOpts): Promise<string> {
    const resource = await createResourceCore(projectId, {
      name: opts.name,
      type: "text",
      text: { tiptap: opts.doc ?? docOf(`Text of ${opts.name}.`) },
    });
    await sidecarModule.mutateSidecar(projectPath, resource.id, (current) => {
      const next: Record<string, MetadataValue> = { ...(current ?? {}) };
      if (opts.folderId !== undefined) next.folderId = opts.folderId;
      if (opts.orderIndex !== undefined) next.orderIndex = opts.orderIndex;
      if (opts.annotations)
        next.annotations = opts.annotations as unknown as MetadataValue;
      return {
        ...next,
        ...(opts.sidecarExtra as Record<string, MetadataValue>),
      };
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

  async function requestFor(ids: string[]): Promise<MergePreviewRequest> {
    return { documents: await Promise.all(ids.map(refFor)) };
  }

  async function editProject(
    edit: (config: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    const file = path.join(projectPath, "project.json");
    const project = JSON.parse(await fs.readFile(file, "utf8")) as {
      config: Record<string, unknown>;
    };
    await fs.writeFile(
      file,
      JSON.stringify({ ...project, config: edit(project.config) }),
    );
  }

  /** Every file and directory under the project: relative path -> content. */
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

  it("returns the target by name and the others in tree order with folder paths", async () => {
    await seedFolder(FOLDER_A, "Part One", undefined, 0);
    // Folders and documents are siblings ordered by orderIndex: in Part One,
    // "Early" (1) comes before the Part Two folder (3).
    await seedFolder(FOLDER_B, "Part Two", FOLDER_A, 3);
    const target = await makeDoc({ name: "Target", folderId: FOLDER_B });
    // Selected in the order late, early; tree order is early, late.
    const late = await makeDoc({
      name: "Late",
      folderId: FOLDER_B,
      orderIndex: 5,
    });
    const early = await makeDoc({
      name: "Early",
      folderId: FOLDER_A,
      orderIndex: 1,
    });
    const result = await previewMerge(
      projectId,
      await requestFor([target, late, early]),
    );
    if (result.outcome !== "preview") throw new Error(result.outcome);
    expect(result.target).toMatchObject({
      documentId: target,
      name: "Target",
      folderPath: ["Part One", "Part Two"],
    });
    expect(result.absorbed.map((a) => a.documentId)).toEqual([early, late]);
    expect(result.absorbed.map((a) => a.name)).toEqual(["Early", "Late"]);
    expect(result.absorbed.map((a) => a.folderPath)).toEqual([
      ["Part One"],
      ["Part One", "Part Two"],
    ]);
  });

  it("gives a document at the project root an empty folder path", async () => {
    const a = await makeDoc({ name: "A" });
    const b = await makeDoc({ name: "B" });
    const result = await previewMerge(projectId, await requestFor([a, b]));
    if (result.outcome !== "preview") throw new Error(result.outcome);
    expect(result.target.folderPath).toEqual([]);
    expect(result.absorbed[0].folderPath).toEqual([]);
  });

  it("returns the word count of each document as countWords over tiptapToPlainText of the stored text", async () => {
    const t = docOf("One two three.", "Four five.");
    const x = docOf("Six seven eight nine.");
    const a = await makeDoc({ name: "T", doc: t });
    const b = await makeDoc({ name: "X", doc: x });
    const result = await previewMerge(projectId, await requestFor([a, b]));
    if (result.outcome !== "preview") throw new Error(result.outcome);
    const ref = await refFor(a);
    const stored = JSON.parse(
      (await readRevision(projectPath, a, ref.revisionId)).content,
    ) as TipTapDocument;
    expect(result.target.words).toBe(countWords(tiptapToPlainText(stored)));
    expect(result.target.words).toBe(5);
    expect(result.absorbed[0].words).toBe(4);
  });

  it("groups each absorbed document's annotations by kind with ids and bodies", async () => {
    const t = await makeDoc({
      name: "T",
      annotations: [annotation("t-note", "target note")],
    });
    const x = await makeDoc({
      name: "X",
      orderIndex: 1,
      annotations: [
        annotation("x-note", "x note"),
        annotation("x-cite", "x citation", {
          target: { sourceId: SOURCE_ID, sourceName: "S" },
        }),
        annotation("x-claim", "x claim", {
          claim: {
            status: "unverified",
            statusChangedAt: "2026-01-01T00:00:00Z",
          },
        }),
      ],
    });
    const y = await makeDoc({
      name: "Y",
      orderIndex: 2,
      annotations: [annotation("y-note", "y note")],
    });
    const result = await previewMerge(projectId, await requestFor([t, x, y]));
    if (result.outcome !== "preview") throw new Error(result.outcome);
    expect(result.annotations).toEqual([
      {
        documentId: x,
        notes: [{ id: "x-note", body: "x note" }],
        citations: [{ id: "x-cite", body: "x citation" }],
        claims: [{ id: "x-claim", body: "x claim" }],
      },
      {
        documentId: y,
        notes: [{ id: "y-note", body: "y note" }],
        citations: [],
        claims: [],
      },
    ]);
  });

  it("lists each metadata field that an absorbed document holds, with each source's value", async () => {
    const t = await makeDoc({
      name: "T",
      sidecarExtra: { userMetadata: { status: "Draft" } },
    });
    const x = await makeDoc({
      name: "X",
      orderIndex: 1,
      sidecarExtra: { userMetadata: { status: "Final", teller: "Ana" } },
    });
    const y = await makeDoc({
      name: "Y",
      orderIndex: 2,
      sidecarExtra: { userMetadata: { teller: "Ben" } },
    });
    const result = await previewMerge(projectId, await requestFor([t, x, y]));
    if (result.outcome !== "preview") throw new Error(result.outcome);
    expect(result.metadata).toEqual([
      { field: "status", values: [{ documentId: x, value: "Final" }] },
      {
        field: "teller",
        values: [
          { documentId: x, value: "Ana" },
          { documentId: y, value: "Ben" },
        ],
      },
    ]);
  });

  it("states the merged-away rule of FR-17 to FR-20 for each absorbed document", async () => {
    const a = await makeDoc({ name: "A" });
    const b = await makeDoc({ name: "B", orderIndex: 1 });
    const c = await makeDoc({ name: "C", orderIndex: 2 });
    const result = await previewMerge(projectId, await requestFor([a, b, c]));
    if (result.outcome !== "preview") throw new Error(result.outcome);
    for (const absorbed of result.absorbed) {
      expect(absorbed.rules).toEqual([
        MERGED_RULE_TEXTS.compile,
        MERGED_RULE_TEXTS.exportAndSearch,
        MERGED_RULE_TEXTS.goals,
        MERGED_RULE_TEXTS.wordCounts,
      ]);
    }
    expect(result.warnings).toEqual([]);
  });

  describe("warnings (the merge still proceeds)", () => {
    it("warns when the target is excluded from compile and an absorbed document is not", async () => {
      const t = await makeDoc({ name: "T" });
      const x = await makeDoc({ name: "X", orderIndex: 1 });
      await editProject((config) => ({
        ...config,
        compileDefaults: { excludedResourceIds: [t] },
      }));
      const result = await previewMerge(projectId, await requestFor([t, x]));
      if (result.outcome !== "preview") throw new Error(result.outcome);
      expect(result.warnings).toEqual([
        {
          kind: "target-excluded-from-compile",
          message: MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
        },
      ]);
    });

    it("does not warn about compile when every absorbed document is excluded too", async () => {
      const t = await makeDoc({ name: "T" });
      const x = await makeDoc({ name: "X", orderIndex: 1 });
      await editProject((config) => ({
        ...config,
        compileDefaults: { excludedResourceIds: [t, x] },
      }));
      const result = await previewMerge(projectId, await requestFor([t, x]));
      if (result.outcome !== "preview") throw new Error(result.outcome);
      expect(result.warnings).toEqual([]);
    });

    it("warns when the target is in the Inbox (a descendant folder counts) and an absorbed document is not", async () => {
      await seedFolder(FOLDER_INBOX, "Inbox");
      await seedFolder(FOLDER_A, "Sub", FOLDER_INBOX);
      await editProject((config) => ({
        ...config,
        inboxFolderId: FOLDER_INBOX,
      }));
      const t = await makeDoc({ name: "T", folderId: FOLDER_A });
      const x = await makeDoc({ name: "X", orderIndex: 1 });
      const result = await previewMerge(projectId, await requestFor([t, x]));
      if (result.outcome !== "preview") throw new Error(result.outcome);
      expect(result.warnings).toEqual([
        { kind: "target-in-inbox", message: MERGE_TARGET_IN_INBOX_WARNING },
      ]);
    });

    it("does not warn when an Inbox capture is merged into a chapter (the reverse case)", async () => {
      await seedFolder(FOLDER_INBOX, "Inbox");
      await editProject((config) => ({
        ...config,
        inboxFolderId: FOLDER_INBOX,
      }));
      const t = await makeDoc({ name: "Chapter" });
      const x = await makeDoc({ name: "Capture", folderId: FOLDER_INBOX });
      const result = await previewMerge(projectId, await requestFor([t, x]));
      if (result.outcome !== "preview") throw new Error(result.outcome);
      expect(result.warnings).toEqual([]);
    });

    it("returns both warnings when both conditions hold", async () => {
      await seedFolder(FOLDER_INBOX, "Inbox");
      const t = await makeDoc({ name: "T", folderId: FOLDER_INBOX });
      const x = await makeDoc({ name: "X", orderIndex: 1 });
      await editProject((config) => ({
        ...config,
        inboxFolderId: FOLDER_INBOX,
        compileDefaults: { excludedResourceIds: [t] },
      }));
      const result = await previewMerge(projectId, await requestFor([t, x]));
      if (result.outcome !== "preview") throw new Error(result.outcome);
      expect(result.warnings.map((w) => w.kind)).toEqual([
        "target-excluded-from-compile",
        "target-in-inbox",
      ]);
    });
  });

  describe("refusals", () => {
    it("refuses a content hash mismatch as stale", async () => {
      const a = await makeDoc({ name: "A" });
      const b = await makeDoc({ name: "B", orderIndex: 1 });
      const request = await requestFor([a, b]);
      request.documents[1] = { ...request.documents[1], contentHash: "0" };
      const result = await previewMerge(projectId, request);
      expect(result).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.staleContent,
        documentId: b,
      });
    });

    it("refuses a canonical revision mismatch as stale", async () => {
      const a = await makeDoc({ name: "A" });
      const b = await makeDoc({ name: "B", orderIndex: 1 });
      const request = await requestFor([a, b]);
      request.documents[0] = {
        ...request.documents[0],
        revisionId: generateUUID(),
      };
      const result = await previewMerge(projectId, request);
      expect(result).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.staleContent,
        documentId: a,
      });
    });

    it("refuses a count over the cap with the cap text, before reading any document", async () => {
      const a = await makeDoc({ name: "A" });
      const documents = Array.from({ length: MERGE_DOCUMENT_CAP + 1 }, () => ({
        resourceId: a,
        revisionId: "r",
        contentHash: "h",
      }));
      const readSidecar = vi.spyOn(sidecarModule, "readSidecar");
      const result = await previewMerge(projectId, { documents });
      expect(result).toEqual({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.tooManyDocuments,
        documentId: null,
        message: describeMergeDocumentCap(MERGE_DOCUMENT_CAP),
      });
      expect(readSidecar).not.toHaveBeenCalled();
    });

    it("accepts a selection of exactly the cap", async () => {
      const ids: string[] = [];
      for (let i = 0; i < MERGE_DOCUMENT_CAP; i++) {
        ids.push(await makeDoc({ name: `D${i}`, orderIndex: i }));
      }
      const result = await previewMerge(projectId, await requestFor(ids));
      expect(result.outcome).toBe("preview");
    });

    it("returns the eligibility refusal for an ineligible selection, naming the document", async () => {
      const a = await makeDoc({ name: "A" });
      const merged = await makeDoc({
        name: "Merged",
        orderIndex: 1,
        sidecarExtra: {
          [MERGED_MARK_SIDECAR_KEY]: {
            targetDocumentId: a,
            targetSnapshotRevisionId: "r",
            date: "2026-01-01T00:00:00.000Z",
          },
        },
      });
      const result = await previewMerge(
        projectId,
        await requestFor([a, merged]),
      );
      expect(result).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.mergedAbsorbed,
        documentId: merged,
      });
      expect(typeof (result as { message: string }).message).toBe("string");
    });

    it("refuses a single document and a repeated id", async () => {
      const a = await makeDoc({ name: "A" });
      expect(
        await previewMerge(projectId, await requestFor([a])),
      ).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.fewerThanTwo,
      });
      expect(
        await previewMerge(projectId, await requestFor([a, a])),
      ).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.repeatedId,
        documentId: a,
      });
    });

    it("refuses a document in Trash as in Trash, not as missing", async () => {
      const a = await makeDoc({ name: "A" });
      const b = await makeDoc({ name: "B", orderIndex: 1 });
      const request = await requestFor([a, b]);
      await softDeleteResource(projectPath, b);
      expect(await previewMerge(projectId, request)).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.documentInTrash,
        documentId: b,
      });
    });

    it("refuses a document that does not exist as missing", async () => {
      const a = await makeDoc({ name: "A" });
      const result = await previewMerge(projectId, {
        documents: [
          await refFor(a),
          { resourceId: generateUUID(), revisionId: "r", contentHash: "h" },
        ],
      });
      expect(result).toMatchObject({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.missingDocument,
      });
    });
  });

  describe("writes nothing", () => {
    it("leaves every file as it was, and calls no write, for a preview and each refusal", async () => {
      const a = await makeDoc({
        name: "A",
        annotations: [annotation("a1", "n")],
      });
      const b = await makeDoc({ name: "B", orderIndex: 1 });
      const good = await requestFor([a, b]);
      const before = await snapshot();
      const spies = [
        vi.spyOn(sidecarModule, "mutateSidecar"),
        vi.spyOn(sidecarModule, "writeSidecar"),
        vi.spyOn(io, "writeFile"),
        vi.spyOn(io, "atomicWriteFile"),
        vi.spyOn(io, "mkdir"),
      ];
      await previewMerge(projectId, good);
      await previewMerge(projectId, {
        documents: [
          good.documents[0],
          { ...good.documents[1], contentHash: "0" },
        ],
      });
      await previewMerge(projectId, { documents: [good.documents[0]] });
      await previewMerge(projectId, {
        documents: Array.from(
          { length: MERGE_DOCUMENT_CAP + 1 },
          () => good.documents[0],
        ),
      });
      await previewMerge(projectId, {
        documents: [
          good.documents[0],
          { ...good.documents[1], resourceId: "bad" },
        ],
      });
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("failures are not empty previews", () => {
    it("returns a failed outcome when a stored text is not a document", async () => {
      const a = await makeDoc({ name: "A" });
      const b = await makeDoc({ name: "B", orderIndex: 1 });
      const garbage = "this is not json";
      const ref = await refFor(b);
      const canonical = (await listRevisions(projectPath, b)).find(
        (r) => r.isCanonical,
      );
      await fs.writeFile(
        path.join(
          projectPath,
          "revisions",
          b,
          `v-${canonical?.versionNumber}`,
          "content.bin",
        ),
        garbage,
      );
      const result = await previewMerge(projectId, {
        documents: [
          await refFor(a),
          { ...ref, contentHash: hashSplitContent(garbage) },
        ],
      });
      expect(result).toEqual({
        outcome: "failed",
        cause: "content-not-a-document",
      });
    });

    it("returns a failed outcome for an unreadable sidecar", async () => {
      const a = await makeDoc({ name: "A" });
      const b = await makeDoc({ name: "B", orderIndex: 1 });
      const request = await requestFor([a, b]);
      await fs.writeFile(
        path.join(projectPath, "meta", `resource-${b}.meta.json`),
        "{ not json",
      );
      const result = await previewMerge(projectId, request);
      expect(result).toEqual({
        outcome: "failed",
        cause: "sidecar-unreadable",
      });
    });

    it("returns a failed outcome when project.json cannot be read", async () => {
      const a = await makeDoc({ name: "A" });
      const b = await makeDoc({ name: "B", orderIndex: 1 });
      const request = await requestFor([a, b]);
      await fs.writeFile(path.join(projectPath, "project.json"), "{ not json");
      const result = await previewMerge(projectId, request);
      expect(result).toEqual({
        outcome: "failed",
        cause: "project-unreadable",
      });
    });

    it("returns a failed outcome when a document's folder cannot be found, never an empty path", async () => {
      const a = await makeDoc({ name: "A" });
      const b = await makeDoc({ name: "B", orderIndex: 1, folderId: FOLDER_A });
      const result = await previewMerge(projectId, await requestFor([a, b]));
      expect(result).toEqual({ outcome: "failed", cause: "folder-not-found" });
    });

    it("returns a failed outcome for stored annotations that are not a list of notes", async () => {
      const a = await makeDoc({ name: "A" });
      const b = await makeDoc({
        name: "B",
        orderIndex: 1,
        sidecarExtra: { annotations: "nope" },
      });
      const result = await previewMerge(projectId, await requestFor([a, b]));
      expect(result).toEqual({
        outcome: "failed",
        cause: "annotations-unreadable",
      });
    });

    it("rethrows the locked-access error and returns no preview", async () => {
      const a = await makeDoc({ name: "A" });
      const b = await makeDoc({ name: "B", orderIndex: 1 });
      const request = await requestFor([a, b]);
      vi.spyOn(sidecarModule, "readSidecar").mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );
      await expect(previewMerge(projectId, request)).rejects.toBeInstanceOf(
        ProjectLockedError,
      );
    });
  });

  describe("locks", () => {
    it("previewMerge takes each revision-content lock once in ascending id order; evaluateMergeRequest takes none", async () => {
      const a = await makeDoc({ name: "A" });
      const b = await makeDoc({ name: "B", orderIndex: 1 });
      const c = await makeDoc({ name: "C", orderIndex: 2 });
      const request = await requestFor([c, a, b]);
      const acquire = vi.spyOn(locks, "acquireLock");
      await previewMerge(projectId, request);
      const keys = acquire.mock.calls.map((call) => call[0]);
      expect(keys).toHaveLength(3);
      expect(keys).toEqual([...keys].sort());
      acquire.mockClear();
      const evaluated = await evaluateMergeRequest(projectPath, request);
      expect(evaluated.outcome).toBe("ready");
      expect(acquire).not.toHaveBeenCalled();
    });

    it("evaluateMergeRequest hands over what the apply step needs", async () => {
      const a = await makeDoc({ name: "A", doc: docOf("Alpha.") });
      const b = await makeDoc({
        name: "B",
        orderIndex: 1,
        doc: docOf("Beta."),
      });
      const request = await requestFor([a, b]);
      const evaluated = await evaluateMergeRequest(projectPath, request);
      if (evaluated.outcome !== "ready") throw new Error(evaluated.outcome);
      expect(evaluated.documents.map((d) => d.resourceId)).toEqual([a, b]);
      expect(evaluated.documents[0].revision.id).toBe(
        request.documents[0].revisionId,
      );
      expect(hashSplitContent(evaluated.documents[1].content)).toBe(
        request.documents[1].contentHash,
      );
      expect(evaluated.documents[1].document).toEqual(docOf("Beta."));
    });
  });
});
