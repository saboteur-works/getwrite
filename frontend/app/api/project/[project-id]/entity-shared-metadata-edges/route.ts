/**
 * @module app/api/project/[project-id]/entity-shared-metadata-edges/route
 *
 * Read-only transport exposing the project's derived shared-metadata edges
 * ({@link getEntitySharedMetadataEdges}, Feature 68 Task 4/Task 7) — one edge
 * per pair of declared entities sharing at least one tag or one identical
 * custom metadata field value.
 *
 * Route:
 * - `GET /api/project/[project-id]/entity-shared-metadata-edges`
 *
 * This route is purely a transport wrapper: it resolves and validates the
 * `project-id` path param (never a client-supplied path, per
 * `docs/standards/security.md`) via `resolveProjectPath`, then delegates
 * entirely to `getEntitySharedMetadataEdges`. No business logic lives here.
 */
import { NextRequest, NextResponse } from "next/server";
import { getEntitySharedMetadataEdges } from "../../../../../src/lib/models/entity-shared-metadata";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

async function handleGet(
  _req: NextRequest,
  { params }: { params: Promise<{ "project-id": string }> },
): Promise<Response> {
  const projectId = (await params)["project-id"];

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath } = resolved;

  const edges = await getEntitySharedMetadataEdges(projectPath);
  return NextResponse.json(edges, { status: 200 });
}

export const GET = withStorageContext(handleGet);

export const dynamic = "force-dynamic";
