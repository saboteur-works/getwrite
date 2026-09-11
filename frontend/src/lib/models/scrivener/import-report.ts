// Last Updated: 2026-09-11

/**
 * @module import-report
 *
 * Assembles and persists the FR-9 post-import report for the Scrivener
 * importer (`specs/features/scrivener-cli-importer.md`).
 *
 * `buildImportReport` is a pure function: it takes the outcomes of the other
 * import-pipeline modules (FR-8 skips, FR-15 keyword merges, FR-16
 * unconverted Research content, FR-3 excluded `Type="Other"` items, the
 * project's Trash content, and any snapshot history) and renders them into a
 * single human-readable, Markdown-ish plain-text report. `writeImportReport`
 * persists that text under the destination project via the `io.ts`
 * `StorageAdapter` wrappers (never `node:fs` directly), per
 * `docs/standards/storage-context.md` — callers are responsible for having an
 * active `StorageContext` (e.g. via `runForTenant`) when they call it, the
 * same convention `project-creator.ts`'s callers follow.
 *
 * **Empty-category convention:** every one of the six FR-9 categories is
 * always rendered as its own heading, in a fixed order, even when there is
 * nothing to report for it — an empty category prints its heading followed
 * by an explicit "No … found." line rather than being omitted. This is a
 * deliberate design choice (the task's "your design call" clause): omitting
 * a category entirely would be indistinguishable, to a reader of the report
 * text, from the importer never having considered that category at all. The
 * fixed heading order also means the report's shape does not depend on which
 * categories happened to have content, making it easier to diff between
 * import runs.
 */
import path from "node:path";
import { mkdir, writeFile } from "../io";

/**
 * A single FR-8 skip: an item the importer declined to carry over.
 */
export interface ImportReportSkip {
  /** The binder item's title as it appeared in Scrivener. */
  readonly itemTitle: string;
  /** The item's position in the binder, e.g. `"Draft/Chapter 1/Old Scene"`. */
  readonly binderPath: string;
  /** Why the item was skipped. */
  readonly reason: string;
}

/**
 * A single FR-15 keyword merge: two or more Scrivener keywords sharing an
 * identical leaf name, collapsed into one GetWrite tag.
 */
export interface ImportReportKeywordMerge {
  /** The shared leaf name the merged keywords collapsed into. */
  readonly leafName: string;
  /** The distinct parent paths of every keyword that merged into it. */
  readonly mergedParentPaths: readonly string[];
}

/**
 * A single non-text Research item (media, PDF, web archive, or any other
 * item under `ResearchFolder` that is not a `Folder`/`Text` binder item)
 * that FR-16 intentionally left unconverted.
 */
export interface ImportReportResearchItem {
  /** The item's title as it appeared in Scrivener. */
  readonly itemTitle: string;
  /** The item's position in the binder. */
  readonly binderPath: string;
}

/**
 * A single `Type="Other"` binder item excluded by FR-3, wherever it occurred
 * in the binder (not just under Research).
 */
export interface ImportReportExcludedOtherItem {
  /** The item's title as it appeared in Scrivener. */
  readonly itemTitle: string;
  /** The item's position in the binder. */
  readonly binderPath: string;
}

/**
 * A single item found under the source project's `TrashFolder`.
 */
export interface ImportReportTrashItem {
  /** The item's title as it appeared in Scrivener. */
  readonly itemTitle: string;
  /** The item's position in the binder (within the Trash subtree). */
  readonly binderPath: string;
}

/**
 * A single snapshot found under the source project's `Snapshots/` directory.
 */
export interface ImportReportSnapshot {
  /** The title of the resource/document the snapshot belongs to. */
  readonly resourceTitle: string;
  /** The snapshot file's path, relative to the source `.scriv` package. */
  readonly snapshotFile: string;
}

/**
 * Full set of inputs `buildImportReport` renders. Populated by other
 * import-pipeline modules (FR-8 skip detection, FR-15 keyword merging, FR-16
 * Research handling, FR-3 binder filtering, FR-9's Trash/Snapshot scans) and
 * assembled by Task 8's orchestrator; each array may be empty.
 */
export interface ImportReportInput {
  /** Every FR-8 skip, in encounter order. */
  readonly skips: readonly ImportReportSkip[];
  /** Every FR-15 keyword merge, in encounter order. */
  readonly keywordMerges: readonly ImportReportKeywordMerge[];
  /** Every FR-16 non-text Research item left unconverted. */
  readonly nonTextResearch: readonly ImportReportResearchItem[];
  /** Every FR-3 excluded `Type="Other"` item. */
  readonly excludedOther: readonly ImportReportExcludedOtherItem[];
  /** Every item found under the source project's Trash. */
  readonly trashContent: readonly ImportReportTrashItem[];
  /** Every snapshot found under the source project's Snapshots directory. */
  readonly snapshots: readonly ImportReportSnapshot[];
}

/**
 * Rendered import report text, as returned by {@link buildImportReport}.
 */
export type ImportReportText = string;

/**
 * Relative path, under a destination project's root, that
 * {@link writeImportReport} persists the report to. Chosen to avoid
 * colliding with existing reserved project paths (`project.json`,
 * `resources/`, `meta/`, `folders/`, `revisions/`, `.trash/`).
 */
export const IMPORT_REPORT_RELATIVE_PATH = "scrivener-import-report.txt";

/**
 * Renders the FR-9 post-import report as human-readable, Markdown-ish plain
 * text: a top-level heading followed by one `##` section per category, in a
 * fixed order, each populated with its items or an explicit "nothing found"
 * line when empty. See the module doc comment for the empty-category
 * rationale.
 *
 * @param input - The six FR-9 report categories.
 * @returns The rendered report text.
 */
export function buildImportReport(input: ImportReportInput): ImportReportText {
  const sections = [
    renderSkipsSection(input.skips),
    renderKeywordMergesSection(input.keywordMerges),
    renderNonTextResearchSection(input.nonTextResearch),
    renderExcludedOtherSection(input.excludedOther),
    renderTrashContentSection(input.trashContent),
    renderSnapshotsSection(input.snapshots),
  ];

  return ["# Scrivener Import Report", "", ...sections].join("\n");
}

function renderSkipsSection(skips: readonly ImportReportSkip[]): string {
  const lines = skips.map(
    (skip) => `- "${skip.itemTitle}" (${skip.binderPath}) — ${skip.reason}`,
  );
  return renderSection("Skipped Items", lines, "No items were skipped.");
}

function renderKeywordMergesSection(
  merges: readonly ImportReportKeywordMerge[],
): string {
  const lines = merges.map(
    (merge) =>
      `- "${merge.leafName}" — merged from: ${merge.mergedParentPaths.join(", ")}`,
  );
  return renderSection("Keyword Merges", lines, "No keyword tags were merged.");
}

function renderNonTextResearchSection(
  items: readonly ImportReportResearchItem[],
): string {
  const lines = items.map(
    (item) => `- "${item.itemTitle}" (${item.binderPath})`,
  );
  return renderSection(
    "Unconverted Research Content",
    lines,
    "No non-text Research content was found.",
  );
}

function renderExcludedOtherSection(
  items: readonly ImportReportExcludedOtherItem[],
): string {
  const lines = items.map(
    (item) => `- "${item.itemTitle}" (${item.binderPath})`,
  );
  return renderSection(
    'Excluded "Other" Items',
    lines,
    'No Type="Other" items were found.',
  );
}

function renderTrashContentSection(
  items: readonly ImportReportTrashItem[],
): string {
  const lines = items.map(
    (item) => `- "${item.itemTitle}" (${item.binderPath})`,
  );
  return renderSection(
    "Trash Content",
    lines,
    "The project's Trash was empty.",
  );
}

function renderSnapshotsSection(
  snapshots: readonly ImportReportSnapshot[],
): string {
  const lines = snapshots.map(
    (snapshot) => `- "${snapshot.resourceTitle}" — ${snapshot.snapshotFile}`,
  );
  return renderSection(
    "Snapshot History",
    lines,
    "No snapshot history was found.",
  );
}

/**
 * Renders one `##` report section: a heading followed by either the
 * supplied bullet lines or a single explicit "nothing found" line.
 *
 * @param heading - The section heading text (without the `##` prefix).
 * @param lines - Rendered bullet lines for this category, if any.
 * @param emptyMessage - Line to print when `lines` is empty.
 * @returns The rendered section text, including a trailing blank line.
 */
function renderSection(
  heading: string,
  lines: readonly string[],
  emptyMessage: string,
): string {
  const body = lines.length > 0 ? lines : [emptyMessage];
  return [`## ${heading}`, "", ...body, ""].join("\n");
}

/**
 * Persists a rendered import report under a destination project's root, at
 * {@link IMPORT_REPORT_RELATIVE_PATH}.
 *
 * Writes via the `io.ts` `StorageAdapter` wrappers, so it honors whatever
 * `StorageContext` is active for the current async call chain (or the
 * module-level default adapter when none is bound) — callers running outside
 * an existing request/task scope (e.g. the CLI orchestrator) are responsible
 * for establishing one first, e.g. via `runForTenant(projectRoot, ...)`, the
 * same convention `cli/src/commands/project.ts` uses around
 * `createProjectFromType`.
 *
 * @param projectRoot - Absolute path to the destination project's directory.
 * @param report - Rendered report text, as returned by
 *   {@link buildImportReport}.
 * @returns Resolves when the report file has been written.
 */
export async function writeImportReport(
  projectRoot: string,
  report: ImportReportText,
): Promise<void> {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    path.join(projectRoot, IMPORT_REPORT_RELATIVE_PATH),
    report,
    "utf8",
  );
}
