/**
 * Unit tests for query-cache.ts — in-memory cache keyed by metadataRevision.
 *
 * Tests are split into:
 *   - Low-level helpers: getCached / setCached / invalidate
 *   - Integration: evaluateCached against a real tmp filesystem project
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  getCached,
  setCached,
  invalidate,
  readRevision,
  evaluateCached,
  clearAllCaches,
} from "../../src/lib/models/query-cache";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

async function makeTmpProject(initialRevision = 0): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-cache-"));
  tmpDirs.push(dir);
  const project = {
    id: generateUUID(),
    name: "cache-test",
    createdAt: new Date().toISOString(),
    config: { editorConfig: {}, metadataRevision: initialRevision },
  };
  await fs.writeFile(
    path.join(dir, "project.json"),
    JSON.stringify(project, null, 2),
    "utf8",
  );
  return dir;
}

async function readStoredRevision(dir: string): Promise<number> {
  const raw = await fs.readFile(path.join(dir, "project.json"), "utf8");
  const p = JSON.parse(raw) as { config?: { metadataRevision?: number } };
  return p.config?.metadataRevision ?? 0;
}

beforeEach(() => {
  clearAllCaches();
});

afterEach(async () => {
  await flushIndexer();
  for (const dir of tmpDirs.splice(0)) {
    await removeDirRetry(dir);
  }
});

// ─── getCached / setCached ────────────────────────────────────────────────────

describe("getCached", () => {
  it("returns null when the cache is empty", () => {
    expect(getCached("/some/root", "query-id-1", 5)).toBeNull();
  });

  it("returns the cached ids when revision matches", () => {
    setCached("/root", "q1", 3, ["id-a", "id-b"]);
    expect(getCached("/root", "q1", 3)).toEqual(["id-a", "id-b"]);
  });

  it("returns null when the stored revision is lower than the current revision", () => {
    setCached("/root", "q1", 2, ["id-x"]);
    expect(getCached("/root", "q1", 3)).toBeNull();
  });

  it("returns null when the stored revision is higher than requested (should not happen but is safe)", () => {
    setCached("/root", "q1", 10, ["id-y"]);
    expect(getCached("/root", "q1", 9)).toBeNull();
  });

  it("isolates cache entries by queryId", () => {
    setCached("/root", "q1", 1, ["a"]);
    setCached("/root", "q2", 1, ["b"]);
    expect(getCached("/root", "q1", 1)).toEqual(["a"]);
    expect(getCached("/root", "q2", 1)).toEqual(["b"]);
  });

  it("isolates cache entries by projectRoot", () => {
    setCached("/root-a", "q1", 1, ["a"]);
    setCached("/root-b", "q1", 1, ["b"]);
    expect(getCached("/root-a", "q1", 1)).toEqual(["a"]);
    expect(getCached("/root-b", "q1", 1)).toEqual(["b"]);
  });
});

// ─── invalidate ──────────────────────────────────────────────────────────────

describe("invalidate", () => {
  it("removes a specific query from the cache when queryId is provided", () => {
    setCached("/root", "q1", 1, ["a"]);
    setCached("/root", "q2", 1, ["b"]);
    invalidate("/root", "q1");
    expect(getCached("/root", "q1", 1)).toBeNull();
    expect(getCached("/root", "q2", 1)).toEqual(["b"]);
  });

  it("removes all queries for a project when queryId is omitted", () => {
    setCached("/root", "q1", 1, ["a"]);
    setCached("/root", "q2", 1, ["b"]);
    invalidate("/root");
    expect(getCached("/root", "q1", 1)).toBeNull();
    expect(getCached("/root", "q2", 1)).toBeNull();
  });

  it("does not affect other projects when invalidating one project", () => {
    setCached("/root-a", "q1", 1, ["a"]);
    setCached("/root-b", "q1", 1, ["b"]);
    invalidate("/root-a");
    expect(getCached("/root-b", "q1", 1)).toEqual(["b"]);
  });

  it("does not throw when invalidating a non-existent project", () => {
    expect(() => invalidate("/nonexistent")).not.toThrow();
  });

  it("does not throw when invalidating a non-existent query", () => {
    setCached("/root", "q1", 1, ["a"]);
    expect(() => invalidate("/root", "q-nonexistent")).not.toThrow();
  });
});

// ─── clearAllCaches ──────────────────────────────────────────────────────────

describe("clearAllCaches", () => {
  it("removes all entries across all projects", () => {
    setCached("/root-a", "q1", 1, ["a"]);
    setCached("/root-b", "q2", 2, ["b"]);
    clearAllCaches();
    expect(getCached("/root-a", "q1", 1)).toBeNull();
    expect(getCached("/root-b", "q2", 2)).toBeNull();
  });
});

// ─── readRevision ─────────────────────────────────────────────────────────────

describe("readRevision", () => {
  it("returns the metadataRevision from project.json", async () => {
    const root = await makeTmpProject(7);
    expect(await readRevision(root)).toBe(7);
  });

  it("returns 0 when project.json has no metadataRevision field", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-cache-"));
    tmpDirs.push(dir);
    const project = {
      id: generateUUID(),
      name: "no-rev",
      createdAt: new Date().toISOString(),
      config: { editorConfig: {} },
    };
    await fs.writeFile(
      path.join(dir, "project.json"),
      JSON.stringify(project, null, 2),
      "utf8",
    );
    expect(await readRevision(dir)).toBe(0);
  });

  it("returns 0 when project.json does not exist", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-cache-"));
    tmpDirs.push(dir);
    expect(await readRevision(dir)).toBe(0);
  });
});

// ─── evaluateCached — integration ────────────────────────────────────────────

describe("evaluateCached", () => {
  it("calls the evaluator on first invocation and returns its result", async () => {
    const root = await makeTmpProject(1);
    let callCount = 0;
    const evaluator = async () => {
      callCount++;
      return ["id-1", "id-2"];
    };
    const result = await evaluateCached(root, "q1", evaluator);
    expect(result).toEqual(["id-1", "id-2"]);
    expect(callCount).toBe(1);
  });

  it("returns cached result on second call without invoking the evaluator again", async () => {
    const root = await makeTmpProject(1);
    let callCount = 0;
    const evaluator = async () => {
      callCount++;
      return ["id-1"];
    };
    await evaluateCached(root, "q1", evaluator);
    const second = await evaluateCached(root, "q1", evaluator);
    expect(second).toEqual(["id-1"]);
    expect(callCount).toBe(1);
  });

  it("re-invokes the evaluator after a sidecar write bumps the revision", async () => {
    const root = await makeTmpProject(0);
    const resourceId = generateUUID();
    let callCount = 0;
    const evaluator = async () => {
      callCount++;
      return ["id-x"];
    };

    // Prime the cache at revision 0.
    await evaluateCached(root, "q1", evaluator);
    expect(callCount).toBe(1);

    // Bump the revision by writing a sidecar.
    await writeSidecar(root, resourceId, { key: "value" });
    await flushIndexer();

    // Revision is now 1 — cache should be stale.
    const newRevision = await readStoredRevision(root);
    expect(newRevision).toBe(1);

    const recomputed = await evaluateCached(root, "q1", evaluator);
    expect(recomputed).toEqual(["id-x"]);
    expect(callCount).toBe(2);
  });

  it("isolates cache entries by queryId within the same project", async () => {
    const root = await makeTmpProject(1);
    let countA = 0;
    let countB = 0;
    await evaluateCached(root, "qA", async () => {
      countA++;
      return ["a"];
    });
    await evaluateCached(root, "qB", async () => {
      countB++;
      return ["b"];
    });
    await evaluateCached(root, "qA", async () => {
      countA++;
      return ["a"];
    });
    await evaluateCached(root, "qB", async () => {
      countB++;
      return ["b"];
    });
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  it("propagates evaluator errors without caching the result", async () => {
    const root = await makeTmpProject(1);
    let callCount = 0;
    const evaluator = async () => {
      callCount++;
      throw new Error("evaluator failed");
    };

    await expect(evaluateCached(root, "q-err", evaluator)).rejects.toThrow(
      "evaluator failed",
    );
    expect(callCount).toBe(1);

    // Next call should retry (not return cached failure).
    await expect(evaluateCached(root, "q-err", evaluator)).rejects.toThrow(
      "evaluator failed",
    );
    expect(callCount).toBe(2);
  });
});
