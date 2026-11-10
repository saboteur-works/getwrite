/**
 * Feature 107 Task 7 (FR-7 bytes after choice and cap, FR-11 no staging
 * write): the `content://` reader, against a fake filesystem. Nothing here is
 * evidence about the real WebView reading `content://` or the grant holding.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  readSharedImage,
  SHARED_READ_CHUNK_BYTES,
  type SharedContentFilesystem,
} from "../../src/store/transport/shared-content-reader";
import {
  SHARE_IMAGE_MAX_BYTES,
  shareImageRefusalMessage,
} from "../../src/lib/models/share-item-core";
import { mediaTooLargeToShowMessage } from "../../src/lib/models/media-validation";
import type { ShareImageItem } from "../../src/lib/api/share-capture-types";

interface FakeFs extends SharedContentFilesystem {
  calls: string[];
  optionKeys: string[][];
  /** Set by a test once the reader has settled; a paced fake stops then. */
  stopped: boolean;
}

const b64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64");

function makeBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = i % 251;
  return out;
}

/** A fake plugin serving `content`, or failing as configured. */
function makeFs(opts: {
  content?: Uint8Array;
  failWith?: Error;
  failChunkCallback?: boolean;
  paced?: boolean;
}): FakeFs {
  const fs: FakeFs = {
    calls: [],
    optionKeys: [],
    stopped: false,
    readFile: async (o) => {
      fs.calls.push("readFile");
      fs.optionKeys.push(Object.keys(o));
      if (opts.failWith) throw opts.failWith;
      return { data: b64(opts.content ?? new Uint8Array()) };
    },
    readFileInChunks: async (o, cb) => {
      fs.calls.push("readFileInChunks");
      fs.optionKeys.push(Object.keys(o));
      if (opts.failWith) throw opts.failWith;
      if (opts.failChunkCallback) {
        cb(null, new Error("grant revoked mid-read"));
        return "cb-1";
      }
      const content = opts.content ?? new Uint8Array();
      for (let off = 0; off < content.length; off += o.chunkSize) {
        if (opts.paced) {
          await new Promise<void>((r) => setTimeout(r, 0));
          if (fs.stopped) return "cb-1";
        }
        const chunk = content.subarray(off, off + o.chunkSize);
        fs.calls.push(`chunk:${chunk.length}`);
        cb({ data: b64(chunk) });
      }
      cb({ data: "" });
      return "cb-1";
    },
  };
  return fs;
}

const item = (size?: number): ShareImageItem => ({
  kind: "image",
  uri: "content://media/external/images/1",
  name: "a.png",
  mimeType: "image/png",
  ...(size === undefined ? {} : { size }),
});

describe("readSharedImage", () => {
  it("refuses a reported size above the cap with no read call", async () => {
    const fs = makeFs({ content: makeBytes(4) });
    const size = SHARE_IMAGE_MAX_BYTES + 1;
    const r = await readSharedImage(item(size), fs);
    expect(r).toEqual({
      status: "refused",
      message: mediaTooLargeToShowMessage(size),
    });
    expect(fs.calls).toEqual([]);
  });

  it("reads a reported size at the cap boundary by readFile", async () => {
    const fs = makeFs({ content: makeBytes(64) });
    const r = await readSharedImage(item(SHARE_IMAGE_MAX_BYTES), fs);
    expect(r.status).toBe("read");
    expect(fs.calls).toEqual(["readFile"]);
  });

  it("returns bytes equal to the fake content for a reported size", async () => {
    const content = makeBytes(1000);
    const fs = makeFs({ content });
    const r = await readSharedImage(item(1000), fs);
    if (r.status !== "read") throw new Error("expected read");
    expect(r.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(r.bytes)).toEqual(Array.from(content));
  });

  it("refuses when a reported-size read delivers more than the cap", async () => {
    const delivered = SHARE_IMAGE_MAX_BYTES + 10;
    const fs = makeFs({ content: makeBytes(delivered) });
    const r = await readSharedImage(item(10), fs);
    expect(r).toEqual({
      status: "refused",
      message: mediaTooLargeToShowMessage(delivered),
    });
  });

  it("reads in chunks with no reported size and returns equal bytes", async () => {
    const content = makeBytes(SHARED_READ_CHUNK_BYTES * 2 + 17);
    const fs = makeFs({ content });
    const r = await readSharedImage(item(), fs);
    if (r.status !== "read") throw new Error("expected read");
    expect(Array.from(r.bytes)).toEqual(Array.from(content));
    expect(fs.calls[0]).toBe("readFileInChunks");
    expect(fs.calls).not.toContain("readFile");
  });

  it("treats a size that is not a usable number as unknown", async () => {
    const fs = makeFs({ content: makeBytes(5) });
    const r = await readSharedImage(item(Number.NaN), fs);
    expect(r.status).toBe("read");
    expect(fs.calls[0]).toBe("readFileInChunks");
  });

  it("accepts exactly the cap by counted read", async () => {
    const fs = makeFs({ content: makeBytes(SHARE_IMAGE_MAX_BYTES) });
    const r = await readSharedImage(item(), fs);
    expect(r.status).toBe("read");
    if (r.status === "read") expect(r.bytes.length).toBe(SHARE_IMAGE_MAX_BYTES);
  });

  it("stops a counted read past the cap, holding at most cap plus one chunk", async () => {
    const fs = makeFs({
      content: makeBytes(SHARE_IMAGE_MAX_BYTES + 5 * SHARED_READ_CHUNK_BYTES),
      paced: true,
    });
    const r = await readSharedImage(item(), fs);
    fs.stopped = true;
    expect(r).toEqual({
      status: "refused",
      message: shareImageRefusalMessage(),
    });
    const handed = fs.calls
      .filter((c) => c.startsWith("chunk:"))
      .map((c) => Number(c.slice(6)))
      .reduce((a, b) => a + b, 0);
    expect(handed).toBeGreaterThan(SHARE_IMAGE_MAX_BYTES);
    expect(handed).toBeLessThanOrEqual(
      SHARE_IMAGE_MAX_BYTES + SHARED_READ_CHUNK_BYTES,
    );
  });

  it("returns a failure, distinct from a refusal, when readFile rejects", async () => {
    const fs = makeFs({ failWith: new Error("Permission Denial: revoked") });
    const r = await readSharedImage(item(10), fs);
    expect(r.status).toBe("failed");
    if (r.status === "failed") expect(r.message).toMatch(/could not be read/i);
  });

  it("reports a revoked grant on the chunked path as a failed read, not an empty image", async () => {
    const fs = makeFs({ failWith: new Error("Permission Denial: revoked") });
    const r = await readSharedImage(item(), fs);
    expect(r.status).toBe("failed");
  });

  it("reports an error delivered through the chunk callback as a failed read", async () => {
    const fs = makeFs({ failChunkCallback: true });
    const r = await readSharedImage(item(), fs);
    expect(r.status).toBe("failed");
  });

  it("reports a zero-byte read as a failure, never an empty image", async () => {
    const fs = makeFs({ content: new Uint8Array() });
    expect((await readSharedImage(item(0), fs)).status).toBe("failed");
    expect((await readSharedImage(item(), fs)).status).toBe("failed");
  });

  it("never passes a directory and makes no write call", async () => {
    const fs = makeFs({ content: makeBytes(32) });
    await readSharedImage(item(32), fs);
    await readSharedImage(item(), fs);
    for (const keys of fs.optionKeys) {
      expect(keys).not.toContain("directory");
    }
    expect(fs.calls.every((c) => !/write|append|copy|mkdir/i.test(c))).toBe(
      true,
    );
  });

  it("settles when the real plugin is a thenable proxy (device log: Filesystem.then() is not implemented)", async () => {
    // Stand-in for the Capacitor native proxy: reading `then` yields a method
    // that rejects and never calls resolve/reject, so a promise resolved with
    // the proxy itself never settles.
    const proxy = new Proxy(
      {
        readFile: async () => ({ data: b64(makeBytes(16)) }),
        readFileInChunks: async () => "cb-1",
      },
      {
        get(target, prop, receiver) {
          if (prop === "then") {
            return () =>
              Promise.reject(
                new Error('"Filesystem.then()" is not implemented'),
              );
          }
          return Reflect.get(target, prop, receiver) as unknown;
        },
      },
    );
    vi.resetModules();
    vi.doMock("@capacitor/filesystem", () => ({ Filesystem: proxy }));
    try {
      const { readSharedImage: read } =
        await import("../../src/store/transport/shared-content-reader");
      const outcome = await Promise.race([
        read(item(16)).then((r) => r.status),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("hung"), 1000),
        ),
      ]);
      expect(outcome).toBe("read");
    } finally {
      vi.doUnmock("@capacitor/filesystem");
    }
  });

  it("imports no node:* module, no React and no static Capacitor import", () => {
    const src = readFileSync(
      path.resolve(
        __dirname,
        "../../src/store/transport/shared-content-reader.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']node:/);
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/^\s*import[^;]*from\s+["']@capacitor\//m);
  });
});
