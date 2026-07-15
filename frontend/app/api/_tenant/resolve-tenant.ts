// Last Updated: 2026-07-10

/**
 * @module resolve-tenant
 *
 * The single composition point that maps an inbound request to a tenant
 * (ADR-018: Tenant Resolution — Per-User Data Root; FR1).
 *
 * `resolveTenant` wires together the three layers this feature introduces:
 * - Identity (`app/api/_tenant/identity-source.ts`) — extracts a raw `userId`
 *   claim (or `null`) from the request via the currently configured
 *   `IdentitySource`.
 * - Path/config (`src/lib/models/tenant-path.ts`) — validates that `userId`
 *   against the path-traversal allowlist and derives its isolated
 *   `<data-root>/<userId>/` directory.
 * - Provisioning (this module) — ensures that directory exists before the
 *   request proceeds.
 *
 * No route or call site should duplicate this resolution inline; every path
 * that needs to know "which tenant is this request for, and where does its
 * data live" goes through this function (FR1).
 */
import { getIdentitySource } from "./identity-source";
import { dataRootForUser } from "../../../src/lib/models/tenant-path";
import { defaultProjectsDir } from "../../../src/lib/models/projects-dir";
import { mkdir } from "../../../src/lib/models/io";

/**
 * Data roots already provisioned in this process lifetime.
 *
 * First-request provisioning (FR8) only needs to run once per tenant: after
 * `<data-root>/<userId>/` exists, re-issuing `mkdir` on every subsequent
 * request for that tenant is a wasted filesystem syscall on the request hot
 * path. Memoizing the roots we have already `mkdir`-ed turns O(requests)
 * provisioning calls into O(distinct tenants). The cache is intentionally
 * process-local and best-effort — a fresh process re-provisions on first
 * touch, which is correct because `mkdir(recursive)` is idempotent anyway.
 */
const provisionedRoots = new Set<string>();

/**
 * Test-only hook to clear the provisioned-roots memo so each test starts
 * from a clean slate and can assert on `mkdir` being (or not being) called.
 */
export function __resetProvisionedRootsForTests(): void {
  provisionedRoots.clear();
}

/**
 * Result of resolving a request to a tenant.
 */
export interface ResolvedTenant {
  /** The signed-in user's identifier, or `null` when the request carries no identity. */
  userId: string | null;
  /** The filesystem directory this request's storage operations must be scoped to. */
  dataRoot: string;
}

/**
 * Resolves an inbound request to its tenant: a `userId` (or `null` for the
 * legacy/local-first case) and the `dataRoot` directory that tenant's
 * storage operations must be scoped to.
 *
 * Two paths:
 * - **Null user (FR5)**: when the configured `IdentitySource` yields no
 *   `userId` (no account — the Electron/local-dev case), this returns
 *   `{ userId: null, dataRoot: defaultProjectsDir() }` immediately. This is
 *   deliberately byte-for-byte identical to `withStorageContext`'s
 *   pre-existing hardcoded binding: no validation, no provisioning `mkdir`
 *   runs on this path, because there is no per-user directory to provision.
 * - **Non-null user (FR6, FR8)**: derives `dataRoot` via
 *   `dataRootForUser(userId)`, which itself validates `userId` against the
 *   path-traversal allowlist and reads `GETWRITE_DATA_ROOT` — both
 *   fail-closed (FR12): a `TenantResolutionError` thrown by either check is
 *   intentionally **not** caught here and propagates to the caller, rather
 *   than silently falling back to `defaultProjectsDir()`. Once `dataRoot` is
 *   derived, this best-effort provisions it with an idempotent
 *   `mkdir(dataRoot, { recursive: true })` (FR8) so the request's subsequent
 *   storage operations succeed against an existing directory — but only the
 *   first time this process sees that root (see {@link provisionedRoots}), so
 *   steady-state requests skip the syscall. No lock and no `EEXIST` handling
 *   is needed, matching the codebase's uniform idempotent-mkdir idiom.
 *
 * @param request - The inbound request to resolve a tenant for.
 * @returns The resolved `{ userId, dataRoot }`.
 * @throws {TenantResolutionError} When a non-null `userId` fails the
 *   path-traversal allowlist, or when `GETWRITE_DATA_ROOT` is unset/empty.
 */
export async function resolveTenant(request: Request): Promise<ResolvedTenant> {
  const userId = getIdentitySource().getUserId(request);

  if (userId === null) {
    return { userId: null, dataRoot: defaultProjectsDir() };
  }

  const dataRoot = dataRootForUser(userId);
  if (!provisionedRoots.has(dataRoot)) {
    await mkdir(dataRoot, { recursive: true });
    provisionedRoots.add(dataRoot);
  }
  return { userId, dataRoot };
}
