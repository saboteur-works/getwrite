import { describe, it, expect } from "vitest";
import { objectStoreAdapter } from "../../src/lib/models/objectStoreAdapter";
import {
  createMemoryObjectStore,
  type ObjectStore,
} from "../../src/lib/models/object-store";
import type { Dirent } from "node:fs";

function makeAdapter(): {
  adapter: ReturnType<typeof objectStoreAdapter>;
  store: ObjectStore;
} {
  const store = createMemoryObjectStore();
  return { adapter: objectStoreAdapter(store), store };
}

describe("objectStoreAdapter — directory markers", () => {
  it("an empty mkdir'd directory is observable via stat, exists via a marker key", async () => {
    const { adapter, store } = makeAdapter();
    await adapter.mkdir("/proj/empty", { recursive: true });
    expect((await adapter.stat("/proj/empty")).isDirectory()).toBe(true);
    // The backing store holds only a trailing-slash marker object.
    expect(await store.list("proj/empty/")).toEqual(["proj/empty/"]);
    // readdir of the empty dir yields no children (the marker is filtered).
    expect(await adapter.readdir("/proj/empty")).toEqual([]);
  });

  it("stat throws ENOENT for a path that was never created", async () => {
    const { adapter } = makeAdapter();
    await expect(adapter.stat("/nope")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("ancestors of a nested file are directories without explicit markers", async () => {
    const { adapter } = makeAdapter();
    await adapter.writeFile("/proj/a/b/file.txt", "hi");
    expect((await adapter.stat("/proj/a")).isDirectory()).toBe(true);
    expect((await adapter.stat("/proj/a/b")).isDirectory()).toBe(true);
    expect((await adapter.stat("/proj/a/b/file.txt")).isDirectory()).toBe(
      false,
    );
  });
});

describe("objectStoreAdapter — readdir", () => {
  it("lists immediate children only, distinguishing files from directories", async () => {
    const { adapter } = makeAdapter();
    await adapter.writeFile("/p/file.txt", "x");
    await adapter.writeFile("/p/sub/deep.txt", "y");
    await adapter.mkdir("/p/emptydir", { recursive: true });

    const names = await adapter.readdir("/p");
    expect((names as string[]).sort()).toEqual(["emptydir", "file.txt", "sub"]);

    const typed = (await adapter.readdir("/p", {
      withFileTypes: true,
    })) as Dirent[];
    const byName = Object.fromEntries(typed.map((d) => [d.name, d]));
    expect(byName["file.txt"].isFile()).toBe(true);
    expect(byName["file.txt"].isDirectory()).toBe(false);
    expect(byName["sub"].isDirectory()).toBe(true);
    expect(byName["sub"].isFile()).toBe(false);
    expect(byName["emptydir"].isDirectory()).toBe(true);
  });

  it("throws ENOENT for a missing directory and ENOTDIR for a file path", async () => {
    const { adapter } = makeAdapter();
    await adapter.writeFile("/p/f", "x");
    await expect(adapter.readdir("/p/missing")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(adapter.readdir("/p/f")).rejects.toMatchObject({
      code: "ENOTDIR",
    });
  });
});

describe("objectStoreAdapter — rename semantics", () => {
  it("file rename overwrites the destination (atomicWriteFile pattern)", async () => {
    const { adapter } = makeAdapter();
    await adapter.writeFile("/p/data.json", "old");
    await adapter.writeFile("/p/data.json.tmp", "new");
    await adapter.rename("/p/data.json.tmp", "/p/data.json");
    expect(await adapter.readFile("/p/data.json")).toBe("new");
    await expect(adapter.readFile("/p/data.json.tmp")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("directory rename moves every descendant and clears the source", async () => {
    const { adapter } = makeAdapter();
    await adapter.writeFile("/p/.tmp-x/v.txt", "content");
    await adapter.writeFile("/p/.tmp-x/nested/deep.txt", "deep");
    await adapter.rename("/p/.tmp-x", "/p/v-1");
    expect(await adapter.readFile("/p/v-1/v.txt")).toBe("content");
    expect(await adapter.readFile("/p/v-1/nested/deep.txt")).toBe("deep");
    await expect(adapter.stat("/p/.tmp-x")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("directory rename fails if the destination already exists (revision guard)", async () => {
    const { adapter } = makeAdapter();
    await adapter.writeFile("/p/.tmp-y/v.txt", "content");
    await adapter.writeFile("/p/v-1/existing.txt", "already here");
    await expect(adapter.rename("/p/.tmp-y", "/p/v-1")).rejects.toMatchObject({
      code: "EEXIST",
    });
    // Source is left intact after the failed rename.
    expect(await adapter.readFile("/p/.tmp-y/v.txt")).toBe("content");
  });

  it("renaming a missing path throws ENOENT", async () => {
    const { adapter } = makeAdapter();
    await expect(adapter.rename("/p/ghost", "/p/dst")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("objectStoreAdapter — rm / cp / copyFile / append", () => {
  it("rm recursively removes a directory subtree", async () => {
    const { adapter } = makeAdapter();
    await adapter.writeFile("/p/dir/a.txt", "a");
    await adapter.writeFile("/p/dir/sub/b.txt", "b");
    await adapter.rm("/p/dir", { recursive: true });
    await expect(adapter.stat("/p/dir")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rm of a missing path is silent with force, but throws ENOENT without it", async () => {
    const { adapter } = makeAdapter();
    await expect(
      adapter.rm("/p/never", { recursive: true, force: true }),
    ).resolves.toBeUndefined();
    // fs parity: deleteQuery relies on the ENOENT throw to report "did not exist".
    await expect(adapter.rm("/p/never")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("cp recursively copies a subtree without aliasing the source", async () => {
    const { adapter } = makeAdapter();
    await adapter.writeFile("/p/src/a.txt", "alpha");
    await adapter.cp("/p/src", "/p/dst", { recursive: true });
    expect(await adapter.readFile("/p/dst/a.txt")).toBe("alpha");
    await adapter.writeFile("/p/src/a.txt", "changed");
    expect(await adapter.readFile("/p/dst/a.txt")).toBe("alpha");
  });

  it("copyFile duplicates bytes binary-safely", async () => {
    const { adapter } = makeAdapter();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    await adapter.writeFile("/p/src.bin", bytes);
    await adapter.copyFile("/p/src.bin", "/p/dst.bin");
    const copied = await adapter.readFileBuffer("/p/dst.bin");
    expect(copied.equals(bytes)).toBe(true);
  });

  it("appendFile creates then extends", async () => {
    const { adapter } = makeAdapter();
    await adapter.appendFile("/p/log.txt", "one");
    await adapter.appendFile("/p/log.txt", "two");
    expect(await adapter.readFile("/p/log.txt")).toBe("onetwo");
  });
});

describe("objectStoreAdapter — file-onto-directory guard", () => {
  it("writeFile onto an existing directory throws EISDIR", async () => {
    const { adapter } = makeAdapter();
    await adapter.mkdir("/p/dir", { recursive: true });
    await expect(adapter.writeFile("/p/dir", "clobber")).rejects.toMatchObject({
      code: "EISDIR",
    });
  });

  it("renaming a file onto an existing directory throws EISDIR", async () => {
    const { adapter } = makeAdapter();
    await adapter.writeFile("/p/file.txt", "x");
    await adapter.mkdir("/p/dir", { recursive: true });
    await expect(adapter.rename("/p/file.txt", "/p/dir")).rejects.toMatchObject(
      { code: "EISDIR" },
    );
    // The directory and the source file are both left intact.
    expect((await adapter.stat("/p/dir")).isDirectory()).toBe(true);
    expect(await adapter.readFile("/p/file.txt")).toBe("x");
  });
});
