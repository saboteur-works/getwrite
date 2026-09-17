/**
 * @module app/api/project/[project-id]/trash/route
 *
 * Transport for listing everything currently in a project's Trash
 * (`specs/features/trash-ui.md` FR-1/FR-2/FR-11/FR-12, Task 11, resolved
 * OQ-10).
 *
 * Route:
 * - `GET /api/project/[project-id]/trash` — list every trashed resource and
 *   top-level trashed folder in one combined response, mirroring
 *   `GET /api/projects`'s combined-response shape rather than splitting
 *   resources and folders across two endpoints.
 *
 * Modelled on `entity-relationships/route.ts`'s GET handler: the
 * `project-id` path param is resolved and validated via
 * {@link resolveProjectPath} (never a client-supplied path, per
 * `docs/standards/security.md`), and the handler delegates entirely to the
 * model layer (`trash.ts`'s `listTrashedItems`). No business logic lives
 * here.
 */
import { NextRequest, NextResponse } from "next/server";
import { listTrashCore } from "../../../../../src/lib/models/trash-core";
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

  const trashed = await listTrashCore(projectPath);
  return NextResponse.json(trashed, { status: 200 });
}

export const GET = withStorageContext(handleGet);

export const dynamic = "force-dynamic";
