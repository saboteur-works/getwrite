import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, readFile, rm } from "../../src/lib/models/io";
import { writeRevision, listRevisions } from "../../src/lib/models/revision";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";
import * as writingLog from "../../src/lib/models/writing-log";

vi.mock("../../src/lib/models/writing-log", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/writing-log")>();
  return {
    ...actual,
    appendWritingLogEntry: vi.fn(actual.appendWritingLogEntry),
  };
});

function doc(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

describe("updateRevisionInPlace — writing log", () => {
  let projectRoot: string;
  let resourceId: string;
  const appendSpy = vi.mocked(writingLog.appendWritingLogEntry);

  beforeEach(async () => {
    setStorageAdapter(createMemoryAdapter());
    projectRoot = "/proj-" + generateUUID();
    resourceId = generateUUID();
    const actual = await vi.importActual<typeof writingLog>(
      "../../src/lib/models/writing-log",
    );
    appendSpy.mockReset();
    appendSpy.mockImplementation(actual.appendWritingLogEntry);
  });

  const seed = (content: string, isCanonical = true) =>
    writeRevision(projectRoot, resourceId, 1, content, { isCanonical });

  const allEntries = async (): Promise<Array<Record<string, unknown>>> => {
    const day = new Date().toISOString().slice(0, 10);
    try {
      const raw = await readFile(
        path.join(projectRoot, "meta/writing-log", `${day}.json`),
        "utf8",
      );
      return JSON.parse(raw).entries;
    } catch {
      return [];
    }
  };

  const storedContent = () =>
    readFile(
      path.join(projectRoot, "revisions", resourceId, "v-1", "content.bin"),
      "utf8",
    );

  it("appends exactly one entry with the expected added/deleted", async () => {
    const rev = await seed(doc("one two three four"));
    const result = await updateRevisionInPlace(
      projectRoot,
      resourceId,
      rev.id,
      doc("one two three five six"),
    );
    const entries = await allEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ added: 2, deleted: 1, net: 1 });
    expect(result.writingLog).toBeUndefined();
  });

  it("appends no entry and no signal when the words are identical", async () => {
    const rev = await seed(doc("one two three"));
    const result = await updateRevisionInPlace(
      projectRoot,
      resourceId,
      rev.id,
      doc("one two three"),
    );
    expect(await allEntries()).toHaveLength(0);
    expect(appendSpy).not.toHaveBeenCalled();
    expect(result.writingLog).toBeUndefined();
    expect(await storedContent()).toBe(doc("one two three"));
  });

  it("appends one entry for a same-size replacement with net 0", async () => {
    const rev = await seed(doc("a b c"));
    const result = await updateRevisionInPlace(
      projectRoot,
      resourceId,
      rev.id,
      doc("a b d"),
    );
    const entries = await allEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ added: 1, deleted: 1, net: 0 });
    expect(result.writingLog).toBeUndefined();
  });

  it("appends one entry for a pure addition and for a pure deletion", async () => {
    const rev = await seed(doc("a b"));
    await updateRevisionInPlace(projectRoot, resourceId, rev.id, doc("a b c"));
    await updateRevisionInPlace(projectRoot, resourceId, rev.id, doc("a b"));
    const entries = await allEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ added: 1, deleted: 0, net: 1 });
    expect(entries[1]).toMatchObject({ added: 0, deleted: 1, net: -1 });
  });

  it("appends nothing for a non-canonical save (which throws)", async () => {
    const rev = await seed(doc("a b"), false);
    await expect(
      updateRevisionInPlace(projectRoot, resourceId, rev.id, doc("a b c")),
    ).rejects.toThrow();
    expect(await allEntries()).toHaveLength(0);
  });

  it("appends a marker, no word entry, when previous content is unreadable", async () => {
    const rev = await seed(doc("a b"));
    await rm(
      path.join(projectRoot, "revisions", resourceId, "v-1", "content.bin"),
    );
    const result = await updateRevisionInPlace(
      projectRoot,
      resourceId,
      rev.id,
      doc("a b c"),
    );
    const entries = await allEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ skipped: true });
    expect(entries[0]).not.toHaveProperty("added");
    expect(result.writingLog).toEqual({ skipped: true });
  });

  it("appends a marker for legacy plain-text previous content", async () => {
    const rev = await seed("legacy plain text");
    const result = await updateRevisionInPlace(
      projectRoot,
      resourceId,
      rev.id,
      doc("now tiptap words"),
    );
    const entries = await allEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ skipped: true });
    expect(result.writingLog).toEqual({ skipped: true });
  });

  it("marker append failure keeps the save and signals markerAppendFailed", async () => {
    const rev = await seed("legacy plain text");
    appendSpy.mockRejectedValue(new Error("disk full"));
    const result = await updateRevisionInPlace(
      projectRoot,
      resourceId,
      rev.id,
      doc("saved anyway"),
    );
    expect(result.writingLog).toEqual({
      skipped: true,
      markerAppendFailed: true,
    });
    expect(await listRevisions(projectRoot, resourceId)).toHaveLength(1);
    expect(await storedContent()).toBe(doc("saved anyway"));
  });

  it("word entry append failure keeps the save and signals appendFailed", async () => {
    const rev = await seed(doc("a b"));
    appendSpy.mockRejectedValue(new Error("boom"));
    const result = await updateRevisionInPlace(
      projectRoot,
      resourceId,
      rev.id,
      doc("a b c"),
    );
    expect(result.writingLog).toEqual({ appendFailed: true });
    expect(await storedContent()).toBe(doc("a b c"));
  });

  it("rethrows a locked-project error from the append", async () => {
    const rev = await seed(doc("a b"));
    appendSpy.mockRejectedValue(new ProjectLockedError("p"));
    await expect(
      updateRevisionInPlace(projectRoot, resourceId, rev.id, doc("a b c")),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });
});
