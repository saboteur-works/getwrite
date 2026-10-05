/**
 * @module app/api/project/[project-id]/entity-proximity-mention-edges/route
 *
 * Read-only transport exposing the project's derived proximity-mention edges
 * ({@link getProximityMentionEdges}, Feature 68 Task 3/Task 7) — for every
 * declared entity, every other declared entity it is mentioned alongside in
 * at least one shared resource, weighted by the averaged character-offset
 * distance between their mentions in that resource.
 *
 * Route:
 * - `GET /api/project/[project-id]/entity-proximity-mention-edges`
 *
 * This route is purely a transport wrapper: it resolves and validates the
 * `project-id` path param (never a client-supplied path, per
 * `docs/standards/security.md`) via `resolveProjectPath`, then delegates
 * entirely to `getProximityMentionEdges`. No business logic lives here.
 */
import { NextRequest, NextResponse } from "next/server";
import { getProximityMentionEdges } from "../../../../../src/lib/models/mentions-core";
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

  const edges = await getProximityMentionEdges(projectPath);
  return NextResponse.json(edges, { status: 200 });
}

export const GET = withStorageContext(handleGet);

export const dynamic = "force-dynamic";
