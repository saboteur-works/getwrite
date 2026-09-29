// Last Updated: 2026-09-28

/**
 * @module source-detection
 *
 * Implements FR-2, FR-3, and FR-4 of the plain-text importer
 * (`specs/features/plain-text-import.md`): auto-detecting whether an import
 * source is a single `.txt` file or a directory, refusing a directory that
 * contains no `.txt` file anywhere in its tree (before any write), and
 * recursively walking a directory source into an ordered plan of `.txt`
 * files and subfolders.
 *
 * This module mirrors `docx/source-detection.ts`'s `detectDocxSource`/
 * `walkDocxFolder` almost exactly, adjusted for `.txt`: there is no
 * Word-lock-file concept for plain text, so the skip-counts shape here only
 * has a non-`.txt`-files category and a hidden-files category, not three.
 *
 * Both {@link detectPlainTextSource} and {@link walkPlainTextFolder} are pure
 * functions apart from read-only filesystem access, performed exclusively
 * through `io.ts`'s `StorageAdapter` wrappers (`stat`/`readdir`) rather than
 * `node:fs` directly, per `docs/standards/storage-context.md` §5. Nothing is
 * written to any destination here — this module only inspects a source and
 * produces a plan for a later task (the plain-text import orchestrator) to
 * act on.
 *
 * **Skip-and-summarize convention (FR-2):** a non-`.txt` file and any
 * hidden/dot file or directory (a name starting with `.`) are never included
 * in the walk plan. Instead they are tallied into
 * {@link PlainTextFolderSkipCounts}, one count per category, aggregated
 * across the entire recursive walk. A hidden directory is skipped as a
 * single unit (counted once) without descending into it, mirroring how a
 * hidden file is a single skip rather than being expanded.
 *
 * **Pruning convention (FR-2):** a subfolder containing no `.txt` file
 * anywhere beneath it (after its own contents are walked and skip-
 * categorized) is omitted from its parent's `entries` entirely — it is
 * never represented as an empty GetWrite folder. Its skip counts are still
 * folded into the aggregate returned to the caller, since a non-`.txt`
 * file inside an otherwise-empty subfolder was still a real skip that
 * happened during the walk, even though the subfolder itself produces no
 * destination folder.
 *
 * **Ordering convention (FR-2, resolves OQ-4):** files and subfolders
 * sharing the same parent are ordered together — not files-then-folders —
 * by case-insensitive natural filename order, via
 * `localeCompare(..., undefined, { numeric: true, sensitivity: "base" })`
 * (e.g. "Chapter 2" sorts before "Chapter 10"), exactly mirroring
 * `walkDocxFolder`'s convention.
 */
import path from "node:path";
import { readdir, stat } from "../io";

/**
 * Result of {@link detectPlainTextSource}: which of the two supported source
 * shapes (FR-3) the given path is.
 */
export interface DetectedPlainTextSource {
  /** `"file"` for a single `.txt` source, `"directory"` for a folder source. */
  readonly kind: "file" | "directory";
}

/**
 * Thrown by {@link detectPlainTextSource} when a directory source contains
 * no `.txt` file anywhere in its tree (FR-4). Raised before any destination
 * write, mirroring `docx/source-detection.ts`'s `NoDocxFilesFoundError`
 * "refuse before writing" convention.
 */
export class NoTxtFilesFoundError extends Error {
  /**
   * @param sourcePath - The directory path that was refused.
   */
  constructor(sourcePath: string) {
    super(
      `Cannot import from "${sourcePath}": no .txt file was found ` +
        `anywhere in this directory. Choose a directory containing at ` +
        `least one .txt file.`,
    );
    this.name = "NoTxtFilesFoundError";
  }
}

/**
 * A single `.txt` file included in a {@link PlainTextFolderWalkPlan}.
 */
interface PlainTextWalkFile {
  /** Discriminant identifying this entry as a file, not a folder. */
  readonly kind: "file";
  /** The file's own basename, including its `.txt` extension. */
  readonly name: string;
  /** The file's full path, joined from the directory being walked. */
  readonly path: string;
}

/**
 * A subfolder included in a {@link PlainTextFolderWalkPlan}. Only present
 * when it contains at least one `.txt` file somewhere beneath it (see the
 * module doc's "Pruning convention").
 */
interface PlainTextWalkFolder {
  /** Discriminant identifying this entry as a folder, not a file. */
  readonly kind: "folder";
  /** The subfolder's own basename. */
  readonly name: string;
  /** The subfolder's full path, joined from its parent directory. */
  readonly path: string;
  /** This subfolder's own ordered children (files and subfolders), pruned and sorted the same way as the root. */
  readonly entries: readonly PlainTextWalkEntry[];
}

/** A single ordered child of a walked directory: either a `.txt` file or a non-empty subfolder. */
export type PlainTextWalkEntry = PlainTextWalkFile | PlainTextWalkFolder;

/**
 * Per-category counts of entries skipped while walking a folder source
 * (FR-2), aggregated across the entire recursive walk.
 */
export interface PlainTextFolderSkipCounts {
  /** Number of non-`.txt` files skipped while walking the folder. */
  readonly nonTxtFilesSkippedCount: number;
  /** Number of hidden/dot files or directories skipped while walking the folder. */
  readonly hiddenFilesSkippedCount: number;
}

/**
 * Result of {@link walkPlainTextFolder}: an ordered plan of a directory
 * source's `.txt` files and non-empty subfolders, plus the FR-2 skip tally.
 */
export interface PlainTextFolderWalkPlan {
  /** This directory's own ordered children (files and subfolders), pruned and sorted per the module doc. */
  readonly entries: readonly PlainTextWalkEntry[];
  /** Aggregated FR-2 skip counts across this directory and everything beneath it. */
  readonly skips: PlainTextFolderSkipCounts;
}

/** Zero-valued {@link PlainTextFolderSkipCounts}, the identity element for {@link addSkipCounts}. */
const ZERO_SKIP_COUNTS: PlainTextFolderSkipCounts = {
  nonTxtFilesSkippedCount: 0,
  hiddenFilesSkippedCount: 0,
};

/**
 * Adds two {@link PlainTextFolderSkipCounts} together, category by category.
 *
 * @param a - First set of counts.
 * @param b - Second set of counts.
 * @returns The element-wise sum of `a` and `b`.
 */
function addSkipCounts(
  a: PlainTextFolderSkipCounts,
  b: PlainTextFolderSkipCounts,
): PlainTextFolderSkipCounts {
  return {
    nonTxtFilesSkippedCount:
      a.nonTxtFilesSkippedCount + b.nonTxtFilesSkippedCount,
    hiddenFilesSkippedCount:
      a.hiddenFilesSkippedCount + b.hiddenFilesSkippedCount,
  };
}

/**
 * Reports whether a filesystem entry name is hidden/dot (FR-2): its
 * basename starts with `.`.
 *
 * @param name - The entry's basename.
 * @returns `true` when the name starts with `.`.
 */
function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

/**
 * Reports whether a filename has a `.txt` extension, case-insensitively.
 *
 * @param name - The entry's basename.
 * @returns `true` when the name ends in `.txt` (any case).
 */
function isTxtFileName(name: string): boolean {
  return path.extname(name).toLowerCase() === ".txt";
}

/**
 * Compares two filesystem entry names in case-insensitive natural order
 * (FR-2, resolves OQ-4), e.g. "Chapter 2" before "Chapter 10".
 *
 * @param a - First name to compare.
 * @param b - Second name to compare.
 * @returns A negative, zero, or positive number per `localeCompare`'s contract.
 */
function compareEntryNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Auto-detects whether `sourcePath` is a single `.txt` file or a directory
 * (FR-3), and refuses a directory source that contains no `.txt` file
 * anywhere in its tree, before any destination write (FR-4).
 *
 * A non-directory path is always reported as `"file"` without further
 * inspection — this task does not validate that a file source actually has
 * a `.txt` extension, since FR-3 only requires auto-detecting file-vs-
 * directory, not validating a file source's extension.
 *
 * @param sourcePath - Path to the import source (file or directory).
 * @returns `{ kind: "file" }` or `{ kind: "directory" }`.
 * @throws {NoTxtFilesFoundError} When `sourcePath` is a directory containing no `.txt` file anywhere beneath it.
 * @example
 * ```ts
 * const source = await detectPlainTextSource("/path/to/manuscript.txt");
 * // source.kind === "file"
 * ```
 */
export async function detectPlainTextSource(
  sourcePath: string,
): Promise<DetectedPlainTextSource> {
  const stats = await stat(sourcePath);
  if (!stats.isDirectory()) {
    return { kind: "file" };
  }

  const plan = await walkPlainTextFolder(sourcePath);
  if (plan.entries.length === 0) {
    throw new NoTxtFilesFoundError(sourcePath);
  }
  return { kind: "directory" };
}

/**
 * Recursively walks a directory source into an ordered plan of `.txt` files
 * and non-empty subfolders (FR-2, FR-4).
 *
 * Traverses to any depth. Within each directory, a hidden/dot file or
 * directory is skipped as a single unit (its contents are never inspected);
 * any other non-`.txt` file is skipped individually. A subfolder with no
 * `.txt` file anywhere beneath it is omitted from `entries`, though skips
 * found inside it are still folded into the returned `skips` tally.
 * Remaining files and subfolders in each directory are ordered together via
 * case-insensitive natural filename order.
 *
 * @param dirPath - Directory to walk.
 * @returns The ordered walk plan and aggregated FR-2 skip counts.
 * @example
 * ```ts
 * const plan = await walkPlainTextFolder("/path/to/manuscript-folder");
 * // plan.entries is ordered files/subfolders; plan.skips tallies skipped entries
 * ```
 */
export async function walkPlainTextFolder(
  dirPath: string,
): Promise<PlainTextFolderWalkPlan> {
  const dirents = await readdir(dirPath, { withFileTypes: true });

  const unsorted: PlainTextWalkEntry[] = [];
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
      const subPlan = await walkPlainTextFolder(entryPath);
      skips = addSkipCounts(skips, subPlan.skips);
      // A subfolder with no .txt anywhere beneath it is pruned entirely.
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

    if (isTxtFileName(name)) {
      unsorted.push({ kind: "file", name, path: entryPath });
      continue;
    }

    skips = addSkipCounts(skips, {
      ...ZERO_SKIP_COUNTS,
      nonTxtFilesSkippedCount: 1,
    });
  }

  const entries = [...unsorted].sort((a, b) =>
    compareEntryNames(a.name, b.name),
  );

  return { entries, skips };
}
