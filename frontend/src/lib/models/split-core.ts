/**
 * @module split-core
 *
 * Applies a split of a text document at the cursor as one operation in the
 * decided order (Feature 120, FR-3 to FR-8, FR-10, FR-11, FR-16, OQ-9). This
 * is the forward path: stale and eligibility refusals, then the ordered
 * writes.
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
 * outside this operation.
 *
 * A step that throws propagates its error from here (reverse compensation is
 * Task 21); a locked-access error before any write writes nothing.
 *
 * No React, JSX, JSON or `node:*`.
 */
import { readFile } from "./io";
import { acquireLock } from "./locks";
import { resolveResourceProjectRootOrThrow } from "./resource-crud-core";
import {
  createRevision,
  writeCanonicalContentWithoutLog,
} from "./revision-core";
import { seedCompileExclusion } from "./saved-defaults-core";
import { PROJECT_FILENAME } from "./project-config";
import { mutateSidecar, SIDECAR_UNCHANGED } from "./sidecar";
import { partitionAnnotations } from "./split-annotations";
import { SPLIT_COMPILE_EXCLUSION_NOTICE } from "./split-messages";
import { createSplitDocument } from "./split-new-document";
import {
  evaluateSplitRequest,
  revisionContentLockKey,
  type SplitPreviewRequest,
} from "./split-preview-core";
import { writeLatestOperation, writeLineageEntry } from "./split-records-core";
import {
  type SplitCarryOverChoice,
  type SplitRefusalReason,
  type SplitRemainingState,
  type SplitStep,
} from "./split-types";
import type { Annotation, MetadataValue } from "./types";

/** A split request: the cursor of {@link SplitPreviewRequest} plus the carry-over choice. */
export interface SplitApplyRequest extends SplitPreviewRequest {
  carryOver: SplitCarryOverChoice;
}

/** Options of {@link applySplit}; `now` is for tests. */
export interface SplitApplyOptions {
  now?: () => Date;
}

/** Result of {@link applySplit}; the outcomes never share a value. */
export type SplitApplyResult =
  | {
      outcome: "applied";
      newDocumentId: string;
      /** Texts of non-fatal conditions, for example a full exclusion list. */
      notices: string[];
      snapshotRevisionId: string;
      snapshotRevisionNumber: number;
    }
  | { outcome: "refused"; reason: SplitRefusalReason }
  | {
      outcome: "failed";
      failedStep: SplitStep;
      remainingState: SplitRemainingState;
      /** A stable cause string; never client input. */
      cause: string;
    };

type CompileExclusionState = "not-listed" | "listed" | "unusable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function asValue(value: unknown): MetadataValue {
  return value as MetadataValue;
}

/**
 * Applies a split. Takes the original's `revision-content` lock first and
 * holds it to the end, so a concurrent autosave or a second split of the same
 * document waits and then meets a changed document: the second split is
 * refused as stale.
 *
 * @throws The locked-access error for a locked or key-less encrypted project
 *   (nothing is written); `InvalidProjectIdCoreError` for a bad `projectId`.
 *   An error thrown by a write step propagates (Task 21 adds compensation).
 */
export async function applySplit(
  projectId: string,
  request: SplitApplyRequest,
  options: SplitApplyOptions = {},
): Promise<SplitApplyResult> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const release = await acquireLock(
    revisionContentLockKey(projectRoot, request.resourceId),
  );
  try {
    return await applyUnderLock(projectId, projectRoot, request, options);
  } finally {
    release();
  }
}

async function applyUnderLock(
  projectId: string,
  projectRoot: string,
  request: SplitApplyRequest,
  options: SplitApplyOptions,
): Promise<SplitApplyResult> {
  const originalId = request.resourceId;
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

  const date = (options.now ?? (() => new Date()))().toISOString();

  // Step 2: the preserved snapshot of the full stored text.
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
  const created = await createSplitDocument(projectId, {
    originalId,
    text: partition.newDocument,
    newName: request.carryOver.newName,
    carriedFields: request.carryOver.fields,
  });
  const newId = created.documentId;

  // Step 4: the chosen annotations leave the original and join the new document.
  const movingIds = new Set(partition.newAnnotations.map((a) => a.id));
  if (movingIds.size > 0) {
    await mutateSidecar(projectRoot, newId, (current) => ({
      ...(current ?? {}),
      annotations: asValue(partition.newAnnotations),
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

  // Step 5: the compile exclusion; at the cap or an unusable list the split goes on.
  const notices: string[] = [];
  const exclusion = await readExclusionState(projectRoot, originalId);
  if (exclusion !== "not-listed") {
    const seeded = await seedCompileExclusion(projectRoot, newId, {
      atCap: SPLIT_COMPILE_EXCLUSION_NOTICE,
      unreadable: SPLIT_COMPILE_EXCLUSION_NOTICE,
    });
    if (seeded.notice !== undefined) notices.push(seeded.notice);
  }

  // Step 6: the truncation, no writing-log entry, no automatic snapshot.
  await writeCanonicalContentWithoutLog(
    projectRoot,
    originalId,
    revision.id,
    JSON.stringify(partition.originalDocument),
    { lockHeld: true },
  );

  // Step 7: the lineage entry, then the latest-operation record last.
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
