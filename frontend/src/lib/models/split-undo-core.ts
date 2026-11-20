/**
 * @module split-undo-core
 *
 * Undo of the latest split (Feature 120, FR-15 read side and FR-17): one
 * operation that saves the current text of both documents as preserved
 * revisions, puts the original's text back from the split snapshot, moves
 * carried notes back, sends the split-off document to Trash, drops its saved
 * compile exclusion and clears the latest-operation record so Undo runs once.
 *
 * Reads, in order, with no write: the latest-operation record (from disk, no
 * in-memory state), then everything the pure lineage resolver
 * (`split-lineage-resolver.ts`) takes as probes (the original's live sidecar,
 * the snapshot among its live revisions, its trashed sidecar and trashed
 * revisions), then what the writes need (the snapshot text, the split-off
 * document's notes, whether a later split names the split-off document as its
 * source). A refusal, or a read that fails, ends here and changes nothing.
 * A read that fails is its own outcome (`could-not-be-checked`) and is never
 * folded into a refusal or into "nothing to undo".
 *
 * Locks, one recorded order, none nested inside itself: the original's
 * `revision-content` lock, then the split-off document's, both held to the end
 * of the writes and released in reverse in `finally`. The record is read again
 * inside the locks, so of two overlapping calls one applies and the other
 * finds nothing to undo. `acquireLock` is not reentrant, so the no-log write
 * of the original passes `lockHeld: true`. The claim holds under one writer
 * instance per tenant (ADR-017, ADR-019).
 *
 * Writes, each its own function so a later task can wrap them with reverse
 * compensation (`SPLIT_UNDO_STEPS`, in order): `save-current-text` (a
 * preserved revision of each live document), `restore-original` (the no-log
 * write, not `setCanonicalRevision`; the writing log is not touched),
 * `move-annotations`, `trash-split-off` (the existing soft delete; a document
 * already in Trash, or already purged, makes it a no-op and Undo never purges),
 * `remove-exclusion`, `clear-record`. The snapshot revision stays, preserved.
 * After the writes, outside the operation, the original's derived data is
 * brought up to date (`updateDocumentIndexes`); a failure there is returned as
 * `index-failed` and undoes nothing.
 *
 * A step that throws is rolled back (FR-6 rules applied to Undo, Task 30): the
 * steps that ran, the failing one included, are undone in reverse, so the split
 * state before Undo is back: the latest-operation record is put back as the raw
 * text read before the first step, the compile exclusion is re-listed, the
 * split-off document is taken out of Trash (and the empty `.trash`
 * directories the soft delete created are removed), both documents' note
 * lists are put back, the original's text and derived files are put back from
 * raw backups, and the preserved revisions Undo made are deleted, each after
 * `setRevisionPreserve(false)` (a preserved revision is refused by
 * `deleteRevision`). Each undo is idempotent, so the step that threw after
 * writing is undone too. The result is `failed`, naming the step that failed
 * and `remainingState`; it never reads as success. A step that cannot be
 * undone is named in `remainingState`; two or more are `state-unknown`. The
 * derived-index update after the commit is outside the rollback.
 *
 * Two choices keep text from being lost when an undo fails: if the split-off
 * document cannot be taken out of Trash, the notes are not moved back to it
 * (they stay on the original) and its saved revision stays with it; if the
 * original's text cannot be put back, the revision that holds its text from
 * before Undo is kept.
 *
 * No React, JSX, JSON or `node:*`.
 */
import { flushIndexer } from "./indexer-queue";
import { atomicWriteFile, readdir, readFile, rm, stat, writeFile } from "./io";
import { isLockedAccessError } from "./locked-access";
import { acquireLock } from "./locks";
import { withMetaLock } from "./meta-locks";
import { PROJECT_FILENAME } from "./project-config";
import { updateProjectJson } from "./project-json-write";
import {
  deleteResourceCore,
  resolveResourceProjectRootOrThrow,
} from "./resource-crud-core";
import { listRevisions, revisionDir } from "./revision";
import {
  createRevision,
  deleteRevision,
  readRevision,
  setRevisionPreserve,
  writeCanonicalContentWithoutLog,
} from "./revision-core";
import { removeCompileExclusions } from "./saved-defaults-core";
import {
  mutateSidecar,
  readSidecar,
  SIDECAR_UNCHANGED,
  sidecarFilename,
} from "./sidecar";
import { removeMergedMark } from "./merge-mark-core";
import {
  MERGE_UNDO_REFUSAL_MESSAGES,
  type MergeUndoRefusalReason,
} from "./merge-undo-messages";
import {
  MERGED_MARK_SIDECAR_KEY,
  type MergeMarkStateResult,
} from "./merge-types";
import {
  resolveMergedMarkState,
  resolveSplitLineageState,
  type MergedMarkResolverInput,
  type SplitLineageProbe,
} from "./split-lineage-resolver";
import {
  SPLIT_UNDO_REFUSAL_MESSAGES,
  type SplitUndoRefusalReason,
} from "./split-messages";
import {
  updateDocumentIndexes,
  type SplitIndexFailure,
} from "./split-index-update";
import { revisionContentLockKey } from "./split-preview-core";
import {
  clearLatestOperation,
  LATEST_OPERATION_FILE_NAME,
  LINEAGE_FILE_NAME,
  readLatestOperation,
} from "./split-records-core";
import { restoreResource } from "./trash";
import type {
  LatestOperationRecord,
  SnapshotRevisionRef,
  SplitLineageRecord,
} from "./split-types";
import type { Annotation, MetadataValue, ProjectConfig } from "./types";

/** The ordered write steps of Undo; a failure names one. */
export const SPLIT_UNDO_STEPS = [
  "save-current-text",
  "restore-original",
  "move-annotations",
  "trash-split-off",
  "remove-exclusion",
  "clear-record",
] as const;

/** One write step of Undo. */
export type SplitUndoStep = (typeof SPLIT_UNDO_STEPS)[number];

/**
 * What remains after a failed Undo that was rolled back. One value names the
 * single undo that failed; two or more failed undos are `state-unknown`.
 * `split-restored` means everything is as it was before Undo.
 */
export type SplitUndoRemainingState =
  | "split-restored"
  | "record-not-restored"
  | "exclusion-not-restored"
  | "split-off-in-trash"
  | "notes-not-restored"
  | "original-not-restored"
  | "preserved-revisions-kept"
  | "state-unknown";

/** Where the split-off document was when Undo ran. */
export type SplitOffState = "moved-to-trash" | "was-in-trash" | "was-purged";

/** Options of {@link undoLatestSplit}; `now` is for tests. */
export interface SplitUndoOptions {
  now?: () => Date;
}

/** What a committed Undo reports. */
export interface SplitUndoAppliedFields {
  originalDocumentId: string;
  splitOffDocumentId: string;
  splitOffState: SplitOffState;
  /** The revisions that hold each document's text as it was when Undo ran. */
  preservedRevisions: SnapshotRevisionRef[];
  /** Notes put back on the original. */
  movedAnnotationIds: string[];
}

/**
 * Result of {@link undoLatestSplit}; the outcomes never share a value.
 * `applied` and `index-failed` both mean Undo is committed. `could-not-be-checked`
 * carries a stable cause and no writer text: `split-messages.ts` has no text for
 * it yet.
 */
export type SplitUndoResult =
  | ({ outcome: "applied" } & SplitUndoAppliedFields)
  | ({
      outcome: "index-failed";
      failures: SplitIndexFailure[];
    } & SplitUndoAppliedFields)
  | { outcome: "nothing-to-undo" }
  | { outcome: "unsupported-operation"; kind: string }
  | { outcome: "refused"; reason: SplitUndoRefusalReason; message: string }
  | { outcome: "could-not-be-checked"; cause: string }
  | {
      outcome: "failed";
      failedStep: SplitUndoStep;
      /** A stable cause string (an error name); never client input. */
      cause: string;
      /** What is on disk after the rollback; `split-restored` when nothing remains changed. */
      remainingState: SplitUndoRemainingState;
    };

/** Everything the writes need, read before any write. */
interface UndoFacts {
  originalId: string;
  splitOffId: string;
  snapshot: SnapshotRevisionRef;
  snapshotContent: string;
  splitOffState: "live" | "in-trash" | "purged";
  /** Notes of the split-off document whose marks are in the snapshot text. */
  returning: Annotation[];
}

type Gathered =
  | { kind: "go"; facts: UndoFacts }
  | { kind: "stop"; result: SplitUndoResult };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(err: unknown): boolean {
  return isRecord(err) && err.code === "ENOENT";
}

function causeOf(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}

function cannotCheck(cause: string): Gathered {
  return { kind: "stop", result: { outcome: "could-not-be-checked", cause } };
}

function refuse(reason: SplitUndoRefusalReason): Gathered {
  return {
    kind: "stop",
    result: {
      outcome: "refused",
      reason,
      message: SPLIT_UNDO_REFUSAL_MESSAGES[reason],
    },
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/** One observation as a probe: a locked-access error is rethrown, any other failure is `failed`. */
async function observe(
  read: () => Promise<boolean>,
): Promise<SplitLineageProbe> {
  try {
    return { read: (await read()) ? "present" : "absent" };
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return { read: "failed", cause: causeOf(err) };
  }
}

/** The lineage resolver's input for the record, from the record named by Undo. */
function lineageRecordOf(
  record: LatestOperationRecord,
  snapshot: SnapshotRevisionRef,
): SplitLineageRecord {
  return {
    sourceDocumentId: snapshot.documentId,
    sourceRevisionId: snapshot.revisionId,
    sourceRevisionNumber: snapshot.revisionNumber,
    operation: "split",
    date: record.date,
  };
}

/** The split snapshot a split record names, or `null` when the record is not one a split writes. */
function snapshotOf(record: LatestOperationRecord): SnapshotRevisionRef | null {
  const [originalId, newId] = record.affectedDocumentIds;
  if (record.affectedDocumentIds.length !== 2) return null;
  if (record.snapshotRevisions.length !== 1) return null;
  const snapshot = record.snapshotRevisions[0];
  if (snapshot.documentId !== originalId) return null;
  if (record.newDocumentId !== newId || originalId === newId) return null;
  return snapshot;
}

function collectMarkIds(node: unknown, into: Set<string>): void {
  if (!isRecord(node)) return;
  if (Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (!isRecord(mark) || mark.type !== "annotation") continue;
      const id = isRecord(mark.attrs) ? mark.attrs.id : undefined;
      if (typeof id === "string") into.add(id);
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectMarkIds(child, into);
  }
}

function annotationsOf(sidecar: Record<string, unknown> | null): Annotation[] {
  const stored = sidecar?.annotations;
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (a): a is Annotation => isRecord(a) && typeof a.id === "string",
  );
}

/** Whether a later split names `documentId` as its source; `failed` is never `none`. */
async function laterSplitOf(
  projectRoot: string,
  documentId: string,
): Promise<"none" | "found" | { failed: string }> {
  let raw: string;
  try {
    raw = await readFile(`${projectRoot}/meta/${LINEAGE_FILE_NAME}`, "utf8");
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    if (isNotFound(err)) return "none";
    return { failed: causeOf(err) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return { failed: "lineage-not-valid-json" };
  }
  if (!isRecord(parsed)) return { failed: "lineage-unexpected-shape" };
  const isSource = Object.values(parsed).some(
    (entry) => isRecord(entry) && entry.sourceDocumentId === documentId,
  );
  return isSource ? "found" : "none";
}

async function readTrashedSidecar(
  projectRoot: string,
  documentId: string,
): Promise<Record<string, unknown>> {
  const raw = await readFile(
    `${projectRoot}/.trash/meta/${sidecarFilename(documentId)}`,
    "utf8",
  );
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed))
    throw new Error("trashed sidecar has an unexpected shape");
  return parsed;
}

/**
 * Reads and resolves; writes nothing. Maps the five resolver states to a
 * proceed, one of the five refusal texts, or `could-not-be-checked`.
 * `original-gone` is not produced: the resolver separates a document in Trash
 * from a purged one, and nothing separates a third "gone" case.
 */
async function gatherFacts(
  projectRoot: string,
  record: LatestOperationRecord,
  snapshot: SnapshotRevisionRef,
): Promise<Gathered> {
  const originalId = snapshot.documentId;
  const resolved = resolveSplitLineageState({
    record: lineageRecordOf(record, snapshot),
    liveDocument: await observe(
      async () => (await readSidecar(projectRoot, originalId)) !== null,
    ),
    liveSnapshotRevision: await observe(async () =>
      (await listRevisions(projectRoot, originalId)).some(
        (r) =>
          r.id === snapshot.revisionId &&
          r.versionNumber === snapshot.revisionNumber,
      ),
    ),
    trashedDocument: await observe(() =>
      pathExists(`${projectRoot}/.trash/meta/${sidecarFilename(originalId)}`),
    ),
    trashedRevisions: await observe(() =>
      pathExists(`${projectRoot}/.trash/revisions/${originalId}`),
    ),
  });
  if (resolved.state === "could-not-be-checked") {
    return cannotCheck(resolved.cause);
  }
  if (resolved.state === "revision-no-longer-kept")
    return refuse("snapshot-gone");
  if (resolved.state === "document-in-trash")
    return refuse("original-in-trash");
  if (resolved.state === "document-permanently-removed") {
    return refuse("original-purged");
  }
  return gatherWriteFacts(projectRoot, record, snapshot);
}

async function gatherWriteFacts(
  projectRoot: string,
  record: LatestOperationRecord,
  snapshot: SnapshotRevisionRef,
): Promise<Gathered> {
  const originalId = snapshot.documentId;
  if (record.kind !== "split") return cannotCheck("unsupported-operation");
  const splitOffId = record.newDocumentId;
  const later = await laterSplitOf(projectRoot, splitOffId);
  if (later === "found") return refuse("split-off-split-since");
  if (later !== "none") return cannotCheck(later.failed);

  let snapshotContent: string;
  const markIds = new Set<string>();
  try {
    snapshotContent = (
      await readRevision(projectRoot, originalId, snapshot.revisionId)
    ).content;
    collectMarkIds(JSON.parse(snapshotContent), markIds);
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return cannotCheck(`snapshot-unreadable:${causeOf(err)}`);
  }

  const live = await observe(
    async () => (await readSidecar(projectRoot, splitOffId)) !== null,
  );
  if (live.read === "failed") return cannotCheck(live.cause);
  let splitOffState: UndoFacts["splitOffState"] = "live";
  let notes: Annotation[] = [];
  try {
    if (live.read === "present") {
      notes = annotationsOf(await readSidecar(projectRoot, splitOffId));
    } else if (
      await pathExists(
        `${projectRoot}/.trash/meta/${sidecarFilename(splitOffId)}`,
      )
    ) {
      splitOffState = "in-trash";
      notes = annotationsOf(await readTrashedSidecar(projectRoot, splitOffId));
    } else {
      splitOffState = "purged";
    }
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return cannotCheck(`split-off-unreadable:${causeOf(err)}`);
  }
  return {
    kind: "go",
    facts: {
      originalId,
      splitOffId,
      snapshot,
      snapshotContent,
      splitOffState,
      returning: notes.filter((a) => markIds.has(a.id)),
    },
  };
}

// --- write steps ---------------------------------------------------------

async function saveCurrentText(
  projectRoot: string,
  documentId: string,
  date: string,
): Promise<SnapshotRevisionRef> {
  const canonical = (await listRevisions(projectRoot, documentId)).find(
    (r) => r.isCanonical,
  );
  if (!canonical) throw new Error("no canonical revision");
  const { content } = await readRevision(projectRoot, documentId, canonical.id);
  const saved = await createRevision(projectRoot, documentId, {
    content,
    isCanonical: false,
    metadata: {
      name: `Before undo split ${date.slice(0, 10)}`,
      preserve: true,
      splitUndoSave: true,
    },
  });
  return {
    documentId,
    revisionId: saved.id,
    revisionNumber: saved.versionNumber,
  };
}

async function restoreOriginal(
  projectRoot: string,
  facts: UndoFacts,
): Promise<void> {
  const canonical = (await listRevisions(projectRoot, facts.originalId)).find(
    (r) => r.isCanonical,
  );
  if (!canonical) throw new Error("no canonical revision");
  await writeCanonicalContentWithoutLog(
    projectRoot,
    facts.originalId,
    canonical.id,
    facts.snapshotContent,
    { lockHeld: true },
  );
}

/**
 * Notes whose marks are in the restored text go back on the original, each
 * once. From a live split-off document they are then removed from it; a
 * trashed document's sidecar is left as stored.
 */
async function moveAnnotationsBack(
  projectRoot: string,
  facts: UndoFacts,
): Promise<string[]> {
  const returning = facts.returning;
  if (returning.length === 0) return [];
  const ids = new Set(returning.map((a) => a.id));
  await mutateSidecar(projectRoot, facts.originalId, (current) => {
    if (current === null) throw new Error("sidecar missing");
    const now = annotationsOf(current);
    const present = new Set(now.map((a) => a.id));
    const added = returning.filter((a) => !present.has(a.id));
    return {
      ...current,
      annotations: [...now, ...added] as unknown as MetadataValue,
    };
  });
  if (facts.splitOffState === "live") {
    await mutateSidecar(projectRoot, facts.splitOffId, (current) => {
      if (current === null) throw new Error("sidecar missing");
      return {
        ...current,
        annotations: annotationsOf(current).filter(
          (a) => !ids.has(a.id),
        ) as unknown as MetadataValue,
      };
    });
  }
  return [...ids];
}

async function trashSplitOff(
  projectId: string,
  facts: UndoFacts,
): Promise<void> {
  if (facts.splitOffState !== "live") return;
  // Queued index tasks of the note move must finish first, or they would
  // write the trashed document's entries back.
  await flushIndexer();
  await deleteResourceCore(projectId, facts.splitOffId);
}

function splitOffStateOf(facts: UndoFacts): SplitOffState {
  if (facts.splitOffState === "live") return "moved-to-trash";
  return facts.splitOffState === "in-trash" ? "was-in-trash" : "was-purged";
}

/** A file's raw text before Undo, or `null` when it did not exist. */
interface RawFile {
  path: string;
  raw: string | null;
}

/** The original's stored text and derived values before its overwrite. */
interface OriginalBackup {
  contentPath: string;
  content: string;
  derived: RawFile[];
  hadUpdatedAt: boolean;
  updatedAt: unknown;
  hadWordCount: boolean;
  wordCount: unknown;
}

/** One sidecar's `annotations` value before the notes moved. */
interface NoteListBackup {
  documentId: string;
  hadKey: boolean;
  value: unknown;
}

/** The saved compile exclusions before the split-off id was removed; `null` when there was no usable list. */
interface ExclusionBackup {
  ids: string[] | null;
}

/**
 * What each step had read or recorded before it wrote, set when the step is
 * entered, so a step that threw after writing is undone as well. A field is
 * `null` until its step is entered.
 */
interface StepProgress {
  step: SplitUndoStep;
  completed: number;
  record: RawFile | null;
  /** Revision ids each live document had before Undo's first write. */
  savesBefore: { original: Set<string>; splitOff: Set<string> | null } | null;
  original: OriginalBackup | null;
  notes: NoteListBackup[] | null;
  trash: { preexistingDirs: string[] } | null;
  exclusion: ExclusionBackup | null;
  isRecordClearEntered: boolean;
}

function newProgress(): StepProgress {
  return {
    step: "save-current-text",
    completed: 0,
    record: null,
    savesBefore: null,
    original: null,
    notes: null,
    trash: null,
    exclusion: null,
    isRecordClearEntered: false,
  };
}

/** Directories `softDeleteResource` may create, deepest first, relative to the project root. */
const TRASH_DIRS_DEEPEST_FIRST = [
  ".trash/meta",
  ".trash/resources",
  ".trash/revisions",
  ".trash",
] as const;

async function readRawOrNull(path: string): Promise<RawFile> {
  try {
    return { path, raw: await readFile(path, "utf8") };
  } catch (err) {
    if (isNotFound(err)) return { path, raw: null };
    throw err;
  }
}

async function putBack(file: RawFile): Promise<void> {
  if (file.raw === null) await rm(file.path, { force: true });
  else await writeFile(file.path, file.raw, "utf8");
}

async function revisionIdsOf(
  projectRoot: string,
  documentId: string,
): Promise<Set<string>> {
  return new Set(
    (await listRevisions(projectRoot, documentId)).map((r) => r.id),
  );
}

async function backUpOriginal(
  projectRoot: string,
  originalId: string,
): Promise<OriginalBackup> {
  const canonical = (await listRevisions(projectRoot, originalId)).find(
    (r) => r.isCanonical,
  );
  if (!canonical) throw new Error("no canonical revision");
  const contentPath = `${revisionDir(projectRoot, originalId, canonical.versionNumber)}/content.bin`;
  const base = `${projectRoot}/resources/${originalId}`;
  const sidecar = (await readSidecar(projectRoot, originalId)) ?? {};
  const has = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(sidecar, key);
  return {
    contentPath,
    content: await readFile(contentPath, "utf8"),
    derived: [
      await readRawOrNull(`${base}/content.tiptap.json`),
      await readRawOrNull(`${base}/content.txt`),
    ],
    hadUpdatedAt: has("updatedAt"),
    updatedAt: sidecar.updatedAt,
    hadWordCount: has("wordCount"),
    wordCount: sidecar.wordCount,
  };
}

async function backUpNoteList(
  projectRoot: string,
  documentId: string,
): Promise<NoteListBackup> {
  const sidecar = (await readSidecar(projectRoot, documentId)) ?? {};
  return {
    documentId,
    hadKey: Object.prototype.hasOwnProperty.call(sidecar, "annotations"),
    value: sidecar.annotations,
  };
}

async function backUpExclusion(projectRoot: string): Promise<ExclusionBackup> {
  const raw = await readFile(`${projectRoot}/${PROJECT_FILENAME}`, "utf8");
  const project: unknown = JSON.parse(raw);
  const config = isRecord(project) ? project.config : undefined;
  const stored = isRecord(config) ? config.compileDefaults : undefined;
  const ids = isRecord(stored) ? stored.excludedResourceIds : undefined;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    return { ids: null };
  }
  return { ids: [...(ids as string[])] };
}

async function existingTrashDirs(projectRoot: string): Promise<string[]> {
  const found: string[] = [];
  for (const dir of TRASH_DIRS_DEEPEST_FIRST) {
    if (await pathExists(`${projectRoot}/${dir}`)) found.push(dir);
  }
  return found;
}

async function runUndoSteps(
  projectId: string,
  projectRoot: string,
  facts: UndoFacts,
  date: string,
  progress: StepProgress,
): Promise<SplitUndoAppliedFields> {
  const enter = (step: SplitUndoStep): void => {
    progress.step = step;
  };
  const done = (): void => {
    progress.completed += 1;
  };
  progress.record = await readRawOrNull(
    `${projectRoot}/meta/${LATEST_OPERATION_FILE_NAME}`,
  );
  enter("save-current-text");
  const isSplitOffLive = facts.splitOffState === "live";
  progress.savesBefore = {
    original: await revisionIdsOf(projectRoot, facts.originalId),
    splitOff: isSplitOffLive
      ? await revisionIdsOf(projectRoot, facts.splitOffId)
      : null,
  };
  const preservedRevisions = [
    await saveCurrentText(projectRoot, facts.originalId, date),
  ];
  if (isSplitOffLive) {
    preservedRevisions.push(
      await saveCurrentText(projectRoot, facts.splitOffId, date),
    );
  }
  done();
  enter("restore-original");
  progress.original = await backUpOriginal(projectRoot, facts.originalId);
  await restoreOriginal(projectRoot, facts);
  done();
  enter("move-annotations");
  if (facts.returning.length > 0) {
    const lists = [await backUpNoteList(projectRoot, facts.originalId)];
    if (isSplitOffLive) {
      lists.push(await backUpNoteList(projectRoot, facts.splitOffId));
    }
    progress.notes = lists;
  }
  const movedAnnotationIds = await moveAnnotationsBack(projectRoot, facts);
  done();
  enter("trash-split-off");
  if (isSplitOffLive) {
    progress.trash = { preexistingDirs: await existingTrashDirs(projectRoot) };
  }
  await trashSplitOff(projectId, facts);
  done();
  enter("remove-exclusion");
  progress.exclusion = await backUpExclusion(projectRoot);
  await removeCompileExclusions(projectRoot, [facts.splitOffId]);
  done();
  enter("clear-record");
  progress.isRecordClearEntered = true;
  await clearLatestOperation(projectRoot);
  done();
  return {
    originalDocumentId: facts.originalId,
    splitOffDocumentId: facts.splitOffId,
    splitOffState: splitOffStateOf(facts),
    preservedRevisions,
    movedAnnotationIds,
  };
}

// --- reverse compensation ------------------------------------------------

type UndoKind =
  | "record"
  | "exclusion"
  | "trash"
  | "notes"
  | "original"
  | "saves";

/** Removes an empty directory; a missing or non-empty one is left alone. */
async function removeIfEmpty(path: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(path);
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
  if (entries.length === 0) await rm(path, { recursive: true });
}

async function restoreRecord(
  projectRoot: string,
  file: RawFile,
): Promise<void> {
  await withMetaLock(projectRoot, async () => {
    if (file.raw === null) await rm(file.path, { force: true });
    else await atomicWriteFile(file.path, file.raw, "utf8");
  });
}

/** Lists the split-off id again: the earlier list, then any id added since. */
async function restoreExclusion(
  projectRoot: string,
  splitOffId: string,
  backup: ExclusionBackup,
): Promise<void> {
  const earlier = backup.ids;
  if (earlier === null || !earlier.includes(splitOffId)) return;
  await withMetaLock(projectRoot, async () =>
    updateProjectJson<void>(projectRoot, (project) => {
      const stored = project.config?.compileDefaults as
        | { excludedResourceIds?: unknown }
        | undefined;
      const now = Array.isArray(stored?.excludedResourceIds)
        ? (stored.excludedResourceIds as unknown[])
        : [];
      if (now.includes(splitOffId)) {
        return { result: undefined, shouldWrite: false };
      }
      const added = now.filter(
        (id): id is string => typeof id === "string" && !earlier.includes(id),
      );
      project.config = {
        ...project.config,
        compileDefaults: {
          ...(stored ?? {}),
          excludedResourceIds: [...earlier, ...added],
        },
      } as ProjectConfig;
      return { result: undefined };
    }),
  );
}

/** Takes the split-off document out of Trash and removes the empty `.trash` directories the soft delete created. */
async function restoreSplitOff(
  projectRoot: string,
  splitOffId: string,
  preexistingDirs: readonly string[],
): Promise<void> {
  await flushIndexer();
  await restoreResource(projectRoot, splitOffId);
  for (const dir of TRASH_DIRS_DEEPEST_FIRST) {
    if (preexistingDirs.includes(dir)) continue;
    await removeIfEmpty(`${projectRoot}/${dir}`);
  }
}

async function restoreNoteList(
  projectRoot: string,
  backup: NoteListBackup,
): Promise<void> {
  await mutateSidecar(projectRoot, backup.documentId, (current) => {
    if (current === null) throw new Error("sidecar missing");
    const hasKey = Object.prototype.hasOwnProperty.call(current, "annotations");
    if (
      hasKey === backup.hadKey &&
      JSON.stringify(current.annotations) === JSON.stringify(backup.value)
    ) {
      return SIDECAR_UNCHANGED;
    }
    const next: Record<string, MetadataValue> = { ...current };
    if (backup.hadKey) next.annotations = backup.value as MetadataValue;
    else delete next.annotations;
    return next;
  });
}

async function restoreOriginalBackup(
  projectRoot: string,
  originalId: string,
  backup: OriginalBackup,
): Promise<void> {
  await atomicWriteFile(backup.contentPath, backup.content, "utf8");
  for (const file of backup.derived) await putBack(file);
  await mutateSidecar(projectRoot, originalId, (current) => {
    if (current === null) throw new Error("sidecar missing");
    const next: Record<string, MetadataValue> = { ...current };
    if (backup.hadUpdatedAt) next.updatedAt = backup.updatedAt as MetadataValue;
    else delete next.updatedAt;
    if (backup.hadWordCount) next.wordCount = backup.wordCount as MetadataValue;
    else delete next.wordCount;
    return next;
  });
}

/** Deletes the preserved revisions Undo made: clear the preserve flag, then delete (a preserved revision is refused). */
async function removeSavedRevisions(
  projectRoot: string,
  documentId: string,
  before: ReadonlySet<string>,
  flag: "splitUndoSave" | "mergeUndoSave" = "splitUndoSave",
): Promise<void> {
  for (const revision of await listRevisions(projectRoot, documentId)) {
    if (before.has(revision.id) || revision.metadata?.[flag] !== true) {
      continue;
    }
    await setRevisionPreserve(projectRoot, documentId, revision.id, false);
    await deleteRevision(projectRoot, documentId, revision.id);
  }
}

const REMAINING_BY_KIND: Record<UndoKind, SplitUndoRemainingState> = {
  record: "record-not-restored",
  exclusion: "exclusion-not-restored",
  trash: "split-off-in-trash",
  notes: "notes-not-restored",
  original: "original-not-restored",
  saves: "preserved-revisions-kept",
};

function remainingStateOf(
  failed: ReadonlySet<UndoKind>,
): SplitUndoRemainingState {
  if (failed.size === 0) return "split-restored";
  if (failed.size > 1) return "state-unknown";
  const [kind] = [...failed];
  return REMAINING_BY_KIND[kind];
}

/**
 * Undoes the steps that were entered, in reverse. Every undo is attempted; one
 * that fails is recorded and decides the state returned. When the split-off
 * document stays in Trash the notes are not moved back to it (they stay on the
 * original) and its saved revision stays with it; when the original's text
 * cannot be put back, its saved revision (its text from before Undo) stays.
 */
async function compensateUndo(
  projectRoot: string,
  facts: UndoFacts,
  progress: StepProgress,
): Promise<SplitUndoRemainingState> {
  const failed = new Set<UndoKind>();
  const attempt = async (
    kind: UndoKind,
    run: () => Promise<void>,
  ): Promise<void> => {
    try {
      await run();
    } catch {
      failed.add(kind);
    }
  };
  const { record, exclusion, trash, notes, original, savesBefore } = progress;
  if (progress.isRecordClearEntered && record) {
    await attempt("record", () => restoreRecord(projectRoot, record));
  }
  if (exclusion) {
    await attempt("exclusion", () =>
      restoreExclusion(projectRoot, facts.splitOffId, exclusion),
    );
  }
  if (trash) {
    await attempt("trash", () =>
      restoreSplitOff(projectRoot, facts.splitOffId, trash.preexistingDirs),
    );
  }
  if (notes && !failed.has("trash")) {
    const lists = notes;
    await attempt("notes", async () => {
      for (const list of lists) await restoreNoteList(projectRoot, list);
    });
  }
  if (original) {
    await attempt("original", () =>
      restoreOriginalBackup(projectRoot, facts.originalId, original),
    );
  }
  if (savesBefore) {
    const { original: originalBefore, splitOff: splitOffBefore } = savesBefore;
    await attempt("saves", async () => {
      if (splitOffBefore && !failed.has("trash")) {
        await removeSavedRevisions(
          projectRoot,
          facts.splitOffId,
          splitOffBefore,
        );
      }
      if (!failed.has("original")) {
        await removeSavedRevisions(
          projectRoot,
          facts.originalId,
          originalBefore,
        );
      }
    });
  }
  await flushIndexer();
  return remainingStateOf(failed);
}

function isSameRecord(
  a: LatestOperationRecord,
  b: LatestOperationRecord,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function undoUnderLocks(
  projectId: string,
  projectRoot: string,
  first: LatestOperationRecord,
  snapshot: SnapshotRevisionRef,
  options: SplitUndoOptions,
  progress: StepProgress,
): Promise<
  | { kind: "applied"; fields: SplitUndoAppliedFields }
  | { kind: "result"; result: SplitUndoResult }
> {
  const again = await readLatestOperation(projectRoot);
  if (again.outcome === "none") {
    return { kind: "result", result: { outcome: "nothing-to-undo" } };
  }
  if (again.outcome === "failed") {
    return {
      kind: "result",
      result: { outcome: "could-not-be-checked", cause: again.cause },
    };
  }
  if (!isSameRecord(first, again.record)) {
    return {
      kind: "result",
      result: { outcome: "could-not-be-checked", cause: "record-changed" },
    };
  }
  const gathered = await gatherFacts(projectRoot, first, snapshot);
  if (gathered.kind === "stop")
    return { kind: "result", result: gathered.result };
  const date = (options.now ?? (() => new Date()))().toISOString();
  try {
    const fields = await runUndoSteps(
      projectId,
      projectRoot,
      gathered.facts,
      date,
      progress,
    );
    return { kind: "applied", fields };
  } catch (err) {
    const remainingState = await compensateUndo(
      projectRoot,
      gathered.facts,
      progress,
    );
    if (isLockedAccessError(err) && remainingState === "split-restored") {
      throw err;
    }
    return {
      kind: "result",
      result: {
        outcome: "failed",
        failedStep: progress.step,
        cause: causeOf(err),
        remainingState,
      },
    };
  }
}

/**
 * Undoes the project's latest split. See the module comment for the order of
 * reads, locks and writes.
 *
 * @throws The locked-access error for a locked or key-less encrypted project
 *   when nothing has been changed; `InvalidProjectIdCoreError` for a bad
 *   `projectId`.
 */
export async function undoLatestSplit(
  projectId: string,
  options: SplitUndoOptions = {},
): Promise<SplitUndoResult> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const stored = await readLatestOperation(projectRoot);
  if (stored.outcome === "none") return { outcome: "nothing-to-undo" };
  if (stored.outcome === "failed") {
    return { outcome: "could-not-be-checked", cause: stored.cause };
  }
  const record = stored.record;
  if (record.kind !== "split") {
    return { outcome: "unsupported-operation", kind: record.kind };
  }
  const snapshot = snapshotOf(record);
  if (snapshot === null) {
    return { outcome: "could-not-be-checked", cause: "record-malformed" };
  }
  const progress = newProgress();
  const releaseOriginal = await acquireLock(
    revisionContentLockKey(projectRoot, snapshot.documentId),
  );
  let outcome: Awaited<ReturnType<typeof undoUnderLocks>>;
  try {
    const releaseSplitOff = await acquireLock(
      revisionContentLockKey(projectRoot, record.newDocumentId),
    );
    try {
      outcome = await undoUnderLocks(
        projectId,
        projectRoot,
        record,
        snapshot,
        options,
        progress,
      );
    } finally {
      releaseSplitOff();
    }
  } finally {
    releaseOriginal();
  }
  if (outcome.kind === "result") return outcome.result;
  return finishAfterUndo(projectRoot, outcome.fields);
}

/** The awaited index update for the original, outside the operation: a failure is returned, not undone. */
async function finishAfterUndo(
  projectRoot: string,
  fields: SplitUndoAppliedFields,
): Promise<SplitUndoResult> {
  await flushIndexer();
  const update = await updateDocumentIndexes(projectRoot, [
    fields.originalDocumentId,
  ]);
  if (update.outcome === "failed") {
    return { ...fields, outcome: "index-failed", failures: update.failures };
  }
  return { ...fields, outcome: "applied" };
}

// --- Undo of the latest merge (Feature 121, Task 38) -----------------------
//
// Forward path, refusals and reverse compensation (Task 39). One
// operation over the N+1 `revision-content` locks (ascending document id, the
// order `applyMerge` takes them), the record read again inside them. Reads, no
// write: the record, each document through the merged-mark resolver (target
// and each absorbed document, from the stored layout), the snapshot texts and
// the notes whose marks are in an absorbed snapshot. Writes, in order:
// `save-current-text` (a preserved revision of the target and of each live
// absorbed document, so an edit made since the merge is kept in the document it
// was made in), `restore-target` and `restore-absorbed` (the no-log write, not
// `setCanonicalRevision`; an absorbed document only where its text differs),
// `move-annotations`, `clear-marks`, `clear-record`. An absorbed document in
// Trash or purged is skipped and never purged. After the locks, the derived
// data of the changed documents is updated; a failure there is `index-failed`.

/** The ordered write steps of Undo merge; a failure names one. */
export const MERGE_UNDO_STEPS = [
  "save-current-text",
  "restore-target",
  "restore-absorbed",
  "move-annotations",
  "clear-marks",
  "clear-record",
] as const;

/** One write step of Undo merge. */
export type MergeUndoStep = (typeof MERGE_UNDO_STEPS)[number];

/** What a committed Undo merge reports. */
export interface MergeUndoAppliedFields {
  operation: "merge";
  targetDocumentId: string;
  /** The target's name read after the Undo; `null` when that read failed (Undo itself is not affected). */
  targetName: string | null;
  absorbedDocumentIds: string[];
  /** Absorbed documents that were in Trash or purged and so were left alone. */
  skippedDocuments: { documentId: string; state: "in-trash" | "purged" }[];
  /** The revisions that hold each live document's text as it was when Undo ran. */
  preservedRevisions: SnapshotRevisionRef[];
  /** Notes put back on their absorbed documents. */
  movedAnnotationIds: string[];
}

/**
 * What a failed Undo merge leaves, after its reverse compensation ran:
 * `merge-restored` is the merged state before Undo, with the record present;
 * a named value is the one thing that could not be put back; two or more are
 * `state-unknown`.
 */
export type MergeUndoRemainingState =
  | "merge-restored"
  | "record-not-restored"
  | "marks-not-restored"
  | "notes-not-restored"
  | "documents-not-restored"
  | "preserved-revisions-kept"
  | "state-unknown";

/** Result of {@link undoLatestOperation} for a merge; the outcomes never share a value. */
export type MergeUndoResult =
  | ({ outcome: "applied" } & MergeUndoAppliedFields)
  | ({
      outcome: "index-failed";
      failures: SplitIndexFailure[];
    } & MergeUndoAppliedFields)
  | { outcome: "nothing-to-undo" }
  | { outcome: "could-not-be-checked"; cause: string }
  | {
      outcome: "refused";
      operation: "merge";
      reason: MergeUndoRefusalReason;
      message: string;
      documentId: string;
    }
  | {
      outcome: "failed";
      operation: "merge";
      failedStep: MergeUndoStep;
      cause: string;
      remainingState: MergeUndoRemainingState;
    };

type AbsorbedState = "live" | "in-trash" | "purged";

interface MergeUndoAbsorbed {
  ref: SnapshotRevisionRef;
  state: AbsorbedState;
  snapshotContent: string;
  /** Notes on the target whose marks are in this document's snapshot text. */
  returning: Annotation[];
}

interface MergeUndoFacts {
  targetId: string;
  targetSnapshotContent: string;
  absorbed: MergeUndoAbsorbed[];
}

type MergeGathered =
  | { kind: "go"; facts: MergeUndoFacts }
  | { kind: "stop"; result: MergeUndoResult };

interface MergeShape {
  target: SnapshotRevisionRef;
  absorbed: SnapshotRevisionRef[];
}

/** The refs of a merge record, target first, or `null` when the record is not one a merge writes. */
function mergeShapeOf(record: LatestOperationRecord): MergeShape | null {
  if (record.kind !== "merge") return null;
  const ids = record.affectedDocumentIds;
  if (ids.length < 2 || new Set(ids).size !== ids.length) return null;
  if (record.snapshotRevisions.length !== ids.length) return null;
  const byDocument = new Map(
    record.snapshotRevisions.map((ref) => [ref.documentId, ref]),
  );
  if (byDocument.size !== ids.length) return null;
  const refs: SnapshotRevisionRef[] = [];
  for (const id of ids) {
    const ref = byDocument.get(id);
    if (!ref) return null;
    refs.push(ref);
  }
  return { target: refs[0], absorbed: refs.slice(1) };
}

function mergeRefuse(
  reason: MergeUndoRefusalReason,
  documentId: string,
): MergeGathered {
  return {
    kind: "stop",
    result: {
      outcome: "refused",
      operation: "merge",
      reason,
      message: MERGE_UNDO_REFUSAL_MESSAGES[reason],
      documentId,
    },
  };
}

/** The merged-mark resolver's state for one document and its snapshot, from the stored layout. */
async function resolveDocument(
  projectRoot: string,
  ref: SnapshotRevisionRef,
  date: string,
): Promise<MergeMarkStateResult> {
  const documentId = ref.documentId;
  const input: MergedMarkResolverInput = {
    mark: {
      targetDocumentId: documentId,
      targetSnapshotRevisionId: ref.revisionId,
      date,
    },
    liveDocument: await observe(
      async () => (await readSidecar(projectRoot, documentId)) !== null,
    ),
    liveSnapshotRevision: await observe(async () =>
      (await listRevisions(projectRoot, documentId)).some(
        (r) =>
          r.id === ref.revisionId && r.versionNumber === ref.revisionNumber,
      ),
    ),
    trashedDocument: await observe(() =>
      pathExists(`${projectRoot}/.trash/meta/${sidecarFilename(documentId)}`),
    ),
    trashedRevisions: await observe(() =>
      pathExists(`${projectRoot}/.trash/revisions/${documentId}`),
    ),
  };
  return resolveMergedMarkState(input);
}

async function readSnapshot(
  projectRoot: string,
  ref: SnapshotRevisionRef,
): Promise<{ content: string; markIds: Set<string> } | { failed: string }> {
  try {
    const { content } = await readRevision(
      projectRoot,
      ref.documentId,
      ref.revisionId,
    );
    const markIds = new Set<string>();
    collectMarkIds(JSON.parse(content), markIds);
    return { content, markIds };
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return { failed: `snapshot-unreadable:${causeOf(err)}` };
  }
}

function stopUnchecked(cause: string): MergeGathered {
  return { kind: "stop", result: { outcome: "could-not-be-checked", cause } };
}

/** The target's state and snapshot text, or the stop that ends Undo. */
async function gatherMergeTarget(
  projectRoot: string,
  record: LatestOperationRecord,
  ref: SnapshotRevisionRef,
): Promise<{ stop: MergeGathered } | { content: string; notes: Annotation[] }> {
  const state = await resolveDocument(projectRoot, ref, record.date);
  switch (state.state) {
    case "could-not-be-checked":
      return { stop: stopUnchecked(state.cause) };
    case "target-in-trash":
      return { stop: mergeRefuse("target-in-trash", ref.documentId) };
    case "target-permanently-removed":
      return { stop: mergeRefuse("target-purged", ref.documentId) };
    case "revision-no-longer-kept":
      return { stop: mergeRefuse("snapshot-gone", ref.documentId) };
    case "available":
      break;
  }
  const snapshot = await readSnapshot(projectRoot, ref);
  if ("failed" in snapshot) return { stop: stopUnchecked(snapshot.failed) };
  try {
    return {
      content: snapshot.content,
      notes: annotationsOf(await readSidecar(projectRoot, ref.documentId)),
    };
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return { stop: stopUnchecked(`target-unreadable:${causeOf(err)}`) };
  }
}

/** Reads and resolves; writes nothing. */
async function gatherMergeFacts(
  projectRoot: string,
  record: LatestOperationRecord,
  shape: MergeShape,
): Promise<MergeGathered> {
  const target = await gatherMergeTarget(projectRoot, record, shape.target);
  if ("stop" in target) return target.stop;
  const absorbed: MergeUndoAbsorbed[] = [];
  for (const ref of shape.absorbed) {
    const resolved = await resolveDocument(projectRoot, ref, record.date);
    if (resolved.state === "could-not-be-checked") {
      return stopUnchecked(resolved.cause);
    }
    if (resolved.state === "revision-no-longer-kept") {
      return mergeRefuse("absorbed-snapshot-gone", ref.documentId);
    }
    if (resolved.state !== "available") {
      const state: AbsorbedState =
        resolved.state === "target-in-trash" ? "in-trash" : "purged";
      absorbed.push({ ref, state, snapshotContent: "", returning: [] });
      continue;
    }
    const snapshot = await readSnapshot(projectRoot, ref);
    if ("failed" in snapshot) return stopUnchecked(snapshot.failed);
    absorbed.push({
      ref,
      state: "live",
      snapshotContent: snapshot.content,
      returning: target.notes.filter((a) => snapshot.markIds.has(a.id)),
    });
  }
  return {
    kind: "go",
    facts: {
      targetId: shape.target.documentId,
      targetSnapshotContent: target.content,
      absorbed,
    },
  };
}

async function canonicalIdOf(
  projectRoot: string,
  documentId: string,
): Promise<string> {
  const canonical = (await listRevisions(projectRoot, documentId)).find(
    (r) => r.isCanonical,
  );
  if (!canonical) throw new Error("no canonical revision");
  return canonical.id;
}

async function saveCurrentMergeText(
  projectRoot: string,
  documentId: string,
  date: string,
): Promise<SnapshotRevisionRef> {
  const canonicalId = await canonicalIdOf(projectRoot, documentId);
  const { content } = await readRevision(projectRoot, documentId, canonicalId);
  const saved = await createRevision(projectRoot, documentId, {
    content,
    isCanonical: false,
    metadata: {
      name: `Before undo merge ${date.slice(0, 10)}`,
      preserve: true,
      mergeUndoSave: true,
    },
  });
  return {
    documentId,
    revisionId: saved.id,
    revisionNumber: saved.versionNumber,
  };
}

/** The no-log overwrite of a document's canonical content; `onlyIfDifferent` skips an identical text. */
async function overwriteCanonical(
  projectRoot: string,
  documentId: string,
  content: string,
  onlyIfDifferent: boolean,
): Promise<void> {
  const canonicalId = await canonicalIdOf(projectRoot, documentId);
  if (onlyIfDifferent) {
    const current = await readRevision(projectRoot, documentId, canonicalId);
    if (current.content === content) return;
  }
  await writeCanonicalContentWithoutLog(
    projectRoot,
    documentId,
    canonicalId,
    content,
    { lockHeld: true },
  );
}

/** Notes go back to their absorbed document (each once) and leave the target. */
async function moveMergeAnnotationsBack(
  projectRoot: string,
  facts: MergeUndoFacts,
): Promise<string[]> {
  const moving = facts.absorbed.filter(
    (a) => a.state === "live" && a.returning.length > 0,
  );
  if (moving.length === 0) return [];
  const moved = new Set(moving.flatMap((a) => a.returning.map((n) => n.id)));
  for (const doc of moving) {
    await mutateSidecar(projectRoot, doc.ref.documentId, (current) => {
      if (current === null) throw new Error("sidecar missing");
      const now = annotationsOf(current);
      const present = new Set(now.map((a) => a.id));
      const added = doc.returning.filter((a) => !present.has(a.id));
      return {
        ...current,
        annotations: [...now, ...added] as unknown as MetadataValue,
      };
    });
  }
  await mutateSidecar(projectRoot, facts.targetId, (current) => {
    if (current === null) throw new Error("sidecar missing");
    return {
      ...current,
      annotations: annotationsOf(current).filter(
        (a) => !moved.has(a.id),
      ) as unknown as MetadataValue,
    };
  });
  return [...moved];
}

/** One document's sidecar `mergedMark` value before it was cleared. */
interface MarkBackup {
  documentId: string;
  hadKey: boolean;
  value: unknown;
  /** The sidecar's key order, so the mark goes back to its own place. */
  keys: string[];
}

/**
 * What each step had read or recorded before it wrote, set when the step (or
 * the document within it) is entered, so a step that threw after writing is
 * undone as well.
 */
interface MergeUndoProgress {
  step: MergeUndoStep;
  hasWritten: boolean;
  record: RawFile | null;
  isRecordClearEntered: boolean;
  savesBefore: Map<string, Set<string>> | null;
  documents: { documentId: string; backup: OriginalBackup }[];
  notes: NoteListBackup[] | null;
  marks: MarkBackup[] | null;
}

function newMergeProgress(): MergeUndoProgress {
  return {
    step: "save-current-text",
    hasWritten: false,
    record: null,
    isRecordClearEntered: false,
    savesBefore: null,
    documents: [],
    notes: null,
    marks: null,
  };
}

function skippedOf(
  facts: MergeUndoFacts,
): MergeUndoAppliedFields["skippedDocuments"] {
  const skipped: MergeUndoAppliedFields["skippedDocuments"] = [];
  for (const a of facts.absorbed) {
    if (a.state === "in-trash") {
      skipped.push({ documentId: a.ref.documentId, state: "in-trash" });
    } else if (a.state === "purged") {
      skipped.push({ documentId: a.ref.documentId, state: "purged" });
    }
  }
  return skipped;
}

async function backUpMark(
  projectRoot: string,
  documentId: string,
): Promise<MarkBackup> {
  const sidecar = (await readSidecar(projectRoot, documentId)) ?? {};
  return {
    documentId,
    hadKey: Object.prototype.hasOwnProperty.call(
      sidecar,
      MERGED_MARK_SIDECAR_KEY,
    ),
    value: sidecar[MERGED_MARK_SIDECAR_KEY],
    keys: Object.keys(sidecar),
  };
}

/** Writes the mark back as it was; a document that never had one is left without. */
async function restoreMark(
  projectRoot: string,
  backup: MarkBackup,
): Promise<void> {
  await mutateSidecar(projectRoot, backup.documentId, (current) => {
    if (current === null) throw new Error("sidecar missing");
    const hasKey = Object.prototype.hasOwnProperty.call(
      current,
      MERGED_MARK_SIDECAR_KEY,
    );
    if (
      hasKey === backup.hadKey &&
      JSON.stringify(current[MERGED_MARK_SIDECAR_KEY]) ===
        JSON.stringify(backup.value)
    ) {
      return SIDECAR_UNCHANGED;
    }
    const withMark: Record<string, MetadataValue> = { ...current };
    if (backup.hadKey) {
      withMark[MERGED_MARK_SIDECAR_KEY] = backup.value as MetadataValue;
    } else delete withMark[MERGED_MARK_SIDECAR_KEY];
    const next: Record<string, MetadataValue> = {};
    for (const key of backup.keys) {
      if (key in withMark) next[key] = withMark[key];
    }
    for (const key of Object.keys(withMark)) {
      if (!(key in next)) next[key] = withMark[key];
    }
    return next;
  });
}

type MergeUndoKind = "record" | "marks" | "notes" | "documents" | "saves";

const MERGE_REMAINING_BY_KIND: Record<MergeUndoKind, MergeUndoRemainingState> =
  {
    record: "record-not-restored",
    marks: "marks-not-restored",
    notes: "notes-not-restored",
    documents: "documents-not-restored",
    saves: "preserved-revisions-kept",
  };

/**
 * Undoes the steps that were entered, in reverse: the record, the marks, the
 * note lists, each document's text and derived values, then the preserved
 * revisions Undo made. Every undo is attempted; one that fails is recorded and
 * decides the state returned. A document whose text cannot be put back keeps
 * the revision that holds its text from before Undo.
 */
async function compensateMergeUndo(
  projectRoot: string,
  progress: MergeUndoProgress,
): Promise<MergeUndoRemainingState> {
  const failed = new Set<MergeUndoKind>();
  const failedDocuments = new Set<string>();
  const attempt = async (
    kind: MergeUndoKind,
    run: () => Promise<void>,
  ): Promise<boolean> => {
    try {
      await run();
      return true;
    } catch {
      failed.add(kind);
      return false;
    }
  };
  const { record, marks, notes, documents, savesBefore } = progress;
  if (progress.isRecordClearEntered && record) {
    await attempt("record", () => restoreRecord(projectRoot, record));
  }
  for (const mark of marks ?? []) {
    await attempt("marks", () => restoreMark(projectRoot, mark));
  }
  for (const list of notes ?? []) {
    await attempt("notes", () => restoreNoteList(projectRoot, list));
  }
  for (const { documentId, backup } of documents) {
    const isRestored = await attempt("documents", () =>
      restoreOriginalBackup(projectRoot, documentId, backup),
    );
    if (!isRestored) failedDocuments.add(documentId);
  }
  for (const [documentId, before] of savesBefore ?? []) {
    if (failedDocuments.has(documentId)) continue;
    await attempt("saves", () =>
      removeSavedRevisions(projectRoot, documentId, before, "mergeUndoSave"),
    );
  }
  await flushIndexer();
  if (failed.size === 0) return "merge-restored";
  if (failed.size > 1) return "state-unknown";
  const [kind] = [...failed];
  return MERGE_REMAINING_BY_KIND[kind];
}

/** What the write steps report; the name is read after the locks are released. */
type MergeUndoStepFields = Omit<MergeUndoAppliedFields, "targetName">;

async function runMergeUndoSteps(
  projectRoot: string,
  facts: MergeUndoFacts,
  date: string,
  progress: MergeUndoProgress,
): Promise<MergeUndoStepFields> {
  const live = facts.absorbed.filter((a) => a.state === "live");
  const liveIds = [facts.targetId, ...live.map((a) => a.ref.documentId)];
  progress.record = await readRawOrNull(
    `${projectRoot}/meta/${LATEST_OPERATION_FILE_NAME}`,
  );
  progress.step = "save-current-text";
  const savesBefore = new Map<string, Set<string>>();
  for (const documentId of liveIds) {
    savesBefore.set(documentId, await revisionIdsOf(projectRoot, documentId));
  }
  progress.savesBefore = savesBefore;
  const preservedRevisions: SnapshotRevisionRef[] = [];
  for (const documentId of liveIds) {
    progress.hasWritten = true;
    preservedRevisions.push(
      await saveCurrentMergeText(projectRoot, documentId, date),
    );
  }
  progress.step = "restore-target";
  progress.documents.push({
    documentId: facts.targetId,
    backup: await backUpOriginal(projectRoot, facts.targetId),
  });
  await overwriteCanonical(
    projectRoot,
    facts.targetId,
    facts.targetSnapshotContent,
    false,
  );
  progress.step = "restore-absorbed";
  for (const doc of live) {
    progress.documents.push({
      documentId: doc.ref.documentId,
      backup: await backUpOriginal(projectRoot, doc.ref.documentId),
    });
    await overwriteCanonical(
      projectRoot,
      doc.ref.documentId,
      doc.snapshotContent,
      true,
    );
  }
  progress.step = "move-annotations";
  const moving = live.filter((a) => a.returning.length > 0);
  if (moving.length > 0) {
    progress.notes = [
      await backUpNoteList(projectRoot, facts.targetId),
      ...(await Promise.all(
        moving.map((a) => backUpNoteList(projectRoot, a.ref.documentId)),
      )),
    ];
  }
  const movedAnnotationIds = await moveMergeAnnotationsBack(projectRoot, facts);
  progress.step = "clear-marks";
  progress.marks = await Promise.all(
    live.map((doc) => backUpMark(projectRoot, doc.ref.documentId)),
  );
  for (const doc of live) {
    await removeMergedMark(projectRoot, doc.ref.documentId);
  }
  progress.step = "clear-record";
  progress.isRecordClearEntered = true;
  await clearLatestOperation(projectRoot);
  return {
    operation: "merge",
    targetDocumentId: facts.targetId,
    absorbedDocumentIds: facts.absorbed.map((a) => a.ref.documentId),
    skippedDocuments: skippedOf(facts),
    preservedRevisions,
    movedAnnotationIds,
  };
}

type MergeUndoLocked =
  | { kind: "applied"; fields: MergeUndoStepFields }
  | { kind: "result"; result: MergeUndoResult };

async function undoMergeUnderLocks(
  projectRoot: string,
  first: LatestOperationRecord,
  shape: MergeShape,
  options: SplitUndoOptions,
): Promise<MergeUndoLocked> {
  const again = await readLatestOperation(projectRoot);
  if (again.outcome === "none") {
    return { kind: "result", result: { outcome: "nothing-to-undo" } };
  }
  if (again.outcome === "failed") {
    return {
      kind: "result",
      result: { outcome: "could-not-be-checked", cause: again.cause },
    };
  }
  if (!isSameRecord(first, again.record)) {
    return {
      kind: "result",
      result: { outcome: "could-not-be-checked", cause: "record-changed" },
    };
  }
  const gathered = await gatherMergeFacts(projectRoot, first, shape);
  if (gathered.kind === "stop") {
    return { kind: "result", result: gathered.result };
  }
  const date = (options.now ?? (() => new Date()))().toISOString();
  const progress = newMergeProgress();
  try {
    const fields = await runMergeUndoSteps(
      projectRoot,
      gathered.facts,
      date,
      progress,
    );
    return { kind: "applied", fields };
  } catch (err) {
    if (isLockedAccessError(err) && !progress.hasWritten) throw err;
    const remainingState = await compensateMergeUndo(projectRoot, progress);
    return {
      kind: "result",
      result: {
        outcome: "failed",
        operation: "merge",
        failedStep: progress.step,
        cause: causeOf(err),
        remainingState,
      },
    };
  }
}

/** The target's name, or `null` when the sidecar cannot be read. */
async function readTargetName(
  projectRoot: string,
  documentId: string,
): Promise<string | null> {
  try {
    const name = (await readSidecar(projectRoot, documentId))?.name;
    return typeof name === "string" ? name : null;
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return null;
  }
}

/**
 * Undoes the merge a stored record describes. `record` is the one the caller
 * read; it is read again inside the locks and a difference is
 * `could-not-be-checked` (`record-changed`). Exported for the Undo route.
 */
export async function undoLatestMerge(
  projectId: string,
  record: LatestOperationRecord,
  options: SplitUndoOptions,
): Promise<MergeUndoResult> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const shape = mergeShapeOf(record);
  if (shape === null) {
    return { outcome: "could-not-be-checked", cause: "record-malformed" };
  }
  const keys = [
    ...new Set(
      record.affectedDocumentIds.map((id) =>
        revisionContentLockKey(projectRoot, id),
      ),
    ),
  ].sort();
  const releases: Array<() => void> = [];
  let outcome: MergeUndoLocked;
  try {
    for (const key of keys) releases.push(await acquireLock(key));
    outcome = await undoMergeUnderLocks(projectRoot, record, shape, options);
  } finally {
    for (const release of releases.reverse()) release();
  }
  if (outcome.kind === "result") return outcome.result;
  await flushIndexer();
  const fields: MergeUndoAppliedFields = {
    ...outcome.fields,
    targetName: await readTargetName(
      projectRoot,
      outcome.fields.targetDocumentId,
    ),
  };
  const skipped = new Set(fields.skippedDocuments.map((s) => s.documentId));
  const changed = [
    fields.targetDocumentId,
    ...fields.absorbedDocumentIds.filter((id) => !skipped.has(id)),
  ];
  const update = await updateDocumentIndexes(projectRoot, changed);
  if (update.outcome === "failed") {
    return { ...fields, outcome: "index-failed", failures: update.failures };
  }
  return { ...fields, outcome: "applied" };
}

/**
 * Undoes the project's latest operation, whichever kind it is: a split goes to
 * {@link undoLatestSplit} unchanged, a merge to the merge branch above, which
 * replaces the `unsupported-operation` outcome {@link undoLatestSplit} still
 * returns for a merge record.
 *
 * @throws The locked-access error for a locked or key-less encrypted project
 *   when nothing has been changed; `InvalidProjectIdCoreError` for a bad
 *   `projectId`.
 */
export async function undoLatestOperation(
  projectId: string,
  options: SplitUndoOptions = {},
): Promise<SplitUndoResult | MergeUndoResult> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const stored = await readLatestOperation(projectRoot);
  if (stored.outcome === "none") return { outcome: "nothing-to-undo" };
  if (stored.outcome === "failed") {
    return { outcome: "could-not-be-checked", cause: stored.cause };
  }
  if (stored.record.kind === "merge") {
    return undoLatestMerge(projectId, stored.record, options);
  }
  return undoLatestSplit(projectId, options);
}
