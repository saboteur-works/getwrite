/**
 * @module api/merge
 *
 * Client for "Merge documents" (Feature 121, FR-15):
 * `POST /api/project/merge/preview` and `POST /api/project/merge`. Bodies
 * carry `projectId`, the selected documents (resource id, canonical revision
 * id, content hash) and, for the merge, the carry-over choice; never a path.
 * HTTP only: there is no native backend (the Android build strips
 * `app/api/**`, and the merge surfaces are kept out of it by the runtime
 * check of Tasks 34 and 35).
 *
 * The request validators here, {@link parseMergePreviewBody} and
 * {@link parseMergeBody}, are the single definition of a valid body: the
 * client sends only what they accept, and the two routes accept exactly the
 * same. They refuse unknown keys and never echo input. A count over the cap of
 * `MERGE_DOCUMENT_CAP` is valid here (the cores refuse it with the cap text);
 * only an unbounded list is not.
 *
 * Failure contract (`docs/standards/failure-visibility.md`): both calls
 * resolve a result that tells the outcomes apart by `kind`. A thrown fetch, a
 * non-2xx status, a server-reported failure or a malformed body resolves
 * `failed`, never "no result". For the merge, a failure whose effect cannot be
 * known (the request may have reached the server) carries
 * `remainingState: "state-unknown"`. A locked project (HTTP 401 or 409,
 * through `locked-response.ts`) is rethrown as the locked-access error. A
 * malformed body is reported through `reportTransportValidationFailure`, which
 * never receives the body. The server's own message text is not shown: the
 * texts are the constants of `merge-messages.ts`, chosen by the outcome's
 * closed codes, so no client input is echoed.
 */
import { z } from "zod";
import { isResourceId } from "../models/resource-id";
import { MERGE_DOCUMENT_CAP } from "../models/merge-limits";
import {
  describeMergeAnnotationLimit,
  describeMergeDocumentCap,
  describeMergeFailure,
  describeMergeIndexFailure,
  MERGE_ANNOTATION_LIMIT_MESSAGE,
  MERGE_FAILED_REMAINING_STATE_MESSAGES,
  MERGE_INDEX_STEP_LABELS,
  MERGE_REFUSAL_MESSAGES,
} from "../models/merge-messages";
import {
  MERGE_REFUSAL_REASONS,
  MERGE_STEPS,
  type MergeAnnotationLimitCounts,
  type MergeCarryOverChoice,
  type MergeRefusalReason,
  type MergeRemainingState,
  type MergeStep,
} from "../models/merge-types";
import type {
  MergeApplyRequest,
  MergeIndexFailedResult,
} from "../models/merge-core";
import type {
  MergePreviewRequest,
  MergePreviewResult,
} from "../models/merge-preview-core";
import type { SplitIndexStep } from "../models/split-index-update";
import type { MetadataValue } from "../models/types";
import { lockedAccessErrorFromResponse } from "./locked-response";
import { reportTransportValidationFailure } from "./transport-validation";

const PREVIEW_ENDPOINT = "/api/project/merge/preview";
const MERGE_ENDPOINT = "/api/project/merge";

/** Bounds of the request boundary (the cores set none of their own). */
export const MERGE_REQUEST_LIMITS = {
  /** A list longer than this is malformed; one over the cap but within it is refused by the core. */
  maxDocuments: 1000,
  idMaxLength: 200,
  maxAnnotationIds: 5000,
  maxFields: 500,
} as const;

/** The one refusal text for a malformed id or body; it names nothing the client sent. */
export const MERGE_INVALID_REQUEST_MESSAGE =
  "The merge request was not valid, so nothing was sent.";
/** Fixed text when the preview could not be loaded. */
export const MERGE_TRANSPORT_FAILED_MESSAGE =
  "The merge preview could not be loaded. Nothing was changed.";
/** Fixed text when a merge request failed in a way that leaves its effect unknown. */
export const MERGE_TRANSPORT_STATE_UNKNOWN_MESSAGE = `The merge request did not complete. ${MERGE_FAILED_REMAINING_STATE_MESSAGES["state-unknown"]}`;

// --- request validation -------------------------------------------------

const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Outcome of a body validator; carries no input on failure. */
export type MergeBodyParse<T> = { ok: true; value: T } | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((k) => keys.includes(k));
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function isStringList(value: unknown, maxItems: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((v) => isBoundedString(v, MERGE_REQUEST_LIMITS.idMaxLength))
  );
}

function parseDocumentRef(
  value: unknown,
): MergePreviewRequest["documents"][number] | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["resourceId", "revisionId", "contentHash"])
  )
    return null;
  const { resourceId, revisionId, contentHash } = value;
  if (!isResourceId(resourceId)) return null;
  // A revision id is a generated UUID (`v-1` is only the folder name).
  if (!isResourceId(revisionId)) return null;
  if (
    typeof contentHash !== "string" ||
    !CONTENT_HASH_PATTERN.test(contentHash)
  )
    return null;
  return { resourceId, revisionId, contentHash };
}

function parseDocuments(value: unknown): MergePreviewRequest | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MERGE_REQUEST_LIMITS.maxDocuments
  )
    return null;
  const documents: MergePreviewRequest["documents"] = [];
  for (const item of value) {
    const ref = parseDocumentRef(item);
    if (ref === null) return null;
    documents.push(ref);
  }
  return { documents };
}

function parseFieldChoice(
  value: unknown,
): MergeCarryOverChoice["fields"][number] | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["field", "sourceDocumentId"]))
    return null;
  const { field, sourceDocumentId } = value;
  if (!isBoundedString(field, MERGE_REQUEST_LIMITS.idMaxLength)) return null;
  if (sourceDocumentId !== null && !isResourceId(sourceDocumentId)) return null;
  return { field, sourceDocumentId };
}

function parseCarryOver(value: unknown): MergeCarryOverChoice | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["annotationIds", "fields", "unitedMultiselectFields"])
  )
    return null;
  const { annotationIds, fields, unitedMultiselectFields } = value;
  if (
    !isStringList(annotationIds, MERGE_REQUEST_LIMITS.maxAnnotationIds) ||
    !isStringList(unitedMultiselectFields, MERGE_REQUEST_LIMITS.maxFields) ||
    !Array.isArray(fields) ||
    fields.length > MERGE_REQUEST_LIMITS.maxFields
  )
    return null;
  const choices: MergeCarryOverChoice["fields"] = [];
  for (const item of fields) {
    const choice = parseFieldChoice(item);
    if (choice === null) return null;
    choices.push(choice);
  }
  return { annotationIds, fields: choices, unitedMultiselectFields };
}

/** A validated preview body: the project id and the documents, nothing else. */
export interface MergePreviewBody {
  projectId: string;
  request: MergePreviewRequest;
}

/** A validated merge body: the project id, the documents and the carry-over. */
export interface MergeBody {
  projectId: string;
  request: MergeApplyRequest;
}

/** Validates a preview body; only `projectId` and `documents` can pass. */
export function parseMergePreviewBody(
  body: unknown,
): MergeBodyParse<MergePreviewBody> {
  if (!isRecord(body) || !hasOnlyKeys(body, ["projectId", "documents"]))
    return { ok: false };
  if (!isResourceId(body.projectId)) return { ok: false };
  const request = parseDocuments(body.documents);
  if (request === null) return { ok: false };
  return { ok: true, value: { projectId: body.projectId, request } };
}

/** Validates a merge body; only the known fields and carry-over keys can pass. */
export function parseMergeBody(body: unknown): MergeBodyParse<MergeBody> {
  if (
    !isRecord(body) ||
    !hasOnlyKeys(body, ["projectId", "documents", "carryOver"])
  )
    return { ok: false };
  if (!isResourceId(body.projectId)) return { ok: false };
  const request = parseDocuments(body.documents);
  const carryOver = parseCarryOver(body.carryOver);
  if (request === null || carryOver === null) return { ok: false };
  return {
    ok: true,
    value: { projectId: body.projectId, request: { ...request, carryOver } },
  };
}

/** Copies only the known fields of each document, so an extra key on the caller's object is never sent. */
function pickDocuments(request: MergePreviewRequest): unknown {
  if (!Array.isArray(request.documents)) return request.documents;
  return request.documents.map((d) =>
    isRecord(d)
      ? {
          resourceId: d.resourceId,
          revisionId: d.revisionId,
          contentHash: d.contentHash,
        }
      : d,
  );
}

/** Copies only the known carry-over fields; a missing object stays missing and fails validation. */
function pickCarryOver(carry: unknown): unknown {
  if (!isRecord(carry)) return carry;
  return {
    annotationIds: carry.annotationIds,
    fields: Array.isArray(carry.fields)
      ? carry.fields.map((f: unknown) =>
          isRecord(f)
            ? { field: f.field, sourceDocumentId: f.sourceDocumentId }
            : f,
        )
      : carry.fields,
    unitedMultiselectFields: carry.unitedMultiselectFields,
  };
}

// --- response schemas ---------------------------------------------------

const REFUSAL_REASONS: readonly string[] = Object.values(MERGE_REFUSAL_REASONS);

const ReasonSchema = z.custom<MergeRefusalReason>(
  (v) => typeof v === "string" && REFUSAL_REASONS.includes(v),
);
const RemainingStateSchema = z.custom<MergeRemainingState>(
  (v) =>
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(
      MERGE_FAILED_REMAINING_STATE_MESSAGES,
      v,
    ),
);
const IndexStepSchema = z.custom<SplitIndexStep>(
  (v) =>
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(MERGE_INDEX_STEP_LABELS, v),
);

const DocumentSchema = z.object({
  documentId: z.string(),
  name: z.string(),
  folderPath: z.array(z.string()),
  words: z.number(),
});
const OfferSchema = z.object({ id: z.string(), body: z.string() });
const MetadataValueSchema = z.custom<MetadataValue>(() => true);

const PreviewBodySchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("preview"),
    target: DocumentSchema,
    absorbed: z.array(DocumentSchema.extend({ rules: z.array(z.string()) })),
    annotations: z.array(
      z.object({
        documentId: z.string(),
        notes: z.array(OfferSchema),
        citations: z.array(OfferSchema),
        claims: z.array(OfferSchema),
      }),
    ),
    metadata: z.array(
      z.object({
        field: z.string(),
        values: z.array(
          z.object({ documentId: z.string(), value: MetadataValueSchema }),
        ),
      }),
    ),
    warnings: z.array(
      z.object({
        kind: z.enum(["target-excluded-from-compile", "target-in-inbox"]),
        message: z.string(),
      }),
    ),
  }),
  z.object({
    outcome: z.literal("refused"),
    reason: ReasonSchema,
    documentId: z.string().nullable(),
  }),
  z.object({ outcome: z.literal("failed"), cause: z.string() }),
]);

const AppliedFieldsShape = {
  targetDocumentId: z.string(),
  absorbedDocumentIds: z.array(z.string()),
  notices: z.array(z.string()),
};

const MergeBodySchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("applied"), ...AppliedFieldsShape }),
  z.object({
    outcome: z.literal("index-failed"),
    ...AppliedFieldsShape,
    failures: z.array(
      z.object({ documentId: z.string(), step: IndexStepSchema }),
    ),
  }),
  z.object({
    outcome: z.literal("refused"),
    reason: ReasonSchema,
    documentId: z.string().nullable(),
    annotationCounts: z
      .object({ existing: z.number(), incoming: z.number(), limit: z.number() })
      .optional(),
  }),
  z.object({
    outcome: z.literal("failed"),
    failedStep: z.enum(MERGE_STEPS),
    remainingState: RemainingStateSchema,
    cause: z.string(),
  }),
]);

// --- results ------------------------------------------------------------

/** The dialog's data for a selection the server accepted. */
export type MergePreviewData = Extract<
  MergePreviewResult,
  { outcome: "preview" }
>;

/** Outcome of {@link requestMergePreview}; the kinds never share a value. */
export type MergePreviewClientResult =
  | { kind: "preview"; preview: MergePreviewData }
  | { kind: "stale"; documentId: string | null; message: string }
  | {
      kind: "refused";
      reason: MergeRefusalReason;
      documentId: string | null;
      message: string;
    }
  | { kind: "failed"; message: string };

/** Outcome of {@link requestMerge}; the kinds never share a value. */
export type MergeClientResult =
  | {
      kind: "applied";
      targetDocumentId: string;
      absorbedDocumentIds: string[];
      notices: string[];
    }
  | {
      kind: "index-failed";
      targetDocumentId: string;
      absorbedDocumentIds: string[];
      notices: string[];
      failures: MergeIndexFailedResult["failures"];
      message: string;
    }
  | { kind: "stale"; documentId: string | null; message: string }
  | {
      kind: "annotation-limit";
      counts: MergeAnnotationLimitCounts | null;
      message: string;
    }
  | {
      kind: "refused";
      reason: MergeRefusalReason;
      documentId: string | null;
      message: string;
    }
  | {
      kind: "failed";
      /** The step the merge stopped at; null when no step ran or it is unknown. */
      failedStep: MergeStep | null;
      remainingState: MergeRemainingState;
      message: string;
    };

/** The writer-facing text of a refusal; the cap text names the cap constant. */
function refusalMessage(reason: MergeRefusalReason): string {
  return reason === MERGE_REFUSAL_REASONS.tooManyDocuments
    ? describeMergeDocumentCap(MERGE_DOCUMENT_CAP)
    : MERGE_REFUSAL_MESSAGES[reason];
}

function previewFailed(message: string): MergePreviewClientResult {
  return { kind: "failed", message };
}

function mergeFailed(
  remainingState: MergeRemainingState,
  message: string,
  failedStep: MergeStep | null = null,
): MergeClientResult {
  return { kind: "failed", failedStep, remainingState, message };
}

/** Reads a response body as JSON; `undefined` when it is not JSON. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

async function post(
  endpoint: string,
  body: unknown,
  projectId: string,
): Promise<{ ok: true; json: unknown } | { ok: false }> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false };
  }
  if (!response.ok) {
    const locked = lockedAccessErrorFromResponse(response, projectId);
    if (locked) throw locked;
    return { ok: false };
  }
  return { ok: true, json: await readJson(response) };
}

/**
 * Asks the server whether the selection still matches the stored documents and
 * what the dialog shows. Writes nothing.
 *
 * @throws The locked-access error when the project is locked.
 */
export async function requestMergePreview(
  projectId: string,
  request: MergePreviewRequest,
): Promise<MergePreviewClientResult> {
  const checked = parseMergePreviewBody({
    projectId,
    documents: pickDocuments(request),
  });
  if (!checked.ok) return previewFailed(MERGE_INVALID_REQUEST_MESSAGE);
  const sent = await post(
    PREVIEW_ENDPOINT,
    { projectId: checked.value.projectId, ...checked.value.request },
    projectId,
  );
  if (!sent.ok) return previewFailed(MERGE_TRANSPORT_FAILED_MESSAGE);
  const parsed = PreviewBodySchema.safeParse(sent.json);
  if (!parsed.success) {
    reportTransportValidationFailure(
      "merge.requestMergePreview",
      parsed.error.issues,
    );
    return previewFailed(MERGE_TRANSPORT_FAILED_MESSAGE);
  }
  const data = parsed.data;
  if (data.outcome === "preview") return { kind: "preview", preview: data };
  if (data.outcome === "refused") {
    const message = refusalMessage(data.reason);
    return data.reason === MERGE_REFUSAL_REASONS.staleContent
      ? { kind: "stale", documentId: data.documentId, message }
      : {
          kind: "refused",
          reason: data.reason,
          documentId: data.documentId,
          message,
        };
  }
  return previewFailed(MERGE_TRANSPORT_FAILED_MESSAGE);
}

/**
 * Applies a merge. The result says what happened and, for a failure, the state
 * that remains; a thrown fetch or a non-ok response is a failure with an
 * unknown state, never "no result".
 *
 * @throws The locked-access error when the project is locked.
 */
export async function requestMerge(
  projectId: string,
  request: MergeApplyRequest,
): Promise<MergeClientResult> {
  const checked = parseMergeBody({
    projectId,
    documents: pickDocuments(request),
    carryOver: pickCarryOver(request.carryOver),
  });
  if (!checked.ok)
    return mergeFailed("documents-restored", MERGE_INVALID_REQUEST_MESSAGE);
  const sent = await post(
    MERGE_ENDPOINT,
    { projectId: checked.value.projectId, ...checked.value.request },
    projectId,
  );
  if (!sent.ok)
    return mergeFailed("state-unknown", MERGE_TRANSPORT_STATE_UNKNOWN_MESSAGE);
  const parsed = MergeBodySchema.safeParse(sent.json);
  if (!parsed.success) {
    reportTransportValidationFailure("merge.requestMerge", parsed.error.issues);
    return mergeFailed("state-unknown", MERGE_TRANSPORT_STATE_UNKNOWN_MESSAGE);
  }
  const data = parsed.data;
  switch (data.outcome) {
    case "applied":
      return {
        kind: "applied",
        targetDocumentId: data.targetDocumentId,
        absorbedDocumentIds: data.absorbedDocumentIds,
        notices: data.notices,
      };
    case "index-failed":
      return {
        kind: "index-failed",
        targetDocumentId: data.targetDocumentId,
        absorbedDocumentIds: data.absorbedDocumentIds,
        notices: data.notices,
        failures: data.failures,
        message: describeMergeIndexFailure(data.failures.map((f) => f.step)),
      };
    case "refused":
      return refusedResult(data);
    case "failed":
      return mergeFailed(
        data.remainingState,
        describeMergeFailure(data.failedStep, data.remainingState),
        data.failedStep,
      );
  }
}

function refusedResult(data: {
  reason: MergeRefusalReason;
  documentId: string | null;
  annotationCounts?: MergeAnnotationLimitCounts;
}): MergeClientResult {
  if (data.reason === MERGE_REFUSAL_REASONS.annotationLimit) {
    const counts = data.annotationCounts ?? null;
    return {
      kind: "annotation-limit",
      counts,
      message:
        counts === null
          ? MERGE_ANNOTATION_LIMIT_MESSAGE
          : describeMergeAnnotationLimit(counts),
    };
  }
  const message = refusalMessage(data.reason);
  return data.reason === MERGE_REFUSAL_REASONS.staleContent
    ? { kind: "stale", documentId: data.documentId, message }
    : {
        kind: "refused",
        reason: data.reason,
        documentId: data.documentId,
        message,
      };
}
