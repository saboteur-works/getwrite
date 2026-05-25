import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  listQueries,
  readQuery,
  writeQuery,
  deleteQuery,
  SavedQuerySchema,
  type SavedQuery,
} from "../../src/lib/models/saved-queries";
import { removeDirRetry } from "./helpers/fs-utils";

const SAMPLE_AST = { op: "eq" as const, field: "status", value: "draft" };

const SAMPLE_QUERY: SavedQuery = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Draft scenes",
  definition: SAMPLE_AST,
  view: { kind: "table" },
};

async function makeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "getwrite-saved-queries-"));
}

// ─── Schema validation ────────────────────────────────────────────────────────

describe("SavedQuerySchema", () => {
  it("accepts a minimal valid query (no view)", () => {
    const result = SavedQuerySchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "My query",
      definition: SAMPLE_AST,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a query with a view", () => {
    const result = SavedQuerySchema.safeParse(SAMPLE_QUERY);
    expect(result.success).toBe(true);
  });

  it("accepts a complex AST as definition", () => {
    const result = SavedQuerySchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Complex query",
      definition: {
        op: "and",
        children: [SAMPLE_AST, { op: "exists", field: "synopsis" }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID id", () => {
    const result = SavedQuerySchema.safeParse({
      ...SAMPLE_QUERY,
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = SavedQuerySchema.safeParse({ ...SAMPLE_QUERY, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing definition", () => {
    const { definition: _, ...rest } = SAMPLE_QUERY;
    const result = SavedQuerySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid AST as definition", () => {
    const result = SavedQuerySchema.safeParse({
      ...SAMPLE_QUERY,
      definition: { op: "unknown-op", field: "x" },
    });
    expect(result.success).toBe(false);
  });
});

// ─── listQueries ─────────────────────────────────────────────────────────────

describe("listQueries", () => {
  it("returns an empty array when meta/queries/ does not exist", async () => {
    const tmp = await makeTmp();
    expect(await listQueries(tmp)).toEqual([]);
    await removeDirRetry(tmp);
  });

  it("returns an empty array when meta/queries/ is empty", async () => {
    const tmp = await makeTmp();
    await fs.mkdir(path.join(tmp, "meta", "queries"), { recursive: true });
    expect(await listQueries(tmp)).toEqual([]);
    await removeDirRetry(tmp);
  });

  it("returns all written queries", async () => {
    const tmp = await makeTmp();
    const q1: SavedQuery = {
      ...SAMPLE_QUERY,
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Q1",
    };
    const q2: SavedQuery = {
      ...SAMPLE_QUERY,
      id: "550e8400-e29b-41d4-a716-446655440002",
      name: "Q2",
    };
    await writeQuery(tmp, q1);
    await writeQuery(tmp, q2);
    const listed = await listQueries(tmp);
    const ids = listed.map((q) => q.id).sort();
    expect(ids).toEqual([q1.id, q2.id].sort());
    await removeDirRetry(tmp);
  });

  it("ignores files that do not end in .query.json", async () => {
    const tmp = await makeTmp();
    await fs.mkdir(path.join(tmp, "meta", "queries"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, "meta", "queries", "stray.json"),
      "{}",
      "utf8",
    );
    expect(await listQueries(tmp)).toEqual([]);
    await removeDirRetry(tmp);
  });
});

// ─── readQuery ───────────────────────────────────────────────────────────────

describe("readQuery", () => {
  it("returns null when the file does not exist", async () => {
    const tmp = await makeTmp();
    expect(
      await readQuery(tmp, "550e8400-e29b-41d4-a716-446655440000"),
    ).toBeNull();
    await removeDirRetry(tmp);
  });

  it("reads a query that was previously written", async () => {
    const tmp = await makeTmp();
    await writeQuery(tmp, SAMPLE_QUERY);
    const result = await readQuery(tmp, SAMPLE_QUERY.id);
    expect(result).toEqual(SAMPLE_QUERY);
    await removeDirRetry(tmp);
  });

  it("throws when the file contains malformed JSON", async () => {
    const tmp = await makeTmp();
    await fs.mkdir(path.join(tmp, "meta", "queries"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, "meta", "queries", `${SAMPLE_QUERY.id}.query.json`),
      "{ not json",
      "utf8",
    );
    await expect(readQuery(tmp, SAMPLE_QUERY.id)).rejects.toThrow();
    await removeDirRetry(tmp);
  });

  it("throws when the file does not conform to SavedQuerySchema", async () => {
    const tmp = await makeTmp();
    await fs.mkdir(path.join(tmp, "meta", "queries"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, "meta", "queries", `${SAMPLE_QUERY.id}.query.json`),
      JSON.stringify({ id: SAMPLE_QUERY.id, name: "" }),
      "utf8",
    );
    await expect(readQuery(tmp, SAMPLE_QUERY.id)).rejects.toThrow();
    await removeDirRetry(tmp);
  });
});

// ─── writeQuery ──────────────────────────────────────────────────────────────

describe("writeQuery", () => {
  it("creates meta/queries/ directory if it does not exist", async () => {
    const tmp = await makeTmp();
    await writeQuery(tmp, SAMPLE_QUERY);
    const stat = await fs.stat(path.join(tmp, "meta", "queries"));
    expect(stat.isDirectory()).toBe(true);
    await removeDirRetry(tmp);
  });

  it("writes a valid query file", async () => {
    const tmp = await makeTmp();
    await writeQuery(tmp, SAMPLE_QUERY);
    const raw = await fs.readFile(
      path.join(tmp, "meta", "queries", `${SAMPLE_QUERY.id}.query.json`),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(SAMPLE_QUERY);
    await removeDirRetry(tmp);
  });

  it("overwrites an existing query with the same id (upsert)", async () => {
    const tmp = await makeTmp();
    await writeQuery(tmp, SAMPLE_QUERY);
    const updated: SavedQuery = { ...SAMPLE_QUERY, name: "Updated name" };
    await writeQuery(tmp, updated);
    const result = await readQuery(tmp, SAMPLE_QUERY.id);
    expect(result?.name).toBe("Updated name");
    await removeDirRetry(tmp);
  });

  it("rejects an invalid query before writing", async () => {
    const tmp = await makeTmp();
    const bad = { ...SAMPLE_QUERY, id: "not-a-uuid" } as unknown as SavedQuery;
    await expect(writeQuery(tmp, bad)).rejects.toThrow();
    await removeDirRetry(tmp);
  });

  it("serializes concurrent writes sequentially (no interleaving)", async () => {
    const tmp = await makeTmp();
    const writes = Array.from({ length: 5 }, (_, i) => {
      const q: SavedQuery = {
        id: `550e8400-e29b-41d4-a716-44665544000${i}`,
        name: `Query ${i}`,
        definition: SAMPLE_AST,
      };
      return writeQuery(tmp, q);
    });
    await expect(Promise.all(writes)).resolves.toBeDefined();
    const listed = await listQueries(tmp);
    expect(listed).toHaveLength(5);
    await removeDirRetry(tmp);
  });
});

// ─── deleteQuery ─────────────────────────────────────────────────────────────

describe("deleteQuery", () => {
  it("returns false when the query does not exist", async () => {
    const tmp = await makeTmp();
    const result = await deleteQuery(tmp, SAMPLE_QUERY.id);
    expect(result).toBe(false);
    await removeDirRetry(tmp);
  });

  it("returns true and removes the file when the query exists", async () => {
    const tmp = await makeTmp();
    await writeQuery(tmp, SAMPLE_QUERY);
    const result = await deleteQuery(tmp, SAMPLE_QUERY.id);
    expect(result).toBe(true);
    expect(await readQuery(tmp, SAMPLE_QUERY.id)).toBeNull();
    await removeDirRetry(tmp);
  });

  it("is idempotent — second delete returns false", async () => {
    const tmp = await makeTmp();
    await writeQuery(tmp, SAMPLE_QUERY);
    await deleteQuery(tmp, SAMPLE_QUERY.id);
    const second = await deleteQuery(tmp, SAMPLE_QUERY.id);
    expect(second).toBe(false);
    await removeDirRetry(tmp);
  });
});
