/**
 * @module app/api/folklore/variant-text/route
 *
 * Variant text route (Feature 110, FR-13, FR-21). Runs in
 * `withStorageContext` and calls `readVariantTextCore`, so the native backend
 * refuses the same input with the same message.
 *
 * - `GET ?projectId=&resourceId=` returns the typed read of one variant's
 *   canonical-revision text: `{ kind: "text", text }`, `{ kind: "none" }` or
 *   `{ kind: "unreadable", reason }`. Any other query key is refused (400).
 *
 * Read only: there is no POST, PUT or DELETE and no paired-device limit
 * switch is added; the proxy gate classifies this route as every other
 * `/api` route. No path is accepted: the project root is derived from the
 * validated `projectId` by the core. 400 messages are fixed sentences and
 * never echo client input. A locked project is not turned into a result: the
 * locked-access error propagates to `withStorageContext` (401 or 409), as on
 * the claims route. Any other error also propagates; nothing stored is logged.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  InvalidProjectIdCoreError,
  InvalidVariantResourceIdError,
  VariantProjectNotFoundError,
  readVariantTextCore,
} from "../../../../src/lib/models/folklore-variant-read-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

const GET_KEYS: readonly string[] = ["projectId", "resourceId"];

function failure(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

/** Maps the core's refusals; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (error instanceof InvalidVariantResourceIdError) {
    return failure(error.message, 400);
  }
  if (error instanceof VariantProjectNotFoundError) {
    return failure(error.message, 404);
  }
  throw error;
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  for (const key of params.keys()) {
    if (!GET_KEYS.includes(key)) {
      return failure("The request has an unsupported parameter.", 400);
    }
  }
  try {
    const result = await readVariantTextCore(
      params.get("projectId") ?? "",
      params.get("resourceId") ?? "",
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const GET = withStorageContext(handleGet);

export const dynamic = "force-dynamic";
