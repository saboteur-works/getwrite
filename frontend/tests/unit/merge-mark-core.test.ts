/**
 * Feature 121, Task 22 (FR-5): the merged mark on an absorbed document, a
 * sidecar key written through `mutateSidecar` (the storage adapter), and the
 * two copy paths that must drop it. Real-directory tests cover storage, the
 * client writer allowlist, reload, Trash, restore, prune, purge and copy;
 * the in-memory encrypted adapter covers sealing and the locked answer
 * (fixture as in split-records-core.test.ts).
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
  copyResourceCore,
  createResourceCore,
  deleteResourceCore,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import { duplicateResource } from "../../src/lib/models/resource-templates";
import { pruneRevisions, writeRevision } from "../../src/lib/models/revision";
import { restoreOneCore, purgeOneCore } from "../../src/lib/models/trash-core";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import { MERGED_MARK_SIDECAR_KEY } from "../../src/lib/models/merge-types";
import type { MergedMark } from "../../src/lib/models/merge-types";
import {
  MergeMarkTargetMissingError,
  readMergedMark,
  removeMergedMark,
  writeMergedMark,
} from "../../src/lib/models/merge-mark-core";

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const NOVEL_SPEC = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

function mark(n = 1): MergedMark {
  return {
    targetDocumentId: TARGET,
    targetSnapshotRevisionId: `rev-${n}`,
    date: "2026-11-18T10:00:00.000Z",
  };
}

describe("merged mark on a real directory", () => {
  let tmp: string;
  let projectId: string;
  let projectPath: string;
  const previousEnv = process.env.GETWRITE_PROJECTS_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-merge-mark-"));
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    projectId = generateUUID();
    projectPath = path.join(tmp, projectId);
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: projectPath,
      name: "Merge Mark",
    });
  });

  afterEach(async () => {
    if (previousEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousEnv;
    await removeDirRetry(tmp);
  });

  async function newDoc(name: string): Promise<string> {
    const created = await createResourceCore(projectId, {
      type: "text",
      name,
      text: { plainText: "one two" },
    });
    return created.id;
  }

  const sidecarFile = (id: string): string =>
    path.join(projectPath, "meta", `resource-${id}.meta.json`);

  async function storedMark(id: string): Promise<unknown> {
    return (await readSidecar(projectPath, id))?.[MERGED_MARK_SIDECAR_KEY];
  }

  describe("write and read", () => {
    it("stores the mark under mergedMark and reads it back", async () => {
      const id = await newDoc("Absorbed");
      await writeMergedMark(projectPath, id, mark());
      expect(await storedMark(id)).toEqual(mark());
      expect(await readMergedMark(projectPath, id)).toEqual({
        outcome: "found",
        mark: mark(),
      });
    });

    it("keeps every other sidecar key when it writes", async () => {
      const id = await newDoc("Absorbed");
      const before = await readSidecar(projectPath, id);
      await writeMergedMark(projectPath, id, mark());
      const after = { ...(await readSidecar(projectPath, id)) };
      delete after[MERGED_MARK_SIDECAR_KEY];
      expect(after).toEqual(before);
    });

    it("reports none for a document with no mark", async () => {
      const id = await newDoc("Plain");
      expect(await readMergedMark(projectPath, id)).toEqual({
        outcome: "none",
      });
    });

    it("refuses to write a mark on a document with no sidecar", async () => {
      await expect(
        writeMergedMark(projectPath, generateUUID(), mark()),
      ).rejects.toBeInstanceOf(MergeMarkTargetMissingError);
    });

    it("returns failed, never none, for a stored mark of the wrong shape", async () => {
      const id = await newDoc("Absorbed");
      const sidecar = (await readSidecar(projectPath, id)) ?? {};
      await writeSidecar(projectPath, id, {
        ...sidecar,
        [MERGED_MARK_SIDECAR_KEY]: { targetDocumentId: 5 },
      });
      const read = await readMergedMark(projectPath, id);
      expect(read.outcome).toBe("failed");
    });

    it("returns failed, never none, for an unreadable sidecar", async () => {
      const id = await newDoc("Absorbed");
      await fs.writeFile(sidecarFile(id), "{not json");
      const read = await readMergedMark(projectPath, id);
      expect(read.outcome).toBe("failed");
    });

    it("returns failed for a document with no sidecar", async () => {
      const read = await readMergedMark(projectPath, generateUUID());
      expect(read.outcome).toBe("failed");
    });

    it("removes the mark and leaves the other keys", async () => {
      const id = await newDoc("Absorbed");
      await writeMergedMark(projectPath, id, mark());
      await removeMergedMark(projectPath, id);
      expect(await readMergedMark(projectPath, id)).toEqual({
        outcome: "none",
      });
      expect((await readSidecar(projectPath, id))?.name).toBe("Absorbed");
    });
  });

  describe("no client update can write or clear it", () => {
    it("is not in the writer allowlist", () => {
      expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain(
        MERGED_MARK_SIDECAR_KEY,
      );
    });

    it("an update naming the key neither overwrites nor changes it", async () => {
      const id = await newDoc("Absorbed");
      await writeMergedMark(projectPath, id, mark());
      await updateSidecarCore(projectId, id, {
        [MERGED_MARK_SIDECAR_KEY]: { targetDocumentId: "x" },
        userMetadata: {},
      } as never);
      expect(await storedMark(id)).toEqual(mark());
    });

    it("clearKeys naming the key is refused and the mark stays", async () => {
      const id = await newDoc("Absorbed");
      await writeMergedMark(projectPath, id, mark());
      await expect(
        updateSidecarCore(projectId, id, {} as never, [
          MERGED_MARK_SIDECAR_KEY,
        ]),
      ).rejects.toThrow();
      expect(await storedMark(id)).toEqual(mark());
    });
  });

  describe("survival", () => {
    it("survives a reload (a fresh read of the stored file)", async () => {
      const id = await newDoc("Absorbed");
      await writeMergedMark(projectPath, id, mark());
      const raw = await fs.readFile(sidecarFile(id), "utf8");
      expect(JSON.parse(raw)[MERGED_MARK_SIDECAR_KEY]).toEqual(mark());
    });

    it("survives Trash and a restore brings it back", async () => {
      const id = await newDoc("Absorbed");
      await writeMergedMark(projectPath, id, mark());
      await deleteResourceCore(projectId, id);
      expect((await restoreOneCore(projectPath, id)).ok).toBe(true);
      expect(await readMergedMark(projectPath, id)).toEqual({
        outcome: "found",
        mark: mark(),
      });
    });

    it("survives a prune of the absorbed document's revisions", async () => {
      const id = await newDoc("Absorbed");
      await writeMergedMark(projectPath, id, mark());
      await writeRevision(projectPath, id, 2, "{}", {});
      await writeRevision(projectPath, id, 3, "{}", {});
      await pruneRevisions(projectPath, id, 1);
      expect(await storedMark(id)).toEqual(mark());
    });

    it("Trash, restore, prune and purge of another document leave it unchanged", async () => {
      const id = await newDoc("Absorbed");
      const other = await newDoc("Other");
      await writeMergedMark(projectPath, id, mark());
      const before = await fs.readFile(sidecarFile(id), "utf8");
      const now = (): Promise<string> => fs.readFile(sidecarFile(id), "utf8");
      await writeRevision(projectPath, other, 2, "{}", {});
      await pruneRevisions(projectPath, other, 1);
      expect(await now()).toBe(before);
      await deleteResourceCore(projectId, other);
      expect(await now()).toBe(before);
      await restoreOneCore(projectPath, other);
      expect(await now()).toBe(before);
      await deleteResourceCore(projectId, other);
      expect((await purgeOneCore(projectPath, other)).ok).toBe(true);
      expect(await now()).toBe(before);
    });
  });

  describe("copy paths drop the key", () => {
    it("copyResourceCore: the copy has no mark and the source keeps it", async () => {
      const id = await newDoc("Absorbed");
      await writeMergedMark(projectPath, id, mark());
      const copy = await copyResourceCore(projectId, id, "Copy");
      const copyId = String(copy.id);
      expect(copyId).not.toBe(id);
      const copySidecar = await readSidecar(projectPath, copyId);
      expect(copySidecar).not.toBeNull();
      expect(MERGED_MARK_SIDECAR_KEY in (copySidecar ?? {})).toBe(false);
      expect(await storedMark(id)).toEqual(mark());
    });

    it("duplicateResource: the duplicate has no mark and the source keeps it", async () => {
      const id = await newDoc("Absorbed");
      await writeMergedMark(projectPath, id, mark());
      const { newId } = await duplicateResource(projectPath, id);
      expect(newId).not.toBe(id);
      const dupSidecar = await readSidecar(projectPath, newId);
      expect(dupSidecar).not.toBeNull();
      expect(MERGED_MARK_SIDECAR_KEY in (dupSidecar ?? {})).toBe(false);
      expect(await storedMark(id)).toEqual(mark());
    });
  });
});

describe("merged mark on an encrypted project", () => {
  const WORKSPACE = "/ws";
  const MARKER = "plaintext-marker-xyz";
  let base: StorageAdapter;
  let keyring: Keyring;
  let projectRoot: string;
  let ctx: StorageContext;
  const docId = generateUUID();
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
    await runInStorageContext(ctx, () =>
      writeSidecar(projectRoot, docId, {
        id: docId,
        name: "Absorbed",
        type: "text",
      }),
    );
  });

  const sealed = (): MergedMark => ({
    ...mark(),
    targetSnapshotRevisionId: MARKER,
  });

  it("stores the mark encrypted and reads it back unlocked", async () => {
    await runInStorageContext(ctx, () =>
      writeMergedMark(projectRoot, docId, sealed()),
    );
    const stored = await base.readFileBuffer(
      `${projectRoot}/meta/resource-${docId}.meta.json`,
    );
    expect(Buffer.from(stored).toString("latin1")).not.toContain(MARKER);
    const read = await runInStorageContext(ctx, () =>
      readMergedMark(projectRoot, docId),
    );
    expect(read).toEqual({ outcome: "found", mark: sealed() });
  });

  it("raises the locked error on a read, never an empty read", async () => {
    await runInStorageContext(ctx, () =>
      writeMergedMark(projectRoot, docId, sealed()),
    );
    keyring.lock();
    await expect(
      runInStorageContext(ctx, () => readMergedMark(projectRoot, docId)),
    ).rejects.toSatisfy((e: unknown) => isLockedAccessError(e));
  });

  it("raises the locked error on a write and on a removal", async () => {
    keyring.lock();
    await expect(
      runInStorageContext(ctx, () =>
        writeMergedMark(projectRoot, docId, sealed()),
      ),
    ).rejects.toSatisfy((e: unknown) => isLockedAccessError(e));
    await expect(
      runInStorageContext(ctx, () => removeMergedMark(projectRoot, docId)),
    ).rejects.toSatisfy((e: unknown) => isLockedAccessError(e));
  });
});
