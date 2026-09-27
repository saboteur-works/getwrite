/**
 * Feature 61 Task 2: PUT /api/project/word-count-goal route.
 * Sets or clears config.wordCountGoal. projectId is validated; no client
 * path is accepted; locked-access errors are not caught here and propagate
 * to withStorageContext for 401/409 mapping.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/word-count-goal-core", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../src/lib/models/word-count-goal-core")
    >();
  return {
    ...actual,
    setWordCountGoalCore: vi.fn(actual.setWordCountGoalCore),
  };
});

import { PUT } from "../../app/api/project/word-count-goal/route";
import { setWordCountGoalCore } from "../../src/lib/models/word-count-goal-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.mocked(setWordCountGoalCore).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-wcg-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "wcg" }), null, 2),
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
  return new Request("http://localhost/api/project/word-count-goal", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("PUT /api/project/word-count-goal", () => {
  it("sets then clears wordCountGoal", async () => {
    const { dir, id, root } = await setup();
    const set = await withDir(dir, () =>
      PUT(put({ projectId: id, wordCountGoal: 80000 })),
    );
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ wordCountGoal: 80000 });
    const saved = JSON.parse(
      await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
    );
    expect(saved.config.wordCountGoal).toBe(80000);

    const cleared = await withDir(dir, () =>
      PUT(put({ projectId: id, wordCountGoal: null })),
    );
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).wordCountGoal).toBeUndefined();
    const after = JSON.parse(
      await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
    );
    expect(after.config.wordCountGoal).toBeUndefined();
    expect(setWordCountGoalCore).toHaveBeenCalledWith(id, null);
  });

  it.each([[-1], [1.5], ["5"], [undefined]])(
    "rejects invalid goal %s with 400",
    async (goal) => {
      const { dir, id } = await setup();
      const res = await withDir(dir, () =>
        PUT(put({ projectId: id, wordCountGoal: goal })),
      );
      expect(res.status).toBe(400);
    },
  );

  it("returns the uniform 400 for an invalid projectId and 400 for bad JSON", async () => {
    const { dir } = await setup();
    const res = await withDir(dir, () =>
      PUT(put({ projectId: "nope", wordCountGoal: 5 })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
    const bad = await withDir(dir, () =>
      PUT(
        new Request("http://localhost/api/project/word-count-goal", {
          method: "PUT",
          body: "{",
        }) as never,
      ),
    );
    expect(bad.status).toBe(400);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409 (not caught by the route handler itself)", async () => {
    const { dir, id } = await setup();
    vi.mocked(setWordCountGoalCore).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    const locked = await withDir(dir, () =>
      PUT(put({ projectId: id, wordCountGoal: 5 })),
    );
    expect(locked.status).toBe(401);

    vi.mocked(setWordCountGoalCore).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    const keyless = await withDir(dir, () =>
      PUT(put({ projectId: id, wordCountGoal: 5 })),
    );
    expect(keyless.status).toBe(409);
  });
});
