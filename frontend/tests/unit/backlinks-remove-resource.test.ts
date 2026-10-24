import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import {
  persistBacklinks,
  loadBacklinks,
  removeResourceFromBacklinks,
  updateBacklinks,
  type BacklinkIndex,
} from "../../src/lib/models/backlinks";
import { generateUUID } from "../../src/lib/models/uuid";

describe("removeResourceFromBacklinks (Task 5)", () => {
  beforeEach(() => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
  });

  it("removes the resource's own key and strips it from other resources' referenced-id arrays", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-bk-rm-"));

    const a = generateUUID();
    const b = generateUUID();
    const c = generateUUID();

    const index: BacklinkIndex = { [a]: [b, c], [b]: [a], [c]: [] };
    await persistBacklinks(projectRoot, index);

    await removeResourceFromBacklinks(projectRoot, a);

    const loaded = await loadBacklinks(projectRoot);
    expect(loaded).not.toHaveProperty(a);
    expect(loaded[b]).toEqual([]);
    expect(loaded[c]).toEqual([]);
  });

  it("is a no-op when the index has no entries referencing the resource", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-bk-rm-"));
    const a = generateUUID();
    const b = generateUUID();

    await persistBacklinks(projectRoot, { [b]: [] });

    await expect(
      removeResourceFromBacklinks(projectRoot, a),
    ).resolves.toBeUndefined();

    const loaded = await loadBacklinks(projectRoot);
    expect(loaded).toEqual({ [b]: [] });
  });

  it("tolerates a missing backlinks.json (empty index)", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-bk-rm-"));
    const a = generateUUID();

    await expect(
      removeResourceFromBacklinks(projectRoot, a),
    ).resolves.toBeUndefined();

    const loaded = await loadBacklinks(projectRoot);
    expect(loaded).toEqual({});
  });

  describe("updateBacklinks (Feature 93, Task 21)", () => {
    it("loads, changes and saves on an idle project", async () => {
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-bk-up-"));
      const a = generateUUID();
      const b = generateUUID();
      await persistBacklinks(projectRoot, { [a]: [] });

      await updateBacklinks(projectRoot, (index) => {
        index[a] = [b];
      });

      expect(await loadBacklinks(projectRoot)).toEqual({ [a]: [b] });
    });

    it("rethrows a throw from the change unchanged, writes nothing and releases the lock", async () => {
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-bk-up-"));
      const a = generateUUID();
      const b = generateUUID();
      const seed: BacklinkIndex = { [a]: [b], [b]: [] };
      await persistBacklinks(projectRoot, seed);
      const boom = new Error("change failed");

      await expect(
        updateBacklinks(projectRoot, (index) => {
          delete index[a];
          throw boom;
        }),
      ).rejects.toBe(boom);

      expect(await loadBacklinks(projectRoot)).toEqual(seed);
      await removeResourceFromBacklinks(projectRoot, a);
      expect(await loadBacklinks(projectRoot)).toEqual({ [b]: [] });
    });
  });
});
