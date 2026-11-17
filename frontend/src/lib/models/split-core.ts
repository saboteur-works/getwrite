/**
 * @module split-core
 *
 * Applies a split of a text document at the cursor as one operation in the
 * decided order, with reverse compensation (Feature 120, FR-3 to FR-8, FR-10,
 * FR-11, FR-16, OQ-9): stale and eligibility refusals, then the ordered
 * writes, then, if a step fails, the undo of the earlier ones.
 *
 * Writer model: the claim that nothing else writes between the staleness
 * check and the last write holds under one writer instance per tenant
 * (ADR-017, ADR-019). The `revision-content` lock is per process and does not
 * coordinate several server instances.
 *
 * Order of writes, with the locks each takes (`experiments/task-5.md`):
 * 1. lock the original's revision (`revision-content:<root>:<id>`), held
 *    through step 7 and released in `finally`; `createRevision` takes no lock
 *    and two callers can pick one version number, so the snapshot needs it;
 * 2. the preserved, non-canonical snapshot of the original's full text, read
 *    inside the operation (`createRevision`, no lock of its own);
 * 3. the new document (`createSplitDocument`, Task 18);
 * 4. the chosen annotations move: the new document's sidecar, then the
 *    original's (`mutateSidecar`, each `withMetaLock` then the sidecar file lock);
 * 5. the compile exclusion for the new document, when the original has one
 *    (`seedCompileExclusion`: `withMetaLock` then the `project.json` lock);
 * 6. the truncation of the original with the no-log write, passing
 *    `lockHeld: true` because `acquireLock` is not reentrant;
 * 7. the lineage entry, then the latest-operation record last (each takes
 *    `withMetaLock`; never nested inside another `withMetaLock`).
 * No step nests a non-reentrant lock inside itself. `withIndexingSuspended` is
 * not used. The derived-index update runs after commit (Task 22) and is
 * outside this operation and its rollback.
 *
 * Reverse compensation (FR-6): a step that throws undoes the earlier steps in
 * reverse (records, truncation, exclusion, annotations, the new document, the
 * snapshot), each undo idempotent so it is also safe for the step that threw
 * after writing, and returns `failed` naming the step and the state that
 * remains. The undo steps restore what the forward steps changed: the raw
 * text of the files a step rewrote (derived content, the two record files)
 * and the sidecar keys it set. A snapshot is removed by clearing its preserve
 * flag first, because `deleteRevision` refuses a preserved revision.
 * `project.json`'s `metadataRevision` counter may stay higher: every sidecar
 * write advances it and nothing writes it back. A locked-access error with
 * nothing left changed is rethrown.
 *
 * No React, JSX, JSON or `node:*`.
 */
import { atomicWriteFile, readFile, rm, writeFile } from "./io";
import { flushIndexer } from "./indexer-queue";
import { isLockedAccessError } from "./locked-access";
import { acquireLock } from "./locks";
import { withMetaLock } from "./meta-locks";
import { PROJECT_FILENAME } from "./project-config";
import { resolveResourceProjectRootOrThrow } from "./resource-crud-core";
import { listRevisions, revisionDir } from "./revision";
import {
  createRevision,
  deleteRevision,
  setRevisionPreserve,
  writeCanonicalContentWithoutLog,
} from "./revision-core";
import {
  removeCompileExclusions,
  seedCompileExclusion,
} from "./saved-defaults-core";
import { mutateSidecar, SIDECAR_UNCHANGED } from "./sidecar";
import { partitionAnnotations } from "./split-annotations";
import {
  SPLIT_COMPILE_EXCLUSION_NOTICE,
  describeSplitIndexFailure,
  type SplitIndexFailureStep,
} from "./split-messages";
import { updateDocumentIndexes } from "./split-index-update";
import { tiptapToPlainText } from "../tiptap-utils";
import { countWords } from "../word-count";
import {
  createSplitDocument,
  removeSplitDocument,
  SplitNewDocumentError,
  type SplitNewDocumentResult,
} from "./split-new-document";
import {
  evaluateSplitRequest,
  revisionContentLockKey,
  type SplitEvaluation,
  type SplitPreviewRequest,
} from "./split-preview-core";
import {
  LATEST_OPERATION_FILE_NAME,
  LINEAGE_FILE_NAME,
  writeLatestOperation,
  writeLineageEntry,
} from "./split-records-core";
import {
  type SplitCarryOverChoice,
  type SplitRefusalReason,
  type SplitRemainingState,
  type SplitStep,
} from "./split-types";
import type {
  Annotation,
  MetadataValue,
  Revision,
  TipTapDocument,
} from "./types";

/** A split request: the cursor of {@link SplitPreviewRequest} plus the carry-over choice. */
export interface SplitApplyRequest extends SplitPreviewRequest {
  carryOver: SplitCarryOverChoice;
}

/** Options of {@link applySplit}; `now` is for tests. */
export interface SplitApplyOptions {
  now?: () => Date;
}

/** What a committed split reports. */
export interface SplitAppliedFields {
  newDocumentId: string;
  /** Texts of non-fatal conditions, for example a full exclusion list. */
  notices: string[];
  snapshotRevisionId: string;
  snapshotRevisionNumber: number;
}

/** One step after the commit that did not finish, for one document. */
export interface SplitPostCommitFailure {
  documentId: string;
  step: SplitIndexFailureStep;
}

/**
 * Result of {@link applySplit}; the outcomes never share a value. `applied`
 * and `index-failed` both mean the split is committed; `index-failed` adds
 * what could not be brought up to date and the text for the writer.
 */
export type SplitApplyResult =
  | ({ outcome: "applied" } & SplitAppliedFields)
  | ({
      outcome: "index-failed";
      failures: SplitPostCommitFailure[];
      /** The writer-facing text, from `split-messages.ts`. */
      message: string;
    } & SplitAppliedFields)
  | { outcome: "refused"; reason: SplitRefusalReason }
  | {
      outcome: "failed";
      failedStep: SplitStep;
      remainingState: SplitRemainingState;
      /** A stable cause string (an error name); never client input. */
      cause: string;
    };

type CompileExclusionState = "not-listed" | "listed" | "unusable";

type ReadyEvaluation = Extract<SplitEvaluation, { outcome: "ready" }>;

/** A file's raw text before a step rewrote it; `null` when it did not exist. */
interface RawFile {
  path: string;
  raw: string | null;
}

/** What the truncation changed, so it can be put back exactly. */
interface TruncationBackup {
  contentPath: string;
  content: string;
  derived: RawFile[];
  hadUpdatedAt: boolean;
  updatedAt: MetadataValue | undefined;
  hadWordCount: boolean;
  wordCount: MetadataValue | undefined;
}

/** Which kind of undo step failed; the set decides the state reported. */
type UndoKind =
  | "records"
  | "truncate"
  | "exclusion"
  | "annotations"
  | "document"
  | "snapshot";

/** What the forward steps did so far; compensation undoes exactly these. */
interface Progress {
  step: SplitStep;
  /** Revision ids before the snapshot step; null until that step starts. */
  revisionIdsBefore: Set<string> | null;
  created: SplitNewDocumentResult | null;
  /** The builder failed and could not remove the document it wrote. */
  isDocumentLeftBehind: boolean;
  /** The original's annotation list before the move; null until a move starts. */
  annotationsBefore: Annotation[] | null;
  isExclusionAttempted: boolean;
  truncation: TruncationBackup | null;
  recordFiles: RawFile[] | null;
  /** The text of the new document, for the word count written after commit. */
  newText: TipTapDocument | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(err: unknown): boolean {
  return isRecord(err) && err.code === "ENOENT";
}

function asValue(value: unknown): MetadataValue {
  return value as MetadataValue;
}

/** Whether `project.json`'s saved compile exclusions list the original. */
async function readExclusionState(
  projectRoot: string,
  originalId: string,
): Promise<CompileExclusionState> {
  const raw = await readFile(`${projectRoot}/${PROJECT_FILENAME}`, "utf8");
  const project: unknown = JSON.parse(raw);
  const config = isRecord(project) ? project.config : undefined;
  const stored = isRecord(config) ? config.compileDefaults : undefined;
  if (stored === undefined) return "not-listed";
  const ids = isRecord(stored) ? stored.excludedResourceIds : undefined;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string"))
    return "unusable";
  return ids.includes(originalId) ? "listed" : "not-listed";
}

/** Raw text of a file, or `null` when it does not exist; any other failure is thrown. */
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

/**
 * Applies a split. Takes the original's `revision-content` lock first and
 * holds it to the end of the writes, so a concurrent autosave or a second
 * split of the same document waits and then meets a changed document: the
 * second split is refused as stale. The lock is released before the
 * post-commit step (the new document's `wordCount` and the derived-index
 * update, FR-9), which is awaited, outside the rollback, and reported as
 * `index-failed` without undoing the split.
 *
 * @throws The locked-access error for a locked or key-less encrypted project
 *   when nothing remains changed; `InvalidProjectIdCoreError` for a bad
 *   `projectId`.
 */
export async function applySplit(
  projectId: string,
  request: SplitApplyRequest,
  options: SplitApplyOptions = {},
): Promise<SplitApplyResult> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const progress: Progress = {
    step: "lock-original",
    revisionIdsBefore: null,
    created: null,
    isDocumentLeftBehind: false,
    annotationsBefore: null,
    isExclusionAttempted: false,
    truncation: null,
    recordFiles: null,
    newText: null,
  };
  const release = await acquireLock(
    revisionContentLockKey(projectRoot, request.resourceId),
  );
  let result: SplitApplyResult;
  try {
    result = await applyUnderLock(
      projectId,
      projectRoot,
      request,
      options,
      progress,
    );
  } finally {
    release();
  }
  if (result.outcome !== "applied" || progress.newText === null) return result;
  return finishAfterCommit(
    projectRoot,
    request.resourceId,
    result,
    progress.newText,
  );
}

/**
 * After the commit: the new document's `wordCount` through `mutateSidecar`
 * (nothing on the index paths writes it, `experiments/task-4.md`), then the
 * awaited per-document index update (Task 17). Neither failure undoes the
 * split; each is returned. `updateDocumentIndexes` reports its own step
 * failures and does not throw.
 */
async function finishAfterCommit(
  projectRoot: string,
  originalId: string,
  applied: Extract<SplitApplyResult, { outcome: "applied" }>,
  newText: TipTapDocument,
): Promise<SplitApplyResult> {
  const newId = applied.newDocumentId;
  const failures: SplitPostCommitFailure[] = [];
  try {
    const wordCount = countWords(tiptapToPlainText(newText));
    await mutateSidecar(projectRoot, newId, (current) =>
      current === null
        ? SIDECAR_UNCHANGED
        : { ...current, wordCount: asValue(wordCount) },
    );
  } catch {
    failures.push({ documentId: newId, step: "word-count" });
  }
  const update = await updateDocumentIndexes(projectRoot, [originalId, newId]);
  if (update.outcome === "failed") failures.push(...update.failures);
  if (failures.length === 0) return applied;
  return {
    ...applied,
    outcome: "index-failed",
    failures,
    message: describeSplitIndexFailure(failures.map((f) => f.step)),
  };
}

async function applyUnderLock(
  projectId: string,
  projectRoot: string,
  request: SplitApplyRequest,
  options: SplitApplyOptions,
  progress: Progress,
): Promise<SplitApplyResult> {
  const evaluation = await evaluateSplitRequest(projectRoot, request);
  if (evaluation.outcome === "refused") return evaluation;
  if (evaluation.outcome === "failed") {
    return {
      outcome: "failed",
      failedStep: "lock-original",
      remainingState: "original-restored",
      cause: evaluation.cause,
    };
  }
  try {
    return await runSteps(
      projectId,
      projectRoot,
      request,
      evaluation,
      progress,
      options,
    );
  } catch (err) {
    const remainingState = await compensate(
      projectId,
      projectRoot,
      request.resourceId,
      progress,
    );
    if (isLockedAccessError(err) && remainingState === "original-restored")
      throw err;
    return {
      outcome: "failed",
      failedStep: progress.step,
      remainingState,
      cause: err instanceof Error ? err.name : "unknown",
    };
  }
}

async function runSteps(
  projectId: string,
  projectRoot: string,
  request: SplitApplyRequest,
  evaluation: ReadyEvaluation,
  progress: Progress,
  options: SplitApplyOptions,
): Promise<SplitApplyResult> {
  const originalId = request.resourceId;
  const { sidecar, cut, revision, content } = evaluation;
  const stored: unknown = sidecar.annotations;
  const annotations: Annotation[] = Array.isArray(stored)
    ? (stored as Annotation[])
    : [];
  const partition = partitionAnnotations({
    first: cut.first,
    second: cut.second,
    annotations,
    chosenIds: request.carryOver.annotationIds,
  });
  if (partition.outcome === "failed") {
    return {
      outcome: "failed",
      failedStep: "move-annotations",
      remainingState: "original-restored",
      cause: `annotations-${partition.reason}`,
    };
  }
  progress.newText = partition.newDocument;
  const date = (options.now ?? (() => new Date()))().toISOString();

  // Step 2: the preserved snapshot of the full stored text.
  progress.step = "snapshot";
  progress.revisionIdsBefore = new Set(
    (await listRevisions(projectRoot, originalId)).map((r) => r.id),
  );
  const snapshot = await createRevision(projectRoot, originalId, {
    content,
    isCanonical: false,
    metadata: {
      name: `Before split ${date.slice(0, 10)}`,
      preserve: true,
      splitSnapshot: true,
    },
  });

  // Step 3: the new document, directly after the original.
  progress.step = "create-document";
  const newId = await createDocument(
    projectId,
    request,
    partition.newDocument,
    progress,
  );

  // Step 4: the chosen annotations leave the original and join the new document.
  progress.step = "move-annotations";
  await moveAnnotations(
    projectRoot,
    originalId,
    newId,
    annotations,
    partition.newAnnotations,
    progress,
  );

  // Step 5: the compile exclusion; at the cap or an unusable list the split goes on.
  progress.step = "seed-exclusion";
  const notices = await seedExclusion(projectRoot, originalId, newId, progress);

  // Step 6: the truncation, no writing-log entry, no automatic snapshot.
  progress.step = "truncate";
  progress.truncation = await backUpTruncation(
    projectRoot,
    originalId,
    revision,
    content,
    sidecar,
  );
  await writeCanonicalContentWithoutLog(
    projectRoot,
    originalId,
    revision.id,
    JSON.stringify(partition.originalDocument),
    { lockHeld: true },
  );

  // Step 7: the lineage entry, then the latest-operation record last.
  progress.step = "write-records";
  progress.recordFiles = [
    await readRawOrNull(`${projectRoot}/meta/${LINEAGE_FILE_NAME}`),
    await readRawOrNull(`${projectRoot}/meta/${LATEST_OPERATION_FILE_NAME}`),
  ];
  await writeLineageEntry(projectRoot, newId, {
    sourceDocumentId: originalId,
    sourceRevisionId: snapshot.id,
    sourceRevisionNumber: snapshot.versionNumber,
    operation: "split",
    date,
  });
  await writeLatestOperation(projectRoot, {
    kind: "split",
    affectedDocumentIds: [originalId, newId],
    snapshotRevisions: [
      {
        documentId: originalId,
        revisionId: snapshot.id,
        revisionNumber: snapshot.versionNumber,
      },
    ],
    newDocumentId: newId,
    date,
  });

  return {
    outcome: "applied",
    newDocumentId: newId,
    notices,
    snapshotRevisionId: snapshot.id,
    snapshotRevisionNumber: snapshot.versionNumber,
  };
}

async function createDocument(
  projectId: string,
  request: SplitApplyRequest,
  text: TipTapDocument,
  progress: Progress,
): Promise<string> {
  try {
    progress.created = await createSplitDocument(projectId, {
      originalId: request.resourceId,
      text,
      newName: request.carryOver.newName,
      carriedFields: request.carryOver.fields,
    });
  } catch (err) {
    // The builder removes what it wrote when it can; this records when it could not.
    if (err instanceof SplitNewDocumentError && !err.cleanedUp)
      progress.isDocumentLeftBehind = true;
    throw err;
  }
  return progress.created.documentId;
}

async function moveAnnotations(
  projectRoot: string,
  originalId: string,
  newId: string,
  before: Annotation[],
  moving: Annotation[],
  progress: Progress,
): Promise<void> {
  if (moving.length === 0) return;
  const movingIds = new Set(moving.map((a) => a.id));
  progress.annotationsBefore = structuredClone(before);
  await mutateSidecar(projectRoot, newId, (current) => ({
    ...(current ?? {}),
    annotations: asValue(moving),
  }));
  await mutateSidecar(projectRoot, originalId, (current) => {
    const list: unknown = current?.annotations;
    if (current === null || !Array.isArray(list)) return SIDECAR_UNCHANGED;
    return {
      ...current,
      annotations: asValue(
        (list as Annotation[]).filter((a) => !movingIds.has(a.id)),
      ),
    };
  });
}

async function seedExclusion(
  projectRoot: string,
  originalId: string,
  newId: string,
  progress: Progress,
): Promise<string[]> {
  const state = await readExclusionState(projectRoot, originalId);
  if (state === "not-listed") return [];
  progress.isExclusionAttempted = true;
  const seeded = await seedCompileExclusion(projectRoot, newId, {
    atCap: SPLIT_COMPILE_EXCLUSION_NOTICE,
    unreadable: SPLIT_COMPILE_EXCLUSION_NOTICE,
  });
  return seeded.notice === undefined ? [] : [seeded.notice];
}

async function backUpTruncation(
  projectRoot: string,
  originalId: string,
  revision: Revision,
  content: string,
  sidecar: Record<string, MetadataValue>,
): Promise<TruncationBackup> {
  const base = `${projectRoot}/resources/${originalId}`;
  const has = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(sidecar, key);
  const dir = revisionDir(projectRoot, originalId, revision.versionNumber);
  return {
    contentPath: `${dir}/content.bin`,
    content,
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

// --- reverse compensation -----------------------------------------------

async function restoreRecords(
  projectRoot: string,
  files: readonly RawFile[],
): Promise<void> {
  await withMetaLock(projectRoot, async () => {
    for (const file of files) {
      if (file.raw === null) await rm(file.path, { force: true });
      else await atomicWriteFile(file.path, file.raw, "utf8");
    }
  });
}

async function restoreTruncation(
  projectRoot: string,
  originalId: string,
  backup: TruncationBackup,
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

/**
 * Puts the moved annotations back into the original's list: the earlier
 * order, the current version of any that is still there, and any annotation
 * added since kept at the end.
 */
async function restoreAnnotations(
  projectRoot: string,
  originalId: string,
  before: readonly Annotation[],
): Promise<void> {
  await mutateSidecar(projectRoot, originalId, (current) => {
    if (current === null) throw new Error("sidecar missing");
    const list: unknown = current.annotations;
    const now = Array.isArray(list) ? (list as Annotation[]) : [];
    const byId = new Map(now.map((a) => [a.id, a]));
    const known = new Set(before.map((a) => a.id));
    const restored = before.map((a) => byId.get(a.id) ?? a);
    for (const a of now) if (!known.has(a.id)) restored.push(a);
    return { ...current, annotations: asValue(restored) };
  });
}

/** Removes the snapshot: clear the preserve flag, then delete (a preserved revision is refused). */
async function removeSnapshots(
  projectRoot: string,
  originalId: string,
  before: ReadonlySet<string>,
): Promise<void> {
  const revisions = await listRevisions(projectRoot, originalId);
  for (const revision of revisions) {
    if (before.has(revision.id) || revision.metadata?.splitSnapshot !== true)
      continue;
    await setRevisionPreserve(projectRoot, originalId, revision.id, false);
    await deleteRevision(projectRoot, originalId, revision.id);
  }
}

function remainingStateOf(failed: ReadonlySet<UndoKind>): SplitRemainingState {
  if (failed.size === 0) return "original-restored";
  if (failed.size > 1) return "state-unknown";
  if (failed.has("truncate")) return "original-truncated";
  if (failed.has("document")) return "new-document-remains";
  if (failed.has("snapshot")) return "snapshot-revision-kept";
  return "state-unknown";
}

/**
 * Undoes the steps that ran, in reverse. Every undo is attempted; one that
 * fails is recorded and decides the state returned. The snapshot is kept when
 * the truncation or the records could not be put back (it holds the earlier
 * text), and the new document is kept when the notes could not be put back
 * (it holds them).
 */
async function compensate(
  projectId: string,
  projectRoot: string,
  originalId: string,
  progress: Progress,
): Promise<SplitRemainingState> {
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
  const newId = progress.created?.documentId ?? null;
  const { recordFiles, truncation, annotationsBefore } = progress;
  if (recordFiles)
    await attempt("records", () => restoreRecords(projectRoot, recordFiles));
  if (truncation)
    await attempt("truncate", () =>
      restoreTruncation(projectRoot, originalId, truncation),
    );
  if (progress.isExclusionAttempted && newId !== null)
    await attempt("exclusion", () =>
      removeCompileExclusions(projectRoot, [newId]),
    );
  if (annotationsBefore)
    await attempt("annotations", () =>
      restoreAnnotations(projectRoot, originalId, annotationsBefore),
    );
  if (progress.created && !failed.has("annotations")) {
    const { undo } = progress.created;
    await attempt("document", () => removeSplitDocument(projectId, undo));
  }
  if (progress.isDocumentLeftBehind) failed.add("document");
  const before = progress.revisionIdsBefore;
  if (before && !failed.has("truncate") && !failed.has("records"))
    await attempt("snapshot", () =>
      removeSnapshots(projectRoot, originalId, before),
    );
  await flushIndexer();
  return remainingStateOf(failed);
}
