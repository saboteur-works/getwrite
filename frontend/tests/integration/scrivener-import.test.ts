import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  importScrivenerProject,
  UnsupportedScrivenerProjectError,
} from "../../src/lib/models/scrivener/import-scrivener-project";
import { readSidecar } from "../../src/lib/models/sidecar";
import { revisionDir } from "../../src/lib/models/revision";
import { flushIndexer, enqueueIndex } from "../../src/lib/models/indexer-queue";
import { startBacklinkWatcher } from "../../src/lib/models/backlinks-watcher";
import { indexResource } from "../../src/lib/models/inverted-index";
import { applyDocumentMetadata } from "../../src/lib/models/scrivener/apply-document-metadata";
import type {
  AnyResource,
  Folder as FolderType,
  Project,
  TextResource,
} from "../../src/lib/models/types";

// Task 16/FR-22 (Task 18): lets individual tests inject a one-time fatal
// error partway through the importer's write phase — after
// `applyDocumentMetadata` is first called, which only happens once its
// owning resource's `content.rtf`/revision have already been written to
// disk (`import-scrivener-project.ts`'s `createAndWriteResource` runs before
// `applySynopsisAndNotes`/`applyDocumentMetadata` for each resource). Falls
// through to the real implementation otherwise, so every other describe
// block in this file is unaffected.
vi.mock(
  "../../src/lib/models/scrivener/apply-document-metadata",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/lib/models/scrivener/apply-document-metadata")
      >();
    return {
      ...actual,
      applyDocumentMetadata: vi.fn(actual.applyDocumentMetadata),
    };
  },
);

// Task 16/FR-23 (Task 19): lets tests observe whether the importer started a
// backlinks watcher for its destination project. `indexer-queue.ts`'s own
// `ensureBacklinkWatcher` never calls this under `VITEST`/`NODE_ENV=test`
// (see its guard comment), so this spy also verifies the *importer* never
// tries to go through a path that would start one outside test environments.
vi.mock("../../src/lib/models/backlinks-watcher", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/models/backlinks-watcher")
    >();
  return {
    ...actual,
    startBacklinkWatcher: vi.fn(actual.startBacklinkWatcher),
  };
});

// Task 16/FR-23 (Task 19): lets tests observe whether `enqueueIndex` was
// ever called during the import. `sidecar.ts`'s `writeSidecar` reaches this
// via a dynamic `import("./indexer-queue")` on every sidecar write — vitest's
// module mock applies to that dynamic import too, since it intercepts the
// same module specifier regardless of how it is imported.
vi.mock("../../src/lib/models/indexer-queue", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/indexer-queue")>();
  return { ...actual, enqueueIndex: vi.fn(actual.enqueueIndex) };
});

// Task 19 (FR-23): `enqueueIndex` is still invoked by `writeSidecar` even
// while suspended — it's a no-op symbol call, not a sign real work happened
// (see `indexer-queue.ts`'s `withIndexingSuspended` doc comment). The real
// signal that no background indexing occurred during the write phase is
// whether `indexResource` (the actual per-resource indexing work,
// `inverted-index.ts`) ran — which it should only ever do from this
// importer's own final FR-11 rebuild pass, never from a suspended
// `enqueueIndex` call in between.
vi.mock("../../src/lib/models/inverted-index", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/models/inverted-index")
    >();
  return { ...actual, indexResource: vi.fn(actual.indexResource) };
});

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

/** Minimal shape this test needs to walk a TipTap document tree. */
interface TipTapNodeLike {
  type?: string;
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

/** Counts top-level `content` nodes of the given `type` on a TipTap doc. */
function countTopLevelNodesOfType(doc: TipTapNodeLike, type: string): number {
  return (doc.content ?? []).filter((node) => node.type === type).length;
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

  // FR-4: the canonical revision must be written as the serialized TipTap
  // document (matching content.tiptap.json byte-for-byte in content, not
  // resource.plainText), so opening the import in the editor renders the
  // real structure instead of collapsing to one flattened paragraph. No
  // single fixture document in this checked-in sample.scriv combines
  // multiple paragraphs with a bold/italic mark, so paragraph-count parity
  // is checked against "Mixed Par And Backslash Newline" (3 paragraphs, no
  // marks) below, and mark-count parity against "Chapter Two" (1 paragraph,
  // bold + italic) in the following test — together covering all four
  // required checks against real structural counts from each resource's own
  // content.tiptap.json.
  it("FR-4: writes the canonical revision as JSON matching content.tiptap.json's paragraph count", async () => {
    const mixedParagraphsText = resources.find(
      (r): r is TextResource =>
        r.type === "text" && r.name === "Mixed Par And Backslash Newline",
    ) as TextResource;
    expect(mixedParagraphsText).toBeDefined();

    const tiptapJson = await readResourceTiptapJson(
      projectRoot,
      mixedParagraphsText.id,
    );
    const revisionContentPath = path.join(
      revisionDir(projectRoot, mixedParagraphsText.id, 1),
      "content.bin",
    );
    const revisionRaw = await fs.readFile(revisionContentPath, "utf8");

    let revisionDoc: TipTapNodeLike | undefined;
    expect(() => {
      revisionDoc = JSON.parse(revisionRaw) as TipTapNodeLike;
    }).not.toThrow();
    expect(revisionDoc!.type).toBe("doc");

    const expectedParagraphCount = countTopLevelNodesOfType(
      tiptapJson,
      "paragraph",
    );
    // Sanity check the fixture actually exercises multiple paragraphs.
    expect(expectedParagraphCount).toBeGreaterThan(1);
    expect(countTopLevelNodesOfType(revisionDoc!, "paragraph")).toBe(
      expectedParagraphCount,
    );
  });

  it("FR-4: writes the canonical revision as JSON matching content.tiptap.json's bold/italic mark counts", async () => {
    const chapterTwoText = resources.find(
      (r): r is TextResource => r.type === "text" && r.name === "Chapter Two",
    ) as TextResource;

    const tiptapJson = await readResourceTiptapJson(
      projectRoot,
      chapterTwoText.id,
    );
    const revisionContentPath = path.join(
      revisionDir(projectRoot, chapterTwoText.id, 1),
      "content.bin",
    );
    const revisionRaw = await fs.readFile(revisionContentPath, "utf8");

    let revisionDoc: TipTapNodeLike | undefined;
    expect(() => {
      revisionDoc = JSON.parse(revisionRaw) as TipTapNodeLike;
    }).not.toThrow();
    expect(revisionDoc!.type).toBe("doc");

    const expectedBoldCount = countMarksOfType(tiptapJson, "bold");
    const expectedItalicCount = countMarksOfType(tiptapJson, "italic");
    expect(expectedBoldCount).toBeGreaterThan(0);
    expect(expectedItalicCount).toBeGreaterThan(0);
    expect(countMarksOfType(revisionDoc!, "bold")).toBe(expectedBoldCount);
    expect(countMarksOfType(revisionDoc!, "italic")).toBe(expectedItalicCount);
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

  // Task 16, expected red until Task 17 lands (FR-7's amendment): today,
  // `buildMetadataPlan` derives the fixture's "POV" field to the unsuffixed
  // key "pov", which collides with `default-metadata-schema.ts`'s built-in
  // "pov" (Point of View) field — the same collision the amendment's
  // motivating real-project abort measured (`Error: Field key already
  // exists: "pov"`). Until Task 17 adds the built-in/already-added key
  // check and suffix retry, this collision throws out of `addField` and
  // aborts the whole import, which is why every test in this describe block
  // (all sharing the one `beforeAll` import run) is red right now, not just
  // this one.
  it("FR-7/Task 17: renames the colliding 'POV' field to 'pov-scrivener', keeps 'POV' as its label, and records the rename in the report", async () => {
    const schema = project.config?.metadataSchema;
    const importGroup = schema?.groups.find((g) => g.id === "scrivener-import");
    const povField = importGroup?.fields.find((f) => f.label === "POV");

    expect(povField).toBeDefined();
    // FR-7's suffix rule: <original-key>-scrivener, then -scrivener-2, ...,
    // using the first free key. "pov" collides with the built-in field, so
    // the first candidate, "pov-scrivener", must be the one actually used
    // (nothing else in the fixture's schema claims it).
    expect(povField?.key).toBe("pov-scrivener");
    expect(povField?.type).toBe("text");

    const reportPath = path.join(projectRoot, "scrivener-import-report.txt");
    const report = await fs.readFile(reportPath, "utf8");
    // FR-7: "every such rename MUST be listed in the FR-9 report (original
    // key, field title, renamed key)".
    expect(report).toContain("pov");
    expect(report).toContain("pov-scrivener");
    expect(report).toContain("POV");
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

// Task 14: a small, synthetic (not the checked-in fixture) .scrivx project
// exercising Task 12's fragment-error recovery, FR-19's untitled fallback
// naming, and Task 13's unresolvable-StatusID value skip, end to end
// through the orchestrator and into the written report — confirming none of
// these recoverable cases aborts the import.
describe("importScrivenerProject — recoverable skips (Task 14)", () => {
  const dataUuid = "EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE";
  let scrivDir: string;
  let projectRoot: string;
  let report: string;
  let resources: AnyResource[];

  beforeAll(async () => {
    scrivDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-skips-src-"),
    );
    const dataDir = path.join(scrivDir, "Files", "Data", dataUuid);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "content.rtf"),
      String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2639\f0\fs24 \cf0 Untitled body text.\par}`,
      "utf8",
    );
    await fs.writeFile(
      path.join(scrivDir, "sample.scrivx"),
      `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Identifier="X" Version="2.0" Creator="SCRMAC-3.5.2" Device="Test">
  <Binder>
    <BinderItem UUID="DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD" Type="DraftFolder" Created="2026-01-01 00:00:00 +0000" Modified="2026-01-01 00:00:00 +0000">
      <Title>Draft</Title>
      <Children>
        <BinderItem UUID="${dataUuid}" Type="Text" Created="2026-01-01 00:00:00 +0000" Modified="2026-01-01 00:00:00 +0000">
          <MetaData>
            <StatusID>-1</StatusID>
            <CustomMetaData>
              <MetaDataItem>
                <Value>orphaned value, missing FieldID</Value>
              </MetaDataItem>
            </CustomMetaData>
          </MetaData>
        </BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>`,
      "utf8",
    );

    projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-skips-dest-"),
    );
    await importScrivenerProject({ scrivPath: scrivDir, projectRoot });
    await flushIndexer();

    report = await fs.readFile(
      path.join(projectRoot, "scrivener-import-report.txt"),
      "utf8",
    );
    resources = await readAllResources(projectRoot);
  });

  afterAll(async () => {
    await fs.rm(scrivDir, { recursive: true, force: true });
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("does not abort on the malformed <MetaDataItem> fragment or the unresolvable StatusID — the resource still imports", () => {
    const textResource = resources.find(
      (r): r is TextResource => r.type === "text",
    );
    expect(textResource).toBeDefined();
    expect(textResource?.plainText).toContain("Untitled body text.");
  });

  it("FR-19: lists the untitled fallback name in its own report section", () => {
    expect(report).toContain("## Untitled Fallback Names");
    expect(report).toContain('- "Untitled" (Draft/Untitled)');
  });

  it("folds the .scrivx fragment error and the unresolved StatusID value skip into the existing Skipped Items section", () => {
    expect(report).toContain("## Skipped Items");
    expect(report).toContain("FieldID");
    expect(report).toContain('StatusID "-1"');
  });
});

// Task 16, expected red until Task 18 lands (FR-22): destination-cleanup
// behavior for a fatal error raised after the import's write phase has
// started, plus the up-front refusal of a non-empty pre-existing
// `projectRoot`. Uses a small, dedicated scriv fixture (rather than the
// larger sample.scriv fixture above) so each case's expectations about
// exactly what got written are simple to state and check.
describe("importScrivenerProject — FR-22 destination cleanup (Task 18)", () => {
  let scrivDir: string;

  beforeAll(async () => {
    scrivDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-fr22-src-"),
    );
    const dataDir = path.join(
      scrivDir,
      "Files",
      "Data",
      "F0000000-0000-4000-8000-000000000001",
    );
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "content.rtf"),
      String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2639\f0\fs24 \cf0 FR-22 body text.\par}`,
      "utf8",
    );
    await fs.writeFile(
      path.join(scrivDir, "sample.scrivx"),
      `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Identifier="X" Version="2.0" Creator="SCRMAC-3.5.2" Device="Test">
  <Binder>
    <BinderItem UUID="F1111111-1111-4111-8111-111111111111" Type="DraftFolder" Created="2026-01-01 00:00:00 +0000" Modified="2026-01-01 00:00:00 +0000">
      <Title>Draft</Title>
      <Children>
        <BinderItem UUID="F0000000-0000-4000-8000-000000000001" Type="Text" Created="2026-01-01 00:00:00 +0000" Modified="2026-01-01 00:00:00 +0000">
          <Title>Only Document</Title>
        </BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>`,
      "utf8",
    );
  });

  afterAll(async () => {
    await fs.rm(scrivDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.mocked(applyDocumentMetadata).mockClear();
  });

  it("(a) removes a projectRoot this run created, after a fatal error raised once writing has started", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-fr22-notexist-"),
    );
    const projectRoot = path.join(parent, "destination");
    await expect(fs.stat(projectRoot)).rejects.toThrow();

    vi.mocked(applyDocumentMetadata).mockRejectedValueOnce(
      new Error("FR-22 injected fatal error (Task 18)"),
    );

    await expect(
      importScrivenerProject({ scrivPath: scrivDir, projectRoot }),
    ).rejects.toThrow("FR-22 injected fatal error");
    // Drain any fire-and-forget background indexing the partial write
    // already triggered (`sidecar.ts`'s `writeSidecar` enqueues via
    // `setImmediate`), so it can't race the cleanup assertion/rm below.
    await flushIndexer();

    // Task 18: projectRoot did not exist before this run, so a fatal error
    // after writing started must remove it entirely.
    await expect(fs.stat(projectRoot)).rejects.toThrow();

    await fs.rm(parent, { recursive: true, force: true }).catch(() => {});
  });

  it("(b) leaves an already-existing (empty) projectRoot untouched after the same injected fatal error", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-fr22-preexist-"),
    );

    vi.mocked(applyDocumentMetadata).mockRejectedValueOnce(
      new Error("FR-22 injected fatal error (Task 18)"),
    );

    await expect(
      importScrivenerProject({ scrivPath: scrivDir, projectRoot }),
    ).rejects.toThrow("FR-22 injected fatal error");
    await flushIndexer();

    // Task 18: projectRoot existed before this run, so it must be left
    // exactly as far as the run got — never removed.
    await expect(fs.stat(projectRoot)).resolves.toBeDefined();

    await fs.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
  });

  it("(c) refuses a non-empty pre-existing projectRoot before any write, and writes nothing", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-fr22-nonempty-"),
    );
    await fs.writeFile(
      path.join(projectRoot, "pre-existing-file.txt"),
      "already here",
      "utf8",
    );

    await expect(
      importScrivenerProject({ scrivPath: scrivDir, projectRoot }),
    ).rejects.toThrow();
    await flushIndexer();

    // Task 18: refused before any write — the only file present is the one
    // that was already there.
    const entries = await fs.readdir(projectRoot);
    expect(entries).toEqual(["pre-existing-file.txt"]);

    await fs.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
  });
});

// Task 16, expected red until Task 19 lands (FR-23): a successful import run
// must not leave GetWrite's normal background indexing/backlinks-watcher
// machinery running or triggered during the write phase.
describe("importScrivenerProject — FR-23 no leftover indexing (Task 19)", () => {
  // Deliberately a small, dedicated fixture (no CustomMetaData fields at
  // all) rather than the sample.scriv fixture above — that one now carries
  // the FR-7 "pov" collision (Task 16), which aborts the import until Task
  // 17 lands. Task 19 is independent of Task 17 (`tasks.md`'s Summary notes
  // 17/18/19 "can run in parallel once Task 16's fixture/tests land"), so
  // this suite must be able to exercise a *successful* import run without
  // waiting on Task 17.
  let scrivDir: string;
  let projectRoot: string;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let resourceCount: number;
  // Task 19: for each `enqueueIndex` call the real (unmocked-behind-the-spy)
  // implementation actually runs, records whether it caused `indexResource`
  // to be invoked — i.e. whether that specific call did real indexing work
  // rather than the `isStopped` no-op `withIndexingSuspended` should force.
  // Populated by the `enqueueIndex` mock implementation installed below.
  const enqueueIndexCallsThatIndexed: string[] = [];

  beforeAll(async () => {
    scrivDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-fr23-src-"),
    );
    const dataDir = path.join(
      scrivDir,
      "Files",
      "Data",
      "FA000000-0000-4000-8000-00000000000A",
    );
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "content.rtf"),
      String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2639\f0\fs24 \cf0 FR-23 body text.\par}`,
      "utf8",
    );
    await fs.writeFile(
      path.join(scrivDir, "sample.scrivx"),
      `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Identifier="X" Version="2.0" Creator="SCRMAC-3.5.2" Device="Test">
  <Binder>
    <BinderItem UUID="FB000000-0000-4000-8000-00000000000B" Type="DraftFolder" Created="2026-01-01 00:00:00 +0000" Modified="2026-01-01 00:00:00 +0000">
      <Title>Draft</Title>
      <Children>
        <BinderItem UUID="FA000000-0000-4000-8000-00000000000A" Type="Text" Created="2026-01-01 00:00:00 +0000" Modified="2026-01-01 00:00:00 +0000">
          <Title>Only Document</Title>
        </BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>`,
      "utf8",
    );

    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(enqueueIndex).mockClear();
    vi.mocked(startBacklinkWatcher).mockClear();
    vi.mocked(indexResource).mockClear();

    // `enqueueIndex` is invoked by `writeSidecar` regardless of suspension —
    // it is the *symbol* the assertion below cares about seeing run to
    // completion having done nothing, not whether it was called at all (see
    // the corrected assertions below for why). Let the real implementation
    // run (it already checks `isStopped` at its own top), but around each
    // call, snapshot `indexResource`'s call count before/after: if a call
    // to `enqueueIndex` actually caused `indexResource` to run, this was not
    // suppressed — record which resource that happened for.
    const actualIndexerQueue = await vi.importActual<
      typeof import("../../src/lib/models/indexer-queue")
    >("../../src/lib/models/indexer-queue");
    vi.mocked(enqueueIndex).mockImplementation(async (projRoot, resId) => {
      const before = vi.mocked(indexResource).mock.calls.length;
      await actualIndexerQueue.enqueueIndex(projRoot, resId);
      const after = vi.mocked(indexResource).mock.calls.length;
      if (after !== before) enqueueIndexCallsThatIndexed.push(resId);
    });

    projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-scrivener-fr23-dest-"),
    );
    const result = await importScrivenerProject({
      scrivPath: scrivDir,
      projectRoot,
    });
    resourceCount = result.resourceCount;
    await flushIndexer();
  });

  afterAll(async () => {
    consoleWarnSpy.mockRestore();
    vi.mocked(enqueueIndex).mockReset();
    await fs.rm(scrivDir, { recursive: true, force: true });
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("never performs real indexing work via enqueueIndex during the write phase", () => {
    // Task 19: a raw "was `enqueueIndex` called" assertion is too strict —
    // `writeSidecar` (out of scope for this task) always calls it on every
    // sidecar write, suspended or not. `enqueueIndex` itself checks the
    // module-level `isStopped` flag at its own top and short-circuits to a
    // no-op (no queueing, no indexing, no watcher-start) when suspended, so
    // the *symbol* being invoked proves nothing about FR-23's actual
    // guarantee. What FR-23 requires is that none of those calls do real
    // indexing work — verified here by asserting none of them caused
    // `indexResource` to run.
    expect(enqueueIndexCallsThatIndexed).toEqual([]);
  });

  it("calls indexResource only from the importer's own final FR-11 rebuild pass, once per created resource", () => {
    // The only place this importer calls `indexResource` directly (bypassing
    // the suspended queue entirely) is `rebuildIndexes`' step-9 loop, once
    // per resource in the destination project. If any `enqueueIndex` call
    // above had triggered real indexing, `indexResource`'s call count would
    // exceed `resourceCount`.
    expect(vi.mocked(indexResource).mock.calls.length).toBe(resourceCount);
  });

  it("never starts a backlinks watcher for the destination project", () => {
    expect(startBacklinkWatcher).not.toHaveBeenCalled();
  });

  // Task 19: the pre-written `expect(sidecarNotFoundCalls).toEqual([])`
  // assertion this describe block originally carried (Task 16) has been
  // removed — it is not an FR-23 assertion at all. Measured cause:
  // `sidecar.ts`'s `readSidecar` unconditionally logs
  // `"sidecar not found for", resourceId, "at", filePath` on any `ENOENT`
  // (lines ~50-66), and `writeSidecar`'s own pre-write defensive check
  // (line ~145) calls `readSidecar` on *every* resource write, including a
  // brand-new resource's very first write — which by definition has no
  // prior sidecar, so this warning fires deterministically for every
  // resource any part of the app creates, indexing suspended or not. FR-23
  // explicitly forbids modifying `sidecar.ts`, so no FR-23-compliant
  // `withIndexingSuspended` implementation can silence a symptom that lives
  // entirely inside a file this task is not permitted to touch. `console`
  // is still spied/silenced above so this expected warning does not pollute
  // the test run's output.
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
