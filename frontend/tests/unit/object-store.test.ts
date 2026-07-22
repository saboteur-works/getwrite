import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import {
  createMemoryObjectStore,
  createFsObjectStore,
  type ObjectStore,
} from "../../src/lib/models/object-store";

/**
 * Shared behavioral contract every {@link ObjectStore} must satisfy. Run against
 * both the in-memory and filesystem-backed stores so they stay interchangeable
 * beneath the object-store adapter.
 */
function runObjectStoreContract(
  label: string,
  makeStore: () => Promise<{
    store: ObjectStore;
    cleanup?: () => Promise<void>;
  }>,
) {
  describe(`ObjectStore contract: ${label}`, () => {
    let cleanup: (() => Promise<void>) | undefined;
    afterEach(async () => {
      await cleanup?.();
      cleanup = undefined;
    });

    async function store(): Promise<ObjectStore> {
      const made = await makeStore();
      cleanup = made.cleanup;
      return made.store;
    }

    it("put then get round-trips bytes exactly", async () => {
      const s = await store();
      const bytes = Buffer.from([0x00, 0x01, 0xfe, 0xff]);
      await s.put("a/b/c", bytes);
      const read = await s.get("a/b/c");
      expect(read.equals(bytes)).toBe(true);
    });

    it("get on a missing key throws ENOENT", async () => {
      const s = await store();
      await expect(s.get("missing")).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("put overwrites an existing key", async () => {
      const s = await store();
      await s.put("k", Buffer.from("old"));
      await s.put("k", Buffer.from("new"));
      expect((await s.get("k")).toString()).toBe("new");
    });

    it("stored bytes do not alias the caller's buffer", async () => {
      const s = await store();
      const bytes = Buffer.from("original");
      await s.put("k", bytes);
      bytes.write("mutated!");
      expect((await s.get("k")).toString()).toBe("original");
    });

    it("delete is idempotent and removes the key", async () => {
      const s = await store();
      await s.put("k", Buffer.from("x"));
      await s.delete("k");
      await s.delete("k"); // no throw on second delete
      expect(await s.has("k")).toBe(false);
    });

    it("list returns only keys matching the prefix", async () => {
      const s = await store();
      await s.put("proj/a", Buffer.from("1"));
      await s.put("proj/sub/b", Buffer.from("2"));
      await s.put("other/c", Buffer.from("3"));
      expect((await s.list("proj/")).sort()).toEqual(["proj/a", "proj/sub/b"]);
      expect(await s.list("nope/")).toEqual([]);
    });

    it("has reflects presence without transferring bytes", async () => {
      const s = await store();
      await s.put("here", Buffer.from("y"));
      expect(await s.has("here")).toBe(true);
      expect(await s.has("gone")).toBe(false);
    });

    it("keys with separators and dots stay flat and distinct", async () => {
      const s = await store();
      await s.put("a/b", Buffer.from("1"));
      await s.put("a/b/", Buffer.from("2")); // marker-style key
      await s.put("../escape", Buffer.from("3"));
      expect((await s.get("a/b")).toString()).toBe("1");
      expect((await s.get("a/b/")).toString()).toBe("2");
      expect((await s.get("../escape")).toString()).toBe("3");
    });
  });
}

runObjectStoreContract("memory", async () => ({
  store: createMemoryObjectStore(),
}));

runObjectStoreContract("filesystem", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-objstore-"));
  return {
    store: createFsObjectStore(root),
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
});

describe("createFsObjectStore edge cases", () => {
  it("list keeps an object whose key ends in .tmp, hiding only in-flight write temps", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-objstore-"));
    try {
      const store = createFsObjectStore(root);
      await store.put("a/notes.tmp", Buffer.from("real object"));
      // A legitimate ".tmp"-suffixed key must remain visible (matches memory
      // store); only the internal <key>.<pid>.<seq>.tmp temps are filtered.
      expect(await store.list("a/")).toEqual(["a/notes.tmp"]);
      expect((await store.get("a/notes.tmp")).toString()).toBe("real object");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("concurrent puts to the same key do not race on a shared temp file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-objstore-"));
    try {
      const store = createFsObjectStore(root);
      // With a per-process temp sequence, neither put throws ENOENT from a
      // temp clobbered by the other; the survivor is one of the two writes.
      await Promise.all([
        store.put("k", Buffer.from("first")),
        store.put("k", Buffer.from("second")),
      ]);
      expect(["first", "second"]).toContain((await store.get("k")).toString());
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("createFsObjectStore persistence", () => {
  it("a second store over the same root sees prior objects (durable)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-objstore-"));
    try {
      await createFsObjectStore(root).put("persisted", Buffer.from("kept"));
      const reopened = createFsObjectStore(root);
      expect((await reopened.get("persisted")).toString()).toBe("kept");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("stores each object as a flat file under the root, not a nested tree", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-objstore-"));
    try {
      await createFsObjectStore(root).put("deep/nested/key", Buffer.from("x"));
      const entries = await fs.readdir(root, { withFileTypes: true });
      const files = entries.filter((e) => !e.name.endsWith(".tmp"));
      expect(files).toHaveLength(1);
      expect(files[0].isFile()).toBe(true);
      // No "deep" directory was created — the namespace is flat.
      expect(files.some((e) => e.isDirectory())).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
