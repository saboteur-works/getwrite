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
  SPLIT_UNDO_REFUSAL_MESSAGES,
  SPLIT_UNDO_REFUSAL_REASONS,
  type SplitIndexFailureStep,
  type SplitUndoRefusalReason,
} from "../models/split-messages";
import {
  MERGE_UNDO_REFUSAL_MESSAGES,
  MERGE_UNDO_REFUSAL_REASONS,
  type MergeUndoRefusalReason,
} from "../models/merge-undo-messages";
import type {
  MergeUndoRemainingState,
  MergeUndoStep,
  SplitUndoAppliedFields,
  SplitUndoRemainingState,
  SplitUndoStep,
} from "../models/split-undo-core";
import type { SplitIndexFailure } from "../models/split-index-update";
import {
  SPLIT_OPERATION_KINDS,
  type LatestOperationRecord,
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
const UNDO_ENDPOINT = "/api/project/split/undo";
const LATEST_ENDPOINT = "/api/project/split/latest";

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
  // A revision id is a generated UUID (`v-1` is only the folder name).
  if (!isResourceId(revisionId)) return null;
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

// --- Undo and the latest-operation read (Task 31) ------------------------

/** A validated Undo body: the project id and nothing else. */
export interface SplitUndoBody {
  projectId: string;
}

/** Validates an Undo body; only `projectId` can pass. */
export function parseSplitUndoBody(
  body: unknown,
): SplitBodyParse<SplitUndoBody> {
  if (!isRecord(body) || !hasOnlyKeys(body, ["projectId"]))
    return { ok: false };
  if (!isResourceId(body.projectId)) return { ok: false };
  return { ok: true, value: { projectId: body.projectId } };
}

/** Validates the latest-operation query: exactly one `projectId`, no other parameter. */
export function parseSplitLatestQuery(
  params: URLSearchParams,
): SplitBodyParse<SplitUndoBody> {
  const keys = [...params.keys()];
  if (keys.length !== 1 || keys[0] !== "projectId") return { ok: false };
  const projectId = params.get("projectId");
  if (!isResourceId(projectId)) return { ok: false };
  return { ok: true, value: { projectId } };
}

const UNDO_REMAINING_STATES: Record<SplitUndoRemainingState, true> = {
  "split-restored": true,
  "record-not-restored": true,
  "exclusion-not-restored": true,
  "split-off-in-trash": true,
  "notes-not-restored": true,
  "original-not-restored": true,
  "preserved-revisions-kept": true,
  "state-unknown": true,
};
const UNDO_STEPS: Record<SplitUndoStep, true> = {
  "save-current-text": true,
  "restore-original": true,
  "move-annotations": true,
  "trash-split-off": true,
  "remove-exclusion": true,
  "clear-record": true,
};

function isKeyOf<T extends string>(
  table: Record<T, true>,
  value: unknown,
): value is T {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(table, value)
  );
}

const UndoRemainingStateSchema = z.custom<SplitUndoRemainingState>((v) =>
  isKeyOf(UNDO_REMAINING_STATES, v),
);
/** Undo's index update has no word-count step (`SplitIndexFailure` in `split-index-update.ts`). */
const UndoIndexStepSchema = z.custom<SplitIndexFailure["step"]>(
  (v) =>
    typeof v === "string" &&
    v !== "word-count" &&
    Object.prototype.hasOwnProperty.call(SPLIT_INDEX_STEP_LABELS, v),
);
const UndoStepSchema = z.custom<SplitUndoStep>((v) => isKeyOf(UNDO_STEPS, v));
const UndoRefusalReasonSchema = z.custom<SplitUndoRefusalReason>(
  (v) =>
    typeof v === "string" &&
    (SPLIT_UNDO_REFUSAL_REASONS as readonly string[]).includes(v),
);

const RevisionRefSchema = z.object({
  documentId: z.string(),
  revisionId: z.string(),
  revisionNumber: z.number(),
});

const UndoAppliedShape = {
  originalDocumentId: z.string(),
  splitOffDocumentId: z.string(),
  splitOffState: z.enum(["moved-to-trash", "was-in-trash", "was-purged"]),
  preservedRevisions: z.array(RevisionRefSchema),
  movedAnnotationIds: z.array(z.string()),
};

const UndoBodySchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("applied"), ...UndoAppliedShape }),
  z.object({
    outcome: z.literal("index-failed"),
    ...UndoAppliedShape,
    failures: z.array(
      z.object({ documentId: z.string(), step: UndoIndexStepSchema }),
    ),
  }),
  z.object({ outcome: z.literal("nothing-to-undo") }),
  z.object({ outcome: z.literal("unsupported-operation"), kind: z.string() }),
  z.object({ outcome: z.literal("refused"), reason: UndoRefusalReasonSchema }),
  z.object({ outcome: z.literal("could-not-be-checked"), cause: z.string() }),
  z.object({
    outcome: z.literal("failed"),
    failedStep: UndoStepSchema,
    cause: z.string(),
    remainingState: UndoRemainingStateSchema,
  }),
]);

const MERGE_UNDO_REMAINING_STATES: Record<MergeUndoRemainingState, true> = {
  "merge-restored": true,
  "record-not-restored": true,
  "marks-not-restored": true,
  "notes-not-restored": true,
  "documents-not-restored": true,
  "preserved-revisions-kept": true,
  "state-unknown": true,
};
const MERGE_UNDO_STEP_TABLE: Record<MergeUndoStep, true> = {
  "save-current-text": true,
  "restore-target": true,
  "restore-absorbed": true,
  "move-annotations": true,
  "clear-marks": true,
  "clear-record": true,
};

/** The merge bodies; every one carries `operation: "merge"`, which no split body does. */
const MergeUndoAppliedShape = {
  operation: z.literal("merge"),
  targetDocumentId: z.string(),
  targetName: z.string().nullable(),
  absorbedDocumentIds: z.array(z.string()),
  skippedDocuments: z.array(
    z.object({ documentId: z.string(), state: z.enum(["in-trash", "purged"]) }),
  ),
  preservedRevisions: z.array(RevisionRefSchema),
  movedAnnotationIds: z.array(z.string()),
};

const MergeUndoBodySchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("applied"), ...MergeUndoAppliedShape }),
  z.object({
    outcome: z.literal("index-failed"),
    ...MergeUndoAppliedShape,
    failures: z.array(
      z.object({ documentId: z.string(), step: UndoIndexStepSchema }),
    ),
  }),
  z.object({
    outcome: z.literal("refused"),
    operation: z.literal("merge"),
    reason: z.custom<MergeUndoRefusalReason>(
      (v) =>
        typeof v === "string" &&
        (MERGE_UNDO_REFUSAL_REASONS as readonly string[]).includes(v),
    ),
    documentId: z.string(),
  }),
  z.object({
    outcome: z.literal("failed"),
    operation: z.literal("merge"),
    failedStep: z.custom<MergeUndoStep>((v) =>
      isKeyOf(MERGE_UNDO_STEP_TABLE, v),
    ),
    cause: z.string(),
    remainingState: z.custom<MergeUndoRemainingState>((v) =>
      isKeyOf(MERGE_UNDO_REMAINING_STATES, v),
    ),
  }),
]);

const LatestBodySchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("found"),
    record: z.object({
      kind: z.enum(SPLIT_OPERATION_KINDS),
      affectedDocumentIds: z.array(z.string()),
      snapshotRevisions: z.array(RevisionRefSchema),
      newDocumentId: z.string(),
      date: z.string(),
    }),
  }),
  z.object({ outcome: z.literal("none") }),
  z.object({ outcome: z.literal("failed"), cause: z.string() }),
]);

/** What an applied Undo merge reports to the host. */
export interface MergeUndoClientFields {
  targetDocumentId: string;
  /** `null` when the server could not read the name after the Undo. */
  targetName: string | null;
  absorbedCount: number;
  absorbedDocumentIds: string[];
  skippedDocuments: { documentId: string; state: "in-trash" | "purged" }[];
  preservedRevisions: {
    documentId: string;
    revisionId: string;
    revisionNumber: number;
  }[];
  movedAnnotationIds: string[];
}

/**
 * The kinds of an Undo of a merge (Feature 121). `nothing-to-undo`,
 * `could-not-be-checked` and the transport `failed` are shared with the
 * split Undo.
 */
export type MergeUndoClientResult =
  | ({ kind: "merge-applied" } & MergeUndoClientFields)
  | ({
      kind: "merge-index-failed";
      failures: SplitIndexFailure[];
    } & MergeUndoClientFields)
  | {
      kind: "merge-refused";
      reason: MergeUndoRefusalReason;
      message: string;
      documentId: string;
    }
  | {
      kind: "merge-failed";
      failedStep: MergeUndoStep;
      remainingState: MergeUndoRemainingState;
      cause: string;
    };

/**
 * Outcome of {@link requestUndoSplit}; the kinds never share a value. No kind
 * carries writer text except `refused` (the Undo refusal texts): the messages
 * for `could-not-be-checked`, `index-failed` and a failed Undo's remaining
 * state do not exist in `split-messages.ts`, so those kinds carry the typed
 * values and the caller must not show a made-up sentence for them.
 */
export type SplitUndoClientResult =
  | MergeUndoClientResult
  | ({ kind: "applied" } & SplitUndoAppliedFields)
  | ({
      kind: "index-failed";
      failures: SplitIndexFailure[];
    } & SplitUndoAppliedFields)
  | { kind: "nothing-to-undo" }
  | { kind: "unsupported-operation"; operationKind: string }
  | { kind: "refused"; reason: SplitUndoRefusalReason; message: string }
  | { kind: "could-not-be-checked"; cause: string }
  | {
      kind: "failed";
      /** The step Undo stopped at; null when no step ran or it is unknown. */
      failedStep: SplitUndoStep | null;
      remainingState: SplitUndoRemainingState;
      /** A stable code: an error name, or `transport-failed` / `invalid-request`. */
      cause: string;
    };

/** Outcome of {@link requestLatestSplitOperation}; `failed` is never `none`. */
export type SplitLatestClientResult =
  | { kind: "record"; record: LatestOperationRecord }
  | { kind: "none" }
  | { kind: "failed"; cause: string };

function undoFailed(
  remainingState: SplitUndoRemainingState,
  cause: string,
): SplitUndoClientResult {
  return { kind: "failed", failedStep: null, remainingState, cause };
}

function mergeUndoResultOf(
  data: z.infer<typeof MergeUndoBodySchema>,
): MergeUndoClientResult {
  switch (data.outcome) {
    case "applied":
    case "index-failed": {
      const fields: MergeUndoClientFields = {
        targetDocumentId: data.targetDocumentId,
        targetName: data.targetName,
        absorbedCount: data.absorbedDocumentIds.length,
        absorbedDocumentIds: data.absorbedDocumentIds,
        skippedDocuments: data.skippedDocuments,
        preservedRevisions: data.preservedRevisions,
        movedAnnotationIds: data.movedAnnotationIds,
      };
      return data.outcome === "applied"
        ? { kind: "merge-applied", ...fields }
        : { kind: "merge-index-failed", ...fields, failures: data.failures };
    }
    case "refused":
      return {
        kind: "merge-refused",
        reason: data.reason,
        message: MERGE_UNDO_REFUSAL_MESSAGES[data.reason],
        documentId: data.documentId,
      };
    case "failed":
      return {
        kind: "merge-failed",
        failedStep: data.failedStep,
        remainingState: data.remainingState,
        cause: data.cause,
      };
  }
}

/**
 * Undoes the project's latest operation, a split or a merge (the server
 * reads the stored record and picks). A thrown fetch, a non-ok response or a
 * malformed body is a `failed` result with `state-unknown`, never "no result".
 *
 * @throws The locked-access error when the project is locked.
 */
export async function requestUndoSplit(
  projectId: string,
): Promise<SplitUndoClientResult> {
  const checked = parseSplitUndoBody({ projectId });
  if (!checked.ok) return undoFailed("split-restored", "invalid-request");
  const sent = await post(UNDO_ENDPOINT, checked.value, projectId);
  if (!sent.ok) return undoFailed("state-unknown", "transport-failed");
  const merge = MergeUndoBodySchema.safeParse(sent.json);
  if (merge.success) return mergeUndoResultOf(merge.data);
  const parsed = UndoBodySchema.safeParse(sent.json);
  if (!parsed.success) {
    reportTransportValidationFailure(
      "split.requestUndoSplit",
      parsed.error.issues,
    );
    return undoFailed("state-unknown", "transport-failed");
  }
  const data = parsed.data;
  switch (data.outcome) {
    case "applied":
    case "index-failed": {
      const fields: SplitUndoAppliedFields = {
        originalDocumentId: data.originalDocumentId,
        splitOffDocumentId: data.splitOffDocumentId,
        splitOffState: data.splitOffState,
        preservedRevisions: data.preservedRevisions,
        movedAnnotationIds: data.movedAnnotationIds,
      };
      return data.outcome === "applied"
        ? { kind: "applied", ...fields }
        : { kind: "index-failed", ...fields, failures: data.failures };
    }
    case "nothing-to-undo":
      return { kind: "nothing-to-undo" };
    case "unsupported-operation":
      // The server no longer answers this for a merge; if an older one does,
      // nothing was undone and the check did not complete.
      return data.kind === "merge"
        ? { kind: "could-not-be-checked", cause: "unsupported-operation" }
        : { kind: "unsupported-operation", operationKind: data.kind };
    case "refused":
      return {
        kind: "refused",
        reason: data.reason,
        message: SPLIT_UNDO_REFUSAL_MESSAGES[data.reason],
      };
    case "could-not-be-checked":
      return { kind: "could-not-be-checked", cause: data.cause };
    case "failed":
      return {
        kind: "failed",
        failedStep: data.failedStep,
        remainingState: data.remainingState,
        cause: data.cause,
      };
  }
}

/**
 * Reads the project's latest-operation record: the record, `none`, or a
 * failed read (a thrown fetch, a non-ok response, a malformed body or a
 * failed read on the server), which is never `none`.
 *
 * @throws The locked-access error when the project is locked.
 */
export async function requestLatestSplitOperation(
  projectId: string,
): Promise<SplitLatestClientResult> {
  const checked = parseSplitLatestQuery(new URLSearchParams({ projectId }));
  if (!checked.ok) return { kind: "failed", cause: "invalid-request" };
  let response: Response;
  try {
    response = await fetch(
      `${LATEST_ENDPOINT}?projectId=${encodeURIComponent(checked.value.projectId)}`,
      { method: "GET" },
    );
  } catch {
    return { kind: "failed", cause: "transport-failed" };
  }
  if (!response.ok) {
    const locked = lockedAccessErrorFromResponse(response, projectId);
    if (locked) throw locked;
    return { kind: "failed", cause: "transport-failed" };
  }
  const parsed = LatestBodySchema.safeParse(await readJson(response));
  if (!parsed.success) {
    reportTransportValidationFailure(
      "split.requestLatestSplitOperation",
      parsed.error.issues,
    );
    return { kind: "failed", cause: "transport-failed" };
  }
  const data = parsed.data;
  if (data.outcome === "found") return { kind: "record", record: data.record };
  if (data.outcome === "none") return { kind: "none" };
  return { kind: "failed", cause: data.cause };
}
