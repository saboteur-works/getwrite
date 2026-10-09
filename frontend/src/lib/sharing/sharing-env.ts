/**
 * Environment contract for home-network sharing. The values are read from an
 * env object passed in (never from `process.env` directly) so callers and
 * tests control the source.
 */

export const SHARING_DIR_ENV = "GETWRITE_SHARING_DIR";
export const SHARING_ENV = "GETWRITE_SHARING";
export const WINDOW_SECRET_ENV = "GETWRITE_WINDOW_SECRET";

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
