/**
 * @module auth-status-transport-service
 *
 * HTTP transport for the hosted-vs-local client signal (Slice 6, FR21/FR22).
 * Calls `GET /api/auth-status` and returns the typed result. Mirrors
 * `update-check-transport-service.ts`'s `fetchUpdateCheck` contract exactly:
 * any network or parse failure resolves to `{ hostedAuthActive: false }`, the
 * fail-safe default — a failed check must never cause auth UI to render on
 * what could be a desktop/local build, so callers never have to guard
 * against errors themselves.
 */

export interface AuthStatus {
  hostedAuthActive: boolean;
}

const NOT_HOSTED: AuthStatus = { hostedAuthActive: false };

/** Fetches the current hosted-auth status. Never throws. */
export async function fetchAuthStatus(): Promise<AuthStatus> {
  try {
    const response = await fetch("/api/auth-status");
    if (!response.ok) {
      return NOT_HOSTED;
    }
    return (await response.json()) as AuthStatus;
  } catch {
    return NOT_HOSTED;
  }
}
