/**
 * @module split-records-core
 *
 * Store for the two records of "Split a document at the cursor" (Feature 120,
 * FR-5 and FR-16): the lineage record of a split-off document and the
 * project's latest-operation record. Each is its own file under `meta/`
 * (`lineage.json`, `latest-operation.json`), written through the storage
 * adapter, outside `project.json` and outside every sidecar, so no client
 * sidecar update can write or clear either and the Trash purge sweep (which
 * deletes per-id paths only, `experiments/task-3.md`) leaves both alone.
 *
 * Reads never report a failure as absence: a missing file is `none`; an
 * unparseable file or a record of the wrong shape is `failed`; a locked
 * project rethrows the existing locked-access error. A write that would have
 * to replace a file it cannot read throws {@link SplitRecordsUnreadableError}
 * and leaves the stored bytes as they were.
 *
 * The record shapes are those of `split-types.ts` (Task 9). The read-result
 * unions below are defined here, not in `split-types.ts`, which only Task 9
 * edits.
 */
import { atomicWriteFile, mkdir, readFile, rm } from "./io";
import { isLockedAccessError } from "./locked-access";
import { withMetaLock } from "./meta-locks";
import {
  SPLIT_OPERATION_KINDS,
  type LatestOperationRecord,
  type SnapshotRevisionRef,
  type SplitLineageRecord,
} from "./split-types";
import { isValidUUID } from "./uuid";

/** File name of the lineage record store, under `meta/`. */
export const LINEAGE_FILE_NAME = "lineage.json";

/** File name of the latest-operation record, under `meta/`. */
export const LATEST_OPERATION_FILE_NAME = "latest-operation.json";

/** A stored record file exists but cannot be read as a valid record. */
export class SplitRecordsUnreadableError extends Error {
  constructor(fileName: string, detail: string) {
    super(`meta/${fileName} could not be read: ${detail}`);
    this.name = "SplitRecordsUnreadableError";
  }
}

/** Result of reading one lineage entry. `failed` is never `none`. */
export type LineageReadResult =
  | { outcome: "found"; record: SplitLineageRecord }
  | { outcome: "none" }
  | { outcome: "failed"; cause: string };

/** Result of reading the latest-operation record. `failed` is never `none`. */
export type LatestOperationReadResult =
  | { outcome: "found"; record: LatestOperationRecord }
  | { outcome: "none" }
  | { outcome: "failed"; cause: string };

type LineageFile = Record<string, SplitLineageRecord>;

type FileRead<T> =
  | { kind: "value"; value: T }
  | { kind: "absent" }
  | { kind: "failed"; cause: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isLineageRecord(value: unknown): value is SplitLineageRecord {
  return (
    isRecord(value) &&
    isValidUUID(String(value.sourceDocumentId)) &&
    isNonEmptyString(value.sourceRevisionId) &&
    typeof value.sourceRevisionNumber === "number" &&
    Number.isInteger(value.sourceRevisionNumber) &&
    value.operation === "split" &&
    isIsoDate(value.date)
  );
}

function isSnapshotRef(value: unknown): value is SnapshotRevisionRef {
  return (
    isRecord(value) &&
    isValidUUID(String(value.documentId)) &&
    isNonEmptyString(value.revisionId) &&
    typeof value.revisionNumber === "number" &&
    Number.isInteger(value.revisionNumber)
  );
}

function isLatestOperationRecord(
  value: unknown,
): value is LatestOperationRecord {
  return (
    isRecord(value) &&
    (SPLIT_OPERATION_KINDS as readonly unknown[]).includes(value.kind) &&
    Array.isArray(value.affectedDocumentIds) &&
    value.affectedDocumentIds.every(
      (id) => typeof id === "string" && isValidUUID(id),
    ) &&
    Array.isArray(value.snapshotRevisions) &&
    value.snapshotRevisions.every(isSnapshotRef) &&
    isValidUUID(String(value.newDocumentId)) &&
    isIsoDate(value.date)
  );
}

function isLineageFile(value: unknown): value is LineageFile {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([id, entry]) => isValidUUID(id) && isLineageRecord(entry),
    )
  );
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

function metaPath(projectRoot: string, fileName: string): string {
  return `${projectRoot}/meta/${fileName}`;
}

/**
 * Reads and validates one record file. A locked-access error is rethrown; a
 * missing file is `absent`; every other read or parse failure is `failed`.
 */
async function readRecordFile<T>(
  projectRoot: string,
  fileName: string,
  guard: (value: unknown) => value is T,
): Promise<FileRead<T>> {
  let raw: string;
  try {
    raw = await readFile(metaPath(projectRoot, fileName), "utf8");
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    if (isNotFound(err)) return { kind: "absent" };
    return {
      kind: "failed",
      cause: err instanceof Error ? err.message : "read failed",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return { kind: "failed", cause: "not valid JSON" };
  }
  if (!guard(parsed)) {
    return { kind: "failed", cause: "unexpected shape" };
  }
  return { kind: "value", value: parsed };
}

async function writeRecordFile(
  projectRoot: string,
  fileName: string,
  body: unknown,
): Promise<void> {
  await mkdir(`${projectRoot}/meta`, { recursive: true });
  await atomicWriteFile(
    metaPath(projectRoot, fileName),
    JSON.stringify(body, null, 2),
    {
      writeOptions: "utf8",
      durable: process.env.GETWRITE_DURABLE_META === "1",
    },
  );
}

/**
 * Reads the lineage entry of one document.
 *
 * @throws The locked-access error for a locked or key-less encrypted project.
 */
export async function readLineageEntry(
  projectRoot: string,
  documentId: string,
): Promise<LineageReadResult> {
  const read = await readRecordFile(
    projectRoot,
    LINEAGE_FILE_NAME,
    isLineageFile,
  );
  if (read.kind === "failed") return { outcome: "failed", cause: read.cause };
  if (read.kind === "absent") return { outcome: "none" };
  if (!Object.prototype.hasOwnProperty.call(read.value, documentId)) {
    return { outcome: "none" };
  }
  return { outcome: "found", record: read.value[documentId] };
}

/**
 * Adds or replaces the lineage entry of `documentId`, keeping every other
 * entry. Load, change and save run in one `withMetaLock` step.
 *
 * @throws SplitRecordsUnreadableError when the stored file cannot be read as
 *   a lineage file (nothing is written); the locked-access error when locked;
 *   Error for a `documentId` that is not a UUID.
 */
export async function writeLineageEntry(
  projectRoot: string,
  documentId: string,
  record: SplitLineageRecord,
): Promise<void> {
  if (!isValidUUID(documentId)) {
    throw new Error("Lineage entries are keyed by a document UUID.");
  }
  if (!isLineageRecord(record)) {
    throw new Error("The lineage record is not valid.");
  }
  await withMetaLock(projectRoot, async () => {
    const read = await readRecordFile(
      projectRoot,
      LINEAGE_FILE_NAME,
      isLineageFile,
    );
    if (read.kind === "failed") {
      throw new SplitRecordsUnreadableError(LINEAGE_FILE_NAME, read.cause);
    }
    const entries: LineageFile = read.kind === "value" ? { ...read.value } : {};
    entries[documentId] = record;
    await writeRecordFile(projectRoot, LINEAGE_FILE_NAME, entries);
  });
}

/**
 * Reads the project's latest-operation record.
 *
 * @throws The locked-access error for a locked or key-less encrypted project.
 */
export async function readLatestOperation(
  projectRoot: string,
): Promise<LatestOperationReadResult> {
  const read = await readRecordFile(
    projectRoot,
    LATEST_OPERATION_FILE_NAME,
    isLatestOperationRecord,
  );
  if (read.kind === "failed") return { outcome: "failed", cause: read.cause };
  if (read.kind === "absent") return { outcome: "none" };
  return { outcome: "found", record: read.value };
}

/**
 * Replaces the project's latest-operation record (there is one per project,
 * replaced by each later operation).
 *
 * @throws Error for a record that is not valid; the locked-access error when
 *   locked.
 */
export async function writeLatestOperation(
  projectRoot: string,
  record: LatestOperationRecord,
): Promise<void> {
  if (!isLatestOperationRecord(record)) {
    throw new Error("The latest-operation record is not valid.");
  }
  await withMetaLock(projectRoot, () =>
    writeRecordFile(projectRoot, LATEST_OPERATION_FILE_NAME, record),
  );
}

/**
 * Clears the latest-operation record. Clearing when none is stored succeeds.
 *
 * @throws The locked-access error when locked.
 */
export async function clearLatestOperation(projectRoot: string): Promise<void> {
  await withMetaLock(projectRoot, async () => {
    // `rm` with `force` answered a locked project with success in the
    // encrypted-adapter test, so the read below is what raises the lock.
    await readRecordFile(
      projectRoot,
      LATEST_OPERATION_FILE_NAME,
      isLatestOperationRecord,
    );
    await rm(metaPath(projectRoot, LATEST_OPERATION_FILE_NAME), {
      force: true,
    });
  });
}
