import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  atomicWriteFile,
  setStorageAdapter,
  type StorageAdapter,
} from "../../src/lib/models/io";

interface RecordingAdapter extends StorageAdapter {
  fsyncFile: (path: string) => Promise<void>;
  calls: string[];
}

function makeRecordingAdapter(): RecordingAdapter {
  const calls: string[] = [];
  const files = new Map<string, string | Buffer>();
  const adapter: StorageAdapter = {
    mkdir: async () => undefined,
    writeFile: async (p, d) => {
      calls.push(`writeFile:${p}`);
      files.set(p, d);
    },
    readFile: async (p) => {
      const v = files.get(p);
      if (v == null) throw new Error("ENOENT");
      return typeof v === "string" ? v : v.toString("utf8");
    },
    readFileBuffer: async (p) => {
      const v = files.get(p);
      if (v == null) throw new Error("ENOENT");
      return Buffer.isBuffer(v) ? v : Buffer.from(v, "utf8");
    },
    readdir: async () => [],
    stat: async () => ({}) as any,
    rm: async (p) => {
      files.delete(p);
    },
    rename: async (a, b) => {
      calls.push(`rename:${a}->${b}`);
      const v = files.get(a);
      if (v == null) throw new Error("ENOENT");
      files.set(b, v);
      files.delete(a);
    },
    copyFile: async (s, d) => {
      const v = files.get(s);
      if (v == null) throw new Error("ENOENT");
      files.set(d, v);
    },
    cp: async (s, d) => {
      const v = files.get(s);
      if (v == null) throw new Error("ENOENT");
      files.set(d, v);
    },
    appendFile: async (p, d) => {
      const prev = files.get(p);
      files.set(p, prev == null ? d : `${prev}${d}`);
    },
    fsyncFile: async (p) => {
      calls.push(`fsyncFile:${p}`);
    },
  };
  return Object.assign(adapter as RecordingAdapter, { calls });
}

describe("atomicWriteFile durability", () => {
  let adapter: RecordingAdapter;

  beforeEach(() => {
    adapter = makeRecordingAdapter();
    setStorageAdapter(adapter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes via temp file then renames (no fsync by default)", async () => {
    await atomicWriteFile("/out.json", "data", "utf8");
    expect(adapter.calls).toEqual([
      "writeFile:/out.json.tmp",
      "rename:/out.json.tmp->/out.json",
    ]);
  });

  it("calls fsyncFile on the temp file before rename when durable=true", async () => {
    await atomicWriteFile("/out.json", "data", {
      writeOptions: "utf8",
      durable: true,
    });
    expect(adapter.calls).toEqual([
      "writeFile:/out.json.tmp",
      "fsyncFile:/out.json.tmp",
      "rename:/out.json.tmp->/out.json",
    ]);
  });

  it("falls back to plain string options for backwards compatibility", async () => {
    // Passing a string opts argument (legacy signature) should still work and
    // not be interpreted as AtomicWriteOptions.
    await atomicWriteFile("/legacy.txt", "hello", "utf8");
    expect(adapter.calls).toContain("writeFile:/legacy.txt.tmp");
  });

  it("ignores fsync failures and still completes the rename", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    adapter.fsyncFile = async () => {
      throw new Error("EACCES");
    };

    await expect(
      atomicWriteFile("/out.json", "data", {
        writeOptions: "utf8",
        durable: true,
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(adapter.calls).toContain("rename:/out.json.tmp->/out.json");
  });
});
