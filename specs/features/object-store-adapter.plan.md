# Plan: Object-Store Backend Adapter

Spec: `specs/features/object-store-adapter.md`
ADR: `docs/architecture/ADRs/adr-019-object-store-backend-adapter.md`
Branch: `feat/object-store-adapter` (off `main`)

## Design summary

Build a concrete non-filesystem `StorageAdapter` against a minimal `ObjectStore`
key/value seam, and select it per request behind an env gate. No S3/R2 client,
no new dependency; a real cloud client is a later `ObjectStore` implementation.

### Feasibility (confirmed by reconnaissance)

- Model code consumes only `Stats.isDirectory()` + existence and
  `Dirent.{name,isDirectory,isFile}` (`isFile()` in exactly one route,
  `project-types/route.ts`). Minimal synthesized shapes suffice.
- The `err.code === "ENOENT"` convention is load-bearing (`pruneExecutor.ts`,
  `revision.ts`, `trash.ts`, `saved-queries.ts`, `sidecar.ts`, the media file
  route).
- The one POSIX-hard dependency is `revision.ts`'s dir-rename that must fail if
  the destination exists — preserved as an `EEXIST`-throwing guard; atomicity is
  documented as weakened.
- The plug-in point is `with-storage-context.ts`: `tenantRoot` was per-request
  but `adapter` was not. Extend `resolveTenant` to carry the adapter.
- Background work already propagates the captured adapter via `runForTenant`;
  `fs.watch` stays the documented exception.

### Key conventions in the adapter

- **Path↔key**: POSIX-normalize, strip leading/trailing slashes; root → `""`.
- **Directory markers**: `mkdir(p)` writes an empty object at `<p>/`; the leaf
  marker suffices because ancestors are implied by prefix listing.
- **`readdir`**: prefix list, first segment after the prefix, marker filtered;
  `withFileTypes` computes `isDirectory`/`isFile` per child from the same keys.
- **`rename`**: file → per-key atomic copy+delete; dir → `EEXIST` if destination
  non-empty, else copy every descendant to the rebased prefix + delete source.

## As-built task list (each committed)

1. `object-store.ts` — `ObjectStore` interface + `createMemoryObjectStore` +
   `createFsObjectStore`, with a shared store-contract test.
2. `objectStoreAdapter.ts` — the bridge (markers, stat/readdir, rename
   emulation, cp/rm/append, ENOENT), with object-store-specific tests.
3. `tests/unit/storage-adapter-conformance.ts` (+ `.test.ts`) — reusable suite
   driven through the `io.ts` wrappers, run against the fs adapter and the
   object store over both stores. Discovery: the reference `memoryAdapter`
   permissively overwrites on dir-rename, so "fail-if-exists" is NOT a uniform
   contract guarantee — it lives in the object-store-specific test, not the
   shared suite (the model layer self-guards via `revision.ts`'s stat pre-check).
4. `app/api/_tenant/storage-backend.ts` — `resolveBackendAdapter()` selector;
   `ResolvedTenant.adapter` threaded into `withStorageContext`; provisioning
   routed through the selected adapter.
5. Docs — ADR-019 + README index, `storage-context.md` §5, this spec+plan,
   CLAUDE.md I/O bullet.

## Critical files

- New: `frontend/src/lib/models/object-store.ts`,
  `frontend/src/lib/models/objectStoreAdapter.ts`,
  `frontend/app/api/_tenant/storage-backend.ts`,
  `frontend/tests/unit/{object-store,objectStoreAdapter,storage-backend}.test.ts`,
  `frontend/tests/unit/storage-adapter-conformance.{ts,test.ts}`,
  `docs/architecture/ADRs/adr-019-object-store-backend-adapter.md`.
- Edit: `frontend/app/api/_tenant/resolve-tenant.ts`,
  `frontend/app/api/_tenant/with-storage-context.ts`,
  `frontend/tests/unit/resolve-tenant.test.ts`,
  `docs/standards/storage-context.md`, `docs/architecture/ADRs/README.md`,
  `CLAUDE.md`.

## Verification

- Gate: `pnpm typecheck` clean; `pnpm lint` 0 errors; `pnpm test:ci` green
  (incl. the conformance suite across three backends); `pnpm knip`.
- Grep guard: no non-type `node:fs`/`fs/promises` import under
  `frontend/src/lib/models/` except `io.ts`, `memoryAdapter.ts`,
  `object-store.ts`, and `backlinks-watcher.ts`.
- Smoke: with `GETWRITE_STORAGE_BACKEND=object-store`,
  `GETWRITE_OBJECT_STORE_ROOT`, `GETWRITE_DATA_ROOT`,
  `GETWRITE_ENABLE_DEV_IDENTITY=1` + `x-getwrite-dev-user`, run a project
  create→edit→reindex→search→export and confirm objects land as flat keys under
  the object-store root. `pnpm --filter getwrite-frontend build`.
- Default-path regression: with no backend env, behavior is the fs adapter.

## Deferred (explicitly out of this slice)

- A real S3/R2 network client `ObjectStore` (behind `package-selection.md`) and
  eventual-consistency hardening.
- Cross-instance / distributed locking.
- Live change notification for object-store backends.
