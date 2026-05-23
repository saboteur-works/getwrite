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
