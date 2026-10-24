/**
 * Feature 92, Task 8: `updateProjectJson` on the per-file lock (family A).
 * Real filesystem in a temp directory; the write path and the meta lock are
 * observed through wrappers around the real functions.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/io", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/io")>();
  return { ...actual, atomicWriteFile: vi.fn(actual.atomicWriteFile) };
});
vi.mock("../../src/lib/models/meta-locks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/meta-locks")>();
  return { ...actual, withMetaLock: vi.fn(actual.withMetaLock) };
});

import { atomicWriteFile } from "../../src/lib/models/io";
import { withMetaLock } from "../../src/lib/models/meta-locks";
import { updateProjectJson } from "../../src/lib/models/project-json-write";
import type { Project } from "../../src/lib/models/types";

let root = "";
let projectPath = "";

const initial = {
  zeta: 1,
  id: "p1",
  name: "P",
  alpha: { b: 2, a: 1 },
  list: [3, 1, 2],
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-pjw-"));
  projectPath = path.join(root, "project.json");
  await fs.writeFile(projectPath, JSON.stringify(initial), "utf8");
  vi.mocked(atomicWriteFile).mockClear();
  vi.mocked(withMetaLock).mockClear();
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const setField = (name: string, value: unknown) => (project: Project) => {
  (project as unknown as Record<string, unknown>)[name] = value;
  return { result: name };
};

describe("updateProjectJson", () => {
  it("does not take withMetaLock", async () => {
    await updateProjectJson(root, setField("x", 1));
    expect(withMetaLock).not.toHaveBeenCalled();
  });

  it("writes as before without durable: the string encoding option", async () => {
    await updateProjectJson(root, setField("x", 1));
    expect(atomicWriteFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(atomicWriteFile).mock.calls[0][2]).toBe("utf8");
  });

  it("writes the durable form with durable: true", async () => {
    await updateProjectJson(root, setField("x", 1), { durable: true });
    expect(atomicWriteFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(atomicWriteFile).mock.calls[0][2]).toEqual({
      writeOptions: "utf8",
      durable: true,
    });
  });

  it("writes the same bytes (key order, indent) and returns the result", async () => {
    const result = await updateProjectJson(root, (project) => {
      const p = project as unknown as Record<string, unknown>;
      p.added = true;
      delete p.zeta;
      p.zeta = 9;
      return { result: { ok: 1 } };
    });
    expect(result).toEqual({ ok: 1 });
    const expected = JSON.stringify(
      {
        id: "p1",
        name: "P",
        alpha: { b: 2, a: 1 },
        list: [3, 1, 2],
        added: true,
        zeta: 9,
      },
      null,
      2,
    );
    expect(await fs.readFile(projectPath, "utf8")).toBe(expected);
  });

  it("writes identical bytes with and without durable", async () => {
    await updateProjectJson(root, setField("x", 1));
    const plain = await fs.readFile(projectPath, "utf8");
    await fs.writeFile(projectPath, JSON.stringify(initial), "utf8");
    await updateProjectJson(root, setField("x", 1), { durable: true });
    expect(await fs.readFile(projectPath, "utf8")).toBe(plain);
  });

  it("shouldWrite: false leaves the file untouched and returns the result", async () => {
    const before = await fs.readFile(projectPath, "utf8");
    const result = await updateProjectJson(root, () => ({
      result: "kept",
      shouldWrite: false,
    }));
    expect(result).toBe("kept");
    expect(atomicWriteFile).not.toHaveBeenCalled();
    expect(await fs.readFile(projectPath, "utf8")).toBe(before);
  });

  it("a throwing mutation reaches the caller, writes nothing and frees the lock", async () => {
    const before = await fs.readFile(projectPath, "utf8");
    const boom = new Error("boom");
    await expect(
      updateProjectJson(root, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(atomicWriteFile).not.toHaveBeenCalled();
    expect(await fs.readFile(projectPath, "utf8")).toBe(before);
    await updateProjectJson(root, setField("after", 1));
    expect(JSON.parse(await fs.readFile(projectPath, "utf8")).after).toBe(1);
  });

  it("a missing project.json rejects with ENOENT", async () => {
    await fs.rm(projectPath);
    await expect(
      updateProjectJson(root, setField("x", 1)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("an unparseable project.json rejects with the parse error", async () => {
    await fs.writeFile(projectPath, "{not json", "utf8");
    await expect(
      updateProjectJson(root, setField("x", 1)),
    ).rejects.toBeInstanceOf(SyntaxError);
  });

  it("two overlapping calls on one root keep both changes", async () => {
    await Promise.all([
      updateProjectJson(root, async (project) => {
        await new Promise((r) => setTimeout(r, 20));
        (project as unknown as Record<string, unknown>).first = 1;
        return { result: 1 };
      }),
      updateProjectJson(root, setField("second", 2)),
    ]);
    const written = JSON.parse(await fs.readFile(projectPath, "utf8"));
    expect(written.first).toBe(1);
    expect(written.second).toBe(2);
  });
});
