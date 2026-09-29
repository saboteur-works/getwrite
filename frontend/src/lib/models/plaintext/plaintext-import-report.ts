// Last Updated: 2026-09-28

/**
 * @module plaintext-import-report
 *
 * Assembles and persists the FR-7 post-import report for the plain-text
 * importer (`specs/features/plain-text-import.md`).
 *
 * `buildPlainTextImportReport` is a pure function: it takes the outcomes of
 * the other plain-text import-pipeline modules (Task 2's folder-source skip
 * counts, Task 5's per-file processing and any untitled/name-collision
 * resolutions) and renders them into a single human-readable, Markdown-ish
 * plain-text report. `writePlainTextImportReport` persists that text under
 * the destination project via the `io.ts` `StorageAdapter` wrappers (never
 * `node:fs` directly), per `docs/standards/storage-context.md` — callers are
 * responsible for having an active `StorageContext` (e.g. via
 * `runForTenant`) when they call it, the same convention
 * `docx/docx-import-report.ts`'s and `scrivener/import-report.ts`'s callers
 * follow.
 *
 * **This module mirrors, but does not reuse or modify,
 * `docx/docx-import-report.ts`.** Unlike DOCX (comments, tracked changes,
 * images, footnotes), plain-text source carries no rich-content category to
 * report, so this report's section list is deliberately short — three
 * sections, not eight — rather than padding it with always-zero
 * DOCX-specific fields that don't apply to `.txt` import.
 *
 * **Empty-category convention (matching `docx/docx-import-report.ts` and
 * `scrivener/import-report.ts`):** every section is always rendered as its
 * own heading, in a fixed order, even when there is nothing to report for
 * it — an empty category prints its heading followed by an explicit
 * "nothing to report" line (or, for the always-rendered skip counts, the
 * zero counts themselves) rather than being omitted. This keeps the
 * report's shape independent of which categories happened to have content,
 * and makes it easier to diff between import runs.
 */
import path from "node:path";
import { mkdir, writeFile } from "../io";

/**
 * A single resource named "Untitled"/"Untitled 2"/... or otherwise renamed
 * to resolve a name collision at the destination, worth calling out in the
 * report so a writer can see where a generated name was used instead of the
 * source filename.
 */
export interface PlainTextImportReportNamingNote {
  /** The resource name actually used at the destination. */
  readonly resourceName: string;
  /** The source file's path (single-file source) or filename (folder source). */
  readonly sourcePath: string;
  /** Why the name differs from a straightforward filename-derived title (e.g. "untitled fallback", "name collision"). */
  readonly reason: string;
}

/**
 * Full set of inputs `buildPlainTextImportReport` renders. Populated by
 * other plain-text import-pipeline modules (Task 2's folder-source skip
 * detection, Task 5's per-file processing and naming resolution) and
 * assembled by Task 5's orchestrator; every count defaults to zero and every
 * array may be empty.
 */
export interface PlainTextImportReportInput {
  /** (a) Number of `.txt` files successfully processed into resources. */
  readonly filesProcessedCount: number;
  /** (b) Number of non-`.txt` files skipped while walking a folder source. */
  readonly nonTxtFilesSkippedCount: number;
  /** (b) Number of hidden/dot files or directories skipped while walking a folder source. */
  readonly hiddenFilesSkippedCount: number;
  /** (c) Every resource whose name was generated (an "Untitled" fallback) or altered to resolve a collision. */
  readonly namingNotes: readonly PlainTextImportReportNamingNote[];
}

/**
 * Rendered import report text, as returned by
 * {@link buildPlainTextImportReport}.
 */
export type PlainTextImportReportText = string;

/**
 * Relative path, under a destination project's root, that
 * {@link writePlainTextImportReport} persists the report to. Mirrors
 * `docx/docx-import-report.ts`'s `DOCX_IMPORT_REPORT_RELATIVE_PATH` and
 * `scrivener/import-report.ts`'s `IMPORT_REPORT_RELATIVE_PATH` naming
 * convention, chosen to avoid colliding with existing reserved project paths
 * (`project.json`, `resources/`, `meta/`, `folders/`, `revisions/`,
 * `.trash/`) as well as the DOCX and Scrivener importers' own report files.
 */
export const PLAINTEXT_IMPORT_REPORT_RELATIVE_PATH =
  "plaintext-import-report.txt";

/**
 * Renders the FR-7 post-import report as human-readable, Markdown-ish plain
 * text: a top-level heading followed by one `##` section per category, in a
 * fixed order, each populated with its items/counts or an explicit
 * "nothing to report" line when empty. See the module doc comment for the
 * empty-category rationale.
 *
 * @param input - The three FR-7 report categories.
 * @returns The rendered report text.
 */
export function buildPlainTextImportReport(
  input: PlainTextImportReportInput,
): PlainTextImportReportText {
  const sections = [
    renderFilesProcessedSection(input.filesProcessedCount),
    renderSkippedContentSection(
      input.nonTxtFilesSkippedCount,
      input.hiddenFilesSkippedCount,
    ),
    renderNamingNotesSection(input.namingNotes),
  ];

  return ["# Plain-Text Import Report", "", ...sections].join("\n");
}

function renderFilesProcessedSection(filesProcessedCount: number): string {
  const lines = [`- Files processed: ${filesProcessedCount}`];
  return renderSection("Files Processed", lines, "");
}

function renderSkippedContentSection(
  nonTxtFilesSkippedCount: number,
  hiddenFilesSkippedCount: number,
): string {
  const lines = [
    `- Non-.txt files skipped: ${nonTxtFilesSkippedCount}`,
    `- Hidden/dot files or directories skipped: ${hiddenFilesSkippedCount}`,
  ];
  return renderSection("Skipped/Unconvertible Content", lines, "");
}

function renderNamingNotesSection(
  notes: readonly PlainTextImportReportNamingNote[],
): string {
  const lines = notes.map(
    (note) => `- "${note.resourceName}" (${note.sourcePath}) — ${note.reason}`,
  );
  return renderSection(
    "Untitled Fallback and Name-Collision Notes",
    lines,
    "No resource required a generated or altered name.",
  );
}

/**
 * Renders one `##` report section: a heading followed by either the
 * supplied bullet lines or a single explicit "nothing to report" line.
 *
 * @param heading - The section heading text (without the `##` prefix).
 * @param lines - Rendered bullet lines for this category, if any.
 * @param emptyMessage - Line to print when `lines` is empty. Pass an empty
 *   string for a section (e.g. the skipped-content counts) whose lines are
 *   always rendered regardless of whether any count is nonzero.
 * @returns The rendered section text, including a trailing blank line.
 */
function renderSection(
  heading: string,
  lines: readonly string[],
  emptyMessage: string,
): string {
  const body = lines.length > 0 ? lines : [emptyMessage].filter(Boolean);
  return [`## ${heading}`, "", ...body, ""].join("\n");
}

/**
 * Persists a rendered import report under a destination project's root, at
 * {@link PLAINTEXT_IMPORT_REPORT_RELATIVE_PATH}.
 *
 * Writes via the `io.ts` `StorageAdapter` wrappers, so it honors whatever
 * `StorageContext` is active for the current async call chain (or the
 * module-level default adapter when none is bound) — callers running
 * outside an existing request/task scope (e.g. the CLI orchestrator) are
 * responsible for establishing one first, e.g. via
 * `runForTenant(projectRoot, ...)`, the same convention
 * `docx/docx-import-report.ts`'s and `scrivener/import-report.ts`'s callers
 * follow.
 *
 * @param projectRoot - Absolute path to the destination project's directory.
 * @param report - Rendered report text, as returned by
 *   {@link buildPlainTextImportReport}.
 * @returns Resolves when the report file has been written.
 */
export async function writePlainTextImportReport(
  projectRoot: string,
  report: PlainTextImportReportText,
): Promise<void> {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    path.join(projectRoot, PLAINTEXT_IMPORT_REPORT_RELATIVE_PATH),
    report,
    "utf8",
  );
}
