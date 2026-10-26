/**
 * Spell checker, Task 23: GET/POST /api/project/spelling route. Reads and
 * mutates config.spellingProjectWords and config.spellingIgnoredWords.
 * projectId is validated; no client path is accepted; locked-access errors are
 * not caught by the handler and propagate to withStorageContext (401/409).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/models/project-spelling-core", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../src/lib/models/project-spelling-core")
    >();
  return { ...actual, addSpellingWordCore: vi.fn(actual.addSpellingWordCore) };
});

import * as route from "../app/api/project/spelling/route";
import { addSpellingWordCore } from "../src/lib/models/project-spelling-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../src/lib/models/locked-access";
import { createProject } from "../src/lib/models/project";
import { PROJECT_FILENAME } from "../src/lib/models/project-config";
import { generateUUID } from "../src/lib/models/uuid";

const { GET, POST } = route;
const tmpDirs: string[] = [];

afterEach(async () => {
  vi.mocked(addSpellingWordCore).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(
  config: Record<string, unknown> = {},
): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-spelling-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  const project = createProject({ name: "sp" });
  project.config = { ...(project.config ?? {}), ...config } as never;
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(project, null, 2),
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
  return new Request(`http://localhost/api/project/spelling${query}`) as never;
}

function post(body: unknown): never {
  return new Request("http://localhost/api/project/spelling", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

async function readConfig(root: string): Promise<Record<string, unknown>> {
  const saved = JSON.parse(
    await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
  );
  return saved.config;
}

describe("route module", () => {
  it("is force-dynamic", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/project/spelling", () => {
  it("returns both lists, [] when nothing is persisted", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () => GET(get(`?projectId=${id}`)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      spellingProjectWords: [],
      spellingIgnoredWords: [],
    });
  });

  it("returns persisted words in both lists", async () => {
    const { dir, id } = await setup({
      spellingProjectWords: ["Zorblax"],
      spellingIgnoredWords: ["teh"],
    });
    const res = await withDir(dir, () => GET(get(`?projectId=${id}`)));
    expect(await res.json()).toEqual({
      spellingProjectWords: ["Zorblax"],
      spellingIgnoredWords: ["teh"],
    });
  });

  it("answers the uniform 400 for a missing projectId", async () => {
    const res = await GET(get(""));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
  });

  it("answers the uniform 400 for a non-UUID projectId", async () => {
    const res = await GET(get("?projectId=../etc"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
  });
});

describe("POST /api/project/spelling", () => {
  it("handles the four actions and persists to the right list", async () => {
    const { dir, id, root } = await setup();
    const run = (action: string, word: string) =>
      withDir(dir, () => POST(post({ projectId: id, action, word })));

    let res = await run("add-word", "Zorblax");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      spellingProjectWords: ["Zorblax"],
      spellingIgnoredWords: [],
    });
    expect(addSpellingWordCore).toHaveBeenCalledWith(id, "Zorblax");

    res = await run("ignore-word", "teh");
    expect(await res.json()).toEqual({
      spellingProjectWords: ["Zorblax"],
      spellingIgnoredWords: ["teh"],
    });
    const config = await readConfig(root);
    expect(config.spellingProjectWords).toEqual(["Zorblax"]);
    expect(config.spellingIgnoredWords).toEqual(["teh"]);

    res = await run("remove-word", "Zorblax");
    expect(await res.json()).toEqual({
      spellingProjectWords: [],
      spellingIgnoredWords: ["teh"],
    });

    res = await run("unignore-word", "teh");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      spellingProjectWords: [],
      spellingIgnoredWords: [],
    });
  });

  it("answers the uniform 400 for a missing or non-UUID projectId", async () => {
    const missing = await POST(post({ action: "add-word", word: "x" }));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe("Invalid projectId");
    const bad = await POST(
      post({ projectId: "nope", action: "add-word", word: "x" }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("Invalid projectId");
  });

  it("answers 400 for invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/project/spelling", {
        method: "POST",
        body: "{",
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("answers 400 for an unknown or missing action", async () => {
    const { dir, id } = await setup();
    for (const body of [
      { projectId: id, action: "bogus", word: "x" },
      { projectId: id, word: "x" },
    ]) {
      const res = await withDir(dir, () => POST(post(body)));
      expect(res.status).toBe(400);
    }
  });

  it("answers 400 for a non-string word", async () => {
    const { dir, id } = await setup();
    for (const word of [42, null, ["a"], undefined]) {
      const res = await withDir(dir, () =>
        POST(post({ projectId: id, action: "add-word", word })),
      );
      expect(res.status).toBe(400);
    }
  });

  it("answers 400 for an invalid word", async () => {
    const { dir, id } = await setup();
    for (const word of ["", "   ", "two words", "a\u0000b", "x".repeat(101)]) {
      const res = await withDir(dir, () =>
        POST(post({ projectId: id, action: "ignore-word", word })),
      );
      expect(res.status).toBe(400);
    }
  });

  it("answers 400 for the 5,001st word and leaves the list unchanged", async () => {
    const full = Array.from({ length: 5000 }, (_, i) => `word${i}`);
    const { dir, id, root } = await setup({ spellingProjectWords: full });
    const res = await withDir(dir, () =>
      POST(post({ projectId: id, action: "add-word", word: "overflow" })),
    );
    expect(res.status).toBe(400);
    const config = await readConfig(root);
    expect(config.spellingProjectWords).toEqual(full);
  });

  it("ignores a client-supplied path", async () => {
    const { dir, id, root } = await setup();
    const other = path.join(dir, "elsewhere");
    await fs.mkdir(other);
    const res = await withDir(dir, () =>
      POST(
        post({
          projectId: id,
          projectRoot: other,
          projectPath: other,
          action: "add-word",
          word: "ok",
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect((await readConfig(root)).spellingProjectWords).toEqual(["ok"]);
    expect(await fs.readdir(other)).toEqual([]);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409", async () => {
    const { dir, id } = await setup();
    vi.mocked(addSpellingWordCore).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    const locked = await withDir(dir, () =>
      POST(post({ projectId: id, action: "add-word", word: "x" })),
    );
    expect(locked.status).toBe(401);
    vi.mocked(addSpellingWordCore).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    const keyless = await withDir(dir, () =>
      POST(post({ projectId: id, action: "add-word", word: "x" })),
    );
    expect(keyless.status).toBe(409);
  });
});
