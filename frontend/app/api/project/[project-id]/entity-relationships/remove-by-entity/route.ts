/**
 * @module app/api/project/[project-id]/entity-relationships/remove-by-entity/route
 *
 * Transport for removing every authored relationship edge that references a
 * given entity, on either side (`specs/features/remove-entity.md` FR-9).
 *
 * Route:
 * - `POST /api/project/[project-id]/entity-relationships/remove-by-entity`
 *
 * Expected body: `{ entityId: string }`.
 *
 * Modelled directly on the sibling single-edge
 * `entity-relationships/remove/route.ts`: the `project-id` path param is
 * resolved and validated via {@link resolveProjectPath} (never a
 * client-supplied path, per `docs/standards/security.md`), and the handler
 * delegates entirely to {@link removeEntityRelationshipsForEntity}. No
 * business logic lives here.
 *
 * `removeEntityRelationshipsForEntity` never throws when no edge references
 * the given `entityId` — it resolves `0` — so this route always responds 200
 * with `{ removedCount: number }` rather than modeling "nothing to remove"
 * as an error status.
 */
import { NextRequest, NextResponse } from "next/server";
import { removeEntityRelationshipsForEntity } from "../../../../../../src/lib/models/entity-relationships";
import { resolveProjectPath } from "../../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../../_tenant/with-storage-context";

interface RemoveEntityRelationshipsForEntityBody {
  entityId?: string;
}

async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "project-id": string }> },
): Promise<Response> {
  const projectId = (await params)["project-id"];

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath } = resolved;

  let body: RemoveEntityRelationshipsForEntityBody;
  try {
    body = (await req.json()) as RemoveEntityRelationshipsForEntityBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const { entityId } = body;
  if (typeof entityId !== "string" || entityId.length === 0) {
    return NextResponse.json(
      { error: "Invalid request", details: "entityId is a required string" },
      { status: 400 },
    );
  }

  const removedCount = await removeEntityRelationshipsForEntity(
    projectPath,
    entityId,
  );
  return NextResponse.json({ removedCount }, { status: 200 });
}

export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
