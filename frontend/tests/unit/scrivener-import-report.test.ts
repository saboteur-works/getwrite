import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { runForTenant, readFile } from "../../src/lib/models/io";
import {
  buildImportReport,
  writeImportReport,
  IMPORT_REPORT_RELATIVE_PATH,
  type ImportReportInput,
} from "../../src/lib/models/scrivener/import-report";

const fullInput: ImportReportInput = {
  skips: [
    {
      itemTitle: "Old Scene",
      binderPath: "Draft/Chapter 1/Old Scene",
      reason: 'Type="Other" item outside supported binder shapes',
    },
  ],
  fieldKeyRenames: [
    { originalKey: "pov", fieldTitle: "POV", renamedKey: "pov-scrivener" },
  ],
  keywordMerges: [
    {
      leafName: "Protagonist",
      mergedParentPaths: ["Characters/Protagonist", "Roles/Protagonist"],
    },
  ],
  nonTextResearch: [
    { itemTitle: "reference.pdf", binderPath: "Research/reference.pdf" },
  ],
  excludedOther: [{ itemTitle: "Weblink", binderPath: "Research/Weblink" }],
  trashContent: [
    { itemTitle: "Deleted Draft", binderPath: "Trash/Deleted Draft" },
  ],
  snapshots: [
    {
      resourceTitle: "Chapter 1",
      snapshotFile: "Snapshots/1234-uuid.snapshots/2026-01-01.rtf",
    },
  ],
  untitledFallbacks: [
    { itemTitle: "Untitled", binderPath: "Draft/Untitled" },
    { itemTitle: "Untitled 2", binderPath: "Draft/Untitled 2" },
  ],
};

const emptyInput: ImportReportInput = {
  skips: [],
  fieldKeyRenames: [],
  keywordMerges: [],
  nonTextResearch: [],
  excludedOther: [],
  trashContent: [],
  snapshots: [],
  untitledFallbacks: [],
};

describe("buildImportReport", () => {
  it("renders every category's content with correct details, in order", () => {
    const report = buildImportReport(fullInput);

    expect(report).toContain("# Scrivener Import Report");

    // Section headings appear in the documented fixed order.
    const headingOrder = [
      "## Skipped Items",
      "## Field Key Renames",
      "## Keyword Merges",
      "## Unconverted Research Content",
      '## Excluded "Other" Items',
      "## Trash Content",
      "## Snapshot History",
      "## Untitled Fallback Names",
    ];
    const positions = headingOrder.map((heading) => report.indexOf(heading));
    expect(positions.every((pos) => pos !== -1)).toBe(true);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }

    // (a) FR-8 skip: title, binder path, and reason.
    expect(report).toContain(
      '- "Old Scene" (Draft/Chapter 1/Old Scene) — Type="Other" item outside supported binder shapes',
    );

    // FR-7 amendment: field key rename, original key, title, and renamed key.
    expect(report).toContain(
      '- "POV" — key "pov" renamed to "pov-scrivener" (collided with a built-in or already-added field)',
    );

    // (b) FR-15 keyword merge: leaf name and merged parent paths.
    expect(report).toContain(
      '- "Protagonist" — merged from: Characters/Protagonist, Roles/Protagonist',
    );

    // (c) non-text Research content: title + binder path.
    expect(report).toContain('- "reference.pdf" (Research/reference.pdf)');

    // (d) excluded Type="Other" item: title + binder path.
    expect(report).toContain('- "Weblink" (Research/Weblink)');

    // (e) Trash content: title + binder path.
    expect(report).toContain('- "Deleted Draft" (Trash/Deleted Draft)');

    // (f) snapshot history: resource + snapshot file reference.
    expect(report).toContain(
      '- "Chapter 1" — Snapshots/1234-uuid.snapshots/2026-01-01.rtf',
    );

    // FR-19: untitled fallback names, title used + binder path.
    expect(report).toContain('- "Untitled" (Draft/Untitled)');
    expect(report).toContain('- "Untitled 2" (Draft/Untitled 2)');
  });

  it("still renders a valid, non-crashing report when no category has content", () => {
    const report = buildImportReport(emptyInput);

    expect(report).toContain("# Scrivener Import Report");
    expect(report).toContain("## Skipped Items");
    expect(report).toContain("No items were skipped.");
    expect(report).toContain("## Field Key Renames");
    expect(report).toContain("No metadata field keys needed to be renamed.");
    expect(report).toContain("## Keyword Merges");
    expect(report).toContain("No keyword tags were merged.");
    expect(report).toContain("## Unconverted Research Content");
    expect(report).toContain("No non-text Research content was found.");
    expect(report).toContain('## Excluded "Other" Items');
    expect(report).toContain('No Type="Other" items were found.');
    expect(report).toContain("## Trash Content");
    expect(report).toContain("The project's Trash was empty.");
    expect(report).toContain("## Snapshot History");
    expect(report).toContain("No snapshot history was found.");
    expect(report).toContain("## Untitled Fallback Names");
    expect(report).toContain(
      'No binder items required a generated "Untitled" fallback name.',
    );
  });
});

describe("writeImportReport", () => {
  beforeEach(() => {
    // Each test binds its own memory adapter via runForTenant below, but
    // setting a default keeps any accidental out-of-context call from
    // touching the real filesystem.
    createMemoryAdapter();
  });

  it("persists the rendered report under the project root via the io.ts wrappers", async () => {
    const mem = createMemoryAdapter();
    const projectRoot = "/projects/test-project";
    const report = buildImportReport(fullInput);

    await runForTenant(
      projectRoot,
      () => writeImportReport(projectRoot, report),
      mem,
    );

    const written = await runForTenant(
      projectRoot,
      () => readFile(`${projectRoot}/${IMPORT_REPORT_RELATIVE_PATH}`),
      mem,
    );

    expect(written).toBe(report);
  });

  it("persists a report reflecting no populated categories", async () => {
    const mem = createMemoryAdapter();
    const projectRoot = "/projects/empty-project";
    const report = buildImportReport(emptyInput);

    await runForTenant(
      projectRoot,
      () => writeImportReport(projectRoot, report),
      mem,
    );

    const written = await runForTenant(
      projectRoot,
      () => readFile(`${projectRoot}/${IMPORT_REPORT_RELATIVE_PATH}`),
      mem,
    );

    expect(written).toBe(report);
    expect(written).toContain("No items were skipped.");
  });
});
