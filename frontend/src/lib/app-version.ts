/**
 * @module app-version
 *
 * The running GetWrite version, inlined at build time from `package.json` via
 * `NEXT_PUBLIC_APP_VERSION` (see `next.config.mjs`). Empty string when unset
 * (e.g. some test environments) so callers can treat it as "unknown".
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
