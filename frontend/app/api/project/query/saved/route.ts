/**
 * @module app/api/project/query/saved
 *
 * Action-discriminated CRUD endpoint for saved queries.
 *
 * Route:
 * - `POST /api/project/query/saved`
 *
 * All requests carry an `action` field that selects the operation:
 *
 * - `list`   `{ action: "list",   projectId }` → `{ queries: SavedQuery[] }`
 * - `read`   `{ action: "read",   projectId, id }` → `{ query: SavedQuery | null }`
 * - `write`  `{ action: "write",  projectId, query }` → `{ query: SavedQuery }`
 * - `delete` `{ action: "delete", projectId, id }` → `{ deleted: boolean }`
 *
 * Pattern follows `POST /api/project/metadata-schema`.
 */
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import {
  listQueries,
  readQuery,
  writeQuery,
  deleteQuery,
  SavedQuerySchema,
} from "../../../../../src/lib/models/saved-queries";
import { resolveProjectsDir } from "../../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

// ─── Request shapes ───────────────────────────────────────────────────────────

interface ListRequest {
  action: "list";
  projectId: string;
}

interface ReadRequest {
  action: "read";
  projectId: string;
  id: string;
}

interface WriteRequest {
  action: "write";
  projectId: string;
  query: unknown;
}

interface DeleteRequest {
  action: "delete";
  projectId: string;
  id: string;
}

type SavedQueryRequestBody =
  | ListRequest
  | ReadRequest
  | WriteRequest
  | DeleteRequest;

// ─── Route handler ────────────────────────────────────────────────────────────

async function handlePost(req: NextRequest): Promise<Response> {
  let body: SavedQueryRequestBody;
  try {
    body = (await req.json()) as SavedQueryRequestBody;
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
    switch (body.action) {
      case "list": {
        const queries = await listQueries(projectPath);
        return NextResponse.json({ queries });
      }

      case "read": {
        const query = await readQuery(projectPath, body.id);
        return NextResponse.json({ query });
      }

      case "write": {
        const parseResult = SavedQuerySchema.safeParse(body.query);
        if (!parseResult.success) {
          return NextResponse.json(
            {
              error: "Invalid saved query",
              details: parseResult.error.message,
            },
            { status: 400 },
          );
        }
        await writeQuery(projectPath, parseResult.data);
        return NextResponse.json({ query: parseResult.data });
      }

      case "delete": {
        const didDelete = await deleteQuery(projectPath, body.id);
        return NextResponse.json({ deleted: didDelete });
      }

      default:
        return NextResponse.json(
          {
            error: "Invalid action",
            details: "Expected one of: list, read, write, delete",
          },
          { status: 400 },
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json(
      { error: "Saved query operation failed", details: message },
      { status: 500 },
    );
  }
}

export const POST = withStorageContext(handlePost);
