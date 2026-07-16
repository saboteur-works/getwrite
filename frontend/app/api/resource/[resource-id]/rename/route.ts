/**
 * @module app/api/resource/[resource-id]/rename/route
 *
 * Renames a resource by updating the `name` field in its sidecar metadata file.
 *
 * Route:
 * - `POST /api/resource/[resource-id]/rename` — rename the resource
 *
 * POST expected body: `{ projectId: string; newName: string }`
 * Success payload: `{ resource: Record<string, MetadataValue> }`
 * Failure payload: `{ error: string }`
 */

import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  readSidecar,
  writeSidecar,
} from "../../../../../src/lib/models/sidecar";
import { renameFolderById } from "../../../../../src/lib/models/folder-utils";
import type { MetadataValue } from "../../../../../src/lib/models/types";
import { resolveProjectsDir } from "../../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

interface RenameResourceBody {
  projectId: string;
  newName: string;
  resourceType?: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
): Promise<Response> {
  const resourceId = (await params)["resource-id"];

  let body: RenameResourceBody;
  try {
    body = (await req.json()) as RenameResourceBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(body.projectId);
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }
  const projectRoot = path.join(resolveProjectsDir(), validatedProjectId);
  const { newName, resourceType } = body;

  if (!newName || typeof newName !== "string" || !newName.trim()) {
    return NextResponse.json(
      { error: "Missing required field: newName." },
      { status: 400 },
    );
  }

  if (resourceType === "folder") {
    try {
      const foldersDir = path.join(projectRoot, "folders");
      const updated = await renameFolderById(
        foldersDir,
        resourceId,
        newName.trim(),
      );
      if (updated === null) {
        return NextResponse.json(
          { error: "Resource not found." },
          { status: 404 },
        );
      }
      return NextResponse.json({
        resource: updated as Record<string, MetadataValue>,
      });
    } catch (error) {
      return NextResponse.json(
        { error: errorMessage(error, "Failed to rename folder.") },
        { status: 500 },
      );
    }
  }

  try {
    const existing = await readSidecar(projectRoot, resourceId);

    if (existing === null) {
      return NextResponse.json(
        { error: "Resource not found." },
        { status: 404 },
      );
    }

    const updatedData: Record<string, MetadataValue> = {
      ...existing,
      name: newName.trim(),
    };

    await writeSidecar(projectRoot, resourceId, updatedData);

    return NextResponse.json({ resource: updatedData });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Failed to rename resource.") },
      { status: 500 },
    );
  }
}

export const POST = withStorageContext(handlePost);
