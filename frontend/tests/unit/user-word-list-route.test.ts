/**
 * Feature 96, Task 5: GET/POST/DELETE /api/user-word-list.
 *
 * The tenant root comes only from `withStorageContext` (here via
 * `GETWRITE_PROJECTS_DIR`). A paired or unclassified caller is refused on every
 * method before the store is touched.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "../../app/api/user-word-list/route";
import { USER_WORD_LIST_FILENAME } from "../../src/lib/models/user-word-list";
import {
  UserWordListErrorResponseSchema,
  UserWordListRefusalSchema,
  UserWordListResponseSchema,
} from "../../src/lib/api/schemas";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-uwl-route-"));
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

function req(
  method: string,
  body?: unknown,
  classification: string | null = "off",
  rawBody?: string,
): never {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (classification !== null) {
    headers["x-getwrite-classification"] = classification;
  }
  return new Request("http://localhost/api/user-word-list", {
    method,
    headers,
    body: method === "GET" ? undefined : (rawBody ?? JSON.stringify(body)),
  }) as never;
}

const file = (dir: string): string => path.join(dir, USER_WORD_LIST_FILENAME);

describe("/api/user-word-list", () => {
  it("GET returns [] when nothing is stored, then the stored list", async () => {
    const dir = await setup();
    const empty = await withDir(dir, () => GET(req("GET")));
    expect(empty.status).toBe(200);
    expect(UserWordListResponseSchema.parse(await empty.json())).toEqual([]);

    await fs.writeFile(file(dir), JSON.stringify(["zed", "abc"]), "utf8");
    const res = await withDir(dir, () => GET(req("GET")));
    expect(await res.json()).toEqual(["zed", "abc"]);
  });

  it("POST adds one word, returns and persists the list, idempotently", async () => {
    const dir = await setup();
    const first = await withDir(dir, () =>
      POST(req("POST", { word: "Quill" })),
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(["Quill"]);
    const again = await withDir(dir, () =>
      POST(req("POST", { word: "Quill" })),
    );
    expect(await again.json()).toEqual(["Quill"]);
    expect(JSON.parse(await fs.readFile(file(dir), "utf8"))).toEqual(["Quill"]);
  });

  it("DELETE removes one word and returns the persisted list", async () => {
    const dir = await setup();
    await withDir(dir, () => POST(req("POST", { word: "alpha" })));
    await withDir(dir, () => POST(req("POST", { word: "beta" })));
    const res = await withDir(dir, () =>
      DELETE(req("DELETE", { word: "alpha" })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(["beta"]);
    expect(JSON.parse(await fs.readFile(file(dir), "utf8"))).toEqual(["beta"]);
  });

  it.each([
    "confirmed:device-1",
    "not-confirmed:no-credential",
    null,
    "garbage",
  ])(
    "refuses a paired or unclassified caller (%s) on GET, POST and DELETE; file untouched",
    async (classification) => {
      const dir = await setup();
      const before = JSON.stringify(["keep"]);
      await fs.writeFile(file(dir), before, "utf8");
      const calls = [
        () => GET(req("GET", undefined, classification)),
        () => POST(req("POST", { word: "new" }, classification)),
        () => DELETE(req("DELETE", { word: "keep" }, classification)),
      ];
      for (const call of calls) {
        const res = await withDir(dir, call);
        expect(res.status).toBe(403);
        const body = UserWordListRefusalSchema.parse(await res.json());
        expect(body.error.length).toBeGreaterThan(0);
      }
      expect(await fs.readFile(file(dir), "utf8")).toBe(before);
    },
  );

  it("rejects an invalid word with 400 and a reason; file untouched", async () => {
    const dir = await setup();
    const bodies: unknown[] = [
      { word: "two words" },
      { word: 5 },
      { word: "x".repeat(101) },
      {},
      [],
    ];
    for (const body of bodies) {
      const res = await withDir(dir, () => POST(req("POST", body)));
      expect(res.status).toBe(400);
      const parsed = UserWordListErrorResponseSchema.parse(await res.json());
      expect(parsed.error.length).toBeGreaterThan(0);
    }
    const del = await withDir(dir, () =>
      DELETE(req("DELETE", { word: "a b" })),
    );
    expect(del.status).toBe(400);
    const bad = await withDir(dir, () =>
      POST(req("POST", undefined, "off", "{")),
    );
    expect(bad.status).toBe(400);
    await expect(fs.stat(file(dir))).rejects.toThrow();
  });

  it("returns a 5xx, not an empty list, when the stored file is corrupt", async () => {
    const dir = await setup();
    await fs.writeFile(file(dir), "{not json", "utf8");
    const calls = [
      () => GET(req("GET")),
      () => POST(req("POST", { word: "a" })),
      () => DELETE(req("DELETE", { word: "a" })),
    ];
    for (const call of calls) {
      const res = await withDir(dir, call);
      expect(res.status).toBe(500);
      const body = UserWordListErrorResponseSchema.parse(await res.json());
      expect(body.error).toBeTruthy();
    }
    expect(await fs.readFile(file(dir), "utf8")).toBe("{not json");
  });

  it("never reads the storage root from the request", async () => {
    const dir = await setup();
    const other = await setup();
    const r = new Request(
      `http://localhost/api/user-word-list?root=${encodeURIComponent(other)}`,
      {
        method: "POST",
        headers: {
          "x-getwrite-classification": "off",
          "x-getwrite-tenant-root": other,
        },
        body: JSON.stringify({ word: "w", root: other, path: other }),
      },
    ) as never;
    await withDir(dir, () => POST(r));
    await expect(fs.stat(file(other))).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(file(dir), "utf8"))).toEqual(["w"]);
  });
});
