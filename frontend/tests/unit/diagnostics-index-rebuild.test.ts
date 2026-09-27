import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { setStorageAdapter } from "../../src/lib/models/io";
import { HEURISTIC_VERSION } from "../../src/lib/models/prose-diagnostics";
import {
  loadDiagnosticsIndex,
  persistDiagnosticsIndex,
  rebuildDiagnosticsRecordIfStale,
  type DiagnosticsRecord,
} from "../../src/lib/models/diagnostics-index";

describe("rebuildDiagnosticsRecordIfStale", () => {
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

  it("returns the stored record unchanged when heuristicVersion matches, without re-persisting", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rb1-"));
    const resourceId = "res-1";

    const stored: DiagnosticsRecord = {
      dialogueRatio: 0.5,
      averageSentenceLength: 7,
      topRepeatedWords: [{ word: "test", count: 3 }],
      heuristicVersion: HEURISTIC_VERSION,
    };
    await persistDiagnosticsIndex(projectRoot, { [resourceId]: stored });

    const result = await rebuildDiagnosticsRecordIfStale(
      projectRoot,
      resourceId,
      "some plain text some plain text some plain text",
    );

    expect(result).toEqual(stored);

    // Confirm it was not rewritten (still byte-identical in the index).
    const index = await loadDiagnosticsIndex(projectRoot);
    expect(index[resourceId]).toEqual(stored);
  });

  it("recomputes and re-persists when the stored record's heuristicVersion is older", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rb2-"));
    const resourceId = "res-2";

    const stale: DiagnosticsRecord = {
      dialogueRatio: 0.9,
      averageSentenceLength: 99,
      topRepeatedWords: [{ word: "stale", count: 99 }],
      heuristicVersion: HEURISTIC_VERSION - 1,
    };
    await persistDiagnosticsIndex(projectRoot, { [resourceId]: stale });

    const plainText =
      '"Hi," she said. "Hi," she said. "Hi," she said. word word word word.';
    const result = await rebuildDiagnosticsRecordIfStale(
      projectRoot,
      resourceId,
      plainText,
    );

    expect(result.heuristicVersion).toBe(HEURISTIC_VERSION);
    expect(result).not.toEqual(stale);

    const index = await loadDiagnosticsIndex(projectRoot);
    expect(index[resourceId]).toEqual(result);
  });

  it("recomputes and persists when there is no stored record at all", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rb3-"));
    const resourceId = "res-3";

    const plainText = "Some brand new text with no prior record.";
    const result = await rebuildDiagnosticsRecordIfStale(
      projectRoot,
      resourceId,
      plainText,
    );

    expect(result.heuristicVersion).toBe(HEURISTIC_VERSION);

    const index = await loadDiagnosticsIndex(projectRoot);
    expect(index[resourceId]).toEqual(result);
  });
});
