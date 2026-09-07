/**
 * @module app/api/project/[project-id]/entity-mention-counts/route
 *
 * Read-only transport exposing the project's per-entity mention counts
 * ({@link getProjectMentionCounts}) — the total number of detected mentions
 * recorded anywhere in the project's mention index for every entity that has
 * at least one (FR-6 of `specs/features/entity-roster.md`).
 *
 * Route:
 * - `GET /api/project/[project-id]/entity-mention-counts`
 *
 * This route is purely a transport wrapper: it resolves and validates the
 * `project-id` path param (never a client-supplied path, per
 * `docs/standards/security.md`) via `validateProjectId`/
 * `respondInvalidProjectId`, then delegates entirely to
 * `getProjectMentionCounts`. No business logic lives here.
 */
import { NextRequest, NextResponse } from "next/server";
import { getProjectMentionCounts } from "../../../../../src/lib/models/mentions-core";
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

  const counts = await getProjectMentionCounts(projectPath);
  return NextResponse.json(counts, { status: 200 });
}

export const GET = withStorageContext(handleGet);

export const dynamic = "force-dynamic";
