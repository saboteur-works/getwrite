import { NextResponse } from "next/server";
import { isHostedAuthActive } from "../../../src/lib/auth/auth-config";

/**
 * GET /api/auth-status
 *
 * The client-facing hosted-vs-local signal for Slice 6 (FR21/FR22,
 * `specs/features/auth-provider.md`). A GetWrite-owned route — deliberately
 * **not** part of the better-auth catch-all mount
 * (`app/api/auth/[...all]/route.ts`) — that answers a single narrow
 * question: "is hosted auth active on this server", by calling the same
 * `isHostedAuthActive()` the server-side redirect gate
 * (`session-guard.ts`) and 401 enforcement already use, so the client never
 * has its own, possibly-drifting copy of that truth.
 *
 * Presentational only. Desktop/local (no `DATABASE_URL`/`BETTER_AUTH_SECRET`)
 * never renders a login/logout affordance regardless of this route's
 * response — the real enforcement is the server-side redirect
 * (`app/(app)/layout.tsx`) and the `withStorageContext` 401 gate, neither of
 * which this route participates in. This route exists purely so the client
 * can decide what UI to *show*, mirroring `version-check`'s
 * `fetchUpdateCheck` precedent (`update-check-transport-service.ts`).
 */
export function GET(): NextResponse<{ hostedAuthActive: boolean }> {
  return NextResponse.json({ hostedAuthActive: isHostedAuthActive() });
}
