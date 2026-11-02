/**
 * @module app/api/project/goal-filter/route
 *
 * Transport for the writing-goal filter (Feature 98, Task 7, FR-35, FR-36).
 *
 * Routes:
 * - `PUT /api/project/goal-filter` — body `{ projectId, goalFilter }`;
 *   `goalFilter` is a query AST, or `null` to clear.
 *
 * `projectId` is validated as a UUID and the project root is derived from it
 * by the core; no client-supplied path is accepted. The AST is validated by
 * the core, and its refusal message is returned as the 400 error body.
 * Locked-access errors are rethrown for `withStorageContext` to map to 401/409.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  InvalidGoalFilterError,
  InvalidProjectIdCoreError,
  setGoalFilterCore,
} from "../../../../src/lib/models/goal-filter-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Maps the core's 400-class errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (error instanceof InvalidGoalFilterError) {
    return badRequest(error.message);
  }
  // Locked-access errors (and everything else) propagate to withStorageContext.
  throw error;
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: { projectId?: unknown; goalFilter?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body.");
  }
  if (typeof body !== "object" || body === null || !("goalFilter" in body)) {
    return badRequest("goalFilter must be a filter or null.");
  }
  try {
    const saved = await setGoalFilterCore(
      typeof body.projectId === "string" ? body.projectId : "",
      body.goalFilter,
    );
    return NextResponse.json(saved, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
