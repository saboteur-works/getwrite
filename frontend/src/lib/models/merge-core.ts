/**
 * @module merge-core
 *
 * Applies a merge of N text documents into the first one as one operation in
 * the decided order (Feature 121, FR-3 to FR-10, FR-6 forward path, FR-8,
 * FR-21): the stale and eligibility refusals, then the ordered writes. A
 * sibling of `split-core.ts` taking N+1 locks, not a generalisation of it.
 * Reverse compensation is a later task: on a failure this module returns
 * `failed` naming the step that stopped it and what it knows is on disk, and
 * does not undo anything or claim that it did.
 *
 * Writer model: the claim that nothing else writes between the staleness
 * check and the last write holds under one writer instance per tenant
 * (ADR-017, ADR-019). The `revision-content` lock is per process and does not
 * coordinate several server instances.
 *
 * Locks, in one recorded order (`experiments/task-5.md`, rows L1 to L6, N1 to
 * N10, O3 and O4):
 * 1. the `revision-content:<root>:<id>` lock of every distinct document, the
 *    target and the absorbed documents together, taken one after another in
 *    ascending order of document id (not target first: two merges with
 *    swapped roles did not settle under target-first order), held to the end
 *    and released in `finally`, in reverse;
 * 2. inside them, each `mutateSidecar` takes `withMetaLock(root)`, then the
 *    sidecar file lock (released), then the `project.json` file lock;
 * 3. every text write is `writeCanonicalContentWithoutLog` with
 *    `lockHeld: true`, because `acquireLock` is not reentrant;
 * 4. the latest-operation record takes `withMetaLock(root)` alone, last.
 * No step nests a non-reentrant lock inside itself. `withIndexingSuspended`
 * is not used. The derived-index update runs after commit (a later task) and
 * is outside this operation.
 *
 * Order of writes (FR-6): (1) lock; (2) a preserved, non-canonical snapshot of
 * each document's full stored text, read inside the locks, target first, then
 * the absorbed documents in append order, before any other write, so a copy
 * of every text exists before any document changes; (3) the chosen
 * annotations move; (4) the merged mark on each absorbed document; (5) each
 * moved note's mark is stripped from its absorbed document's text; (6) the
 * composed text and the carried metadata are written to the target; (7) the
 * latest-operation record. Nothing is written to `compileDefaults` and no
 * document is moved, renamed or purged. Every text write skips the writing
 * log and the automatic snapshot (FR-8).
 *
 * Everything that can be decided without a write (order, annotation carry,
 * composition, metadata carry) is decided before step 2, so a refusal or a
 * failure of those writes nothing. A sidecar write re-checks, inside its own
 * lock, that the value it replaces is the one that was read, so a concurrent
 * change is a failure and not a lost update.
 *
 * No React, JSX or JSON.
 */
import { readFolderTree } from "./folder-utils";
import { isLockedAccessError } from "./locked-access";
import { acquireLock } from "./locks";
import {
  partitionMergeAnnotations,
  type MergeAnnotationsResult,
} from "./merge-annotations";
import { composeMergedDocument, orderAbsorbedDocuments } from "./merge-compose";
import { MERGE_DOCUMENT_CAP } from "./merge-limits";
import { writeMergedMark } from "./merge-mark-core";
import { applyMergeMetadataCarry } from "./merge-metadata";
import {
  evaluateMergeRequest,
  type MergePreviewRequest,
  type MergeStoredDocument,
} from "./merge-preview-core";
import {
  MERGE_REFUSAL_REASONS,
  type MergeCarryOverChoice,
  type MergeRemainingState,
  type MergeResult,
  type MergeStep,
} from "./merge-types";
import { resolveResourceProjectRootOrThrow } from "./resource-crud-core";
import { isResourceId } from "./resource-id";
import {
  createRevision,
  writeCanonicalContentWithoutLog,
} from "./revision-core";
import { mutateSidecar } from "./sidecar";
import { revisionContentLockKey } from "./split-preview-core";
import { writeLatestOperation } from "./split-records-core";
import type {
  Annotation,
  AnyResource,
  MetadataValue,
  Revision,
  TipTapDocument,
} from "./types";

/** A merge request: the selection (the first is the target) plus the carry-over choice. */
export interface MergeApplyRequest extends MergePreviewRequest {
  carryOver: MergeCarryOverChoice;
}

/** Options of {@link applyMerge}; `now` is for tests. */
export interface MergeApplyOptions {
  now?: () => Date;
}

/**
 * Result of {@link applyMerge}; the outcomes never share a value. A `failed`
 * result states the step that stopped and the state known to remain; it does
 * not say that anything was undone.
 */
export type MergeApplyResult =
  | Exclude<MergeResult, { outcome: "failed" }>
  | (Extract<MergeResult, { outcome: "failed" }> & {
      /** A stable cause string (an error name or a fixed word); never client input. */
      cause: string;
    });

type Failed = Extract<MergeApplyResult, { outcome: "failed" }>;

/** The decisions made before the first write. */
interface Plan {
  target: MergeStoredDocument;
  /** In append order. */
  absorbed: MergeStoredDocument[];
  partition: Extract<MergeAnnotationsResult, { outcome: "partitioned" }>;
  composed: TipTapDocument;
  /** The target's `userMetadata` after the carry. */
  targetUserMetadata: Record<string, MetadataValue>;
  /** Ids of the annotations that move, per absorbed document. */
  movedFrom: Map<string, Set<string>>;
}

/** What has been written so far; decides the state reported on a failure. */
interface Progress {
  step: MergeStep;
  snapshotsDone: number;
  hasOtherWrite: boolean;
}

class PlanFailure extends Error {
  constructor(
    readonly step: MergeStep,
    readonly cause_: string,
  ) {
    super(cause_);
    this.name = "MergePlanFailure";
  }
}

class StaleSidecarError extends Error {
  constructor(key: string) {
    super(`The ${key} of a document changed after it was read.`);
    this.name = "MergeStaleSidecarError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failedResult(
  failedStep: MergeStep,
  remainingState: MergeRemainingState,
  cause: string,
): Failed {
  return { outcome: "failed", failedStep, remainingState, cause };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function annotationsOf(sidecar: Record<string, MetadataValue>): Annotation[] {
  const stored: unknown = sidecar.annotations;
  return Array.isArray(stored) ? (stored as Annotation[]) : [];
}

function userMetadataOf(
  sidecar: Record<string, MetadataValue>,
): Record<string, MetadataValue> {
  const stored: unknown = sidecar.userMetadata;
  return isRecord(stored) ? (stored as Record<string, MetadataValue>) : {};
}

function storedFolderId(sidecar: Record<string, MetadataValue>): string | null {
  const id = sidecar.folderId;
  return typeof id === "string" && id !== "" ? id : null;
}

/** Cap and id checks that need no read or lock; null when the request may go on. */
function precheck(request: MergeApplyRequest): MergeApplyResult | null {
  const count = request.documents.length;
  if (count >= 2 && count > MERGE_DOCUMENT_CAP) {
    return {
      outcome: "refused",
      reason: MERGE_REFUSAL_REASONS.tooManyDocuments,
      documentId: null,
    };
  }
  if (request.documents.some((d) => !isResourceId(d.resourceId))) {
    return failedResult("lock-documents", "documents-restored", "invalid-id");
  }
  return null;
}

/** The distinct revision-content lock keys, ascending: ascending document id. */
function lockKeys(projectRoot: string, request: MergeApplyRequest): string[] {
  const keys = new Set(
    request.documents.map((d) =>
      revisionContentLockKey(projectRoot, d.resourceId),
    ),
  );
  return [...keys].sort();
}

/** The absorbed documents in tree order (depth-first by folder then `orderIndex`). */
async function appendOrder(
  projectRoot: string,
  stored: readonly MergeStoredDocument[],
): Promise<MergeStoredDocument[]> {
  let folders: unknown[];
  try {
    folders = await readFolderTree(`${projectRoot}/folders`);
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    throw new PlanFailure("append-to-target", "folders-unreadable");
  }
  const absorbed = stored.slice(1);
  const nodes: AnyResource[] = [];
  for (const f of folders) {
    if (!isRecord(f) || typeof f.id !== "string") continue;
    const parent = f.parentId ?? f.folderId;
    nodes.push({
      id: f.id,
      type: "folder",
      orderIndex: typeof f.orderIndex === "number" ? f.orderIndex : 0,
      parentId: typeof parent === "string" ? parent : null,
      folderId: typeof parent === "string" ? parent : null,
    } as unknown as AnyResource);
  }
  for (const d of absorbed) {
    const order = d.sidecar.orderIndex;
    nodes.push({
      id: d.resourceId,
      type: "text",
      orderIndex: typeof order === "number" ? order : 0,
      folderId: storedFolderId(d.sidecar),
      parentId: storedFolderId(d.sidecar),
    } as unknown as AnyResource);
  }
  const ordered = orderAbsorbedDocuments(
    absorbed.map((d) => d.resourceId),
    nodes,
  );
  if (ordered.outcome === "failed") {
    throw new PlanFailure("append-to-target", `order-${ordered.reason}`);
  }
  const byId = new Map(absorbed.map((d) => [d.resourceId, d]));
  return ordered.ids.flatMap((id) => {
    const d = byId.get(id);
    return d ? [d] : [];
  });
}

/** Everything decided before the first write; a refusal is returned, a failure thrown. */
async function plan(
  projectRoot: string,
  request: MergeApplyRequest,
  stored: MergeStoredDocument[],
): Promise<Plan | Extract<MergeApplyResult, { outcome: "refused" }>> {
  const target = stored[0];
  const absorbed = await appendOrder(projectRoot, stored);
  const partition = partitionMergeAnnotations({
    targetAnnotations: annotationsOf(target.sidecar),
    absorbed: absorbed.map((d) => ({
      documentId: d.resourceId,
      document: d.document,
      annotations: annotationsOf(d.sidecar),
    })),
    chosenIds: request.carryOver.annotationIds,
  });
  if (partition.outcome === "refused") {
    return {
      outcome: "refused",
      reason: partition.reason,
      documentId: null,
      annotationCounts: partition.annotationCounts,
    };
  }
  if (partition.outcome === "failed") {
    throw new PlanFailure(
      "move-annotations",
      `annotations-${partition.reason}`,
    );
  }
  const composed = composeMergedDocument({
    target: target.document,
    absorbed: partition.absorbed.map((a) => ({
      documentId: a.documentId,
      document: a.appendedDocument,
    })),
  });
  if (composed.outcome === "failed") {
    throw new PlanFailure("append-to-target", `compose-${composed.reason}`);
  }
  const carry = applyMergeMetadataCarry(
    userMetadataOf(target.sidecar),
    absorbed.map((d) => ({
      documentId: d.resourceId,
      userMetadata: userMetadataOf(d.sidecar),
    })),
    request.carryOver,
  );
  if (!carry.ok) {
    throw new PlanFailure("append-to-target", `metadata-${carry.reason}`);
  }
  const chosen = new Set(request.carryOver.annotationIds);
  const movedFrom = new Map<string, Set<string>>();
  for (const d of absorbed) {
    movedFrom.set(
      d.resourceId,
      new Set(
        annotationsOf(d.sidecar)
          .map((a) => a.id)
          .filter((id) => chosen.has(id)),
      ),
    );
  }
  return {
    target,
    absorbed,
    partition,
    composed: composed.document,
    targetUserMetadata: carry.userMetadata,
    movedFrom,
  };
}

/** Rewrites one sidecar key, failing if it is no longer what was read. */
async function replaceSidecarKey(
  projectRoot: string,
  documentId: string,
  key: "annotations" | "userMetadata",
  expected: unknown,
  next: unknown,
): Promise<void> {
  await mutateSidecar(projectRoot, documentId, (current) => {
    if (
      current === null ||
      !sameJson(current[key] ?? defaultFor(key), expected)
    )
      throw new StaleSidecarError(key);
    return { ...current, [key]: next as MetadataValue };
  });
}

function defaultFor(key: "annotations" | "userMetadata"): unknown {
  return key === "annotations" ? [] : {};
}

/** Step 2: one preserved, non-canonical snapshot per document; the ids by document. */
async function writeSnapshots(
  projectRoot: string,
  documents: readonly MergeStoredDocument[],
  date: string,
  progress: Progress,
): Promise<Map<string, Revision>> {
  const snapshots = new Map<string, Revision>();
  for (const doc of documents) {
    snapshots.set(
      doc.resourceId,
      await createRevision(projectRoot, doc.resourceId, {
        content: doc.content,
        isCanonical: false,
        metadata: {
          name: `Before merge ${date.slice(0, 10)}`,
          preserve: true,
          mergeSnapshot: true,
        },
      }),
    );
    progress.snapshotsDone += 1;
  }
  return snapshots;
}

/** Step 3: the chosen annotations leave their documents and join the target. */
async function moveAnnotations(projectRoot: string, p: Plan): Promise<void> {
  const isAnyMoved = [...p.movedFrom.values()].some((ids) => ids.size > 0);
  if (!isAnyMoved) return;
  await replaceSidecarKey(
    projectRoot,
    p.target.resourceId,
    "annotations",
    annotationsOf(p.target.sidecar),
    p.partition.targetAnnotations,
  );
  for (const result of p.partition.absorbed) {
    const doc = p.absorbed.find((d) => d.resourceId === result.documentId);
    if (!doc || (p.movedFrom.get(result.documentId)?.size ?? 0) === 0) continue;
    await replaceSidecarKey(
      projectRoot,
      result.documentId,
      "annotations",
      annotationsOf(doc.sidecar),
      result.annotations,
    );
  }
}

/** Step 6: the composed text, then the carried metadata, on the target. */
async function appendToTarget(projectRoot: string, p: Plan): Promise<void> {
  await writeCanonicalContentWithoutLog(
    projectRoot,
    p.target.resourceId,
    p.target.revision.id,
    JSON.stringify(p.composed),
    { lockHeld: true },
  );
  const before = userMetadataOf(p.target.sidecar);
  if (sameJson(before, p.targetUserMetadata)) return;
  await mutateSidecar(projectRoot, p.target.resourceId, (current) => {
    if (current === null || !sameJson(userMetadataOf(current), before))
      throw new StaleSidecarError("userMetadata");
    return { ...current, userMetadata: p.targetUserMetadata };
  });
}

/** Steps 3 to 7, after the snapshots. */
async function writeAfterSnapshots(
  projectRoot: string,
  p: Plan,
  snapshots: ReadonlyMap<string, Revision>,
  date: string,
  progress: Progress,
): Promise<void> {
  progress.hasOtherWrite = true;
  progress.step = "move-annotations";
  await moveAnnotations(projectRoot, p);

  progress.step = "write-marks";
  const targetSnapshot = snapshots.get(p.target.resourceId);
  if (!targetSnapshot) throw new Error("missing target snapshot");
  for (const doc of p.absorbed) {
    await writeMergedMark(projectRoot, doc.resourceId, {
      targetDocumentId: p.target.resourceId,
      targetSnapshotRevisionId: targetSnapshot.id,
      date,
    });
  }

  progress.step = "strip-absorbed-marks";
  for (const result of p.partition.absorbed) {
    const doc = p.absorbed.find((d) => d.resourceId === result.documentId);
    if (!doc || (p.movedFrom.get(result.documentId)?.size ?? 0) === 0) continue;
    await writeCanonicalContentWithoutLog(
      projectRoot,
      result.documentId,
      doc.revision.id,
      JSON.stringify(result.document),
      { lockHeld: true },
    );
  }

  progress.step = "append-to-target";
  await appendToTarget(projectRoot, p);

  progress.step = "write-records";
  const affected = [p.target, ...p.absorbed].map((d) => d.resourceId);
  await writeLatestOperation(projectRoot, {
    kind: "merge",
    affectedDocumentIds: affected,
    snapshotRevisions: affected.map((documentId) => {
      const snap = snapshots.get(documentId);
      if (!snap) throw new Error("missing snapshot");
      return {
        documentId,
        revisionId: snap.id,
        revisionNumber: snap.versionNumber,
      };
    }),
    date,
  });
}

/** What is known to remain after a failure at `progress`; never "restored" once a write began. */
function remainingStateOf(progress: Progress): MergeRemainingState {
  if (progress.hasOtherWrite) return "partially-written";
  if (progress.snapshotsDone > 0) return "snapshot-revisions-kept";
  return progress.step === "lock-documents"
    ? "documents-restored"
    : "state-unknown";
}

/** Everything from the staleness check to the record, with the locks already held. */
async function applyUnderLocks(
  projectRoot: string,
  request: MergeApplyRequest,
  options: MergeApplyOptions,
  progress: Progress,
): Promise<MergeApplyResult> {
  const evaluation = await evaluateMergeRequest(projectRoot, request);
  if (evaluation.outcome === "refused") {
    return {
      outcome: "refused",
      reason: evaluation.reason,
      documentId: evaluation.documentId,
    };
  }
  if (evaluation.outcome === "failed") {
    return failedResult(
      "lock-documents",
      "documents-restored",
      evaluation.cause,
    );
  }
  let planned: Plan | Extract<MergeApplyResult, { outcome: "refused" }>;
  try {
    planned = await plan(projectRoot, request, evaluation.documents);
  } catch (err) {
    if (err instanceof PlanFailure) {
      return failedResult(err.step, "documents-restored", err.cause_);
    }
    throw err;
  }
  if ("outcome" in planned) return planned;

  const date = (options.now ?? (() => new Date()))().toISOString();
  progress.step = "snapshot";
  const documents = [planned.target, ...planned.absorbed];
  const snapshots = await writeSnapshots(
    projectRoot,
    documents,
    date,
    progress,
  );
  await writeAfterSnapshots(projectRoot, planned, snapshots, date, progress);
  return {
    outcome: "applied",
    targetDocumentId: planned.target.resourceId,
    absorbedDocumentIds: planned.absorbed.map((d) => d.resourceId),
    notices: [],
  };
}

/**
 * Applies a merge. Takes the `revision-content` lock of the target and every
 * absorbed document together in ascending order of document id and holds them
 * to the end, so an autosave or a second merge touching one of them waits and
 * then meets a changed document: it is refused as stale, or as already merged.
 * A staleness check made inside the locks refuses before any write.
 *
 * @throws The locked-access error for a locked or key-less encrypted project
 *   when nothing was written; `InvalidProjectIdCoreError` for a bad
 *   `projectId`.
 */
export async function applyMerge(
  projectId: string,
  request: MergeApplyRequest,
  options: MergeApplyOptions = {},
): Promise<MergeApplyResult> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const early = precheck(request);
  if (early) return early;
  const progress: Progress = {
    step: "lock-documents",
    snapshotsDone: 0,
    hasOtherWrite: false,
  };
  const releases: Array<() => void> = [];
  try {
    for (const key of lockKeys(projectRoot, request))
      releases.push(await acquireLock(key));
    return await applyUnderLocks(projectRoot, request, options, progress);
  } catch (err) {
    const remaining = remainingStateOf(progress);
    const isNothingWritten =
      progress.snapshotsDone === 0 && !progress.hasOtherWrite;
    if (isLockedAccessError(err) && isNothingWritten) throw err;
    return failedResult(
      progress.step,
      remaining,
      err instanceof Error ? err.name : "unknown",
    );
  } finally {
    for (const release of releases.reverse()) release();
  }
}
