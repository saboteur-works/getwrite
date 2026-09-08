/**
 * @module app/api/project/[project-id]/entity-relationships/remove/route
 *
 * Transport for removing a single authored relationship edge
 * (`specs/features/entity-relationships.md` FR-6/FR-12).
 *
 * Route:
 * - `POST /api/project/[project-id]/entity-relationships/remove`
 *
 * Expected body: `{ edgeId: string }`.
 *
 * Modelled on `project/tags/delete/route.ts`'s separate-sub-route shape: the
 * `project-id` path param is resolved and validated via
 * {@link resolveProjectPath} (never a client-supplied path, per
 * `docs/standards/security.md`), and the handler delegates entirely to
 * {@link removeEntityRelationship}. No business logic lives here.
 *
 * `removeEntityRelationship` never throws for a nonexistent `edgeId` — it
 * resolves `false` — so this route always responds 200 with `{ removed:
 * boolean }` rather than modeling "not found" as an error status.
 */
import { NextRequest, NextResponse } from "next/server";
import { removeEntityRelationship } from "../../../../../../src/lib/models/entity-relationships";
import { resolveProjectPath } from "../../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../../_tenant/with-storage-context";

interface RemoveEntityRelationshipBody {
  edgeId?: string;
}

async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "project-id": string }> },
): Promise<Response> {
  const projectId = (await params)["project-id"];

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath } = resolved;

  let body: RemoveEntityRelationshipBody;
  try {
    body = (await req.json()) as RemoveEntityRelationshipBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const { edgeId } = body;
  if (typeof edgeId !== "string" || edgeId.length === 0) {
    return NextResponse.json(
      { error: "Invalid request", details: "edgeId is a required string" },
      { status: 400 },
    );
  }

  const didRemove = await removeEntityRelationship(projectPath, edgeId);
  return NextResponse.json({ removed: didRemove }, { status: 200 });
}

export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
