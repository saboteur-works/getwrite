/**
 * Feature 120, Task 15: the lineage record and the latest-operation record,
 * two files under `meta/` written through the storage adapter. Real-directory
 * tests cover per-project storage, the shape guard and the Trash, restore,
 * prune, purge and `project.json` write paths; the in-memory encrypted adapter
 * covers sealing and the locked answer (fixture as in
 * revision-locked-access.test.ts).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import * as io from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  runInStorageContext,
  type StorageContext,
} from "../../src/lib/models/storage-context";
import {
  createKeyring,
  type Keyring,
} from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import {
  CLIENT_WRITABLE_SIDECAR_KEYS,
  createResourceCore,
  deleteResourceCore,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import { pruneRevisions, writeRevision } from "../../src/lib/models/revision";
import { restoreOneCore, purgeOneCore } from "../../src/lib/models/trash-core";
import { setModuleEnabledCore } from "../../src/lib/models/module-config-core";
import { generateUUID } from "../../src/lib/models/uuid";
import type {
  LatestOperationRecord,
  SplitLineageRecord,
} from "../../src/lib/models/split-types";
import {
  LATEST_OPERATION_FILE_NAME,
  LINEAGE_FILE_NAME,
  SplitRecordsUnreadableError,
  clearLatestOperation,
  readLatestOperation,
  readLineageEntry,
  writeLatestOperation,
  writeLineageEntry,
} from "../../src/lib/models/split-records-core";

const DOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOC_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const NOVEL_SPEC = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

function lineage(sourceId: string, n = 1): SplitLineageRecord {
  return {
    sourceDocumentId: sourceId,
    sourceRevisionId: `rev-${n}`,
    sourceRevisionNumber: n,
    operation: "split",
    date: "2026-11-16T10:00:00.000Z",
  };
}

function operation(newId: string, n = 1): LatestOperationRecord {
  return {
    kind: "split",
    affectedDocumentIds: [DOC_A, newId],
    snapshotRevisions: [
      { documentId: DOC_A, revisionId: `rev-${n}`, revisionNumber: n },
    ],
    newDocumentId: newId,
    date: "2026-11-16T10:00:00.000Z",
  };
}

describe("split records on a real directory", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-split-records-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Split Records",
    });
  });

  afterEach(async () => {
    if (previousEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousEnv;
    await removeDirRetry(tmp);
  });

  const metaFile = (name: string): string =>
    path.join(projectPath, "meta", name);

  async function bytes(name: string): Promise<string> {
    return fs.readFile(metaFile(name), "utf8");
  }

  async function bothFiles(): Promise<string[]> {
    return [
      await bytes(LINEAGE_FILE_NAME),
      await bytes(LATEST_OPERATION_FILE_NAME),
    ];
  }

  describe("lineage record", () => {
    it("reads none for a document with no entry and no file", async () => {
      expect(await readLineageEntry(projectPath, DOC_B)).toEqual({
        outcome: "none",
      });
    });

    it("writes an entry through the adapter and reads it back", async () => {
      await writeLineageEntry(projectPath, DOC_B, lineage(DOC_A));
      expect(await readLineageEntry(projectPath, DOC_B)).toEqual({
        outcome: "found",
        record: lineage(DOC_A),
      });
      const onDisk = JSON.parse(await bytes(LINEAGE_FILE_NAME)) as unknown;
      expect(onDisk).toHaveProperty(DOC_B);
    });

    it("keeps other documents' entries when one is added", async () => {
      await writeLineageEntry(projectPath, DOC_B, lineage(DOC_A, 1));
      await writeLineageEntry(projectPath, DOC_C, lineage(DOC_A, 2));
      expect(await readLineageEntry(projectPath, DOC_B)).toEqual({
        outcome: "found",
        record: lineage(DOC_A, 1),
      });
      expect(await readLineageEntry(projectPath, DOC_C)).toEqual({
        outcome: "found",
        record: lineage(DOC_A, 2),
      });
    });

    it("is stored per project", async () => {
      const otherPath = path.join(tmp, generateUUID());
      await createAndAssertProject(NOVEL_SPEC, {
        projectRoot: otherPath,
        name: "Other",
      });
      await writeLineageEntry(projectPath, DOC_B, lineage(DOC_A));
      expect(await readLineageEntry(otherPath, DOC_B)).toEqual({
        outcome: "none",
      });
      await expect(
        fs.stat(path.join(otherPath, "meta", LINEAGE_FILE_NAME)),
      ).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("rejects a document id that is not a UUID and writes nothing", async () => {
      await expect(
        writeLineageEntry(projectPath, "../escape", lineage(DOC_A)),
      ).rejects.toThrow();
      await expect(
        writeLineageEntry(projectPath, "__proto__", lineage(DOC_A)),
      ).rejects.toThrow();
      await expect(fs.stat(metaFile(LINEAGE_FILE_NAME))).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("returns a failed outcome, never none, for an unparseable file", async () => {
      await fs.writeFile(metaFile(LINEAGE_FILE_NAME), "{not json", "utf8");
      const result = await readLineageEntry(projectPath, DOC_B);
      expect(result.outcome).toBe("failed");
    });

    it("returns a failed outcome for an entry of the wrong shape", async () => {
      await fs.writeFile(
        metaFile(LINEAGE_FILE_NAME),
        JSON.stringify({ [DOC_B]: { sourceDocumentId: 7 } }),
        "utf8",
      );
      const result = await readLineageEntry(projectPath, DOC_B);
      expect(result.outcome).toBe("failed");
    });

    it("refuses to overwrite a file it cannot read", async () => {
      await fs.writeFile(metaFile(LINEAGE_FILE_NAME), "{not json", "utf8");
      await expect(
        writeLineageEntry(projectPath, DOC_B, lineage(DOC_A)),
      ).rejects.toBeInstanceOf(SplitRecordsUnreadableError);
      expect(await bytes(LINEAGE_FILE_NAME)).toBe("{not json");
    });
  });

  describe("latest-operation record", () => {
    it("reads none when nothing was written", async () => {
      expect(await readLatestOperation(projectPath)).toEqual({
        outcome: "none",
      });
    });

    it("writes, reads, replaces and clears", async () => {
      await writeLatestOperation(projectPath, operation(DOC_B, 1));
      expect(await readLatestOperation(projectPath)).toEqual({
        outcome: "found",
        record: operation(DOC_B, 1),
      });
      await writeLatestOperation(projectPath, operation(DOC_C, 2));
      expect(await readLatestOperation(projectPath)).toEqual({
        outcome: "found",
        record: operation(DOC_C, 2),
      });
      await clearLatestOperation(projectPath);
      expect(await readLatestOperation(projectPath)).toEqual({
        outcome: "none",
      });
    });

    it("clearing when nothing is stored is not an error", async () => {
      await expect(clearLatestOperation(projectPath)).resolves.toBeUndefined();
    });

    it("accepts the merge kind so Feature 121 needs no migration", async () => {
      const merge: LatestOperationRecord = {
        ...operation(DOC_B),
        kind: "merge",
      };
      await writeLatestOperation(projectPath, merge);
      expect(await readLatestOperation(projectPath)).toEqual({
        outcome: "found",
        record: merge,
      });
    });

    it("returns a failed outcome for an unparseable or wrong-shaped file", async () => {
      await fs.writeFile(metaFile(LATEST_OPERATION_FILE_NAME), "[", "utf8");
      expect((await readLatestOperation(projectPath)).outcome).toBe("failed");
      await fs.writeFile(
        metaFile(LATEST_OPERATION_FILE_NAME),
        JSON.stringify({ kind: "undo" }),
        "utf8",
      );
      expect((await readLatestOperation(projectPath)).outcome).toBe("failed");
    });

    it("is stored under the project's own meta directory", async () => {
      await writeLatestOperation(projectPath, operation(DOC_B));
      expect(
        (await fs.stat(metaFile(LATEST_OPERATION_FILE_NAME))).isFile(),
      ).toBe(true);
    });
  });

  describe("client sidecar updates", () => {
    it("no record name is a client-writable sidecar key", () => {
      for (const name of [LINEAGE_FILE_NAME, LATEST_OPERATION_FILE_NAME]) {
        const stem = name.replace(/\.json$/, "");
        expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain(stem);
        expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain(name);
      }
      expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain("latestOperation");
      expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain("lineage");
    });

    it("an update naming either record neither writes nor clears the files", async () => {
      const created = await createResourceCore(projectId, {
        type: "text",
        name: "Doc",
        text: { plainText: "one two" },
      });
      await writeLineageEntry(projectPath, created.id, lineage(DOC_A));
      await writeLatestOperation(projectPath, operation(created.id));
      const before = await bothFiles();
      await updateSidecarCore(projectId, created.id, {
        lineage: { sourceDocumentId: "x" },
        latestOperation: { kind: "split" },
        userMetadata: {},
      });
      for (const key of ["lineage", "latestOperation"]) {
        await expect(
          updateSidecarCore(projectId, created.id, {}, [key]),
        ).rejects.toThrow();
      }
      expect(await bothFiles()).toEqual(before);
    });
  });

  describe("other writers leave both files alone", () => {
    async function twoRecords(docId: string): Promise<string[]> {
      await writeLineageEntry(projectPath, docId, lineage(DOC_A));
      await writeLineageEntry(projectPath, DOC_C, lineage(DOC_A, 2));
      await writeLatestOperation(projectPath, operation(docId));
      return bothFiles();
    }

    it("Trash, restore and purge of the split-off document", async () => {
      const created = await createResourceCore(projectId, {
        type: "text",
        name: "Doc",
        text: { plainText: "one two" },
      });
      const before = await twoRecords(created.id);
      await deleteResourceCore(projectId, created.id);
      expect(await bothFiles()).toEqual(before);
      expect((await restoreOneCore(projectPath, created.id)).ok).toBe(true);
      expect(await bothFiles()).toEqual(before);
      await deleteResourceCore(projectId, created.id);
      expect((await purgeOneCore(projectPath, created.id)).ok).toBe(true);
      expect(await bothFiles()).toEqual(before);
      expect(await readLineageEntry(projectPath, created.id)).toEqual({
        outcome: "found",
        record: lineage(DOC_A),
      });
    });

    it("Trash and purge of another document", async () => {
      const other = await createResourceCore(projectId, {
        type: "text",
        name: "Other",
        text: { plainText: "x" },
      });
      const before = await twoRecords(DOC_B);
      await deleteResourceCore(projectId, other.id);
      await purgeOneCore(projectPath, other.id);
      expect(await bothFiles()).toEqual(before);
    });

    it("a prune of a document's revisions", async () => {
      const created = await createResourceCore(projectId, {
        type: "text",
        name: "Doc",
        text: { plainText: "one two" },
      });
      const before = await twoRecords(created.id);
      await writeRevision(projectPath, created.id, 2, "{}", {});
      await writeRevision(projectPath, created.id, 3, "{}", {});
      await pruneRevisions(projectPath, created.id, 1);
      expect(await bothFiles()).toEqual(before);
    });

    it("a project.json write", async () => {
      const before = await twoRecords(DOC_B);
      await setModuleEnabledCore({
        projectId,
        moduleId: "claims",
        enabled: true,
      });
      expect(await bothFiles()).toEqual(before);
    });
  });
});

describe("split records on an encrypted project", () => {
  const WORKSPACE = "/ws";
  const MARKER = "plaintext-marker-xyz";
  let base: StorageAdapter;
  let keyring: Keyring;
  let projectRoot: string;
  let ctx: StorageContext;
  const previousAdapter = io.getStorageAdapter();

  afterEach(() => {
    io.setStorageAdapter(previousAdapter);
  });

  beforeEach(async () => {
    base = createMemoryAdapter();
    const projectId = generateUUID();
    projectRoot = `${WORKSPACE}/${projectId}`;
    await base.mkdir(projectRoot, { recursive: true });
    keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(projectId);
    await writeProjectMarker(projectRoot, base);
    ctx = {
      tenantRoot: WORKSPACE,
      adapter: workspaceEncryptionAdapter(base, WORKSPACE, keyring),
      projectRoot,
    };
  });

  const sealedRecord = (): SplitLineageRecord => ({
    ...lineage(DOC_A),
    sourceRevisionId: MARKER,
  });

  it("stores each file encrypted and reads it back unlocked", async () => {
    await runInStorageContext(ctx, async () => {
      await writeLineageEntry(projectRoot, DOC_B, sealedRecord());
      await writeLatestOperation(projectRoot, {
        ...operation(DOC_B),
        snapshotRevisions: [
          { documentId: DOC_A, revisionId: MARKER, revisionNumber: 1 },
        ],
      });
    });
    for (const name of [LINEAGE_FILE_NAME, LATEST_OPERATION_FILE_NAME]) {
      const stored = await base.readFileBuffer(`${projectRoot}/meta/${name}`);
      expect(Buffer.from(stored).toString("latin1")).not.toContain(MARKER);
    }
    const read = await runInStorageContext(ctx, () =>
      readLineageEntry(projectRoot, DOC_B),
    );
    expect(read).toEqual({ outcome: "found", record: sealedRecord() });
  });

  it("fails closed with the locked error on a read, never an empty read", async () => {
    await runInStorageContext(ctx, () =>
      writeLineageEntry(projectRoot, DOC_B, sealedRecord()),
    );
    await runInStorageContext(ctx, () =>
      writeLatestOperation(projectRoot, operation(DOC_B)),
    );
    keyring.lock();
    await expect(
      runInStorageContext(ctx, () => readLineageEntry(projectRoot, DOC_B)),
    ).rejects.toSatisfy((e: unknown) => isLockedAccessError(e));
    await expect(
      runInStorageContext(ctx, () => readLatestOperation(projectRoot)),
    ).rejects.toSatisfy((e: unknown) => isLockedAccessError(e));
  });

  it("fails closed on a write and on a clear with the keyring locked", async () => {
    keyring.lock();
    await expect(
      runInStorageContext(ctx, () =>
        writeLineageEntry(projectRoot, DOC_B, sealedRecord()),
      ),
    ).rejects.toSatisfy((e: unknown) => isLockedAccessError(e));
    await expect(
      runInStorageContext(ctx, () => clearLatestOperation(projectRoot)),
    ).rejects.toSatisfy((e: unknown) => isLockedAccessError(e));
  });
});
