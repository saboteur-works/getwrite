/**
 * @module api/split
 *
 * Client for "Split a document at the cursor" (Feature 120, FR-14):
 * `POST /api/project/split/preview` and `POST /api/project/split`. Bodies
 * carry `projectId`, the resource id, the canonical revision id, the content
 * hash and the plain-text offset (and, for the split, the carry-over choice);
 * never a path. HTTP only: there is no native backend (the Android build
 * strips `app/api/**`, and the split surfaces are kept out of it by the
 * inline runtime check in Tasks 26 and 27).
 *
 * The request validators here, {@link parseSplitPreviewBody} and
 * {@link parseSplitBody}, are the single definition of a valid body: the
 * client sends only what they accept, and the two routes accept exactly the
 * same. They refuse unknown keys and never echo input.
 *
 * Failure contract (`docs/standards/failure-visibility.md`): both calls
 * resolve a result that tells the outcomes apart by `kind`. A thrown fetch, a
 * non-2xx status, a server-reported failure or a malformed body resolves
 * `failed`, never "no result". For the split, a failure whose effect cannot
 * be known (the request may have reached the server) carries
 * `remainingState: "state-unknown"`. A locked project (HTTP 401 or 409,
 * through `locked-response.ts`) is rethrown as the locked-access error. A
 * malformed body is reported through `reportTransportValidationFailure`,
 * which never receives the body. The server's error text is not shown, so no
 * client input is echoed.
 */
import { z } from "zod";
import { isResourceId } from "../models/resource-id";
import { hashSplitContent } from "../models/split-content-hash";
import {
  describeSplitFailure,
  describeSplitIndexFailure,
  SPLIT_FAILED_REMAINING_STATE_MESSAGES,
  SPLIT_INDEX_STEP_LABELS,
  SPLIT_REFUSAL_MESSAGES,
  type SplitIndexFailureStep,
} from "../models/split-messages";
import {
  SPLIT_REFUSAL_REASONS,
  SPLIT_STEPS,
  type SplitRefusalReason,
  type SplitRemainingState,
  type SplitStep,
} from "../models/split-types";
import type {
  SplitApplyRequest,
  SplitAppliedFields,
  SplitPostCommitFailure,
} from "../models/split-core";
import type {
  SplitPreviewRequest,
  SplitPreviewResult,
} from "../models/split-preview-core";
import { lockedAccessErrorFromResponse } from "./locked-response";
import { reportTransportValidationFailure } from "./transport-validation";

/** The same function object the server checks staleness with. */
export { hashSplitContent };

const PREVIEW_ENDPOINT = "/api/project/split/preview";
const SPLIT_ENDPOINT = "/api/project/split";

/** Bounds of the request boundary (an assumption of this task; the cores set none of their own). */
export const SPLIT_REQUEST_LIMITS = {
  newNameMaxLength: 1000,
  idMaxLength: 200,
  maxAnnotationIds: 5000,
  maxFields: 500,
} as const;

/** The one refusal text for a malformed id or body; it names nothing the client sent. */
export const SPLIT_INVALID_REQUEST_MESSAGE =
  "The split request was not valid, so nothing was sent.";
/** Fixed text when the preview could not be loaded. */
export const SPLIT_TRANSPORT_FAILED_MESSAGE =
  "The split preview could not be loaded. Nothing was changed.";
/** Fixed text when a split request failed in a way that leaves its effect unknown. */
export const SPLIT_TRANSPORT_STATE_UNKNOWN_MESSAGE = `The split request did not complete. ${SPLIT_FAILED_REMAINING_STATE_MESSAGES["state-unknown"]}`;

// --- request validation -------------------------------------------------

const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_ID_PATTERN = /^v-[0-9]{1,9}$/;

/** Outcome of a body validator; carries no input on failure. */
export type SplitBodyParse<T> = { ok: true; value: T } | { ok: false };

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
    value.every((v) => isBoundedString(v, SPLIT_REQUEST_LIMITS.idMaxLength))
  );
}

function parseCursor(
  body: Record<string, unknown>,
): SplitPreviewRequest | null {
  const { resourceId, revisionId, contentHash, offset } = body;
  if (!isResourceId(resourceId)) return null;
  if (typeof revisionId !== "string" || !REVISION_ID_PATTERN.test(revisionId))
    return null;
  if (
    typeof contentHash !== "string" ||
    !CONTENT_HASH_PATTERN.test(contentHash)
  )
    return null;
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0)
    return null;
  return { resourceId, revisionId, contentHash, offset };
}

const CURSOR_KEYS = [
  "projectId",
  "resourceId",
  "revisionId",
  "contentHash",
  "offset",
] as const;

/** A validated preview body: the project id and the cursor, nothing else. */
export interface SplitPreviewBody {
  projectId: string;
  request: SplitPreviewRequest;
}

/** A validated split body: the project id, the cursor and the carry-over. */
export interface SplitBody {
  projectId: string;
  request: SplitApplyRequest;
}

/** Validates a preview body; only the five known fields can pass. */
export function parseSplitPreviewBody(
  body: unknown,
): SplitBodyParse<SplitPreviewBody> {
  if (!isRecord(body) || !hasOnlyKeys(body, CURSOR_KEYS)) return { ok: false };
  if (!isResourceId(body.projectId)) return { ok: false };
  const request = parseCursor(body);
  if (request === null) return { ok: false };
  return { ok: true, value: { projectId: body.projectId, request } };
}

/** Validates a split body; only the known fields and carry-over keys can pass. */
export function parseSplitBody(body: unknown): SplitBodyParse<SplitBody> {
  if (!isRecord(body) || !hasOnlyKeys(body, [...CURSOR_KEYS, "carryOver"]))
    return { ok: false };
  if (!isResourceId(body.projectId)) return { ok: false };
  const request = parseCursor(body);
  const carry = body.carryOver;
  if (request === null || !isRecord(carry)) return { ok: false };
  if (!hasOnlyKeys(carry, ["annotationIds", "fields", "newName"]))
    return { ok: false };
  const { annotationIds, fields, newName } = carry;
  if (
    !isStringList(annotationIds, SPLIT_REQUEST_LIMITS.maxAnnotationIds) ||
    !isStringList(fields, SPLIT_REQUEST_LIMITS.maxFields) ||
    !isBoundedString(newName, SPLIT_REQUEST_LIMITS.newNameMaxLength)
  )
    return { ok: false };
  return {
    ok: true,
    value: {
      projectId: body.projectId,
      request: { ...request, carryOver: { annotationIds, fields, newName } },
    },
  };
}

/** Copies only the known cursor fields, so an extra key on the caller's object is never sent. */
function pickCursor(request: SplitPreviewRequest): Record<string, unknown> {
  return {
    resourceId: request.resourceId,
    revisionId: request.revisionId,
    contentHash: request.contentHash,
    offset: request.offset,
  };
}

/** Copies only the known carry-over fields; a missing object stays missing and fails validation. */
function pickCarryOver(carry: unknown): unknown {
  if (!isRecord(carry)) return carry;
  return {
    annotationIds: carry.annotationIds,
    fields: carry.fields,
    newName: carry.newName,
  };
}

// --- response schemas ---------------------------------------------------

const REFUSAL_REASONS: readonly string[] = Object.values(SPLIT_REFUSAL_REASONS);

const ReasonSchema = z.custom<SplitRefusalReason>(
  (v) => typeof v === "string" && REFUSAL_REASONS.includes(v),
);
const RemainingStateSchema = z.custom<SplitRemainingState>(
  (v) =>
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(
      SPLIT_FAILED_REMAINING_STATE_MESSAGES,
      v,
    ),
);
const IndexStepSchema = z.custom<SplitIndexFailureStep>(
  (v) =>
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(SPLIT_INDEX_STEP_LABELS, v),
);

const AnnotationSchema = z.object({
  id: z.string(),
  body: z.string(),
  kind: z.enum(["note", "citation", "claim"]),
});

const PreviewBodySchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("preview"),
    revisionId: z.string(),
    contentHash: z.string(),
    offset: z.number(),
    documentName: z.string(),
    defaultNewName: z.string(),
    firstHalfWords: z.number(),
    secondHalfWords: z.number(),
    anchored: z.object({
      notes: z.array(AnnotationSchema),
      citations: z.array(AnnotationSchema),
      claims: z.array(AnnotationSchema),
    }),
    spanning: z.array(AnnotationSchema),
    fields: z.array(
      z.object({ key: z.string(), label: z.string(), hasValue: z.boolean() }),
    ),
  }),
  z.object({ outcome: z.literal("refused"), reason: ReasonSchema }),
  z.object({ outcome: z.literal("failed"), cause: z.string() }),
]);

const AppliedFieldsShape = {
  newDocumentId: z.string(),
  notices: z.array(z.string()),
  snapshotRevisionId: z.string(),
  snapshotRevisionNumber: z.number(),
};

const SplitBodySchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("applied"), ...AppliedFieldsShape }),
  z.object({
    outcome: z.literal("index-failed"),
    ...AppliedFieldsShape,
    failures: z.array(
      z.object({ documentId: z.string(), step: IndexStepSchema }),
    ),
    message: z.string(),
  }),
  z.object({ outcome: z.literal("refused"), reason: ReasonSchema }),
  z.object({
    outcome: z.literal("failed"),
    failedStep: z.enum(SPLIT_STEPS),
    remainingState: RemainingStateSchema,
    cause: z.string(),
  }),
]);

// --- results ------------------------------------------------------------

/** The dialog's data for a cursor the server accepted. */
export type SplitPreviewData = Extract<
  SplitPreviewResult,
  { outcome: "preview" }
>;

/** Outcome of {@link requestSplitPreview}; the kinds never share a value. */
export type SplitPreviewClientResult =
  | { kind: "preview"; preview: SplitPreviewData }
  | { kind: "stale"; message: string }
  | { kind: "refused"; reason: SplitRefusalReason; message: string }
  | { kind: "failed"; message: string };

/** Outcome of {@link requestSplit}; the kinds never share a value. */
export type SplitClientResult =
  | ({ kind: "applied" } & SplitAppliedFields)
  | ({
      kind: "index-failed";
      failures: SplitPostCommitFailure[];
      message: string;
    } & SplitAppliedFields)
  | { kind: "stale"; message: string }
  | { kind: "refused"; reason: SplitRefusalReason; message: string }
  | {
      kind: "failed";
      /** The step the split stopped at; null when no step ran or it is unknown. */
      failedStep: SplitStep | null;
      remainingState: SplitRemainingState;
      message: string;
    };

function refusalResult(
  reason: SplitRefusalReason,
): Extract<SplitClientResult, { kind: "stale" | "refused" }> {
  const message = SPLIT_REFUSAL_MESSAGES[reason];
  return reason === SPLIT_REFUSAL_REASONS.staleCursor
    ? { kind: "stale", message }
    : { kind: "refused", reason, message };
}

function previewFailed(message: string): SplitPreviewClientResult {
  return { kind: "failed", message };
}

function splitFailed(
  remainingState: SplitRemainingState,
  message: string,
  failedStep: SplitStep | null = null,
): SplitClientResult {
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
 * Asks the server whether the cursor still matches the stored document and
 * what the dialog shows. Writes nothing.
 *
 * @throws The locked-access error when the project is locked.
 */
export async function requestSplitPreview(
  projectId: string,
  request: SplitPreviewRequest,
): Promise<SplitPreviewClientResult> {
  const checked = parseSplitPreviewBody({ projectId, ...pickCursor(request) });
  if (!checked.ok) return previewFailed(SPLIT_INVALID_REQUEST_MESSAGE);
  const sent = await post(
    PREVIEW_ENDPOINT,
    { projectId: checked.value.projectId, ...checked.value.request },
    projectId,
  );
  if (!sent.ok) return previewFailed(SPLIT_TRANSPORT_FAILED_MESSAGE);
  const parsed = PreviewBodySchema.safeParse(sent.json);
  if (!parsed.success) {
    reportTransportValidationFailure(
      "split.requestSplitPreview",
      parsed.error.issues,
    );
    return previewFailed(SPLIT_TRANSPORT_FAILED_MESSAGE);
  }
  const data = parsed.data;
  if (data.outcome === "preview") return { kind: "preview", preview: data };
  if (data.outcome === "refused") return refusalResult(data.reason);
  return previewFailed(SPLIT_TRANSPORT_FAILED_MESSAGE);
}

/**
 * Applies a split. The result says what happened and, for a failure, the
 * state that remains; a thrown fetch or a non-ok response is a failure with
 * an unknown state, never "no result".
 *
 * @throws The locked-access error when the project is locked.
 */
export async function requestSplit(
  projectId: string,
  request: SplitApplyRequest,
): Promise<SplitClientResult> {
  const checked = parseSplitBody({
    projectId,
    ...pickCursor(request),
    carryOver: pickCarryOver(request.carryOver),
  });
  if (!checked.ok)
    return splitFailed("original-restored", SPLIT_INVALID_REQUEST_MESSAGE);
  const sent = await post(
    SPLIT_ENDPOINT,
    { projectId: checked.value.projectId, ...checked.value.request },
    projectId,
  );
  if (!sent.ok)
    return splitFailed("state-unknown", SPLIT_TRANSPORT_STATE_UNKNOWN_MESSAGE);
  const parsed = SplitBodySchema.safeParse(sent.json);
  if (!parsed.success) {
    reportTransportValidationFailure("split.requestSplit", parsed.error.issues);
    return splitFailed("state-unknown", SPLIT_TRANSPORT_STATE_UNKNOWN_MESSAGE);
  }
  const data = parsed.data;
  switch (data.outcome) {
    case "applied":
      return {
        kind: "applied",
        newDocumentId: data.newDocumentId,
        notices: data.notices,
        snapshotRevisionId: data.snapshotRevisionId,
        snapshotRevisionNumber: data.snapshotRevisionNumber,
      };
    case "index-failed":
      return {
        kind: "index-failed",
        newDocumentId: data.newDocumentId,
        notices: data.notices,
        snapshotRevisionId: data.snapshotRevisionId,
        snapshotRevisionNumber: data.snapshotRevisionNumber,
        failures: data.failures,
        message: describeSplitIndexFailure(data.failures.map((f) => f.step)),
      };
    case "refused":
      return refusalResult(data.reason);
    case "failed":
      return splitFailed(
        data.remainingState,
        describeSplitFailure(data.failedStep, data.remainingState),
        data.failedStep,
      );
  }
}
