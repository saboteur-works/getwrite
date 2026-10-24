/**
 * Feature 92, Task 7: the per-file lock primitive (`withFileLock`).
 * Pure in-memory: paths are only keys, no file is touched.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fileLockModule from "../../src/lib/models/file-lock";
import { withFileLock } from "../../src/lib/models/file-lock";
import { withMetaLock } from "../../src/lib/models/meta-locks";
import { acquireLock } from "../../src/lib/models/locks";
import {
  getLockGuard,
  installLockGuard,
  LockOrderViolationError,
} from "../../src/lib/models/lock-guard";
import * as io from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { mutateSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { createLockOrderGuard } from "../helpers/lockOrderGuard";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

describe("withFileLock", () => {
  it("runs two calls for the same path one after the other, in call order", async () => {
    const events: string[] = [];
    const gate = deferred();
    const first = withFileLock("/p/project.json", async () => {
      events.push("first:start");
      await gate.promise;
      events.push("first:end");
    });
    const second = withFileLock("/p/project.json", async () => {
      events.push("second:start");
      events.push("second:end");
    });
    await tick();
    expect(events).toEqual(["first:start"]);
    gate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("does not block two different paths", async () => {
    const gate = deferred();
    const events: string[] = [];
    const blocked = withFileLock("/p/project.json", async () => {
      await gate.promise;
    });
    await withFileLock("/p/meta/resource-x.meta.json", async () => {
      events.push("other-ran");
    });
    expect(events).toEqual(["other-ran"]);
    gate.resolve();
    await blocked;
  });

  it("treats /a/b, /a/b/ and /a/b/../b as one lock", async () => {
    const events: string[] = [];
    const gate = deferred();
    const a = withFileLock("/a/b", async () => {
      events.push("a:start");
      await gate.promise;
      events.push("a:end");
    });
    const b = withFileLock("/a/b/", async () => {
      events.push("b:start");
      await gate.promise;
      events.push("b:end");
    });
    const c = withFileLock("/a/b/../b", async () => {
      events.push("c:start");
    });
    await tick();
    expect(events).toEqual(["a:start"]);
    gate.resolve();
    await Promise.all([a, b, c]);
    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end", "c:start"]);
  });

  it("propagates the same error object and lets a later call run", async () => {
    const boom = new Error("boom");
    await expect(
      withFileLock("/p/project.json", async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    const waiting = withFileLock("/p/project.json", async () => "after");
    await expect(waiting).resolves.toBe("after");
  });

  it("propagates the error of a callback that throws synchronously", async () => {
    const boom = new Error("sync");
    await expect(
      withFileLock("/p/project.json", () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    await expect(withFileLock("/p/project.json", async () => 1)).resolves.toBe(
      1,
    );
  });

  it("releases for waiters when an earlier call rejects", async () => {
    const gate = deferred();
    const first = withFileLock("/p/project.json", async () => {
      await gate.promise;
      throw new Error("first failed");
    });
    const second = withFileLock("/p/project.json", async () => "second ok");
    gate.resolve();
    await expect(first).rejects.toThrow("first failed");
    await expect(second).resolves.toBe("second ok");
  });

  it("returns the callback value unchanged", async () => {
    const value = { a: 1, nested: [1, 2] };
    await expect(withFileLock("/p/x", async () => value)).resolves.toBe(value);
    await expect(withFileLock("/p/x", async () => undefined)).resolves.toBe(
      undefined,
    );
  });

  it("has no timeout: a call waits for a slow earlier call", async () => {
    const events: string[] = [];
    const slow = withFileLock("/p/project.json", async () => {
      await new Promise((r) => setTimeout(r, 300));
      events.push("slow");
    });
    const waiter = withFileLock("/p/project.json", async () => {
      events.push("waiter");
    });
    await Promise.all([slow, waiter]);
    expect(events).toEqual(["slow", "waiter"]);
  });

  it("exports no release function and no timeout option", () => {
    const names = Object.keys(fileLockModule);
    expect(names.filter((n) => /release|acquire|unlock/i.test(n))).toEqual([]);
    expect(withFileLock.length).toBe(2);
  });

  it("uses its own key map, shared with neither withMetaLock nor acquireLock", async () => {
    const path = "/p/project.json";
    const gate = deferred();
    const events: string[] = [];
    const meta = withMetaLock(path, async () => {
      await gate.promise;
    });
    const queue = await acquireLock(path);
    await withFileLock(path, async () => {
      events.push("file-lock-ran");
    });
    expect(events).toEqual(["file-lock-ran"]);
    queue();
    gate.resolve();
    await meta;
  });

  it("removes a key when its last call finishes", async () => {
    expect(fileLockModule.fileLockKeyCountForTests()).toBe(0);
    const paths = Array.from({ length: 200 }, (_, i) => `/p/r-${i}.json`);
    await Promise.all(
      paths.flatMap((p) => [
        withFileLock(p, async () => undefined),
        withFileLock(p, async () => undefined),
      ]),
    );
    expect(fileLockModule.fileLockKeyCountForTests()).toBe(0);
  });

  it("keeps the key while a call waits, and removes it after a failure", async () => {
    const gate = deferred();
    const first = withFileLock("/p/k", async () => {
      await gate.promise;
      throw new Error("x");
    });
    const second = withFileLock("/p/k", async () => undefined);
    expect(fileLockModule.fileLockKeyCountForTests()).toBe(1);
    gate.resolve();
    await first.catch(() => undefined);
    await second;
    expect(fileLockModule.fileLockKeyCountForTests()).toBe(0);
  });
});

describe("lock-order guard (Feature 92, FR-8, FR-9; installed by tests/setup.ts)", () => {
  const PROJECT = "/g/project.json";
  const SIDECAR = "/g/meta/resource-a.meta.json";
  const OTHER = "/g/meta/resource-b.meta.json";

  it("is installed for every test file", () => {
    expect(getLockGuard()).not.toBeNull();
  });

  it("throws for withMetaLock taken inside a file lock", async () => {
    await expect(
      withFileLock(PROJECT, () => withMetaLock("/g", async () => "x")),
    ).rejects.toBeInstanceOf(LockOrderViolationError);
  });

  it("throws for acquireLock taken inside a file lock", async () => {
    await expect(
      withFileLock(PROJECT, async () => {
        (await acquireLock("/g"))();
      }),
    ).rejects.toBeInstanceOf(LockOrderViolationError);
  });

  it("throws for a nested file lock on the same file, and for another file", async () => {
    await expect(
      withFileLock(PROJECT, () => withFileLock(PROJECT, async () => 1)),
    ).rejects.toBeInstanceOf(LockOrderViolationError);
    await expect(
      withFileLock(SIDECAR, () => withFileLock(OTHER, async () => 1)),
    ).rejects.toBeInstanceOf(LockOrderViolationError);
  });

  it("throws for a sidecar lock inside the project.json lock and the reverse", async () => {
    await expect(
      withFileLock(PROJECT, () => withFileLock(SIDECAR, async () => 1)),
    ).rejects.toBeInstanceOf(LockOrderViolationError);
    await expect(
      withFileLock(SIDECAR, () => withFileLock(PROJECT, async () => 1)),
    ).rejects.toBeInstanceOf(LockOrderViolationError);
  });

  it("throws after an await inside the lock body, not only before it", async () => {
    await expect(
      withFileLock(PROJECT, async () => {
        await tick();
        await withMetaLock("/g", async () => 1);
      }),
    ).rejects.toBeInstanceOf(LockOrderViolationError);
  });

  it("names the lock taken and the file lock held", async () => {
    await expect(
      withFileLock(PROJECT, () => withMetaLock("/g", async () => 1)),
    ).rejects.toThrow(/withMetaLock\(\/g\).*\/g\/project\.json/);
  });

  it("releases the file lock after a violation, so a later call runs", async () => {
    await withFileLock(PROJECT, () => withMetaLock("/g", async () => 1)).catch(
      () => undefined,
    );
    await expect(withFileLock(PROJECT, async () => "ok")).resolves.toBe("ok");
    expect(fileLockModule.fileLockKeyCountForTests()).toBe(0);
  });

  it("allows acquireLock -> file lock and withMetaLock -> file lock", async () => {
    const release = await acquireLock("/g");
    await expect(withFileLock(PROJECT, async () => 1)).resolves.toBe(1);
    release();
    await expect(
      withMetaLock("/g", () => withFileLock(PROJECT, async () => 2)),
    ).resolves.toBe(2);
  });

  it("allows acquireLock(revision-content) -> withMetaLock", async () => {
    const release = await acquireLock("revision-content:/g:a");
    await expect(withMetaLock("/g", async () => 3)).resolves.toBe(3);
    release();
  });

  it("allows withMetaLock -> sidecar lock, then withMetaLock -> project.json lock, in sequence", async () => {
    await expect(
      withMetaLock("/g", async () => {
        await withFileLock(SIDECAR, async () => undefined);
        await withFileLock(PROJECT, async () => undefined);
        return "done";
      }),
    ).resolves.toBe("done");
  });

  describe("sidecar mutate callbacks", () => {
    const previous = io.getStorageAdapter();
    beforeEach(() => io.setStorageAdapter(createMemoryAdapter()));
    afterEach(() => io.setStorageAdapter(previous));

    it("throws when the callback calls writeSidecar", async () => {
      await expect(
        mutateSidecar("/g", "a", async () => {
          await writeSidecar("/g", "b", { name: "x" });
          return { name: "y" };
        }),
      ).rejects.toBeInstanceOf(LockOrderViolationError);
    });

    it("throws when the callback calls the sink", async () => {
      await expect(
        mutateSidecar("/g", "a", async () => {
          await mutateSidecar("/g", "b", () => ({ name: "x" }));
          return { name: "y" };
        }),
      ).rejects.toBeInstanceOf(LockOrderViolationError);
    });

    it("does not throw for the sink's own sequence (sidecar lock, then the revision bump)", async () => {
      await expect(
        writeSidecar("/g", "a", { name: "ok" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("outside tests", () => {
    afterEach(() => installLockGuard(createLockOrderGuard()));

    it("does nothing when no guard is installed: the same nesting runs", async () => {
      installLockGuard(null);
      expect(getLockGuard()).toBeNull();
      await expect(
        withFileLock(PROJECT, () => withMetaLock("/g", async () => "ran")),
      ).resolves.toBe("ran");
    });
  });
});
