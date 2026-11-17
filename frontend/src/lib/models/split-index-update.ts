/**
 * @module split-index-update
 *
 * The awaited per-document derived-data update of "Split a document at the
 * cursor" (Feature 120, FR-9). After a split commits, the original and the
 * split-off document each need their inverted-index terms, annotation-body
 * terms, backlinks, mention records and prose diagnostics brought up to date
 * without a whole-project rebuild.
 *
 * `enqueueIndex` cannot serve: it catches and logs every step failure and its
 * promise also resolves after 5 s whether or not the work ran (Task 4,
 * F8, F9, F12). This function awaits each step and returns the failures it
 * saw, each naming the document and the step, so a failure never reads as an
 * up-to-date index. It is called after commit by Task 22 and is outside the
 * split's rollback. A failed step is repairable by `reindex` for the four
 * indexes `rebuildDerivedIndexes` rewrites. Prose diagnostics are not among
 * them (Task 4, F5), so a failed diagnostics step is repaired by running this
 * function again.
 *
 * Mentions are recomputed from each document's own text, never copied. The
 * backlinks step scans the whole project, as `enqueueIndex` does (Task 4, F4);
 * it is not `rebuildDerivedIndexes`. It does not use `withIndexingSuspended`.
 *
 * The caller establishes the storage context (`runForTenant`); this function
 * reads and writes through the active adapter only.
 */
import { indexAnnotationBodies, indexResource } from "./inverted-index";
import { readSidecar } from "./sidecar";
import { computeBacklinks, persistBacklinks } from "./backlinks";
import { buildEntityAliasTable } from "./entity-alias-table";
import { findMentionOffsets } from "./entity-detection";
import { updateMentionIndex, type MentionRecord } from "./mention-index";
import {
  dialogueRatio,
  averageSentenceLength,
  topRepeatedWords,
  HEURISTIC_VERSION,
} from "./prose-diagnostics";
import {
  loadDiagnosticsIndex,
  persistDiagnosticsIndex,
  type DiagnosticsRecord,
} from "./diagnostics-index";
import { loadPersistedPlainText } from "./indexer-queue";
import type { TextResource } from "./types";

/**
 * The steps of the update, as a failure names them. Defined here, not in
 * `split-types.ts`, which only Task 9 edits.
 */
export const SPLIT_INDEX_STEPS = [
  "read-content",
  "read-sidecar",
  "inverted-index",
  "annotation-index",
  "backlinks",
  "mention-index",
  "diagnostics",
] as const;

/** One step of the per-document index update. */
export type SplitIndexStep = (typeof SPLIT_INDEX_STEPS)[number];

/** One failed step of one document. */
export interface SplitIndexFailure {
  documentId: string;
  step: SplitIndexStep;
}

/** Result of the update; the two outcomes never share a value. */
export type SplitIndexUpdateResult =
  | { outcome: "updated"; documentIds: string[] }
  | { outcome: "failed"; failures: SplitIndexFailure[] };

type Sidecar = Awaited<ReturnType<typeof readSidecar>>;

interface DocumentState {
  documentId: string;
  /** Persisted text; undefined when it could not be read. */
  plain: string | undefined;
  /** False when the sidecar read failed (name and bodies unknown). */
  isSidecarRead: boolean;
  sidecar: Sidecar;
}

function annotationBodies(side: Sidecar): string[] {
  const stored: unknown = side?.["annotations"];
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((a: unknown) =>
    typeof (a as { body?: unknown } | null)?.body === "string"
      ? [(a as { body: string }).body]
      : [],
  );
}

async function readDocument(
  projectRoot: string,
  documentId: string,
  failures: SplitIndexFailure[],
): Promise<DocumentState> {
  let plain: string | undefined;
  try {
    plain = await loadPersistedPlainText(projectRoot, documentId);
  } catch (err) {
    console.error(`[split-index] content of ${documentId} unreadable:`, err);
  }
  // `loadPersistedPlainText` returns undefined when no content file or
  // revision could be read: a split document always has text, so that is a
  // failure and not an empty document.
  if (plain === undefined) failures.push({ documentId, step: "read-content" });

  let sidecar: Sidecar = null;
  let isSidecarRead = true;
  try {
    sidecar = await readSidecar(projectRoot, documentId);
  } catch (err) {
    isSidecarRead = false;
    console.error(`[split-index] sidecar of ${documentId} unreadable:`, err);
    failures.push({ documentId, step: "read-sidecar" });
  }
  return { documentId, plain, isSidecarRead, sidecar };
}

async function updateInverted(
  projectRoot: string,
  doc: DocumentState,
  failures: SplitIndexFailure[],
): Promise<void> {
  if (!doc.isSidecarRead) return;
  const name = doc.sidecar?.["name"];
  const minimal = {
    id: doc.documentId,
    name: typeof name === "string" ? name : doc.documentId,
    type: doc.sidecar?.["type"] === "source" ? "source" : "text",
    folderId: undefined,
    createdAt: new Date().toISOString(),
    plainText: doc.plain,
    tiptap: undefined,
  } as unknown as TextResource;
  try {
    await indexResource(projectRoot, minimal);
  } catch (err) {
    console.error(`[split-index] inverted index of ${doc.documentId}:`, err);
    failures.push({ documentId: doc.documentId, step: "inverted-index" });
  }
  try {
    await indexAnnotationBodies(
      projectRoot,
      doc.documentId,
      annotationBodies(doc.sidecar),
    );
  } catch (err) {
    console.error(`[split-index] annotation index of ${doc.documentId}:`, err);
    failures.push({ documentId: doc.documentId, step: "annotation-index" });
  }
}

async function updateBacklinksStep(
  projectRoot: string,
  documentIds: readonly string[],
  failures: SplitIndexFailure[],
): Promise<void> {
  try {
    await persistBacklinks(projectRoot, await computeBacklinks(projectRoot));
  } catch (err) {
    console.error("[split-index] backlinks:", err);
    // The scan and the file are project-wide; every document is named.
    for (const documentId of documentIds) {
      failures.push({ documentId, step: "backlinks" });
    }
  }
}

function mentionRecords(
  entities: Awaited<ReturnType<typeof buildEntityAliasTable>>["entities"],
  doc: DocumentState,
): MentionRecord[] {
  const records: MentionRecord[] = [];
  for (const entity of Object.values(entities)) {
    const offsets: number[] = [];
    for (const term of entity.terms) {
      offsets.push(...findMentionOffsets(doc.plain ?? "", term));
    }
    if (offsets.length === 0) continue;
    offsets.sort((a, b) => a - b);
    records.push({
      entityId: entity.entityId,
      resourceId: doc.documentId,
      count: offsets.length,
      offsets,
    });
  }
  return records;
}

async function updateMentionsStep(
  projectRoot: string,
  docs: readonly DocumentState[],
  failures: SplitIndexFailure[],
): Promise<void> {
  const readable = docs.filter((d) => d.plain !== undefined);
  if (readable.length === 0) return;
  try {
    const { entities } = await buildEntityAliasTable(projectRoot);
    await updateMentionIndex(projectRoot, (index) => {
      for (const doc of readable) {
        const records = mentionRecords(entities, doc);
        if (records.length > 0) index[doc.documentId] = records;
        else delete index[doc.documentId];
      }
    });
  } catch (err) {
    console.error("[split-index] mention index:", err);
    for (const d of readable) {
      failures.push({ documentId: d.documentId, step: "mention-index" });
    }
  }
}

async function updateDiagnosticsStep(
  projectRoot: string,
  docs: readonly DocumentState[],
  failures: SplitIndexFailure[],
): Promise<void> {
  const readable = docs.filter((d) => d.plain !== undefined);
  if (readable.length === 0) return;
  try {
    const index = await loadDiagnosticsIndex(projectRoot);
    for (const doc of readable) {
      const text = doc.plain ?? "";
      const record: DiagnosticsRecord = {
        dialogueRatio: dialogueRatio(text),
        averageSentenceLength: averageSentenceLength(text),
        topRepeatedWords: topRepeatedWords(text),
        heuristicVersion: HEURISTIC_VERSION,
      };
      index[doc.documentId] = record;
    }
    await persistDiagnosticsIndex(projectRoot, index);
  } catch (err) {
    console.error("[split-index] diagnostics:", err);
    for (const d of readable) {
      failures.push({ documentId: d.documentId, step: "diagnostics" });
    }
  }
}

/**
 * Bring the derived data of `documentIds` up to date and report every step
 * that failed. Every step is attempted even after an earlier failure, so the
 * result lists all of them. Resolves only after the work has run.
 */
export async function updateDocumentIndexes(
  projectRoot: string,
  documentIds: readonly string[],
): Promise<SplitIndexUpdateResult> {
  const ids = [...new Set(documentIds)];
  const failures: SplitIndexFailure[] = [];
  const docs: DocumentState[] = [];
  for (const id of ids) {
    docs.push(await readDocument(projectRoot, id, failures));
  }
  for (const doc of docs) await updateInverted(projectRoot, doc, failures);
  if (ids.length > 0) await updateBacklinksStep(projectRoot, ids, failures);
  await updateMentionsStep(projectRoot, docs, failures);
  await updateDiagnosticsStep(projectRoot, docs, failures);
  return failures.length === 0
    ? { outcome: "updated", documentIds: ids }
    : { outcome: "failed", failures };
}
