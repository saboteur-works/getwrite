import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  applyDocumentMetadata,
  resolveFeatureTogglesToEnable,
  type DocumentMetadataFlags,
} from "../../src/lib/models/scrivener/apply-document-metadata";

const FIXTURE_DATA_DIR = path.join(
  __dirname,
  "../fixtures/scrivener/sample.scriv/Files/Data/66666666-6666-4666-8666-666666666666",
);

async function loadFixtureSynopsis(): Promise<string> {
  return fs.readFile(path.join(FIXTURE_DATA_DIR, "synopsis.txt"), "utf8");
}

async function loadFixtureNotesRtf(): Promise<Buffer> {
  return fs.readFile(path.join(FIXTURE_DATA_DIR, "notes.rtf"));
}

describe("scrivener/applyDocumentMetadata", () => {
  const projectRoot = "/project";

  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  it("writes only synopsis when the document has a synopsis but no notes", async () => {
    const resourceId = generateUUID();
    const synopsis = await loadFixtureSynopsis();

    const result = await applyDocumentMetadata(projectRoot, resourceId, {
      synopsis,
    });

    expect(result.hasSynopsis).toBe(true);
    expect(result.hasNotes).toBe(false);

    const sidecar = await readSidecar(projectRoot, resourceId);
    expect(sidecar).not.toBeNull();
    const userMetadata = sidecar?.userMetadata as Record<string, unknown>;
    expect(userMetadata.synopsis).toBe(synopsis);
    expect(userMetadata.notes).toBeUndefined();

    await flushIndexer();
  });

  it("writes only notes (converted from RTF to plain text) when the document has notes but no synopsis", async () => {
    const resourceId = generateUUID();
    const notesRtf = await loadFixtureNotesRtf();

    const result = await applyDocumentMetadata(projectRoot, resourceId, {
      notesRtf,
    });

    expect(result.hasSynopsis).toBe(false);
    expect(result.hasNotes).toBe(true);

    const sidecar = await readSidecar(projectRoot, resourceId);
    const userMetadata = sidecar?.userMetadata as Record<string, unknown>;
    expect(userMetadata.notes).toBe("A placeholder note about Chapter Two.");
    expect(userMetadata.synopsis).toBeUndefined();

    await flushIndexer();
  });

  it("writes both synopsis and notes when the document has both", async () => {
    const resourceId = generateUUID();
    const synopsis = await loadFixtureSynopsis();
    const notesRtf = await loadFixtureNotesRtf();

    const result = await applyDocumentMetadata(projectRoot, resourceId, {
      synopsis,
      notesRtf,
    });

    expect(result.hasSynopsis).toBe(true);
    expect(result.hasNotes).toBe(true);

    const sidecar = await readSidecar(projectRoot, resourceId);
    const userMetadata = sidecar?.userMetadata as Record<string, unknown>;
    expect(userMetadata.synopsis).toBe(synopsis);
    expect(userMetadata.notes).toBe("A placeholder note about Chapter Two.");

    await flushIndexer();
  });

  it("writes neither key when the document has no synopsis and no notes", async () => {
    const resourceId = generateUUID();

    const result = await applyDocumentMetadata(projectRoot, resourceId, {});

    expect(result.hasSynopsis).toBe(false);
    expect(result.hasNotes).toBe(false);

    const sidecar = await readSidecar(projectRoot, resourceId);
    expect(sidecar).not.toBeNull();
    const userMetadata = sidecar?.userMetadata as Record<string, unknown>;
    expect(userMetadata.synopsis).toBeUndefined();
    expect(userMetadata.notes).toBeUndefined();

    await flushIndexer();
  });

  it("merges into an existing sidecar without clobbering other keys, regardless of write order", async () => {
    const resourceId = generateUUID();

    // Simulate Task 8's orchestrator writing other userMetadata (status,
    // custom fields) onto the same sidecar BEFORE applyDocumentMetadata runs.
    await writeSidecar(projectRoot, resourceId, {
      entityKind: "character",
      userMetadata: { status: "Draft", customField: "keep-me" },
    });

    const synopsis = await loadFixtureSynopsis();
    await applyDocumentMetadata(projectRoot, resourceId, { synopsis });

    const afterFirst = await readSidecar(projectRoot, resourceId);
    expect(afterFirst?.entityKind).toBe("character");
    const userMetadataAfterFirst = afterFirst?.userMetadata as Record<
      string,
      unknown
    >;
    expect(userMetadataAfterFirst.status).toBe("Draft");
    expect(userMetadataAfterFirst.customField).toBe("keep-me");
    expect(userMetadataAfterFirst.synopsis).toBe(synopsis);

    // Simulate Task 8 writing MORE userMetadata onto the same sidecar AFTER
    // applyDocumentMetadata already ran — it must not clobber synopsis.
    const existing = await readSidecar(projectRoot, resourceId);
    await writeSidecar(projectRoot, resourceId, {
      ...existing,
      userMetadata: {
        ...(existing?.userMetadata as Record<string, unknown>),
        label: "Chapter Two",
      },
    });

    const afterSecond = await readSidecar(projectRoot, resourceId);
    const userMetadataAfterSecond = afterSecond?.userMetadata as Record<
      string,
      unknown
    >;
    expect(userMetadataAfterSecond.synopsis).toBe(synopsis);
    expect(userMetadataAfterSecond.label).toBe("Chapter Two");
    expect(userMetadataAfterSecond.status).toBe("Draft");

    await flushIndexer();
  });
});

describe("scrivener/resolveFeatureTogglesToEnable", () => {
  it("reports synopsis when any document has a synopsis", () => {
    const flags: DocumentMetadataFlags[] = [
      { hasSynopsis: false, hasNotes: false },
      { hasSynopsis: true, hasNotes: false },
    ];
    expect(resolveFeatureTogglesToEnable(flags)).toEqual({ synopsis: true });
  });

  it("reports notes when any document has notes", () => {
    const flags: DocumentMetadataFlags[] = [
      { hasSynopsis: false, hasNotes: false },
      { hasSynopsis: false, hasNotes: true },
    ];
    expect(resolveFeatureTogglesToEnable(flags)).toEqual({ notes: true });
  });

  it("reports both when documents collectively have both", () => {
    const flags: DocumentMetadataFlags[] = [
      { hasSynopsis: true, hasNotes: false },
      { hasSynopsis: false, hasNotes: true },
      { hasSynopsis: false, hasNotes: false },
    ];
    expect(resolveFeatureTogglesToEnable(flags)).toEqual({
      synopsis: true,
      notes: true,
    });
  });

  it("reports neither when no document has synopsis or notes", () => {
    const flags: DocumentMetadataFlags[] = [
      { hasSynopsis: false, hasNotes: false },
      { hasSynopsis: false, hasNotes: false },
    ];
    expect(resolveFeatureTogglesToEnable(flags)).toEqual({});
  });

  it("reports neither for an empty collection", () => {
    expect(resolveFeatureTogglesToEnable([])).toEqual({});
  });
});
