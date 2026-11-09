/**
 * Feature 106 Task 7: Inbox folder resolution core (FR-3, FR-4, FR-9, OQ-2,
 * OQ-17). Runs against an in-memory adapter and the real Trash functions.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
  exists,
  getStorageAdapter,
  type StorageAdapter,
} from "../../src/lib/models/io";
import {
  resolveInboxFolder,
  resolveInboxFolderCore,
  InvalidProjectIdCoreError,
} from "../../src/lib/models/inbox-folder-core";
import { readFolderTree } from "../../src/lib/models/folder-utils";
import { createFolderResource } from "../../src/lib/models/resource-factory";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import {
  softDeleteFolder,
  purgeFolder,
  restoreFolder,
} from "../../src/lib/models/trash";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "55555555-5555-4555-8555-555555555555";
const TENANT = "/ws-inbox-core";
const ROOT = `${TENANT}/${PID}`;

const writeProject = (config: Record<string, unknown> = {}) =>
  writeFile(
    `${ROOT}/project.json`,
    JSON.stringify({
      id: PID,
      name: "P",
      createdAt: "2026-01-01T00:00:00.000Z",
      config,
    }),
    "utf8",
  );
const readConfig = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(`${ROOT}/project.json`, "utf8")).config;
const readProjectRaw = (): Promise<string> =>
  readFile(`${ROOT}/project.json`, "utf8");
const folders = async (): Promise<Array<Record<string, unknown>>> =>
  (await readFolderTree(path.join(ROOT, "folders"))) as Array<
    Record<string, unknown>
  >;

async function addFolder(name: string, parent: string | null = null) {
  const f = createFolderResource({ name, parentFolderId: parent });
  await writeResourceToFile(ROOT, f);
  return f;
}

const prevEnv = process.env.GETWRITE_PROJECTS_DIR;
beforeEach(async () => {
  process.env.GETWRITE_PROJECTS_DIR = TENANT;
  setStorageAdapter(createMemoryAdapter());
  await mkdir(ROOT, { recursive: true });
  await writeProject();
});
afterEach(() => {
  if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
});

describe("resolveInboxFolder: live and absent", () => {
  it("returns a live Inbox and writes nothing", async () => {
    const inbox = await addFolder("Inbox");
    await writeProject({ inboxFolderId: inbox.id });
    const before = await readProjectRaw();
    const out = await resolveInboxFolder(ROOT);
    expect(out).toEqual({
      status: "resolved",
      inboxFolderId: inbox.id,
      created: false,
      relocated: false,
      renamed: false,
    });
    expect(await readProjectRaw()).toBe(before);
    expect(await folders()).toHaveLength(1);
  });

  it("creates an Inbox at the root named Inbox when no id is set, with the special flag at its default", async () => {
    const out = await resolveInboxFolder(ROOT);
    if (out.status !== "resolved") throw new Error("unreachable");
    expect(out.created).toBe(true);
    expect((await readConfig()).inboxFolderId).toBe(out.inboxFolderId);
    const [f] = await folders();
    expect(f).toMatchObject({
      id: out.inboxFolderId,
      name: "Inbox",
      parentId: null,
      special: false,
    });
  });

  it("creates a new Inbox, with no prompt, when the id names no folder", async () => {
    const ghost = "99999999-9999-4999-8999-999999999999";
    await writeProject({ inboxFolderId: ghost, other: 1 });
    const out = await resolveInboxFolder(ROOT);
    if (out.status !== "resolved") throw new Error("unreachable");
    expect(out.created).toBe(true);
    expect(out.inboxFolderId).not.toBe(ghost);
    const config = await readConfig();
    expect(config.inboxFolderId).toBe(out.inboxFolderId);
    expect(config.other).toBe(1);
  });

  it("creates a new Inbox, with no prompt, when the old one was purged", async () => {
    const inbox = await addFolder("Inbox");
    await writeProject({ inboxFolderId: inbox.id });
    await softDeleteFolder(ROOT, inbox.id);
    await purgeFolder(ROOT, inbox.id);
    const out = await resolveInboxFolder(ROOT);
    if (out.status !== "resolved") throw new Error("unreachable");
    expect(out.created).toBe(true);
    expect(out.inboxFolderId).not.toBe(inbox.id);
    expect((await readConfig()).inboxFolderId).toBe(out.inboxFolderId);
  });

  it("ignores a choice when the Inbox is live", async () => {
    const inbox = await addFolder("Inbox");
    await writeProject({ inboxFolderId: inbox.id });
    const out = await resolveInboxFolder(ROOT, "new");
    expect(out).toMatchObject({ inboxFolderId: inbox.id, created: false });
  });
});

describe("resolveInboxFolder: Inbox in Trash", () => {
  let inboxId: string;
  beforeEach(async () => {
    const inbox = await addFolder("Inbox");
    inboxId = inbox.id;
    await writeProject({ inboxFolderId: inboxId });
    await softDeleteFolder(ROOT, inboxId);
  });

  it("returns needs-choice carrying only the state, and writes nothing", async () => {
    const before = await readProjectRaw();
    const out = await resolveInboxFolder(ROOT);
    expect(out).toEqual({ status: "needs-choice", state: "inbox-in-trash" });
    expect(await readProjectRaw()).toBe(before);
    expect(await folders()).toHaveLength(0);
  });

  it("with restore, restores through restoreFolder and reports relocated and renamed", async () => {
    const out = await resolveInboxFolder(ROOT, "restore");
    expect(out).toEqual({
      status: "resolved",
      inboxFolderId: inboxId,
      created: false,
      relocated: false,
      renamed: false,
    });
    expect((await folders()).map((f) => f.id)).toEqual([inboxId]);
  });

  it("reports renamed when a sibling at the root took the name", async () => {
    await addFolder("Inbox");
    const out = await resolveInboxFolder(ROOT, "restore");
    expect(out).toMatchObject({
      status: "resolved",
      inboxFolderId: inboxId,
      renamed: true,
    });
  });

  it("reports relocated when the Inbox's parent folder no longer exists", async () => {
    const parent = await addFolder("Parent");
    const nested = await addFolder("Inbox2", parent.id);
    await writeProject({ inboxFolderId: nested.id });
    await softDeleteFolder(ROOT, nested.id);
    // Remove the parent folder outright (not through Trash) so the manifest's
    // recorded parent is gone at restore time.
    await softDeleteFolder(ROOT, parent.id);
    await purgeFolder(ROOT, parent.id);
    const out = await resolveInboxFolder(ROOT, "restore");
    expect(out).toMatchObject({
      status: "resolved",
      inboxFolderId: nested.id,
      relocated: true,
    });
  });

  it("with new, creates a new Inbox, repoints the id and leaves the old one in Trash", async () => {
    const out = await resolveInboxFolder(ROOT, "new");
    if (out.status !== "resolved") throw new Error("unreachable");
    expect(out.created).toBe(true);
    expect(out.inboxFolderId).not.toBe(inboxId);
    expect((await readConfig()).inboxFolderId).toBe(out.inboxFolderId);
    expect(await exists(`${ROOT}/.trash/meta/folder-${inboxId}.json`)).toBe(
      true,
    );
  });

  it("restoring the old Inbox beside a new one is exercised and reported, not prevented", async () => {
    const created = await resolveInboxFolder(ROOT, "new");
    if (created.status !== "resolved") throw new Error("unreachable");
    const restored = await restoreFolder(ROOT, inboxId);
    expect(restored.renamed).toBe(true);
    const ids = (await folders()).map((f) => f.id);
    expect(ids).toContain(inboxId);
    expect(ids).toContain(created.inboxFolderId);
    expect((await readConfig()).inboxFolderId).toBe(created.inboxFolderId);
  });
});

describe("resolveInboxFolder: concurrency", () => {
  it("two concurrent calls with no Inbox leave exactly one Inbox and return the same id", async () => {
    const [a, b] = await Promise.all([
      resolveInboxFolder(ROOT),
      resolveInboxFolder(ROOT),
    ]);
    if (a.status !== "resolved" || b.status !== "resolved") {
      throw new Error("unreachable");
    }
    expect(a.inboxFolderId).toBe(b.inboxFolderId);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(await folders()).toHaveLength(1);
  });
});

/** Fails writes and renames aimed at project.json; optionally fails folder removal. */
function failingAdapter(opts: { failRm: boolean }): StorageAdapter {
  const base = getStorageAdapter();
  const isProject = (p: string) => p.endsWith("project.json");
  return {
    ...base,
    writeFile: async (p: string, ...rest: unknown[]) => {
      if (isProject(p)) throw new Error("disk full");
      return (base.writeFile as (...a: unknown[]) => Promise<void>)(p, ...rest);
    },
    rename: async (a: string, b: string) => {
      if (isProject(b)) throw new Error("disk full");
      return base.rename(a, b);
    },
    rm: async (p: string, o?: { recursive?: boolean; force?: boolean }) => {
      if (opts.failRm && p.includes("/folders/")) {
        throw new Error("cannot remove");
      }
      return base.rm(p, o);
    },
  } as StorageAdapter;
}

describe("resolveInboxFolder: failed config write", () => {
  it("removes the just-created folder and fails with an error", async () => {
    const base = getStorageAdapter();
    setStorageAdapter(failingAdapter({ failRm: false }));
    await expect(resolveInboxFolder(ROOT)).rejects.toThrow(/disk full/);
    setStorageAdapter(base);
    expect(await folders()).toHaveLength(0);
    expect((await readConfig()).inboxFolderId).toBeUndefined();
  });

  it("reports a failure of the removal itself, naming both failures", async () => {
    setStorageAdapter(failingAdapter({ failRm: true }));
    const err = await resolveInboxFolder(ROOT).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toMatch(/disk full/);
    expect(message).toMatch(/cannot remove/);
  });
});

describe("resolveInboxFolder: locked project and project id", () => {
  it("propagates a locked-access error with nothing written first", async () => {
    const base = createMemoryAdapter();
    await base.mkdir(ROOT, { recursive: true });
    setStorageAdapter(base);
    await writeProject();
    const keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(PID);
    await writeProjectMarker(ROOT, base);
    keyring.lock();
    const locked = workspaceEncryptionAdapter(base, TENANT, keyring);
    const writes: string[] = [];
    setStorageAdapter({
      ...locked,
      writeFile: async (p: string, ...rest: unknown[]) => {
        writes.push(p);
        return (locked.writeFile as (...a: unknown[]) => Promise<void>)(
          p,
          ...rest,
        );
      },
      mkdir: async (p: string, ...rest: unknown[]) => {
        writes.push(p);
        return (locked.mkdir as (...a: unknown[]) => Promise<void>)(p, ...rest);
      },
    } as StorageAdapter);
    const err = await resolveInboxFolder(ROOT).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(err)).toBe(true);
    expect(writes).toEqual([]);
  });

  it("validates the project id before any path is built", async () => {
    await expect(resolveInboxFolderCore("../escape")).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
    await expect(resolveInboxFolderCore("")).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
  });

  it("resolves through a validated project id", async () => {
    const out = await resolveInboxFolderCore(PID);
    expect(out.status).toBe("resolved");
    expect((await readConfig()).inboxFolderId).toBeTruthy();
  });
});
