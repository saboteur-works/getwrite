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
 * - `list`   `{ action: "list",   projectPath }` → `{ queries: SavedQuery[] }`
 * - `read`   `{ action: "read",   projectPath, id }` → `{ query: SavedQuery | null }`
 * - `write`  `{ action: "write",  projectPath, query }` → `{ query: SavedQuery }`
 * - `delete` `{ action: "delete", projectPath, id }` → `{ deleted: boolean }`
 *
 * Pattern follows `POST /api/project/metadata-schema`.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  listQueries,
  readQuery,
  writeQuery,
  deleteQuery,
  SavedQuerySchema,
} from "../../../../../src/lib/models/saved-queries";
import type { SavedQuery } from "../../../../../src/lib/models/saved-queries";

// ─── Request shapes ───────────────────────────────────────────────────────────

interface ListRequest {
  action: "list";
  projectPath: string;
}

interface ReadRequest {
  action: "read";
  projectPath: string;
  id: string;
}

interface WriteRequest {
  action: "write";
  projectPath: string;
  query: unknown;
}

interface DeleteRequest {
  action: "delete";
  projectPath: string;
  id: string;
}

type SavedQueryRequestBody =
  | ListRequest
  | ReadRequest
  | WriteRequest
  | DeleteRequest;

// ─── Response shapes ──────────────────────────────────────────────────────────

interface ListResponse {
  queries: SavedQuery[];
}

interface ReadResponse {
  query: SavedQuery | null;
}

interface WriteResponse {
  query: SavedQuery;
}

interface DeleteResponse {
  deleted: boolean;
}

interface ErrorResponse {
  error: string;
  details: string;
}

type SavedQueryResponse =
  | ListResponse
  | ReadResponse
  | WriteResponse
  | DeleteResponse
  | ErrorResponse;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
): Promise<NextResponse<SavedQueryResponse>> {
  let body: SavedQueryRequestBody;
  try {
    body = (await req.json()) as SavedQueryRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  try {
    if (body.action === "list") {
      const queries = await listQueries(body.projectPath);
      return NextResponse.json({ queries });
    }

    if (body.action === "read") {
      const query = await readQuery(body.projectPath, body.id);
      return NextResponse.json({ query });
    }

    if (body.action === "write") {
      const parseResult = SavedQuerySchema.safeParse(body.query);
      if (!parseResult.success) {
        return NextResponse.json(
          { error: "Invalid saved query", details: parseResult.error.message },
          { status: 400 },
        );
      }
      await writeQuery(body.projectPath, parseResult.data);
      return NextResponse.json({ query: parseResult.data });
    }

    if (body.action === "delete") {
      const deleted = await deleteQuery(body.projectPath, body.id);
      return NextResponse.json({ deleted });
    }

    return NextResponse.json(
      {
        error: "Invalid action",
        details: "Expected one of: list, read, write, delete",
      },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json(
      { error: "Saved query operation failed", details: message },
      { status: 500 },
    );
  }
}
