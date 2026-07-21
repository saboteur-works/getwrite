/**
 * @module app/api/project/revision-settings/route
 *
 * API endpoint for updating the default revision name setting persisted in `project.json`.
 *
 * Route:
 * - `POST /api/project/revision-settings` — sets `config.defaultRevisionName`
 *
 * POST body: `{ projectId: string; defaultRevisionName: string }`
 * Success:   `{ defaultRevisionName: string }`
 * Failure:   `{ error: string }`
 */

import { NextRequest, NextResponse } from "next/server";
import { updateDefaultRevisionName } from "../../../../src/lib/models/revision-settings";
import { resolveProjectPath } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

interface UpdateRevisionSettingsBody {
  projectId: string;
  defaultRevisionName: string;
}

async function handlePost(req: NextRequest): Promise<Response> {
  let body: UpdateRevisionSettingsBody;
  try {
    body = (await req.json()) as UpdateRevisionSettingsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { projectId, defaultRevisionName } = body;

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;

  if (typeof defaultRevisionName !== "string") {
    return NextResponse.json(
      { error: "Missing required field: defaultRevisionName." },
      { status: 400 },
    );
  }

  const { projectPath } = resolved;

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

export const POST = withStorageContext(handlePost);
