import { NextResponse } from "next/server";
import { isHostedAuthActive } from "../../../src/lib/auth/auth-config";
import { resolveProjectTypes } from "../../../src/lib/projectTypes";
import { isLockedAccessError } from "../../../src/lib/models/locked-access";
import { createSavedProjectType } from "../../../src/lib/project-types-write-core";
import {
  invalidBodyResponse,
  readCappedJson,
  resultResponse,
} from "../../../src/lib/project-types-write-http";

/*
 * `GET` and `POST` here are not wrapped by `withStorageContext`: project
 * types are app-level configuration on the real filesystem (bundled
 * built-ins plus the directory named by `GETWRITE_SAVED_PROJECT_TYPES_DIR`),
 * not project data, so no tenant or project context applies. Nothing in this
 * file reads a path, file name, directory or `source` from the client.
 */

/**
 * Lists every project type through the single resolver (FR-3).
 *
 * Response body: `{ entries, unusable, savedStatus }` where each entry is
 * `{ spec, fileName, source }` (`source` is `"built-in"` or `"saved"`), and
 * `unusable` lists saved files that could not be used as `{ fileName, reason }`.
 * Server file paths are never sent to the client.
 */
export async function GET() {
  try {
    const { entries, unusable, savedStatus } =
      await resolveProjectTypes(isHostedAuthActive());
    return NextResponse.json({
      entries: entries.map(({ spec, fileName, source }) => ({
        spec,
        fileName,
        source,
      })),
      unusable,
      savedStatus,
    });
  } catch (err) {
    // Rethrow a locked-access error rather than folding it into this route's
    // generic 500 shape (FR-14). This `GET` handler is not wrapped by
    // `withStorageContext`, so a rethrow does not resolve to a 401/409 the way
    // it does on the other fixed routes; project types are app-bundled or
    // saved config read from the real filesystem, so none is expected here.
    if (isLockedAccessError(err)) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Cannot read project types", details: msg },
      { status: 500 },
    );
  }
}

/**
 * `POST /api/project-types` creates a saved type. The body is the whole spec
 * (max 256 KiB, refused before parsing); unknown keys are refused. 201
 * `{ fileName, spec }`, or a refusal `{ error, reason, conflictsWith? }`:
 * 400 invalid, 409 id-clash / name-clash, 503 saving-unavailable, 500
 * unreadable / write-failed.
 */
export async function POST(request: Request) {
  const parsed = await readCappedJson(request);
  if (!parsed.ok) return invalidBodyResponse();
  return resultResponse(
    await createSavedProjectType(parsed.value, isHostedAuthActive()),
    201,
  );
}
