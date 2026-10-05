/**
 * Feature 68 Task 6: GET/PUT /api/project/entity-graph-settings route.
 * Reads/writes config.entityGraphConnectionTypes and
 * config.entityGraphFocalHopRadius. projectId is validated; no client path
 * is accepted; locked-access errors are not caught here and propagate to
 * withStorageContext for 401/409 mapping.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../src/lib/models/entity-graph-settings-core",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../src/lib/models/entity-graph-settings-core")
      >();
    return {
      ...actual,
      setEntityGraphSettingsCore: vi.fn(actual.setEntityGraphSettingsCore),
    };
  },
);

import { GET, PUT } from "../../app/api/project/entity-graph-settings/route";
import { setEntityGraphSettingsCore } from "../../src/lib/models/entity-graph-settings-core";
import { DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES } from "../../src/lib/models/entity-graph-connection-types";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.mocked(setEntityGraphSettingsCore).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-egs-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "egs" }), null, 2),
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

function get(projectId: string): never {
  return new Request(
    `http://localhost/api/project/entity-graph-settings?projectId=${projectId}`,
  ) as never;
}

function put(body: unknown): never {
  return new Request("http://localhost/api/project/entity-graph-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("GET /api/project/entity-graph-settings", () => {
  it("returns the Task 1 defaults for a project with nothing persisted", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () => GET(get(id)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      entityGraphConnectionTypes: DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES,
      entityGraphFocalHopRadius: 1,
    });
  });

  it("returns the uniform 400 for an invalid projectId", async () => {
    const { dir } = await setup();
    const res = await withDir(dir, () => GET(get("nope")));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
  });
});

describe("PUT /api/project/entity-graph-settings", () => {
  it("sets both fields and persists them", async () => {
    const { dir, id, root } = await setup();
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityGraphConnectionTypes: ["authored", "backlinks"],
          entityGraphFocalHopRadius: 2,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      entityGraphConnectionTypes: ["authored", "backlinks"],
      entityGraphFocalHopRadius: 2,
    });
    const saved = JSON.parse(
      await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
    );
    expect(saved.config.entityGraphConnectionTypes).toEqual([
      "authored",
      "backlinks",
    ]);
    expect(saved.config.entityGraphFocalHopRadius).toBe(2);
    expect(setEntityGraphSettingsCore).toHaveBeenCalledWith(
      id,
      ["authored", "backlinks"],
      2,
    );
  });

  it("filters an unrecognized connection-type key rather than rejecting (FR-2)", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityGraphConnectionTypes: ["authored", "not-a-real-type"],
          entityGraphFocalHopRadius: 1,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      entityGraphConnectionTypes: ["authored"],
      entityGraphFocalHopRadius: 1,
    });
  });

  it.each([[-1], [1.5], ["2"], [undefined]])(
    "rejects invalid hop radius %s with 400",
    async (hopRadius) => {
      const { dir, id } = await setup();
      const res = await withDir(dir, () =>
        PUT(
          put({
            projectId: id,
            entityGraphConnectionTypes: ["authored"],
            entityGraphFocalHopRadius: hopRadius,
          }),
        ),
      );
      expect(res.status).toBe(400);
    },
  );

  it("rejects a non-array entityGraphConnectionTypes with 400", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityGraphConnectionTypes: "authored",
          entityGraphFocalHopRadius: 1,
        }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns the uniform 400 for an invalid projectId and 400 for bad JSON", async () => {
    const { dir } = await setup();
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: "nope",
          entityGraphConnectionTypes: ["authored"],
          entityGraphFocalHopRadius: 1,
        }),
      ),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
    const bad = await withDir(dir, () =>
      PUT(
        new Request("http://localhost/api/project/entity-graph-settings", {
          method: "PUT",
          body: "{",
        }) as never,
      ),
    );
    expect(bad.status).toBe(400);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409 (not caught by the route handler itself)", async () => {
    const { dir, id } = await setup();
    vi.mocked(setEntityGraphSettingsCore).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    const locked = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityGraphConnectionTypes: ["authored"],
          entityGraphFocalHopRadius: 1,
        }),
      ),
    );
    expect(locked.status).toBe(401);

    vi.mocked(setEntityGraphSettingsCore).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    const keyless = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityGraphConnectionTypes: ["authored"],
          entityGraphFocalHopRadius: 1,
        }),
      ),
    );
    expect(keyless.status).toBe(409);
  });
});
