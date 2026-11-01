/**
 * Feature 98, Task 3 (FR-17): `listResourceIdsStrict` returns an empty list only
 * for a missing `resources/` directory and rethrows every other failure, where
 * the lenient `listResourceIds` in `backlinks.ts` returns `[]` for all of them.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/io", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/io")>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});

import * as io from "../../src/lib/models/io";
import { listResourceIds } from "../../src/lib/models/backlinks";
import { listResourceIdsStrict } from "../../src/lib/models/list-resource-ids-strict";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "list-ids-strict-"));
});

afterEach(async () => {
  vi.mocked(io.readdir).mockClear();
  await fs.rm(root, { recursive: true, force: true });
});

describe("listResourceIdsStrict", () => {
  it("lists only the directories under resources/", async () => {
    await fs.mkdir(path.join(root, "resources", "a"), { recursive: true });
    await fs.mkdir(path.join(root, "resources", "b"), { recursive: true });
    await fs.writeFile(path.join(root, "resources", "stray.txt"), "x");

    const ids = await listResourceIdsStrict(root);

    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("returns an empty list when resources/ does not exist (ENOENT)", async () => {
    expect(await listResourceIdsStrict(root)).toEqual([]);
  });

  it("rethrows a non-ENOENT readdir error (resources is a file: ENOTDIR)", async () => {
    await fs.writeFile(path.join(root, "resources"), "not a directory");

    await expect(listResourceIdsStrict(root)).rejects.toMatchObject({
      code: "ENOTDIR",
    });
    // The lenient listing gives the same input an empty list.
    expect(await listResourceIds(root)).toEqual([]);
  });

  it("rethrows an EACCES readdir error", async () => {
    const err = Object.assign(new Error("denied"), { code: "EACCES" });
    vi.mocked(io.readdir).mockRejectedValueOnce(err);

    await expect(listResourceIdsStrict(root)).rejects.toBe(err);
  });

  it("rethrows a ProjectLockedError", async () => {
    const err = new ProjectLockedError("p1");
    vi.mocked(io.readdir).mockRejectedValueOnce(err);

    await expect(listResourceIdsStrict(root)).rejects.toBe(err);
  });

  it("rethrows a MissingProjectKeyError", async () => {
    const err = new MissingProjectKeyError("p1");
    vi.mocked(io.readdir).mockRejectedValueOnce(err);

    await expect(listResourceIdsStrict(root)).rejects.toBe(err);
  });
});
