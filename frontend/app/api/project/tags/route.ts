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
 *   Refused like `update` below when the name is blank or already used.
 *
 * Expected body (rename/recolour tag; an absent `color` clears it):
 * - `{ action: "update", projectId: string, tagId: string, name: string, color?: string }`
 *   A refused name or colour is 400 `{ error: "Tag refused", details }`
 *   with a message for the writer; an unknown `tagId` is 404.
 *
 * Expected body (get tag IDs assigned to a resource):
 * - `{ action: "assignments", projectId: string, resourceId: string }`
 */
import { NextRequest, NextResponse } from "next/server";
import {
  InvalidProjectIdCoreError,
  createTagCore,
  listTagAssignmentsCore,
  listTagsCore,
  resolveTagsProjectRootOrThrow,
  updateTagCore,
} from "../../../../src/lib/models/tags-crud-core";
import {
  TagNotFoundError,
  TagRefusedError,
} from "../../../../src/lib/models/tags";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import { isLockedAccessError } from "../../../../src/lib/models/locked-access";
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

interface UpdateTagRequest {
  action: "update";
  projectId: string;
  tagId: string;
  name: string;
  color?: string;
}

interface AssignmentsRequest {
  action: "assignments";
  projectId: string;
  resourceId: string;
}

type TagsRequestBody =
  | ListTagsRequest
  | CreateTagRequest
  | UpdateTagRequest
  | AssignmentsRequest;

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

  // Resolve/validate projectId up front, matching the pre-lift route's
  // order: an invalid projectId is reported even when `action` is also
  // unrecognized (the per-action core calls below re-resolve internally;
  // this call exists purely to preserve that ordering).
  try {
    resolveTagsProjectRootOrThrow(body.projectId);
  } catch (error) {
    if (error instanceof InvalidProjectIdCoreError) {
      return respondInvalidProjectId();
    }
    throw error;
  }

  try {
    if (body.action === "list") {
      const tags = await listTagsCore(body.projectId);
      return NextResponse.json({ tags });
    }

    if (body.action === "create") {
      if (typeof body.name !== "string") {
        return NextResponse.json(
          { error: "Invalid request", details: "'name' must be a string" },
          { status: 400 },
        );
      }
      const tag = await createTagCore(body.projectId, body.name, body.color);
      return NextResponse.json({ tag });
    }

    if (body.action === "update") {
      if (typeof body.tagId !== "string" || typeof body.name !== "string") {
        return NextResponse.json(
          {
            error: "Invalid request",
            details: "'tagId' and 'name' must be strings",
          },
          { status: 400 },
        );
      }
      const tag = await updateTagCore(body.projectId, body.tagId, {
        name: body.name,
        color: typeof body.color === "string" ? body.color : undefined,
      });
      return NextResponse.json({ tag });
    }

    if (body.action === "assignments") {
      const tagIds = await listTagAssignmentsCore(
        body.projectId,
        body.resourceId,
      );
      return NextResponse.json({ tagIds });
    }

    return NextResponse.json(
      {
        error: "Invalid action",
        details: "Expected 'list', 'create', 'update', or 'assignments'",
      },
      { status: 400 },
    );
  } catch (error) {
    if (isLockedAccessError(error)) {
      throw error;
    }
    if (error instanceof TagRefusedError) {
      return NextResponse.json(
        { error: "Tag refused", details: error.message },
        { status: 400 },
      );
    }
    if (error instanceof TagNotFoundError) {
      return NextResponse.json(
        { error: "Tag not found", details: error.message },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Tags operation failed", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export const POST = withStorageContext(handlePost);
