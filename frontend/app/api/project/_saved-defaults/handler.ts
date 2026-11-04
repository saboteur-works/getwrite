/**
 * @module app/api/project/_saved-defaults/handler
 *
 * Shared `PUT` handler for the saved-defaults routes (Feature 101, FR-2,
 * FR-32). Body `{ projectId, excludedResourceIds }`; `excludedResourceIds` is
 * a list of resource ids, or `null` to clear. `projectId` is validated and the
 * project root derived from it by the core; no client-supplied path is
 * accepted. Refusal messages come from the core. Locked-access errors are
 * rethrown for `withStorageContext` to map to 401/409.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  InvalidProjectIdCoreError,
  InvalidSavedDefaultsError,
} from "../../../../src/lib/models/saved-defaults-core";

type SetCore = (
  projectId: string,
  excludedResourceIds: unknown,
) => Promise<{ excludedResourceIds: string[] | undefined }>;

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Maps the core's 400-class errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (error instanceof InvalidSavedDefaultsError) {
    return badRequest(error.message);
  }
  throw error;
}

/** Builds the `PUT` handler for one setter core. */
export function createSavedDefaultsPutHandler(
  setCore: () => SetCore,
): (req: NextRequest) => Promise<Response> {
  return async (req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      !("excludedResourceIds" in body)
    ) {
      return badRequest("excludedResourceIds must be a list or null.");
    }
    const { projectId, excludedResourceIds } = body as {
      projectId?: unknown;
      excludedResourceIds?: unknown;
    };
    try {
      const saved = await setCore()(
        typeof projectId === "string" ? projectId : "",
        excludedResourceIds,
      );
      return NextResponse.json(saved, { status: 200 });
    } catch (error) {
      return mapCoreError(error);
    }
  };
}
