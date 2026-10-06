/**
 * @module app/api/project/mention-highlight-duration/route
 *
 * Transport for the per-project mention-jump highlight duration (Entity
 * mention navigation, Task 7).
 *
 * Routes:
 * - `PUT /api/project/mention-highlight-duration` — body
 *   `{ projectId, mentionHighlightDurationSeconds }`;
 *   `mentionHighlightDurationSeconds` is an integer from 1 to 10 inclusive,
 *   or `null` to clear.
 *
 * `projectId` is validated as a UUID and the project root is derived from it
 * by the core; no client-supplied path is accepted. Locked-access errors are
 * rethrown for `withStorageContext` to map to 401/409.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  InvalidMentionHighlightDurationError,
  InvalidProjectIdCoreError,
  setMentionHighlightDurationCore,
} from "../../../../src/lib/models/mention-highlight-duration-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Maps the core's 400-class errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (error instanceof InvalidMentionHighlightDurationError) {
    return badRequest(error.message);
  }
  // Locked-access errors (and everything else) propagate to withStorageContext.
  throw error;
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: { projectId?: unknown; mentionHighlightDurationSeconds?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const seconds = body.mentionHighlightDurationSeconds;
  if (seconds !== null && typeof seconds !== "number") {
    return badRequest(
      "mentionHighlightDurationSeconds must be an integer from 1 to 10 inclusive, or null.",
    );
  }
  try {
    const saved = await setMentionHighlightDurationCore(
      typeof body.projectId === "string" ? body.projectId : "",
      seconds,
    );
    return NextResponse.json(saved, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
