// Last Updated: 2026-09-13

/**
 * Integration tests for Task 9's `importDocxProject`
 * (`specs/features/docx-importer.md`), exercising the full orchestration
 * pipeline (Tasks 3-8) against the committed synthetic `.docx` fixtures
 * (Task 2, `frontend/tests/fixtures/docx/`).
 */
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  importDocxProject,
  UnknownProjectTypeError,
  DocxDestinationNotEmptyError,
} from "../../src/lib/models/docx/import-docx-project";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { appendWritingLogEntry } from "../../src/lib/models/writing-log";
import { countWords } from "../../src/lib/word-count";
import type {
  AnyResource,
  Project,
  TextResource,
} from "../../src/lib/models/types";

// Feature 59 Task 7: lets a test inject a failure into, or observe the timing
// of, the import's writing-log append. Falls through to the real function.
vi.mock("../../src/lib/models/writing-log", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/writing-log")>();
  return {
    ...actual,
    appendWritingLogEntry: vi.fn(actual.appendWritingLogEntry),
  };
});

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "docx");

/** Recursively hashes every file under `dir` (relative path + content), producing a single digest stable across re-runs of the same tree — used to assert the importer never mutates its source (FR-10-equivalent for DOCX). */
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
  marks?: { type?: string }[];
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

/** Flattens every text node anywhere in a TipTap-like tree into one string. */
function flattenText(node: TipTapNodeLike): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(flattenText).join("");
}

/** Recursively counts text nodes anywhere in the tree carrying a mark of `markType`. */
function countMarksOfType(node: TipTapNodeLike, markType: string): number {
  let count = 0;
  if (node.marks?.some((mark) => mark.type === markType)) {
    count += 1;
  }
  for (const child of node.content ?? []) {
    count += countMarksOfType(child, markType);
  }
  return count;
}

async function readProjectJson(projectRoot: string): Promise<Project> {
  const raw = await fs.readFile(path.join(projectRoot, "project.json"), "utf8");
  return JSON.parse(raw) as Project;
}

async function readReport(projectRoot: string): Promise<string> {
  return fs.readFile(path.join(projectRoot, "docx-import-report.txt"), "utf8");
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

describe("importDocxProject — single-file source, core-properties.docx (FR-14)", () => {
  const sourcePath = path.join(FIXTURES_DIR, "core-properties.docx");
  let projectRoot: string;
  let beforeHash: string;
  let afterHash: string;
  let project: Project;
  let resources: (AnyResource & { plainText?: string })[];
  let report: string;

  beforeAll(async () => {
    beforeHash = await hashTree(FIXTURES_DIR);
    projectRoot = await mkTempProjectRoot("getwrite-docx-import-core-props-");

    await importDocxProject({ sourcePath, projectRoot });
    await flushIndexer();

    afterHash = await hashTree(FIXTURES_DIR);
    project = await readProjectJson(projectRoot);
    resources = await readAllResources(projectRoot);
    report = await readReport(projectRoot);
  });

  afterAll(async () => {
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("never mutates the source .docx", () => {
    expect(afterHash).toBe(beforeHash);
  });

  it("names the project from the document's core title (FR-14)", () => {
    expect(project.name).toBe("Synthetic Core Properties Fixture");
  });

  it("creates a single resource (no heading at the default split level) named from the document's core title, per FR-14", () => {
    const textResources = resources.filter((r) => r.type === "text");
    expect(textResources).toHaveLength(1);
    expect(textResources[0].name).toBe("Synthetic Core Properties Fixture");
    expect(textResources[0].plainText).toContain("Body text.");
  });

  it("writes the document's core author onto the docx-import group's Author field (FR-14)", () => {
    const textResource = resources.find((r) => r.type === "text");
    expect(textResource?.userMetadata?.author).toBe(
      "GetWrite Fixture Generator",
    );
    expect(project.config?.metadataSchema?.groups.map((g) => g.id)).toContain(
      "docx-import",
    );
    const group = project.config?.metadataSchema?.groups.find(
      (g) => g.id === "docx-import",
    );
    expect(group?.fields.map((f) => f.key)).toContain("author");
  });

  it("records the no-heading-found document in the FR-6 report", () => {
    expect(report).toContain("Documents With No Heading Found");
    expect(report).toContain(sourcePath);
  });
});

describe("importDocxProject — single-file source, multi-heading.docx (FR-2)", () => {
  const sourcePath = path.join(FIXTURES_DIR, "multi-heading.docx");
  let projectRoot: string;
  let resources: (AnyResource & { plainText?: string })[];

  beforeAll(async () => {
    projectRoot = await mkTempProjectRoot(
      "getwrite-docx-import-multi-heading-",
    );
    await importDocxProject({ sourcePath, projectRoot });
    await flushIndexer();
    resources = await readAllResources(projectRoot);
  });

  afterAll(async () => {
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("splits at Heading 1 into a single section carrying the nested H2/H3 and bold/italic runs", async () => {
    const textResources = resources.filter((r) => r.type === "text");
    expect(textResources).toHaveLength(1);
    expect(textResources[0].name).toBe("Chapter One");
    expect((textResources[0] as TextResource).plainText).toContain("A Section");
    expect((textResources[0] as TextResource).plainText).toContain(
      "A Subsection",
    );

    const doc = await readResourceTiptapJson(
      projectRoot,
      (textResources[0] as TextResource).id,
    );
    expect(countMarksOfType(doc, "bold")).toBeGreaterThan(0);
    expect(countMarksOfType(doc, "italic")).toBeGreaterThan(0);
  });

  it("falls back to the source file's basename when no core title/name is supplied", async () => {
    const project = await readProjectJson(projectRoot);
    expect(project.name).toBe("multi-heading");
  });
});

describe("importDocxProject — multi-heading.docx split at level 2 (FR-14 preamble naming)", () => {
  const sourcePath = path.join(FIXTURES_DIR, "multi-heading.docx");
  let projectRoot: string;
  let resources: (AnyResource & { plainText?: string })[];
  let report: string;

  beforeAll(async () => {
    projectRoot = await mkTempProjectRoot("getwrite-docx-import-preamble-");
    await importDocxProject({ sourcePath, projectRoot, splitLevel: 2 });
    await flushIndexer();
    resources = await readAllResources(projectRoot);
    report = await readReport(projectRoot);
  });

  afterAll(async () => {
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it('names the pre-first-heading (H1-only) leading section "Untitled", leaving the real heading title untouched', () => {
    const textResources = (
      resources.filter((r) => r.type === "text") as (TextResource & {
        plainText?: string;
      })[]
    ).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    expect(textResources).toHaveLength(2);
    expect(textResources[0].name).toBe("Untitled");
    expect(textResources[1].name).toBe("A Section");
  });

  it('records the generated "Untitled" resource name in the FR-6(h) report', () => {
    expect(report).toContain("Untitled Fallback Names");
    expect(report).toContain(`"Untitled" (${sourcePath})`);
  });
});

describe("importDocxProject — no-headings.docx (FR-14 no-heading naming, filename fallback)", () => {
  const sourcePath = path.join(FIXTURES_DIR, "no-headings.docx");
  let projectRoot: string;
  let resources: (AnyResource & { plainText?: string })[];

  beforeAll(async () => {
    projectRoot = await mkTempProjectRoot("getwrite-docx-import-no-headings-");
    await importDocxProject({ sourcePath, projectRoot });
    await flushIndexer();
    resources = await readAllResources(projectRoot);
  });

  afterAll(async () => {
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("names the one resulting resource from the source filename, since no-headings.docx has no core title", () => {
    const textResources = resources.filter((r) => r.type === "text");
    expect(textResources).toHaveLength(1);
    expect(textResources[0].name).toBe("no-headings");
  });
});

describe("importDocxProject — single-file source, footnotes-endnotes.docx (FR-13)", () => {
  const sourcePath = path.join(FIXTURES_DIR, "footnotes-endnotes.docx");
  let projectRoot: string;
  let resources: (AnyResource & { plainText?: string })[];
  let report: string;

  beforeAll(async () => {
    projectRoot = await mkTempProjectRoot("getwrite-docx-import-notes-");
    await importDocxProject({ sourcePath, projectRoot, splitLevel: "none" });
    await flushIndexer();
    resources = await readAllResources(projectRoot);
    report = await readReport(projectRoot);
  });

  afterAll(async () => {
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("names the one resource from the source filename (FR-14), since footnotes-endnotes.docx has no core title and no heading at this split level", () => {
    const textResource = resources.find((r) => r.type === "text") as
      | TextResource
      | undefined;
    expect(textResource?.name).toBe("footnotes-endnotes");
  });

  it("renders footnote/endnote references as plain [n] text with a trailing Notes list", () => {
    const textResource = resources.find((r) => r.type === "text") as
      | TextResource
      | undefined;
    expect(textResource?.plainText).toContain("[1]");
    expect(textResource?.plainText).toContain("[2]");
    expect(textResource?.plainText).toContain("Notes");
    expect(textResource?.plainText).toContain("This is the footnote text.");
    expect(textResource?.plainText).toContain("This is the endnote text.");
  });

  it("records the converted footnote/endnote count in the FR-6 report", () => {
    expect(report).toContain("Footnotes/Endnotes Converted");
    expect(report).toMatch(/2 footnote\(s\)\/endnote\(s\)/);
  });
});

describe("importDocxProject — FR-18 package-part detection surfaces in the FR-6 report", () => {
  it("reports tracked changes as accepted-as-shown, never as skipped content", async () => {
    const projectRoot = await mkTempProjectRoot(
      "getwrite-docx-import-tracked-",
    );
    await importDocxProject({
      sourcePath: path.join(FIXTURES_DIR, "tracked-changes.docx"),
      projectRoot,
    });
    await flushIndexer();
    const report = await readReport(projectRoot);
    expect(report).toContain("Tracked Changes");
    expect(report).toMatch(/2 tracked change\(s\)/);

    const resources = await readAllResources(projectRoot);
    const textResource = resources.find((r) => r.type === "text") as
      | TextResource
      | undefined;
    expect(textResource?.plainText).toContain("Inserted text.");
    expect(textResource?.plainText).not.toContain("Deleted text.");

    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("reports comments as not imported and never lets comment text reach prose", async () => {
    const projectRoot = await mkTempProjectRoot(
      "getwrite-docx-import-comments-",
    );
    await importDocxProject({
      sourcePath: path.join(FIXTURES_DIR, "comments.docx"),
      projectRoot,
    });
    await flushIndexer();
    const report = await readReport(projectRoot);
    expect(report).toContain("Comments Not Imported");
    expect(report).toMatch(/1 comment\(s\)/);

    const resources = await readAllResources(projectRoot);
    const textResource = resources.find((r) => r.type === "text") as
      | TextResource
      | undefined;
    expect(textResource?.plainText).not.toContain("This is a comment.");

    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("reports images/embedded media as not imported and strips them from prose", async () => {
    const projectRoot = await mkTempProjectRoot("getwrite-docx-import-image-");
    await importDocxProject({
      sourcePath: path.join(FIXTURES_DIR, "with-image.docx"),
      projectRoot,
    });
    await flushIndexer();
    const report = await readReport(projectRoot);
    expect(report).toContain("Images/Embedded Media Not Imported");
    expect(report).toMatch(/1 image\(s\)/);

    const resources = await readAllResources(projectRoot);
    const textResource = resources.find((r) => r.type === "text") as
      | TextResource
      | undefined;
    const doc = await readResourceTiptapJson(projectRoot, textResource!.id);
    expect(flattenText(doc)).not.toContain("data:image");

    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });
});

describe("importDocxProject — folder source (FR-3, FR-15)", () => {
  const sourcePath = path.join(FIXTURES_DIR, "folder-source");
  let projectRoot: string;
  let beforeHash: string;
  let afterHash: string;
  let project: Project;
  let folders: FolderLike[];
  let resources: (AnyResource & { plainText?: string })[];
  let report: string;

  beforeAll(async () => {
    beforeHash = await hashTree(sourcePath);
    projectRoot = await mkTempProjectRoot("getwrite-docx-import-folder-");

    await importDocxProject({ sourcePath, projectRoot });
    await flushIndexer();

    afterHash = await hashTree(sourcePath);
    project = await readProjectJson(projectRoot);
    folders = await readAllFolders(projectRoot);
    resources = await readAllResources(projectRoot);
    report = await readReport(projectRoot);
  });

  afterAll(async () => {
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("never mutates the source folder tree", () => {
    expect(afterHash).toBe(beforeHash);
  });

  it("names the project from the source folder's own basename", () => {
    expect(project.name).toBe("folder-source");
  });

  it("mirrors the nested subfolder and creates one resource per .docx file, skipping non-docx/lock/hidden entries", () => {
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe("nested-subfolder");

    const textResources = resources.filter((r) => r.type === "text");
    expect(textResources).toHaveLength(1);
    expect(textResources[0].name).toBe("nested");
    expect((textResources[0] as TextResource).folderId).toBe(folders[0].id);
    expect((textResources[0] as TextResource).plainText).toContain(
      "A nested document.",
    );
  });

  it("summarizes folder-source skip categories in the FR-6 report (one non-docx file, one lock file, two hidden entries)", () => {
    expect(report).toContain("Non-.docx files skipped: 1");
    expect(report).toContain("Word lock files (~$*.docx) skipped: 1");
    expect(report).toContain("Hidden/dot files or directories skipped: 2");
  });
});

describe("importDocxProject — no diagnostics on a successful import (FR-19)", () => {
  // Measured cause (Task 21): `sidecar.ts`'s `readSidecar` unconditionally
  // logged `console.warn("sidecar not found for", resourceId, "at",
  // filePath)` on every `ENOENT`, and `writeSidecar` (called from
  // `resource-persistence.ts:200`'s `writeResourceToFile`) called
  // `readSidecar` to capture a "previous" sidecar before every resource's
  // very first write — which, for a brand-new resource, always misses. This
  // fired once per resource `importDocxProject` created (confirmed via a
  // stack trace captured on a real run: `readSidecar` (sidecar.ts) <-
  // `writeSidecar` (sidecar.ts) <- `writeResourceToFile`
  // (resource-persistence.ts:200) <- `createAndWriteDocxResource`
  // (import-docx-project.ts:396) <- `writeSingleFileSections`/
  // `writeFolderEntries`), not from `importDocxProject`'s own final
  // `rebuildIndexes` step, whose own `readSidecar` calls (import-docx-
  // project.ts:716) never missed by the time they ran, since every
  // resource's sidecar had already been written by then, and never covered
  // folder resources at all (`listResourceIds` only reads the `resources/`
  // directory, which folder resources never occupy).

  async function runImportSilently(
    options: Parameters<typeof importDocxProject>[0],
  ): Promise<{ warnCalls: unknown[][]; errorCalls: unknown[][] }> {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await importDocxProject(options);
      await flushIndexer();
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
    return { warnCalls: warnSpy.mock.calls, errorCalls: errorSpy.mock.calls };
  }

  it("prints no console.warn/console.error diagnostic for a single-file source", async () => {
    const projectRoot = await mkTempProjectRoot(
      "getwrite-docx-import-no-diagnostics-file-",
    );
    try {
      const { warnCalls, errorCalls } = await runImportSilently({
        sourcePath: path.join(FIXTURES_DIR, "core-properties.docx"),
        projectRoot,
      });
      expect(warnCalls).toEqual([]);
      expect(errorCalls).toEqual([]);
    } finally {
      await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it("prints no console.warn/console.error diagnostic for a folder source", async () => {
    const projectRoot = await mkTempProjectRoot(
      "getwrite-docx-import-no-diagnostics-folder-",
    );
    try {
      const { warnCalls, errorCalls } = await runImportSilently({
        sourcePath: path.join(FIXTURES_DIR, "folder-source"),
        projectRoot,
      });
      expect(warnCalls).toEqual([]);
      expect(errorCalls).toEqual([]);
    } finally {
      await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });
});

describe("importDocxProject — refusals before any write", () => {
  it("refuses an unknown project type before any write (FR-8)", async () => {
    const projectRoot = await mkTempProjectRoot(
      "getwrite-docx-import-badtype-",
    );

    await expect(
      importDocxProject({
        sourcePath: path.join(FIXTURES_DIR, "no-headings.docx"),
        projectRoot,
        projectType: "not-a-real-project-type",
      }),
    ).rejects.toThrow(UnknownProjectTypeError);

    await expect(fs.stat(projectRoot)).rejects.toThrow();
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("refuses a non-empty pre-existing destination before any write (FR-7)", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-docx-import-nonempty-"),
    );
    await fs.writeFile(
      path.join(projectRoot, "pre-existing-file.txt"),
      "already here",
      "utf8",
    );

    let caughtError: unknown;
    try {
      await importDocxProject({
        sourcePath: path.join(FIXTURES_DIR, "no-headings.docx"),
        projectRoot,
      });
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError).toBeInstanceOf(DocxDestinationNotEmptyError);
    expect((caughtError as Error).message).not.toContain("Scrivener");

    const entries = await fs.readdir(projectRoot);
    expect(entries).toEqual(["pre-existing-file.txt"]);

    await fs.rm(projectRoot, { recursive: true, force: true });
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

describe("importDocxProject — writing log (Feature 59, FR-3/FR-10)", () => {
  it("writes exactly one 'docx' additions entry equal to the total imported words, after the index rebuild", async () => {
    const projectRoot = await mkTempProjectRoot("getwrite-docx-import-log-");
    let mentionsExistedAtAppend = false;
    const actual = (
      await vi.importActual<typeof import("../../src/lib/models/writing-log")>(
        "../../src/lib/models/writing-log",
      )
    ).appendWritingLogEntry;
    vi.mocked(appendWritingLogEntry).mockImplementationOnce(async (...args) => {
      mentionsExistedAtAppend = await fs
        .stat(path.join(projectRoot, "meta", "index", "mentions.json"))
        .then(() => true)
        .catch(() => false);
      return actual(...args);
    });
    await importDocxProject({
      sourcePath: path.join(FIXTURES_DIR, "multi-heading.docx"),
      projectRoot,
    });
    await flushIndexer();

    const resources = await readAllResources(projectRoot);
    const totalWords = resources.reduce(
      (n, r) => n + countWords((r as { plainText?: string }).plainText ?? ""),
      0,
    );
    expect(totalWords).toBeGreaterThan(0);
    const entries = await readAllLogEntries(projectRoot);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      added: totalWords,
      deleted: 0,
      net: totalWords,
      source: "docx",
    });
    expect(mentionsExistedAtAppend).toBe(true);
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });

  it("leaves no orphan log when a fatal error deletes the run-created projectRoot", async () => {
    const projectRoot = await mkTempProjectRoot(
      "getwrite-docx-import-logfail-",
    );
    vi.mocked(appendWritingLogEntry).mockRejectedValueOnce(
      new Error("injected log failure"),
    );
    await expect(
      importDocxProject({
        sourcePath: path.join(FIXTURES_DIR, "multi-heading.docx"),
        projectRoot,
      }),
    ).rejects.toThrow("injected log failure");
    await flushIndexer();
    await expect(fs.stat(projectRoot)).rejects.toThrow();
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true });
  });
});
