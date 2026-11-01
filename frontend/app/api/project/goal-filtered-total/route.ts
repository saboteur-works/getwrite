/**
 * @module app/api/project/goal-filtered-total/route
 *
 * Read transport for the writing-goal filtered total (Feature 98, Task 8,
 * FR-35, FR-36).
 *
 * Routes:
 * - `GET /api/project/goal-filtered-total?projectId=` — the
 *   `GoalFilteredTotalResult` from `goal-filtered-total-core.ts`.
 *
 * An `unavailable` result is a typed 200 body (it has no `total` key), never
 * an error status and never a number. `projectId` is validated as a UUID and
 * the project root is derived from it; no client-supplied path is accepted.
 * Membership is evaluated here, in the core, not on the client. Locked-access
 * errors and any other error propagate to `withStorageContext` (401/409/500).
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import { resolveProjectRoot } from "../../../../src/lib/models/project-root-resolver";
import { evaluateGoalFilteredTotal } from "../../../../src/lib/models/goal-filtered-total-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

async function handleGet(req: NextRequest): Promise<Response> {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) return respondInvalidProjectId();
  const result = await evaluateGoalFilteredTotal(projectRoot, new Date());
  return NextResponse.json(result, { status: 200 });
}

export const GET = withStorageContext(handleGet);

export const dynamic = "force-dynamic";
