/**
 * Feature 103, Task 26 (FR-26, OQ-3): an annotation with a `target` (a
 * citation) may have an empty body; one without keeps 1 to 5000 characters;
 * no body exceeds 5000 for either; an update that would empty an annotation
 * without a target is refused. Enforced in the core, real files, real locks.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  ANNOTATION_LIMITS,
  validateAnnotationBody,
  validateNewAnnotation,
} from "../../src/lib/models/annotation-validation";
import {
  addAnnotationCore,
  InvalidAnnotationError,
  listAnnotationsCore,
  updateAnnotationCore,
} from "../../src/lib/models/annotations-core";
import type { MetadataValue } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

const SOURCE_ID = "550e8400-e29b-41d4-a716-446655440011";
const T0 = "1970-01-01T00:00:00.000Z";
const TARGET = { sourceId: SOURCE_ID };
const OVER = "x".repeat(ANNOTATION_LIMITS.bodyMax + 1);

describe("validateAnnotationBody and validateNewAnnotation", () => {
  it("refuses an empty body by default and accepts it when a target is present", () => {
    expect(validateAnnotationBody("").ok).toBe(false);
    expect(validateAnnotationBody("", true)).toEqual({ ok: true, value: "" });
  });

  it("refuses a body over the limit, with or without a target", () => {
    expect(validateAnnotationBody(OVER).ok).toBe(false);
    expect(validateAnnotationBody(OVER, true).ok).toBe(false);
    expect(validateAnnotationBody("x".repeat(5000), true).ok).toBe(true);
  });

  it("refuses a non-string body even with a target", () => {
    expect(validateAnnotationBody(undefined, true).ok).toBe(false);
    expect(validateAnnotationBody(7, true).ok).toBe(false);
  });

  it("validateNewAnnotation: empty body needs a target", () => {
    const base = { id: generateUUID(), body: "", quote: "q" };
    expect(validateNewAnnotation(base, []).ok).toBe(false);
    expect(validateNewAnnotation({ ...base, target: TARGET }, []).ok).toBe(
      true,
    );
    expect(
      validateNewAnnotation({ ...base, body: OVER, target: TARGET }, []).ok,
    ).toBe(false);
  });
});

describe("annotations core: empty-body rule", () => {
  let batchRoot = "";
  let projectId = "";
  let projectRoot = "";
  let resourceId = "";
  const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

  const sidecarFile = (): string =>
    path.join(projectRoot, "meta", `resource-${resourceId}.meta.json`);

  beforeEach(async () => {
    batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-ann-empty-"));
    process.env.GETWRITE_PROJECTS_DIR = batchRoot;
    projectId = generateUUID();
    projectRoot = path.join(batchRoot, projectId);
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, PROJECT_FILENAME),
      JSON.stringify(createProject({ name: "annotation-empty-body" })),
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

  it("add: an empty body with a target is accepted and stored", async () => {
    const stored = await addAnnotationCore(projectId, resourceId, {
      id: generateUUID(),
      body: "",
      quote: "",
      target: TARGET,
    });
    expect(stored.body).toBe("");
    expect(await listAnnotationsCore(projectId, resourceId)).toEqual([stored]);
  });

  it("add: an empty body without a target is refused and nothing is stored", async () => {
    const before = await fs.readFile(sidecarFile(), "utf8");
    await expect(
      addAnnotationCore(projectId, resourceId, {
        id: generateUUID(),
        body: "",
        quote: "q",
      }),
    ).rejects.toThrow(InvalidAnnotationError);
    expect(await fs.readFile(sidecarFile(), "utf8")).toBe(before);
  });

  it.each([
    ["without a target", undefined],
    ["with a target", TARGET],
  ])("add: a body over the limit %s is refused", async (_l, target) => {
    const before = await fs.readFile(sidecarFile(), "utf8");
    await expect(
      addAnnotationCore(projectId, resourceId, {
        id: generateUUID(),
        body: OVER,
        quote: "q",
        ...(target === undefined ? {} : { target }),
      }),
    ).rejects.toThrow(InvalidAnnotationError);
    expect(await fs.readFile(sidecarFile(), "utf8")).toBe(before);
  });

  it("update: emptying an annotation with a target is accepted", async () => {
    const id = generateUUID();
    await addAnnotationCore(projectId, resourceId, {
      id,
      body: "cited",
      quote: "q",
      target: TARGET,
    });
    const updated = await updateAnnotationCore(projectId, resourceId, id, "");
    expect(updated.body).toBe("");
    expect(updated.target).toEqual(TARGET);
    const [listed] = await listAnnotationsCore(projectId, resourceId);
    expect(listed!.body).toBe("");
  });

  it("update: emptying an annotation without a target is refused and the body is kept", async () => {
    const id = generateUUID();
    await addAnnotationCore(projectId, resourceId, {
      id,
      body: "plain",
      quote: "q",
    });
    const before = await fs.readFile(sidecarFile(), "utf8");
    await expect(
      updateAnnotationCore(projectId, resourceId, id, ""),
    ).rejects.toThrow(InvalidAnnotationError);
    expect(await fs.readFile(sidecarFile(), "utf8")).toBe(before);
  });

  it.each([
    ["without a target", undefined],
    ["with a target", TARGET],
  ])("update: a body over the limit %s is refused", async (_l, target) => {
    const id = generateUUID();
    await addAnnotationCore(projectId, resourceId, {
      id,
      body: "kept",
      quote: "q",
      ...(target === undefined ? {} : { target }),
    });
    await expect(
      updateAnnotationCore(projectId, resourceId, id, OVER),
    ).rejects.toThrow(InvalidAnnotationError);
    const [listed] = await listAnnotationsCore(projectId, resourceId);
    expect(listed!.body).toBe("kept");
  });
});
