import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import {
  detectDocxSource,
  walkDocxFolder,
  NoDocxFilesFoundError,
  type DocxWalkEntry,
} from "../../src/lib/models/docx/source-detection";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, getStorageAdapter } from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";

const FOLDER_SOURCE_FIXTURE = path.join(
  __dirname,
  "../fixtures/docx/folder-source",
);
const CORE_PROPERTIES_FIXTURE = path.join(
  __dirname,
  "../fixtures/docx/core-properties.docx",
);

describe("detectDocxSource", () => {
  it("detects a single-file source", async () => {
    const result = await detectDocxSource(CORE_PROPERTIES_FIXTURE);
    expect(result).toEqual({ kind: "file" });
  });

  it("detects a directory source containing at least one .docx file", async () => {
    const result = await detectDocxSource(FOLDER_SOURCE_FIXTURE);
    expect(result).toEqual({ kind: "directory" });
  });

  it("throws NoDocxFilesFoundError for a directory with no .docx anywhere in its tree", async () => {
    const previousAdapter = getStorageAdapter();
    const adapter = createMemoryAdapter();
    setStorageAdapter(adapter);
    try {
      await adapter.mkdir("/empty-source/nested", { recursive: true });
      await adapter.writeFile("/empty-source/notes.txt", "not a docx");
      await adapter.writeFile(
        "/empty-source/nested/also-not-docx.rtf",
        "still not a docx",
      );

      await expect(detectDocxSource("/empty-source")).rejects.toThrow(
        NoDocxFilesFoundError,
      );
    } finally {
      setStorageAdapter(previousAdapter);
    }
  });
});

describe("walkDocxFolder", () => {
  it("includes the nested subfolder's .docx file and skips the lock file, non-.docx file, and hidden entries exactly once each", async () => {
    const plan = await walkDocxFolder(FOLDER_SOURCE_FIXTURE);

    expect(plan.skips).toEqual({
      nonDocxFilesSkippedCount: 1,
      lockFilesSkippedCount: 1,
      hiddenFilesSkippedCount: 2,
    });

    const nestedFolder = plan.entries.find(
      (entry): entry is Extract<DocxWalkEntry, { kind: "folder" }> =>
        entry.kind === "folder" && entry.name === "nested-subfolder",
    );
    expect(nestedFolder).toBeDefined();
    expect(nestedFolder?.entries).toEqual([
      expect.objectContaining({ kind: "file", name: "nested.docx" }),
    ]);

    // The lock file, non-.docx file, and hidden file/dir must not appear as
    // entries anywhere in the plan — only their tallies represent them.
    const names = plan.entries.map((entry) => entry.name);
    expect(names).not.toContain("~$scratch.docx");
    expect(names).not.toContain("notes.txt");
    expect(names).not.toContain(".hidden-file.docx");
    expect(names).not.toContain(".hidden-dir");
  });

  describe("with an in-memory fixture for natural-order sorting and pruning", () => {
    let previousAdapter: StorageAdapter;

    beforeEach(() => {
      previousAdapter = getStorageAdapter();
      setStorageAdapter(createMemoryAdapter());
    });

    afterEach(() => {
      setStorageAdapter(previousAdapter);
    });

    it("orders files and subfolders together in case-insensitive natural order", async () => {
      const adapter = getStorageAdapter();
      await adapter.mkdir("/manuscript", { recursive: true });
      // Deliberately written out of natural order to prove the sort, not
      // the input order, decides the result.
      await adapter.writeFile("/manuscript/Chapter 10.docx", "");
      await adapter.writeFile("/manuscript/Chapter 2.docx", "");
      await adapter.writeFile("/manuscript/Chapter 1.docx", "");
      await adapter.mkdir("/manuscript/Appendix", { recursive: true });
      await adapter.writeFile("/manuscript/Appendix/notes.docx", "");

      const plan = await walkDocxFolder("/manuscript");

      expect(plan.entries.map((entry) => entry.name)).toEqual([
        "Appendix",
        "Chapter 1.docx",
        "Chapter 2.docx",
        "Chapter 10.docx",
      ]);
    });

    it("omits a subfolder with no .docx file anywhere beneath it, while still tallying skips found inside it", async () => {
      const adapter = getStorageAdapter();
      await adapter.mkdir("/manuscript/empty-subfolder", { recursive: true });
      await adapter.writeFile(
        "/manuscript/empty-subfolder/stray.txt",
        "no docx here",
      );
      await adapter.writeFile("/manuscript/Chapter 1.docx", "");

      const plan = await walkDocxFolder("/manuscript");

      expect(plan.entries).toEqual([
        expect.objectContaining({ kind: "file", name: "Chapter 1.docx" }),
      ]);
      expect(plan.skips.nonDocxFilesSkippedCount).toBe(1);
    });

    it("skips a hidden directory as a single unit without descending into it", async () => {
      const adapter = getStorageAdapter();
      await adapter.mkdir("/manuscript/.hidden-dir", { recursive: true });
      await adapter.writeFile(
        "/manuscript/.hidden-dir/would-be-included.docx",
        "",
      );
      await adapter.writeFile("/manuscript/Chapter 1.docx", "");

      const plan = await walkDocxFolder("/manuscript");

      expect(plan.entries).toEqual([
        expect.objectContaining({ kind: "file", name: "Chapter 1.docx" }),
      ]);
      expect(plan.skips.hiddenFilesSkippedCount).toBe(1);
    });
  });
});
