// Last Updated: 2026-09-13

/**
 * @module source-detection
 *
 * Implements FR-1, FR-3, and FR-15 of the DOCX importer
 * (`specs/features/docx-importer.md`): auto-detecting whether an import
 * source is a single `.docx` file or a directory, refusing a directory that
 * contains no `.docx` file anywhere in its tree (before any write), and
 * recursively walking a directory source into an ordered plan of `.docx`
 * files and subfolders.
 *
 * Both {@link detectDocxSource} and {@link walkDocxFolder} are pure
 * functions apart from read-only filesystem access, performed exclusively
 * through `io.ts`'s `StorageAdapter` wrappers (`stat`/`readdir`) rather than
 * `node:fs` directly, per `docs/standards/storage-context.md` §5. Nothing is
 * written to any destination here — this module only inspects a source and
 * produces a plan for a later task (the DOCX import orchestrator) to act on.
 *
 * **Skip-and-summarize convention (FR-15):** a non-`.docx` file, a Word
 * temporary lock file (`~$*.docx`, created while the document is open in
 * Word), and any hidden/dot file or directory (a name starting with `.`) are
 * never included in the walk plan. Instead they are tallied into
 * {@link DocxFolderSkipCounts}, one count per category, aggregated across
 * the entire recursive walk — matching `docx-import-report.ts`'s
 * `DocxImportReportInput` field names (`nonDocxFilesSkippedCount`,
 * `lockFilesSkippedCount`, `hiddenFilesSkippedCount`) so a later
 * orchestrator can feed this module's output straight into that report
 * without renaming fields. A hidden directory is skipped as a single unit
 * (counted once) without descending into it, mirroring how a hidden file is
 * a single skip rather than being expanded.
 *
 * **Pruning convention (FR-15):** a subfolder containing no `.docx` file
 * anywhere beneath it (after its own contents are walked and skip-
 * categorized) is omitted from its parent's `entries` entirely — it is
 * never represented as an empty GetWrite folder. Its skip counts are still
 * folded into the aggregate returned to the caller, since a non-`.docx`
 * file inside an otherwise-empty subfolder was still a real skip that
 * happened during the walk, even though the subfolder itself produces no
 * destination folder.
 *
 * **Ordering convention (FR-15):** files and subfolders sharing the same
 * parent are ordered together — not files-then-folders — by
 * case-insensitive natural filename order, via
 * `localeCompare(..., undefined, { numeric: true, sensitivity: "base" })`
 * (e.g. "Chapter 2" sorts before "Chapter 10"). No natural-sort utility
 * exists elsewhere in the codebase to reuse (verified: `localeCompare`
 * appears only in `frontend/src/store/querySlice.ts`, for an unrelated
 * purpose), so the comparator is implemented locally in this module.
 */
import path from "node:path";
import { readdir, stat } from "../io";

/**
 * Result of {@link detectDocxSource}: which of the two supported source
 * shapes (FR-1) the given path is.
 */
export interface DetectedDocxSource {
  /** `"file"` for a single `.docx` source, `"directory"` for a folder source. */
  readonly kind: "file" | "directory";
}

/**
 * Thrown by {@link detectDocxSource} when a directory source contains no
 * `.docx` file anywhere in its tree (FR-1). Raised before any destination
 * write, mirroring `import-scrivener-project.ts`'s
 * `DestinationNotEmptyError` "refuse before writing" convention.
 */
export class NoDocxFilesFoundError extends Error {
  /**
   * @param sourcePath - The directory path that was refused.
   */
  constructor(sourcePath: string) {
    super(
      `Cannot import from "${sourcePath}": no .docx file was found ` +
        `anywhere in this directory. Choose a directory containing at ` +
        `least one .docx file.`,
    );
    this.name = "NoDocxFilesFoundError";
  }
}

/**
 * A single `.docx` file included in a {@link DocxFolderWalkPlan}.
 */
interface DocxWalkFile {
  /** Discriminant identifying this entry as a file, not a folder. */
  readonly kind: "file";
  /** The file's own basename, including its `.docx` extension. */
  readonly name: string;
  /** The file's full path, joined from the directory being walked. */
  readonly path: string;
}

/**
 * A subfolder included in a {@link DocxFolderWalkPlan}. Only present when it
 * contains at least one `.docx` file somewhere beneath it (see the module
 * doc's "Pruning convention").
 */
interface DocxWalkFolder {
  /** Discriminant identifying this entry as a folder, not a file. */
  readonly kind: "folder";
  /** The subfolder's own basename. */
  readonly name: string;
  /** The subfolder's full path, joined from its parent directory. */
  readonly path: string;
  /** This subfolder's own ordered children (files and subfolders), pruned and sorted the same way as the root. */
  readonly entries: readonly DocxWalkEntry[];
}

/** A single ordered child of a walked directory: either a `.docx` file or a non-empty subfolder. */
export type DocxWalkEntry = DocxWalkFile | DocxWalkFolder;

/**
 * Per-category counts of entries skipped while walking a folder source
 * (FR-15), aggregated across the entire recursive walk. Field names match
 * `docx-import-report.ts`'s `DocxImportReportInput` so a later orchestrator
 * can pass this shape straight into the FR-6 report.
 */
export interface DocxFolderSkipCounts {
  /** Number of non-`.docx` files skipped while walking the folder. */
  readonly nonDocxFilesSkippedCount: number;
  /** Number of Word temporary lock files (`~$*.docx`) skipped while walking the folder. */
  readonly lockFilesSkippedCount: number;
  /** Number of hidden/dot files or directories skipped while walking the folder. */
  readonly hiddenFilesSkippedCount: number;
}

/**
 * Result of {@link walkDocxFolder}: an ordered plan of a directory source's
 * `.docx` files and non-empty subfolders, plus the FR-15 skip tally.
 */
export interface DocxFolderWalkPlan {
  /** This directory's own ordered children (files and subfolders), pruned and sorted per the module doc. */
  readonly entries: readonly DocxWalkEntry[];
  /** Aggregated FR-15 skip counts across this directory and everything beneath it. */
  readonly skips: DocxFolderSkipCounts;
}

/** Zero-valued {@link DocxFolderSkipCounts}, the identity element for {@link addSkipCounts}. */
const ZERO_SKIP_COUNTS: DocxFolderSkipCounts = {
  nonDocxFilesSkippedCount: 0,
  lockFilesSkippedCount: 0,
  hiddenFilesSkippedCount: 0,
};

/** Matches a Word temporary lock file, e.g. `~$chapter-3.docx`, case-insensitively. */
const LOCK_FILE_PATTERN = /^~\$.*\.docx$/i;

/**
 * Adds two {@link DocxFolderSkipCounts} together, category by category.
 *
 * @param a - First set of counts.
 * @param b - Second set of counts.
 * @returns The element-wise sum of `a` and `b`.
 */
function addSkipCounts(
  a: DocxFolderSkipCounts,
  b: DocxFolderSkipCounts,
): DocxFolderSkipCounts {
  return {
    nonDocxFilesSkippedCount:
      a.nonDocxFilesSkippedCount + b.nonDocxFilesSkippedCount,
    lockFilesSkippedCount: a.lockFilesSkippedCount + b.lockFilesSkippedCount,
    hiddenFilesSkippedCount:
      a.hiddenFilesSkippedCount + b.hiddenFilesSkippedCount,
  };
}

/**
 * Reports whether a filesystem entry name is hidden/dot (FR-15): its
 * basename starts with `.`.
 *
 * @param name - The entry's basename.
 * @returns `true` when the name starts with `.`.
 */
function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

/**
 * Reports whether a filename is a Word temporary lock file (`~$*.docx`).
 *
 * @param name - The entry's basename.
 * @returns `true` when the name matches the lock-file pattern.
 */
function isLockFileName(name: string): boolean {
  return LOCK_FILE_PATTERN.test(name);
}

/**
 * Reports whether a filename has a `.docx` extension, case-insensitively.
 *
 * @param name - The entry's basename.
 * @returns `true` when the name ends in `.docx` (any case).
 */
function isDocxFileName(name: string): boolean {
  return path.extname(name).toLowerCase() === ".docx";
}

/**
 * Compares two filesystem entry names in case-insensitive natural order
 * (FR-15), e.g. "Chapter 2" before "Chapter 10".
 *
 * @param a - First name to compare.
 * @param b - Second name to compare.
 * @returns A negative, zero, or positive number per `localeCompare`'s contract.
 */
function compareEntryNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Auto-detects whether `sourcePath` is a single `.docx` file or a directory
 * (FR-1), and refuses a directory source that contains no `.docx` file
 * anywhere in its tree, before any destination write.
 *
 * A non-directory path is always reported as `"file"` without further
 * inspection — this task does not validate that a file source actually has
 * a `.docx` extension, since FR-1 only requires auto-detecting file-vs-
 * directory, not validating a file source's extension.
 *
 * @param sourcePath - Path to the import source (file or directory).
 * @returns `{ kind: "file" }` or `{ kind: "directory" }`.
 * @throws {NoDocxFilesFoundError} When `sourcePath` is a directory containing no `.docx` file anywhere beneath it.
 * @example
 * ```ts
 * const source = await detectDocxSource("/path/to/manuscript.docx");
 * // source.kind === "file"
 * ```
 */
export async function detectDocxSource(
  sourcePath: string,
): Promise<DetectedDocxSource> {
  const stats = await stat(sourcePath);
  if (!stats.isDirectory()) {
    return { kind: "file" };
  }

  const plan = await walkDocxFolder(sourcePath);
  if (plan.entries.length === 0) {
    throw new NoDocxFilesFoundError(sourcePath);
  }
  return { kind: "directory" };
}

/**
 * Recursively walks a directory source into an ordered plan of `.docx`
 * files and non-empty subfolders (FR-3, FR-15).
 *
 * Traverses to any depth. Within each directory, a hidden/dot file or
 * directory is skipped as a single unit (its contents are never inspected);
 * a Word lock file (`~$*.docx`) and any other non-`.docx` file are each
 * skipped individually. A subfolder with no `.docx` file anywhere beneath it
 * is omitted from `entries`, though skips found inside it are still folded
 * into the returned `skips` tally. Remaining files and subfolders in each
 * directory are ordered together via case-insensitive natural filename
 * order.
 *
 * @param dirPath - Directory to walk.
 * @returns The ordered walk plan and aggregated FR-15 skip counts.
 * @example
 * ```ts
 * const plan = await walkDocxFolder("/path/to/manuscript-folder");
 * // plan.entries is ordered files/subfolders; plan.skips tallies skipped entries
 * ```
 */
export async function walkDocxFolder(
  dirPath: string,
): Promise<DocxFolderWalkPlan> {
  const dirents = await readdir(dirPath, { withFileTypes: true });

  const unsorted: DocxWalkEntry[] = [];
  let skips = ZERO_SKIP_COUNTS;

  for (const dirent of dirents) {
    const name = dirent.name;
    const entryPath = path.join(dirPath, name);

    if (isHiddenName(name)) {
      skips = addSkipCounts(skips, {
        ...ZERO_SKIP_COUNTS,
        hiddenFilesSkippedCount: 1,
      });
      continue;
    }

    if (dirent.isDirectory()) {
      const subPlan = await walkDocxFolder(entryPath);
      skips = addSkipCounts(skips, subPlan.skips);
      // A subfolder with no .docx anywhere beneath it is pruned entirely.
      if (subPlan.entries.length > 0) {
        unsorted.push({
          kind: "folder",
          name,
          path: entryPath,
          entries: subPlan.entries,
        });
      }
      continue;
    }

    if (isLockFileName(name)) {
      skips = addSkipCounts(skips, {
        ...ZERO_SKIP_COUNTS,
        lockFilesSkippedCount: 1,
      });
      continue;
    }

    if (isDocxFileName(name)) {
      unsorted.push({ kind: "file", name, path: entryPath });
      continue;
    }

    skips = addSkipCounts(skips, {
      ...ZERO_SKIP_COUNTS,
      nonDocxFilesSkippedCount: 1,
    });
  }

  const entries = [...unsorted].sort((a, b) =>
    compareEntryNames(a.name, b.name),
  );

  return { entries, skips };
}
