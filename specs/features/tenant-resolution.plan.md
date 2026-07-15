# Implementation Plan: Tenant Resolution (ADR-018)

Spec: `specs/features/tenant-resolution.md` · ADR: `adr-018-tenant-resolution-per-user-data-root.md`
Branch: `feat/tenant-resolution` (off `main`)

## Design summary

Today `withStorageContext` (`frontend/app/api/_tenant/with-storage-context.ts`)
binds every request to `defaultProjectsDir()`. This feature inserts a
`resolveTenant(request)` call there. The seam decomposes into three new
modules plus one edit:

- **Pure path/config layer** (`src/lib/models/tenant-path.ts`) — the strict
  `userId` allowlist guard, `GETWRITE_DATA_ROOT` read (fail-closed), and
  `<data-root>/<userId>/` derivation. Holds FR6, FR7, FR12. Fully unit-testable,
  no `Request` dependency.
- **Identity layer** (`app/api/_tenant/identity-source.ts`) — the `IdentitySource`
  interface + the env-gated interim dev source. Holds FR2, FR3, FR4.
- **Composition + provisioning** (`app/api/_tenant/resolve-tenant.ts`) —
  `resolveTenant(request)` wires identity → path → provisioning mkdir. Holds
  FR1, FR5, FR8.
- **Wiring** — edit `with-storage-context.ts` to call `resolveTenant`; the
  wrapper becomes `async` (all 4 wrapped routes are already async handlers, so
  this is behavior-preserving for them). Holds FR9, FR10.

`resolveTenant` is async because provisioning (FR8) awaits `mkdir`; the wrapper
extracts the inbound request as `args[0]` (Next.js always passes it, even to
zero-arity handlers) and passes it through. `getStorageAdapter()` continues to
supply the adapter half unchanged (FR9). `StorageContext`, `runInStorageContext`,
`runForTenant`, CLI, indexer-queue, backlinks-watcher are all untouched
(FR10/FR11).

## Tasks (TDD; each ends green on `pnpm --filter getwrite-frontend typecheck && lint && test:ci`)

### Task 1 — Pure tenant-path module (FR6, FR7, FR12)
New `frontend/src/lib/models/tenant-path.ts`:
- `validateUserId(userId: string): string` — returns it iff it matches
  `^[A-Za-z0-9_-]{1,64}$`; otherwise throws a typed, identifiable error
  (`TenantResolutionError` or similar). The charset admits no `.`, `/`, `\`,
  null bytes, Unicode, or empty string, so traversal is impossible by
  construction.
- `dataRootBase(): string` — returns `process.env.GETWRITE_DATA_ROOT` iff
  present and non-empty; otherwise throws the typed error (FR12 fail-closed).
- `dataRootForUser(userId: string): string` —
  `path.join(dataRootBase(), validateUserId(userId))`.
- Tests (new `tests/tenant-path.test.ts`): every FR7 adversarial input
  (`../otherUser`, `../../etc`, `/etc/passwd`, `..%2Fother`, embedded null
  byte, `""`, `foo/bar`, `foo/../../bar`) is rejected; a valid id
  (`abc_123-XY`) yields `<base>/<id>`; missing/empty `GETWRITE_DATA_ROOT`
  throws (fail-closed), asserted via a scoped env override.

### Task 2 — IdentitySource interface + env-gated interim source (FR2, FR3, FR4)
New `frontend/app/api/_tenant/identity-source.ts`:
- `export interface IdentitySource { getUserId(request: Request): string | null }`
- `devIdentitySource` — returns `null` unless `GETWRITE_ENABLE_DEV_IDENTITY`
  is set; when set, reads the userId from a documented dev-only request header
  (e.g. `x-getwrite-dev-user`), returning `null` if the header is absent.
- A one-time loud `console.warn` when the flag is active (dev identity enabled
  — not production auth).
- `getIdentitySource(): IdentitySource` — returns `devIdentitySource` when the
  flag is set, else a null source that always returns `null`. This is the
  single swap point for the future real auth source.
- Tests (new `tests/identity-source.test.ts`): inert (`null`) when flag unset
  regardless of header; reads header when flag set; returns `null` when flag
  set but header absent. Env + `console.warn` mocked/scoped per test.

### Task 3 — resolveTenant composition + provisioning (FR1, FR5, FR8)
New `frontend/app/api/_tenant/resolve-tenant.ts`:
- `export async function resolveTenant(request: Request):
  Promise<{ userId: string | null; dataRoot: string }>`
  - `const userId = getIdentitySource().getUserId(request)`
  - `userId === null` → `{ userId: null, dataRoot: defaultProjectsDir() }` (FR5;
    no provisioning, no validation — legacy path untouched).
  - non-null → `const dataRoot = dataRootForUser(userId)` (validates via Task 1);
    `await mkdir(dataRoot, { recursive: true })` (FR8, best-effort idempotent,
    no lock per triage); return `{ userId, dataRoot }`. A thrown validation /
    missing-config error propagates (fail-closed) — not swallowed.
- Tests (new `tests/resolve-tenant.test.ts`) with a fake `IdentitySource`
  injected (via a seam — either a settable source or by driving the env flag +
  header): null user → `defaultProjectsDir()`, no mkdir; valid user →
  `<base>/<id>` and mkdir invoked; invalid user → throws; missing
  `GETWRITE_DATA_ROOT` → throws. mkdir intercepted via the in-memory storage
  adapter or a spy.

### Task 4 — Wire into withStorageContext (FR9, FR10)
Edit `frontend/app/api/_tenant/with-storage-context.ts`:
- Make the returned wrapper `async`; `const request = args[0] as Request | undefined`;
  `const { dataRoot } = await resolveTenant(request ?? new Request("http://localhost"))`
  (or guard: if no request, treat as null user → `defaultProjectsDir()`), then
  `runInStorageContext({ tenantRoot: dataRoot, adapter: getStorageAdapter() }, () => handler(...args))`.
- Update the now-false module JSDoc (lines 17–23) that says `tenantRoot` is
  deliberately `defaultProjectsDir()` — it now delegates to `resolveTenant`.
- Confirm the 4 wrapped routes (`projects`, `projects/[projectId]/reorder`,
  `project/[project-id]/reindex`, `project/[project-id]/search`) still typecheck
  with the async wrapper and their existing tests pass.

### Task 5 — Full-suite verification + CLI regression check (FR13, FR11)
- `pnpm --filter getwrite-frontend typecheck && lint && test:ci` green
  (includes the 3 new test files).
- `pnpm --filter getwrite-cli typecheck && test` green — proves FR11 (CLI /
  runForTenant / indexer untouched).

## Out of scope (per spec Non-goals)
Real auth provider; `node:fs`→adapter migration; teams/org tenancy; the broader
multi-host deployment story for `GETWRITE_DATA_ROOT`.

## Documentation (Stage 5 — scribe, after execute)
`docs/standards/storage-context.md` (§2 now describes `resolveTenant` as what
`withStorageContext` calls) and the two new env vars (`GETWRITE_DATA_ROOT`,
`GETWRITE_ENABLE_DEV_IDENTITY`) get documented. Handled by the Document stage,
not the execute tasks.
