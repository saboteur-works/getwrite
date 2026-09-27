/**
 * @module app/api/project/word-count-goal/route
 *
 * Transport for the project-wide word-count goal (Feature 61, Task 2).
 *
 * Routes:
 * - `PUT /api/project/word-count-goal` — body `{ projectId, wordCountGoal }`;
 *   `wordCountGoal` is a non-negative integer, or `null` to clear.
 *
 * `projectId` is validated as a UUID and the project root is derived from it
 * by the core; no client-supplied path is accepted. Locked-access errors are
 * rethrown for `withStorageContext` to map to 401/409.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  InvalidProjectIdCoreError,
  InvalidWordCountGoalError,
  setWordCountGoalCore,
} from "../../../../src/lib/models/word-count-goal-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Maps the core's 400-class errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (error instanceof InvalidWordCountGoalError) {
    return badRequest(error.message);
  }
  // Locked-access errors (and everything else) propagate to withStorageContext.
  throw error;
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: { projectId?: unknown; wordCountGoal?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const goal = body.wordCountGoal;
  if (goal !== null && typeof goal !== "number") {
    return badRequest("wordCountGoal must be a non-negative integer or null.");
  }
  try {
    const saved = await setWordCountGoalCore(
      typeof body.projectId === "string" ? body.projectId : "",
      goal,
    );
    return NextResponse.json(saved, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
