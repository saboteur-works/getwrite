/**
 * @module merge-mark-core
 *
 * Store for the merged mark of "Merge documents" (Feature 121, FR-5): the
 * sidecar key `mergedMark` on an absorbed document, written through
 * `mutateSidecar` (the storage adapter), so an encrypted project stores it
 * encrypted and a read with no usable key raises the locked-access error.
 *
 * The key is outside `CLIENT_WRITABLE_SIDECAR_KEYS` and the clearable list
 * (`resource-crud-core.ts`), so no client sidecar update can write or clear
 * it. {@link removeMergedMark} exists for compensation and Undo only and is
 * not exposed to a client. Nothing here purges a document.
 *
 * Reads never report a failure as absence: no key is `none`; an unreadable
 * sidecar, a missing sidecar or a value of the wrong shape is `failed`; a
 * locked project rethrows the existing locked-access error.
 */
import { isLockedAccessError } from "./locked-access";
import { MERGED_MARK_SIDECAR_KEY, type MergedMark } from "./merge-types";
import { mutateSidecar, readSidecar, SIDECAR_UNCHANGED } from "./sidecar";
import type { MetadataValue } from "./types";

/** Thrown when a mark is written for a document that has no live sidecar. */
export class MergeMarkTargetMissingError extends Error {
  constructor(documentId: string) {
    super(`Cannot write a merged mark: document ${documentId} has no sidecar.`);
    this.name = "MergeMarkTargetMissingError";
  }
}

/** Thrown when a mark's date is not a full ISO 8601 instant. */
export class MergeMarkInvalidDateError extends Error {
  constructor(date: string) {
    super(
      `Cannot write a merged mark: date ${JSON.stringify(date)} is not a full ISO 8601 instant (date, time and zone).`,
    );
    this.name = "MergeMarkInvalidDateError";
  }
}

/** Date, time (minutes required) and a zone designator (Z or +/-HH:MM). */
const FULL_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** True for a full ISO 8601 instant that also parses to a real time. */
function isFullInstant(value: string): boolean {
  return FULL_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

/** Result of reading one merged mark. `failed` is never `none`. */
export type MergedMarkReadResult =
  | { outcome: "found"; mark: MergedMark }
  | { outcome: "none" }
  | { outcome: "failed"; cause: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseMark(value: unknown): MergedMark | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  if (
    !isNonEmptyString(v.targetDocumentId) ||
    !isNonEmptyString(v.targetSnapshotRevisionId) ||
    typeof v.date !== "string" ||
    !isFullInstant(v.date)
  ) {
    return null;
  }
  return {
    targetDocumentId: v.targetDocumentId,
    targetSnapshotRevisionId: v.targetSnapshotRevisionId,
    date: v.date,
  };
}

/**
 * Writes the mark on an absorbed document, keeping every other sidecar key.
 *
 * @throws {MergeMarkInvalidDateError} When the date is not a full ISO 8601
 *   instant (date-only or unparseable); nothing is written.
 * @throws {MergeMarkTargetMissingError} When the document has no sidecar.
 * @throws A locked-access error when the project is locked.
 */
export async function writeMergedMark(
  projectRoot: string,
  absorbedDocumentId: string,
  mark: MergedMark,
): Promise<void> {
  if (!isFullInstant(mark.date)) throw new MergeMarkInvalidDateError(mark.date);
  await mutateSidecar(projectRoot, absorbedDocumentId, (current) => {
    if (current === null) {
      throw new MergeMarkTargetMissingError(absorbedDocumentId);
    }
    return {
      ...current,
      [MERGED_MARK_SIDECAR_KEY]: {
        targetDocumentId: mark.targetDocumentId,
        targetSnapshotRevisionId: mark.targetSnapshotRevisionId,
        date: mark.date,
      },
    };
  });
}

/**
 * Reads the mark of a document.
 *
 * @throws A locked-access error when the project is locked.
 */
export async function readMergedMark(
  projectRoot: string,
  documentId: string,
): Promise<MergedMarkReadResult> {
  let sidecar: Record<string, MetadataValue> | null;
  try {
    sidecar = await readSidecar(projectRoot, documentId);
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return {
      outcome: "failed",
      cause: err instanceof Error ? err.message : String(err),
    };
  }
  if (sidecar === null) {
    return { outcome: "failed", cause: "the document has no sidecar" };
  }
  if (!(MERGED_MARK_SIDECAR_KEY in sidecar)) return { outcome: "none" };
  const mark = parseMark(sidecar[MERGED_MARK_SIDECAR_KEY]);
  if (mark === null) {
    return { outcome: "failed", cause: "the stored mark has the wrong shape" };
  }
  return { outcome: "found", mark };
}

/**
 * Removes the mark. For merge compensation and Undo only; not exposed to a
 * client. A document with no mark or no sidecar is left untouched.
 *
 * @throws A locked-access error when the project is locked.
 */
export async function removeMergedMark(
  projectRoot: string,
  documentId: string,
): Promise<void> {
  await mutateSidecar(projectRoot, documentId, (current) => {
    if (current === null || !(MERGED_MARK_SIDECAR_KEY in current)) {
      return SIDECAR_UNCHANGED;
    }
    const next = { ...current };
    delete next[MERGED_MARK_SIDECAR_KEY];
    return next;
  });
}

/**
 * Returns a copy of a sidecar without the mark. Used by the two copy paths
 * (`copyResourceCore`, `duplicateResource`), so a copy is never marked merged.
 */
export function withoutMergedMark<T extends Record<string, MetadataValue>>(
  sidecar: T,
): T {
  const next = { ...sidecar };
  delete next[MERGED_MARK_SIDECAR_KEY];
  return next;
}
