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
import { loadProjectFromDisk } from "../../../src/lib/models/project-loader";

/**
 * Loads a project and related entities from the local filesystem.
 *
 * @param req - Next.js request containing `{ projectPath }` JSON body.
 * @returns JSON response with project data on success, or error payload with
 *   HTTP 500 on failure.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { projectPath } = (await req.json()) as { projectPath: string };
    return NextResponse.json(await loadProjectFromDisk(projectPath));
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load project", details: (error as Error).message },
      { status: 500 },
    );
  }
}
