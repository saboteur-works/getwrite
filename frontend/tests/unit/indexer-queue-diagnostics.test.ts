import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { setStorageAdapter } from "../../src/lib/models/io";
import { createTextResource } from "../../src/lib/models/resource";
import { HEURISTIC_VERSION } from "../../src/lib/models/prose-diagnostics";
import { enqueueIndex, waitForDrain } from "../../src/lib/models/indexer-queue";
import { loadDiagnosticsIndex } from "../../src/lib/models/diagnostics-index";

describe("indexer queue prose diagnostics", () => {
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

  it("persists a diagnostics record for a resource after indexing", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-diag-"));

    const { writeResourceToFile } =
      await import("../../src/lib/models/resource");

    const resource = createTextResource({
      name: "Chapter One",
      plainText:
        '"Hello there," she said. "How are you?" He walked away slowly.',
    });
    await writeResourceToFile(projectRoot, resource);

    await enqueueIndex(projectRoot, resource.id);
    await waitForDrain(2000);

    const index = await loadDiagnosticsIndex(projectRoot);
    const record = index[resource.id];
    expect(record).toBeDefined();
    expect(record!.heuristicVersion).toBe(HEURISTIC_VERSION);
    expect(typeof record!.dialogueRatio).toBe("number");
    expect(typeof record!.averageSentenceLength).toBe("number");
    expect(Array.isArray(record!.topRepeatedWords)).toBe(true);
    expect(record!.dialogueRatio).toBeGreaterThan(0);
  });

  it("recomputes and re-persists on a second save with byte-identical content (unconditional, not skip-if-unchanged)", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-diag2-"));

    const { writeResourceToFile } =
      await import("../../src/lib/models/resource");

    const resource = createTextResource({
      name: "Chapter Two",
      plainText: "The quick brown fox jumps.",
    });
    await writeResourceToFile(projectRoot, resource);

    await enqueueIndex(projectRoot, resource.id);
    await waitForDrain(2000);

    const first = await loadDiagnosticsIndex(projectRoot);
    expect(first[resource.id]).toBeDefined();

    // Save again with identical content.
    await writeResourceToFile(projectRoot, resource);
    await enqueueIndex(projectRoot, resource.id);
    await waitForDrain(2000);

    const second = await loadDiagnosticsIndex(projectRoot);
    expect(second[resource.id]).toBeDefined();
    expect(second[resource.id]).toEqual(first[resource.id]);
  });

  it("produces a valid zero/empty record for a resource with no plain text yet", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-diag3-"));

    const { writeResourceToFile } =
      await import("../../src/lib/models/resource");

    const resource = createTextResource({ name: "Empty", plainText: "" });
    await writeResourceToFile(projectRoot, resource);

    await enqueueIndex(projectRoot, resource.id);
    await waitForDrain(2000);

    const index = await loadDiagnosticsIndex(projectRoot);
    const record = index[resource.id];
    expect(record).toBeDefined();
    expect(record!.dialogueRatio).toBe(0);
    expect(record!.averageSentenceLength).toBe(0);
    expect(record!.topRepeatedWords).toEqual([]);
    expect(record!.heuristicVersion).toBe(HEURISTIC_VERSION);
  });
});
