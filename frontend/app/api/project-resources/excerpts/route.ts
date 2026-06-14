/**
 * @module app/api/project-resources/excerpts/route
 *
 * Batch endpoint returning short text excerpts for a bounded set of resources
 * (e.g. the cards visible in one Organizer folder), read straight from each
 * `content.txt`. Scoped + on-demand so it stays off the project load path.
 *
 * Route: `POST /api/project-resources/excerpts`
 * Body:    `{ projectPath: string; resourceIds: string[]; maxChars?: number }`
 * Success: `{ excerpts: Record<string, string> }` (only resources with content)
 * Failure: `{ error: string }`
 */
import { NextRequest, NextResponse } from "next/server";
import { readResourceExcerpts } from "../../../../src/lib/models/resource-persistence";

interface ExcerptsBody {
  projectPath: string;
  resourceIds: string[];
  maxChars?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ExcerptsBody;
  try {
    body = (await req.json()) as ExcerptsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { projectPath, resourceIds, maxChars } = body;
  if (!projectPath || typeof projectPath !== "string") {
    return NextResponse.json(
      { error: "Missing required field: projectPath." },
      { status: 400 },
    );
  }
  if (!Array.isArray(resourceIds)) {
    return NextResponse.json(
      { error: "resourceIds must be an array." },
      { status: 400 },
    );
  }

  try {
    const excerpts = readResourceExcerpts(projectPath, resourceIds, maxChars);
    return NextResponse.json({ excerpts });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read excerpts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
