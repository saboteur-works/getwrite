/**
 * @module app/api/project/modules/route
 *
 * Transport for the per-project module switch (Feature 103, FR-5, FR-7, FR-30).
 *
 * Routes:
 * - `PUT /api/project/modules` — body `{ projectId, moduleId, enabled }`;
 *   sets `config.modules[moduleId]` and returns `{ modules }`.
 *
 * The body is validated by the core before any lock or write: `projectId` as a
 * UUID (the project root is derived from it; no client-supplied path), the
 * module id by format, `enabled` as a boolean, and a field outside those three
 * is refused. The core's refusal message is returned as the 400 error body and
 * never echoes the client's input. Locked-access errors are rethrown for
 * `withStorageContext` to map to 401/409.
 *
 * Not a paired-device limit: the write overwrites one config entry and deletes
 * no writer data, like `POST /api/project/features` (see the FR-13 inventory in
 * `specs/features/sources-module-seam/experiments.md`).
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  InvalidModuleSwitchError,
  InvalidProjectIdCoreError,
  setModuleEnabledCore,
} from "../../../../src/lib/models/module-config-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Maps the core's 400-class errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (error instanceof InvalidModuleSwitchError) {
    return badRequest(error.message);
  }
  // Locked-access errors (and everything else) propagate to withStorageContext.
  throw error;
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  try {
    return NextResponse.json(await setModuleEnabledCore(body), { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
