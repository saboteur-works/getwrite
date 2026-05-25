import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  sidecarFilename,
  readSidecar,
  writeSidecar,
} from "../../src/lib/models/sidecar";
import type { MetadataValue } from "../../src/lib/models/types";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

async function makeProjectJson(dir: string, metadataRevision?: number) {
  const project = {
    id: generateUUID(),
    name: "test",
    createdAt: new Date().toISOString(),
    config: {
      editorConfig: {},
      ...(metadataRevision !== undefined ? { metadataRevision } : {}),
    },
  };
  await fs.writeFile(
    path.join(dir, "project.json"),
    JSON.stringify(project, null, 2),
    "utf8",
  );
}

async function readMetadataRevision(dir: string): Promise<number | undefined> {
  const raw = await fs.readFile(path.join(dir, "project.json"), "utf8");
  const project = JSON.parse(raw) as { config?: { metadataRevision?: number } };
  return project.config?.metadataRevision;
}

describe("models/sidecar", () => {
  it("writes and reads a sidecar file in project meta folder", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-test-"));
    const resourceId = generateUUID();
    const meta: Record<string, MetadataValue> = {
      title: "Sample",
      tags: ["a", "b"],
    };

    await writeSidecar(tmp, resourceId, meta);

    const expectedPath = path.join(tmp, "meta", sidecarFilename(resourceId));
    const exists = await fs.readFile(expectedPath, "utf8");
    expect(typeof exists).toBe("string");

    const read = await readSidecar(tmp, resourceId);
    expect(read).not.toBeNull();
    expect((read as any).title).toBe("Sample");

    // ensure background indexing finished before cleanup
    await flushIndexer();

    // cleanup
    await removeDirRetry(tmp);
  });

  it("returns null when sidecar is missing", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-test-"));
    const resourceId = generateUUID();
    const read = await readSidecar(tmp, resourceId);
    expect(read).toBeNull();
    await removeDirRetry(tmp);
  });
});

describe("models/sidecar — metadataRevision counter", () => {
  it("bumps metadataRevision in project.json when project.json exists", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-sidecar-rev-"),
    );
    await makeProjectJson(tmp, 0);
    const resourceId = generateUUID();
    await writeSidecar(tmp, resourceId, { key: "val" });
    await flushIndexer();
    expect(await readMetadataRevision(tmp)).toBe(1);
    await removeDirRetry(tmp);
  });

  it("initializes metadataRevision to 1 when project.json has no prior counter", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-sidecar-rev-"),
    );
    await makeProjectJson(tmp);
    const resourceId = generateUUID();
    await writeSidecar(tmp, resourceId, { x: "y" });
    await flushIndexer();
    expect(await readMetadataRevision(tmp)).toBe(1);
    await removeDirRetry(tmp);
  });

  it("increments monotonically across sequential sidecar writes", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-sidecar-rev-"),
    );
    await makeProjectJson(tmp, 5);
    const resourceId = generateUUID();
    await writeSidecar(tmp, resourceId, { a: "1" });
    await writeSidecar(tmp, resourceId, { a: "2" });
    await writeSidecar(tmp, resourceId, { a: "3" });
    await flushIndexer();
    expect(await readMetadataRevision(tmp)).toBe(8);
    await removeDirRetry(tmp);
  });

  it("does not throw when project.json is absent", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-sidecar-rev-"),
    );
    const resourceId = generateUUID();
    await expect(
      writeSidecar(tmp, resourceId, { k: "v" }),
    ).resolves.toBeUndefined();
    await flushIndexer();
    await removeDirRetry(tmp);
  });
});
