/**
 * @module app/api/project/preferences/route
 *
 * API endpoint for updating user preferences persisted in `project.metadata`.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  mergeUserPreferencesIntoProjectMetadata,
  type ProjectUserPreferences,
} from "../../../../src/lib/user-preferences";
import type { MetadataValue } from "../../../../src/lib/models/types";
import { resolveProjectPath } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

interface UpdateProjectPreferencesBody {
  /** Server-validated project identifier (UUID). */
  projectId: string;
  /** Partial preference updates to merge into metadata. */
  preferences: Partial<ProjectUserPreferences>;
}

/**
 * Updates project metadata user preferences in `project.json`.
 *
 * @param req - Incoming Next.js request.
 * @returns Updated metadata payload or an error response.
 */
async function handlePost(req: NextRequest): Promise<Response> {
  try {
    const { projectId, preferences } =
      (await req.json()) as UpdateProjectPreferencesBody;

    if (!preferences) {
      return NextResponse.json(
        { error: "Missing projectId or preferences" },
        { status: 400 },
      );
    }

    const resolved = resolveProjectPath(projectId);
    if (resolved instanceof Response) return resolved;

    const { projectPath } = resolved;
    const projectFilePath = path.join(projectPath, "project.json");
    const parsedProject = JSON.parse(
      await fs.readFile(projectFilePath, "utf-8"),
    ) as { metadata?: Record<string, MetadataValue>; updatedAt?: string };

    const updatedMetadata = mergeUserPreferencesIntoProjectMetadata(
      parsedProject.metadata,
      preferences,
    );

    await fs.writeFile(
      projectFilePath,
      JSON.stringify(
        {
          ...parsedProject,
          metadata: updatedMetadata,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf-8",
    );

    return NextResponse.json({ metadata: updatedMetadata });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withStorageContext(handlePost);
