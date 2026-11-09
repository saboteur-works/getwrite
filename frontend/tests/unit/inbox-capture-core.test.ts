/**
 * Feature 106 Task 8: capture core (FR-2, FR-5, FR-6, FR-9, FR-22). Runs
 * against an in-memory adapter, with no HTTP.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
  getStorageAdapter,
  type StorageAdapter,
} from "../../src/lib/models/io";
import {
  captureToInboxCore,
  CAPTURE_SEEDING_FAILED_MESSAGE,
} from "../../src/lib/models/inbox-capture-core";
import { readFolderTree } from "../../src/lib/models/folder-utils";
import { revisionDir } from "../../src/lib/models/revision";
import { sidecarPathForProject } from "../../src/lib/models/sidecar";
import * as savedDefaults from "../../src/lib/models/saved-defaults-core";
import {
  CAPTURE_LINK_MAX_LENGTH,
  CAPTURE_TEXT_MAX_LENGTH,
} from "../../src/lib/models/inbox-capture-text";
import { CAPTURED_LINK_MAX_LENGTH } from "../../src/lib/models/schemas";
import { createFolderResource } from "../../src/lib/models/resource-factory";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import { softDeleteFolder } from "../../src/lib/models/trash";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { InvalidProjectIdCoreError } from "../../src/lib/models/project-id-core-error";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "66666666-6666-4666-8666-666666666666";
const TENANT = "/ws-inbox-capture";
const ROOT = `${TENANT}/${PID}`;
const NOW = new Date("2026-11-09T10:00:00.000Z");
const opts = { now: () => NOW };

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
const readProjectRaw = (): Promise<string> =>
  readFile(`${ROOT}/project.json`, "utf8");
const readConfig = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readProjectRaw()).config;
const folders = async (): Promise<Array<Record<string, unknown>>> =>
  (await readFolderTree(path.join(ROOT, "folders"))) as Array<
    Record<string, unknown>
  >;
const readSidecarRaw = async (id: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(sidecarPathForProject(ROOT, id), "utf8"));
const readV1 = (id: string): Promise<string> =>
  readFile(path.join(revisionDir(ROOT, id, 1), "content.bin"), "utf8");
const readResourceJson = readSidecarRaw;

const prevEnv = process.env.GETWRITE_PROJECTS_DIR;
beforeEach(async () => {
  process.env.GETWRITE_PROJECTS_DIR = TENANT;
  setStorageAdapter(createMemoryAdapter());
  await mkdir(ROOT, { recursive: true });
  await writeProject();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
});

describe("captureToInboxCore: typed capture", () => {
  it("creates one text item in the Inbox with the whole body in v-1", async () => {
    const text = "First line\nSecond line";
    const r = await captureToInboxCore(
      { projectId: PID, text, origin: "typed" },
      opts,
    );
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    expect(r.notices).toEqual([]);
    const cfg = await readConfig();
    expect(r.inboxFolderId).toBe(cfg.inboxFolderId);
    const f = await folders();
    expect(f.filter((x) => x.name === "Inbox")).toHaveLength(1);
    const resJson = await readResourceJson(r.resourceId);
    expect(resJson.name).toBe("First line");
    expect(resJson.type).toBe("text");
    expect(resJson.folderId).toBe(r.inboxFolderId);
    const v1 = await readV1(r.resourceId);
    expect(v1).toContain("First line");
    expect(v1).toContain("Second line");
  });

  it("writes capturedAt server-side and omits capturedLink without a link", async () => {
    const r = await captureToInboxCore(
      { projectId: PID, text: "hello", origin: "typed" },
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    const side = await readSidecarRaw(r.resourceId);
    expect(side.capturedAt).toBe(NOW.toISOString());
    expect("capturedLink" in side).toBe(false);
  });

  it("writes capturedLink when a link is given", async () => {
    const r = await captureToInboxCore(
      {
        projectId: PID,
        text: "read this",
        link: "  https://example.com/a  ",
        origin: "typed",
      },
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    const side = await readSidecarRaw(r.resourceId);
    expect(side.capturedLink).toBe("https://example.com/a");
    expect(side.capturedAt).toBe(NOW.toISOString());
  });

  it("a link-only capture has the link as body and title", async () => {
    const r = await captureToInboxCore(
      {
        projectId: PID,
        text: "   ",
        link: "https://example.com/only",
        origin: "shared",
      },
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    expect((await readResourceJson(r.resourceId)).name).toBe(
      "https://example.com/only",
    );
    expect(await readV1(r.resourceId)).toContain("https://example.com/only");
    expect((await readSidecarRaw(r.resourceId)).capturedLink).toBe(
      "https://example.com/only",
    );
  });
});

describe("captureToInboxCore: refusals write nothing", () => {
  it.each([
    ["empty", ""],
    ["whitespace", " \n\t "],
    ["over the limit", "x".repeat(CAPTURE_TEXT_MAX_LENGTH + 1)],
  ])("refuses %s text and creates no Inbox", async (_n, text) => {
    const before = await readProjectRaw();
    const r = await captureToInboxCore(
      { projectId: PID, text, origin: "typed" },
      opts,
    );
    expect(r.status).toBe("refused");
    if (r.status === "refused") {
      expect(r.notices).toHaveLength(1);
      expect(r.notices[0].severity).toBe("error");
    }
    expect(await readProjectRaw()).toBe(before);
    expect(await folders()).toEqual([]);
  });

  it("uses distinct codes for empty, too-long text and an invalid link", async () => {
    const code = async (text: string, link?: string) => {
      const r = await captureToInboxCore(
        { projectId: PID, text, link, origin: "typed" },
        opts,
      );
      return r.status === "refused" ? r.notices[0].code : r.status;
    };
    expect(await code("")).toBe("empty");
    expect(await code("x".repeat(CAPTURE_TEXT_MAX_LENGTH + 1))).toBe(
      "text-too-long",
    );
    expect(await code("ok", "h".repeat(CAPTURE_LINK_MAX_LENGTH + 1))).toBe(
      "link-invalid",
    );
  });
});

describe("captureToInboxCore: compile exclusion", () => {
  it("adds the item to compileDefaults and leaves exportDefaults alone", async () => {
    await writeProject({
      exportDefaults: { excludedResourceIds: ["keep-me"] },
      compileDefaults: { excludedResourceIds: ["other"] },
    });
    const r = await captureToInboxCore(
      { projectId: PID, text: "a", origin: "typed" },
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    const cfg = await readConfig();
    expect(cfg.compileDefaults).toEqual({
      excludedResourceIds: ["other", r.resourceId],
    });
    expect(cfg.exportDefaults).toEqual({ excludedResourceIds: ["keep-me"] });
  });

  it("returns a seeding notice and keeps the item at the cap", async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `id-${i}`);
    await writeProject({ compileDefaults: { excludedResourceIds: ids } });
    const r = await captureToInboxCore(
      { projectId: PID, text: "a", origin: "typed" },
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    expect(r.notices).toEqual([
      {
        code: "seeding",
        severity: "info",
        message: savedDefaults.CAPTURE_NOT_EXCLUDED_MESSAGES.atCap,
      },
    ]);
    expect((await readSidecarRaw(r.resourceId)).capturedAt).toBeTruthy();
  });

  it("returns a seeding notice for an unusable stored shape", async () => {
    await writeProject({ compileDefaults: "garbage" });
    const r = await captureToInboxCore(
      { projectId: PID, text: "a", origin: "typed" },
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    expect(r.notices[0].message).toBe(
      savedDefaults.CAPTURE_NOT_EXCLUDED_MESSAGES.unreadable,
    );
    expect((await readConfig()).compileDefaults).toBe("garbage");
  });

  it("returns a seeding throw as a visible error and keeps the item", async () => {
    const spy = vi
      .spyOn(savedDefaults, "seedCompileExclusion")
      .mockRejectedValueOnce(new Error("disk exploded"));
    const r = await captureToInboxCore(
      { projectId: PID, text: "kept", origin: "typed" },
      opts,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    if (r.status !== "created") throw new Error("not created");
    const n = r.notices.find((x) => x.code === "seeding");
    expect(n?.severity).toBe("error");
    expect(n?.message).toContain(CAPTURE_SEEDING_FAILED_MESSAGE);
    expect(await readV1(r.resourceId)).toContain("kept");
  });
});

describe("captureToInboxCore: Inbox in Trash", () => {
  async function trashedInbox(): Promise<string> {
    const f = createFolderResource({ name: "Inbox", parentFolderId: null });
    await writeResourceToFile(ROOT, f);
    await writeProject({ inboxFolderId: f.id });
    await softDeleteFolder(ROOT, f.id);
    return f.id;
  }

  it("returns needs-choice unchanged and writes nothing", async () => {
    await trashedInbox();
    const before = await readProjectRaw();
    const r = await captureToInboxCore(
      { projectId: PID, text: "a", origin: "typed" },
      opts,
    );
    expect(r).toEqual({ status: "needs-choice", state: "inbox-in-trash" });
    expect(await readProjectRaw()).toBe(before);
  });

  it("creates the item after a restore choice", async () => {
    const id = await trashedInbox();
    const r = await captureToInboxCore(
      { projectId: PID, text: "a", origin: "typed", inboxChoice: "restore" },
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    expect(r.inboxFolderId).toBe(id);
  });

  it("creates the item in a new Inbox after a new choice", async () => {
    const id = await trashedInbox();
    const r = await captureToInboxCore(
      { projectId: PID, text: "a", origin: "typed", inboxChoice: "new" },
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    expect(r.inboxFolderId).not.toBe(id);
    expect((await readConfig()).inboxFolderId).toBe(r.inboxFolderId);
  });
});

describe("captureToInboxCore: failures and access", () => {
  it("leaves the Inbox and reports a failure when creating the item fails", async () => {
    const base = getStorageAdapter();
    setStorageAdapter({
      ...base,
      writeFile: async (p: string, ...rest: unknown[]) => {
        if (String(p).includes(`${path.sep}resources${path.sep}`)) {
          throw new Error("write refused");
        }
        return (base.writeFile as (...a: unknown[]) => Promise<void>)(
          p,
          ...rest,
        );
      },
    } as StorageAdapter);
    await expect(
      captureToInboxCore({ projectId: PID, text: "a", origin: "typed" }, opts),
    ).rejects.toThrow(/write refused/);
    setStorageAdapter(base);
    const f = await folders();
    expect(f.filter((x) => x.name === "Inbox")).toHaveLength(1);
    expect((await readConfig()).inboxFolderId).toBe(f[0].id);
  });

  it("validates the project id first", async () => {
    await expect(
      captureToInboxCore(
        { projectId: "../x", text: "a", origin: "typed" },
        opts,
      ),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
    await expect(
      captureToInboxCore(
        { projectId: "../x", text: "", origin: "typed" },
        opts,
      ),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
  });

  it("propagates a locked-access error with nothing written", async () => {
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
    const err = await captureToInboxCore(
      { projectId: PID, text: "a", origin: "typed" },
      opts,
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(err)).toBe(true);
    expect(writes).toEqual([]);
  });

  it("makes no network call", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await captureToInboxCore(
      { projectId: PID, text: "a", origin: "typed" },
      opts,
    );
    expect(f).not.toHaveBeenCalled();
  });
});

describe("link limit single source of truth", () => {
  it("text helper re-exports the schema constant", () => {
    expect(CAPTURE_LINK_MAX_LENGTH).toBe(CAPTURED_LINK_MAX_LENGTH);
  });
});
