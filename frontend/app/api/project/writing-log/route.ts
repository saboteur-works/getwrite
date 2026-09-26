/**
 * @module app/api/project/writing-log/route
 *
 * Transport for the daily writing log (Feature 59, FR-9).
 *
 * Routes:
 * - `GET /api/project/writing-log?projectId=&from=&to=` — aggregate for the
 *   client's local-day window (`from`/`to` are ISO instants; validated by
 *   `getWritingLogAggregateCore`, never a path component).
 * - `PUT /api/project/writing-log` — body `{ projectId, dailyWordGoal }`;
 *   `dailyWordGoal` is a non-negative integer, or `null` to clear.
 *
 * `projectId` is validated as a UUID and the project root is derived from it
 * by the core; no client-supplied path is accepted. Locked-access errors are
 * rethrown for `withStorageContext` to map to 401/409.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  getWritingLogAggregateCore,
  InvalidDailyWordGoalError,
  InvalidProjectIdCoreError,
  InvalidWritingLogWindowError,
  setDailyWordGoalCore,
} from "../../../../src/lib/models/writing-log-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Maps the cores' 400-class errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (
    error instanceof InvalidWritingLogWindowError ||
    error instanceof InvalidDailyWordGoalError
  ) {
    return badRequest(error.message);
  }
  // Locked-access errors (and everything else) propagate to withStorageContext.
  throw error;
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  try {
    const aggregate = await getWritingLogAggregateCore(
      params.get("projectId") ?? "",
      params.get("from"),
      params.get("to"),
    );
    return NextResponse.json(aggregate, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: { projectId?: unknown; dailyWordGoal?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const goal = body.dailyWordGoal;
  if (goal !== null && typeof goal !== "number") {
    return badRequest("dailyWordGoal must be a non-negative integer or null.");
  }
  try {
    const saved = await setDailyWordGoalCore(
      typeof body.projectId === "string" ? body.projectId : "",
      goal,
    );
    return NextResponse.json(saved, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const GET = withStorageContext(handleGet);
export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
