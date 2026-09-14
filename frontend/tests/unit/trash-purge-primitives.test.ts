import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  indexResource,
  removeResourceFromIndex,
} from "../../src/lib/models/inverted-index";
import {
  loadBacklinks,
  persistBacklinks,
  removeResourceFromBacklinks,
} from "../../src/lib/models/backlinks";
import {
  loadMentionIndex,
  persistMentionIndex,
  removeResourceFromMentionIndex,
} from "../../src/lib/models/mention-index";
import { removeEntityRelationshipsForEntity } from "../../src/lib/models/entity-relationships";
import { purgeTrashedRevisions } from "../../src/lib/models/trash";
import { writeRevision, revisionsBaseDir } from "../../src/lib/models/revision";
import type { TextResource } from "../../src/lib/models/types";

const RESOURCE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_RESOURCE_ID = "22222222-2222-4222-8222-222222222222";
const ENTITY_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ENTITY_ID = "44444444-4444-4444-8444-444444444444";

async function makeTmp(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function removeDirRetry(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

async function writeProjectConfig(
  projectRoot: string,
  relationshipTypes: string[],
): Promise<void> {
  await fs.writeFile(
    path.join(projectRoot, "project.json"),
    JSON.stringify({ config: { relationshipTypes } }, null, 2),
    "utf8",
  );
}

async function readIndexFile(projectRoot: string): Promise<unknown> {
  const p = path.join(projectRoot, "meta", "index", "inverted.json");
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return undefined;
  }
}

describe("trash purge-sweep primitives (FR-6, FR-18 steps 1-3)", () => {
  it("removeResourceFromIndex is idempotent — a second call throws nothing and leaves the index identical", async () => {
    const tmp = await makeTmp("getwrite-purge-index-");
    try {
      const now = new Date().toISOString();
      const resource: TextResource = {
        id: RESOURCE_ID,
        slug: "target",
        name: "Target Resource",
        type: "text",
        orderIndex: 0,
        plainText: "some prose about a dragon",
        createdAt: now,
      };
      const other: TextResource = {
        id: OTHER_RESOURCE_ID,
        slug: "other",
        name: "Other Resource",
        type: "text",
        orderIndex: 1,
        plainText: "unrelated prose",
        createdAt: now,
      };
      await indexResource(tmp, resource);
      await indexResource(tmp, other);

      await removeResourceFromIndex(tmp, RESOURCE_ID);
      const afterFirst = await readIndexFile(tmp);

      await expect(
        removeResourceFromIndex(tmp, RESOURCE_ID),
      ).resolves.not.toThrow();
      const afterSecond = await readIndexFile(tmp);

      expect(afterSecond).toEqual(afterFirst);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("removeResourceFromBacklinks is idempotent — a second call throws nothing and leaves backlinks identical", async () => {
    const tmp = await makeTmp("getwrite-purge-backlinks-");
    try {
      await persistBacklinks(tmp, {
        [RESOURCE_ID]: [OTHER_RESOURCE_ID],
        [OTHER_RESOURCE_ID]: [RESOURCE_ID],
      });

      await removeResourceFromBacklinks(tmp, RESOURCE_ID);
      const afterFirst = await loadBacklinks(tmp);

      await expect(
        removeResourceFromBacklinks(tmp, RESOURCE_ID),
      ).resolves.not.toThrow();
      const afterSecond = await loadBacklinks(tmp);

      expect(afterSecond).toEqual(afterFirst);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("removeResourceFromMentionIndex is idempotent — a second call throws nothing and leaves the mention index identical", async () => {
    const tmp = await makeTmp("getwrite-purge-mentions-");
    try {
      await persistMentionIndex(tmp, {
        [RESOURCE_ID]: [
          {
            entityId: ENTITY_ID,
            resourceId: RESOURCE_ID,
            count: 1,
            offsets: [0],
          },
        ],
        [OTHER_RESOURCE_ID]: [
          {
            entityId: ENTITY_ID,
            resourceId: OTHER_RESOURCE_ID,
            count: 1,
            offsets: [5],
          },
        ],
      });

      await removeResourceFromMentionIndex(tmp, RESOURCE_ID);
      const afterFirst = await loadMentionIndex(tmp);

      await expect(
        removeResourceFromMentionIndex(tmp, RESOURCE_ID),
      ).resolves.not.toThrow();
      const afterSecond = await loadMentionIndex(tmp);

      expect(afterSecond).toEqual(afterFirst);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("removeEntityRelationshipsForEntity is idempotent — a second call throws nothing, returns 0, and leaves relationships identical", async () => {
    const tmp = await makeTmp("getwrite-purge-relationships-");
    try {
      await writeProjectConfig(tmp, ["ally"]);

      const { createEntityRelationship, loadEntityRelationships } =
        await import("../../src/lib/models/entity-relationships");
      await createEntityRelationship(tmp, ENTITY_ID, OTHER_ENTITY_ID, "ally");

      const firstCount = await removeEntityRelationshipsForEntity(
        tmp,
        ENTITY_ID,
      );
      expect(firstCount).toBe(1);
      const afterFirst = await loadEntityRelationships(tmp);

      const secondCount = await removeEntityRelationshipsForEntity(
        tmp,
        ENTITY_ID,
      );
      expect(secondCount).toBe(0);
      const afterSecond = await loadEntityRelationships(tmp);

      expect(afterSecond).toEqual(afterFirst);
    } finally {
      await removeDirRetry(tmp);
    }
  });
});

describe("purgeTrashedRevisions (FR-6/FR-18 step 3)", () => {
  it("removes .trash/revisions/<resourceId>/ when present", async () => {
    const tmp = await makeTmp("getwrite-purge-revisions-current-");
    try {
      const trashedDir = path.join(
        tmp,
        ".trash",
        "revisions",
        RESOURCE_ID,
        "v-1",
      );
      await fs.mkdir(trashedDir, { recursive: true });
      await fs.writeFile(
        path.join(trashedDir, "content.bin"),
        "content",
        "utf8",
      );

      await purgeTrashedRevisions(tmp, RESOURCE_ID);

      const stillExists = await fs
        .stat(path.join(tmp, ".trash", "revisions", RESOURCE_ID))
        .then(() => true)
        .catch(() => false);
      expect(stillExists).toBe(false);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("falls back to the legacy revisions/<resourceId>/ path when .trash/revisions/<resourceId>/ is absent (resolved OQ-12)", async () => {
    const tmp = await makeTmp("getwrite-purge-revisions-legacy-");
    try {
      // Simulate a resource soft-deleted before Task 3 existed: revisions
      // were never moved into `.trash/`, so they're still at the legacy
      // top-level `revisions/<resourceId>/` path.
      await writeRevision(tmp, RESOURCE_ID, 1, "legacy content");
      const legacyDir = revisionsBaseDir(tmp, RESOURCE_ID);
      const existedBefore = await fs
        .stat(legacyDir)
        .then(() => true)
        .catch(() => false);
      expect(existedBefore).toBe(true);

      await purgeTrashedRevisions(tmp, RESOURCE_ID);

      const stillExists = await fs
        .stat(legacyDir)
        .then(() => true)
        .catch(() => false);
      expect(stillExists).toBe(false);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("is idempotent — calling twice with nothing present throws nothing", async () => {
    const tmp = await makeTmp("getwrite-purge-revisions-idempotent-");
    try {
      await expect(
        purgeTrashedRevisions(tmp, RESOURCE_ID),
      ).resolves.not.toThrow();
      await expect(
        purgeTrashedRevisions(tmp, RESOURCE_ID),
      ).resolves.not.toThrow();
    } finally {
      await removeDirRetry(tmp);
    }
  });
});
