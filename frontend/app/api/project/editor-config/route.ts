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
import { resolveProjectPath } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

interface UpdateProjectEditorConfigBody {
  projectId: string;
  headings?: EditorHeadingMap;
  body?: EditorBodyConfig;
}

async function handlePost(req: NextRequest): Promise<Response> {
  try {
    const {
      projectId,
      headings,
      body: bodyConfig,
    } = (await req.json()) as UpdateProjectEditorConfigBody;

    const resolved = resolveProjectPath(projectId);
    if (resolved instanceof Response) return resolved;

    const { projectPath } = resolved;
    const projectFilePath = path.join(projectPath, "project.json");
    const parsedProject = JSON.parse(
      await fs.readFile(projectFilePath, "utf-8"),
    ) as Project;

    const nextEditorConfig: ProjectConfig["editorConfig"] = {
      ...(parsedProject.config?.editorConfig ?? {}),
      headings: sanitizeEditorHeadingMap(headings),
      body:
        bodyConfig !== undefined
          ? sanitizeEditorBody(bodyConfig)
          : parsedProject.config?.editorConfig?.body,
    };

    const nextProject: Project = {
      ...parsedProject,
      config: {
        ...(parsedProject.config ?? {}),
        editorConfig: nextEditorConfig,
      },
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

export const POST = withStorageContext(handlePost);
