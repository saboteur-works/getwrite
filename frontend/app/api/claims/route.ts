/**
 * @module app/api/claims/route
 *
 * Claim ledger route (Feature 108, FR-21, FR-17). Every method runs in
 * `withStorageContext` and calls a claim core, so the native backend refuses
 * the same input with the same message.
 *
 * - `GET  ?projectId=` project-wide claim list: `{ claims, failures }`. A
 *   resource whose annotations could not be read is listed in `failures`,
 *   never dropped (docs/standards/failure-visibility.md). A `resourceId`
 *   query key is tolerated and ignored; any other key is refused.
 * - `POST { projectId, resourceId, claim: { id, statement, quote, target? } }`
 *   create a claim in one write; the core sets the status.
 * - `PUT  { projectId, resourceId, annotationId, update: { status?,
 *   statement?, target? } }` update a claim in one write.
 *
 * There is no DELETE: a claim is deleted by `DELETE /api/annotations`, which
 * stays under `permanentDeletion`. No new paired-device limit is added; the
 * proxy gate classifies this route as it does `/api/annotations`, so creating
 * and updating are allowed or refused on a paired device exactly as the
 * annotation write is. No path is accepted: the project root is derived from
 * the validated `projectId` by the core. Route-originated 400 messages are
 * fixed sentences and never echo client input; the core's own message is
 * passed through for a core refusal. Locked-access errors and any other
 * error propagate to `withStorageContext` (401/409/500); nothing stored is
 * logged.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../src/lib/models/project-path";
import {
  AnnotationNotFoundError,
  AnnotationResourceNotFoundError,
  AnnotationResourceTypeError,
  InvalidAnnotationError,
  InvalidAnnotationResourceIdError,
  InvalidProjectIdCoreError,
} from "../../../src/lib/models/annotations-core";
import { CLAIM_STATUSES } from "../../../src/lib/models/claim-types";
import { addClaimCore } from "../../../src/lib/models/claims-add-core";
import { listClaimsCore } from "../../../src/lib/models/claims-list-core";
import { updateClaimCore } from "../../../src/lib/models/claims-update-core";
import { withStorageContext } from "../_tenant/with-storage-context";

const POST_KEYS: readonly string[] = ["projectId", "resourceId", "claim"];
const PUT_KEYS: readonly string[] = [
  "projectId",
  "resourceId",
  "annotationId",
  "update",
];
const GET_KEYS: readonly string[] = ["projectId", "resourceId"];

function failure(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

/** Maps the cores' refusals; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (
    error instanceof InvalidAnnotationError ||
    error instanceof InvalidAnnotationResourceIdError ||
    error instanceof AnnotationResourceTypeError
  ) {
    return failure(error.message, 400);
  }
  if (
    error instanceof AnnotationResourceNotFoundError ||
    error instanceof AnnotationNotFoundError
  ) {
    return failure(error.message, 404);
  }
  throw error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface Parsed {
  projectId: string;
  resourceId: string;
  fields: Record<string, unknown>;
}

/** Parses a JSON object body and refuses any top-level key not in `allowed`. */
async function readBody(
  req: NextRequest,
  allowed: readonly string[],
): Promise<Parsed | Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failure("Invalid JSON body.", 400);
  }
  if (!isPlainObject(body)) {
    return failure("The request body must be an object.", 400);
  }
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    return failure("The request body has an unsupported field.", 400);
  }
  return {
    projectId: typeof body.projectId === "string" ? body.projectId : "",
    resourceId: typeof body.resourceId === "string" ? body.resourceId : "",
    fields: body,
  };
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  for (const key of params.keys()) {
    if (!GET_KEYS.includes(key)) {
      return failure("The request has an unsupported parameter.", 400);
    }
  }
  try {
    const result = await listClaimsCore(params.get("projectId") ?? "");
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function handlePost(req: NextRequest): Promise<Response> {
  const parsed = await readBody(req, POST_KEYS);
  if (parsed instanceof Response) return parsed;
  if (!isPlainObject(parsed.fields.claim)) {
    return failure("The claim must be an object.", 400);
  }
  try {
    const annotation = await addClaimCore(
      parsed.projectId,
      parsed.resourceId,
      parsed.fields.claim,
    );
    return NextResponse.json({ annotation }, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

function hasInvalidStatus(update: Record<string, unknown>): boolean {
  return (
    "status" in update &&
    !(CLAIM_STATUSES as readonly unknown[]).includes(update.status)
  );
}

async function handlePut(req: NextRequest): Promise<Response> {
  const parsed = await readBody(req, PUT_KEYS);
  if (parsed instanceof Response) return parsed;
  const update = parsed.fields.update;
  if (!isPlainObject(update)) {
    return failure("The update must be an object.", 400);
  }
  if (hasInvalidStatus(update)) {
    return failure("The status is not one of the claim statuses.", 400);
  }
  const annotationId =
    typeof parsed.fields.annotationId === "string"
      ? parsed.fields.annotationId
      : "";
  try {
    const annotation = await updateClaimCore(
      parsed.projectId,
      parsed.resourceId,
      annotationId,
      update,
    );
    return NextResponse.json({ annotation }, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const GET = withStorageContext(handleGet);
export const POST = withStorageContext(handlePost);
export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
