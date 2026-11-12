/**
 * Feature 102 Task 9: GET/PUT /api/project/folder-metadata. The route maps
 * the core's refusal to 400, an invalid project or folder id to 400, and a
 * locked project to the existing locked response (401/409) through
 * withStorageContext. Owner decision 2026-11-07 (Task 35, FR-3): a write for
 * a folder id with no folder behind it is 404 and creates no sidecar.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/folder-metadata-core", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../src/lib/models/folder-metadata-core")
    >();
  return {
    ...actual,
    getFolderMetadataCore: vi.fn(actual.getFolderMetadataCore),
    updateFolderMetadataCore: vi.fn(actual.updateFolderMetadataCore),
  };
});

import * as route from "../../app/api/project/folder-metadata/route";
import {
  getFolderMetadataCore,
  updateFolderMetadataCore,
} from "../../src/lib/models/folder-metadata-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { folderSidecarPathForProject } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";

const { GET, PUT } = route;
const tmpDirs: string[] = [];

afterEach(async () => {
  vi.mocked(getFolderMetadataCore).mockClear();
  vi.mocked(updateFolderMetadataCore).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(
  config: Record<string, unknown> = {},
): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-folder-meta-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id, name: "fm", config }),
    "utf8",
  );
  return { dir, id, root };
}

/** Writes a `folders/<slug>/folder.json` descriptor so `folderId` names a folder. */
async function addFolder(root: string, folderId: string): Promise<void> {
  const dir = path.join(root, "folders", "act-one");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "folder.json"),
    JSON.stringify({
      id: folderId,
      slug: "act-one",
      name: "Act One",
      type: "folder",
      orderIndex: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    "utf8",
  );
}

async function withDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

function get(query: string): never {
  return new Request(
    `http://localhost/api/project/folder-metadata${query}`,
  ) as never;
}

function put(body: unknown): never {
  return new Request("http://localhost/api/project/folder-metadata", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("route module", () => {
  it("is force-dynamic", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/project/folder-metadata", () => {
  it("reads an absent sidecar as empty and creates nothing", async () => {
    const { dir, id, root } = await setup();
    const folderId = generateUUID();
    const res = await withDir(dir, () =>
      GET(get(`?projectId=${id}&folderId=${folderId}`)),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: "", fieldValues: {} });
    await expect(
      fs.stat(folderSidecarPathForProject(root, folderId)),
    ).rejects.toThrow();
  });

  it("answers 400 for a missing or non-UUID projectId", async () => {
    const folderId = generateUUID();
    for (const q of [
      `?folderId=${folderId}`,
      `?projectId=../x&folderId=${folderId}`,
    ]) {
      const res = await GET(get(q));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid projectId");
    }
  });

  it("answers 400 for a missing or non-UUID folderId", async () => {
    const { dir, id } = await setup();
    for (const q of [`?projectId=${id}`, `?projectId=${id}&folderId=../x`]) {
      const res = await withDir(dir, () => GET(get(q)));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid folder id");
    }
  });
});

describe("PUT /api/project/folder-metadata", () => {
  it("writes and returns the merged metadata", async () => {
    const { dir, id, root } = await setup();
    const folderId = generateUUID();
    await addFolder(root, folderId);
    const res = await withDir(dir, () =>
      PUT(put({ projectId: id, folderId, metadata: { notes: "hello" } })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: "hello", fieldValues: {} });
    expect(updateFolderMetadataCore).toHaveBeenCalledWith(id, folderId, {
      notes: "hello",
    });
  });

  it("maps a core refusal to 400 with the core's message and writes nothing", async () => {
    const { dir, id, root } = await setup();
    const folderId = generateUUID();
    const res = await withDir(dir, () =>
      PUT(put({ projectId: id, folderId, metadata: { name: "x" } })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      '"name" is not writable on folder metadata',
    );
    await expect(
      fs.stat(folderSidecarPathForProject(root, folderId)),
    ).rejects.toThrow();
  });

  it("answers 400 for a missing metadata key, invalid JSON, and ids", async () => {
    const { dir, id } = await setup();
    const folderId = generateUUID();
    const noMeta = await withDir(dir, () =>
      PUT(put({ projectId: id, folderId })),
    );
    expect(noMeta.status).toBe(400);
    const badJson = await PUT(
      new Request("http://localhost/api/project/folder-metadata", {
        method: "PUT",
        body: "{",
      }) as never,
    );
    expect(badJson.status).toBe(400);
    const badProject = await PUT(
      put({ projectId: "nope", folderId, metadata: {} }),
    );
    expect(badProject.status).toBe(400);
    expect((await badProject.json()).error).toBe("Invalid projectId");
    const badFolder = await withDir(dir, () =>
      PUT(put({ projectId: id, folderId: "nope", metadata: {} })),
    );
    expect(badFolder.status).toBe(400);
    expect((await badFolder.json()).error).toBe("Invalid folder id");
  });

  it("ignores a client-supplied path", async () => {
    const { dir, id, root } = await setup();
    const other = path.join(dir, "elsewhere");
    await fs.mkdir(other);
    const folderId = generateUUID();
    await addFolder(root, folderId);
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          folderId,
          projectRoot: other,
          metadata: { notes: "ok" },
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(await fs.readdir(other)).toEqual([]);
  });

  it("answers 404 for an unknown folder id and creates no sidecar", async () => {
    const { dir, id, root } = await setup();
    const folderId = generateUUID();
    const res = await withDir(dir, () =>
      PUT(put({ projectId: id, folderId, metadata: { notes: "orphan" } })),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Folder not found");
    await expect(
      fs.stat(folderSidecarPathForProject(root, folderId)),
    ).rejects.toThrow();
    const metaEntries = await fs
      .readdir(path.join(root, "meta"))
      .catch(() => []);
    expect(metaEntries.filter((n) => n.startsWith("folder-"))).toEqual([]);
  });
});

describe("PUT clearFieldKeys (Feature 109 Task 11)", () => {
  it("clears only the named keys, passes the field to the core, 400 on a bad list, 404 on an unknown folder", async () => {
    const { dir, id, root } = await setup();
    const folderId = generateUUID();
    await addFolder(root, folderId);
    await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          folderId,
          metadata: { fieldValues: { a: "1", b: "2" } },
        }),
      ),
    );
    const ok = await withDir(dir, () =>
      PUT(
        put({ projectId: id, folderId, metadata: { clearFieldKeys: ["a"] } }),
      ),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ notes: "", fieldValues: { b: "2" } });
    expect(updateFolderMetadataCore).toHaveBeenLastCalledWith(id, folderId, {
      clearFieldKeys: ["a"],
    });
    const bad = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          folderId,
          metadata: { clearFieldKeys: ["SECRET-X", "SECRET-X"] },
        }),
      ),
    );
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).not.toContain("SECRET-X");
    const missing = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          folderId: generateUUID(),
          metadata: { clearFieldKeys: ["a"] },
        }),
      ),
    );
    expect(missing.status).toBe(404);
  });
});

describe("locked project", () => {
  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409 on GET and PUT", async () => {
    const { dir, id } = await setup();
    const folderId = generateUUID();
    const q = `?projectId=${id}&folderId=${folderId}`;
    vi.mocked(getFolderMetadataCore).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    expect((await withDir(dir, () => GET(get(q)))).status).toBe(401);
    vi.mocked(getFolderMetadataCore).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    expect((await withDir(dir, () => GET(get(q)))).status).toBe(409);
    const body = { projectId: id, folderId, metadata: { notes: "x" } };
    vi.mocked(updateFolderMetadataCore).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    expect((await withDir(dir, () => PUT(put(body)))).status).toBe(401);
    vi.mocked(updateFolderMetadataCore).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    expect((await withDir(dir, () => PUT(put(body)))).status).toBe(409);
  });
});
