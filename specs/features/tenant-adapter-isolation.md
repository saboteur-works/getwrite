# Feature Spec: Tenant Adapter Isolation (model-layer fs → StorageAdapter)

## Overview

The request-scoped storage foundation (ADR-017/018) binds a per-tenant
`{ tenantRoot, adapter }` into an `AsyncLocalStorage` context, and the route
layer now resolves every project path from a server-validated `projectId`
inside that context (route-tenant-enforcement, PR #154). But isolation today
is only **half true**: the ~20 model modules under `frontend/src/lib/models/`
still import `node:fs`/`fs/promises` directly, so their I/O bypasses
`StorageContext.adapter` entirely. Two concurrent requests in one Next.js
process therefore share a single process-global filesystem implementation,
differentiated only by the `tenantRoot` prefix baked into each path — not by
the adapter the context carries.

`io.ts` already exposes context-aware wrappers (`readFile`, `writeFile`,
`mkdir`, `readdir`, `stat`, `rm`, `rename`, `atomicWriteFile`, `fsyncFile`)
that resolve the adapter per call via `currentAdapter()`. This slice routes the
model layer's remaining direct-`fs` call sites through those wrappers (extending
the `StorageAdapter` contract only where a used operation isn't yet modeled),
so that when a per-tenant adapter is injected (S3/R2, container-per-tenant, or
simply a distinct real-fs adapter per request), **all** model code honors it —
closing the isolation seam the enforcement work opened.

## Goals

- Every data-path filesystem operation in `frontend/src/lib/models/` flows
  through the `io.ts` wrappers (and thus `StorageContext.adapter`), not a
  direct `node:fs`/`fs/promises` import.
- The `StorageAdapter` contract covers every filesystem operation the model
  data path actually uses, with a binary-safe implementation for file/dir
  copies.
- Behavior is byte-for-byte preserved for the current single-real-fs-adapter
  deployment (desktop/local and hosted-with-one-backend alike).
- The in-memory test adapter (`memoryAdapter.ts`) implements any newly added
  contract methods, so unit tests that swap it in exercise the new paths.

## Non-goals

- No new backend adapter (S3/object-storage, container-per-tenant) — this slice
  only makes the model layer *adapter-agnostic*; a concrete alternate adapter
  is a later swap.
- No change to how a request resolves its tenant/adapter (that is ADR-018 /
  `resolve-tenant.ts`, already shipped).
- No auth provider work.
- No migration of the local-only backlinks **watcher** off `fs.watch` (see
  Out of scope).

## User stories

- As the operator of a future hosted multi-tenant deployment, I want every
  model read/write to go through the request's adapter, so two tenants served
  by one process cannot reach each other's storage even if a path were
  mis-derived.
- As a maintainer, I want a single, complete `StorageAdapter` contract that
  describes all filesystem operations the models rely on, so an alternate
  backend can be implemented against one interface with no direct-`fs`
  surprises hiding in model code.
- As a test author, I want the in-memory adapter to support every operation the
  models use, so I can assert on filesystem effects without touching disk.

## Functional requirements

- **FR1** No module under `frontend/src/lib/models/` (excluding `io.ts` and
  `memoryAdapter.ts`, which *are* the adapter, and the deferred
  `backlinks-watcher.ts`) may import `node:fs`, `fs`, `node:fs/promises`, or
  `fs/promises` for anything other than *type-only* imports (e.g.
  `import type { Dirent } from "node:fs"`).
- **FR2** All filesystem I/O in those modules routes through the `io.ts`
  wrappers, which resolve `currentAdapter()` per call.
- **FR3** The `StorageAdapter` contract gains binary-safe `copyFile(src, dst)`
  and recursive `cp(src, dst, { recursive })`, and `appendFile(path, data)` —
  the three operations the model data path uses that the contract does not yet
  model. `fs.unlink` call sites migrate to the existing `rm` wrapper (no new
  contract method).
- **FR4** `io.ts` provides an `exists(path)` helper (composed from `stat`) so
  the synchronous `existsSync` checks being removed have an adapter-backed
  equivalent, rather than adding a synchronous method to the contract.
- **FR5** `memoryAdapter.ts` implements every method added under FR3 (binary
  payloads preserved as raw `Buffer` nodes; `cp` recurses the in-memory tree).
- **FR6** `resource-persistence.ts` (today fully synchronous, including
  fd-level `openSync`/`readSync`/`closeSync` bounded reads) becomes async and
  adapter-backed. `writeResourceToFile` is already `async` (internal change
  only). `getLocalResources` and `readResourceExcerpts` become `async`; their
  callers are updated to `await`. The bounded partial read in
  `readResourceExcerpts` is replaced by an adapter `readFile` + in-memory slice
  to `maxChars` (correctness preserved; the fd micro-optimization is dropped
  and noted).
- **FR7** All existing behavior and public function signatures are preserved
  except for the three functions that must become `async` under FR6; those
  signature changes are limited to a `Promise<…>` return wrapper and every call
  site is updated in the same change.
- **FR8** The full quality gate stays green: `typecheck`, `lint` (0 errors),
  `test:ci`, `knip`, and a CLI + app smoke.

## Open questions

- None blocking. (`readResourceExcerpts` dropping the fd-bounded read for a
  whole-file read + slice is a deliberate, documented tradeoff — excerpt inputs
  are small text resources capped by `maxChars`.)

## Out of scope (deferred)

- **Backlinks watcher** (`backlinks-watcher.ts`): `fs.watch` (long-lived
  recursive `FSWatcher`) and its `existsSync` setup check remain direct
  `node:fs`. The adapter models discrete operations, not watchers; the watcher
  is a local/desktop reindex optimization already gated off under test and not
  meaningful for a hosted deployment (where change-notification is a different
  mechanism entirely). Its *recompute* path already runs through the adapter
  via `runForTenant`. This exception is documented in
  `docs/standards/storage-context.md`.
- Adding a synchronous or streaming (`createReadStream`) surface to the
  adapter. Not needed after FR6 removes the sole synchronous data path.
- Any concrete alternate backend adapter.
