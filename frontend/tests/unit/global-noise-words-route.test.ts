/**
 * Entity Mention Noise Flagging, Task 8: GET/PUT /api/global-noise-words.
 *
 * Reads/writes the tenant-root `.global-noise-words.json` file. No
 * `projectId` is involved — this is explicitly cross-project — so the
 * tenant root comes entirely from `withStorageContext` (here, via
 * `GETWRITE_PROJECTS_DIR`, the same env `with-storage-context.ts`'s
 * no-hosted-auth fallback path resolves through `resolveTenant`).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET, PUT } from "../../app/api/global-noise-words/route";
import { GLOBAL_NOISE_WORDS_FILENAME } from "../../src/lib/models/global-noise-words";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-gnw-route-"));
  tmpDirs.push(dir);
  return dir;
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
  return new Request("http://localhost/api/global-noise-words", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("GET/PUT /api/global-noise-words (Entity Mention Noise Flagging, Task 8)", () => {
  it("GET returns [] when no file has ever been written for this tenant", async () => {
    const dir = await setup();
    const res = await withDir(dir, () => GET());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("PUT persists an added word and a subsequent GET reflects it", async () => {
    const dir = await setup();
    const putRes = await withDir(dir, () => PUT(put(["case", "hope"])));
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual(["case", "hope"]);

    const getRes = await withDir(dir, () => GET());
    expect(await getRes.json()).toEqual(["case", "hope"]);

    const onDisk = JSON.parse(
      await fs.readFile(path.join(dir, GLOBAL_NOISE_WORDS_FILENAME), "utf8"),
    );
    expect(onDisk).toEqual(["case", "hope"]);
  });

  it("PUT with a shorter list persists the removal", async () => {
    const dir = await setup();
    await withDir(dir, () => PUT(put(["case", "hope", "tiny"])));
    const removeRes = await withDir(dir, () => PUT(put(["case", "tiny"])));
    expect(await removeRes.json()).toEqual(["case", "tiny"]);

    const getRes = await withDir(dir, () => GET());
    expect(await getRes.json()).toEqual(["case", "tiny"]);
  });

  it("rejects a non-array PUT body with 400", async () => {
    const dir = await setup();
    const res = await withDir(dir, () => PUT(put("not-an-array")));
    expect(res.status).toBe(400);
  });

  it("rejects an array containing a blank entry with 400", async () => {
    const dir = await setup();
    const res = await withDir(dir, () => PUT(put(["case", "   "])));
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const dir = await setup();
    const res = await withDir(dir, () =>
      PUT(
        new Request("http://localhost/api/global-noise-words", {
          method: "PUT",
          body: "{",
        }) as never,
      ),
    );
    expect(res.status).toBe(400);
  });
});
