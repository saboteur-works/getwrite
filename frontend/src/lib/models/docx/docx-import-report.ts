// Last Updated: 2026-09-13

/**
 * @module docx-import-report
 *
 * Assembles and persists the FR-6 post-import report for the DOCX importer
 * (`specs/features/docx-importer.md`).
 *
 * `buildDocxImportReport` is a pure function: it takes the outcomes of the
 * other DOCX import-pipeline modules (FR-5 skips, FR-18's comment/
 * tracked-change/image detection, FR-15's folder-source skip categories,
 * FR-2's no-heading-found documents, and FR-13's footnote/endnote Notes-list
 * conversion) and renders them into a single human-readable, Markdown-ish
 * plain-text report. `writeDocxImportReport` persists that text under the
 * destination project via the `io.ts` `StorageAdapter` wrappers (never
 * `node:fs` directly), per `docs/standards/storage-context.md` — callers are
 * responsible for having an active `StorageContext` (e.g. via
 * `runForTenant`) when they call it, the same convention
 * `scrivener/import-report.ts`'s callers follow.
 *
 * **This module mirrors, but does not reuse or modify,
 * `scrivener/import-report.ts`.** FR-6 (resolved OQ-4) is explicit that the
 * DOCX report's sections reflect DOCX content rather than reusing
 * Scrivener's eight-section list as-is, so this is a new sibling module with
 * its own input shape, not an extension of the Scrivener report.
 *
 * **Empty-category convention (matching `scrivener/import-report.ts`):**
 * every one of the seven FR-6 categories is always rendered as its own
 * heading, in a fixed order, even when there is nothing to report for it —
 * an empty category prints its heading followed by an explicit "nothing to
 * report" line rather than being omitted. This keeps the report's shape
 * independent of which categories happened to have content, and makes it
 * easier to diff between import runs.
 */
import path from "node:path";
import { mkdir, writeFile } from "../io";

/**
 * A single FR-5 skip: DOCX content the importer declined to convert.
 */
export interface DocxImportReportSkip {
  /** Where the skip occurred — e.g. a document/file path, optionally with a section or paragraph reference. */
  readonly location: string;
  /** Why the item was skipped. */
  readonly reason: string;
}

/**
 * A single document (by source path) in which FR-2's configured split level
 * (e.g. Heading 1) was never found, so the whole document imported as one
 * resource instead of being split. Task 7's heading-split module is expected
 * to set a `noHeadingFound` flag per document; this module only renders
 * whatever list of such documents its caller supplies (see the module doc's
 * note on this being a forward-looking, minimal shape for Task 9 to
 * populate).
 */
export interface DocxImportReportNoHeadingDocument {
  /** The source document's path (single-file source) or filename (folder source). */
  readonly documentPath: string;
}

/**
 * Full set of inputs `buildDocxImportReport` renders. Populated by other
 * DOCX import-pipeline modules (FR-5 skip detection, FR-18's comment/
 * tracked-change/image detection, FR-15's folder-source skip categories,
 * FR-2/Task 7's no-heading-found detection, FR-13's footnote/endnote
 * conversion) and assembled by Task 9's orchestrator; every count defaults
 * to zero and every array may be empty.
 */
export interface DocxImportReportInput {
  /** (a) Every FR-5 skip, in encounter order. */
  readonly skips: readonly DocxImportReportSkip[];
  /** (b) Number of comments found in the source that were not imported (FR-18, comments are never imported). */
  readonly commentsNotImportedCount: number;
  /**
   * (c) Number of tracked changes (`w:ins`/`w:del` occurrences) found in the
   * source. Per FR-6(c)/resolved OQ-10, these are imported
   * accepted-as-shown (insertions kept, deletions dropped) — this count
   * exists so the writer knows tracked changes were present, not to say
   * they were skipped.
   */
  readonly trackedChangesCount: number;
  /** (d) Number of images/embedded media found in the source that were not imported (FR-18). */
  readonly imagesNotImportedCount: number;
  /** (e) Number of non-`.docx` files skipped while walking a folder source (FR-15). */
  readonly nonDocxFilesSkippedCount: number;
  /** (e) Number of Word temporary lock files (`~$*.docx`) skipped while walking a folder source (FR-15). */
  readonly lockFilesSkippedCount: number;
  /** (e) Number of hidden/dot files or directories skipped while walking a folder source (FR-15). */
  readonly hiddenFilesSkippedCount: number;
  /** (f) Every document in which no heading was found at the chosen split level (FR-2). */
  readonly noHeadingFoundDocuments: readonly DocxImportReportNoHeadingDocument[];
  /** (g) Number of footnotes and endnotes converted to the Notes-list treatment (FR-13). */
  readonly footnoteEndnoteConvertedCount: number;
}

/**
 * Rendered import report text, as returned by {@link buildDocxImportReport}.
 */
export type DocxImportReportText = string;

/**
 * Relative path, under a destination project's root, that
 * {@link writeDocxImportReport} persists the report to. Mirrors
 * `scrivener/import-report.ts`'s `IMPORT_REPORT_RELATIVE_PATH` naming
 * convention, chosen to avoid colliding with existing reserved project paths
 * (`project.json`, `resources/`, `meta/`, `folders/`, `revisions/`,
 * `.trash/`) as well as the Scrivener importer's own report file.
 */
export const DOCX_IMPORT_REPORT_RELATIVE_PATH = "docx-import-report.txt";

/**
 * Renders the FR-6 post-import report as human-readable, Markdown-ish plain
 * text: a top-level heading followed by one `##` section per category, in a
 * fixed order, each populated with its items/counts or an explicit
 * "nothing to report" line when empty. See the module doc comment for the
 * empty-category rationale.
 *
 * @param input - The seven FR-6 report categories.
 * @returns The rendered report text.
 */
export function buildDocxImportReport(
  input: DocxImportReportInput,
): DocxImportReportText {
  const sections = [
    renderSkipsSection(input.skips),
    renderCommentsSection(input.commentsNotImportedCount),
    renderTrackedChangesSection(input.trackedChangesCount),
    renderImagesSection(input.imagesNotImportedCount),
    renderFolderSourceSkipsSection(
      input.nonDocxFilesSkippedCount,
      input.lockFilesSkippedCount,
      input.hiddenFilesSkippedCount,
    ),
    renderNoHeadingFoundSection(input.noHeadingFoundDocuments),
    renderFootnoteEndnoteSection(input.footnoteEndnoteConvertedCount),
  ];

  return ["# DOCX Import Report", "", ...sections].join("\n");
}

function renderSkipsSection(skips: readonly DocxImportReportSkip[]): string {
  const lines = skips.map((skip) => `- ${skip.location} — ${skip.reason}`);
  return renderSection(
    "Skipped/Unconvertible Items",
    lines,
    "No items were skipped.",
  );
}

function renderCommentsSection(commentsNotImportedCount: number): string {
  const lines =
    commentsNotImportedCount > 0
      ? [
          `- ${commentsNotImportedCount} comment(s) found in the source were not imported.`,
        ]
      : [];
  return renderSection(
    "Comments Not Imported",
    lines,
    "No comments were found in the source.",
  );
}

function renderTrackedChangesSection(trackedChangesCount: number): string {
  const lines =
    trackedChangesCount > 0
      ? [
          `- ${trackedChangesCount} tracked change(s) were found and imported accepted as shown (insertions kept, deletions dropped).`,
        ]
      : [];
  return renderSection(
    "Tracked Changes",
    lines,
    "No tracked changes were found in the source.",
  );
}

function renderImagesSection(imagesNotImportedCount: number): string {
  const lines =
    imagesNotImportedCount > 0
      ? [
          `- ${imagesNotImportedCount} image(s)/embedded media item(s) found in the source were not imported.`,
        ]
      : [];
  return renderSection(
    "Images/Embedded Media Not Imported",
    lines,
    "No images or embedded media were found in the source.",
  );
}

function renderFolderSourceSkipsSection(
  nonDocxFilesSkippedCount: number,
  lockFilesSkippedCount: number,
  hiddenFilesSkippedCount: number,
): string {
  const lines = [
    `- Non-.docx files skipped: ${nonDocxFilesSkippedCount}`,
    `- Word lock files (~$*.docx) skipped: ${lockFilesSkippedCount}`,
    `- Hidden/dot files or directories skipped: ${hiddenFilesSkippedCount}`,
  ];
  return renderSection("Folder Source: Skipped Files", lines, "");
}

function renderNoHeadingFoundSection(
  documents: readonly DocxImportReportNoHeadingDocument[],
): string {
  const lines = documents.map(
    (document) =>
      `- ${document.documentPath} — no heading found at the chosen split level; imported as a single resource.`,
  );
  return renderSection(
    "Documents With No Heading Found",
    lines,
    "Every document had a heading at the chosen split level.",
  );
}

function renderFootnoteEndnoteSection(
  footnoteEndnoteConvertedCount: number,
): string {
  const lines =
    footnoteEndnoteConvertedCount > 0
      ? [
          `- ${footnoteEndnoteConvertedCount} footnote(s)/endnote(s) were converted to the Notes-list treatment (inline "[n]" reference plus a numbered Notes list).`,
        ]
      : [];
  return renderSection(
    "Footnotes/Endnotes Converted",
    lines,
    "No footnotes or endnotes were found in the source.",
  );
}

/**
 * Renders one `##` report section: a heading followed by either the
 * supplied bullet lines or a single explicit "nothing to report" line.
 *
 * @param heading - The section heading text (without the `##` prefix).
 * @param lines - Rendered bullet lines for this category, if any.
 * @param emptyMessage - Line to print when `lines` is empty. Pass an empty
 *   string for a section (e.g. the folder-source skip counts) whose lines
 *   are always rendered regardless of whether any count is nonzero.
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
 * {@link DOCX_IMPORT_REPORT_RELATIVE_PATH}.
 *
 * Writes via the `io.ts` `StorageAdapter` wrappers, so it honors whatever
 * `StorageContext` is active for the current async call chain (or the
 * module-level default adapter when none is bound) — callers running
 * outside an existing request/task scope (e.g. the CLI orchestrator) are
 * responsible for establishing one first, e.g. via
 * `runForTenant(projectRoot, ...)`, the same convention
 * `scrivener/import-report.ts`'s callers follow.
 *
 * @param projectRoot - Absolute path to the destination project's directory.
 * @param report - Rendered report text, as returned by
 *   {@link buildDocxImportReport}.
 * @returns Resolves when the report file has been written.
 */
export async function writeDocxImportReport(
  projectRoot: string,
  report: DocxImportReportText,
): Promise<void> {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    path.join(projectRoot, DOCX_IMPORT_REPORT_RELATIVE_PATH),
    report,
    "utf8",
  );
}
