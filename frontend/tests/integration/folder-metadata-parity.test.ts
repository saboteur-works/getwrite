/**
 * Feature 102 Task 9 (FR-8): the same invalid input is refused with the same
 * message through the core, the HTTP route handler and the native backend,
 * and a valid write reads back identically.
 *
 * Each fixture is seeded into two real temp directories (core, route) and one
 * fake Capacitor filesystem (native). Outcomes are compared with each other
 * and with the literal expected message, so a shared regression cannot pass by
 * agreeing with itself. This shows the validation parity of the three entry
 * points; it does not measure native lock behaviour (reasoned, not run).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  GET as getRoute,
  PUT as putRoute,
} from "../../app/api/project/folder-metadata/route";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import {
  InvalidFolderMetadataError,
  updateFolderMetadataCore,
} from "../../src/lib/models/folder-metadata-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { createNativeFolderMetadataTransport } from "../../src/store/transport/native-folder-metadata-backend";
import { removeDirRetry } from "../unit/helpers/fs-utils";

const NATIVE_PROJECTS_DIR = "/projects";
const CONFIG = { subtypes: ["Act", "Chapter"] };
const FOLDER_ID = generateUUID();
const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

const FOLDER_JSON = JSON.stringify({
  id: FOLDER_ID,
  slug: "act-one",
  name: "Act One",
  type: "folder",
  orderIndex: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
});

interface Side {
  dir: string;
  projectId: string;
}

async function seedReal(): Promise<Side> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-fm-parity-"));
  tmpDirs.push(dir);
  const projectId = generateUUID();
  await fs.mkdir(path.join(dir, projectId), { recursive: true });
  await fs.writeFile(
    path.join(dir, projectId, "project.json"),
    JSON.stringify({ id: projectId, name: "p", config: CONFIG }),
  );
  await fs.mkdir(path.join(dir, projectId, "folders", "act-one"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(dir, projectId, "folders", "act-one", "folder.json"),
    FOLDER_JSON,
  );
  return { dir, projectId };
}

async function seedNative() {
  const nativeFs = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(nativeFs);
  const projectId = generateUUID();
  const root = path.join(NATIVE_PROJECTS_DIR, projectId);
  await adapter.mkdir(root, { recursive: true });
  await adapter.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id: projectId, name: "p", config: CONFIG }),
  );
  await adapter.mkdir(path.join(root, "folders", "act-one"), {
    recursive: true,
  });
  await adapter.writeFile(
    path.join(root, "folders", "act-one", "folder.json"),
    FOLDER_JSON,
  );
  return { nativeFs, projectId };
}

async function withProjectsDir<T>(dir: string, fn: () => Promise<T>) {
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

type Outcome =
  | { ok: true; value: unknown }
  | { ok: false; message: string; status?: number };

async function viaCore(side: Side, payload: unknown): Promise<Outcome> {
  return withProjectsDir(side.dir, async () => {
    try {
      const value = await updateFolderMetadataCore(
        side.projectId,
        FOLDER_ID,
        payload,
      );
      return { ok: true, value: JSON.parse(JSON.stringify(value)) };
    } catch (error) {
      if (error instanceof InvalidFolderMetadataError) {
        return { ok: false, message: error.message };
      }
      throw error;
    }
  });
}

async function viaRoute(
  side: Side,
  payload: unknown,
  folderId = FOLDER_ID,
): Promise<Outcome> {
  return withProjectsDir(side.dir, async () => {
    const res = await putRoute(
      new NextRequest("http://localhost/api/project/folder-metadata", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: side.projectId,
          folderId,
          metadata: payload,
        }),
      }),
    );
    const body = (await res.json()) as { error?: string };
    if (res.status !== 200) {
      return { ok: false, message: String(body.error), status: res.status };
    }
    return { ok: true, value: body };
  });
}

async function viaNative(
  native: Awaited<ReturnType<typeof seedNative>>,
  payload: unknown,
): Promise<Outcome> {
  const transport = createNativeFolderMetadataTransport({
    fs: native.nativeFs,
    projectsDir: NATIVE_PROJECTS_DIR,
  });
  try {
    const value = await transport.updateFolderMetadata(
      native.projectId,
      FOLDER_ID,
      payload,
    );
    return { ok: true, value: JSON.parse(JSON.stringify(value)) };
  } catch (error) {
    if (error instanceof InvalidFolderMetadataError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

async function runAll(payload: unknown) {
  const core = await seedReal();
  const route = await seedReal();
  const native = await seedNative();
  return {
    core: await viaCore(core, payload),
    route: await viaRoute(route, payload),
    native: await viaNative(native, payload),
  };
}

const REFUSALS: ReadonlyArray<{
  name: string;
  payload: unknown;
  message: string;
}> = [
  {
    name: "a key outside the allowlist",
    payload: { name: "x" },
    message: '"name" is not writable on folder metadata',
  },
  {
    name: "a non-string note",
    payload: { notes: 4 },
    message: "notes must be a string",
  },
  {
    name: "a reserved field key",
    payload: { fieldValues: { notes: "x" } },
    message: 'fieldValues key "notes" is not allowed',
  },
  {
    name: "a subtype not in the project list",
    payload: { resourceSubtype: "Nope" },
    message: "resourceSubtype is not in the project's subtype list",
  },
  {
    name: "a non-object payload",
    payload: [],
    message: "Folder metadata must be an object",
  },
];

describe("folder metadata parity: core, route, native (FR-8)", () => {
  it.each(REFUSALS)(
    "refuses $name with the same message on all three",
    async ({ payload, message }) => {
      const { core, route, native } = await runAll(payload);
      expect(core).toEqual({ ok: false, message });
      expect(native).toEqual({ ok: false, message });
      expect(route).toEqual({ ok: false, message, status: 400 });
    },
  );

  it("stores a valid write identically on all three", async () => {
    const payload = {
      notes: "n",
      fieldValues: { mood: "calm" },
      resourceSubtype: "act",
    };
    const { core, route, native } = await runAll(payload);
    const expected: Outcome = {
      ok: true,
      value: {
        notes: "n",
        fieldValues: { mood: "calm" },
        resourceSubtype: "Act",
      },
    };
    expect(core).toEqual(expected);
    expect(route).toEqual(expected);
    expect(native).toEqual(expected);
  });

  it("refuses a write for an unknown folder id with 404 and the same message on all three, creating no sidecar (Task 35, FR-3)", async () => {
    const core = await seedReal();
    const route = await seedReal();
    const native = await seedNative();
    const unknown = generateUUID();
    const message = "Folder not found";
    await withProjectsDir(core.dir, async () => {
      await expect(
        updateFolderMetadataCore(core.projectId, unknown, { notes: "x" }),
      ).rejects.toThrow(message);
    });
    expect(await viaRoute(route, { notes: "x" }, unknown)).toEqual({
      ok: false,
      message,
      status: 404,
    });
    await expect(
      createNativeFolderMetadataTransport({
        fs: native.nativeFs,
        projectsDir: NATIVE_PROJECTS_DIR,
      }).updateFolderMetadata(native.projectId, unknown, { notes: "x" }),
    ).rejects.toThrow(message);
    const sidecar = `folder-${unknown}.meta.json`;
    for (const dir of [core.dir, route.dir]) {
      const projectId = dir === core.dir ? core.projectId : route.projectId;
      const names = await fs
        .readdir(path.join(dir, projectId, "meta"))
        .catch(() => [] as string[]);
      expect(names).not.toContain(sidecar);
    }
    const nativeAdapter = capacitorFsAdapter(native.nativeFs);
    await expect(
      nativeAdapter.stat(
        path.join(NATIVE_PROJECTS_DIR, native.projectId, "meta", sidecar),
      ),
    ).rejects.toThrow();
  });

  it("refuses an invalid folder id with the same message on all three", async () => {
    const core = await seedReal();
    const route = await seedReal();
    const native = await seedNative();
    const message = "Invalid folder id";
    await withProjectsDir(core.dir, async () => {
      await expect(
        updateFolderMetadataCore(core.projectId, "nope", { notes: "x" }),
      ).rejects.toThrow(message);
    });
    expect(await viaRoute(route, { notes: "x" }, "nope")).toEqual({
      ok: false,
      message,
      status: 400,
    });
    await expect(
      createNativeFolderMetadataTransport({
        fs: native.nativeFs,
        projectsDir: NATIVE_PROJECTS_DIR,
      }).updateFolderMetadata(native.projectId, "nope", { notes: "x" }),
    ).rejects.toThrow(message);
  });

  it("refuses an invalid project id on all three", async () => {
    const route = await seedReal();
    const native = await seedNative();
    await withProjectsDir(route.dir, async () => {
      await expect(
        updateFolderMetadataCore("not-a-uuid", FOLDER_ID, { notes: "x" }),
      ).rejects.toThrow(/Invalid projectId/);
      const res = await getRoute(
        new NextRequest(
          `http://localhost/api/project/folder-metadata?projectId=nope&folderId=${FOLDER_ID}`,
        ),
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(
        "Invalid projectId",
      );
    });
    await expect(
      createNativeFolderMetadataTransport({
        fs: native.nativeFs,
        projectsDir: NATIVE_PROJECTS_DIR,
      }).getFolderMetadata("nope", FOLDER_ID),
    ).rejects.toThrow(/Invalid projectId/);
  });
});
