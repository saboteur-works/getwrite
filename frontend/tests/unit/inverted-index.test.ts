import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import { createTextResource } from "../../src/lib/models/resource";
import { writeSidecar } from "../../src/lib/models/sidecar";
import {
  writeRevision,
  setCanonicalRevision,
} from "../../src/lib/models/revision";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  indexResource,
  search,
  removeResourceFromIndex,
  reindexMissingResources,
} from "../../src/lib/models/inverted-index";

describe("inverted index (T025)", () => {
  beforeEach(() => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
  });

  it("indexes resources and returns results by term frequency", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-idx-"));

    const a = createTextResource({
      name: "A",
      plainText: "apple banana apple",
    });
    const b = createTextResource({ name: "B", plainText: "banana cherry" });
    const c = createTextResource({
      name: "C",
      plainText: "apple cherry apple apple",
    });

    await indexResource(projectRoot, a);
    await indexResource(projectRoot, b);
    await indexResource(projectRoot, c);

    const r1 = await search(projectRoot, "apple");
    // c has 3 apples, a has 2 apples
    expect(r1).toEqual([c.id, a.id]);

    const r2 = await search(projectRoot, "banana");
    expect(r2.sort()).toEqual([a.id, b.id].sort());

    const r3 = await search(projectRoot, "apple banana");
    // AND semantics: only resources with BOTH terms qualify.
    // a has apple(2) + banana(1); c has apple(3) but no banana; b has banana but no apple.
    expect(r3).toEqual([a.id]);
  });

  it("ranks a title match above a body-only match for the same query terms", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-idx-"));

    // res1 is NAMED after the query terms but mentions them nowhere in the body
    const res1 = createTextResource({
      name: "Dragon Knight",
      plainText: "A brief scene.",
    });
    // res2 mentions the query terms in the body but has an unrelated title
    const res2 = createTextResource({
      name: "Battle",
      plainText: "dragon knight battle",
    });

    await indexResource(projectRoot, res1);
    await indexResource(projectRoot, res2);

    const results = await search(projectRoot, "dragon knight");
    expect(results[0]).toBe(res1.id);
  });

  it("filters stop words at index and query time", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-idx-sw-"));

    const res = createTextResource({
      name: "A",
      plainText: "the dragon flies high",
    });
    await indexResource(projectRoot, res);

    // stop word alone returns nothing
    expect(await search(projectRoot, "the")).toEqual([]);

    // multi-term with stop words: AND only requires non-stop terms
    expect(await search(projectRoot, "the dragon")).toEqual([res.id]);
  });

  it("a resource whose text is entirely stop words produces no searchable entries", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-idx-sw-"));

    const res = createTextResource({
      name: "B",
      plainText: "the and or but is are",
    });
    await indexResource(projectRoot, res);

    expect(await search(projectRoot, "the")).toEqual([]);
    expect(await search(projectRoot, "and")).toEqual([]);
  });

  it("preserves existing entries when a second resource is indexed (incremental write)", async () => {
    const projectRoot = "/proj-incremental";
    const a = createTextResource({
      name: "ResourceA",
      plainText: "velvet storm",
    });
    const b = createTextResource({
      name: "ResourceB",
      plainText: "crimson tide",
    });

    await indexResource(projectRoot, a);
    await indexResource(projectRoot, b);

    expect(await search(projectRoot, "velvet")).toContain(a.id);
    expect(await search(projectRoot, "crimson")).toContain(b.id);
  });

  it("recovers gracefully from a corrupt index JSON file", async () => {
    const projectRoot = "/proj-corrupt";
    const adapter = createMemoryAdapter();
    setStorageAdapter(adapter);

    await adapter.mkdir(path.join(projectRoot, "meta/index"), {
      recursive: true,
    });
    await adapter.writeFile(
      path.join(projectRoot, "meta/index/inverted.json"),
      "NOT VALID JSON{{{",
    );

    const res = createTextResource({
      name: "Recovery",
      plainText: "phoenix rising",
    });
    await expect(indexResource(projectRoot, res)).resolves.toBeUndefined();
    expect(await search(projectRoot, "phoenix")).toContain(res.id);
  });

  it("removes resources from index", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-idx-"));
    const a = createTextResource({ name: "A", plainText: "apple banana" });

    await indexResource(projectRoot, a);
    let r = await search(projectRoot, "apple");
    expect(r).toEqual([a.id]);

    await removeResourceFromIndex(projectRoot, a.id);
    r = await search(projectRoot, "apple");
    expect(r).toEqual([]);
  });
});

// These tests use real temp dirs (no memory adapter) because reindexMissingResources
// reads sidecar files via Node's fs, which bypasses the io adapter.
describe("reindexMissingResources", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  async function makeTmpProject(): Promise<string> {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-reindex-"));
    tmpDirs.push(projectRoot);
    return projectRoot;
  }

  it("returns 0 when all resources are already indexed", async () => {
    const projectRoot = await makeTmpProject();
    const resourceId = generateUUID();

    await writeSidecar(projectRoot, resourceId, {
      id: resourceId,
      name: "Already Indexed",
      type: "text",
    });
    await writeRevision(projectRoot, resourceId, 1, "already indexed content", {
      isCanonical: true,
    });
    await setCanonicalRevision(projectRoot, resourceId, 1);

    // Index it manually
    await indexResource(projectRoot, {
      id: resourceId,
      name: "Already Indexed",
      type: "text",
      slug: resourceId,
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      plainText: "already indexed content",
    });

    const queued = await reindexMissingResources(projectRoot);
    expect(queued).toBe(0);
  });

  it("enqueues resources missing from the index and makes them searchable", async () => {
    const projectRoot = await makeTmpProject();
    const resourceId = generateUUID();

    await writeSidecar(projectRoot, resourceId, {
      id: resourceId,
      name: "Unindexed Chapter",
      type: "text",
    });
    await writeRevision(projectRoot, resourceId, 1, "midnight cathedral", {
      isCanonical: true,
    });
    await setCanonicalRevision(projectRoot, resourceId, 1);

    // Confirm not in index yet
    expect(await search(projectRoot, "midnight")).toEqual([]);

    const queued = await reindexMissingResources(projectRoot);
    expect(queued).toBe(1);

    await flushIndexer(5000);

    expect(await search(projectRoot, "midnight")).toContain(resourceId);
  });

  it("uses atomic write — no .tmp file left after indexing", async () => {
    const projectRoot = await makeTmpProject();
    const resourceId = generateUUID();

    await writeSidecar(projectRoot, resourceId, {
      id: resourceId,
      name: "AtomicCheck",
      type: "text",
    });
    await writeRevision(projectRoot, resourceId, 1, "aurora borealis", {
      isCanonical: true,
    });
    await setCanonicalRevision(projectRoot, resourceId, 1);

    await indexResource(projectRoot, {
      id: resourceId,
      name: "AtomicCheck",
      type: "text",
      slug: resourceId,
      orderIndex: 0,
      createdAt: new Date().toISOString(),
      plainText: "aurora borealis",
    });

    const tmpPath = path.join(
      projectRoot,
      "meta",
      "index",
      "inverted.json.tmp",
    );
    await expect(fs.readFile(tmpPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not enqueue already-indexed resources on a second call", async () => {
    const projectRoot = await makeTmpProject();
    const resourceId = generateUUID();

    await writeSidecar(projectRoot, resourceId, {
      id: resourceId,
      name: "Chapter",
      type: "text",
    });
    await writeRevision(projectRoot, resourceId, 1, "starlight river", {
      isCanonical: true,
    });
    await setCanonicalRevision(projectRoot, resourceId, 1);

    const first = await reindexMissingResources(projectRoot);
    expect(first).toBe(1);
    await flushIndexer(5000);

    // Second call — resource is now indexed
    const second = await reindexMissingResources(projectRoot);
    expect(second).toBe(0);
  });
});
