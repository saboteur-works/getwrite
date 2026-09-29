import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import {
  detectPlainTextSource,
  walkPlainTextFolder,
  NoTxtFilesFoundError,
  type PlainTextWalkEntry,
} from "../../src/lib/models/plaintext/source-detection";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, getStorageAdapter } from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";

const SINGLE_DOCUMENT_FIXTURE = path.join(
  __dirname,
  "../fixtures/plaintext/single-document.txt",
);
const FOLDER_SOURCE_FIXTURE = path.join(
  __dirname,
  "../fixtures/plaintext/folder-source",
);

describe("detectPlainTextSource", () => {
  it("detects a single-file source", async () => {
    const result = await detectPlainTextSource(SINGLE_DOCUMENT_FIXTURE);
    expect(result).toEqual({ kind: "file" });
  });

  it("detects a directory source containing at least one .txt file", async () => {
    const result = await detectPlainTextSource(FOLDER_SOURCE_FIXTURE);
    expect(result).toEqual({ kind: "directory" });
  });

  it("throws NoTxtFilesFoundError for a directory with no .txt anywhere in its tree", async () => {
    const previousAdapter = getStorageAdapter();
    const adapter = createMemoryAdapter();
    setStorageAdapter(adapter);
    try {
      await adapter.mkdir("/empty-source/nested", { recursive: true });
      await adapter.writeFile("/empty-source/notes.md", "not a txt file");
      await adapter.writeFile(
        "/empty-source/nested/also-not-txt.rtf",
        "still not a txt file",
      );

      await expect(detectPlainTextSource("/empty-source")).rejects.toThrow(
        NoTxtFilesFoundError,
      );
    } finally {
      setStorageAdapter(previousAdapter);
    }
  });
});

describe("walkPlainTextFolder", () => {
  it("orders top-level files in case-insensitive natural order (Chapter 1, 2, 10)", async () => {
    const plan = await walkPlainTextFolder(FOLDER_SOURCE_FIXTURE);

    const topLevelFileNames = plan.entries
      .filter(
        (entry): entry is Extract<PlainTextWalkEntry, { kind: "file" }> =>
          entry.kind === "file",
      )
      .map((entry) => entry.name);

    expect(topLevelFileNames).toEqual([
      "Chapter 1.txt",
      "Chapter 2.txt",
      "Chapter 10.txt",
    ]);
  });

  it("includes the nested subfolder's .txt file and skips the non-.txt file and hidden entries", async () => {
    const plan = await walkPlainTextFolder(FOLDER_SOURCE_FIXTURE);

    expect(plan.skips).toEqual({
      nonTxtFilesSkippedCount: 1,
      hiddenFilesSkippedCount: 2,
    });

    const nestedFolder = plan.entries.find(
      (entry): entry is Extract<PlainTextWalkEntry, { kind: "folder" }> =>
        entry.kind === "folder" && entry.name === "nested-subfolder",
    );
    expect(nestedFolder).toBeDefined();
    expect(nestedFolder?.entries).toEqual([
      expect.objectContaining({ kind: "file", name: "Nested Chapter.txt" }),
    ]);

    // The non-.txt file and hidden file/folder must not appear as entries
    // anywhere in the plan -- only their tallies represent them.
    const names = plan.entries.map((entry) => entry.name);
    expect(names).not.toContain("notes.md");
    expect(names).not.toContain(".hidden-file.txt");
    expect(names).not.toContain(".hidden-folder");

    // The hidden folder's contents must never surface anywhere in the walk.
    const collectAllNames = (
      entries: readonly PlainTextWalkEntry[],
    ): string[] =>
      entries.flatMap((entry) =>
        entry.kind === "folder"
          ? [entry.name, ...collectAllNames(entry.entries)]
          : [entry.name],
      );
    expect(collectAllNames(plan.entries)).not.toContain("hidden.txt");
  });

  it("skips a non-.txt file (notes.md) and counts it in nonTxtFilesSkippedCount", async () => {
    const plan = await walkPlainTextFolder(FOLDER_SOURCE_FIXTURE);

    expect(plan.skips.nonTxtFilesSkippedCount).toBe(1);
  });

  it("skips a hidden file and a hidden folder, tallying both in hiddenFilesSkippedCount, without descending into the hidden folder", async () => {
    const plan = await walkPlainTextFolder(FOLDER_SOURCE_FIXTURE);

    // .hidden-file.txt (file) + .hidden-folder (folder, skipped as one unit).
    expect(plan.skips.hiddenFilesSkippedCount).toBe(2);
  });

  describe("with an in-memory fixture for pruning", () => {
    let previousAdapter: StorageAdapter;

    beforeEach(() => {
      previousAdapter = getStorageAdapter();
      setStorageAdapter(createMemoryAdapter());
    });

    afterEach(() => {
      setStorageAdapter(previousAdapter);
    });

    it("omits a subfolder with no .txt file anywhere beneath it, while still tallying skips found inside it", async () => {
      const adapter = getStorageAdapter();
      await adapter.mkdir("/manuscript/empty-subfolder", { recursive: true });
      await adapter.writeFile(
        "/manuscript/empty-subfolder/stray.md",
        "no txt here",
      );
      await adapter.writeFile("/manuscript/Chapter 1.txt", "");

      const plan = await walkPlainTextFolder("/manuscript");

      expect(plan.entries).toEqual([
        expect.objectContaining({ kind: "file", name: "Chapter 1.txt" }),
      ]);
      expect(plan.skips.nonTxtFilesSkippedCount).toBe(1);
    });
  });
});
