/**
 * @module app/api/project/revision-settings/route
 *
 * API endpoint for updating the default revision name setting persisted in `project.json`.
 *
 * Route:
 * - `POST /api/project/revision-settings` — sets `config.defaultRevisionName`
 *
 * POST body: `{ projectPath: string; defaultRevisionName: string }`
 * Success:   `{ defaultRevisionName: string }`
 * Failure:   `{ error: string }`
 */

import { NextRequest, NextResponse } from "next/server";
import { updateDefaultRevisionName } from "../../../../src/lib/models/revision-settings";

interface UpdateRevisionSettingsBody {
    projectPath: string;
    defaultRevisionName: string;
}

interface UpdateRevisionSettingsSuccess {
    defaultRevisionName: string;
}

interface UpdateRevisionSettingsError {
    error: string;
}

export async function POST(
    req: NextRequest,
): Promise<
    NextResponse<UpdateRevisionSettingsSuccess | UpdateRevisionSettingsError>
> {
    let body: UpdateRevisionSettingsBody;
    try {
        body = (await req.json()) as UpdateRevisionSettingsBody;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const { projectPath, defaultRevisionName } = body;

    if (!projectPath || typeof projectPath !== "string") {
        return NextResponse.json(
            { error: "Missing required field: projectPath." },
            { status: 400 },
        );
    }

    if (typeof defaultRevisionName !== "string") {
        return NextResponse.json(
            { error: "Missing required field: defaultRevisionName." },
            { status: 400 },
        );
    }

    try {
        const saved = await updateDefaultRevisionName(
            projectPath,
            defaultRevisionName,
        );
        return NextResponse.json({ defaultRevisionName: saved });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to update revision settings.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
