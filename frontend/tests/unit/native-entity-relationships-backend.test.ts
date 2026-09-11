// entity-relationships Task 5: proves the native entity-relationships
// transport reuses the shared model layer
// (`lib/models/entity-relationships.ts`'s `loadEntityRelationships` /
// `createEntityRelationship` / `removeEntityRelationship`) over a
// `capacitorFsAdapter`, with no HTTP at all — the relationships analogue of
// `native-entity-cooccurrence-backend.test.ts`.
import { describe, expect, it } from "vitest";
import path from "node:path";
import { generateUUID } from "../../src/lib/models/uuid";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { createNativeEntityRelationshipsTransport } from "../../src/store/transport/native-entity-relationships-backend";

const PROJECTS_DIR = "/projects";

async function seedProjectConfig(
  fs: ReturnType<typeof createFakeCapacitorFilesystem>,
  projectId: string,
  relationshipTypes: string[],
): Promise<void> {
  const adapter = capacitorFsAdapter(fs);
  const projectDir = path.join(PROJECTS_DIR, projectId);
  await adapter.mkdir(projectDir, { recursive: true });
  await adapter.writeFile(
    path.join(projectDir, "project.json"),
    JSON.stringify({ config: { relationshipTypes } }, null, 2),
  );
}

/**
 * Fails the test if `fetch` is called — proves the native path never hits
 * HTTP, mirroring `native-entity-cooccurrence-backend.test.ts`'s guard.
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

describe("native entity-relationships transport — in-process backend reuses the shared model layer", () => {
  it("creates, lists, and removes an edge with no HTTP", async () => {
    const fetchMock = guardAgainstFetch();
    const fs = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    const sourceId = generateUUID();
    const targetId = generateUUID();

    await seedProjectConfig(fs, projectId, ["ally"]);

    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    const created = await transport.create(
      projectId,
      sourceId,
      targetId,
      "ally",
    );
    expect(created).not.toBeNull();
    expect(created?.sourceEntityId).toBe(sourceId);
    expect(created?.targetEntityId).toBe(targetId);
    expect(created?.relationshipType).toBe("ally");

    const listed = await transport.list(projectId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(created);

    const didRemove = await transport.remove(projectId, created!.id);
    expect(didRemove).toBe(true);

    const afterRemove = await transport.list(projectId);
    expect(afterRemove).toEqual([]);

    fetchMock.restore();
  });

  it("resolves the same shape as the HTTP transport ([]) for a project with no relationships.json yet", async () => {
    const fs = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    await seedProjectConfig(fs, projectId, ["ally"]);

    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(transport.list(projectId)).resolves.toEqual([]);
  });

  it("degrades to null on create when sourceEntityId === targetEntityId (FR-4), matching the HTTP transport's degrade-on-failure contract", async () => {
    const fs = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    const entityId = generateUUID();
    await seedProjectConfig(fs, projectId, ["ally"]);

    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(
      transport.create(projectId, entityId, entityId, "ally"),
    ).resolves.toBeNull();
    await expect(transport.list(projectId)).resolves.toEqual([]);
  });

  it("degrades to null on create when relationshipType is not in the project's configured list (FR-15)", async () => {
    const fs = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    const sourceId = generateUUID();
    const targetId = generateUUID();
    await seedProjectConfig(fs, projectId, ["ally"]);

    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(
      transport.create(projectId, sourceId, targetId, "not-a-real-type"),
    ).resolves.toBeNull();
    await expect(transport.list(projectId)).resolves.toEqual([]);
  });

  it("is idempotent on the (source, target, type) triple (FR-17)", async () => {
    const fs = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    const sourceId = generateUUID();
    const targetId = generateUUID();
    await seedProjectConfig(fs, projectId, ["ally"]);

    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    const first = await transport.create(projectId, sourceId, targetId, "ally");
    const second = await transport.create(
      projectId,
      sourceId,
      targetId,
      "ally",
    );
    expect(second).toEqual(first);

    const listed = await transport.list(projectId);
    expect(listed).toHaveLength(1);
  });

  it("degrades gracefully on an invalid projectId across list/create/remove, matching the HTTP transport's degrade-on-failure contract", async () => {
    const fs = createFakeCapacitorFilesystem();
    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(transport.list("not-a-uuid")).resolves.toEqual([]);
    await expect(
      transport.create("not-a-uuid", generateUUID(), generateUUID(), "ally"),
    ).resolves.toBeNull();
    await expect(transport.remove("not-a-uuid", generateUUID())).resolves.toBe(
      false,
    );
    await expect(
      transport.removeByEntity("not-a-uuid", generateUUID()),
    ).resolves.toBe(0);
  });

  it("removeByEntity removes every edge referencing the entity on either side, matching Task 1's model function", async () => {
    const fs = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    const entityA = generateUUID();
    const entityB = generateUUID();
    const entityC = generateUUID();
    await seedProjectConfig(fs, projectId, ["ally", "rival"]);

    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await transport.create(projectId, entityA, entityB, "ally");
    await transport.create(projectId, entityB, entityA, "rival");
    await transport.create(projectId, entityB, entityC, "ally");

    const removedCount = await transport.removeByEntity(projectId, entityA);
    expect(removedCount).toBe(2);

    const remaining = await transport.list(projectId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sourceEntityId).toBe(entityB);
    expect(remaining[0].targetEntityId).toBe(entityC);
  });

  it("listOrThrow (FR-26) resolves the same edges list() would on success", async () => {
    const fs = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    const sourceId = generateUUID();
    const targetId = generateUUID();
    await seedProjectConfig(fs, projectId, ["ally"]);

    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await transport.create(projectId, sourceId, targetId, "ally");

    await expect(transport.listOrThrow(projectId)).resolves.toHaveLength(1);
  });

  it("listOrThrow (FR-26) REJECTS rather than degrading to [] when the underlying storage load throws (corrupt relationships.json)", async () => {
    const fs = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    await seedProjectConfig(fs, projectId, ["ally"]);
    const adapter = capacitorFsAdapter(fs);
    const metaDir = path.join(PROJECTS_DIR, projectId, "meta");
    await adapter.mkdir(metaDir, { recursive: true });
    await adapter.writeFile(
      path.join(metaDir, "relationships.json"),
      "not valid json",
    );

    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(transport.listOrThrow(projectId)).rejects.toThrow();
    // list() itself still degrades to [] under the identical failure.
    await expect(transport.list(projectId)).resolves.toEqual([]);
  });

  it("listOrThrow (FR-26) REJECTS rather than degrading to [] on an invalid projectId", async () => {
    const fs = createFakeCapacitorFilesystem();
    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    // An invalid projectId can never resolve to a project root, so
    // `resolveProjectRoot` throws inside `listOrThrow` instead of the
    // graceful-degrade `null` check `list` performs.
    await expect(transport.listOrThrow("not-a-uuid")).rejects.toThrow();
  });

  it("listOrThrow (FR-26) does not change list()'s own degrade-to-[] behavior on an invalid projectId", async () => {
    const fs = createFakeCapacitorFilesystem();
    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(transport.list("not-a-uuid")).resolves.toEqual([]);
  });

  it("removeByEntity resolves 0 when no edge references the entity", async () => {
    const fs = createFakeCapacitorFilesystem();
    const projectId = generateUUID();
    const entityA = generateUUID();
    const entityB = generateUUID();
    await seedProjectConfig(fs, projectId, ["ally"]);

    const transport = createNativeEntityRelationshipsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await transport.create(projectId, entityA, entityB, "ally");

    const removedCount = await transport.removeByEntity(
      projectId,
      generateUUID(),
    );
    expect(removedCount).toBe(0);

    const remaining = await transport.list(projectId);
    expect(remaining).toHaveLength(1);
  });
});
