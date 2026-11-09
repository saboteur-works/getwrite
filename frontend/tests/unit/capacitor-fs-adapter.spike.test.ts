// SPIKE (ADR-021): proves capacitorFsAdapter satisfies the same StorageAdapter
// contract as the fs, memory, and object-store adapters — driven through the
// io.ts wrappers by the shared conformance suite, with no device and no
// @capacitor/* dependency (an in-memory fake models the plugin's contract).
import { describe, it, expect, afterEach } from "vitest";
import { runStorageAdapterConformance } from "./storage-adapter-conformance";
import {
  capacitorFsAdapter,
  CAPACITOR_WRITE_PIECE_BYTES,
} from "../../src/lib/models/capacitorFsAdapter";
import type { CapacitorFilesystemLike } from "../../src/lib/models/capacitor-filesystem";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import * as io from "../../src/lib/models/io";

runStorageAdapterConformance(
  "capacitor filesystem plugin (in-memory fake)",
  async () => ({
    adapter: capacitorFsAdapter(createFakeCapacitorFilesystem()),
  }),
);

describe("capacitorFsAdapter chunked writeFile", () => {
  const PIECE = 4_194_304;

  function spied(): {
    adapter: ReturnType<typeof capacitorFsAdapter>;
    fake: CapacitorFilesystemLike;
    calls: { op: "writeFile" | "appendFile"; bytes: number }[];
  } {
    const fake = createFakeCapacitorFilesystem();
    const calls: { op: "writeFile" | "appendFile"; bytes: number }[] = [];
    const wrapped: CapacitorFilesystemLike = {
      ...fake,
      writeFile: (opts) => {
        calls.push({
          op: "writeFile",
          bytes: Buffer.from(opts.data, "base64").length,
        });
        return fake.writeFile(opts);
      },
      appendFile: (opts) => {
        calls.push({
          op: "appendFile",
          bytes: Buffer.from(opts.data, "base64").length,
        });
        return fake.appendFile(opts);
      },
    };
    return { adapter: capacitorFsAdapter(wrapped), fake, calls };
  }

  function patterned(length: number): Buffer {
    const buf = Buffer.alloc(length);
    for (let i = 0; i < length; i += 1) buf[i] = (i * 31 + (i >> 8)) & 0xff;
    return buf;
  }

  it("uses a 4 MiB piece size constant", () => {
    expect(CAPACITOR_WRITE_PIECE_BYTES).toBe(PIECE);
  });

  it("writes a buffer smaller than one piece with one writeFile", async () => {
    const { adapter, fake, calls } = spied();
    const data = patterned(PIECE - 1);
    await adapter.writeFile("/a.bin", data);
    expect(calls.map((c) => c.op)).toEqual(["writeFile"]);
    const stored = await fake.readFile({ path: "a.bin" });
    expect(Buffer.from(stored.data, "base64").equals(data)).toBe(true);
  });

  it("writes a buffer of exactly one piece with one writeFile", async () => {
    const { adapter, fake, calls } = spied();
    const data = patterned(CAPACITOR_WRITE_PIECE_BYTES);
    await adapter.writeFile("/a.bin", data);
    expect(calls).toEqual([{ op: "writeFile", bytes: PIECE }]);
    const stored = await fake.readFile({ path: "a.bin" });
    expect(Buffer.from(stored.data, "base64").equals(data)).toBe(true);
  });

  it("writes one byte over a piece as writeFile then appendFile", async () => {
    const { adapter, fake, calls } = spied();
    const data = patterned(CAPACITOR_WRITE_PIECE_BYTES + 1);
    await adapter.writeFile("/a.bin", data);
    expect(calls).toEqual([
      { op: "writeFile", bytes: PIECE },
      { op: "appendFile", bytes: 1 },
    ]);
    const stored = await fake.readFile({ path: "a.bin" });
    expect(Buffer.from(stored.data, "base64").equals(data)).toBe(true);
  });

  it("stores a multi-piece buffer byte-equal in order with a shorter last piece", async () => {
    const { adapter, fake, calls } = spied();
    const data = patterned(PIECE * 2 + 1000);
    await adapter.writeFile("/dir/a.bin", data);
    expect(calls).toEqual([
      { op: "writeFile", bytes: PIECE },
      { op: "appendFile", bytes: PIECE },
      { op: "appendFile", bytes: 1000 },
    ]);
    const stored = await fake.readFile({ path: "dir/a.bin" });
    expect(Buffer.from(stored.data, "base64").equals(data)).toBe(true);
  });

  it("overwrites an existing file rather than appending to it", async () => {
    const { adapter, fake } = spied();
    await adapter.writeFile(
      "/a.bin",
      Buffer.from("old content that is longer"),
    );
    const data = patterned(PIECE + 5);
    await adapter.writeFile("/a.bin", data);
    const stored = await fake.readFile({ path: "a.bin" });
    expect(Buffer.from(stored.data, "base64").equals(data)).toBe(true);
  });
});

describe("capacitorFsAdapter atomicWriteFile characterization", () => {
  const original = io.getStorageAdapter();
  afterEach(() => io.setStorageAdapter(original));

  it("stores text written through atomicWriteFile byte-for-byte", async () => {
    const adapter = capacitorFsAdapter(createFakeCapacitorFilesystem());
    io.setStorageAdapter(adapter);
    const text = "héllo\nwörld — 日本語 ✓";
    await io.mkdir("/proj", { recursive: true });
    await io.atomicWriteFile("/proj/note.txt", text);
    const stored = await io.readFileBuffer("/proj/note.txt");
    expect(stored.equals(Buffer.from(text, "utf8"))).toBe(true);
    expect(await io.readdir("/proj")).toEqual(["note.txt"]);
  });
});
