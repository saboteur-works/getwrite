import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as io from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";

describe("io adapter", () => {
  const original = io.getStorageAdapter();

  afterEach(() => {
    io.setStorageAdapter(original);
  });

  it("replaces adapter and routes calls to the new adapter", async () => {
    const mem = createMemoryAdapter();
    io.setStorageAdapter(mem);

    await io.mkdir("/project-x", { recursive: true });
    await io.writeFile("/project-x/content", "hi");
    const content = await io.readFile("/project-x/content", "utf8");
    await io.readdir("/project-x", { withFileTypes: true });
    await io.stat("/project-x");
    await io.rm("/project-x", { recursive: true, force: true });
    await io.writeFile("/a", "x");
    await io.rename("/a", "/b");

    expect(content).toBe("hi");
    const moved = await io.readFile("/b", "utf8");
    expect(moved).toBe("x");
  });

  it("copyFile duplicates a file's bytes without aliasing", async () => {
    io.setStorageAdapter(createMemoryAdapter());
    await io.mkdir("/p", { recursive: true });
    await io.writeFile("/p/src.bin", Buffer.from([1, 2, 3]));
    await io.copyFile("/p/src.bin", "/p/dst.bin");
    // Mutating the source afterwards must not change the copy (no alias).
    await io.writeFile("/p/src.bin", Buffer.from([9]));
    const copied = await io.readFile("/p/dst.bin");
    expect(Buffer.from(copied, "binary").length).toBe(3);
  });

  it("cp recursively copies a directory subtree", async () => {
    io.setStorageAdapter(createMemoryAdapter());
    await io.mkdir("/p/nested", { recursive: true });
    await io.writeFile("/p/nested/a.txt", "alpha");
    await io.cp("/p", "/q", { recursive: true });
    expect(await io.readFile("/q/nested/a.txt", "utf8")).toBe("alpha");
  });

  it("appendFile creates then extends a file", async () => {
    io.setStorageAdapter(createMemoryAdapter());
    await io.mkdir("/p", { recursive: true });
    await io.appendFile("/p/log.txt", "one");
    await io.appendFile("/p/log.txt", "two");
    expect(await io.readFile("/p/log.txt", "utf8")).toBe("onetwo");
  });

  it("readFileBuffer returns raw bytes, not a decoded string", async () => {
    io.setStorageAdapter(createMemoryAdapter());
    await io.mkdir("/p", { recursive: true });
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP magic
    await io.writeFile("/p/pack.zip", bytes);
    const read = await io.readFileBuffer("/p/pack.zip");
    expect(Buffer.isBuffer(read)).toBe(true);
    expect(read.equals(bytes)).toBe(true);
  });

  it("readdir returns bare names by default and Dirent[] with withFileTypes", async () => {
    io.setStorageAdapter(createMemoryAdapter());
    await io.mkdir("/p/sub", { recursive: true });
    await io.writeFile("/p/a.txt", "x");
    const names = await io.readdir("/p");
    expect(names.sort()).toEqual(["a.txt", "sub"]);
    const typed = await io.readdir("/p", { withFileTypes: true });
    expect(typed.find((e) => e.name === "sub")?.isDirectory()).toBe(true);
  });

  it("exists reflects presence via the active adapter", async () => {
    io.setStorageAdapter(createMemoryAdapter());
    await io.mkdir("/p", { recursive: true });
    await io.writeFile("/p/here.txt", "y");
    expect(await io.exists("/p/here.txt")).toBe(true);
    expect(await io.exists("/p/missing.txt")).toBe(false);
  });
});

describe("atomicWriteFile", () => {
  const original = io.getStorageAdapter();

  beforeEach(() => {
    io.setStorageAdapter(createMemoryAdapter());
  });

  afterEach(() => {
    io.setStorageAdapter(original);
  });

  it("writes file to the final path", async () => {
    await io.mkdir("/p", { recursive: true });
    await io.atomicWriteFile("/p/data.json", "hello");
    const content = await io.readFile("/p/data.json", "utf8");
    expect(content).toBe("hello");
  });

  it("leaves no .tmp file behind after a successful write", async () => {
    await io.mkdir("/p", { recursive: true });
    await io.atomicWriteFile("/p/data.json", "hello");
    await expect(io.readFile("/p/data.json.tmp", "utf8")).rejects.toThrow();
  });

  it("overwrites an existing file", async () => {
    await io.mkdir("/p", { recursive: true });
    await io.writeFile("/p/data.json", "old");
    await io.atomicWriteFile("/p/data.json", "new");
    const content = await io.readFile("/p/data.json", "utf8");
    expect(content).toBe("new");
  });
});
