/**
 * Feature 101 Task 3: PUT /api/project/compile-defaults and
 * PUT /api/project/export-defaults (FR-2, FR-32). Invalid project id or body
 * maps to 400; locked-access errors propagate to withStorageContext (401/409);
 * no client-supplied path is accepted.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/saved-defaults-core", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../src/lib/models/saved-defaults-core")
    >();
  return {
    ...actual,
    setCompileDefaultsCore: vi.fn(actual.setCompileDefaultsCore),
    setExportDefaultsCore: vi.fn(actual.setExportDefaultsCore),
  };
});

import { PUT as PUT_COMPILE } from "../../app/api/project/compile-defaults/route";
import { PUT as PUT_EXPORT } from "../../app/api/project/export-defaults/route";
import {
  setCompileDefaultsCore,
  setExportDefaultsCore,
  SAVED_DEFAULTS_MESSAGES,
} from "../../src/lib/models/saved-defaults-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

const tmpDirs: string[] = [];
const A = generateUUID();
const B = generateUUID();

afterEach(async () => {
  vi.mocked(setCompileDefaultsCore).mockClear();
  vi.mocked(setExportDefaultsCore).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-sd-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "sd" }), null, 2),
    "utf8",
  );
  return { dir, id, root };
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

function put(url: string, body: unknown): never {
  return new Request(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

async function readConfig(root: string): Promise<Record<string, unknown>> {
  const saved = JSON.parse(
    await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
  );
  return saved.config as Record<string, unknown>;
}

const ROUTES = [
  {
    key: "compileDefaults",
    url: "http://localhost/api/project/compile-defaults",
    PUT: PUT_COMPILE,
    core: setCompileDefaultsCore,
  },
  {
    key: "exportDefaults",
    url: "http://localhost/api/project/export-defaults",
    PUT: PUT_EXPORT,
    core: setExportDefaultsCore,
  },
] as const;

describe.each(ROUTES)("PUT $url", ({ key, url, PUT, core }) => {
  it("sets (deduped) then clears the key", async () => {
    const { dir, id, root } = await setup();
    const set = await withDir(dir, () =>
      PUT(put(url, { projectId: id, excludedResourceIds: [A, B, A] })),
    );
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ excludedResourceIds: [A, B] });
    expect((await readConfig(root))[key]).toEqual({
      excludedResourceIds: [A, B],
    });

    const cleared = await withDir(dir, () =>
      PUT(put(url, { projectId: id, excludedResourceIds: null })),
    );
    expect(cleared.status).toBe(200);
    expect("excludedResourceIds" in (await cleared.json())).toBe(false);
    expect(key in (await readConfig(root))).toBe(false);
  });

  it("returns the core's refusal message as the 400 error body", async () => {
    const { dir, id, root } = await setup();
    const res = await withDir(dir, () =>
      PUT(put(url, { projectId: id, excludedResourceIds: [A, "nope"] })),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: SAVED_DEFAULTS_MESSAGES.notUuid,
    });
    expect(key in (await readConfig(root))).toBe(false);
  });

  it("rejects a missing excludedResourceIds key with 400 and never calls the core", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () => PUT(put(url, { projectId: id })));
    expect(res.status).toBe(400);
    expect(core).not.toHaveBeenCalled();
  });

  it("returns the uniform 400 for an invalid projectId, a bad body and bad JSON", async () => {
    const { dir } = await setup();
    const res = await withDir(dir, () =>
      PUT(put(url, { projectId: "nope", excludedResourceIds: [A] })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
    const notObject = await withDir(dir, () => PUT(put(url, [A])));
    expect(notObject.status).toBe(400);
    const bad = await withDir(dir, () =>
      PUT(new Request(url, { method: "PUT", body: "{" }) as never),
    );
    expect(bad.status).toBe(400);
  });

  it("ignores a client-supplied path: the project comes from projectId only", async () => {
    const { dir, id } = await setup();
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "gw-sd-other-"));
    tmpDirs.push(other);
    const res = await withDir(dir, () =>
      PUT(
        put(url, {
          projectId: id,
          excludedResourceIds: [A],
          path: other,
          projectRoot: other,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(await fs.readdir(other)).toEqual([]);
    expect(core).toHaveBeenCalledWith(id, [A]);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409", async () => {
    const { dir, id } = await setup();
    vi.mocked(core).mockRejectedValueOnce(new ProjectLockedError(id));
    const locked = await withDir(dir, () =>
      PUT(put(url, { projectId: id, excludedResourceIds: [A] })),
    );
    expect(locked.status).toBe(401);
    vi.mocked(core).mockRejectedValueOnce(new MissingProjectKeyError(id));
    const keyless = await withDir(dir, () =>
      PUT(put(url, { projectId: id, excludedResourceIds: [A] })),
    );
    expect(keyless.status).toBe(409);
  });
});
