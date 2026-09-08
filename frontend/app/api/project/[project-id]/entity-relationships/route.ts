/**
 * @module app/api/project/[project-id]/entity-relationships/route
 *
 * Transport for listing and creating authored, typed relationship edges
 * between two declared entities (`specs/features/entity-relationships.md`
 * FR-1/FR-2/FR-8).
 *
 * Routes:
 * - `GET /api/project/[project-id]/entity-relationships` — list every
 *   persisted edge for the project.
 * - `POST /api/project/[project-id]/entity-relationships` — create an edge.
 *   Body: `{ sourceEntityId, targetEntityId, relationshipType }`.
 *
 * Modelled on `entity-cooccurrence/route.ts`'s GET-list shape and
 * `resource/[resource-id]/sidecar/route.ts`'s POST-with-JSON-body shape: the
 * `project-id` path param is resolved and validated via
 * {@link resolveProjectPath} (never a client-supplied path, per
 * `docs/standards/security.md`), and each handler delegates entirely to the
 * model layer (`entity-relationships.ts`). No business logic lives here.
 *
 * {@link createEntityRelationship}'s two validation-style throws —
 * {@link SameEntityRelationshipError} (FR-4, same source/target) and
 * {@link InvalidRelationshipTypeError} (FR-15, a `relationshipType` outside
 * the project's configured list) — are mapped to HTTP 400 here, distinguished
 * from an unexpected error via `instanceof`, mirroring how
 * `projects/route.ts` maps `MissingProjectFieldsError`/`ProjectTypeNotFoundError`
 * to specific status codes rather than a blanket 500.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  createEntityRelationship,
  loadEntityRelationships,
  InvalidRelationshipTypeError,
  SameEntityRelationshipError,
} from "../../../../../src/lib/models/entity-relationships";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

interface CreateEntityRelationshipBody {
  sourceEntityId?: string;
  targetEntityId?: string;
  relationshipType?: string;
}

async function handleGet(
  _req: NextRequest,
  { params }: { params: Promise<{ "project-id": string }> },
): Promise<Response> {
  const projectId = (await params)["project-id"];

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath } = resolved;

  const edges = await loadEntityRelationships(projectPath);
  return NextResponse.json(edges, { status: 200 });
}

async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "project-id": string }> },
): Promise<Response> {
  const projectId = (await params)["project-id"];

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath } = resolved;

  let body: CreateEntityRelationshipBody;
  try {
    body = (await req.json()) as CreateEntityRelationshipBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const { sourceEntityId, targetEntityId, relationshipType } = body;
  if (
    typeof sourceEntityId !== "string" ||
    typeof targetEntityId !== "string" ||
    typeof relationshipType !== "string"
  ) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details:
          "sourceEntityId, targetEntityId, and relationshipType are required strings",
      },
      { status: 400 },
    );
  }

  try {
    const edge = await createEntityRelationship(
      projectPath,
      sourceEntityId,
      targetEntityId,
      relationshipType,
    );
    return NextResponse.json(edge, { status: 201 });
  } catch (error) {
    if (
      error instanceof SameEntityRelationshipError ||
      error instanceof InvalidRelationshipTypeError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export const GET = withStorageContext(handleGet);
export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
