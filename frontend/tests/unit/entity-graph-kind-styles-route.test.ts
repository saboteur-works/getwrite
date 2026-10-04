/**
 * Feature 69 Task 3: GET/PUT /api/project/entity-graph-kind-styles route.
 * projectId is validated via the standard guard; no client-supplied path is
 * accepted; body validation reuses Task 2's own Zod schemas.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET, PUT } from "../../app/api/project/entity-graph-kind-styles/route";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-egks-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "egks" }), null, 2),
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
    `http://localhost/api/project/entity-graph-kind-styles?projectId=${projectId}`,
  ) as never;
}

function put(body: unknown): never {
  return new Request("http://localhost/api/project/entity-graph-kind-styles", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("GET /api/project/entity-graph-kind-styles", () => {
  it("returns [] for a project with no kind styles yet", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () => GET(get(id)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns persisted records", async () => {
    const { dir, id } = await setup();
    await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityKind: "character",
          color: "entity-kind-0",
          shape: "circle",
        }),
      ),
    );
    const res = await withDir(dir, () => GET(get(id)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { entityKind: "character", color: "entity-kind-0", shape: "circle" },
    ]);
  });

  it("returns the uniform 400 for an invalid projectId", async () => {
    const { dir } = await setup();
    const res = await withDir(dir, () => GET(get("nope")));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
  });
});

describe("PUT /api/project/entity-graph-kind-styles", () => {
  it("upserts a kind's style and returns the saved record", async () => {
    const { dir, id, root } = await setup();
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityKind: "place",
          color: "entity-kind-1",
          shape: "square",
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      entityKind: "place",
      color: "entity-kind-1",
      shape: "square",
    });
    const saved = JSON.parse(
      await fs.readFile(
        path.join(root, "meta", "entity-graph-kind-styles.json"),
        "utf8",
      ),
    );
    expect(saved).toEqual([
      { entityKind: "place", color: "entity-kind-1", shape: "square" },
    ]);
  });

  it("replaces an existing record for the same entityKind rather than duplicating it", async () => {
    const { dir, id } = await setup();
    await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityKind: "character",
          color: "entity-kind-0",
          shape: "circle",
        }),
      ),
    );
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityKind: "character",
          color: "entity-kind-2",
          shape: "diamond",
        }),
      ),
    );
    expect(res.status).toBe(200);
    const list = await withDir(dir, () => GET(get(id)));
    expect(await list.json()).toEqual([
      { entityKind: "character", color: "entity-kind-2", shape: "diamond" },
    ]);
  });

  it("rejects a hex-shaped color with 400", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityKind: "character",
          color: "#ff0000",
          shape: "circle",
        }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a shape outside the fixed six-shape set with 400", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityKind: "character",
          color: "entity-kind-0",
          shape: "not-a-shape",
        }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an empty entityKind with 400", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          entityKind: "",
          color: "entity-kind-0",
          shape: "circle",
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
          entityKind: "character",
          color: "entity-kind-0",
          shape: "circle",
        }),
      ),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");

    const bad = await withDir(dir, () =>
      PUT(
        new Request("http://localhost/api/project/entity-graph-kind-styles", {
          method: "PUT",
          body: "{",
        }) as never,
      ),
    );
    expect(bad.status).toBe(400);
  });
});
