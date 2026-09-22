import { afterEach, beforeEach, describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  sidecarFilename,
  readSidecar,
  writeSidecar,
} from "../../src/lib/models/sidecar";
import type { MetadataValue } from "../../src/lib/models/types";
import * as io from "../../src/lib/models/io";
import {
  getStorageAdapter,
  runForTenant,
  type StorageAdapter,
} from "../../src/lib/models/io";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  createKeyring,
  type Keyring,
} from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

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

describe("models/sidecar — concurrent read during write", () => {
  it("never exposes a partially-written sidecar to a concurrent reader", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-sidecar-race-"),
    );
    const resourceId = generateUUID();
    await writeSidecar(tmp, resourceId, { title: "Before" });
    await flushIndexer();

    // A write that lands its first half, pauses, then finishes — the window
    // a real filesystem write leaves open to an unlocked reader.
    let markPaused!: () => void;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => (markPaused = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    const base = getStorageAdapter();
    const slowAdapter: StorageAdapter = {
      ...base,
      writeFile: async (p, data, opts) => {
        if (!path.basename(p).startsWith("resource-")) {
          return base.writeFile(p, data, opts);
        }
        const text = data.toString();
        await base.writeFile(p, text.slice(0, text.length / 2), opts);
        markPaused();
        await released;
        await base.writeFile(p, text, opts);
      },
    };

    const next = { title: "After", tags: ["a", "b", "c"] };
    const writing = runForTenant(
      tmp,
      () => writeSidecar(tmp, resourceId, next),
      slowAdapter,
    );
    await paused;

    const midWrite = await readSidecar(tmp, resourceId);
    release();
    await writing;
    await flushIndexer();

    expect(midWrite).toEqual({ title: "Before" });
    expect(await readSidecar(tmp, resourceId)).toEqual(next);
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

describe("models/sidecar — writeSidecar's pre-write read under locked access", () => {
  // Regression coverage for Feature 54 Task 10: `writeSidecar`'s pre-write
  // read of any existing sidecar must not swallow a locked-access failure
  // the way it swallows a genuine "no sidecar yet". Built the way
  // `storage-context-encryption.test.ts` does — an in-memory adapter routed
  // through the real `workspaceEncryptionAdapter` — never touching the real
  // `projects/` directory.
  const WORKSPACE = "/ws";
  let base: StorageAdapter;
  let keyring: Keyring;
  let projectId: string;
  let projectRoot: string;
  const previousAdapter = io.getStorageAdapter();

  afterEach(() => {
    io.setStorageAdapter(previousAdapter);
  });

  beforeEach(async () => {
    base = createMemoryAdapter();
    projectId = generateUUID();
    projectRoot = `${WORKSPACE}/${projectId}`;
    await base.mkdir(projectRoot, { recursive: true });

    keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(projectId);
    await writeProjectMarker(projectRoot, base);
  });

  it("rejects with the locked-access error instead of writing as though no prior sidecar existed", async () => {
    keyring.lock();
    io.setStorageAdapter(workspaceEncryptionAdapter(base, WORKSPACE, keyring));

    const resourceId = generateUUID();
    await expect(
      writeSidecar(projectRoot, resourceId, { title: "New title" }),
    ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
  });

  it("still writes normally for an unencrypted project with no prior sidecar", async () => {
    const plainProjectId = generateUUID();
    const plainProjectRoot = `${WORKSPACE}/${plainProjectId}`;
    await base.mkdir(plainProjectRoot, { recursive: true });
    io.setStorageAdapter(workspaceEncryptionAdapter(base, WORKSPACE, keyring));

    const resourceId = generateUUID();
    await expect(
      writeSidecar(plainProjectRoot, resourceId, { title: "New title" }),
    ).resolves.toBeUndefined();
  });
});
