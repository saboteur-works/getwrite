/**
 * Entity Mention Noise Flagging, Task 6: GET/POST
 * /api/project/noise-words route. Reads/mutates config.customNoiseWords and
 * config.excludedGlobalNoiseWords. projectId is validated; no client path is
 * accepted; locked-access errors are not caught here and propagate to
 * withStorageContext for 401/409 mapping.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../src/lib/models/project-noise-words-core",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../src/lib/models/project-noise-words-core")
      >();
    return {
      ...actual,
      addCustomNoiseWordCore: vi.fn(actual.addCustomNoiseWordCore),
    };
  },
);

import { GET, POST } from "../../app/api/project/noise-words/route";
import { addCustomNoiseWordCore } from "../../src/lib/models/project-noise-words-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.mocked(addCustomNoiseWordCore).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-noise-words-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "nw" }), null, 2),
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
    `http://localhost/api/project/noise-words?projectId=${projectId}`,
  ) as never;
}

function post(body: unknown): never {
  return new Request("http://localhost/api/project/noise-words", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("GET /api/project/noise-words", () => {
  it("returns [] for both lists for a project with nothing persisted", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () => GET(get(id)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });
  });

  it("returns the uniform 400 for an invalid projectId", async () => {
    const res = await GET(get("nope"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
  });
});

describe("POST /api/project/noise-words", () => {
  it("add-custom adds a word and persists it", async () => {
    const { dir, id, root } = await setup();
    const res = await withDir(dir, () =>
      POST(post({ projectId: id, action: "add-custom", word: "very" })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      customNoiseWords: ["very"],
      excludedGlobalNoiseWords: [],
    });
    const saved = JSON.parse(
      await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
    );
    expect(saved.config.customNoiseWords).toEqual(["very"]);
    expect(addCustomNoiseWordCore).toHaveBeenCalledWith(id, "very");
  });

  it("remove-custom removes a previously-added word", async () => {
    const { dir, id } = await setup();
    await withDir(dir, () =>
      POST(post({ projectId: id, action: "add-custom", word: "very" })),
    );
    const res = await withDir(dir, () =>
      POST(post({ projectId: id, action: "remove-custom", word: "very" })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });
  });

  it("exclude-global and unexclude-global round-trip a global word", async () => {
    const { dir, id } = await setup();
    const excluded = await withDir(dir, () =>
      POST(post({ projectId: id, action: "exclude-global", word: "said" })),
    );
    expect(excluded.status).toBe(200);
    expect(await excluded.json()).toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: ["said"],
    });

    const unexcluded = await withDir(dir, () =>
      POST(post({ projectId: id, action: "unexclude-global", word: "said" })),
    );
    expect(unexcluded.status).toBe(200);
    expect(await unexcluded.json()).toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });
  });

  it("rejects an unknown action with 400", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () =>
      POST(post({ projectId: id, action: "bogus", word: "very" })),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an empty word with 400", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () =>
      POST(post({ projectId: id, action: "add-custom", word: "" })),
    );
    expect(res.status).toBe(400);
  });

  it("returns the uniform 400 for an invalid projectId and 400 for bad JSON", async () => {
    const { dir } = await setup();
    const res = await withDir(dir, () =>
      POST(post({ projectId: "nope", action: "add-custom", word: "very" })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");

    const bad = await withDir(dir, () =>
      POST(
        new Request("http://localhost/api/project/noise-words", {
          method: "POST",
          body: "{",
        }) as never,
      ),
    );
    expect(bad.status).toBe(400);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409 (not caught by the route handler itself)", async () => {
    const { dir, id } = await setup();
    vi.mocked(addCustomNoiseWordCore).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    const locked = await withDir(dir, () =>
      POST(post({ projectId: id, action: "add-custom", word: "very" })),
    );
    expect(locked.status).toBe(401);

    vi.mocked(addCustomNoiseWordCore).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    const keyless = await withDir(dir, () =>
      POST(post({ projectId: id, action: "add-custom", word: "very" })),
    );
    expect(keyless.status).toBe(409);
  });
});
