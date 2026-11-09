/**
 * Feature 105 Task 5: the shared ref-counted blob cache. A fake read function
 * and counters of created and revoked object URLs stand in for the platform.
 */
import { describe, it, expect, vi } from "vitest";
import {
  createResourceBlobCache,
  type ResourceBlobCacheDeps,
} from "../../src/lib/resource-blob-cache";
import type { ResourceBytes } from "../../src/lib/api/resource-bytes";
import type { ResourceObjectUrlState } from "../../src/lib/resource-object-url-state";

interface Deferred {
  resolve(value: ResourceBytes): void;
  reject(error: unknown): void;
}

function setup() {
  const reads: Array<{ projectId: string; resourceId: string } & Deferred> = [];
  const created: string[] = [];
  const revoked: string[] = [];
  const deps: ResourceBlobCacheDeps = {
    read: (projectId, resourceId) =>
      new Promise<ResourceBytes>((resolve, reject) => {
        reads.push({ projectId, resourceId, resolve, reject });
      }),
    createObjectUrl: () => {
      const url = `blob:fake-${created.length + 1}`;
      created.push(url);
      return url;
    },
    revokeObjectUrl: (url) => {
      revoked.push(url);
    },
  };
  return { cache: createResourceBlobCache(deps), reads, created, revoked };
}

const BYTES = {
  bytes: new Uint8Array([1, 2, 3]),
  mime: "image/png",
  kind: "image",
} as ResourceBytes;

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function refusal(): Error {
  const error = new Error("Too large to show.");
  error.name = "ResourceBytesTooLargeError";
  return error;
}

describe("resource blob cache", () => {
  it("starts loading, then reports ready to every holder", async () => {
    const { cache, reads } = setup();
    const seen: ResourceObjectUrlState[] = [];
    const holder = cache.acquire("p", "r", (s) => seen.push(s));
    expect(holder.getState()).toEqual({ status: "loading" });
    reads[0].resolve(BYTES);
    await flush();
    expect(holder.getState()).toEqual({
      status: "ready",
      url: "blob:fake-1",
      kind: "image",
    });
    expect(seen).toEqual([holder.getState()]);
  });

  it("reads once and creates one URL for two acquires of one resource", async () => {
    const { cache, reads, created } = setup();
    const a = cache.acquire("p", "r");
    const b = cache.acquire("p", "r");
    reads[0].resolve(BYTES);
    await flush();
    expect(reads).toHaveLength(1);
    expect(created).toHaveLength(1);
    expect(a.getState()).toEqual(b.getState());
  });

  it("revokes only after the last release, exactly once", async () => {
    const { cache, reads, created, revoked } = setup();
    const a = cache.acquire("p", "r");
    const b = cache.acquire("p", "r");
    reads[0].resolve(BYTES);
    await flush();
    a.release();
    expect(revoked).toEqual([]);
    b.release();
    expect(revoked).toEqual(created);
    b.release();
    a.release();
    expect(revoked).toHaveLength(1);
  });

  it("creates no URL for a read that resolves after the last release", async () => {
    const { cache, reads, created, revoked } = setup();
    const a = cache.acquire("p", "r");
    a.release();
    reads[0].resolve(BYTES);
    await flush();
    expect(created).toEqual([]);
    expect(revoked).toEqual([]);
  });

  it("a resource re-acquired after release while still loading joins the in-flight read (Task 17)", async () => {
    const { cache, reads, created } = setup();
    cache.acquire("p", "r").release();
    const b = cache.acquire("p", "r");
    expect(reads).toHaveLength(1);
    expect(b.getState()).toEqual({ status: "loading" });
    reads[0].resolve(BYTES);
    await flush();
    expect(created).toHaveLength(1);
    expect(b.getState().status).toBe("ready");
  });

  it("caches a failure for current holders, leaves no URL, and re-reads after all release", async () => {
    const { cache, reads, created } = setup();
    const a = cache.acquire("p", "r");
    reads[0].reject(new Error("disk"));
    await flush();
    expect(a.getState().status).toBe("failed");
    const b = cache.acquire("p", "r");
    expect(reads).toHaveLength(1);
    expect(b.getState().status).toBe("failed");
    expect(created).toEqual([]);
    a.release();
    b.release();
    cache.acquire("p", "r");
    expect(reads).toHaveLength(2);
  });

  it("shares a refusal like a success and creates no URL", async () => {
    const { cache, reads, created } = setup();
    const a = cache.acquire("p", "r");
    const b = cache.acquire("p", "r");
    reads[0].reject(refusal());
    await flush();
    expect(a.getState()).toEqual({
      status: "refused",
      message: "Too large to show.",
    });
    expect(b.getState()).toEqual(a.getState());
    expect(reads).toHaveLength(1);
    expect(created).toEqual([]);
  });

  it("treats empty bytes as a failure with no URL", async () => {
    const { cache, reads, created } = setup();
    const a = cache.acquire("p", "r");
    reads[0].resolve({ ...BYTES, bytes: new Uint8Array(0) } as ResourceBytes);
    await flush();
    expect(a.getState().status).toBe("failed");
    expect(created).toEqual([]);
  });

  it("keeps distinct resources and projects independent", async () => {
    const { cache, reads, created, revoked } = setup();
    const a = cache.acquire("p", "r1");
    const b = cache.acquire("p", "r2");
    const c = cache.acquire("q", "r1");
    expect(reads).toHaveLength(3);
    reads.forEach((read) => read.resolve(BYTES));
    await flush();
    expect(created).toHaveLength(3);
    a.release();
    expect(revoked).toEqual([created[0]]);
    b.release();
    c.release();
    expect([...revoked].sort()).toEqual([...created].sort());
  });

  it("does not notify a released holder", async () => {
    const { cache, reads } = setup();
    const other = cache.acquire("p", "r");
    const seen: ResourceObjectUrlState[] = [];
    const a = cache.acquire("p", "r", (s) => seen.push(s));
    a.release();
    reads[0].resolve(BYTES);
    await flush();
    expect(seen).toEqual([]);
    other.release();
  });
});

describe("in-flight reads and the read timeout (Task 17)", () => {
  function pendingDeps(readTimeoutMs?: number) {
    const reads: Deferred[] = [];
    const created: string[] = [];
    const deps: ResourceBlobCacheDeps = {
      read: () =>
        new Promise<ResourceBytes>((resolve, reject) => {
          reads.push({ resolve, reject });
        }),
      createObjectUrl: () => {
        created.push("blob:x");
        return "blob:x";
      },
      revokeObjectUrl: () => {},
      readTimeoutMs,
    };
    return { reads, created, cache: createResourceBlobCache(deps) };
  }
  const wait = (ms: number): Promise<void> =>
    new Promise((r) => setTimeout(r, ms));

  it("a holder that acquires while an orphaned read is in flight joins it", async () => {
    const f = pendingDeps();
    f.cache.acquire("p", "r").release();
    const second = f.cache.acquire("p", "r");
    expect(f.reads).toHaveLength(1);
    f.reads[0].resolve(BYTES);
    await wait(0);
    expect(second.getState().status).toBe("ready");
  });

  it("a read that settles with no holder creates no URL and is forgotten", async () => {
    const f = pendingDeps();
    f.cache.acquire("p", "r").release();
    f.reads[0].resolve(BYTES);
    await wait(0);
    expect(f.created).toHaveLength(0);
    f.cache.acquire("p", "r");
    expect(f.reads).toHaveLength(2);
  });

  it("a read unsettled after the timeout ends failed and drops a late result", async () => {
    const f = pendingDeps(20);
    const onChange = vi.fn();
    const h = f.cache.acquire("p", "r", onChange);
    await wait(60);
    expect(h.getState().status).toBe("failed");
    expect(onChange).toHaveBeenCalledTimes(1);
    f.reads[0].resolve(BYTES);
    await wait(0);
    expect(f.created).toHaveLength(0);
    expect(h.getState().status).toBe("failed");
  });
});
