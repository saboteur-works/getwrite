/*
 * Feature 103, Task 28 (FR-22, product FR-90): an excerpt record with a
 * target is still refused on an image or audio resource, and a locator-only
 * excerpt on a Source adds no file besides the Source's own sidecar.
 * Characterizes unchanged core behaviour. Real files.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import {
  addAnnotationCore,
  AnnotationResourceTypeError,
} from "../../src/lib/models/annotations-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { removeDirRetry } from "./helpers/fs-utils";

const T0 = "1970-01-01T00:00:00.000Z";
let batchRoot = "";
let projectId = "";
let projectRoot = "";
const original = process.env.GETWRITE_PROJECTS_DIR;

async function makeResource(type: string): Promise<string> {
  const id = generateUUID();
  await writeSidecar(projectRoot, id, {
    id,
    slug: "r",
    type,
    name: "R",
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
    wordCount: 0,
    userMetadata: {},
  } as Record<string, MetadataValue>);
  return id;
}

async function listAll(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listAll(full)));
    else out.push(path.relative(projectRoot, full));
  }
  return out.sort();
}

const excerpt = (): Record<string, unknown> => ({
  id: generateUUID(),
  body: "",
  quote: "",
  target: {
    sourceId: generateUUID(),
    attachmentId: generateUUID(),
    locator: { type: "timestamp", value: "00:10" },
  },
});

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-excerpts-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "excerpts" })),
    "utf8",
  );
});

afterEach(async () => {
  await flushIndexer();
  if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = original;
  await removeDirRetry(batchRoot);
});

describe("excerpt records and resource types", () => {
  it.each(["image", "audio"])(
    "still refuses an annotation with a target on a %s resource",
    async (type) => {
      const id = await makeResource(type);
      await expect(
        addAnnotationCore(projectId, id, excerpt()),
      ).rejects.toBeInstanceOf(AnnotationResourceTypeError);
    },
  );

  it("a locator-only excerpt on a Source writes no file other than the sidecar and adds no index", async () => {
    const id = await makeResource("source");
    await flushIndexer();
    const before = await listAll(projectRoot);
    await addAnnotationCore(projectId, id, excerpt());
    await flushIndexer();
    const after = await listAll(projectRoot);
    const added = after.filter((f) => !before.includes(f));
    expect(added).toEqual([]);
  });
});
