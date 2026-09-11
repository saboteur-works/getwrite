import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  importScrivenerProject,
  UnsupportedScrivenerProjectError,
} from "../../src/lib/models/scrivener/import-scrivener-project";
import { readSidecar } from "../../src/lib/models/sidecar";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import type {
  AnyResource,
  Folder as FolderType,
  Project,
  TextResource,
} from "../../src/lib/models/types";

const FIXTURE_SCRIV_DIR = path.join(
  __dirname,
  "..",
  "fixtures",
  "scrivener",
  "sample.scriv",
);

/** Recursively hashes every file under `dir` (relative path + content), producing a single digest stable across re-runs of the same tree. */
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

async function readProjectJson(projectRoot: string): Promise<Project> {
  const raw = await fs.readFile(path.join(projectRoot, "project.json"), "utf8");
  return JSON.parse(raw) as Project;
}

async function readAllFolders(projectRoot: string): Promise<FolderType[]> {
  const foldersDir = path.join(projectRoot, "folders");
  const folders: FolderType[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      const descriptorPath = path.join(full, "folder.json");
      try {
        const raw = await fs.readFile(descriptorPath, "utf8");
        folders.push(JSON.parse(raw) as FolderType);
      } catch {
        // not a folder descriptor dir; ignore
      }
      await walk(full);
    }
  }
  await walk(foldersDir);
  return folders;
}

async function readAllResources(projectRoot: string): Promise<AnyResource[]> {
  const metaDir = path.join(projectRoot, "meta");
  const entries = await fs.readdir(metaDir);
  const resources: AnyResource[] = [];
  for (const entry of entries) {
    if (!entry.startsWith("resource-") || !entry.endsWith(".meta.json"))
      continue;
    const raw = await fs.readFile(path.join(metaDir, entry), "utf8");
    const sidecar = JSON.parse(raw) as AnyResource;
    if (sidecar.type === "text") {
      const contentPath = path.join(
        projectRoot,
        "resources",
        (sidecar as TextResource).id,
        "content.txt",
      );
      try {
        (sidecar as TextResource).plainText = await fs.readFile(
          contentPath,
          "utf8",
        );
      } catch {
        // no content.txt; leave plainText unset
      }
    }
    resources.push(sidecar);
  }
  return resources;
}

// FR-18: the fixture now uses the measured real-project shapes. As of this
// task, `importScrivenerProject` (via `parseScrivxFile`) throws on this
// fixture (`scrivx-parser.ts`'s `readCustomMetaDataValues` still requires an
// `ID` attribute on `MetaDataItem`, which the real shape no longer carries),
// so every test in this describe block fails at `beforeAll` until a later
// task updates the parser/mapper to read the new shapes — the assertions
// themselves already describe the correct target behavior.
describe("importScrivenerProject — Task 1 fixture", () => {
  let projectRoot: string;
  let beforeHash: string;
  let afterHash: string;
  let folders: FolderType[];
  let resources: AnyResource[];
  let project: Project;

  beforeAll(async () => {
    beforeHash = await hashTree(FIXTURE_SCRIV_DIR);

    projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-import-"),
    );

    await importScrivenerProject({ scrivPath: FIXTURE_SCRIV_DIR, projectRoot });
    // Sidecar writes during import enqueue fire-and-forget background
    // indexing tasks (`sidecar.ts`'s `enqueueIndex`); drain them before
    // hashing/reading so nothing races the assertions or the temp-dir cleanup.
    await flushIndexer();

    afterHash = await hashTree(FIXTURE_SCRIV_DIR);

    project = await readProjectJson(projectRoot);
    folders = await readAllFolders(projectRoot);
    resources = await readAllResources(projectRoot);
  });

  afterAll(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("does not modify the source fixture directory", () => {
    expect(afterHash).toBe(beforeHash);
  });

  it("does not write anywhere under the repo's real projects/ directory", () => {
    expect(projectRoot).not.toContain(`${path.sep}projects${path.sep}`);
    expect(projectRoot.startsWith(os.tmpdir())).toBe(true);
  });

  it("places 'Chapter One' and 'Chapter Two' at the project root with no 'Manuscript' wrapper", () => {
    expect(folders.some((f) => f.name === "Manuscript")).toBe(false);
    const chapterOne = folders.find(
      (f) => f.name === "Chapter One" && f.parentId == null,
    );
    const chapterTwo = folders.find(
      (f) => f.name === "Chapter Two" && f.parentId == null,
    );
    expect(chapterOne).toBeDefined();
    expect(chapterTwo).toBeDefined();
  });

  it("FR-13: 'Chapter One' (Folder with own content.rtf) has a first-child text resource named after it", () => {
    const chapterOne = folders.find(
      (f) => f.name === "Chapter One" && f.parentId == null,
    )!;
    const ownResource = resources.find(
      (r): r is TextResource =>
        r.type === "text" &&
        r.name === "Chapter One" &&
        r.folderId === chapterOne.id,
    );
    expect(ownResource).toBeDefined();
  });

  it("FR-13: 'Chapter Two' (Text with children) is a folder containing its own text first, then 'Scene One'", () => {
    const chapterTwo = folders.find(
      (f) => f.name === "Chapter Two" && f.parentId == null,
    )!;
    const ownResource = resources.find(
      (r): r is TextResource =>
        r.type === "text" &&
        r.name === "Chapter Two" &&
        r.folderId === chapterTwo.id,
    );
    const sceneOne = resources.find(
      (r): r is TextResource =>
        r.type === "text" &&
        r.name === "Scene One" &&
        r.folderId === chapterTwo.id,
    );
    expect(ownResource).toBeDefined();
    expect(sceneOne).toBeDefined();
    expect((ownResource as TextResource).orderIndex).toBe(0);
    expect((sceneOne as TextResource).orderIndex).toBe(1);
  });

  it("converts content.rtf to plain text with bold/italic and drops the HYPERLINK to plain text", () => {
    const chapterTwoText = resources.find(
      (r): r is TextResource => r.type === "text" && r.name === "Chapter Two",
    ) as TextResource;
    expect(chapterTwoText.plainText).toContain("bold");
    expect(chapterTwoText.plainText).toContain("italic");
    expect(chapterTwoText.plainText).toContain("reference link");
    expect(chapterTwoText.plainText).not.toContain("HYPERLINK");
  });

  it("places Research text content under a top-level 'Research' folder", () => {
    const research = folders.find(
      (f) => f.name === "Research" && f.parentId == null,
    );
    expect(research).toBeDefined();
    const characterNotes = resources.find(
      (r): r is TextResource =>
        r.type === "text" &&
        r.name === "Character Notes" &&
        r.folderId === research!.id,
    );
    expect(characterNotes).toBeDefined();
  });

  it("FR-17: creates the 'Archive' top-level user folder with its 'Old Draft' child", () => {
    const archive = folders.find(
      (f) => f.name === "Archive" && f.parentId == null,
    );
    expect(archive).toBeDefined();
    const oldDraft = resources.find(
      (r): r is TextResource =>
        r.type === "text" &&
        r.name === "Old Draft" &&
        r.folderId === archive!.id,
    );
    expect(oldDraft).toBeDefined();
  });

  it("excludes Trash content and the 'Type=Other' item entirely", () => {
    expect(resources.some((r) => r.name === "Deleted Scene")).toBe(false);
    expect(resources.some((r) => r.name === "Sync Conflict Artifact")).toBe(
      false,
    );
    expect(folders.some((f) => f.name === "Sync Conflict Artifact")).toBe(
      false,
    );
  });

  it("seeds config.statuses from StatusSettings", () => {
    expect(project.config?.statuses).toContain("First Draft");
    expect(project.config?.statuses).toContain("Final Draft");
  });

  it("resolves Chapter Two's status, label, and custom-field sidecar values", async () => {
    const chapterTwoText = resources.find(
      (r): r is TextResource => r.type === "text" && r.name === "Chapter Two",
    ) as TextResource;
    const sidecar = await readSidecar(projectRoot, chapterTwoText.id);
    const userMetadata = sidecar?.userMetadata as Record<string, unknown>;

    expect(userMetadata.status).toBe("Final Draft");
    expect(userMetadata.label).toBe("Character POV");
    expect(userMetadata["working-title"]).toBe("Working title placeholder");
    // FR-18: Chapter Two's Deadline now carries the sub-second-precision
    // Date shape measured off the real project.
    expect(userMetadata.deadline).toBe("2026-12-01 09:30:00.12345 +0000");
    // FR-18: the List-type value stores the ListOptions/Option id
    // ("OPT-PROTAG"), which the importer must resolve to its display text.
    expect(userMetadata["pov-character"]).toBe("Protagonist");
    expect(userMetadata.synopsis).toBeTruthy();
    expect(userMetadata.notes).toBe("A placeholder note about Chapter Two.");
  });

  // FR-18: one measured real StatusID value was -1 (meaning unconfirmed,
  // plausibly "No Status") — it does not resolve to a status name, so no
  // `status` key should be set on 'Old Draft's sidecar at all.
  it("does not set a status for 'Old Draft', whose StatusID (-1) does not resolve", async () => {
    const oldDraftText = resources.find(
      (r): r is TextResource => r.type === "text" && r.name === "Old Draft",
    ) as TextResource;
    const sidecar = await readSidecar(projectRoot, oldDraftText.id);
    const userMetadata = sidecar?.userMetadata as Record<string, unknown>;
    expect(userMetadata?.status).toBeUndefined();
  });

  it("creates the Label field and every custom field on the metadata schema", () => {
    const schema = project.config?.metadataSchema;
    expect(schema).toBeDefined();
    const importGroup = schema!.groups.find((g) => g.id === "scrivener-import");
    expect(importGroup).toBeDefined();
    const fieldKeys = importGroup!.fields.map((f) => f.key);
    expect(fieldKeys).toContain("label");
    expect(fieldKeys).toContain("working-title");
    expect(fieldKeys).toContain("deadline");
    expect(fieldKeys).toContain("pov-character");

    const labelField = importGroup!.fields.find((f) => f.key === "label");
    expect(labelField?.type).toBe("select");
    expect(labelField?.options).toEqual(["No Label", "Character POV"]);
  });

  it("enables the synopsis and notes feature toggles since Chapter Two carries both", () => {
    expect(project.config?.features?.synopsis).toBe(true);
    expect(project.config?.features?.notes).toBe(true);
  });

  it("merges the two same-leaf-name 'Case' keywords into one tag, assigned to both documents", () => {
    const tags = project.config?.tags ?? [];
    const caseTags = tags.filter((t) => t.name === "Case");
    expect(caseTags).toHaveLength(1);
    const caseTagId = caseTags[0].id;

    const chapterTwoText = resources.find(
      (r): r is TextResource => r.type === "text" && r.name === "Chapter Two",
    ) as TextResource;
    const sceneOneText = resources.find(
      (r): r is TextResource => r.type === "text" && r.name === "Scene One",
    ) as TextResource;

    const assignments = project.config?.tagAssignments ?? {};
    expect(assignments[chapterTwoText.id]).toContain(caseTagId);
    expect(assignments[sceneOneText.id]).toContain(caseTagId);
  });

  it("writes a readable report covering skips, keyword merges, excluded items, trash, and snapshots", async () => {
    const reportPath = path.join(projectRoot, "scrivener-import-report.txt");
    const report = await fs.readFile(reportPath, "utf8");

    expect(report).toContain("# Scrivener Import Report");
    expect(report).toContain("## Keyword Merges");
    expect(report).toContain('"Case"');
    expect(report).toContain("## Unconverted Research Content");
    expect(report).toContain("Sync Conflict Artifact");
    expect(report).toContain('## Excluded "Other" Items');
    expect(report).toContain("## Trash Content");
    expect(report).toContain("Deleted Scene");
    expect(report).toContain("## Snapshot History");
    expect(report).toContain("Chapter Two");
    expect(report).toContain("## Skipped Items");
    expect(report).toContain("HYPERLINK");
  });

  it("rebuilds the destination project's indexes", async () => {
    const backlinksPath = path.join(projectRoot, "meta", "backlinks.json");
    await expect(fs.stat(backlinksPath)).resolves.toBeDefined();
    const mentionsPath = path.join(
      projectRoot,
      "meta",
      "index",
      "mentions.json",
    );
    await expect(fs.stat(mentionsPath)).resolves.toBeDefined();
  });
});

describe("importScrivenerProject — FR-2 refusal", () => {
  it("refuses and writes nothing to projectRoot for a non-SCRMAC-3 Creator", async () => {
    const scrivDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-unsupported-"),
    );
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-refusal-dest-"),
    );
    // The destination directory itself is allowed to pre-exist (mkdtemp
    // created it); the assertion is that nothing is written *into* it.
    await fs.rmdir(projectRoot);

    try {
      const scrivxPath = path.join(scrivDir, "unsupported.scrivx");
      await fs.writeFile(
        scrivxPath,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Identifier="X" Version="2.0" Creator="WinWORD-1.0" Device="Test">
  <Binder>
    <BinderItem UUID="1" Type="DraftFolder" Title="Draft"/>
  </Binder>
</ScrivenerProject>`,
        "utf8",
      );

      await expect(
        importScrivenerProject({ scrivPath: scrivDir, projectRoot }),
      ).rejects.toBeInstanceOf(UnsupportedScrivenerProjectError);

      await expect(fs.stat(projectRoot)).rejects.toThrow();
    } finally {
      await fs.rm(scrivDir, { recursive: true, force: true });
      await fs
        .rm(projectRoot, { recursive: true, force: true })
        .catch(() => {});
    }
  });
});
