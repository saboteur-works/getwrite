/**
 * @module app/api/project/entity-graph-positions/route
 *
 * Transport for a project's entity-graph node position persistence (Feature
 * 68, Task 12: `meta/entity-graph-positions.json`, FR-9/FR-10).
 *
 * Routes:
 * - `GET /api/project/entity-graph-positions?projectId=` — every persisted
 *   position record for the project (`loadEntityGraphPositions`).
 * - `PUT /api/project/entity-graph-positions` — body `{ projectId, entityId,
 *   x, y, connectionTypesSnapshot }`; upserts a single entity's position
 *   (`saveEntityGraphPosition`).
 *
 * Mirrors `entity-graph-settings/route.ts`'s shape exactly: `projectId` is
 * resolved and validated via {@link resolveProjectRoot} (never a
 * client-supplied path, per `docs/standards/security.md`), and
 * locked-access errors are rethrown for `withStorageContext` to map to
 * 401/409.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import { resolveProjectRoot } from "../../../../src/lib/models/project-root-resolver";
import {
  loadEntityGraphPositions,
  saveEntityGraphPosition,
} from "../../../../src/lib/models/entity-graph-positions";
import { withStorageContext } from "../../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const projectRoot = resolveProjectRoot(params.get("projectId"));
  if (!projectRoot) return respondInvalidProjectId();
  const records = await loadEntityGraphPositions(projectRoot);
  return NextResponse.json(records, { status: 200 });
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: {
    projectId?: unknown;
    entityId?: unknown;
    x?: unknown;
    y?: unknown;
    connectionTypesSnapshot?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const projectRoot = resolveProjectRoot(
    typeof body.projectId === "string" ? body.projectId : "",
  );
  if (!projectRoot) return respondInvalidProjectId();

  if (typeof body.entityId !== "string" || body.entityId.length === 0) {
    return badRequest("entityId must be a non-empty string.");
  }
  if (typeof body.x !== "number" || typeof body.y !== "number") {
    return badRequest("x and y must be numbers.");
  }
  const connectionTypesSnapshot = body.connectionTypesSnapshot;
  if (
    !Array.isArray(connectionTypesSnapshot) ||
    !connectionTypesSnapshot.every(
      (value): value is string => typeof value === "string",
    )
  ) {
    return badRequest("connectionTypesSnapshot must be an array of strings.");
  }

  const record = await saveEntityGraphPosition(
    projectRoot,
    body.entityId,
    body.x,
    body.y,
    connectionTypesSnapshot,
  );
  return NextResponse.json(record, { status: 200 });
}

export const GET = withStorageContext(handleGet);
export const PUT = withStorageContext(handlePut);
export const POST = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
