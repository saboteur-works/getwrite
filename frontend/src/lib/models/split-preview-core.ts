/**
 * @module split-preview-core
 *
 * The read side of "Split a document at the cursor" (Feature 120, FR-7 server
 * half and FR-12 data): given a cursor, check it against the stored document
 * and return what the split dialog shows. Nothing here writes (a test asserts
 * it for every outcome).
 *
 * Staleness (OQ-1): the client sends the canonical revision id, a hash of the
 * stored text it saw and a plain-text offset. The server reads the stored
 * canonical text and refuses a revision or hash mismatch with the
 * `stale-cursor` reason. {@link hashSplitContent} is the one hash function (defined in
 * `split-content-hash.ts` and re-exported here); the
 * client imports it from that leaf file (SHA-256 in plain TypeScript, because
 * `crypto.subtle` is unavailable over plain HTTP).
 *
 * Two layers:
 * - {@link evaluateSplitRequest} reads and decides, takes no lock and writes
 *   nothing. The apply step (Task 20) calls it while it already holds the
 *   `revision-content` lock, which is not reentrant.
 * - {@link previewSplit} takes that lock around the read and builds the
 *   dialog's data.
 *
 * Failures never read as an empty preview: an unreadable sidecar, revision or
 * `project.json`, or stored content that is not a document, is a `failed`
 * outcome; a locked project rethrows the existing locked-access error.
 *
 * No React, JSX, JSON or `node:*`.
 */
import { DEFAULT_METADATA_SCHEMA } from "./default-metadata-schema";
import { readFile } from "./io";
import { isLockedAccessError } from "./locked-access";
import { acquireLock } from "./locks";
import { PROJECT_FILENAME } from "./project-config";
import { resolveResourceProjectRootOrThrow } from "./resource-crud-core";
import { isResourceId } from "./resource-id";
import { listRevisions } from "./revision";
import { readRevision } from "./revision-core";
import { readSidecar } from "./sidecar";
import { partitionAnnotations } from "./split-annotations";
import { cutDocument, SPLIT_CUT_FAILURES } from "./split-cut";
import { hashSplitContent } from "./split-content-hash";
import { splitEligibility } from "./split-eligibility";
import { defaultSplitDocumentName } from "./split-new-document";
import { SPLIT_REFUSAL_REASONS, type SplitRefusalReason } from "./split-types";
import { tiptapToPlainText } from "../tiptap-utils";
import { countWords } from "../word-count";
import type {
  Annotation,
  MetadataValue,
  Revision,
  TipTapDocument,
} from "./types";

/** A split request's cursor, as the client sends it. */
export interface SplitPreviewRequest {
  resourceId: string;
  /** The canonical revision the client was showing. */
  revisionId: string;
  /** {@link hashSplitContent} of the stored text the client saw. */
  contentHash: string;
  /** Plain-text offset of the cursor (`tiptapToPlainText` units). */
  offset: number;
}

/** The kind of an annotation, for grouping in the dialog. */
export type SplitAnnotationKind = "note" | "citation" | "claim";

/** One annotation as the dialog lists it. */
export interface SplitPreviewAnnotation {
  id: string;
  body: string;
  kind: SplitAnnotationKind;
}

/** One metadata field the writer may carry to the new document. */
export interface SplitPreviewField {
  key: string;
  label: string;
  /** Whether the original holds a value for it. */
  hasValue: boolean;
}

/** Result of {@link previewSplit}; the outcomes never share a value. */
export type SplitPreviewResult =
  | {
      outcome: "preview";
      revisionId: string;
      contentHash: string;
      offset: number;
      documentName: string;
      defaultNewName: string;
      firstHalfWords: number;
      secondHalfWords: number;
      /** Anchored in the moving text; carried only if chosen. */
      anchored: {
        notes: SplitPreviewAnnotation[];
        citations: SplitPreviewAnnotation[];
        claims: SplitPreviewAnnotation[];
      };
      /** Stay with the original because the passage spans the cursor. */
      spanning: SplitPreviewAnnotation[];
      fields: SplitPreviewField[];
    }
  | { outcome: "refused"; reason: SplitRefusalReason }
  | { outcome: "failed"; cause: string };

/** What {@link evaluateSplitRequest} hands to the apply step. */
export type SplitEvaluation =
  | {
      outcome: "ready";
      revision: Revision;
      /** The stored canonical text, exactly as read. */
      content: string;
      document: TipTapDocument;
      sidecar: Record<string, MetadataValue>;
      cut: {
        first: TipTapDocument;
        second: TipTapDocument;
        cutPosition: number;
      };
    }
  | { outcome: "refused"; reason: SplitRefusalReason }
  | { outcome: "failed"; cause: string };

/** The project root is not absolute, so the revision lock key cannot match the one revision-core takes. */
export class SplitLockKeyError extends Error {
  constructor() {
    super("The project root is not an absolute path.");
    this.name = "SplitLockKeyError";
  }
}

// --- hash: the one function lives in split-content-hash.ts ---------------

export { hashSplitContent };

// --- lock key -----------------------------------------------------------

function isAbsoluteRoot(root: string): boolean {
  return /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(root);
}

/**
 * The key of the per-resource `revision-content` lock, as `revision-core.ts`
 * builds it (`revision-content:<resolved root>:<id>`). `path.resolve` leaves
 * an absolute normalised root unchanged, which is what the project-root
 * resolver returns, so a trailing separator is the only difference removed
 * here. A root that is not absolute throws {@link SplitLockKeyError}: a
 * guessed key would silently fail to exclude a concurrent save.
 */
export function revisionContentLockKey(
  projectRoot: string,
  resourceId: string,
): string {
  if (!isAbsoluteRoot(projectRoot)) throw new SplitLockKeyError();
  const trimmed = projectRoot.replace(/[\\/]+$/, "");
  const root = trimmed === "" ? projectRoot : trimmed;
  return `revision-content:${root}:${resourceId}`;
}

// --- evaluation ---------------------------------------------------------

function refused(reason: SplitRefusalReason): SplitEvaluation {
  return { outcome: "refused", reason };
}

function failed(cause: string): { outcome: "failed"; cause: string } {
  return { outcome: "failed", cause };
}

function isDocument(value: unknown): value is TipTapDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  );
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

const STALE_CUT_REASONS: ReadonlySet<string> = new Set([
  SPLIT_CUT_FAILURES.offsetOutOfRange,
]);

function cutRefusal(reason: string): SplitEvaluation {
  if (STALE_CUT_REASONS.has(reason))
    return refused(SPLIT_REFUSAL_REASONS.staleCursor);
  const known = Object.values(SPLIT_REFUSAL_REASONS) as string[];
  if (known.includes(reason)) return refused(reason as SplitRefusalReason);
  return failed(`cut-${reason}`);
}

/**
 * Reads the stored document and decides whether the request can be applied:
 * a kind refusal, a stale cursor, an eligibility refusal, or the cut. Takes
 * no lock and writes nothing, so the apply step can call it inside its own
 * `revision-content` lock.
 *
 * @throws The locked-access error for a locked or key-less encrypted project.
 */
export async function evaluateSplitRequest(
  projectRoot: string,
  request: SplitPreviewRequest,
): Promise<SplitEvaluation> {
  if (!isResourceId(request.resourceId)) return failed("invalid-resource-id");
  const side = await guarded("sidecar-unreadable", () =>
    readSidecar(projectRoot, request.resourceId),
  );
  if (!side.ok) return failed(side.cause);
  if (side.value === null) return failed("resource-not-found");
  const sidecar = side.value;

  // Kind refusals need no revision (a Source or an image has none to hash).
  const kind = splitEligibility({
    document: null,
    sidecar,
    offset: request.offset,
  });
  if (!kind.eligible && kind.reason !== SPLIT_REFUSAL_REASONS.staleCursor)
    return refused(kind.reason);

  const listed = await guarded("revisions-unreadable", () =>
    listRevisions(projectRoot, request.resourceId),
  );
  if (!listed.ok) return failed(listed.cause);
  const canonical = listed.value.find((r) => r.isCanonical);
  if (!canonical) return failed("no-canonical-revision");
  if (canonical.id !== request.revisionId)
    return refused(SPLIT_REFUSAL_REASONS.staleCursor);

  const read = await guarded("content-unreadable", () =>
    readRevision(projectRoot, request.resourceId, canonical.id),
  );
  if (!read.ok) return failed(read.cause);
  const { revision, content } = read.value;
  if (hashSplitContent(content) !== request.contentHash)
    return refused(SPLIT_REFUSAL_REASONS.staleCursor);

  let document: unknown;
  try {
    document = JSON.parse(content);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return failed("content-not-a-document");
  }
  if (!isDocument(document)) return failed("content-not-a-document");

  const eligibility = splitEligibility({
    document,
    sidecar,
    offset: request.offset,
  });
  if (!eligibility.eligible) return refused(eligibility.reason);

  const cut = cutDocument(document, request.offset);
  if (cut.outcome === "failed") return cutRefusal(cut.reason);
  return {
    outcome: "ready",
    revision,
    content,
    document,
    sidecar,
    cut: { first: cut.first, second: cut.second, cutPosition: cut.cutPosition },
  };
}

// --- preview ------------------------------------------------------------

function annotationKind(annotation: Annotation): SplitAnnotationKind {
  if (annotation.claim !== undefined) return "claim";
  if (annotation.target !== undefined) return "citation";
  return "note";
}

function storedAnnotations(
  sidecar: Record<string, MetadataValue>,
): Annotation[] | null {
  const stored: unknown = sidecar.annotations;
  if (stored === undefined) return [];
  if (!Array.isArray(stored)) return null;
  const isValid = stored.every(
    (a) =>
      typeof a === "object" &&
      a !== null &&
      typeof (a as { id?: unknown }).id === "string" &&
      typeof (a as { body?: unknown }).body === "string",
  );
  return isValid ? (stored as unknown as Annotation[]) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface SchemaFieldRef {
  key: string;
  label: string;
}

function fieldsOf(schema: unknown): SchemaFieldRef[] {
  if (!isRecord(schema) || !Array.isArray(schema.groups)) return [];
  const out: SchemaFieldRef[] = [];
  for (const group of schema.groups as unknown[]) {
    if (!isRecord(group) || !Array.isArray(group.fields)) continue;
    for (const field of group.fields as unknown[]) {
      if (
        isRecord(field) &&
        typeof field.key === "string" &&
        typeof field.label === "string"
      )
        out.push({ key: field.key, label: field.label });
    }
  }
  return out;
}

const hasStoredValue = (value: unknown): boolean =>
  value !== undefined &&
  value !== null &&
  value !== "" &&
  !(Array.isArray(value) && value.length === 0);

/** Read-only: the fields the dialog offers, from the stored schema (no migration write). */
async function readCarryOverFields(
  projectRoot: string,
  sidecar: Record<string, MetadataValue>,
): Promise<Read<SplitPreviewField[]>> {
  const raw = await guarded("project-unreadable", () =>
    readFile(`${projectRoot}/${PROJECT_FILENAME}`, "utf8"),
  );
  if (!raw.ok) return raw;
  let project: unknown;
  try {
    project = JSON.parse(raw.value);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return { ok: false, cause: "project-unreadable" };
  }
  const config = isRecord(project) ? project.config : undefined;
  const stored = isRecord(config) ? fieldsOf(config.metadataSchema) : [];
  const refs = [...stored];
  const listed = new Set(refs.map((f) => f.key));
  for (const field of fieldsOf(DEFAULT_METADATA_SCHEMA)) {
    if (!listed.has(field.key)) refs.push(field);
    listed.add(field.key);
  }
  const meta: unknown = sidecar.userMetadata;
  const values = isRecord(meta) ? meta : {};
  for (const key of Object.keys(values)) {
    if (listed.has(key)) continue;
    listed.add(key);
    refs.push({ key, label: key });
  }
  const fields: SplitPreviewField[] = refs.map((f) => ({
    key: f.key,
    label: f.label,
    hasValue: Object.prototype.hasOwnProperty.call(values, f.key)
      ? hasStoredValue(values[f.key])
      : false,
  }));
  if (sidecar.wordCountGoal !== undefined) {
    fields.push({
      key: "wordCountGoal",
      label: "Word count goal",
      hasValue: hasStoredValue(sidecar.wordCountGoal),
    });
  }
  return { ok: true, value: fields };
}

function halfWords(doc: TipTapDocument): number {
  return countWords(tiptapToPlainText(doc));
}

function describe(
  annotations: readonly Annotation[],
  ids: readonly string[],
): SplitPreviewAnnotation[] {
  const byId = new Map(annotations.map((a) => [a.id, a]));
  return ids.flatMap((id) => {
    const a = byId.get(id);
    return a ? [{ id, body: a.body, kind: annotationKind(a) }] : [];
  });
}

/**
 * Checks the cursor against the stored document and returns what the dialog
 * shows, under the document's `revision-content` lock (released before this
 * returns). Writes nothing for any outcome.
 *
 * @throws The locked-access error for a locked or key-less encrypted project;
 *   `InvalidProjectIdCoreError` for a `projectId` that is not a project id;
 *   {@link SplitLockKeyError} for a project root that is not absolute.
 */
export async function previewSplit(
  projectId: string,
  request: SplitPreviewRequest,
): Promise<SplitPreviewResult> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const release = await acquireLock(
    revisionContentLockKey(projectRoot, request.resourceId),
  );
  let evaluation: SplitEvaluation;
  try {
    evaluation = await evaluateSplitRequest(projectRoot, request);
  } finally {
    release();
  }
  if (evaluation.outcome !== "ready") return evaluation;

  const { sidecar, cut } = evaluation;
  const annotations = storedAnnotations(sidecar);
  if (annotations === null) return failed("annotations-unreadable");
  const partition = partitionAnnotations({
    first: cut.first,
    second: cut.second,
    annotations,
    chosenIds: [],
  });
  if (partition.outcome === "failed")
    return failed(`annotations-${partition.reason}`);

  const fields = await readCarryOverFields(projectRoot, sidecar);
  if (!fields.ok) return failed(fields.cause);

  const anchored = describe(annotations, partition.classification.after);
  const name = typeof sidecar.name === "string" ? sidecar.name : "";
  return {
    outcome: "preview",
    revisionId: evaluation.revision.id,
    contentHash: request.contentHash,
    offset: request.offset,
    documentName: name,
    defaultNewName: defaultSplitDocumentName(name),
    firstHalfWords: halfWords(cut.first),
    secondHalfWords: halfWords(cut.second),
    anchored: {
      notes: anchored.filter((a) => a.kind === "note"),
      citations: anchored.filter((a) => a.kind === "citation"),
      claims: anchored.filter((a) => a.kind === "claim"),
    },
    spanning: describe(annotations, partition.classification.spanning),
    fields: fields.value,
  };
}
