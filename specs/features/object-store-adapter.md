# Feature Spec: Object-Store Backend Adapter

## Overview

The request-scoped storage foundation (ADR-017/018) binds a per-tenant
`{ tenantRoot, adapter }` into an `AsyncLocalStorage` context, and the model
layer routes all data-path I/O through the `io.ts` wrappers, which resolve
`StorageContext.adapter` per call (adapter isolation, `tenant-adapter-isolation`).
But until now nothing outside tests ever injected a non-default adapter:
`withStorageContext` resolved `tenantRoot` per request yet always bound the
process-default `fs/promises` adapter, so the adapter half of the seam was
unexercised.

This slice ships a concrete **object-store** backend — a flat key/value
namespace with object-store semantics (no directories, no atomic `rename`, no
`fsync`, `readdir` as a list-prefix) rather than POSIX filesystem semantics —
and selects it per request behind an env gate. Per ADR-019, it is built against
a small `ObjectStore` interface with two dependency-free implementations (an
in-memory fake and a filesystem-backed store), not an S3/R2 network client; a
real cloud client is a later `ObjectStore` implementation. This closes the
adapter seam by proving it transparent against a backend with genuinely
different semantics.

## Goals

- Provide a concrete `StorageAdapter` implementation over a non-filesystem
  (flat key/value) backend, honoring the model layer's filesystem contract.
- Prove — by a conformance suite that passes identically against the fs adapter
  and the object store — that injecting the backend is transparent to model
  code.
- Select the backend per request via a single env-gated seam, with the default
  path byte-for-byte identical to today's filesystem behavior.
- Add no new runtime dependency; keep the whole backend runnable in CI.

## Non-goals

- No S3/R2 (or other network) client — that is a later `ObjectStore`
  implementation behind the same selector.
- No cross-instance / distributed locking — the in-process locks stay correct
  under ADR-017's one-instance-per-tenant pin.
- No change to tenant resolution or identity (ADR-018), and no auth work.
- No migration of the backlinks `fs.watch` watcher (the standing exception).

## User stories

- As the operator of a future hosted deployment, I want a storage backend I can
  point at object storage, so tenants are isolated by key prefix and the model
  layer needs no changes when the backend swaps.
- As a maintainer, I want a single conformance suite that every `StorageAdapter`
  must pass, so an alternate backend is provably interchangeable with the
  filesystem adapter.
- As a maintainer, I want the backend selected in one env-gated place, so a
  deployment opts in explicitly and desktop/local is never affected.

## Functional requirements

- **FR1** A minimal `ObjectStore` interface (`get`/`put`/`delete`/`list`/`has`
  over `Buffer`s) models a flat key/value namespace, with two dependency-free
  implementations: an in-memory `Map` store and a filesystem-backed store that
  persists each object as a flat, percent-encoded file under a root directory.
- **FR2** `objectStoreAdapter(store)` implements the full `StorageAdapter`
  contract over any `ObjectStore`, bridging object-store semantics to the model
  layer's filesystem expectations: path↔key normalization, trailing-slash
  directory markers so empty directories are observable, prefix-listing
  `readdir` with synthesized `Stats`/`Dirent` (`isDirectory`/`isFile`/`name`),
  and `rename` emulation.
- **FR3** Missing paths throw an error with `code === "ENOENT"` (and `ENOTDIR`
  / `EEXIST` where the filesystem would), matching `node:fs` and
  `memoryAdapter.ts`, so model catch blocks branch correctly.
- **FR4** File `rename` is a per-key atomic copy+delete, upholding
  `atomicWriteFile`'s "never a partial target" guarantee. Directory `rename`
  **fails if the destination exists** (`EEXIST`), preserving `revision.ts`'s
  fail-if-exists guard, and otherwise moves every descendant key — a
  non-atomic move (the one documented weakened guarantee, ADR-019).
- **FR5** A shared `StorageAdapter` conformance suite exercises the
  model-relied-upon contract and passes identically against three
  configurations: the default fs adapter, the object store over the in-memory
  store, and the object store over the filesystem store.
- **FR6** `resolveBackendAdapter()` selects the request's adapter, env-gated and
  read fresh per call (mirroring `getIdentitySource()`): unset → the default fs
  adapter; `GETWRITE_STORAGE_BACKEND=object-store` → the object-store adapter
  rooted at `GETWRITE_OBJECT_STORE_ROOT` (fail-closed if unset, one-time
  activation warning). The selected adapter is threaded through `ResolvedTenant`
  into `withStorageContext`, and tenant provisioning routes through it.
- **FR7** The default path (no backend env) is byte-for-byte the filesystem
  adapter; desktop/local and today's hosted single-volume deployment are
  unaffected.
- **FR8** The `object-store.ts` filesystem-backed store legitimately uses
  `node:fs` directly (it is a backend, not model data-path code); the grep guard
  and `storage-context.md` sanction it alongside `io.ts`/`memoryAdapter.ts`.
- **FR9** The full quality gate stays green: `typecheck`, `lint` (0 errors),
  `test:ci`, `knip`, plus a CLI + app smoke, with no new dependency added.

## Open questions

- None blocking. (Directory-rename non-atomicity on the object store is a
  deliberate, documented tradeoff — preserved fail-if-exists plus per-project
  write serialization make it acceptable; see ADR-019.)

## Out of scope (deferred)

- A real S3/R2 network client `ObjectStore` implementation (behind
  `package-selection.md`), and eventual-consistency hardening.
- Cross-instance / distributed locking (ADR-017 revisit condition).
- Live change notification for object-store backends (`fs.watch` stays the
  local/desktop-only exception; on-demand `reindex` covers hosted).
