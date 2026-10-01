import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadEntityGraphPositions,
  saveEntityGraphPosition,
  isPositionInvalidated,
  removeEntityGraphPositionForEntity,
  type EntityGraphPositionRecord,
} from "../../src/lib/models/entity-graph-positions";

const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ENTITY_ID = "22222222-2222-4222-8222-222222222222";

async function makeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "getwrite-entity-graph-positions-"));
}

async function removeDirRetry(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

describe("loadEntityGraphPositions", () => {
  it("returns [] for a project with no meta/entity-graph-positions.json yet", async () => {
    const tmp = await makeTmp();
    const result = await loadEntityGraphPositions(tmp);
    expect(result).toEqual([]);
    await removeDirRetry(tmp);
  });

  it("throws when meta/entity-graph-positions.json exists but fails schema parse", async () => {
    const tmp = await makeTmp();
    await fs.mkdir(path.join(tmp, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, "meta", "entity-graph-positions.json"),
      JSON.stringify([{ entityId: "x" }]),
      "utf8",
    );
    await expect(loadEntityGraphPositions(tmp)).rejects.toThrow();
    await removeDirRetry(tmp);
  });
});

describe("saveEntityGraphPosition", () => {
  it("round-trips a saved position through loadEntityGraphPositions with all five fields intact", async () => {
    const tmp = await makeTmp();
    const saved = await saveEntityGraphPosition(tmp, ENTITY_ID, 10, 20, [
      "authored",
      "cooccurrence",
    ]);
    expect(saved.entityId).toBe(ENTITY_ID);
    expect(saved.x).toBe(10);
    expect(saved.y).toBe(20);
    expect(saved.connectionTypesSnapshot).toEqual(["authored", "cooccurrence"]);
    expect(typeof saved.savedAt).toBe("string");

    const loaded = await loadEntityGraphPositions(tmp);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(saved);
    await removeDirRetry(tmp);
  });

  it("upserts: a second save for the same entityId replaces the first rather than appending", async () => {
    const tmp = await makeTmp();
    await saveEntityGraphPosition(tmp, ENTITY_ID, 1, 1, ["authored"]);
    const second = await saveEntityGraphPosition(tmp, ENTITY_ID, 5, 5, [
      "authored",
    ]);

    const loaded = await loadEntityGraphPositions(tmp);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(second);
    await removeDirRetry(tmp);
  });

  it("leaves a different entity's record untouched when upserting", async () => {
    const tmp = await makeTmp();
    const other = await saveEntityGraphPosition(tmp, OTHER_ENTITY_ID, 3, 4, [
      "authored",
    ]);
    await saveEntityGraphPosition(tmp, ENTITY_ID, 1, 1, ["authored"]);
    await saveEntityGraphPosition(tmp, ENTITY_ID, 2, 2, ["authored"]);

    const loaded = await loadEntityGraphPositions(tmp);
    expect(loaded).toHaveLength(2);
    expect(loaded.find((r) => r.entityId === OTHER_ENTITY_ID)).toEqual(other);
    await removeDirRetry(tmp);
  });

  it("completes correctly with no interleaved/corrupted write when racing concurrent saves for different entities", async () => {
    const tmp = await makeTmp();

    const [a, b] = await Promise.all([
      saveEntityGraphPosition(tmp, ENTITY_ID, 1, 1, ["authored"]),
      saveEntityGraphPosition(tmp, OTHER_ENTITY_ID, 2, 2, ["authored"]),
    ]);

    const loaded = await loadEntityGraphPositions(tmp);
    expect(loaded).toHaveLength(2);
    expect(loaded.find((r) => r.entityId === ENTITY_ID)).toEqual(a);
    expect(loaded.find((r) => r.entityId === OTHER_ENTITY_ID)).toEqual(b);
    await removeDirRetry(tmp);
  });
});

describe("removeEntityGraphPositionForEntity", () => {
  it("removes an entity's saved position, leaving no surviving record", async () => {
    const tmp = await makeTmp();
    await saveEntityGraphPosition(tmp, ENTITY_ID, 10, 20, ["authored"]);

    await removeEntityGraphPositionForEntity(tmp, ENTITY_ID);

    const loaded = await loadEntityGraphPositions(tmp);
    expect(loaded.find((r) => r.entityId === ENTITY_ID)).toBeUndefined();
    expect(loaded).toEqual([]);
    await removeDirRetry(tmp);
  });

  it("leaves a different entity's record untouched", async () => {
    const tmp = await makeTmp();
    const other = await saveEntityGraphPosition(tmp, OTHER_ENTITY_ID, 3, 4, [
      "authored",
    ]);
    await saveEntityGraphPosition(tmp, ENTITY_ID, 1, 1, ["authored"]);

    await removeEntityGraphPositionForEntity(tmp, ENTITY_ID);

    const loaded = await loadEntityGraphPositions(tmp);
    expect(loaded).toEqual([other]);
    await removeDirRetry(tmp);
  });

  it("is a no-op, not an error, when no file exists yet", async () => {
    const tmp = await makeTmp();
    await expect(
      removeEntityGraphPositionForEntity(tmp, ENTITY_ID),
    ).resolves.toBeUndefined();
    const loaded = await loadEntityGraphPositions(tmp);
    expect(loaded).toEqual([]);
    await removeDirRetry(tmp);
  });

  it("is a no-op when the file exists but names no matching entityId", async () => {
    const tmp = await makeTmp();
    const other = await saveEntityGraphPosition(tmp, OTHER_ENTITY_ID, 3, 4, [
      "authored",
    ]);

    await removeEntityGraphPositionForEntity(tmp, ENTITY_ID);

    const loaded = await loadEntityGraphPositions(tmp);
    expect(loaded).toEqual([other]);
    await removeDirRetry(tmp);
  });
});

describe("isPositionInvalidated", () => {
  function makeRecord(
    connectionTypesSnapshot: string[],
  ): EntityGraphPositionRecord {
    return {
      entityId: ENTITY_ID,
      x: 0,
      y: 0,
      connectionTypesSnapshot,
      savedAt: new Date().toISOString(),
    };
  }

  it("returns false for a mere reordering of the same active types", () => {
    const record = makeRecord(["authored", "cooccurrence", "backlinks"]);
    expect(
      isPositionInvalidated(record, ["backlinks", "authored", "cooccurrence"]),
    ).toBe(false);
  });

  it("returns false when the active set is identical and in the same order", () => {
    const record = makeRecord(["authored", "cooccurrence"]);
    expect(isPositionInvalidated(record, ["authored", "cooccurrence"])).toBe(
      false,
    );
  });

  it("returns true when a type was added to the active set", () => {
    const record = makeRecord(["authored"]);
    expect(isPositionInvalidated(record, ["authored", "cooccurrence"])).toBe(
      true,
    );
  });

  it("returns true when a type was removed from the active set", () => {
    const record = makeRecord(["authored", "cooccurrence"]);
    expect(isPositionInvalidated(record, ["authored"])).toBe(true);
  });

  it("returns true when the active set is disjoint from the snapshot", () => {
    const record = makeRecord(["authored"]);
    expect(isPositionInvalidated(record, ["backlinks"])).toBe(true);
  });

  it("returns false for two empty sets", () => {
    const record = makeRecord([]);
    expect(isPositionInvalidated(record, [])).toBe(false);
  });
});
