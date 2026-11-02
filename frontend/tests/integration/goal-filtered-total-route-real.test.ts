/**
 * Feature 98 defect: the filtered-total route, exercised with no mock of the
 * core or of storage, over a project made by the same core the app uses (whose
 * `project.id` differs from its directory id). Covers total, no-match and
 * failures, and that a non-file error is not reported as "unreadable".
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/project/goal-filtered-total/route";
import { PUT } from "../../app/api/project/goal-filter/route";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { createProjectCore } from "../../src/lib/models/project-crud-core";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";

let dir: string;
let dirId: string;
let internalId: string;
const original = process.env.GETWRITE_PROJECTS_DIR;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-gft-real-"));
  process.env.GETWRITE_PROJECTS_DIR = dir;
  const created = await createProjectCore("Real", "blank", false);
  dirId = path.basename(created.project.rootPath ?? "");
  internalId = created.project.id;
  await createResourceCore(dirId, {
    name: "A",
    type: "text",
    userMetadata: { status: "Draft" },
    text: { plainText: "one two three" },
  });
  await createResourceCore(dirId, {
    name: "B",
    type: "text",
    userMetadata: { status: "Published" },
    text: { plainText: "x y" },
  });
  await flushIndexer();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await flushIndexer();
  if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = original;
  await fs.rm(dir, { recursive: true, force: true });
});

async function setFilter(value: string): Promise<void> {
  const res = await PUT(
    new Request("http://localhost/api/project/goal-filter", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: dirId,
        goalFilter: { op: "eq", field: "status", value },
      }),
    }) as never,
  );
  expect(res.status).toBe(200);
}

function total(id: string): Promise<Response> {
  return GET(
    new Request(
      `http://localhost/api/project/goal-filtered-total?projectId=${id}`,
    ) as never,
  );
}

describe("GET /api/project/goal-filtered-total, real storage", () => {
  it("project.id differs from the directory id", () => {
    expect(internalId).not.toBe(dirId);
  });

  it("returns the total for the matching document", async () => {
    await setFilter("Draft");
    const res = await total(dirId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "total", total: 3 });
  });

  it("returns no-match when nothing matches", async () => {
    await setFilter("Nope");
    const res = await total(dirId);
    expect(await res.json()).toEqual({ status: "no-match", total: 0 });
  });

  it("returns unavailable (no number) for an id naming no project directory", async () => {
    await setFilter("Draft");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const body = await (await total(internalId)).json();
    expect(body).toEqual({
      status: "unavailable",
      reason: "read-failed",
      cause: "unreadable",
    });
    expect("total" in body).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("ENOENT"),
    );
  });

  it("returns unavailable corrupt for a damaged sidecar", async () => {
    await setFilter("Draft");
    const metaDir = path.join(dir, dirId, "meta");
    const sidecars = (await fs.readdir(metaDir)).filter((f) =>
      f.endsWith(".meta.json"),
    );
    await fs.writeFile(path.join(metaDir, sidecars[0]), "{not json");
    const body = await (await total(dirId)).json();
    expect(body).toMatchObject({ status: "unavailable", cause: "corrupt" });
    expect("total" in body).toBe(false);
  });
});
