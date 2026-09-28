import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { runForTenant, readFile } from "../../src/lib/models/io";
import {
  buildPlainTextImportReport,
  writePlainTextImportReport,
  PLAINTEXT_IMPORT_REPORT_RELATIVE_PATH,
  type PlainTextImportReportInput,
} from "../../src/lib/models/plaintext/plaintext-import-report";

const fullInput: PlainTextImportReportInput = {
  filesProcessedCount: 7,
  nonTxtFilesSkippedCount: 2,
  hiddenFilesSkippedCount: 3,
  namingNotes: [
    {
      resourceName: "Untitled",
      sourcePath: "notes/untitled.txt",
      reason: "untitled fallback",
    },
    {
      resourceName: "chapter-1 (restored)",
      sourcePath: "chapter-1.txt",
      reason: "name collision",
    },
  ],
};

const emptyInput: PlainTextImportReportInput = {
  filesProcessedCount: 0,
  nonTxtFilesSkippedCount: 0,
  hiddenFilesSkippedCount: 0,
  namingNotes: [],
};

describe("buildPlainTextImportReport", () => {
  it("renders all three fixed section headings, with zero counts explicitly rendered, when there is nothing to report", () => {
    const report = buildPlainTextImportReport(emptyInput);

    expect(report).toContain("# Plain-Text Import Report");

    const headingOrder = [
      "## Files Processed",
      "## Skipped/Unconvertible Content",
      "## Untitled Fallback and Name-Collision Notes",
    ];
    const positions = headingOrder.map((heading) => report.indexOf(heading));
    expect(positions.every((pos) => pos !== -1)).toBe(true);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }

    // Zero counts are explicitly rendered, not omitted.
    expect(report).toContain("- Files processed: 0");
    expect(report).toContain("- Non-.txt files skipped: 0");
    expect(report).toContain("- Hidden/dot files or directories skipped: 0");
  });

  it("renders the correct nonzero counts in the Skipped/Unconvertible Content section", () => {
    const report = buildPlainTextImportReport(fullInput);

    expect(report).toContain("- Files processed: 7");
    expect(report).toContain("- Non-.txt files skipped: 2");
    expect(report).toContain("- Hidden/dot files or directories skipped: 3");
  });

  it("renders naming notes with resourceName, sourcePath, and reason", () => {
    const report = buildPlainTextImportReport(fullInput);

    expect(report).toContain(
      '- "Untitled" (notes/untitled.txt) — untitled fallback',
    );
    expect(report).toContain(
      '- "chapter-1 (restored)" (chapter-1.txt) — name collision',
    );
  });

  it("renders the 'nothing to report' fallback text for an empty namingNotes array", () => {
    const report = buildPlainTextImportReport(emptyInput);

    expect(report).toContain("## Untitled Fallback and Name-Collision Notes");
    expect(report).toContain(
      "No resource required a generated or altered name.",
    );
  });
});

describe("writePlainTextImportReport", () => {
  beforeEach(() => {
    // Each test binds its own memory adapter via runForTenant below, but
    // setting a default keeps any accidental out-of-context call from
    // touching the real filesystem.
    createMemoryAdapter();
  });

  it("persists the exact rendered text under the project root via the io.ts wrappers", async () => {
    const mem = createMemoryAdapter();
    const projectRoot = "/projects/test-plaintext-project";
    const report = buildPlainTextImportReport(fullInput);

    await runForTenant(
      projectRoot,
      () => writePlainTextImportReport(projectRoot, report),
      mem,
    );

    const written = await runForTenant(
      projectRoot,
      () => readFile(`${projectRoot}/${PLAINTEXT_IMPORT_REPORT_RELATIVE_PATH}`),
      mem,
    );

    expect(written).toBe(report);
  });

  it("persists a report reflecting no populated categories", async () => {
    const mem = createMemoryAdapter();
    const projectRoot = "/projects/empty-plaintext-project";
    const report = buildPlainTextImportReport(emptyInput);

    await runForTenant(
      projectRoot,
      () => writePlainTextImportReport(projectRoot, report),
      mem,
    );

    const written = await runForTenant(
      projectRoot,
      () => readFile(`${projectRoot}/${PLAINTEXT_IMPORT_REPORT_RELATIVE_PATH}`),
      mem,
    );

    expect(written).toBe(report);
    expect(written).toContain(
      "No resource required a generated or altered name.",
    );
  });
});
