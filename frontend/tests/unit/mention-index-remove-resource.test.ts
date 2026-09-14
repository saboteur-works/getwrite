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
});
