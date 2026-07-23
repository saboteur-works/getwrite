import "server-only";

import { isHostedAuthActive } from "./auth-config";
import { getAuthServer } from "./auth-server";

/**
 * @module verify-email-core
 *
 * The pure decision core behind `app/verify-email/page.tsx` (Slice 6,
 * FR21). Split out from the page itself for the same reason
 * `session-guard.ts`'s `shouldRedirectToLogin` is split from
 * `app/(app)/layout.tsx`: constructing a real App Router async server
 * component render isn't practical in this repo's jsdom-based Vitest setup,
 * so the actual "what happened" decision is a plain async function that can
 * be unit-tested directly, and the page stays a thin wrapper that reads
 * `searchParams`, calls this function, and renders the corresponding
 * message.
 *
 * **Server-side token consumption, per Finding 3 (Task 6's brief).**
 * Rather than shipping a client bundle that calls the better-auth client's
 * `verifyEmail(...)` on mount, this runs `getAuthServer().api.verifyEmail(...)`
 * directly in the Node runtime — the same `auth.api.<method>(...)` calling
 * convention `session-guard.ts` already uses for `getSession`. This is more
 * robust for a page reached by clicking a plain email link (no client JS
 * dependency for the verification itself) and matches FR20's Node-runtime-
 * first rationale for this codebase's auth surfaces.
 */

export type VerifyEmailOutcome =
  | { status: "not-applicable" }
  | { status: "missing-token" }
  | { status: "success" }
  | { status: "failure" };

/**
 * Consumes a `?token=` query param against better-auth's `/verify-email`
 * endpoint and resolves the outcome the page should render.
 *
 * - `"not-applicable"` — hosted auth is inactive; no verification is
 *   possible or expected (desktop/local never emails this link).
 * - `"missing-token"` — hosted auth is active but no token was supplied.
 * - `"success"` — the token was valid and the account is now verified.
 * - `"failure"` — the token was invalid, expired, or already consumed;
 *   better-auth's `verifyEmail` endpoint throws in every such case, which
 *   this function catches and normalizes to `"failure"` rather than letting
 *   an error propagate to the page (an expired link is an expected, not
 *   exceptional, outcome for this page).
 */
export async function verifyEmailToken(
  token: string | undefined,
): Promise<VerifyEmailOutcome> {
  if (!isHostedAuthActive()) {
    return { status: "not-applicable" };
  }
  if (!token) {
    return { status: "missing-token" };
  }

  try {
    await getAuthServer().api.verifyEmail({ query: { token } });
    return { status: "success" };
  } catch {
    return { status: "failure" };
  }
}
