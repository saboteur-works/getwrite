import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import {
  persistMentionIndex,
  loadMentionIndex,
  removeResourceFromMentionIndex,
  updateMentionIndex,
  type MentionIndex,
} from "../../src/lib/models/mention-index";
import { generateUUID } from "../../src/lib/models/uuid";

describe("removeResourceFromMentionIndex (Task 5)", () => {
  beforeEach(() => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
  });

  it("removes the resource's own key from the persisted mention index", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-mi-rm-"));

    const resourceA = generateUUID();
    const resourceB = generateUUID();
    const entityX = generateUUID();

    const index: MentionIndex = {
      [resourceA]: [
        { entityId: entityX, resourceId: resourceA, count: 1, offsets: [3] },
      ],
      [resourceB]: [
        { entityId: entityX, resourceId: resourceB, count: 2, offsets: [1, 9] },
      ],
    };
    await persistMentionIndex(projectRoot, index);

    await removeResourceFromMentionIndex(projectRoot, resourceA);

    const loaded = await loadMentionIndex(projectRoot);
    expect(loaded).not.toHaveProperty(resourceA);
    expect(loaded[resourceB]).toEqual(index[resourceB]);
  });

  it("does not touch other resources' entries, per the resource-keyed-only shape", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-mi-rm-"));
    const resourceA = generateUUID();
    const resourceB = generateUUID();
    const entityX = generateUUID();

    await persistMentionIndex(projectRoot, {
      [resourceB]: [
        { entityId: entityX, resourceId: resourceB, count: 1, offsets: [0] },
      ],
    });

    await removeResourceFromMentionIndex(projectRoot, resourceA);

    const loaded = await loadMentionIndex(projectRoot);
    expect(Object.keys(loaded)).toEqual([resourceB]);
  });

  it("tolerates a missing mentions.json (empty index)", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-mi-rm-"));
    const resourceA = generateUUID();

    await expect(
      removeResourceFromMentionIndex(projectRoot, resourceA),
    ).resolves.toBeUndefined();

    const loaded = await loadMentionIndex(projectRoot);
    expect(loaded).toEqual({});
  });

  describe("updateMentionIndex (Feature 93, Task 20)", () => {
    it("loads, changes and saves on an idle project", async () => {
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-mi-up-"));
      const a = generateUUID();
      const e = generateUUID();
      await persistMentionIndex(projectRoot, {});

      await updateMentionIndex(projectRoot, (index) => {
        index[a] = [{ entityId: e, resourceId: a, count: 1, offsets: [2] }];
      });

      expect(Object.keys(await loadMentionIndex(projectRoot))).toEqual([a]);
    });

    it("rethrows a throw from the change unchanged, writes nothing and releases the lock", async () => {
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-mi-up-"));
      const a = generateUUID();
      const e = generateUUID();
      const seed: MentionIndex = {
        [a]: [{ entityId: e, resourceId: a, count: 1, offsets: [0] }],
      };
      await persistMentionIndex(projectRoot, seed);
      const boom = new Error("change failed");

      await expect(
        updateMentionIndex(projectRoot, (index) => {
          delete index[a];
          throw boom;
        }),
      ).rejects.toBe(boom);

      expect(await loadMentionIndex(projectRoot)).toEqual(seed);
      await updateMentionIndex(projectRoot, (index) => {
        delete index[a];
      });
      expect(await loadMentionIndex(projectRoot)).toEqual({});
    });
  });
});
