/**
 * @module app/api/project/[project-id]/entity-cooccurrence/route
 *
 * Read-only transport exposing the project's per-entity co-occurrence map
 * ({@link getEntityCooccurrence}) — for every declared entity that shares at
 * least one resource with another declared entity's detected mention, the
 * set of entities it co-occurs with and how much
 * (`specs/features/entity-cooccurrence.md` FR-1).
 *
 * Route:
 * - `GET /api/project/[project-id]/entity-cooccurrence`
 *
 * This route is purely a transport wrapper: it resolves and validates the
 * `project-id` path param (never a client-supplied path, per
 * `docs/standards/security.md`) via `resolveProjectPath`, then delegates
 * entirely to `getEntityCooccurrence`. No business logic lives here.
 */
import { NextRequest, NextResponse } from "next/server";
import { getEntityCooccurrence } from "../../../../../src/lib/models/mentions-core";
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

  const cooccurrence = await getEntityCooccurrence(projectPath);
  return NextResponse.json(cooccurrence, { status: 200 });
}

export const GET = withStorageContext(handleGet);

export const dynamic = "force-dynamic";
