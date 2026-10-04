/**
 * @module app/api/project/entity-graph-kind-styles/route
 *
 * Transport for a project's entity-kind style (color-slot/shape) mapping
 * (Feature 69, Task 3: `meta/entity-graph-kind-styles.json`).
 *
 * Routes:
 * - `GET /api/project/entity-graph-kind-styles?projectId=` — every
 *   persisted kind-style record for the project
 *   (`loadEntityGraphKindStyles`).
 * - `PUT /api/project/entity-graph-kind-styles` — body `{ projectId,
 *   entityKind, color, shape }`; upserts a single kind's style record
 *   (`upsertEntityGraphKindStyle`). `color` must be one of Task 2's
 *   token-slot references (e.g. `"entity-kind-0"`) — never a raw hex
 *   string — and `shape` must be one of Task 1's six shape names.
 *
 * Mirrors `entity-graph-positions/route.ts`'s shape exactly: `projectId` is
 * resolved and validated via {@link resolveProjectRoot} (never a
 * client-supplied path, per `docs/standards/security.md`), body validation
 * reuses Task 2's own Zod schemas rather than redeclaring shape checks, and
 * locked-access errors are not caught here — they propagate to
 * `withStorageContext` for 401/409 mapping.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import { resolveProjectRoot } from "../../../../src/lib/models/project-root-resolver";
import {
  EntityGraphKindColorSlotSchema,
  EntityGraphKindShapeSchema,
  loadEntityGraphKindStyles,
  upsertEntityGraphKindStyle,
} from "../../../../src/lib/models/entity-graph-kind-styles";
import { withStorageContext } from "../../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const projectRoot = resolveProjectRoot(params.get("projectId"));
  if (!projectRoot) return respondInvalidProjectId();
  const records = await loadEntityGraphKindStyles(projectRoot);
  return NextResponse.json(records, { status: 200 });
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: {
    projectId?: unknown;
    entityKind?: unknown;
    color?: unknown;
    shape?: unknown;
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

  if (typeof body.entityKind !== "string" || body.entityKind.length === 0) {
    return badRequest("entityKind must be a non-empty string.");
  }

  const colorResult = EntityGraphKindColorSlotSchema.safeParse(body.color);
  if (!colorResult.success) {
    return badRequest(
      'color must be a known entity-kind color-slot reference (e.g. "entity-kind-0"), not a raw hex string.',
    );
  }

  const shapeResult = EntityGraphKindShapeSchema.safeParse(body.shape);
  if (!shapeResult.success) {
    return badRequest("shape must be one of the fixed entity-kind shapes.");
  }

  const record = await upsertEntityGraphKindStyle(
    projectRoot,
    body.entityKind,
    colorResult.data,
    shapeResult.data,
  );
  return NextResponse.json(record, { status: 200 });
}

export const GET = withStorageContext(handleGet);
export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
