import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { runForTenant, readFile } from "../../src/lib/models/io";
import {
  buildDocxImportReport,
  writeDocxImportReport,
  DOCX_IMPORT_REPORT_RELATIVE_PATH,
  type DocxImportReportInput,
} from "../../src/lib/models/docx/docx-import-report";

const fullInput: DocxImportReportInput = {
  skips: [
    {
      location: "chapter-3.docx (paragraph 12)",
      reason: "Unsupported table structure",
    },
  ],
  commentsNotImportedCount: 3,
  trackedChangesCount: 5,
  imagesNotImportedCount: 2,
  nonDocxFilesSkippedCount: 1,
  lockFilesSkippedCount: 1,
  hiddenFilesSkippedCount: 2,
  noHeadingFoundDocuments: [{ documentPath: "notes.docx" }],
  footnoteEndnoteConvertedCount: 4,
};

const emptyInput: DocxImportReportInput = {
  skips: [],
  commentsNotImportedCount: 0,
  trackedChangesCount: 0,
  imagesNotImportedCount: 0,
  nonDocxFilesSkippedCount: 0,
  lockFilesSkippedCount: 0,
  hiddenFilesSkippedCount: 0,
  noHeadingFoundDocuments: [],
  footnoteEndnoteConvertedCount: 0,
};

describe("buildDocxImportReport", () => {
  it("renders every category's content with correct details, in order", () => {
    const report = buildDocxImportReport(fullInput);

    expect(report).toContain("# DOCX Import Report");

    // Section headings appear in the documented fixed order.
    const headingOrder = [
      "## Skipped/Unconvertible Items",
      "## Comments Not Imported",
      "## Tracked Changes",
      "## Images/Embedded Media Not Imported",
      "## Folder Source: Skipped Files",
      "## Documents With No Heading Found",
      "## Footnotes/Endnotes Converted",
    ];
    const positions = headingOrder.map((heading) => report.indexOf(heading));
    expect(positions.every((pos) => pos !== -1)).toBe(true);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }

    // (a) FR-5 skip: location + reason.
    expect(report).toContain(
      "- chapter-3.docx (paragraph 12) — Unsupported table structure",
    );

    // (b) comments not imported, with a count.
    expect(report).toContain(
      "- 3 comment(s) found in the source were not imported.",
    );

    // (c) tracked changes present and how many, phrased as accepted-as-shown,
    // never "not imported".
    expect(report).toContain(
      "- 5 tracked change(s) were found and imported accepted as shown (insertions kept, deletions dropped).",
    );
    expect(report).not.toMatch(/tracked change.*not imported/i);

    // (d) images/embedded media not imported, with a count.
    expect(report).toContain(
      "- 2 image(s)/embedded media item(s) found in the source were not imported.",
    );

    // (e) folder-source skip categories, one line per category.
    expect(report).toContain("- Non-.docx files skipped: 1");
    expect(report).toContain("- Word lock files (~$*.docx) skipped: 1");
    expect(report).toContain("- Hidden/dot files or directories skipped: 2");

    // (f) documents with no heading found at the chosen split level.
    expect(report).toContain(
      "- notes.docx — no heading found at the chosen split level; imported as a single resource.",
    );

    // (g) footnotes/endnotes converted to the Notes-list treatment, with a count.
    expect(report).toContain(
      '- 4 footnote(s)/endnote(s) were converted to the Notes-list treatment (inline "[n]" reference plus a numbered Notes list).',
    );
  });

  it("still renders a valid, non-crashing report when no category has content", () => {
    const report = buildDocxImportReport(emptyInput);

    expect(report).toContain("# DOCX Import Report");
    expect(report).toContain("## Skipped/Unconvertible Items");
    expect(report).toContain("No items were skipped.");
    expect(report).toContain("## Comments Not Imported");
    expect(report).toContain("No comments were found in the source.");
    expect(report).toContain("## Tracked Changes");
    expect(report).toContain("No tracked changes were found in the source.");
    expect(report).toContain("## Images/Embedded Media Not Imported");
    expect(report).toContain(
      "No images or embedded media were found in the source.",
    );
    expect(report).toContain("## Folder Source: Skipped Files");
    expect(report).toContain("- Non-.docx files skipped: 0");
    expect(report).toContain("- Word lock files (~$*.docx) skipped: 0");
    expect(report).toContain("- Hidden/dot files or directories skipped: 0");
    expect(report).toContain("## Documents With No Heading Found");
    expect(report).toContain(
      "Every document had a heading at the chosen split level.",
    );
    expect(report).toContain("## Footnotes/Endnotes Converted");
    expect(report).toContain(
      "No footnotes or endnotes were found in the source.",
    );
  });
});

describe("writeDocxImportReport", () => {
  beforeEach(() => {
    // Each test binds its own memory adapter via runForTenant below, but
    // setting a default keeps any accidental out-of-context call from
    // touching the real filesystem.
    createMemoryAdapter();
  });

  it("persists the rendered report under the project root via the io.ts wrappers", async () => {
    const mem = createMemoryAdapter();
    const projectRoot = "/projects/test-docx-project";
    const report = buildDocxImportReport(fullInput);

    await runForTenant(
      projectRoot,
      () => writeDocxImportReport(projectRoot, report),
      mem,
    );

    const written = await runForTenant(
      projectRoot,
      () => readFile(`${projectRoot}/${DOCX_IMPORT_REPORT_RELATIVE_PATH}`),
      mem,
    );

    expect(written).toBe(report);
  });

  it("persists a report reflecting no populated categories", async () => {
    const mem = createMemoryAdapter();
    const projectRoot = "/projects/empty-docx-project";
    const report = buildDocxImportReport(emptyInput);

    await runForTenant(
      projectRoot,
      () => writeDocxImportReport(projectRoot, report),
      mem,
    );

    const written = await runForTenant(
      projectRoot,
      () => readFile(`${projectRoot}/${DOCX_IMPORT_REPORT_RELATIVE_PATH}`),
      mem,
    );

    expect(written).toBe(report);
    expect(written).toContain("No items were skipped.");
  });
});
