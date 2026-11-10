/**
 * Feature 107 Task 3: image capture core (FR-7, FR-9, FR-10, FR-17). Runs
 * against an in-memory adapter, with no HTTP.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  setStorageAdapter,
  getStorageAdapter,
  readFile,
  writeFile,
  mkdir,
  type StorageAdapter,
} from "../../src/lib/models/io";
import {
  captureImageToInboxCore,
  IMAGE_CAPTURE_SEEDING_FAILED_MESSAGE,
  type ImageCaptureRequest,
} from "../../src/lib/models/inbox-image-capture-core";
import { readFolderTree } from "../../src/lib/models/folder-utils";
import { sidecarPathForProject } from "../../src/lib/models/sidecar";
import * as savedDefaults from "../../src/lib/models/saved-defaults-core";
import * as writingLog from "../../src/lib/models/writing-log";
import * as resourceCrud from "../../src/lib/models/resource-crud-core";
import { mediaTooLargeToShowMessage } from "../../src/lib/models/media-validation";
import { createFolderResource } from "../../src/lib/models/resource-factory";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import { softDeleteFolder } from "../../src/lib/models/trash";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { InvalidProjectIdCoreError } from "../../src/lib/models/project-id-core-error";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

/** The on-disk directory name; project.json carries a different id. */
const DIR_ID = "77777777-7777-4777-8777-777777777777";
const JSON_ID = "88888888-8888-4888-8888-888888888888";
const TENANT = "/ws-inbox-image-capture";
const ROOT = `${TENANT}/${DIR_ID}`;
const NOW = new Date("2026-11-09T10:00:00.000Z");
const opts = { now: () => NOW };
const CAP = 31_457_280;

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 250, 251, 252,
]);

const request = (
  over: Partial<ImageCaptureRequest> = {},
): ImageCaptureRequest => ({
  projectId: DIR_ID,
  bytes: PNG,
  name: "photo.png",
  mimeType: "image/png",
  size: PNG.byteLength,
  ...over,
});

const writeProject = (config: Record<string, unknown> = {}) =>
  writeFile(
    `${ROOT}/project.json`,
    JSON.stringify({
      id: JSON_ID,
      name: "P",
      createdAt: "2026-01-01T00:00:00.000Z",
      config,
    }),
    "utf8",
  );
const readConfig = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(`${ROOT}/project.json`, "utf8")).config;
const folders = async (): Promise<Array<Record<string, unknown>>> =>
  (await readFolderTree(path.join(ROOT, "folders"))) as Array<
    Record<string, unknown>
  >;
const readSidecarRaw = async (id: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(sidecarPathForProject(ROOT, id), "utf8"));
const resourceDirExists = (id: string): Promise<boolean> =>
  getStorageAdapter()
    .stat(path.join(ROOT, "resources", id))
    .then(
      () => true,
      () => false,
    );
const listResourceDirs = async (): Promise<string[]> => {
  try {
    const entries = await getStorageAdapter().readdir(
      path.join(ROOT, "resources"),
    );
    return entries.map((e) => (typeof e === "string" ? e : e.name));
  } catch {
    return [];
  }
};
const noWritingLog = async (): Promise<boolean> => {
  try {
    const entries = await getStorageAdapter().readdir(
      path.join(ROOT, "meta", "writing-log"),
    );
    return entries.length === 0;
  } catch {
    return true;
  }
};

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

describe("captureImageToInboxCore: created", () => {
  it("creates one image resource in the Inbox through uploadMediaResourceCore with the input bytes", async () => {
    const spy = vi.spyOn(resourceCrud, "uploadMediaResourceCore");
    const r = await captureImageToInboxCore(request(), opts);
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.notices).toEqual([]);
    const cfg = await readConfig();
    expect(r.inboxFolderId).toBe(cfg.inboxFolderId);
    expect((await folders()).filter((f) => f.name === "Inbox")).toHaveLength(1);
    const side = await readSidecarRaw(r.resourceId);
    expect(side.type).toBe("image");
    expect(side.folderId).toBe(r.inboxFolderId);
    const stored = await getStorageAdapter().readFileBuffer(
      path.join(ROOT, "resources", r.resourceId, "original.png"),
    );
    expect(Array.from(stored)).toEqual(Array.from(PNG));
  });

  it("names the project by its directory id, not the id in project.json", async () => {
    const r = await captureImageToInboxCore(request(), opts);
    expect(r.status).toBe("created");
    const byJsonId = await captureImageToInboxCore(
      request({ projectId: JSON_ID }),
      opts,
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(byJsonId).not.toBeNull();
    expect(await listResourceDirs()).toHaveLength(1);
  });

  it("writes capturedAt server-side as an ISO timestamp", async () => {
    const r = await captureImageToInboxCore(request(), opts);
    if (r.status !== "created") throw new Error("not created");
    const side = await readSidecarRaw(r.resourceId);
    expect(side.capturedAt).toBe(NOW.toISOString());
    expect("capturedLink" in side).toBe(false);
  });

  it("seeds compileDefaults with the item id and leaves exportDefaults untouched", async () => {
    await writeProject({ exportDefaults: { excludedResourceIds: ["keep"] } });
    const r = await captureImageToInboxCore(request(), opts);
    if (r.status !== "created") throw new Error("not created");
    const cfg = await readConfig();
    expect(cfg.compileDefaults).toEqual({
      excludedResourceIds: [r.resourceId],
    });
    expect(cfg.exportDefaults).toEqual({ excludedResourceIds: ["keep"] });
  });

  it("writes no writing-log entry", async () => {
    const append = vi.spyOn(writingLog, "appendWritingLogEntry");
    const r = await captureImageToInboxCore(request(), opts);
    expect(r.status).toBe("created");
    expect(append).not.toHaveBeenCalled();
    expect(await noWritingLog()).toBe(true);
  });

  it("sanitises the shared name before it reaches a path", async () => {
    const r = await captureImageToInboxCore(
      request({ name: "../../etc/evil.png" }),
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    expect(await listResourceDirs()).toEqual([r.resourceId]);
    const side = await readSidecarRaw(r.resourceId);
    expect(String(side.name)).not.toContain("/");
    expect(String(side.name)).not.toContain("..");
  });

  it("accepts an input of exactly 31,457,280 bytes", async () => {
    const bytes = new Uint8Array(CAP);
    bytes.set(PNG);
    const r = await captureImageToInboxCore(
      request({ bytes, size: CAP }),
      opts,
    );
    expect(r.status).toBe("created");
  });
});

describe("captureImageToInboxCore: Inbox in Trash", () => {
  const trashInbox = async (): Promise<string> => {
    const f = createFolderResource({ name: "Inbox", parentFolderId: null });
    await writeResourceToFile(ROOT, f);
    await writeProject({ inboxFolderId: f.id });
    await softDeleteFolder(ROOT, f.id);
    return f.id;
  };

  it("returns needs-choice with nothing written when no choice is given", async () => {
    await trashInbox();
    const before = await listResourceDirs();
    const cfgBefore = await readConfig();
    const r = await captureImageToInboxCore(request(), opts);
    expect(r).toEqual({ status: "needs-choice", state: "inbox-in-trash" });
    expect(await listResourceDirs()).toEqual(before);
    expect(await readConfig()).toEqual(cfgBefore);
  });

  it("restore puts the item in the restored Inbox", async () => {
    const id = await trashInbox();
    const r = await captureImageToInboxCore(
      request({ inboxChoice: "restore" }),
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    expect(r.inboxFolderId).toBe(id);
  });

  it("new creates a second Inbox and uses it", async () => {
    const id = await trashInbox();
    const r = await captureImageToInboxCore(
      request({ inboxChoice: "new" }),
      opts,
    );
    if (r.status !== "created") throw new Error("not created");
    expect(r.inboxFolderId).not.toBe(id);
  });

  it("creates a new Inbox when the stored id is purged", async () => {
    const gone = "99999999-9999-4999-8999-999999999999";
    await writeProject({ inboxFolderId: gone });
    const r = await captureImageToInboxCore(request(), opts);
    if (r.status !== "created") throw new Error("not created");
    expect(r.inboxFolderId).not.toBe(gone);
    expect((await readConfig()).inboxFolderId).toBe(r.inboxFolderId);
  });

  it("creates a new Inbox when the id is unset, even beside another folder", async () => {
    const folder = createFolderResource({
      name: "Other",
      parentFolderId: null,
    });
    await writeResourceToFile(ROOT, folder);
    const r = await captureImageToInboxCore(request(), opts);
    if (r.status !== "created") throw new Error("not created");
    expect(r.inboxFolderId).not.toBe(folder.id);
  });
});

describe("captureImageToInboxCore: refusals write nothing", () => {
  it("refuses 31,457,281 bytes with the FR-148 text and writes no resource, folder or file", async () => {
    const bytes = new Uint8Array(CAP + 1);
    const upload = vi.spyOn(resourceCrud, "uploadMediaResourceCore");
    const r = await captureImageToInboxCore(
      request({ bytes, size: CAP + 1 }),
      opts,
    );
    expect(r).toEqual({
      status: "refused",
      reason: "too-large",
      message: mediaTooLargeToShowMessage(CAP + 1),
    });
    expect(upload).not.toHaveBeenCalled();
    expect(await listResourceDirs()).toEqual([]);
    expect(await folders()).toEqual([]);
    expect((await readConfig()).inboxFolderId).toBeUndefined();
  });

  it("refuses by the bytes in hand when the reported size understates them", async () => {
    const bytes = new Uint8Array(CAP + 1);
    const r = await captureImageToInboxCore(request({ bytes, size: 10 }), opts);
    expect(r.status).toBe("refused");
    expect(await folders()).toEqual([]);
  });

  it("refuses a non-image type before writing anything", async () => {
    const r = await captureImageToInboxCore(
      request({ name: "song.mp3", mimeType: "audio/mpeg" }),
      opts,
    );
    expect(r).toMatchObject({ status: "refused", reason: "unsupported-type" });
    expect(await folders()).toEqual([]);
    expect(await listResourceDirs()).toEqual([]);
  });

  it("refuses an empty input", async () => {
    const r = await captureImageToInboxCore(
      request({ bytes: new Uint8Array(0), size: 0 }),
      opts,
    );
    expect(r).toMatchObject({ status: "refused", reason: "empty" });
    expect(await folders()).toEqual([]);
  });

  it("a failing binary write leaves no resource directory", async () => {
    const base = getStorageAdapter();
    setStorageAdapter({
      ...base,
      writeFile: async (p: string, data: unknown, ...rest: unknown[]) => {
        if (typeof data !== "string") throw new Error("disk full");
        return (base.writeFile as (...a: unknown[]) => Promise<void>)(
          p,
          data,
          ...rest,
        );
      },
    } as StorageAdapter);
    await expect(captureImageToInboxCore(request(), opts)).rejects.toThrow(
      /disk full/,
    );
    expect(await listResourceDirs()).toEqual([]);
  });

  it("rejects a malformed project id", async () => {
    await expect(
      captureImageToInboxCore(request({ projectId: "../x" }), opts),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
  });
});

describe("captureImageToInboxCore: seeding and locking", () => {
  it("keeps the item and returns a notice when seeding reports one", async () => {
    vi.spyOn(savedDefaults, "seedCompileExclusion").mockResolvedValue({
      notice: "full",
    });
    const r = await captureImageToInboxCore(request(), opts);
    if (r.status !== "created") throw new Error("not created");
    expect(r.notices).toEqual([
      { code: "seeding", severity: "info", message: "full" },
    ]);
    expect(await resourceDirExists(r.resourceId)).toBe(true);
  });

  it("keeps the item and returns an error notice when seeding throws", async () => {
    vi.spyOn(savedDefaults, "seedCompileExclusion").mockRejectedValue(
      new Error("boom"),
    );
    const r = await captureImageToInboxCore(request(), opts);
    if (r.status !== "created") throw new Error("not created");
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toMatchObject({ code: "seeding", severity: "error" });
    expect(r.notices[0]?.message).toContain(
      IMAGE_CAPTURE_SEEDING_FAILED_MESSAGE,
    );
    expect(r.notices[0]?.message).toContain("boom");
    expect(await resourceDirExists(r.resourceId)).toBe(true);
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
    await keyring.addProject(DIR_ID);
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
    const err = await captureImageToInboxCore(request(), opts).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(err)).toBe(true);
    expect(writes).toEqual([]);
  });

  it("makes no network call", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await captureImageToInboxCore(request(), opts);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("import graph (FR-17)", () => {
  const root = path.resolve(__dirname, "../../src");
  const specifiers = (file: string): string[] =>
    [
      ...readFileSync(file, "utf8").matchAll(
        /(?:^|\n)\s*(?:import|export)\b[^;'"]*?from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
      ),
    ].map((m) => m[1] ?? m[2] ?? m[3]);
  const resolveRel = (from: string, spec: string): string => {
    const base = path.resolve(path.dirname(from), spec);
    for (const c of [
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
    ]) {
      if (existsSync(c)) return c;
    }
    throw new Error(`unresolved ${spec} from ${from}`);
  };
  const closure = (entry: string): { files: string[]; bare: string[] } => {
    const seen = new Set<string>();
    const bare = new Set<string>();
    const walk = (f: string): void => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const s of specifiers(f)) {
        if (s.endsWith(".json")) continue;
        if (s.startsWith(".")) walk(resolveRel(f, s));
        else bare.add(s);
      }
    };
    walk(entry);
    return { files: [...seen], bare: [...bare] };
  };

  it("holds nothing outside what the text capture core already pulls in, and no React or Next", () => {
    const image = closure(
      path.join(root, "lib/models/inbox-image-capture-core.ts"),
    );
    const text = closure(path.join(root, "lib/models/inbox-capture-core.ts"));
    for (const b of image.bare) {
      expect(b).not.toMatch(/^(react|react-dom|next)(\/|$)/);
      expect(text.bare).toContain(b);
    }
    expect(image.files.some((f) => f.endsWith(".tsx"))).toBe(false);
  });
});
