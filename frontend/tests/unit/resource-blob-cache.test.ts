/**
 * Feature 105 Task 5: the shared ref-counted blob cache. A fake read function
 * and counters of created and revoked object URLs stand in for the platform.
 */
import { describe, it, expect } from "vitest";
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

  it("ignores a stale read when the resource is re-acquired after release", async () => {
    const { cache, reads, created } = setup();
    cache.acquire("p", "r").release();
    const b = cache.acquire("p", "r");
    expect(reads).toHaveLength(2);
    reads[0].resolve(BYTES);
    await flush();
    expect(created).toEqual([]);
    expect(b.getState()).toEqual({ status: "loading" });
    reads[1].resolve(BYTES);
    await flush();
    expect(created).toHaveLength(1);
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
