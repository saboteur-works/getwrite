// Last Updated: 2026-07-22

import "server-only";

/**
 * @module signup-allowlist
 *
 * The env-configured email allowlist gate for hosted signup (FR12,
 * `specs/features/auth-provider.md`). This is the policy `auth-server.ts`'s
 * `databaseHooks.user.create.before` hook consults before letting
 * better-auth create a new user record — see `auth-server.ts`'s module doc
 * for how the hook is wired in and why `disableSignUp: true` (Task 1's
 * config) could not itself express "invited/allowlisted users only": that
 * option is an unconditional kill switch better-auth checks before any
 * hook runs, not a selective gate.
 *
 * **Env var: `AUTH_SIGNUP_ALLOWLIST`.** A comma-and/or-newline-separated
 * list of entries. Each entry is either:
 * - An exact email address (`someone@example.com`) — matches that address
 *   only.
 * - A domain wildcard (`@example.com`) — matches any address at that
 *   domain.
 *
 * Whitespace around entries is trimmed; empty entries (e.g. from a trailing
 * separator) are ignored. Matching is case-insensitive on both sides: the
 * configured entries and the submitted email are both lowercased before
 * comparison. Example value:
 *
 * ```
 * AUTH_SIGNUP_ALLOWLIST="founder@getwrite.dev, @saboteur.dev
 * beta-tester@example.com"
 * ```
 *
 * **Unconfigured is open, not closed.** When `AUTH_SIGNUP_ALLOWLIST` is
 * unset or blank, {@link isEmailAllowlisted} returns `true` for every
 * email — i.e. the gate is a no-op and signup is open. This matches FR12's
 * self-host flexibility ("Self-hosters may configure their own instance as
 * open, invite-gated, or allowlist-gated; this slice does not mandate a
 * specific policy for self-host"): a self-hoster who never sets this var
 * gets today's open-signup behavior; the Saboteur-hosted primary instance
 * is expected to always set it (see `docs/`/README deployment guidance).
 *
 * **Env is read fresh on every call — no module-level caching.** Mirrors
 * `auth-config.ts`'s `isHostedAuthActive()` idiom: this function is cheap
 * (string parsing, no I/O), and tests toggle
 * `process.env.AUTH_SIGNUP_ALLOWLIST` between assertions within a single
 * process and expect the very next call to observe the change.
 */

/**
 * Returns whether `email` is permitted to sign up under the
 * `AUTH_SIGNUP_ALLOWLIST` policy described in this module's doc comment.
 *
 * `email` is matched case-insensitively; callers do not need to
 * pre-lowercase it (better-auth's signup endpoint already lowercases the
 * email before this is consulted, but this function lowercases
 * defensively regardless, so it behaves correctly if called from anywhere
 * else too).
 */
export function isEmailAllowlisted(email: string): boolean {
  const entries = parseAllowlist(process.env.AUTH_SIGNUP_ALLOWLIST);
  if (entries.length === 0) {
    return true;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.slice(normalizedEmail.indexOf("@"));

  return entries.some((entry) =>
    entry.startsWith("@") ? entry === domain : entry === normalizedEmail,
  );
}

/**
 * Splits a raw `AUTH_SIGNUP_ALLOWLIST` value into normalized entries:
 * split on commas and/or newlines, trimmed, lowercased, empty entries
 * dropped. Returns an empty array for an unset, empty, or whitespace-only
 * value.
 */
function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[,\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}
