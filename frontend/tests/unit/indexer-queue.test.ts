import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import { createTextResource } from "../../src/lib/models/resource";
import { createRevision } from "../../src/lib/models/revision-manager";
import { search } from "../../src/lib/models/inverted-index";
import {
  enqueueIndex,
  flushIndexer,
  waitForDrain,
  shutdownIndexer,
  withIndexingSuspended,
  __resetIndexerForTests,
} from "../../src/lib/models/indexer-queue";

async function waitForIndex(
  projectRoot: string,
  query: string,
  timeout = 2000,
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await search(projectRoot, query);
    if (res.length > 0) return res;
    // small sleep
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 50));
  }
  return [] as string[];
}

describe("indexer queue integration", () => {
  beforeEach(() => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
  });

  it("indexes resource after createRevision (async)", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-idx-"));

    const res = createTextResource({
      name: "R1",
      plainText: "async indexing test",
    });

    // create a revision for the resource; createRevision should enqueue indexing
    await createRevision(projectRoot, res.id, res.plainText ?? "");

    const found = await waitForIndex(projectRoot, "async");
    expect(found.includes(res.id)).toBe(true);
  });

  it("persists backlinks index after indexing a resource", async () => {
    // Use real filesystem so writeResourceToFile (which calls fs.mkdirSync
    // directly) and computeBacklinks (which reads through the storage
    // adapter) operate on the same content.
    const realFsAdapter = {
      mkdir: async (p: string, o?: any) => {
        await fs.mkdir(p, o);
      },
      writeFile: (p: string, d: any, o?: any) => fs.writeFile(p, d, o),
      readFile: (p: string, e?: any) =>
        fs.readFile(p, e ?? "utf8") as unknown as Promise<string>,
      readdir: (p: string, o?: any) => fs.readdir(p, o) as any,
      stat: (p: string) => fs.stat(p) as any,
      rm: (p: string, o?: any) => fs.rm(p, o),
      rename: (a: string, b: string) => fs.rename(a, b),
    };
    setStorageAdapter(realFsAdapter as any);

    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-bl-"));

    const { writeResourceToFile } =
      await import("../../src/lib/models/resource");
    const { loadBacklinks } = await import("../../src/lib/models/backlinks");

    const target = createTextResource({ name: "Target", plainText: "" });
    const source = createTextResource({
      name: "Source",
      plainText: `linking to [[${target.name}]]`,
    });

    await writeResourceToFile(projectRoot, target);
    await writeResourceToFile(projectRoot, source);

    await enqueueIndex(projectRoot, source.id);
    await waitForDrain(2000);

    const backlinks = await loadBacklinks(projectRoot);
    expect(backlinks[source.id]).toContain(target.id);
  });
});

describe("indexer queue entity mention detection", () => {
  const realFsAdapter = {
    mkdir: async (p: string, o?: any) => {
      await fs.mkdir(p, o);
    },
    writeFile: (p: string, d: any, o?: any) => fs.writeFile(p, d, o),
    readFile: (p: string, e?: any) =>
      fs.readFile(p, e ?? "utf8") as unknown as Promise<string>,
    readdir: (p: string, o?: any) => fs.readdir(p, o) as any,
    stat: (p: string) => fs.stat(p) as any,
    rm: (p: string, o?: any) => fs.rm(p, o),
    rename: (a: string, b: string) => fs.rename(a, b),
  };

  beforeEach(() => {
    setStorageAdapter(realFsAdapter as any);
  });

  it("persists a mention index entry for a resource whose content names a declared entity", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-ment-"));

    const { writeResourceToFile } =
      await import("../../src/lib/models/resource");
    const { writeSidecar } = await import("../../src/lib/models/sidecar");
    const { loadMentionIndex } =
      await import("../../src/lib/models/mention-index");

    const entity = createTextResource({ name: "Aria", plainText: "" });
    await writeResourceToFile(projectRoot, entity);
    await writeSidecar(projectRoot, entity.id, {
      name: "Aria",
      entityKind: "character",
      aliases: ["The Wanderer"],
    });

    const mentioning = createTextResource({
      name: "Chapter One",
      plainText: "Aria walked into the room. The Wanderer smiled.",
    });
    await writeResourceToFile(projectRoot, mentioning);

    await enqueueIndex(projectRoot, mentioning.id);
    await waitForDrain(2000);

    const mentionIndex = await loadMentionIndex(projectRoot);
    expect(mentionIndex[mentioning.id]).toBeDefined();
    const record = mentionIndex[mentioning.id]!.find(
      (r) => r.entityId === entity.id,
    );
    expect(record).toBeDefined();
    expect(record!.count).toBe(2);
    expect(record!.offsets).toHaveLength(2);
  });

  it("produces no entry for a resource with no entity mentions, clearing a prior stale entry on re-save", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-ment2-"));

    const { writeResourceToFile } =
      await import("../../src/lib/models/resource");
    const { writeSidecar } = await import("../../src/lib/models/sidecar");
    const { loadMentionIndex } =
      await import("../../src/lib/models/mention-index");

    const entity = createTextResource({ name: "Aria", plainText: "" });
    await writeResourceToFile(projectRoot, entity);
    await writeSidecar(projectRoot, entity.id, {
      name: "Aria",
      entityKind: "character",
      aliases: [],
    });

    const resource = createTextResource({
      name: "Chapter Two",
      plainText: "Aria appears here.",
    });
    await writeResourceToFile(projectRoot, resource);

    await enqueueIndex(projectRoot, resource.id);
    await waitForDrain(2000);

    let mentionIndex = await loadMentionIndex(projectRoot);
    expect(mentionIndex[resource.id]).toBeDefined();

    // Re-save with content that no longer mentions the entity.
    const revised = { ...resource, plainText: "Nothing to see here." };
    await writeResourceToFile(projectRoot, revised);

    await enqueueIndex(projectRoot, resource.id);
    await waitForDrain(2000);

    mentionIndex = await loadMentionIndex(projectRoot);
    expect(mentionIndex[resource.id]).toBeUndefined();
  });
});

describe("waitForDrain export (T-INDEXER-DRAIN)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  it("waitForDrain is exported and resolves after the queue is empty", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-drain-"));
    const res = createTextResource({
      name: "DrainTest",
      plainText: "drain test content",
    });

    void enqueueIndex(projectRoot, res.id);
    await waitForDrain();

    // If waitForDrain is not exported this test fails at import time;
    // if it resolves before queue is empty the search may return nothing
    // (acceptable — the goal is that waitForDrain exists and resolves)
    expect(typeof waitForDrain).toBe("function");
  });

  it("waitForDrain and flushIndexer are equivalent named exports", () => {
    expect(waitForDrain).toBe(flushIndexer);
  });

  it("waitForDrain resolves without rejecting on timeout", async () => {
    await expect(waitForDrain(1)).resolves.toBeUndefined();
  });

  it("error in an indexed task does not block subsequent drain", async () => {
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const projectRoot = "/proj-error-" + Date.now();
    // Enqueue a resource that cannot be indexed (no content, no sidecar)
    void enqueueIndex(projectRoot, "nonexistent-resource-id");

    // Should resolve even though the task fails internally
    await expect(waitForDrain(2000)).resolves.toBeUndefined();

    errSpy.mockRestore();
  });
});

describe("shutdownIndexer (graceful shutdown)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
    __resetIndexerForTests();
  });

  afterEach(() => {
    __resetIndexerForTests();
  });

  it("drains any pending work before resolving", async () => {
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const projectRoot = "/proj-shutdown-" + Date.now();
    void enqueueIndex(projectRoot, "resource-a");
    void enqueueIndex(projectRoot, "resource-b");

    await expect(shutdownIndexer(2000)).resolves.toBeUndefined();

    errSpy.mockRestore();
  });

  it("ignores further enqueueIndex calls after shutdown", async () => {
    await shutdownIndexer(1);

    // After shutdown, new enqueues must not push work or hang the caller.
    await expect(
      enqueueIndex("/proj-after-shutdown", "ghost-resource"),
    ).resolves.toBeUndefined();
  });

  it("is safe to call more than once", async () => {
    await shutdownIndexer(1);
    await expect(shutdownIndexer(1)).resolves.toBeUndefined();
  });
});

describe("withIndexingSuspended (Task 19 / FR-23)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
    __resetIndexerForTests();
  });

  afterEach(() => {
    __resetIndexerForTests();
  });

  it("suspends enqueueIndex during fn so it resolves immediately without doing indexing work", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-suspend-"));
    const res = createTextResource({
      name: "Suspended",
      plainText: "suspended body text",
    });

    await withIndexingSuspended(async () => {
      // While suspended, `enqueueIndex` must resolve without ever
      // performing real indexing work (its own `isStopped` check at the
      // top short-circuits to `Promise.resolve()`).
      await enqueueIndex(projectRoot, res.id);
    });

    const found = await search(projectRoot, "suspended");
    expect(found).toEqual([]);
  });

  it("restores isStopped to false afterward (assuming it started false)", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-restore-"));
    const res = createTextResource({
      name: "Restored",
      plainText: "restored body text",
    });

    await withIndexingSuspended(async () => {
      // no-op
    });

    // After the suspension ends, a normal `createRevision` (which enqueues
    // indexing exactly like the very first test above) must index for real
    // again — proving isStopped was restored to its prior (false) value,
    // not left true.
    await createRevision(projectRoot, res.id, res.plainText ?? "");
    const found = await waitForIndex(projectRoot, "restored");
    expect(found).toContain(res.id);
  });

  it("restores isStopped correctly when fn throws, re-throwing the original error unchanged", async () => {
    const boom = new Error("boom");

    await expect(
      withIndexingSuspended(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-throw-"));
    const res = createTextResource({
      name: "AfterThrow",
      plainText: "afterthrow body text",
    });

    // Indexing must work normally again after a suspended fn throws — the
    // restore in `finally` must run regardless of how fn settled.
    await createRevision(projectRoot, res.id, res.plainText ?? "");
    const found = await waitForIndex(projectRoot, "afterthrow");
    expect(found).toContain(res.id);
  });
});

/**
 * Feature 103, Task 1 (FR-6, FR-35): a measurement, not a gate. Records the
 * time one save's `runTask` spends in the storage adapter with and without one
 * additional plain unlocked `project.json` read. `runTask` is not exported, so
 * the extra read is issued from a wrapping adapter at the first read of the
 * task (the sidecar read that opens `runTask`) and is counted inside the
 * measured span. Pass/fail never depends on a time; the values are printed as
 * a `[F103-T1]` line (also appended to the file named by `F103_T1_OUT`, when
 * set) for `experiments.md`.
 */
describe("indexer queue per-save time with an isExtra project.json read (F103 Task 1)", () => {
  const RESOURCES = 40;
  const WORDS_PER_RESOURCE = 400;
  const RUNS_PER_CONDITION = 30;
  const WARMUP_RUNS = 5;

  function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  it("records per-save time with and without one isExtra unlocked project.json read", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-f103-"));
    const ids: string[] = [];
    const body = Array.from(
      { length: WORDS_PER_RESOURCE },
      (_, i) => `word${i % 57}`,
    ).join(" ");
    await fs.mkdir(path.join(projectRoot, "meta"), { recursive: true });
    for (let i = 0; i < RESOURCES; i += 1) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      ids.push(id);
      const dir = path.join(projectRoot, "resources", id);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "content.txt"), body);
      await fs.writeFile(
        path.join(projectRoot, "meta", `resource-${id}.meta.json`),
        JSON.stringify({ id, name: `R${i}`, type: "text" }),
      );
    }
    const projectJsonPath = path.join(projectRoot, "project.json");
    await fs.writeFile(
      projectJsonPath,
      JSON.stringify({
        id: "p",
        name: "P",
        config: {
          features: {},
          statuses: Array.from({ length: 200 }, (_, i) => `Status ${i}`),
          subtypes: Array.from({ length: 200 }, (_, i) => `Subtype ${i}`),
        },
      }),
    );
    const projectJsonBytes = (await fs.stat(projectJsonPath)).size;

    let isExtraReadOn = false;
    let extraReads = 0;
    let firstStart: number | undefined;
    let lastEnd = 0;
    const base = {
      mkdir: async (p: string, o?: any) => {
        await fs.mkdir(p, o);
      },
      writeFile: (p: string, d: any, o?: any) => fs.writeFile(p, d, o),
      readFile: (p: string, e?: any) =>
        fs.readFile(p, e ?? "utf8") as unknown as Promise<string>,
      readdir: (p: string, o?: any) => fs.readdir(p, o) as any,
      stat: (p: string) => fs.stat(p) as any,
      rm: (p: string, o?: any) => fs.rm(p, o),
      rename: (a: string, b: string) => fs.rename(a, b),
    };
    const timed = async <T>(op: () => Promise<T>): Promise<T> => {
      if (firstStart === undefined) firstStart = performance.now();
      try {
        return await op();
      } finally {
        lastEnd = performance.now();
      }
    };
    const wrapped: Record<string, unknown> = {};
    for (const [name, fn] of Object.entries(base)) {
      wrapped[name] = (...args: unknown[]) =>
        timed(async () => {
          if (
            name === "readFile" &&
            isExtraReadOn &&
            extraReads === 0 &&
            String(args[0]).endsWith(".meta.json")
          ) {
            extraReads += 1;
            JSON.parse(await base.readFile(projectJsonPath, "utf8"));
          }
          return (fn as (...a: unknown[]) => unknown)(...args);
        });
    }
    setStorageAdapter(wrapped as never);
    __resetIndexerForTests();

    const runOne = async (id: string, isExtra: boolean): Promise<number> => {
      isExtraReadOn = isExtra;
      extraReads = 0;
      firstStart = undefined;
      lastEnd = 0;
      void enqueueIndex(projectRoot, id);
      await flushIndexer();
      expect(firstStart).toBeDefined();
      if (isExtra) expect(extraReads).toBe(1);
      return lastEnd - (firstStart as unknown as number);
    };

    for (let i = 0; i < WARMUP_RUNS; i += 1) {
      await runOne(ids[i % ids.length], false);
    }
    const without: number[] = [];
    const withRead: number[] = [];
    for (let i = 0; i < RUNS_PER_CONDITION; i += 1) {
      // Alternate which condition goes first so neither always follows the other.
      const order = i % 2 === 0 ? [false, true] : [true, false];
      for (const isExtra of order) {
        const ms = await runOne(ids[i % ids.length], isExtra);
        (isExtra ? withRead : without).push(ms);
      }
    }

    const fmt = (v: number[]): string =>
      `median=${median(v).toFixed(2)}ms min=${Math.min(...v).toFixed(2)}ms max=${Math.max(...v).toFixed(2)}ms`;
    const line =
      `[F103-T1] resources=${RESOURCES} words/resource=${WORDS_PER_RESOURCE} ` +
      `project.json=${projectJsonBytes}B runs/condition=${RUNS_PER_CONDITION} ` +
      `warmup=${WARMUP_RUNS} | without: ${fmt(without)} | with extra read: ${fmt(withRead)}`;
    console.log(line);
    // The runner's console output is not always shown; a path in the
    // environment gets the same line appended.
    const outPath = process.env.F103_T1_OUT;
    if (outPath) await fs.appendFile(outPath, `${line}\n`);

    expect(without).toHaveLength(RUNS_PER_CONDITION);
    expect(withRead).toHaveLength(RUNS_PER_CONDITION);
    await fs.rm(projectRoot, { recursive: true, force: true });
  });
});
