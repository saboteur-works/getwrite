import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadEntityRelationships,
  createEntityRelationship,
  removeEntityRelationship,
} from "../../src/lib/models/entity-relationships";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TARGET_ID = "33333333-3333-4333-8333-333333333333";

async function makeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "getwrite-entity-relationships-"));
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

async function removeDirRetry(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

describe("loadEntityRelationships", () => {
  it("returns [] for a project with no meta/relationships.json yet", async () => {
    const tmp = await makeTmp();
    await writeProjectConfig(tmp, ["ally"]);
    const result = await loadEntityRelationships(tmp);
    expect(result).toEqual([]);
    await removeDirRetry(tmp);
  });

  it("throws when meta/relationships.json exists but fails schema parse", async () => {
    const tmp = await makeTmp();
    await writeProjectConfig(tmp, ["ally"]);
    await fs.mkdir(path.join(tmp, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, "meta", "relationships.json"),
      JSON.stringify([{ id: "not-a-uuid", sourceEntityId: "x" }]),
      "utf8",
    );
    await expect(loadEntityRelationships(tmp)).rejects.toThrow();
    await removeDirRetry(tmp);
  });
});

describe("createEntityRelationship", () => {
  it("round-trips a created edge through loadEntityRelationships with all five fields intact", async () => {
    const tmp = await makeTmp();
    await writeProjectConfig(tmp, ["ally"]);
    const created = await createEntityRelationship(
      tmp,
      SOURCE_ID,
      TARGET_ID,
      "ally",
    );
    expect(created.sourceEntityId).toBe(SOURCE_ID);
    expect(created.targetEntityId).toBe(TARGET_ID);
    expect(created.relationshipType).toBe("ally");
    expect(typeof created.id).toBe("string");
    expect(typeof created.createdAt).toBe("string");

    const loaded = await loadEntityRelationships(tmp);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(created);
    await removeDirRetry(tmp);
  });

  it("throws and persists nothing when sourceEntityId === targetEntityId (FR-4)", async () => {
    const tmp = await makeTmp();
    await writeProjectConfig(tmp, ["ally"]);
    await expect(
      createEntityRelationship(tmp, SOURCE_ID, SOURCE_ID, "ally"),
    ).rejects.toThrow();
    const loaded = await loadEntityRelationships(tmp);
    expect(loaded).toEqual([]);
    await removeDirRetry(tmp);
  });

  it("throws and persists nothing when relationshipType is absent from config.relationshipTypes (FR-15)", async () => {
    const tmp = await makeTmp();
    await writeProjectConfig(tmp, ["ally"]);
    await expect(
      createEntityRelationship(tmp, SOURCE_ID, TARGET_ID, "nemesis"),
    ).rejects.toThrow();
    const loaded = await loadEntityRelationships(tmp);
    expect(loaded).toEqual([]);
    await removeDirRetry(tmp);
  });

  it("is idempotent on the identical (source, target, type) triple (FR-17)", async () => {
    const tmp = await makeTmp();
    await writeProjectConfig(tmp, ["ally"]);
    const first = await createEntityRelationship(
      tmp,
      SOURCE_ID,
      TARGET_ID,
      "ally",
    );
    const second = await createEntityRelationship(
      tmp,
      SOURCE_ID,
      TARGET_ID,
      "ally",
    );
    expect(second).toEqual(first);
    const loaded = await loadEntityRelationships(tmp);
    expect(loaded).toHaveLength(1);
    await removeDirRetry(tmp);
  });

  it("confirms exactly one persisted edge when two concurrently-started creates race on the identical triple", async () => {
    const tmp = await makeTmp();
    await writeProjectConfig(tmp, ["ally"]);

    // Both calls are started before either is awaited — this is what proves
    // the lock spans the check-and-write sequence, not just the write.
    const [a, b] = await Promise.all([
      createEntityRelationship(tmp, SOURCE_ID, TARGET_ID, "ally"),
      createEntityRelationship(tmp, SOURCE_ID, TARGET_ID, "ally"),
    ]);

    expect(a.id).toBe(b.id);
    const loaded = await loadEntityRelationships(tmp);
    expect(loaded).toHaveLength(1);
    await removeDirRetry(tmp);
  });
});

describe("removeEntityRelationship", () => {
  it("removes exactly the matching id, leaving a same-shape edge with a different id untouched (FR-12)", async () => {
    const tmp = await makeTmp();
    await writeProjectConfig(tmp, ["ally", "rival"]);
    const edgeToRemove = await createEntityRelationship(
      tmp,
      SOURCE_ID,
      TARGET_ID,
      "ally",
    );
    const edgeToKeep = await createEntityRelationship(
      tmp,
      SOURCE_ID,
      OTHER_TARGET_ID,
      "ally",
    );

    const didRemove = await removeEntityRelationship(tmp, edgeToRemove.id);
    expect(didRemove).toBe(true);

    const loaded = await loadEntityRelationships(tmp);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(edgeToKeep);
    await removeDirRetry(tmp);
  });

  it("returns false and is a no-op when no edge with that id exists", async () => {
    const tmp = await makeTmp();
    await writeProjectConfig(tmp, ["ally"]);
    const didRemove = await removeEntityRelationship(
      tmp,
      "44444444-4444-4444-8444-444444444444",
    );
    expect(didRemove).toBe(false);
    const loaded = await loadEntityRelationships(tmp);
    expect(loaded).toEqual([]);
    await removeDirRetry(tmp);
  });
});
