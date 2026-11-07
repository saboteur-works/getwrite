import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { setStorageAdapter } from "../../src/lib/models/io";
import { createTextResource } from "../../src/lib/models/resource";
import { createSourceResource } from "../../src/lib/models/resource-factory";
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

  // Feature 102 FR-29: a Source body is diagnosed as a text body is.
  it("persists a diagnostics record for a Source body, equal to the record for the same text", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-diag4-"));
    const { writeResourceToFile } =
      await import("../../src/lib/models/resource");
    const body =
      '"Hello there," she said. "How are you?" He walked away slowly.';

    const text = createTextResource({ name: "Text", plainText: body });
    const src = createSourceResource({ name: "Interview", plainText: body });
    await writeResourceToFile(projectRoot, text);
    await writeResourceToFile(projectRoot, src);
    await enqueueIndex(projectRoot, text.id);
    await enqueueIndex(projectRoot, src.id);
    await waitForDrain(2000);

    const raw = JSON.parse(
      await fs.readFile(
        path.join(projectRoot, "meta", "index", "diagnostics.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(raw[src.id]).toBeDefined();
    const index = await loadDiagnosticsIndex(projectRoot);
    expect(index[src.id]!.dialogueRatio).toBeGreaterThan(0);
    expect(index[src.id]).toEqual(index[text.id]);
  });

  it("ignores a Source's attachment list when computing diagnostics", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-diag5-"));
    const { writeResourceToFile } =
      await import("../../src/lib/models/resource");
    const body = "The quick brown fox jumps.";
    const plain = createSourceResource({ name: "Plain", plainText: body });
    const attached = createSourceResource({
      name: "Attached",
      plainText: body,
    });
    attached.attachments = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        fileName: "attachment-22222222-2222-4222-8222-222222222222.pdf",
        originalName: "repeat repeat repeat repeat.pdf",
        mime: "application/pdf",
        size: 10,
        addedAt: new Date().toISOString(),
      },
    ];
    await writeResourceToFile(projectRoot, plain);
    await writeResourceToFile(projectRoot, attached);
    await enqueueIndex(projectRoot, plain.id);
    await enqueueIndex(projectRoot, attached.id);
    await waitForDrain(2000);

    const index = await loadDiagnosticsIndex(projectRoot);
    expect(index[attached.id]).toBeDefined();
    expect(index[attached.id]).toEqual(index[plain.id]);
  });
});
