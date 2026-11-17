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
 * A step that throws returns `failed` naming the step. This task does not
 * undo the steps before it; rollback of a failed Undo is a later task.
 *
 * No React, JSX, JSON or `node:*`.
 */
import { flushIndexer } from "./indexer-queue";
import { readFile, stat } from "./io";
import { isLockedAccessError } from "./locked-access";
import { acquireLock } from "./locks";
import {
  deleteResourceCore,
  resolveResourceProjectRootOrThrow,
} from "./resource-crud-core";
import { listRevisions } from "./revision";
import {
  createRevision,
  readRevision,
  writeCanonicalContentWithoutLog,
} from "./revision-core";
import { removeCompileExclusions } from "./saved-defaults-core";
import { mutateSidecar, readSidecar, sidecarFilename } from "./sidecar";
import {
  resolveSplitLineageState,
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
  LINEAGE_FILE_NAME,
  readLatestOperation,
} from "./split-records-core";
import type {
  LatestOperationRecord,
  SnapshotRevisionRef,
  SplitLineageRecord,
} from "./split-types";
import type { Annotation, MetadataValue } from "./types";

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

interface StepProgress {
  step: SplitUndoStep;
  completed: number;
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
  enter("save-current-text");
  const preservedRevisions = [
    await saveCurrentText(projectRoot, facts.originalId, date),
  ];
  if (facts.splitOffState === "live") {
    preservedRevisions.push(
      await saveCurrentText(projectRoot, facts.splitOffId, date),
    );
  }
  done();
  enter("restore-original");
  await restoreOriginal(projectRoot, facts);
  done();
  enter("move-annotations");
  const movedAnnotationIds = await moveAnnotationsBack(projectRoot, facts);
  done();
  enter("trash-split-off");
  await trashSplitOff(projectId, facts);
  done();
  enter("remove-exclusion");
  await removeCompileExclusions(projectRoot, [facts.splitOffId]);
  done();
  enter("clear-record");
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
    if (isLockedAccessError(err) && progress.completed === 0) throw err;
    return {
      kind: "result",
      result: {
        outcome: "failed",
        failedStep: progress.step,
        cause: causeOf(err),
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
  const progress: StepProgress = { step: "save-current-text", completed: 0 };
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
