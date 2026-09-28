// Last Updated: 2026-09-28

/**
 * Integration tests for Task 12's `importPlainTextProject`
 * (`specs/features/plain-text-import.md`), exercising the full orchestration
 * pipeline against the committed synthetic `.txt` fixtures
 * (Task 8, `frontend/tests/fixtures/plaintext/`).
 *
 * Mirrors `frontend/tests/integration/docx-import.test.ts`'s real-filesystem
 * integration-test structure exactly (real temp directories via
 * `fs.mkdtemp`/`os.tmpdir`, no in-memory adapter).
 */
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  importPlainTextProject,
  PlainTextDestinationNotEmptyError,
} from "../../src/lib/models/plaintext/import-plaintext-project";
import { NoTxtFilesFoundError } from "../../src/lib/models/plaintext/source-detection";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { appendWritingLogEntry } from "../../src/lib/models/writing-log";
import { ProjectSchema, AnyResourceSchema } from "../../src/lib/models/schemas";
import type {
  AnyResource,
  Project,
  TextResource,
} from "../../src/lib/models/types";

// Feature 59 Task 7 precedent (mirrored from docx-import.test.ts): lets a
// test inject a failure into, or observe the timing of, the import's
// writing-log append. Falls through to the real function.
vi.mock("../../src/lib/models/writing-log", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/writing-log")>();
  return {
    ...actual,
    appendWritingLogEntry: vi.fn(actual.appendWritingLogEntry),
  };
});

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "plaintext");

/** Recursively hashes every file under `dir` (relative path + content), producing a single digest stable across re-runs of the same tree — used to assert the importer never mutates its source (FR-10-equivalent; mirrors docx-import.test.ts's `hashTree`). */
async function hashTree(dir: string): Promise<string> {
  const files: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        files.push(full);
      }
    }
  }
  await walk(dir);
  files.sort();

  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(dir, file));
    hash.update(await fs.readFile(file));
  }
  return hash.digest("hex");
}

/** Minimal shape this test needs to walk a TipTap document tree. */
interface TipTapNodeLike {
  type?: string;
  text?: string;
  content?: TipTapNodeLike[];
}

async function readResourceTiptapJson(
  projectRoot: string,
  resourceId: string,
): Promise<TipTapNodeLike> {
  const raw = await fs.readFile(
    path.join(projectRoot, "resources", resourceId, "content.tiptap.json"),
    "utf8",
  );
  return JSON.parse(raw) as TipTapNodeLike;
}

/** Recursively counts nodes of `nodeType` anywhere in the tree. */
function countNodesOfType(node: TipTapNodeLike, nodeType: string): number {
  let count = node.type === nodeType ? 1 : 0;
  for (const child of node.content ?? []) {
    count += countNodesOfType(child, nodeType);
  }
  return count;
}

async function readProjectJson(projectRoot: string): Promise<Project> {
  const raw = await fs.readFile(path.join(projectRoot, "project.json"), "utf8");
  return JSON.parse(raw) as Project;
}

async function readReport(projectRoot: string): Promise<string> {
  return fs.readFile(
    path.join(projectRoot, "plaintext-import-report.txt"),
    "utf8",
  );
}

interface FolderLike {
  id: string;
  name: string;
  parentId: string | null;
}

async function readAllFolders(projectRoot: string): Promise<FolderLike[]> {
  const foldersDir = path.join(projectRoot, "folders");
  const folders: FolderLike[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      const descriptorPath = path.join(full, "folder.json");
      try {
        const raw = await fs.readFile(descriptorPath, "utf8");
        folders.push(JSON.parse(raw) as FolderLike);
      } catch {
        // not a folder descriptor dir; ignore
      }
      await walk(full);
    }
  }
  await walk(foldersDir);
  return folders;
}

async function readAllResources(
  projectRoot: string,
): Promise<(AnyResource & { plainText?: string })[]> {
  const metaDir = path.join(projectRoot, "meta");
  let entries: string[];
  try {
    entries = await fs.readdir(metaDir);
  } catch {
    return [];
  }
  const resources: (AnyResource & { plainText?: string })[] = [];
  for (const entry of entries) {
    if (!entry.startsWith("resource-") || !entry.endsWith(".meta.json"))
      continue;
    const raw = await fs.readFile(path.join(metaDir, entry), "utf8");
    const sidecar = JSON.parse(raw) as AnyResource & { plainText?: string };
    if (sidecar.type === "text") {
      const contentPath = path.join(
        projectRoot,
        "resources",
        (sidecar as TextResource).id,
        "content.txt",
      );
      try {
        sidecar.plainText = await fs.readFile(contentPath, "utf8");
      } catch {
        // no content.txt; leave plainText unset
      }
    }
    resources.push(sidecar);
  }
  return resources;
}

async function mkTempProjectRoot(prefix: string): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return path.join(parent, "destination");
}

describe("importPlainTextProject — single-file source, single-document.txt (FR-6)", () => {
  const sourcePath = path.join(FIXTURES_DIR, "single-document.txt");
  let projectRoot: string;
  let beforeHash: string;
  let afterHash: string;
  let resources: (AnyResource & { plainText?: string })[];
  let report: string;

  beforeAll(async () => {
    beforeHash = await hashTree(FIXTURES_DIR);
    projectRoot = await mkTempProjectRoot("getwrite-plaintext-import-single-");

    await importPlainTextProject({ sourcePath, projectRoot });
    await flushIndexer();

    afterHash = await hashTree(FIXTURES_DIR);
    resources = await readAllResources(projectRoot);
    report = await readReport(projectRoot);
  });

  afterAll(async () => {
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("never mutates the source .txt file or any other fixture (clause 6)", () => {
    expect(afterHash).toBe(beforeHash);
  });

  it("creates one resource named from the stripped filename (clause 1)", () => {
    const textResources = resources.filter((r) => r.type === "text");
    expect(textResources).toHaveLength(1);
    expect(textResources[0].name).toBe("single-document");
  });

  it("preserves paragraph structure: multiple paragraphs and at least one hardBreak from the fixture's soft wrap (clause 1)", async () => {
    const textResource = resources.find((r) => r.type === "text") as
      | TextResource
      | undefined;
    expect(textResource).toBeDefined();
    const doc = await readResourceTiptapJson(projectRoot, textResource!.id);
    expect(countNodesOfType(doc, "paragraph")).toBeGreaterThan(1);
    expect(countNodesOfType(doc, "hardBreak")).toBeGreaterThan(0);
  });

  it("writes the plaintext-import-report.txt report (clause 1)", () => {
    expect(report).toContain("Plain-Text Import Report");
  });

  it("rebuilds the inverted index, backlinks, and mention index on disk (clause 1)", async () => {
    const indexDir = path.join(projectRoot, "meta", "index");
    await expect(
      fs.stat(path.join(projectRoot, "meta", "backlinks.json")),
    ).resolves.toBeDefined();
    await expect(
      fs.stat(path.join(indexDir, "mentions.json")),
    ).resolves.toBeDefined();
    const indexEntries = await fs.readdir(indexDir);
    expect(indexEntries.length).toBeGreaterThan(0);
  });

  it("persists a project manifest and resource that validate against schemas.ts without throwing (clause 7)", async () => {
    const project = await readProjectJson(projectRoot);
    expect(() => ProjectSchema.parse(project)).not.toThrow();
    const textResource = resources.find((r) => r.type === "text");
    expect(() => AnyResourceSchema.parse(textResource)).not.toThrow();
  });
});

describe("importPlainTextProject — folder source (FR-2, FR-3)", () => {
  const sourcePath = path.join(FIXTURES_DIR, "folder-source");
  let projectRoot: string;
  let beforeHash: string;
  let afterHash: string;
  let folders: FolderLike[];
  let resources: (AnyResource & { plainText?: string })[];
  let report: string;

  beforeAll(async () => {
    beforeHash = await hashTree(sourcePath);
    projectRoot = await mkTempProjectRoot("getwrite-plaintext-import-folder-");

    await importPlainTextProject({ sourcePath, projectRoot });
    await flushIndexer();

    afterHash = await hashTree(sourcePath);
    folders = await readAllFolders(projectRoot);
    resources = await readAllResources(projectRoot);
    report = await readReport(projectRoot);
  });

  afterAll(async () => {
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("never mutates the source folder tree (clause 6)", () => {
    expect(afterHash).toBe(beforeHash);
  });

  it("creates one resource per .txt file in natural-sort order, plus a mirrored nested folder (clause 2)", () => {
    const textResources = (
      resources.filter((r) => r.type === "text") as (TextResource & {
        plainText?: string;
      })[]
    ).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe("nested-subfolder");

    const topLevel = textResources.filter((r) => r.folderId == null);
    expect(topLevel.map((r) => r.name)).toEqual([
      "Chapter 1",
      "Chapter 2",
      "Chapter 10",
    ]);

    const nested = textResources.filter((r) => r.folderId === folders[0].id);
    expect(nested).toHaveLength(1);
    expect(nested[0].name).toBe("Nested Chapter");
    expect(nested[0].plainText).toContain("nested");
  });

  it("skips notes.md and hidden entries, reflecting the skip counts in the written report (clause 2)", () => {
    const textResources = resources.filter((r) => r.type === "text");
    expect(textResources.map((r) => r.name)).not.toContain("notes");
    expect(
      resources.some((r) =>
        (r as TextResource & { plainText?: string }).plainText?.includes(
          "never be imported",
        ),
      ),
    ).toBe(false);

    expect(report).toContain("Non-.txt files skipped: 1");
    expect(report).toContain("Hidden/dot files or directories skipped: 2");
  });
});

describe("importPlainTextProject — refusals before any write", () => {
  it("throws PlainTextDestinationNotEmptyError for a non-empty pre-existing destination, leaving it unchanged (clause 3)", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-plaintext-import-nonempty-"),
    );
    await fs.writeFile(
      path.join(projectRoot, "pre-existing-file.txt"),
      "already here",
      "utf8",
    );

    let caughtError: unknown;
    try {
      await importPlainTextProject({
        sourcePath: path.join(FIXTURES_DIR, "single-document.txt"),
        projectRoot,
      });
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError).toBeInstanceOf(PlainTextDestinationNotEmptyError);

    const entries = await fs.readdir(projectRoot);
    expect(entries).toEqual(["pre-existing-file.txt"]);
    expect(
      await fs.readFile(
        path.join(projectRoot, "pre-existing-file.txt"),
        "utf8",
      ),
    ).toBe("already here");

    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("throws NoTxtFilesFoundError for a folder with no .txt file anywhere in it, creating no projectRoot (clause 4)", async () => {
    const sourceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-plaintext-import-no-txt-src-"),
    );
    await fs.writeFile(
      path.join(sourceDir, "notes.md"),
      "not a txt file",
      "utf8",
    );

    const projectRoot = await mkTempProjectRoot(
      "getwrite-plaintext-import-no-txt-dest-",
    );
    // mkTempProjectRoot's parent temp dir exists, but `destination` itself
    // must not — assert it is absent both before and after the throw.
    await expect(fs.stat(projectRoot)).rejects.toThrow();

    await expect(
      importPlainTextProject({ sourcePath: sourceDir, projectRoot }),
    ).rejects.toThrow(NoTxtFilesFoundError);

    await expect(fs.stat(projectRoot)).rejects.toThrow();

    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });
});

interface LoggedEntryLike {
  added?: number;
  deleted?: number;
  net?: number;
  source?: string;
  skipped?: boolean;
}

async function readAllLogEntries(
  projectRoot: string,
): Promise<LoggedEntryLike[]> {
  const dir = path.join(projectRoot, "meta", "writing-log");
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const entries: LoggedEntryLike[] = [];
  for (const f of files.sort()) {
    const day = JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as {
      entries: LoggedEntryLike[];
    };
    entries.push(...day.entries);
  }
  return entries;
}

describe("importPlainTextProject — writing log (Feature 59, FR-8)", () => {
  it("appends exactly one writing-log entry tagged source: 'plaintext' per import invocation (clause 5)", async () => {
    const projectRoot = await mkTempProjectRoot(
      "getwrite-plaintext-import-log-",
    );
    vi.mocked(appendWritingLogEntry).mockClear();

    await importPlainTextProject({
      sourcePath: path.join(FIXTURES_DIR, "single-document.txt"),
      projectRoot,
    });
    await flushIndexer();

    expect(appendWritingLogEntry).toHaveBeenCalledTimes(1);
    expect(vi.mocked(appendWritingLogEntry).mock.calls[0][1]).toMatchObject({
      source: "plaintext",
    });

    const entries = await readAllLogEntries(projectRoot);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: "plaintext" });

    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });
});
