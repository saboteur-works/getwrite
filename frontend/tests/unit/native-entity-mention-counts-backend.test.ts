// entity-roster Task 4: proves the native entity-mention-counts transport
// reuses the shared mentions core (`lib/models/mentions-core.ts`'s
// `getProjectMentionCounts`) over a `capacitorFsAdapter`, with no HTTP at
// all — the mention-counts analogue of
// `native-entity-alias-table-backend.test.ts`.
import { describe, expect, it } from "vitest";
import path from "node:path";
import { generateUUID } from "../../src/lib/models/uuid";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import type { MentionIndex } from "../../src/lib/models/mention-index";
import { createNativeEntityMentionCountsTransport } from "../../src/store/transport/native-entity-mention-counts-backend";

const PROJECTS_DIR = "/projects";

async function seedMentionIndex(
  fs: ReturnType<typeof createFakeCapacitorFilesystem>,
  projectId: string,
  index: MentionIndex,
): Promise<void> {
  const adapter = capacitorFsAdapter(fs);
  const indexDir = path.join(PROJECTS_DIR, projectId, "meta", "index");
  await adapter.mkdir(indexDir, { recursive: true });
  await adapter.writeFile(
    path.join(indexDir, "mentions.json"),
    JSON.stringify(index, null, 2),
  );
}

/**
 * Fails the test if `fetch` is called — proves the native path never hits
 * HTTP, mirroring `native-entity-alias-table-backend.test.ts`'s guard.
 */
function guardAgainstFetch(): { restore: () => void } {
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("fetch must not be called in-process");
  }) as unknown as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("native entity-mention-counts transport — in-process backend reuses the shared mentions core", () => {
  it("resolves per-entity mention counts for a project with a built mention index, with no HTTP", async () => {
    const fetchMock = guardAgainstFetch();
    const fs = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    const ariaId = generateUUID();
    const brannId = generateUUID();
    const resourceOne = generateUUID();
    const resourceTwo = generateUUID();

    await seedMentionIndex(fs, projectId, {
      [resourceOne]: [
        {
          entityId: ariaId,
          resourceId: resourceOne,
          count: 2,
          offsets: [0, 10],
        },
        { entityId: brannId, resourceId: resourceOne, count: 1, offsets: [20] },
      ],
      [resourceTwo]: [
        { entityId: ariaId, resourceId: resourceTwo, count: 1, offsets: [5] },
      ],
    });

    const transport = createNativeEntityMentionCountsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    const counts = await transport.getEntityMentionCounts(projectId);
    expect(counts).toEqual({ [ariaId]: 2, [brannId]: 1 });

    fetchMock.restore();
  });

  it("resolves the same shape as the HTTP transport (an empty object) for a project with no mention index yet", async () => {
    const fs = createFakeCapacitorFilesystem();
    const adapter = capacitorFsAdapter(fs);
    const projectId = generateUUID();
    await adapter.mkdir(path.join(PROJECTS_DIR, projectId), {
      recursive: true,
    });

    const transport = createNativeEntityMentionCountsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(transport.getEntityMentionCounts(projectId)).resolves.toEqual(
      {},
    );
  });

  it("degrades gracefully to the empty counts map on an invalid projectId, matching the HTTP transport's degrade-on-failure contract", async () => {
    const fs = createFakeCapacitorFilesystem();
    const transport = createNativeEntityMentionCountsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(
      transport.getEntityMentionCounts("not-a-uuid"),
    ).resolves.toEqual({});
  });
});
