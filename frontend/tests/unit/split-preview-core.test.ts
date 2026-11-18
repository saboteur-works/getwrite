/**
 * Feature 120, Task 19: the preview and staleness core of a split (FR-7 server
 * half, FR-12 data). Real-directory tests: a project is scaffolded, documents
 * with marks and annotations are written, and the read runs against them.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import * as locks from "../../src/lib/models/locks";
import * as sidecarModule from "../../src/lib/models/sidecar";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { listRevisions } from "../../src/lib/models/revision";
import { readRevision } from "../../src/lib/models/revision-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";
import { countWords } from "../../src/lib/word-count";
import type {
  Annotation,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";
import {
  evaluateSplitRequest,
  hashSplitContent,
  previewSplit,
  revisionContentLockKey,
  SplitLockKeyError,
  type SplitPreviewRequest,
} from "../../src/lib/models/split-preview-core";
import { SPLIT_REFUSAL_REASONS } from "../../src/lib/models/split-types";

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

function marked(text: string, id: string): TipTapNode {
  return {
    type: "text",
    text,
    marks: [{ type: "annotation", attrs: { id } }],
  } as TipTapNode;
}

function plain(text: string): TipTapNode {
  return { type: "text", text } as TipTapNode;
}

function para(...content: TipTapNode[]): TipTapNode {
  return { type: "paragraph", content } as TipTapNode;
}

/** Five words before the cursor, five after; annotations on both sides and across. */
const DOC: TipTapDocument = {
  type: "doc",
  content: [
    para(plain("Alpha "), marked("beta", ID.before), plain(" gamma.")),
    para(plain("Delta "), marked("epsilon zeta", ID.span)),
    para(plain("Eta "), marked("theta", ID.claim)),
    para(marked("Iota", ID.note), plain(" "), marked("kappa.", ID.citation)),
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

describe("hashSplitContent (pure)", () => {
  const inputs = [
    "",
    "abc",
    "The quick brown fox jumps over the lazy dog",
    "café — 中文 😀",
    "x".repeat(55),
    "x".repeat(56),
    "x".repeat(63),
    "x".repeat(64),
    "x".repeat(119),
    "x".repeat(120),
    JSON.stringify(DOC),
  ];

  it.each(inputs.map((s) => [s.length, s] as const))(
    "equals SHA-256 hex for an input of %i characters",
    (_length, input) => {
      expect(hashSplitContent(input)).toBe(
        createHash("sha256").update(input, "utf8").digest("hex"),
      );
    },
  );

  it("differs when one character differs", () => {
    expect(hashSplitContent("abc")).not.toBe(hashSplitContent("abd"));
  });
});

describe("revisionContentLockKey", () => {
  it("is the key revision-core takes, for an absolute root", () => {
    const root = path.join(os.tmpdir(), "getwrite-lock-key", "project");
    const id = generateUUID();
    expect(revisionContentLockKey(root, id)).toBe(
      `revision-content:${path.resolve(root)}:${id}`,
    );
  });

  it("refuses a root that is not absolute, so a different key is never used silently", () => {
    expect(() =>
      revisionContentLockKey("relative/project", generateUUID()),
    ).toThrow(SplitLockKeyError);
  });
});

describe("split preview on a real project", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-split-preview-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Split Preview",
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
    doc: TipTapDocument = DOC,
    annotations: Annotation[] = ANNOTATIONS,
    sidecarExtra: Record<string, unknown> = {},
  ): Promise<string> {
    const resource = await createResourceCore(projectId, {
      name: "Chapter 1",
      type: "text",
      text: { tiptap: doc },
    });
    await sidecarModule.mutateSidecar(projectPath, resource.id, (current) => ({
      ...(current ?? {}),
      ...sidecarExtra,
      annotations: annotations as never,
    }));
    await flushIndexer();
    return resource.id;
  }

  async function requestFor(
    resourceId: string,
    offset: number,
  ): Promise<SplitPreviewRequest> {
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
    };
  }

  const offsetAt = (needle: string): number => {
    const text = tiptapToPlainText(DOC);
    const at = text.indexOf(needle);
    if (at === -1) throw new Error("needle not in fixture");
    return at + needle.length;
  };

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

  it("returns the word count of each half as countWords over tiptapToPlainText", async () => {
    const id = await makeDoc();
    const result = await previewSplit(
      projectId,
      await requestFor(id, offsetAt(CUT_AFTER)),
    );
    if (result.outcome !== "preview") throw new Error(result.outcome);
    expect(result.firstHalfWords).toBe(
      countWords("Alpha beta gamma.\nDelta epsilon"),
    );
    expect(result.firstHalfWords).toBe(5);
    expect(result.secondHalfWords).toBe(5);
    expect(result.firstHalfWords + result.secondHalfWords).toBe(
      countWords(tiptapToPlainText(DOC)),
    );
    expect(result.documentName).toBe("Chapter 1");
    expect(result.defaultNewName).toBe("Chapter 1 (part 2)");
    expect(result.offset).toBe(offsetAt(CUT_AFTER));
  });

  it("groups the annotations anchored in the moving text by kind, with ids and bodies", async () => {
    const id = await makeDoc();
    const result = await previewSplit(
      projectId,
      await requestFor(id, offsetAt(CUT_AFTER)),
    );
    if (result.outcome !== "preview") throw new Error(result.outcome);
    expect(result.anchored.claims).toEqual([
      { id: ID.claim, body: "claim after", kind: "claim" },
    ]);
    expect(result.anchored.citations).toEqual([
      { id: ID.citation, body: "citation after", kind: "citation" },
    ]);
    expect(result.anchored.notes).toEqual([
      { id: ID.note, body: "note after", kind: "note" },
    ]);
  });

  it("lists the annotation that spans the cursor as staying, and not one wholly before it", async () => {
    const id = await makeDoc();
    const result = await previewSplit(
      projectId,
      await requestFor(id, offsetAt(CUT_AFTER)),
    );
    if (result.outcome !== "preview") throw new Error(result.outcome);
    expect(result.spanning).toEqual([
      { id: ID.span, body: "note across", kind: "note" },
    ]);
    const everyId = [
      ...result.anchored.notes,
      ...result.anchored.citations,
      ...result.anchored.claims,
      ...result.spanning,
    ].map((a) => a.id);
    expect(everyId).not.toContain(ID.before);
  });

  it("lists status, point of view and each custom field, with whether the document holds a value", async () => {
    const id = await makeDoc(DOC, ANNOTATIONS, {
      userMetadata: { status: "Draft", teller: "Ana" },
    });
    await fs.writeFile(
      path.join(projectPath, "project.json"),
      JSON.stringify({
        ...JSON.parse(
          await fs.readFile(path.join(projectPath, "project.json"), "utf8"),
        ),
        config: {
          ...JSON.parse(
            await fs.readFile(path.join(projectPath, "project.json"), "utf8"),
          ).config,
          metadataSchema: {
            groups: [
              {
                id: "custom",
                label: "Custom",
                fields: [
                  { key: "teller", label: "Teller", type: "text" },
                  { key: "place", label: "Place", type: "text" },
                ],
              },
            ],
          },
        },
      }),
    );
    const result = await previewSplit(
      projectId,
      await requestFor(id, offsetAt(CUT_AFTER)),
    );
    if (result.outcome !== "preview") throw new Error(result.outcome);
    const byKey = new Map(result.fields.map((f) => [f.key, f]));
    expect(byKey.get("status")).toEqual({
      key: "status",
      label: "Status",
      hasValue: true,
    });
    expect(byKey.get("pov")).toEqual({
      key: "pov",
      label: "Point of View",
      hasValue: false,
    });
    expect(byKey.get("teller")).toEqual({
      key: "teller",
      label: "Teller",
      hasValue: true,
    });
    expect(byKey.get("place")?.hasValue).toBe(false);
    expect(new Set(result.fields.map((f) => f.key)).size).toBe(
      result.fields.length,
    );
  });

  it("offers a stored userMetadata key the schema does not list, and wordCountGoal when set", async () => {
    const id = await makeDoc(DOC, ANNOTATIONS, {
      userMetadata: { legacyKey: "x" },
      wordCountGoal: 500,
    });
    const result = await previewSplit(
      projectId,
      await requestFor(id, offsetAt(CUT_AFTER)),
    );
    if (result.outcome !== "preview") throw new Error(result.outcome);
    const byKey = new Map(result.fields.map((f) => [f.key, f]));
    expect(byKey.get("legacyKey")).toEqual({
      key: "legacyKey",
      label: "legacyKey",
      hasValue: true,
    });
    expect(byKey.get("wordCountGoal")?.hasValue).toBe(true);
  });

  describe("staleness", () => {
    it("refuses a content hash that does not match, as stale, and changes nothing", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      const before = await snapshot();
      const result = await previewSplit(projectId, {
        ...request,
        contentHash: hashSplitContent("some other text"),
      });
      expect(result).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.staleCursor,
      });
      expect(await snapshot()).toEqual(before);
    });

    it("refuses a revision id that is not the canonical one, as stale", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      const result = await previewSplit(projectId, {
        ...request,
        revisionId: generateUUID(),
      });
      expect(result).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.staleCursor,
      });
    });

    it("refuses an edit made after the hash was taken", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      const { updateRevisionInPlace } =
        await import("../../src/lib/models/revision-core");
      await updateRevisionInPlace(
        projectPath,
        id,
        request.revisionId,
        JSON.stringify({
          type: "doc",
          content: [para(plain("Alpha beta gamma. Delta epsilon zeta, more."))],
        }),
      );
      const result = await previewSplit(projectId, request);
      expect(result).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.staleCursor,
      });
    });
  });

  describe("refusals of the eligibility function", () => {
    it("returns the reason for an entity document", async () => {
      const id = await makeDoc(DOC, ANNOTATIONS, { entityKind: "person" });
      const result = await previewSplit(
        projectId,
        await requestFor(id, offsetAt(CUT_AFTER)),
      );
      expect(result).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.entityDocument,
      });
    });

    it("returns the reason for a document marked as merged", async () => {
      const id = await makeDoc(DOC, ANNOTATIONS, { mergedMark: { into: "x" } });
      const result = await previewSplit(
        projectId,
        await requestFor(id, offsetAt(CUT_AFTER)),
      );
      expect(result).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.mergedDocument,
      });
    });

    it("returns the reason for a Source without needing a revision hash", async () => {
      const source = await createResourceCore(projectId, {
        name: "A source",
        type: "source",
        text: { plainText: "one two three" },
      });
      const result = await previewSplit(projectId, {
        resourceId: source.id,
        revisionId: generateUUID(),
        contentHash: "0".repeat(64),
        offset: 3,
      });
      expect(result).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.source,
      });
    });

    it("returns the reason for an image resource", async () => {
      const image = await createResourceCore(projectId, {
        name: "Picture",
        type: "image",
        image: { file: "p.png" },
      });
      const result = await previewSplit(projectId, {
        resourceId: image.id,
        revisionId: generateUUID(),
        contentHash: "0".repeat(64),
        offset: 0,
      });
      expect(result).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.mediaResource,
      });
    });

    it("returns the reason for a cursor at the start (empty first half)", async () => {
      const id = await makeDoc();
      const result = await previewSplit(projectId, await requestFor(id, 0));
      expect(result).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.emptyFirstHalf,
      });
    });

    it("returns the reason for a cursor at the end (empty second half)", async () => {
      const id = await makeDoc();
      const end = tiptapToPlainText(DOC).length;
      const result = await previewSplit(projectId, await requestFor(id, end));
      expect(result).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.emptySecondHalf,
      });
    });

    it("returns the reason for a cursor in a code block", async () => {
      const doc = {
        type: "doc",
        content: [
          para(plain("before")),
          { type: "codeBlock", content: [plain("let x = 1;")] },
          para(plain("after")),
        ],
      } as TipTapDocument;
      const id = await makeDoc(doc, []);
      const offset = tiptapToPlainText(doc).indexOf("let x") + 3;
      const result = await previewSplit(
        projectId,
        await requestFor(id, offset),
      );
      expect(result).toEqual({
        outcome: "refused",
        reason: SPLIT_REFUSAL_REASONS.cursorInCodeBlock,
      });
    });
  });

  describe("writes nothing", () => {
    it("leaves every file as it was for a preview, a stale refusal and an ineligible cursor", async () => {
      const id = await makeDoc();
      const good = await requestFor(id, offsetAt(CUT_AFTER));
      const before = await snapshot();
      const mutate = vi.spyOn(sidecarModule, "mutateSidecar");
      const write = vi.spyOn(sidecarModule, "writeSidecar");
      await previewSplit(projectId, good);
      await previewSplit(projectId, { ...good, contentHash: "0".repeat(64) });
      await previewSplit(projectId, { ...good, offset: 0 });
      expect(mutate).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("failures are not empty previews", () => {
    it("returns a failed outcome when the stored content is not a document", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      const garbage = "this is not json";
      const canonical = (await listRevisions(projectPath, id)).find(
        (r) => r.isCanonical,
      );
      await fs.writeFile(
        path.join(
          projectPath,
          "revisions",
          id,
          `v-${canonical?.versionNumber}`,
          "content.bin",
        ),
        garbage,
      );
      const result = await previewSplit(projectId, {
        ...request,
        contentHash: hashSplitContent(garbage),
      });
      expect(result.outcome).toBe("failed");
      expect(result).not.toHaveProperty("firstHalfWords");
    });

    it("returns a failed outcome for an unreadable sidecar", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      await fs.writeFile(
        path.join(projectPath, "meta", `resource-${id}.meta.json`),
        "{ not json",
      );
      const result = await previewSplit(projectId, request);
      expect(result.outcome).toBe("failed");
    });

    it("returns a failed outcome, distinct from a refusal, for a resource with no sidecar", async () => {
      const result = await previewSplit(projectId, {
        resourceId: generateUUID(),
        revisionId: generateUUID(),
        contentHash: "0".repeat(64),
        offset: 3,
      });
      expect(result.outcome).toBe("failed");
    });

    it("rethrows the locked-access error and returns no preview", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      vi.spyOn(sidecarModule, "readSidecar").mockRejectedValueOnce(
        new ProjectLockedError(projectId),
      );
      await expect(previewSplit(projectId, request)).rejects.toBeInstanceOf(
        ProjectLockedError,
      );
    });
  });

  describe("locks", () => {
    it("previewSplit takes the revision-content lock once; evaluateSplitRequest takes none", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      const acquire = vi.spyOn(locks, "acquireLock");
      await previewSplit(projectId, request);
      expect(acquire.mock.calls.map((c) => c[0])).toEqual([
        revisionContentLockKey(projectPath, id),
      ]);
      acquire.mockClear();
      const evaluated = await evaluateSplitRequest(projectPath, request);
      expect(evaluated.outcome).toBe("ready");
      expect(acquire).not.toHaveBeenCalled();
    });

    it("evaluateSplitRequest hands over what the apply step needs", async () => {
      const id = await makeDoc();
      const request = await requestFor(id, offsetAt(CUT_AFTER));
      const evaluated = await evaluateSplitRequest(projectPath, request);
      if (evaluated.outcome !== "ready") throw new Error(evaluated.outcome);
      expect(evaluated.revision.id).toBe(request.revisionId);
      expect(hashSplitContent(evaluated.content)).toBe(request.contentHash);
      expect(evaluated.document).toEqual(DOC);
      expect(evaluated.cut.first.content.length).toBeGreaterThan(0);
      expect(evaluated.cut.second.content.length).toBeGreaterThan(0);
      expect(evaluated.sidecar.annotations).toHaveLength(ANNOTATIONS.length);
    });
  });
});
