/**
 * @module app/api/project/entity-graph-settings/route
 *
 * Transport for a project's entity-graph settings (Feature 68, Task 6:
 * `entityGraphConnectionTypes` and `entityGraphFocalHopRadius`, FR-7/FR-8/
 * FR-21).
 *
 * Routes:
 * - `GET /api/project/entity-graph-settings?projectId=` — the project's
 *   effective settings, defaults filled in (`entity-graph-settings-core.ts`).
 * - `PUT /api/project/entity-graph-settings` — body
 *   `{ projectId, entityGraphConnectionTypes, entityGraphFocalHopRadius }`;
 *   `entityGraphFocalHopRadius` must be a non-negative integer.
 *   `entityGraphConnectionTypes` is filtered to known keys before persisting
 *   (FR-2) — an unrecognized key is silently dropped, never rejected.
 *
 * `projectId` is validated as a UUID and the project root is derived from it
 * by the core; no client-supplied path is accepted. Locked-access errors are
 * rethrown for `withStorageContext` to map to 401/409.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  getEntityGraphSettingsCore,
  InvalidEntityGraphFocalHopRadiusError,
  InvalidProjectIdCoreError,
  setEntityGraphSettingsCore,
} from "../../../../src/lib/models/entity-graph-settings-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Maps the core's 400-class errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (error instanceof InvalidEntityGraphFocalHopRadiusError) {
    return badRequest(error.message);
  }
  // Locked-access errors (and everything else) propagate to withStorageContext.
  throw error;
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  try {
    const settings = await getEntityGraphSettingsCore(
      params.get("projectId") ?? "",
    );
    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: {
    projectId?: unknown;
    entityGraphConnectionTypes?: unknown;
    entityGraphFocalHopRadius?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const connectionTypes = body.entityGraphConnectionTypes;
  if (
    !Array.isArray(connectionTypes) ||
    !connectionTypes.every(
      (value): value is string => typeof value === "string",
    )
  ) {
    return badRequest(
      "entityGraphConnectionTypes must be an array of strings.",
    );
  }
  const hopRadius = body.entityGraphFocalHopRadius;
  if (typeof hopRadius !== "number") {
    return badRequest(
      "entityGraphFocalHopRadius must be a non-negative integer.",
    );
  }
  try {
    const saved = await setEntityGraphSettingsCore(
      typeof body.projectId === "string" ? body.projectId : "",
      connectionTypes,
      hopRadius,
    );
    return NextResponse.json(saved, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const GET = withStorageContext(handleGet);
export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
