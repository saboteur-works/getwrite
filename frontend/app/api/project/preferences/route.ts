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

/**
 * Request payload accepted by {@link POST}.
 */
interface UpdateProjectPreferencesBody {
    /** Absolute project root path containing `project.json`. */
    projectPath: string;
    /** Partial preference updates to merge into metadata. */
    preferences: Partial<ProjectUserPreferences>;
}

/**
 * Success response payload returned by {@link POST}.
 */
interface UpdateProjectPreferencesSuccess {
    /** Updated project metadata after merge. */
    metadata: Record<string, MetadataValue>;
}

/**
 * Error response payload returned by {@link POST}.
 */
interface UpdateProjectPreferencesError {
    /** Human-readable error summary. */
    error: string;
}

/**
 * Updates project metadata user preferences in `project.json`.
 *
 * @param req - Incoming Next.js request.
 * @returns Updated metadata payload or an error response.
 */
export async function POST(
    req: NextRequest,
): Promise<
    NextResponse<
        UpdateProjectPreferencesSuccess | UpdateProjectPreferencesError
    >
> {
    try {
        const body = (await req.json()) as UpdateProjectPreferencesBody;
        const { projectPath, preferences } = body;

        if (!projectPath || !preferences) {
            return NextResponse.json(
                { error: "Missing projectPath or preferences" },
                { status: 400 },
            );
        }

        const projectFilePath = path.join(projectPath, "project.json");
        const rawProject = await fs.readFile(projectFilePath, "utf-8");
        const parsedProject = JSON.parse(rawProject) as {
            metadata?: Record<string, MetadataValue>;
            updatedAt?: string;
        };

        const updatedMetadata = mergeUserPreferencesIntoProjectMetadata(
            parsedProject.metadata,
            preferences,
        );

        const nextProject = {
            ...parsedProject,
            metadata: updatedMetadata,
            updatedAt: new Date().toISOString(),
        };

        await fs.writeFile(
            projectFilePath,
            JSON.stringify(nextProject, null, 2),
            "utf-8",
        );

        return NextResponse.json({ metadata: updatedMetadata });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to update preferences";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
