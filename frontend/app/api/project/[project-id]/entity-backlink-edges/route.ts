/**
 * @module app/api/project/[project-id]/entity-backlink-edges/route
 *
 * Read-only transport exposing the project's derived entity-to-entity
 * backlink edges ({@link getEntityBacklinkEdges}, Feature 68 Task 2/Task 7)
 * — one edge per pair of declared entities whose underlying resources are
 * linked by an explicit backlink in either direction.
 *
 * Route:
 * - `GET /api/project/[project-id]/entity-backlink-edges`
 *
 * This route is purely a transport wrapper: it resolves and validates the
 * `project-id` path param (never a client-supplied path, per
 * `docs/standards/security.md`) via `resolveProjectPath`, then delegates
 * entirely to `getEntityBacklinkEdges`. No business logic lives here.
 */
import { NextRequest, NextResponse } from "next/server";
import { getEntityBacklinkEdges } from "../../../../../src/lib/models/backlinks";
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

  const edges = await getEntityBacklinkEdges(projectPath);
  return NextResponse.json(edges, { status: 200 });
}

export const GET = withStorageContext(handleGet);

export const dynamic = "force-dynamic";
