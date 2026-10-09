/**
 * @module sharing-mode
 *
 * Decides whether home-network sharing is effective, given the user's setting
 * and the server environment. Pure: it takes the environment as an argument,
 * never reads `process.env`, and never mutates what it is given (FR-24: the
 * hosted-auth variables are not stripped).
 */

/** Input to {@link resolveSharingMode}. */
export interface SharingModeInput {
  /** The user's recorded sharing setting. */
  enabled: boolean;
  /** The server environment to inspect for hosted-auth configuration. */
  env: Readonly<Record<string, string | undefined>>;
}

/** The decision {@link resolveSharingMode} returns. */
export interface SharingMode {
  /** Whether sharing is actually in effect. */
  effective: boolean;
  /** Whether sharing is enabled but excluded because hosted auth is active. */
  blockedByHostedAuth: boolean;
}

/** True for a defined, non-empty (post-trim) string; false otherwise. */
function isNonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Mirrors `frontend/src/lib/auth/auth-config.ts`'s `isHostedAuthActive()`:
 * active only when both `DATABASE_URL` and `BETTER_AUTH_SECRET` are non-empty.
 *
 * @param env - The environment to inspect.
 * @returns Whether hosted auth would be active for a server given this env.
 */
function isHostedAuthConfigured(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return isNonEmpty(env.DATABASE_URL) && isNonEmpty(env.BETTER_AUTH_SECRET);
}

/**
 * Decides whether sharing is effective.
 *
 * @param input - See {@link SharingModeInput}.
 * @returns Whether sharing is effective, and whether hosted auth blocked it.
 */
export function resolveSharingMode(input: SharingModeInput): SharingMode {
  if (!input.enabled) return { effective: false, blockedByHostedAuth: false };
  const blocked = isHostedAuthConfigured(input.env);
  return { effective: !blocked, blockedByHostedAuth: blocked };
}
