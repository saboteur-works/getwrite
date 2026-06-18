/**
 * @module app/api/resource/[resource-id]/rename/route
 *
 * Renames a resource by updating the `name` field in its sidecar metadata file.
 *
 * Route:
 * - `POST /api/resource/[resource-id]/rename` — rename the resource
 *
 * POST expected body: `{ projectRoot: string; newName: string }`
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

interface RenameResourceBody {
  projectRoot: string;
  newName: string;
  resourceType?: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
): Promise<NextResponse> {
  const resourceId = (await params)["resource-id"];

  let body: RenameResourceBody;
  try {
    body = (await req.json()) as RenameResourceBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { projectRoot, newName, resourceType } = body;

  if (!projectRoot || typeof projectRoot !== "string" || !projectRoot.trim()) {
    return NextResponse.json(
      { error: "Missing required field: projectRoot." },
      { status: 400 },
    );
  }

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
