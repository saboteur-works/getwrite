/**
 * @module app/api/project/tags/route
 *
 * API endpoint for listing, creating, and querying project-scoped tags.
 *
 * Route:
 * - `POST /api/project/tags`
 *
 * Expected body (list all project tags):
 * - `{ action: "list", projectId: string }`
 *
 * Expected body (create tag):
 * - `{ action: "create", projectId: string, name: string, color?: string }`
 *
 * Expected body (get tag IDs assigned to a resource):
 * - `{ action: "assignments", projectId: string, resourceId: string }`
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { listTags, createTag } from "../../../../src/lib/models/tags";
import { PROJECT_FILENAME } from "../../../../src/lib/models/project-config";
import type { Project } from "../../../../src/lib/models/types";
import { resolveProjectsDir } from "../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

interface ListTagsRequest {
  action: "list";
  projectId: string;
}

interface CreateTagRequest {
  action: "create";
  projectId: string;
  name: string;
  color?: string;
}

interface AssignmentsRequest {
  action: "assignments";
  projectId: string;
  resourceId: string;
}

type TagsRequestBody = ListTagsRequest | CreateTagRequest | AssignmentsRequest;

async function handlePost(req: NextRequest): Promise<Response> {
  let body: TagsRequestBody;
  try {
    body = (await req.json()) as TagsRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(body.projectId);
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }
  const projectPath = path.join(resolveProjectsDir(), validatedProjectId);

  try {
    if (body.action === "list") {
      const tags = await listTags(projectPath);
      return NextResponse.json({ tags });
    }

    if (body.action === "create") {
      const tag = await createTag(projectPath, body.name, body.color);
      return NextResponse.json({ tag });
    }

    if (body.action === "assignments") {
      const raw = await fs.readFile(
        path.join(projectPath, PROJECT_FILENAME),
        "utf8",
      );
      const project = JSON.parse(raw) as Project;
      const tagIds = project.config?.tagAssignments?.[body.resourceId] ?? [];
      return NextResponse.json({ tagIds });
    }

    return NextResponse.json(
      {
        error: "Invalid action",
        details: "Expected 'list', 'create', or 'assignments'",
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Tags operation failed", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export const POST = withStorageContext(handlePost);
