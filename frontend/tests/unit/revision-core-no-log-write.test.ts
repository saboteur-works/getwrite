import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, readFile, readdir } from "../../src/lib/models/io";
import { listRevisions, writeRevision } from "../../src/lib/models/revision";
import {
  updateRevisionInPlace,
  writeCanonicalContentWithoutLog,
} from "../../src/lib/models/revision-core";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { isDestructiveContentChange } from "../../src/lib/models/content-loss";
import { generateUUID } from "../../src/lib/models/uuid";
import { countWords } from "../../src/lib/word-count";
import * as locks from "../../src/lib/models/locks";

/** Call order across the spied seams, shared by the mocks below. */
const order: string[] = [];

vi.mock("../../src/lib/models/locks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/locks")>();
  return { ...actual, acquireLock: vi.fn(actual.acquireLock) };
});
vi.mock("../../src/lib/tiptap-utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/tiptap-utils")>();
  return {
    ...actual,
    persistResourceContent: vi.fn(
      async (...args: Parameters<typeof actual.persistResourceContent>) => {
        order.push("persistResourceContent");
        return actual.persistResourceContent(...args);
      },
    ),
  };
});
vi.mock("../../src/lib/models/sidecar", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/sidecar")>();
  return {
    ...actual,
    mutateSidecar: vi.fn(
      async (...args: Parameters<typeof actual.mutateSidecar>) => {
        order.push("mutateSidecar");
        return actual.mutateSidecar(...args);
      },
    ),
  };
});

function doc(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
}

describe("writeCanonicalContentWithoutLog", () => {
  let projectRoot: string;
  let resourceId: string;

  beforeEach(async () => {
    setStorageAdapter(createMemoryAdapter());
    projectRoot = "/proj-" + generateUUID();
    resourceId = generateUUID();
    order.length = 0;
    vi.mocked(locks.acquireLock).mockClear();
    await writeSidecar(projectRoot, resourceId, {
      id: resourceId,
      name: "Chapter",
      type: "text",
      wordCount: 0,
    });
  });

  const seed = (content: string, isCanonical = true, version = 1) =>
    writeRevision(projectRoot, resourceId, version, content, { isCanonical });

  const binPath = (version = 1) =>
    path.join(
      projectRoot,
      "revisions",
      resourceId,
      `v-${version}`,
      "content.bin",
    );

  const logListing = async (): Promise<string> => {
    const dir = path.join(projectRoot, "meta/writing-log");
    let names: string[];
    try {
      names = (await readdir(dir)).sort();
    } catch {
      return "[absent]";
    }
    const parts: string[] = [];
    for (const name of names) {
      parts.push(`${name}=${await readFile(path.join(dir, name), "utf8")}`);
    }
    return parts.join("\n");
  };

  it("takes the revision-content lock, then writes content, derived files, sidecar", async () => {
    const rev = await seed(doc("one two three"));
    await writeCanonicalContentWithoutLog(
      projectRoot,
      resourceId,
      rev.id,
      doc("one two"),
    );
    expect(locks.acquireLock).toHaveBeenCalledWith(
      `revision-content:${path.resolve(projectRoot)}:${resourceId}`,
    );
    expect(order).toEqual(["persistResourceContent", "mutateSidecar"]);
    expect(await readFile(binPath(), "utf8")).toBe(doc("one two"));
  });

  it("does not take the lock again when the caller holds it", async () => {
    const rev = await seed(doc("one two three"));
    await writeCanonicalContentWithoutLog(
      projectRoot,
      resourceId,
      rev.id,
      doc("one"),
      { lockHeld: true },
    );
    expect(locks.acquireLock).not.toHaveBeenCalled();
    expect(await readFile(binPath(), "utf8")).toBe(doc("one"));
  });

  it("matches content files, wordCount and updatedAt to the written text", async () => {
    const rev = await seed(doc("one two three"));
    const text = "alpha beta gamma delta";
    const result = await writeCanonicalContentWithoutLog(
      projectRoot,
      resourceId,
      rev.id,
      doc(text),
    );
    const resourceDir = path.join(projectRoot, "resources", resourceId);
    expect(await readFile(path.join(resourceDir, "content.txt"), "utf8")).toBe(
      text,
    );
    expect(
      JSON.parse(
        await readFile(path.join(resourceDir, "content.tiptap.json"), "utf8"),
      ),
    ).toEqual(JSON.parse(doc(text)));
    const sidecar = await readSidecar(projectRoot, resourceId);
    expect(sidecar?.wordCount).toBe(countWords(text));
    expect(sidecar?.updatedAt).toBe(result.updatedAt);
  });

  it("leaves the writing-log directory byte-identical", async () => {
    const rev = await seed(doc(words(60)));
    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      rev.id,
      doc(words(61)),
    );
    const before = await logListing();
    expect(before).not.toBe("[absent]");
    await writeCanonicalContentWithoutLog(
      projectRoot,
      resourceId,
      rev.id,
      doc(words(10)),
    );
    expect(await logListing()).toBe(before);
  });

  it("writes no log directory when none existed", async () => {
    const rev = await seed(doc(words(60)));
    await writeCanonicalContentWithoutLog(
      projectRoot,
      resourceId,
      rev.id,
      doc("a"),
    );
    expect(await logListing()).toBe("[absent]");
  });

  it("creates no Auto-backup revision for a truncation flagged as destructive", async () => {
    const previous = doc(words(100));
    const incoming = doc(words(10));
    expect(isDestructiveContentChange(previous, incoming)).toBe(true);
    const rev = await seed(previous);
    await writeCanonicalContentWithoutLog(
      projectRoot,
      resourceId,
      rev.id,
      incoming,
    );
    const revisions = await listRevisions(projectRoot, resourceId);
    expect(revisions).toHaveLength(1);
    expect(revisions.some((r) => r.metadata?.automaticSnapshot === true)).toBe(
      false,
    );
  });

  it("lets a later ordinary edit log its own words as before", async () => {
    const rev = await seed(doc(words(100)));
    await writeCanonicalContentWithoutLog(
      projectRoot,
      resourceId,
      rev.id,
      doc(words(10)),
    );
    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      rev.id,
      doc(words(12)),
    );
    const day = new Date().toISOString().slice(0, 10);
    const raw = await readFile(
      path.join(projectRoot, "meta/writing-log", `${day}.json`),
      "utf8",
    );
    const entries = JSON.parse(raw).entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ added: 2, deleted: 0 });
  });

  it("refuses a non-canonical revision and writes nothing", async () => {
    await seed(doc("canonical text"), true, 1);
    const other = await seed(doc("older text"), false, 2);
    await expect(
      writeCanonicalContentWithoutLog(
        projectRoot,
        resourceId,
        other.id,
        doc("x"),
      ),
    ).rejects.toThrow("Only the canonical revision can be updated in place.");
    expect(await readFile(binPath(1), "utf8")).toBe(doc("canonical text"));
    expect(await readFile(binPath(2), "utf8")).toBe(doc("older text"));
  });

  it("refuses an unknown revision id", async () => {
    await seed(doc("canonical text"));
    await expect(
      writeCanonicalContentWithoutLog(
        projectRoot,
        resourceId,
        "no-such-revision",
        doc("x"),
      ),
    ).rejects.toThrow("Revision no-such-revision not found.");
  });

  it("can overwrite the canonical content from a snapshot's text (Undo use)", async () => {
    const canonical = await seed(doc("short"), true, 1);
    const snapshot = await seed(doc("the full original text here"), false, 2);
    const snapshotText = await readFile(
      binPath(snapshot.versionNumber),
      "utf8",
    );
    await writeCanonicalContentWithoutLog(
      projectRoot,
      resourceId,
      canonical.id,
      snapshotText,
    );
    expect(await readFile(binPath(1), "utf8")).toBe(snapshotText);
    const sidecar = await readSidecar(projectRoot, resourceId);
    expect(sidecar?.wordCount).toBe(5);
  });
});
