import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import { softDeleteResource } from "../../src/lib/models/trash";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { indexResource, search } from "../../src/lib/models/inverted-index";
import {
  persistBacklinks,
  loadBacklinks,
} from "../../src/lib/models/backlinks";
import {
  persistMentionIndex,
  loadMentionIndex,
} from "../../src/lib/models/mention-index";
import { createTextResource } from "../../src/lib/models/resource";
import { generateUUID } from "../../src/lib/models/uuid";

// Task 5: soft delete removes a resource from all three indexes (inverted
// index, backlinks, mention index) immediately, per resolved OQ-7 — not
// deferred to purge.
describe("softDeleteResource removes a resource from all indexes immediately", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  it("clears the inverted index entry, a backlink from another resource, and a mention record", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-soft-delete-idx-"),
    );

    const resourceId = generateUUID();
    const otherResourceId = generateUUID();
    const entityId = generateUUID();

    // Sidecar so softDeleteResource has something to move.
    await writeSidecar(projectRoot, resourceId, {
      id: resourceId,
      name: "Doomed Resource",
      type: "text",
    });

    // Inverted index entry for the resource being deleted.
    const target = createTextResource({
      name: "Doomed Resource",
      plainText: "unique searchable phrase",
    });
    await indexResource(projectRoot, { ...target, id: resourceId });
    expect(await search(projectRoot, "unique")).toContain(resourceId);

    // A backlink from another resource pointing at the deleted resource.
    await persistBacklinks(projectRoot, {
      [otherResourceId]: [resourceId],
      [resourceId]: [],
    });

    // A mention record keyed by the deleted resource (it did the mentioning).
    await persistMentionIndex(projectRoot, {
      [resourceId]: [{ entityId, resourceId, count: 1, offsets: [0] }],
    });

    await softDeleteResource(projectRoot, resourceId);

    // Inverted index: no longer searchable.
    expect(await search(projectRoot, "unique")).not.toContain(resourceId);

    // Backlinks: own key gone, and no other resource still references it.
    const backlinks = await loadBacklinks(projectRoot);
    expect(backlinks).not.toHaveProperty(resourceId);
    expect(backlinks[otherResourceId]).toEqual([]);

    // Mention index: own key gone.
    const mentions = await loadMentionIndex(projectRoot);
    expect(mentions).not.toHaveProperty(resourceId);
  });
});
