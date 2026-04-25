/**
 * @module app/api/project/editor-config/route
 *
 * API endpoint for updating project editor configuration persisted in `project.json`.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import type { Project, ProjectConfig } from "../../../../src/lib/models/types";
import {
    sanitizeEditorHeadingMap,
    type EditorHeadingMap,
} from "../../../../src/lib/editor-heading-settings";
import {
    sanitizeEditorBody,
    type EditorBodyConfig,
} from "../../../../src/lib/editor-body-settings";

interface UpdateProjectEditorConfigBody {
    projectPath: string;
    headings?: EditorHeadingMap;
    body?: EditorBodyConfig;
}

interface UpdateProjectEditorConfigSuccess {
    editorConfig: ProjectConfig["editorConfig"];
}

interface UpdateProjectEditorConfigError {
    error: string;
}

export async function POST(
    req: NextRequest,
): Promise<
    NextResponse<
        UpdateProjectEditorConfigSuccess | UpdateProjectEditorConfigError
    >
> {
    try {
        const body = (await req.json()) as UpdateProjectEditorConfigBody;
        const { projectPath, headings, body: bodyConfig } = body;

        if (!projectPath) {
            return NextResponse.json(
                { error: "Missing projectPath" },
                { status: 400 },
            );
        }

        const projectFilePath = path.join(projectPath, "project.json");
        const rawProject = await fs.readFile(projectFilePath, "utf-8");
        const parsedProject = JSON.parse(rawProject) as Project;
        const nextEditorConfig: ProjectConfig["editorConfig"] = {
            ...(parsedProject.config?.editorConfig ?? {}),
            headings: sanitizeEditorHeadingMap(headings),
            body: bodyConfig !== undefined
                ? sanitizeEditorBody(bodyConfig)
                : parsedProject.config?.editorConfig?.body,
        };
        const nextConfig: ProjectConfig = {
            ...(parsedProject.config ?? {}),
            editorConfig: nextEditorConfig,
        };
        const nextProject: Project = {
            ...parsedProject,
            config: nextConfig,
            updatedAt: new Date().toISOString(),
        };

        await fs.writeFile(
            projectFilePath,
            JSON.stringify(nextProject, null, 2),
            "utf-8",
        );

        return NextResponse.json({ editorConfig: nextEditorConfig });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to update project editor config";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
