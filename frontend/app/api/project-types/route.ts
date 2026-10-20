import { NextResponse } from "next/server";
import { resolveProjectTypes } from "../../../src/lib/projectTypes";
import { isLockedAccessError } from "../../../src/lib/models/locked-access";

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
    const { entries, unusable, savedStatus } = await resolveProjectTypes();
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
