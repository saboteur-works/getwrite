/**
 * @module app/api/project/route
 *
 * API endpoint for loading a project from disk, including folder descriptors
 * and resource sidecar metadata/plaintext.
 *
 * Route:
 * - `POST /api/project`
 *
 * Expected body:
 * - `{ projectPath: string }`
 *
 * Success payload:
 * - `{ project, folders, resources }`
 *
 * Failure payload:
 * - `{ error: string, details: string }` with HTTP 500
 */
import { NextRequest, NextResponse } from "next/server";
import type { LoadedResource } from "../../../src/lib/models/project-loader";
import { loadProjectFromDisk } from "../../../src/lib/models/project-loader";
import type { Project } from "../../../src/lib/models";

/** Request payload accepted by {@link POST}. */
interface LoadProjectRequestBody {
  /** Absolute path to the project root directory on disk. */
  projectPath: string;
}

interface LoadProjectSuccessResponse {
  project: Project;
  folders: unknown[];
  resources: LoadedResource[];
}

interface LoadProjectErrorResponse {
  error: string;
  details: string;
}

/**
 * Loads a project and related entities from the local filesystem.
 *
 * @param req - Next.js request containing `{ projectPath }` JSON body.
 * @returns JSON response with project data on success, or error payload with
 *   HTTP 500 on failure.
 */
export async function POST(
  req: NextRequest,
): Promise<
  NextResponse<LoadProjectSuccessResponse | LoadProjectErrorResponse>
> {
  try {
    const body = await req.json();
    const { projectPath } = body as LoadProjectRequestBody;
    const result = await loadProjectFromDisk(projectPath);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load project", details: (error as Error).message },
      { status: 500 },
    );
  }
}
