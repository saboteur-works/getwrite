/**
 * Feature 103, Task 25 (FR-21 locator rules, FR-24 record): the optional
 * annotation `target` `{ sourceId, attachmentId?, excerptId?, locator?,
 * sourceName? }` is declared in the type, `AnnotationSchema`, the key list,
 * the validators and the client response schema; a bad target is refused
 * with a message and nothing is stored; an annotation without a target is
 * unchanged byte for byte. Real files, real locks.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  ANNOTATION_LIMITS,
  validateAnnotationTarget,
  validateNewAnnotation,
} from "../../src/lib/models/annotation-validation";
import {
  addAnnotationCore,
  InvalidAnnotationError,
  listAnnotationsCore,
} from "../../src/lib/models/annotations-core";
import { AnnotationSchema } from "../../src/lib/models/schemas";
import type {
  Annotation,
  AnnotationTarget,
  MetadataValue,
} from "../../src/lib/models/types";
import { httpAnnotationsTransport } from "../../src/lib/api/annotations";
import { removeDirRetry } from "./helpers/fs-utils";

const ID_A = "550e8400-e29b-41d4-a716-446655440010";
const ID_B = "550e8400-e29b-41d4-a716-446655440011";
const ID_C = "550e8400-e29b-41d4-a716-446655440012";
const NOW = "2026-11-04T00:00:00.000Z";
const T0 = "1970-01-01T00:00:00.000Z";

const fullTarget: AnnotationTarget = {
  sourceId: ID_B,
  attachmentId: ID_C,
  excerptId: ID_A,
  locator: { type: "timestamp", value: "01:02:03" },
  sourceName: "Interview tape",
};

describe("validateAnnotationTarget", () => {
  it("accepts a full target and returns it unchanged", () => {
    expect(validateAnnotationTarget(fullTarget)).toEqual({
      ok: true,
      value: fullTarget,
    });
  });

  it("accepts a target with only a sourceId, and a locator without a type", () => {
    expect(validateAnnotationTarget({ sourceId: ID_B }).ok).toBe(true);
    const r = validateAnnotationTarget({
      sourceId: ID_B,
      locator: { value: "chapter 2, near the end" },
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a timestamp locator whatever its text (not checked against the attachment)", () => {
    const r = validateAnnotationTarget({
      sourceId: ID_B,
      attachmentId: ID_C,
      locator: { type: "timestamp", value: "999:99:99 or about then" },
    });
    expect(r.ok).toBe(true);
  });

  it.each(["page", "timestamp", "paragraph", "line"])(
    "accepts locator type %s",
    (type) => {
      expect(
        validateAnnotationTarget({
          sourceId: ID_B,
          locator: { type, value: "1" },
        }).ok,
      ).toBe(true);
    },
  );

  it.each([
    ["a non-object", "x"],
    ["null", null],
    ["an array", [{ sourceId: ID_B }]],
    ["a missing sourceId", {}],
    ["a malformed sourceId", { sourceId: "not-an-id" }],
    ["a malformed attachmentId", { sourceId: ID_B, attachmentId: "../x" }],
    ["a malformed excerptId", { sourceId: ID_B, excerptId: 5 }],
    ["an unknown key", { sourceId: ID_B, page: 3 }],
    [
      "an unknown locator key",
      { sourceId: ID_B, locator: { value: "1", x: 1 } },
    ],
    ["a locator that is not an object", { sourceId: ID_B, locator: "p. 3" }],
    ["a locator with no value", { sourceId: ID_B, locator: { type: "page" } }],
    ["an empty locator value", { sourceId: ID_B, locator: { value: "" } }],
    [
      "a locator type outside the four",
      { sourceId: ID_B, locator: { type: "chapter", value: "1" } },
    ],
    [
      "a locator over its limit",
      {
        sourceId: ID_B,
        locator: { value: "x".repeat(ANNOTATION_LIMITS.locatorValueMax + 1) },
      },
    ],
    [
      "a sourceName over the limit",
      {
        sourceId: ID_B,
        sourceName: "n".repeat(ANNOTATION_LIMITS.sourceNameMax + 1),
      },
    ],
    ["a sourceName that is not a string", { sourceId: ID_B, sourceName: 3 }],
  ])("refuses %s with a message", (_label, input) => {
    const r = validateAnnotationTarget(input);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message.length).toBeGreaterThan(0);
    expect(!r.ok && r.message).toContain("target");
  });

  it("accepts a locator and a sourceName exactly at their limits", () => {
    const r = validateAnnotationTarget({
      sourceId: ID_B,
      locator: { value: "x".repeat(ANNOTATION_LIMITS.locatorValueMax) },
      sourceName: "n".repeat(ANNOTATION_LIMITS.sourceNameMax),
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateNewAnnotation with a target", () => {
  const base = { id: ID_A, body: "note", quote: "passage" };

  it("accepts and returns a valid target", () => {
    expect(validateNewAnnotation({ ...base, target: fullTarget }, [])).toEqual({
      ok: true,
      value: { ...base, target: fullTarget },
    });
  });

  it("returns no target key when none is supplied", () => {
    const r = validateNewAnnotation(base, []);
    expect(r.ok && "target" in r.value).toBe(false);
  });

  it("refuses an invalid target", () => {
    const r = validateNewAnnotation(
      { ...base, target: { sourceId: ID_B, extra: 1 } },
      [],
    );
    expect(r.ok).toBe(false);
  });
});

describe("AnnotationSchema keeps the target", () => {
  const stored: Annotation = {
    id: ID_A,
    body: "b",
    quote: "q",
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("keeps a full target through a parse", () => {
    expect(AnnotationSchema.parse({ ...stored, target: fullTarget })).toEqual({
      ...stored,
      target: fullTarget,
    });
  });

  it("round-trips every existing annotation fixture byte-equal", () => {
    const fixtures: Annotation[] = [
      stored,
      { ...stored, id: ID_B, body: "", quote: "" },
      { ...stored, id: ID_C, body: "multi\nline é\u{1F600}", quote: "x" },
    ];
    for (const fixture of fixtures) {
      const text = JSON.stringify(fixture);
      expect(JSON.stringify(AnnotationSchema.parse(JSON.parse(text)))).toBe(
        text,
      );
    }
  });
});

describe("client parse", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the target on add and on list, and an annotation without one is unchanged", async () => {
    const withTarget = {
      id: ID_A,
      body: "b",
      quote: "q",
      target: fullTarget,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const without = { ...withTarget, id: ID_B, target: undefined };
    delete (without as { target?: unknown }).target;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ annotation: withTarget }), {
            status: 201,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ annotations: [withTarget, without] }), {
            status: 200,
          }),
        ),
    );
    const added = await httpAnnotationsTransport.add("p", "r", {
      id: ID_A,
      body: "b",
      quote: "q",
      target: fullTarget,
    });
    expect(added.target).toEqual(fullTarget);
    const listed = await httpAnnotationsTransport.list("p", "r");
    expect(listed[0]!.target).toEqual(fullTarget);
    expect(JSON.stringify(listed[1])).toBe(JSON.stringify(without));
  });
});

describe("annotation core with a target", () => {
  let batchRoot = "";
  let projectId = "";
  let projectRoot = "";
  let resourceId = "";
  const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

  const sidecarFile = (): string =>
    path.join(projectRoot, "meta", `resource-${resourceId}.meta.json`);

  beforeEach(async () => {
    batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-ann-target-"));
    process.env.GETWRITE_PROJECTS_DIR = batchRoot;
    projectId = generateUUID();
    projectRoot = path.join(batchRoot, projectId);
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, PROJECT_FILENAME),
      JSON.stringify(createProject({ name: "annotation-target" })),
      "utf8",
    );
    resourceId = generateUUID();
    await writeSidecar(projectRoot, resourceId, {
      id: resourceId,
      slug: "r",
      type: "text",
      name: "R",
      orderIndex: 0,
      folderId: null,
      createdAt: T0,
      updatedAt: T0,
      wordCount: 4,
      userMetadata: {},
    } as Record<string, MetadataValue>);
  });

  afterEach(async () => {
    await flushIndexer();
    if (originalProjectsDir === undefined)
      delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
    await removeDirRetry(batchRoot);
  });

  it("stores a target and lists it back", async () => {
    const id = generateUUID();
    const stored = await addAnnotationCore(projectId, resourceId, {
      id,
      body: "cited",
      quote: "q",
      target: fullTarget,
    });
    expect(stored.target).toEqual(fullTarget);
    const listed = await listAnnotationsCore(projectId, resourceId);
    expect(listed).toEqual([stored]);
    const onDisk = JSON.parse(await fs.readFile(sidecarFile(), "utf8")) as {
      annotations: Annotation[];
    };
    expect(onDisk.annotations[0]!.target).toEqual(fullTarget);
  });

  it("an annotation without a target is stored with no target key", async () => {
    const stored = await addAnnotationCore(projectId, resourceId, {
      id: generateUUID(),
      body: "plain",
      quote: "q",
    });
    expect("target" in stored).toBe(false);
    expect(await fs.readFile(sidecarFile(), "utf8")).not.toContain("target");
  });

  it("an existing annotation's stored bytes are unchanged by adding a cited one", async () => {
    const first = await addAnnotationCore(projectId, resourceId, {
      id: generateUUID(),
      body: "plain",
      quote: "q",
    });
    const firstJson = JSON.stringify(first);
    await addAnnotationCore(projectId, resourceId, {
      id: generateUUID(),
      body: "cited",
      quote: "q",
      target: fullTarget,
    });
    const onDisk = JSON.parse(await fs.readFile(sidecarFile(), "utf8")) as {
      annotations: Annotation[];
    };
    expect(JSON.stringify(onDisk.annotations[0])).toBe(firstJson);
  });

  it.each([
    ["a malformed id", { sourceId: "nope" }],
    ["an unknown key", { sourceId: ID_B, color: "red" }],
    [
      "a locator over its limit",
      {
        sourceId: ID_B,
        locator: { value: "x".repeat(ANNOTATION_LIMITS.locatorValueMax + 1) },
      },
    ],
    [
      "a locator type outside the four",
      { sourceId: ID_B, locator: { type: "chapter", value: "1" } },
    ],
    [
      "a sourceName over the limit",
      {
        sourceId: ID_B,
        sourceName: "n".repeat(ANNOTATION_LIMITS.sourceNameMax + 1),
      },
    ],
  ])("refuses %s and leaves the sidecar unchanged", async (_l, target) => {
    const before = await fs.readFile(sidecarFile(), "utf8");
    await expect(
      addAnnotationCore(projectId, resourceId, {
        id: generateUUID(),
        body: "cited",
        quote: "q",
        target,
      }),
    ).rejects.toThrow(InvalidAnnotationError);
    expect(await fs.readFile(sidecarFile(), "utf8")).toBe(before);
  });
});
