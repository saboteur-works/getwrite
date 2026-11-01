/**
 * Feature 98 Task 8: GET /api/project/goal-filtered-total route.
 * Calls the Task 6 core with a derived root; an unavailable result is a typed
 * 200 body; invalid ids are 400; locked-access errors propagate (401/409).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../src/lib/models/goal-filtered-total-core",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../src/lib/models/goal-filtered-total-core")
      >();
    return {
      ...actual,
      evaluateGoalFilteredTotal: vi.fn(actual.evaluateGoalFilteredTotal),
    };
  },
);

import { GET } from "../../app/api/project/goal-filtered-total/route";
import { evaluateGoalFilteredTotal } from "../../src/lib/models/goal-filtered-total-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.mocked(evaluateGoalFilteredTotal).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-gft-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "gft" }), null, 2),
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

function get(query: string): never {
  return new Request(
    `http://localhost/api/project/goal-filtered-total${query}`,
  ) as never;
}

describe("GET /api/project/goal-filtered-total", () => {
  it("returns not-filtered when no filter is stored, via the one core", async () => {
    const { dir, id, root } = await setup();
    const res = await withDir(dir, () => GET(get(`?projectId=${id}`)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "not-filtered" });
    expect(evaluateGoalFilteredTotal).toHaveBeenCalledTimes(1);
    const [calledRoot, when] = vi.mocked(evaluateGoalFilteredTotal).mock
      .calls[0];
    expect(await fs.realpath(calledRoot)).toBe(await fs.realpath(root));
    expect(when).toBeInstanceOf(Date);
  });

  it("returns an unavailable result as a typed 200 body with no total", async () => {
    const { dir, id } = await setup();
    vi.mocked(evaluateGoalFilteredTotal).mockResolvedValueOnce({
      status: "unavailable",
      reason: "read-failed",
      cause: "corrupt",
    });
    const res = await withDir(dir, () => GET(get(`?projectId=${id}`)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "unavailable",
      reason: "read-failed",
      cause: "corrupt",
    });
    expect("total" in body).toBe(false);
  });

  it("returns the total and no-match results unchanged", async () => {
    const { dir, id } = await setup();
    vi.mocked(evaluateGoalFilteredTotal).mockResolvedValueOnce({
      status: "total",
      total: 42,
    });
    const total = await withDir(dir, () => GET(get(`?projectId=${id}`)));
    expect(await total.json()).toEqual({ status: "total", total: 42 });
    vi.mocked(evaluateGoalFilteredTotal).mockResolvedValueOnce({
      status: "no-match",
      total: 0,
    });
    const none = await withDir(dir, () => GET(get(`?projectId=${id}`)));
    expect(await none.json()).toEqual({ status: "no-match", total: 0 });
  });

  it("returns the uniform 400 for a missing or invalid projectId", async () => {
    const { dir } = await setup();
    for (const q of ["", "?projectId=nope"]) {
      const res = await withDir(dir, () => GET(get(q)));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid projectId");
    }
    expect(evaluateGoalFilteredTotal).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied path", async () => {
    const { dir, id, root } = await setup();
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "gw-gft-other-"));
    tmpDirs.push(other);
    await withDir(dir, () =>
      GET(get(`?projectId=${id}&path=${other}&projectRoot=${other}`)),
    );
    const [calledRoot] = vi.mocked(evaluateGoalFilteredTotal).mock.calls[0];
    expect(await fs.realpath(calledRoot)).toBe(await fs.realpath(root));
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409", async () => {
    const { dir, id } = await setup();
    vi.mocked(evaluateGoalFilteredTotal).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    const locked = await withDir(dir, () => GET(get(`?projectId=${id}`)));
    expect(locked.status).toBe(401);
    vi.mocked(evaluateGoalFilteredTotal).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    const keyless = await withDir(dir, () => GET(get(`?projectId=${id}`)));
    expect(keyless.status).toBe(409);
  });
});
