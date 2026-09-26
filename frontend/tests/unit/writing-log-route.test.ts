/**
 * Feature 59 Task 10: /api/project/writing-log route (FR-9).
 * GET reads the aggregate for a client-supplied local-day window; PUT sets or
 * clears dailyWordGoal. projectId is validated; no client path is accepted.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/writing-log-core", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../src/lib/models/writing-log-core")
    >();
  return {
    ...actual,
    getWritingLogAggregateCore: vi.fn(actual.getWritingLogAggregateCore),
  };
});

import { GET, PUT } from "../../app/api/project/writing-log/route";
import { getWritingLogAggregateCore } from "../../src/lib/models/writing-log-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { appendWritingLogEntry } from "../../src/lib/models/writing-log";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

const FROM = "2026-09-25T14:00:00.000Z";
const TO = "2026-09-26T14:00:00.000Z";
const tmpDirs: string[] = [];

afterEach(async () => {
  vi.mocked(getWritingLogAggregateCore).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-wl-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "wl" }), null, 2),
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

function get(params: Record<string, string | undefined>): never {
  const url = new URL("http://localhost/api/project/writing-log");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return new Request(url) as never;
}

function put(body: unknown): never {
  return new Request("http://localhost/api/project/writing-log", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("GET /api/project/writing-log", () => {
  it("returns the aggregate for the window, deriving the root from projectId", async () => {
    const { dir, id, root } = await setup();
    await appendWritingLogEntry(
      root,
      { added: 10, deleted: 2 },
      "2026-09-26T01:00:00.000Z",
    );
    const res = await withDir(dir, () =>
      GET(get({ projectId: id, from: FROM, to: TO })),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totals).toEqual({ added: 10, deleted: 2, net: 8 });
    expect(json.incomplete).toBe(false);
    expect(json.goal).toBeUndefined();
    expect(getWritingLogAggregateCore).toHaveBeenCalledWith(id, FROM, TO);
  });

  it("ignores a client-supplied path parameter", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () =>
      GET(
        get({
          projectId: id,
          from: FROM,
          to: TO,
          projectRoot: "/etc",
          projectPath: "/etc",
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(getWritingLogAggregateCore).toHaveBeenCalledWith(id, FROM, TO);
  });

  it("returns the uniform 400 for a malformed or missing projectId", async () => {
    const { dir } = await setup();
    for (const projectId of ["../etc", "not-a-uuid", undefined]) {
      const res = await withDir(dir, () =>
        GET(get({ projectId, from: FROM, to: TO })),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid projectId");
    }
  });

  it.each([
    ["missing from", { from: undefined, to: TO }],
    ["missing to", { from: FROM, to: undefined }],
    ["non-ISO from", { from: "yesterday", to: TO }],
    ["to not after from", { from: TO, to: FROM }],
    ["to equal from", { from: FROM, to: FROM }],
    ["over the 26-hour cap", { from: FROM, to: "2026-09-26T16:00:01.000Z" }],
  ])("maps a rejected window (%s) to 400", async (_n, win) => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () => GET(get({ projectId: id, ...win })));
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409", async () => {
    const { dir, id } = await setup();
    vi.mocked(getWritingLogAggregateCore).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    const locked = await withDir(dir, () =>
      GET(get({ projectId: id, from: FROM, to: TO })),
    );
    expect(locked.status).toBe(401);
    vi.mocked(getWritingLogAggregateCore).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    const keyless = await withDir(dir, () =>
      GET(get({ projectId: id, from: FROM, to: TO })),
    );
    expect(keyless.status).toBe(409);
  });
});

describe("PUT /api/project/writing-log", () => {
  it("sets then clears dailyWordGoal", async () => {
    const { dir, id, root } = await setup();
    const set = await withDir(dir, () =>
      PUT(put({ projectId: id, dailyWordGoal: 500 })),
    );
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ dailyWordGoal: 500 });
    const saved = JSON.parse(
      await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
    );
    expect(saved.config.dailyWordGoal).toBe(500);

    const cleared = await withDir(dir, () =>
      PUT(put({ projectId: id, dailyWordGoal: null })),
    );
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).dailyWordGoal).toBeUndefined();
    const after = JSON.parse(
      await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
    );
    expect(after.config.dailyWordGoal).toBeUndefined();
  });

  it.each([[-1], [1.5], ["5"], [undefined]])(
    "rejects invalid goal %s with 400",
    async (goal) => {
      const { dir, id } = await setup();
      const res = await withDir(dir, () =>
        PUT(put({ projectId: id, dailyWordGoal: goal })),
      );
      expect(res.status).toBe(400);
    },
  );

  it("returns the uniform 400 for an invalid projectId and 400 for bad JSON", async () => {
    const { dir } = await setup();
    const res = await withDir(dir, () =>
      PUT(put({ projectId: "nope", dailyWordGoal: 5 })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
    const bad = await withDir(dir, () =>
      PUT(
        new Request("http://localhost/api/project/writing-log", {
          method: "PUT",
          body: "{",
        }) as never,
      ),
    );
    expect(bad.status).toBe(400);
  });
});
