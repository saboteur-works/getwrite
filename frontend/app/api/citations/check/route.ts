/**
 * @module app/api/citations/check/route
 *
 * Pre-run citation check route (Feature 116, FR-15, FR-21, FR-22).
 *
 * - `POST { projectId, resourceIds }` runs `checkCitationsCore` inside
 *   `withStorageContext` and returns its result as JSON with status 200: the
 *   grouped `ok` result, or a distinct `failed` result (never the same shape).
 *   Nothing is written.
 *
 * No path is accepted: a body key other than the two named is refused, and
 * the project root is derived from the validated `projectId` by the core.
 * Route-originated 400 messages are fixed sentences; a malformed project or
 * resource id is refused without echoing it. An unknown project is 404.
 * Locked-access errors and any other error propagate to `withStorageContext`
 * (401/409/500), so a locked project is never an empty or "no gaps" result.
 * No paired-device limit switch is added; the proxy gate classifies this as
 * any other `/api` route.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  checkCitationsCore,
  CitationCheckProjectNotFoundError,
  InvalidCitationCheckResourceIdError,
  InvalidProjectIdCoreError,
} from "../../../../src/lib/models/citations-precheck-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

const ALLOWED_KEYS: readonly string[] = ["projectId", "resourceIds"];

function failure(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Maps the core's refusals; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (error instanceof InvalidCitationCheckResourceIdError) {
    return failure(error.message, 400);
  }
  if (error instanceof CitationCheckProjectNotFoundError) {
    return failure(error.message, 404);
  }
  throw error;
}

async function handlePost(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failure("Invalid JSON body.", 400);
  }
  if (!isPlainObject(body)) {
    return failure("The request body must be an object.", 400);
  }
  if (Object.keys(body).some((key) => !ALLOWED_KEYS.includes(key))) {
    return failure("The request body has an unsupported field.", 400);
  }
  const { projectId, resourceIds } = body;
  if (typeof projectId !== "string") {
    return failure("A project id is required.", 400);
  }
  if (
    !Array.isArray(resourceIds) ||
    !resourceIds.every((id): id is string => typeof id === "string")
  ) {
    return failure("The resource ids must be a list of ids.", 400);
  }
  try {
    const result = await checkCitationsCore(projectId, resourceIds);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
