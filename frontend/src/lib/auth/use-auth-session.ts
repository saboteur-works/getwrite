"use client";

import { useEffect, useState } from "react";
import { useSession } from "./auth-client";
import { fetchAuthStatus } from "../../store/auth-status-transport-service";

/**
 * @module use-auth-session
 *
 * The shared client-side auth signal (Slice 6, FR21/FR22) behind both the
 * `/login` page's "hosted auth is inactive, don't render a login form"
 * fallback and `ShellSettingsMenu`'s logout affordances.
 *
 * Combines two independent reads:
 * - **`hostedAuthActive`** — `fetchAuthStatus()`
 *   (`auth-status-transport-service.ts`), the runtime truth from
 *   `isHostedAuthActive()` via `GET /api/auth-status`. Defaults to `false`
 *   (fail-safe) until the fetch resolves.
 * - **`session`** — better-auth's `useSession()` (`auth-client.ts`). On a
 *   desktop/local build, the underlying `GET /api/auth/get-session` request
 *   404s (the catch-all route's inactive-path behavior — see
 *   `app/api/auth/[...all]/route.ts`), which better-auth's client
 *   surfaces as `data: null` — so `session` is naturally `null` there too,
 *   independent of the `hostedAuthActive` read.
 *
 * `isAuthenticated` is deliberately `hostedAuthActive && session != null` —
 * gating on both rather than the session alone — so a coincidental
 * non-null session value can never make auth UI appear when hosted auth is
 * supposed to be off (FR22's "never shown when hosted auth is inactive" is
 * enforced at this seam, not left to the session read's own fail-safety
 * alone).
 */
export interface AuthSessionState {
  /** Whether hosted auth (better-auth + PostgreSQL) is active on the server. */
  hostedAuthActive: boolean;
  /** Whether the current caller has an authenticated session under hosted auth. */
  isAuthenticated: boolean;
  /** True until the initial `hostedAuthActive` and session reads have both settled. */
  isLoading: boolean;
}

/** Resolves the combined hosted-auth-active + authenticated-session state for client UI. */
export function useAuthSession(): AuthSessionState {
  const [isHostedAuthActive, setIsHostedAuthActive] = useState(false);
  const [hasResolvedStatus, setHasResolvedStatus] = useState(false);
  const { data: session, isPending } = useSession();

  useEffect(() => {
    let isActive = true;
    void fetchAuthStatus().then((status) => {
      if (isActive) {
        setIsHostedAuthActive(status.hostedAuthActive);
        setHasResolvedStatus(true);
      }
    });
    return () => {
      isActive = false;
    };
  }, []);

  return {
    hostedAuthActive: isHostedAuthActive,
    isAuthenticated: isHostedAuthActive && session != null,
    isLoading: !hasResolvedStatus || isPending,
  };
}
