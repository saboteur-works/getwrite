/**
 * @module app/api/citations/fields/route
 *
 * Citation fields route (Feature 116, FR-6, FR-21, FR-22). Every method runs
 * in `withStorageContext` and calls a citation fields core.
 *
 * - `GET ?projectId=&resourceId=` the stored fields of a Source:
 *   `{ kind: "fields", fields }` (`fields` is null when none are stored) or
 *   `{ kind: "failed", message }` with status 200 when the sidecar could not
 *   be read. The two never share a body (docs/standards/failure-visibility.md).
 * - `PUT { projectId, resourceId, fields }` validate and store the fields;
 *   returns `{ fields }`, the stored value.
 *
 * No path is accepted: the project root is derived from the validated
 * `projectId` by the core. A malformed project id, resource id, body or
 * reference type is refused with one identical fixed sentence that never
 * echoes client input. A resource that is not a Source is 400, an unknown
 * resource 404, with the core's fixed sentences. Locked-access errors and any
 * other error propagate to `withStorageContext` (401/409/500). No paired
 * device limit is added; the proxy gate classifies this route as every other
 * `/api` route.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  CitationFieldsInvalidError,
  CitationFieldsNotFoundError,
  CitationFieldsResourceIdError,
  CitationFieldsSourceTypeError,
  InvalidProjectIdCoreError,
  readCitationFieldsCore,
  writeCitationFieldsCore,
} from "../../../../src/lib/models/citations-fields-core";
import { CITATION_FIELDS_REFUSAL } from "../../../../src/lib/models/citations-fields-validation";
import { withStorageContext } from "../../_tenant/with-storage-context";

const PUT_KEYS: readonly string[] = ["projectId", "resourceId", "fields"];
const GET_KEYS: readonly string[] = ["projectId", "resourceId"];

function failure(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

/** The one refusal for every malformed input. */
function refused(): Response {
  return failure(CITATION_FIELDS_REFUSAL, 400);
}

/** Maps the cores' refusals; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (
    error instanceof InvalidProjectIdCoreError ||
    error instanceof CitationFieldsResourceIdError ||
    error instanceof CitationFieldsInvalidError
  ) {
    return refused();
  }
  if (error instanceof CitationFieldsSourceTypeError) {
    return failure(error.message, 400);
  }
  if (error instanceof CitationFieldsNotFoundError) {
    return failure(error.message, 404);
  }
  throw error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  for (const key of params.keys()) {
    if (!GET_KEYS.includes(key)) return refused();
  }
  try {
    const result = await readCitationFieldsCore(
      params.get("projectId") ?? "",
      params.get("resourceId") ?? "",
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return refused();
  }
  if (!isPlainObject(body)) return refused();
  if (Object.keys(body).some((key) => !PUT_KEYS.includes(key))) {
    return refused();
  }
  try {
    const fields = await writeCitationFieldsCore(
      typeof body.projectId === "string" ? body.projectId : "",
      typeof body.resourceId === "string" ? body.resourceId : "",
      body.fields,
    );
    return NextResponse.json({ fields }, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const GET = withStorageContext(handleGet);
export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
