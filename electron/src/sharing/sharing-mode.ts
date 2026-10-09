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

/** Loopback only: the server is unreachable from any other device. */
const LOOPBACK_HOSTNAME = "127.0.0.1";
/** Every IPv4 interface: reachable from the home network; the gate is the control. */
const ALL_INTERFACES_HOSTNAME = "0.0.0.0";

/**
 * The address the server listens on: all interfaces only for effective
 * sharing, loopback for off, blocked by hosted auth, and a missing or corrupt
 * setting (FR-3, FR-4, FR-24).
 *
 * @param mode - The decision from {@link resolveSharingMode}.
 * @returns The `HOSTNAME` value for the server.
 */
export function resolveServerHostname(mode: SharingMode): string {
  return mode.effective ? ALL_INTERFACES_HOSTNAME : LOOPBACK_HOSTNAME;
}

/** The three server env entries derived from one {@link SharingMode}. */
export interface ServerBindEnv {
  HOSTNAME: string;
  /** Declares the bind to the server so it can fail closed (FR-34). */
  GETWRITE_BIND: string;
  /** "1" exactly when the gate is on. */
  GETWRITE_SHARING: "0" | "1";
}

/**
 * The bind and the gate-on signal, both from the one `mode`, so no second
 * expression can disagree with the first: a non-loopback `HOSTNAME` always
 * comes with `GETWRITE_SHARING` "1" (FR-34).
 *
 * @param mode - The decision from {@link resolveSharingMode}.
 * @returns `HOSTNAME`, `GETWRITE_BIND` and `GETWRITE_SHARING` for the server env.
 */
export function buildServerBindEnv(mode: SharingMode): ServerBindEnv {
  const hostname = resolveServerHostname(mode);
  return {
    HOSTNAME: hostname,
    GETWRITE_BIND: hostname,
    GETWRITE_SHARING: mode.effective ? "1" : "0",
  };
}
