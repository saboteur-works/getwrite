import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadEntityGraphKindStyles,
  upsertEntityGraphKindStyle,
  EntityGraphKindStyleRecordSchema,
} from "../../src/lib/models/entity-graph-kind-styles";

async function makeTmp(): Promise<string> {
  return fs.mkdtemp(
    path.join(os.tmpdir(), "getwrite-entity-graph-kind-styles-"),
  );
}

async function removeDirRetry(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

describe("loadEntityGraphKindStyles", () => {
  it("returns [] for a project with no meta/entity-graph-kind-styles.json yet", async () => {
    const tmp = await makeTmp();
    const result = await loadEntityGraphKindStyles(tmp);
    expect(result).toEqual([]);
    await removeDirRetry(tmp);
  });

  it("throws when meta/entity-graph-kind-styles.json exists but fails schema parse", async () => {
    const tmp = await makeTmp();
    await fs.mkdir(path.join(tmp, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, "meta", "entity-graph-kind-styles.json"),
      JSON.stringify([{ entityKind: "character" }]),
      "utf8",
    );
    await expect(loadEntityGraphKindStyles(tmp)).rejects.toThrow();
    await removeDirRetry(tmp);
  });

  it("throws when the file is not valid JSON at all", async () => {
    const tmp = await makeTmp();
    await fs.mkdir(path.join(tmp, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, "meta", "entity-graph-kind-styles.json"),
      "{ not json",
      "utf8",
    );
    await expect(loadEntityGraphKindStyles(tmp)).rejects.toThrow();
    await removeDirRetry(tmp);
  });
});

describe("upsertEntityGraphKindStyle", () => {
  it("round-trips a saved style through loadEntityGraphKindStyles", async () => {
    const tmp = await makeTmp();
    const saved = await upsertEntityGraphKindStyle(
      tmp,
      "character",
      "entity-kind-0",
      "circle",
    );
    expect(saved).toEqual({
      entityKind: "character",
      color: "entity-kind-0",
      shape: "circle",
    });

    const loaded = await loadEntityGraphKindStyles(tmp);
    expect(loaded).toEqual([saved]);
    await removeDirRetry(tmp);
  });

  it("upserts: a second save for the same entityKind replaces the first rather than appending", async () => {
    const tmp = await makeTmp();
    await upsertEntityGraphKindStyle(
      tmp,
      "character",
      "entity-kind-0",
      "circle",
    );
    const second = await upsertEntityGraphKindStyle(
      tmp,
      "character",
      "entity-kind-3",
      "star",
    );

    const loaded = await loadEntityGraphKindStyles(tmp);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(second);
    await removeDirRetry(tmp);
  });

  it("leaves a different entityKind's record untouched when upserting", async () => {
    const tmp = await makeTmp();
    const place = await upsertEntityGraphKindStyle(
      tmp,
      "place",
      "entity-kind-1",
      "square",
    );
    await upsertEntityGraphKindStyle(
      tmp,
      "character",
      "entity-kind-0",
      "circle",
    );

    const loaded = await loadEntityGraphKindStyles(tmp);
    expect(loaded).toHaveLength(2);
    expect(loaded.find((r) => r.entityKind === "place")).toEqual(place);
    await removeDirRetry(tmp);
  });
});

describe("EntityGraphKindStyleRecordSchema", () => {
  it("rejects a hex-shaped color string", () => {
    const result = EntityGraphKindStyleRecordSchema.safeParse({
      entityKind: "character",
      color: "#3a6ea8",
      shape: "circle",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a short hex-shaped color string", () => {
    const result = EntityGraphKindStyleRecordSchema.safeParse({
      entityKind: "character",
      color: "#abc",
      shape: "circle",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a known token-slot reference", () => {
    const result = EntityGraphKindStyleRecordSchema.safeParse({
      entityKind: "character",
      color: "entity-kind-7",
      shape: "hexagon",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a shape outside the fixed six-shape set", () => {
    const result = EntityGraphKindStyleRecordSchema.safeParse({
      entityKind: "character",
      color: "entity-kind-0",
      shape: "octagon",
    });
    expect(result.success).toBe(false);
  });
});
