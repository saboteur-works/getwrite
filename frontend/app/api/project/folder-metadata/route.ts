/**
 * @module app/api/project/folder-metadata/route
 *
 * Transport for a folder's metadata sidecar (Feature 102, Task 9, FR-8,
 * FR-34).
 *
 * Routes:
 * - `GET /api/project/folder-metadata?projectId=&folderId=` — notes, field
 *   values and subtype; an absent sidecar reads as empty and creates nothing.
 * - `PUT /api/project/folder-metadata` — body `{ projectId, folderId,
 *   metadata }`; `metadata` is validated by the core against its allowlist
 *   and its refusal message is the 400 error body.
 *
 * `projectId` and `folderId` are UUID-validated and the project root is
 * derived by the core; no client-supplied path is accepted. A PUT for a
 * folder id with no folder behind it is 404 `{ error: "Folder not found" }`
 * and creates no sidecar (Owner decision, 2026-11-07, FR-3). Locked-access
 * errors are rethrown for `withStorageContext` to map to 401/409.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  FolderNotFoundError,
  getFolderMetadataCore,
  InvalidFolderMetadataError,
  InvalidProjectIdCoreError,
  updateFolderMetadataCore,
} from "../../../../src/lib/models/folder-metadata-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Maps the core's 400-class errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (error instanceof InvalidFolderMetadataError) {
    return badRequest(error.message);
  }
  if (error instanceof FolderNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  throw error;
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  try {
    const value = await getFolderMetadataCore(
      params.get("projectId") ?? "",
      params.get("folderId") ?? "",
    );
    return NextResponse.json(value, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: { projectId?: unknown; folderId?: unknown; metadata?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body.");
  }
  if (typeof body !== "object" || body === null || !("metadata" in body)) {
    return badRequest("metadata must be an object.");
  }
  try {
    const saved = await updateFolderMetadataCore(
      typeof body.projectId === "string" ? body.projectId : "",
      typeof body.folderId === "string" ? body.folderId : "",
      body.metadata,
    );
    return NextResponse.json(saved, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const GET = withStorageContext(handleGet);
export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
