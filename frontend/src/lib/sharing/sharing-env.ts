/**
 * Environment contract for home-network sharing. The values are read from an
 * env object passed in (never from `process.env` directly) so callers and
 * tests control the source.
 */

export const SHARING_DIR_ENV = "GETWRITE_SHARING_DIR";
export const SHARING_ENV = "GETWRITE_SHARING";
export const WINDOW_SECRET_ENV = "GETWRITE_WINDOW_SECRET";
/** Set by the desktop main process only: the address the server was told to listen on. */
export const BIND_ENV = "GETWRITE_BIND";

const LOOPBACK_BINDS: readonly string[] = ["127.0.0.1", "localhost", "::1"];

export interface SharingEnv {
  /** Directory holding the sharing files (credential store); undefined when unset or empty. */
  sharingDir: string | undefined;
  /** True only when `GETWRITE_SHARING` is exactly "1". */
  sharingOn: boolean;
  /** Per-launch window secret; undefined when unset or empty. */
  windowSecret: string | undefined;
}

export type EnvLike = Readonly<Record<string, string | undefined>>;

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value !== "" ? value : undefined;
}

export function readSharingEnv(env: EnvLike): SharingEnv {
  return {
    sharingDir: nonEmpty(env[SHARING_DIR_ENV]),
    sharingOn: env[SHARING_ENV] === "1",
    windowSecret: nonEmpty(env[WINDOW_SECRET_ENV]),
  };
}

/**
 * True when the server was told to listen beyond loopback (FR-34): the
 * variable is present, even empty, and not exactly a loopback name. Absent
 * means undeclared and is false, so `pnpm dev`, hosted deployments and tests
 * that never set it are unchanged.
 */
export function bindBeyondLoopback(env: EnvLike): boolean {
  const value = env[BIND_ENV];
  if (value === undefined) return false;
  return !LOOPBACK_BINDS.includes(value);
}
