/**
 * Feature 98 Task 7: PUT /api/project/goal-filter route.
 * Sets or clears config.goalFilter. projectId is validated; no client path is
 * accepted; locked-access errors propagate to withStorageContext (401/409);
 * each refusal returns the core's message as the error body.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/goal-filter-core", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../src/lib/models/goal-filter-core")
    >();
  return { ...actual, setGoalFilterCore: vi.fn(actual.setGoalFilterCore) };
});

import { PUT } from "../../app/api/project/goal-filter/route";
import { setGoalFilterCore } from "../../src/lib/models/goal-filter-core";
import { GOAL_FILTER_MESSAGES } from "../../src/lib/models/goal-filter-validation";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

const tmpDirs: string[] = [];
const VALID = { op: "eq", field: "status", value: "draft" };

afterEach(async () => {
  vi.mocked(setGoalFilterCore).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-gf-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "gf" }), null, 2),
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

function put(body: unknown): never {
  return new Request("http://localhost/api/project/goal-filter", {
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

describe("PUT /api/project/goal-filter", () => {
  it("sets then clears goalFilter", async () => {
    const { dir, id, root } = await setup();
    const set = await withDir(dir, () =>
      PUT(put({ projectId: id, goalFilter: VALID })),
    );
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ goalFilter: VALID });
    expect((await readConfig(root)).goalFilter).toEqual(VALID);

    const cleared = await withDir(dir, () =>
      PUT(put({ projectId: id, goalFilter: null })),
    );
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).goalFilter).toBeUndefined();
    expect("goalFilter" in (await readConfig(root))).toBe(false);
    expect(setGoalFilterCore).toHaveBeenLastCalledWith(id, null);
  });

  it("returns the core's refusal message as the 400 error body", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () =>
      PUT(put({ projectId: id, goalFilter: { op: "ref", id: "q" } })),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: GOAL_FILTER_MESSAGES.ref });
    const nonsense = await withDir(dir, () =>
      PUT(put({ projectId: id, goalFilter: { op: "nope" } })),
    );
    expect(nonsense.status).toBe(400);
    expect((await nonsense.json()).error).toBe(GOAL_FILTER_MESSAGES.schema);
  });

  it("rejects a missing goalFilter key with 400 and never calls the core", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () => PUT(put({ projectId: id })));
    expect(res.status).toBe(400);
    expect(setGoalFilterCore).not.toHaveBeenCalled();
  });

  it("returns the uniform 400 for an invalid projectId and 400 for bad JSON", async () => {
    const { dir } = await setup();
    const res = await withDir(dir, () =>
      PUT(put({ projectId: "nope", goalFilter: VALID })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
    const bad = await withDir(dir, () =>
      PUT(
        new Request("http://localhost/api/project/goal-filter", {
          method: "PUT",
          body: "{",
        }) as never,
      ),
    );
    expect(bad.status).toBe(400);
  });

  it("ignores a client-supplied path: the project comes from projectId only", async () => {
    const { dir, id } = await setup();
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "gw-gf-other-"));
    tmpDirs.push(other);
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          goalFilter: VALID,
          path: other,
          projectRoot: other,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(await fs.readdir(other)).toEqual([]);
    expect(setGoalFilterCore).toHaveBeenCalledWith(id, VALID);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409", async () => {
    const { dir, id } = await setup();
    vi.mocked(setGoalFilterCore).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    const locked = await withDir(dir, () =>
      PUT(put({ projectId: id, goalFilter: VALID })),
    );
    expect(locked.status).toBe(401);
    vi.mocked(setGoalFilterCore).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    const keyless = await withDir(dir, () =>
      PUT(put({ projectId: id, goalFilter: VALID })),
    );
    expect(keyless.status).toBe(409);
  });
});
