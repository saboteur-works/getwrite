import { NextResponse } from "next/server";

import {
  limitsRoleFor,
  type LimitsRole,
} from "../../../../src/lib/sharing/limits-check";

/**
 * GET /api/sharing/limits (Feature 77, FR-16 to FR-19)
 *
 * Presentational read of the caller's own limits, modelled on
 * `auth-status`. The gate has already refused an unpaired caller; this route
 * only reports what the forwarded classification means for limits. Never
 * cached, no storage context, and it accepts no change to a limit.
 */
export const dynamic = "force-dynamic";

export function GET(request: Request): NextResponse<LimitsRole> {
  return NextResponse.json(limitsRoleFor(request), {
    headers: { "Cache-Control": "no-store" },
  });
}
