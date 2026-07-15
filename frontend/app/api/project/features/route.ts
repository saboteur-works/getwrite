/**
 * @module app/api/project/features/route
 *
 * API endpoint for updating the per-project feature configuration persisted in
 * `project.json`: the `config.features` opt-in flags (Timeline, POV, Synopsis,
 * Notes) and `config.organizerCardBody` (Organizer card-body source).
 *
 * Route:
 * - `POST /api/project/features` — replaces the provided block(s)
 *
 * POST body: `{ projectId: string; features?: ProjectFeatureFlags; organizerCardBody?: OrganizerCardBodyConfig }`
 * Success:   `{ features: ProjectFeatureFlags; organizerCardBody?: OrganizerCardBodyConfig }`
 * Failure:   `{ error: string }`
 *
 * The underlying helper acquires the project lock and does NOT bump
 * `metadataRevision` — see `project-features.ts`.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { updateFeatureConfig } from "../../../../src/lib/models/project-features";
import type {
  ProjectFeatureFlags,
  OrganizerCardBodyConfig,
} from "../../../../src/lib/models/types";
import { resolveProjectsDir } from "../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

interface UpdateFeaturesBody {
  projectId: string;
  features?: ProjectFeatureFlags;
  organizerCardBody?: OrganizerCardBodyConfig;
}

async function handlePost(req: NextRequest): Promise<Response> {
  let body: UpdateFeaturesBody;
  try {
    body = (await req.json()) as UpdateFeaturesBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { projectId, features, organizerCardBody } = body;

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(projectId);
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }

  if (features === undefined && organizerCardBody === undefined) {
    return NextResponse.json(
      { error: "Provide at least one of: features, organizerCardBody." },
      { status: 400 },
    );
  }

  const projectPath = path.join(resolveProjectsDir(), validatedProjectId);

  try {
    return NextResponse.json(
      await updateFeatureConfig(projectPath, { features, organizerCardBody }),
    );
  } catch (error) {
    // Zod validation failures and malformed input map to 400; everything else
    // (e.g. read/write failures) maps to 500.
    const isZodError =
      error !== null &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "ZodError";
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update feature configuration.";
    return NextResponse.json(
      { error: message },
      { status: isZodError ? 400 : 500 },
    );
  }
}

export const POST = withStorageContext(handlePost);
