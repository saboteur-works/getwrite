/**
 * @module merge-preview-core
 *
 * The read side of "Merge documents" (Feature 121, FR-7 server half and FR-11
 * data): given the selected documents in selection order, each with the
 * canonical revision id and content hash the client saw, check them against
 * the stored documents and return what the merge dialog shows. Nothing here
 * writes (a test asserts it for every outcome).
 *
 * Two layers, as in `split-preview-core.ts`:
 * - {@link evaluateMergeRequest} reads and decides, takes no lock and writes
 *   nothing. The apply step (Task 25) calls it while it already holds the
 *   `revision-content` locks, which are not reentrant.
 * - {@link previewMerge} takes the `revision-content` lock of each distinct
 *   document in ascending key order (the order the apply step uses), releases
 *   them all before it returns, and builds the dialog's data.
 *
 * Decisions, in order: a count over `MERGE_DOCUMENT_CAP` is refused with the
 * cap text before any document is read; each sidecar is read and the selection
 * goes through `mergeEligibility` (one refusal naming the document); then each
 * stored canonical text is read and a revision or hash mismatch is refused as
 * stale. The hash is `hashSplitContent`, imported from `split-preview-core.ts`.
 *
 * Failures never read as an empty preview: an unreadable sidecar, revision,
 * `project.json`, folder, annotation list or metadata, or stored content that
 * is not a document, is a `failed` outcome with a cause; a locked project
 * rethrows the existing locked-access error. A folder that cannot be found is
 * a failure, because the folder tree read skips an unreadable folder silently
 * and an absent folder would otherwise show as an empty path.
 *
 * No React, JSX or JSON.
 */
import { readFolderTree } from "./folder-utils";
import {
  computeInboxSubtree,
  isInInbox,
  type InboxFolderNode,
} from "./inbox-membership";
import { readFile, stat } from "./io";
import { isLockedAccessError } from "./locked-access";
import { acquireLock } from "./locks";
import {
  groupAnnotationsForOffer,
  type MergeAnnotationAbsorbed,
  type MergeAnnotationOfferGroup,
} from "./merge-annotations";
import { orderAbsorbedDocuments } from "./merge-compose";
import { mergeEligibility } from "./merge-eligibility";
import { MERGE_DOCUMENT_CAP } from "./merge-limits";
import {
  describeMergeDocumentCap,
  MERGE_REFUSAL_MESSAGES,
  MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
  MERGE_TARGET_IN_INBOX_WARNING,
  MERGED_RULE_TEXTS,
} from "./merge-messages";
import {
  offerMergeMetadataFields,
  type MergeMetadataOffer,
} from "./merge-metadata";
import { MERGE_REFUSAL_REASONS, type MergeRefusalReason } from "./merge-types";
import { PROJECT_FILENAME } from "./project-config";
import { resolveResourceProjectRootOrThrow } from "./resource-crud-core";
import { isResourceId } from "./resource-id";
import { listRevisions } from "./revision";
import { readRevision } from "./revision-core";
import { ProjectConfigSchema } from "./schemas";
import { readSidecar, sidecarFilename } from "./sidecar";
import { hashSplitContent, revisionContentLockKey } from "./split-preview-core";
import { tiptapToPlainText } from "../tiptap-utils";
import { countWords } from "../word-count";
import type {
  Annotation,
  AnyResource,
  MetadataValue,
  Revision,
  TipTapDocument,
} from "./types";

/** One selected document as the client sends it. */
export interface MergePreviewDocumentRef {
  resourceId: string;
  /** The canonical revision the client was showing. */
  revisionId: string;
  /** `hashSplitContent` of the stored text the client saw. */
  contentHash: string;
}

/** A merge preview request: the selection in selection order (the first is the target). */
export interface MergePreviewRequest {
  documents: MergePreviewDocumentRef[];
}

/** One document of the preview, with its name, folder path and word count. */
export interface MergePreviewDocument {
  documentId: string;
  name: string;
  /** Folder names from the project root down; empty at the root. */
  folderPath: string[];
  /** `countWords(tiptapToPlainText(storedText))`. */
  words: number;
}

/** An absorbed document, with the rule of FR-17 to FR-20 that will apply to it. */
export interface MergePreviewAbsorbed extends MergePreviewDocument {
  rules: string[];
}

/** A warning that does not stop the merge (OQ-12). */
export interface MergePreviewWarning {
  kind: "target-excluded-from-compile" | "target-in-inbox";
  message: string;
}

/** Result of {@link previewMerge}; the outcomes never share a value. */
export type MergePreviewResult =
  | {
      outcome: "preview";
      target: MergePreviewDocument;
      /** In append order (tree order). */
      absorbed: MergePreviewAbsorbed[];
      /** Per absorbed document, in append order. */
      annotations: MergeAnnotationOfferGroup[];
      metadata: MergeMetadataOffer[];
      warnings: MergePreviewWarning[];
    }
  | {
      outcome: "refused";
      reason: MergeRefusalReason;
      documentId: string | null;
      message: string;
    }
  | { outcome: "failed"; cause: string };

/** One selected document as read from disk. */
export interface MergeStoredDocument {
  resourceId: string;
  revision: Revision;
  /** The stored canonical text, exactly as read. */
  content: string;
  document: TipTapDocument;
  sidecar: Record<string, MetadataValue>;
}

/** What {@link evaluateMergeRequest} hands to the apply step. */
export type MergeEvaluation =
  | {
      outcome: "ready";
      /** In selection order; the first is the target. */
      documents: MergeStoredDocument[];
    }
  | {
      outcome: "refused";
      reason: MergeRefusalReason;
      documentId: string | null;
      message: string;
    }
  | { outcome: "failed"; cause: string };

type Failed = { outcome: "failed"; cause: string };
type Refused = Extract<MergeEvaluation, { outcome: "refused" }>;

function failed(cause: string): Failed {
  return { outcome: "failed", cause };
}

function refused(
  reason: MergeRefusalReason,
  documentId: string | null,
  message: string = MERGE_REFUSAL_MESSAGES[reason],
): Refused {
  return { outcome: "refused", reason, documentId, message };
}

function isDocument(value: unknown): value is TipTapDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Read<T> = { ok: true; value: T } | { ok: false; cause: string };

/** Runs a read; a locked-access error is rethrown, any other failure is a cause. */
async function guarded<T>(
  cause: string,
  read: () => Promise<T>,
): Promise<Read<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    return { ok: false, cause };
  }
}

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

/** True when the document's sidecar is in `.trash/meta`; false only on a clean ENOENT. */
async function isInTrash(
  projectRoot: string,
  resourceId: string,
): Promise<Read<boolean>> {
  try {
    await stat(`${projectRoot}/.trash/meta/${sidecarFilename(resourceId)}`);
    return { ok: true, value: true };
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    if (isNotFound(err)) return { ok: true, value: false };
    return { ok: false, cause: "trash-unreadable" };
  }
}

// --- evaluation ---------------------------------------------------------

/** Cap and id checks that need no read; null when the request may be read. */
function precheck(request: MergePreviewRequest): Refused | Failed | null {
  const count = request.documents.length;
  if (count >= 2 && count > MERGE_DOCUMENT_CAP)
    return refused(
      MERGE_REFUSAL_REASONS.tooManyDocuments,
      null,
      describeMergeDocumentCap(MERGE_DOCUMENT_CAP),
    );
  if (request.documents.some((d) => !isResourceId(d.resourceId)))
    return failed("invalid-resource-id");
  return null;
}

interface SidecarRow {
  resourceId: string;
  sidecar: Record<string, MetadataValue> | null;
  inTrash: boolean;
}

async function readRows(
  projectRoot: string,
  request: MergePreviewRequest,
): Promise<{ rows: SidecarRow[] } | Failed> {
  const rows: SidecarRow[] = [];
  for (const { resourceId } of request.documents) {
    const side = await guarded("sidecar-unreadable", () =>
      readSidecar(projectRoot, resourceId),
    );
    if (!side.ok) return failed(side.cause);
    let isTrashed = false;
    if (side.value === null) {
      const trash = await isInTrash(projectRoot, resourceId);
      if (!trash.ok) return failed(trash.cause);
      isTrashed = trash.value;
    }
    rows.push({ resourceId, sidecar: side.value, inTrash: isTrashed });
  }
  return { rows };
}

async function readStored(
  projectRoot: string,
  ref: MergePreviewDocumentRef,
  sidecar: Record<string, MetadataValue>,
): Promise<MergeStoredDocument | Refused | Failed> {
  const stale = (): Refused =>
    refused(MERGE_REFUSAL_REASONS.staleContent, ref.resourceId);
  const listed = await guarded("revisions-unreadable", () =>
    listRevisions(projectRoot, ref.resourceId),
  );
  if (!listed.ok) return failed(listed.cause);
  const canonical = listed.value.find((r) => r.isCanonical);
  if (!canonical) return failed("no-canonical-revision");
  if (canonical.id !== ref.revisionId) return stale();
  const read = await guarded("content-unreadable", () =>
    readRevision(projectRoot, ref.resourceId, canonical.id),
  );
  if (!read.ok) return failed(read.cause);
  const { revision, content } = read.value;
  if (hashSplitContent(content) !== ref.contentHash) return stale();
  let document: unknown;
  try {
    document = JSON.parse(content);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return failed("content-not-a-document");
  }
  if (!isDocument(document)) return failed("content-not-a-document");
  return { resourceId: ref.resourceId, revision, content, document, sidecar };
}

/**
 * Reads the stored documents and decides whether the request can be applied:
 * the cap, an eligibility refusal, a stale refusal, or the stored texts. Takes
 * no lock and writes nothing, so the apply step can call it inside its own
 * `revision-content` locks.
 *
 * @throws The locked-access error for a locked or key-less encrypted project.
 */
export async function evaluateMergeRequest(
  projectRoot: string,
  request: MergePreviewRequest,
): Promise<MergeEvaluation> {
  const early = precheck(request);
  if (early) return early;
  const read = await readRows(projectRoot, request);
  if ("outcome" in read) return read;

  const eligibility = mergeEligibility(
    read.rows.map((r) => ({
      id: r.resourceId,
      // `mergeEligibility` reads a null sidecar as missing before it looks at
      // `inTrash`; a trashed document has no live sidecar, so it is passed an
      // empty one and is refused as in Trash, not as missing.
      sidecar: r.sidecar ?? (r.inTrash ? {} : null),
      inTrash: r.inTrash,
    })),
  );
  if (!eligibility.eligible)
    return refused(eligibility.reason, eligibility.documentId);

  const documents: MergeStoredDocument[] = [];
  for (let i = 0; i < request.documents.length; i++) {
    const sidecar = read.rows[i].sidecar;
    if (sidecar === null) return failed("resource-not-found");
    const stored = await readStored(projectRoot, request.documents[i], sidecar);
    if ("outcome" in stored) return stored;
    documents.push(stored);
  }
  return { outcome: "ready", documents };
}

// --- project facts ------------------------------------------------------

interface FolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  orderIndex: number;
}

interface ProjectFacts {
  folders: Map<string, FolderRecord>;
  excludedFromCompile: ReadonlySet<string>;
  inboxFolderId: string | null;
}

function toFolderRecords(raw: readonly unknown[]): FolderRecord[] {
  const out: FolderRecord[] = [];
  for (const f of raw) {
    if (!isRecord(f) || typeof f.id !== "string") continue;
    const parent = f.parentId ?? f.folderId;
    out.push({
      id: f.id,
      name: typeof f.name === "string" ? f.name : "",
      parentId: typeof parent === "string" ? parent : null,
      orderIndex: typeof f.orderIndex === "number" ? f.orderIndex : 0,
    });
  }
  return out;
}

async function readProjectFacts(
  projectRoot: string,
): Promise<Read<ProjectFacts>> {
  const raw = await guarded("project-unreadable", () =>
    readFile(`${projectRoot}/${PROJECT_FILENAME}`, "utf8"),
  );
  if (!raw.ok) return raw;
  let config: ReturnType<typeof ProjectConfigSchema.safeParse>;
  try {
    const parsed: unknown = JSON.parse(raw.value);
    config = ProjectConfigSchema.safeParse(
      isRecord(parsed) ? (parsed.config ?? {}) : {},
    );
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return { ok: false, cause: "project-unreadable" };
  }
  if (!config.success) return { ok: false, cause: "project-unreadable" };
  const tree = await guarded("folders-unreadable", () =>
    readFolderTree(`${projectRoot}/folders`),
  );
  if (!tree.ok) return tree;
  const folders = new Map(toFolderRecords(tree.value).map((f) => [f.id, f]));
  return {
    ok: true,
    value: {
      folders,
      excludedFromCompile: new Set(
        config.data.compileDefaults?.excludedResourceIds ?? [],
      ),
      inboxFolderId: config.data.inboxFolderId ?? null,
    },
  };
}

/** Folder names from the root down; a missing folder or a cycle is a failure. */
function folderPathOf(
  folderId: string | null,
  folders: ReadonlyMap<string, FolderRecord>,
): Read<string[]> {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = folderId;
  while (current !== null) {
    const folder = folders.get(current);
    if (!folder) return { ok: false, cause: "folder-not-found" };
    if (seen.has(current)) return { ok: false, cause: "folder-cycle" };
    seen.add(current);
    names.unshift(folder.name);
    current = folder.parentId;
  }
  return { ok: true, value: names };
}

function storedFolderId(sidecar: Record<string, MetadataValue>): string | null {
  const id = sidecar.folderId;
  return typeof id === "string" && id !== "" ? id : null;
}

// --- preview ------------------------------------------------------------

function storedAnnotations(
  sidecar: Record<string, MetadataValue>,
): Annotation[] | null {
  const stored: unknown = sidecar.annotations;
  if (stored === undefined) return [];
  if (!Array.isArray(stored)) return null;
  const isValid = stored.every(
    (a) =>
      isRecord(a) && typeof a.id === "string" && typeof a.body === "string",
  );
  return isValid ? (stored as unknown as Annotation[]) : null;
}

function storedUserMetadata(
  sidecar: Record<string, MetadataValue>,
): Record<string, MetadataValue> | null {
  const meta: unknown = sidecar.userMetadata;
  if (meta === undefined) return {};
  return isRecord(meta) ? (meta as Record<string, MetadataValue>) : null;
}

function nameOf(sidecar: Record<string, MetadataValue>): string {
  return typeof sidecar.name === "string" ? sidecar.name : "";
}

/** Only the fields `orderAbsorbedDocuments` reads (id, type, parent, order). */
function treeNode(
  node: Pick<FolderRecord, "id" | "orderIndex"> & {
    type: "folder" | "text";
    parentId: string | null;
  },
): AnyResource {
  return {
    id: node.id,
    type: node.type,
    orderIndex: node.orderIndex,
    folderId: node.parentId,
    parentId: node.parentId,
  } as unknown as AnyResource;
}

function appendOrder(
  stored: readonly MergeStoredDocument[],
  facts: ProjectFacts,
): Read<MergeStoredDocument[]> {
  const absorbed = stored.slice(1);
  const nodes: AnyResource[] = [
    ...[...facts.folders.values()].map((f) =>
      treeNode({ ...f, type: "folder" }),
    ),
    ...absorbed.map((d) => {
      const order = d.sidecar.orderIndex;
      return treeNode({
        id: d.resourceId,
        type: "text",
        orderIndex: typeof order === "number" ? order : 0,
        parentId: storedFolderId(d.sidecar),
      });
    }),
  ];
  const ordered = orderAbsorbedDocuments(
    absorbed.map((d) => d.resourceId),
    nodes,
  );
  if (ordered.outcome === "failed")
    return { ok: false, cause: `order-${ordered.reason}` };
  const byId = new Map(absorbed.map((d) => [d.resourceId, d]));
  return {
    ok: true,
    value: ordered.ids.flatMap((id) => {
      const d = byId.get(id);
      return d ? [d] : [];
    }),
  };
}

function describeDocument(
  doc: MergeStoredDocument,
  facts: ProjectFacts,
): Read<MergePreviewDocument> {
  const path = folderPathOf(storedFolderId(doc.sidecar), facts.folders);
  if (!path.ok) return path;
  return {
    ok: true,
    value: {
      documentId: doc.resourceId,
      name: nameOf(doc.sidecar),
      folderPath: path.value,
      words: countWords(tiptapToPlainText(doc.document)),
    },
  };
}

function targetWarnings(
  target: MergeStoredDocument,
  absorbed: readonly MergeStoredDocument[],
  facts: ProjectFacts,
  inInbox: (doc: MergeStoredDocument) => boolean,
): MergePreviewWarning[] {
  const warnings: MergePreviewWarning[] = [];
  const excluded = (d: MergeStoredDocument): boolean =>
    facts.excludedFromCompile.has(d.resourceId);
  if (excluded(target) && absorbed.some((d) => !excluded(d)))
    warnings.push({
      kind: "target-excluded-from-compile",
      message: MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
    });
  if (inInbox(target) && absorbed.some((d) => !inInbox(d)))
    warnings.push({
      kind: "target-in-inbox",
      message: MERGE_TARGET_IN_INBOX_WARNING,
    });
  return warnings;
}

function buildPreview(
  stored: readonly MergeStoredDocument[],
  facts: ProjectFacts,
): MergePreviewResult {
  const subtree = computeInboxSubtree(
    [...facts.folders.values()].map(
      (f): InboxFolderNode => ({ id: f.id, parentId: f.parentId }),
    ),
    facts.inboxFolderId,
  );
  if (!subtree.ok) return failed("inbox-unreadable");
  const inInbox = (d: MergeStoredDocument): boolean =>
    isInInbox(subtree.subtree, {
      id: d.resourceId,
      type: "text",
      folderId: storedFolderId(d.sidecar),
    });

  const ordered = appendOrder(stored, facts);
  if (!ordered.ok) return failed(ordered.cause);
  const target = describeDocument(stored[0], facts);
  if (!target.ok) return failed(target.cause);
  const absorbed: MergePreviewAbsorbed[] = [];
  for (const doc of ordered.value) {
    const described = describeDocument(doc, facts);
    if (!described.ok) return failed(described.cause);
    absorbed.push({
      ...described.value,
      rules: Object.values(MERGED_RULE_TEXTS),
    });
  }

  const forAnnotations: MergeAnnotationAbsorbed[] = [];
  const sources: {
    documentId: string;
    userMetadata: Record<string, MetadataValue>;
  }[] = [];
  for (const doc of ordered.value) {
    const annotations = storedAnnotations(doc.sidecar);
    if (annotations === null) return failed("annotations-unreadable");
    const userMetadata = storedUserMetadata(doc.sidecar);
    if (userMetadata === null) return failed("metadata-unreadable");
    forAnnotations.push({
      documentId: doc.resourceId,
      document: doc.document,
      annotations,
    });
    sources.push({ documentId: doc.resourceId, userMetadata });
  }

  return {
    outcome: "preview",
    target: target.value,
    absorbed,
    annotations: groupAnnotationsForOffer(forAnnotations),
    metadata: offerMergeMetadataFields(sources),
    warnings: targetWarnings(stored[0], ordered.value, facts, inInbox),
  };
}

/** The distinct revision-content lock keys of a request, ascending. */
function lockKeys(projectRoot: string, request: MergePreviewRequest): string[] {
  const keys = new Set(
    request.documents.map((d) =>
      revisionContentLockKey(projectRoot, d.resourceId),
    ),
  );
  return [...keys].sort();
}

/**
 * Checks the selection against the stored documents and returns what the
 * dialog shows, under each document's `revision-content` lock (taken in
 * ascending key order, all released before this returns). Writes nothing for
 * any outcome.
 *
 * @throws The locked-access error for a locked or key-less encrypted project;
 *   `InvalidProjectIdCoreError` for a `projectId` that is not a project id;
 *   `SplitLockKeyError` for a project root that is not absolute.
 */
export async function previewMerge(
  projectId: string,
  request: MergePreviewRequest,
): Promise<MergePreviewResult> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const early = precheck(request);
  if (early) return early;

  const releases: Array<() => void> = [];
  let evaluation: MergeEvaluation;
  try {
    for (const key of lockKeys(projectRoot, request))
      releases.push(await acquireLock(key));
    evaluation = await evaluateMergeRequest(projectRoot, request);
  } finally {
    for (const release of releases.reverse()) release();
  }
  if (evaluation.outcome !== "ready") return evaluation;

  const facts = await readProjectFacts(projectRoot);
  if (!facts.ok) return failed(facts.cause);
  return buildPreview(evaluation.documents, facts.value);
}
