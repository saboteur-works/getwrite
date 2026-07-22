# Plan: Tenant Adapter Isolation (model-layer fs → StorageAdapter)

## Context

Foundation shipped: `storage-context.ts` (ALS `{ tenantRoot, adapter }`),
`io.ts` context-aware wrappers + `getStorageAdapter()`/`runForTenant()`, tenant
resolution (ADR-018), and route enforcement (PR #154). What remains: ~20 model
modules still do their own `node:fs` I/O, so they never touch
`StorageContext.adapter`. This slice routes them through `io.ts`.

### Census (branch reconnaissance) — 22 files that touch `node:fs`

- **Already clean** (type-only `Dirent` import; all I/O via `io.ts`):
  `backlinks.ts`, `revision.ts` — 0 work.
- **The adapter itself** (not consumers): `io.ts`, `memoryAdapter.ts`.
- **Partially migrated** (one stray direct call): `inverted-index.ts`
  (`fs.readdir` at ~L226).
- **Clean async swaps** (ops all already on the adapter — swap import to
  `io.ts` wrappers): `field-values.ts`, `metadata-schema.ts`,
  `project-config.ts`, `project-creator.ts`, `project-features.ts`,
  `query-cache.ts`, `revision-settings.ts`, `sidecar.ts`, `tags.ts`,
  `trash.ts`, `folder-utils.ts` (takes a `dir`, not a `projectRoot`; wrappers
  read the ambient context regardless, so no signature change).
- **Op-coverage gaps** (need FR3 contract additions): `resource-templates.ts`
  (`cp`, `copyFile` — copies resource dirs that may hold **media binaries**;
  `appendFile`), `saved-queries.ts` (`unlink` → migrate to `rm`).
- **Hard cases**: `resource-persistence.ts` (fully sync + fd ops — FR6),
  `project-loader.ts` (one `readFileSync` in an async fn),
  `pruneExecutor.ts` (`fs.promises.readdir`; CLI entry — ensure `runForTenant`).
- **Deferred exception**: `backlinks-watcher.ts` (`fs.watch` + `existsSync`).

### Scope decisions locked during exploration

1. Extend `StorageAdapter` with binary-safe `copyFile` + recursive `cp` +
   `appendFile`; do **not** add `unlink` (use `rm`) or any sync/stream method.
2. Add composite `exists(path)` helper to `io.ts` (via `stat`) for the removed
   `existsSync` checks — keeps the contract async-only.
3. Migrate `resource-persistence.ts` to async in this slice (blast radius is
   small: `writeResourceToFile` already `async`; `getLocalResources` →
   ~2 callers, `readResourceExcerpts` → 1 caller). Land it as its own commit so
   it is independently reviewable.
4. Defer the backlinks **watcher** (`fs.watch`) as a documented exception.

## Approach

### 1. Extend the `StorageAdapter` contract (`io.ts` + `memoryAdapter.ts`)
- Add to the `StorageAdapter` type: `copyFile(src, dst)`, `cp(src, dst, { recursive })`,
  `appendFile(path, data)`. Mark them required (all adapters must implement).
- Default adapter: delegate to `fs.copyFile`, `fs.cp`, `fs.appendFile`.
- Export per-op wrappers (`copyFile`, `cp`, `appendFile`) resolving
  `currentAdapter()`, mirroring the existing wrappers.
- Add `export const exists = async (p) => { try { await stat(p); return true } catch { return false } }`.
- `memoryAdapter.ts`: implement `copyFile` (clone the file node's raw
  `data`), `cp` (recursively clone a subtree), `appendFile` (concat onto
  existing `Buffer`/string, create if absent). Binary preserved as `Buffer`.

### 2. Mechanical wrapper swaps (the ~13 clean/partial files)
- Replace `import fs from "node:fs/promises"` with named imports from `./io`
  (`readFile`, `writeFile`, `mkdir`, `readdir`, `stat`, `rm`, `rename`, plus
  `copyFile`/`cp`/`appendFile`/`exists` where used), and rewrite `fs.xxx(...)`
  → `xxx(...)`. Keep any `import type { Dirent } from "node:fs"`.
- `saved-queries.ts`: `fs.unlink(p)` → `rm(p)`.
- `inverted-index.ts`: the single `fs.readdir` → `readdir` wrapper; drop the
  `fs` import (rest already uses wrappers).
- `pruneExecutor.ts`: `fs.promises.readdir` → `readdir` wrapper; confirm the
  `prune` CLI command wraps its action in `runForTenant` (add if missing).

### 3. `resource-persistence.ts` sync → async (FR6) — separate commit
- Swap all sync calls to the async wrappers: `existsSync` → `exists`,
  `readFileSync` → `readFile`, `writeFileSync` → `writeFile`, `mkdirSync` →
  `mkdir`, `readdirSync` → `readdir`.
- `readResourceExcerpts`: drop `openSync`/`readSync`/`closeSync`; read the file
  via `readFile` and slice to `maxChars`. Make the function `async`.
- `getLocalResources` → `async`. Update callers:
  `app/api/projects/route.ts` (already inside an `async` map — `await`),
  `cli/src/commands/doctor.ts` (`runDoctor` becomes async inside its
  `runForTenant`).
- `writeResourceToFile`: internal-only (already `async`).
- `project-loader.ts`: `fsSync.readFileSync` → `readFile` (fn already async);
  drop the `node:fs` sync import.

### 4. Docs
- Update `docs/standards/storage-context.md`: state that the model layer routes
  all data-path I/O through `io.ts`, and record the backlinks-watcher
  `fs.watch` exception (why it stays direct; that it's local/desktop + test-
  gated). Reconcile the CLAUDE.md `io.ts` description if needed.

## Critical files

- `frontend/src/lib/models/io.ts` — contract + wrappers + `exists`.
- `frontend/src/lib/models/memoryAdapter.ts` — new methods for tests.
- `frontend/src/lib/models/resource-persistence.ts` — the risk task (sync→async).
- `frontend/src/lib/models/resource-templates.ts` — `cp`/`copyFile`/`appendFile`.
- `app/api/projects/route.ts`, `cli/src/commands/doctor.ts` — `getLocalResources` await ripple.
- `docs/standards/storage-context.md` — exception + model-layer contract note.

## Verification

- `pnpm typecheck` clean; `pnpm lint` 0 errors; `pnpm test:ci` all green
  (existing route/model/adapter suites exercise the swapped paths); `pnpm knip`.
- Add/extend unit tests: `memoryAdapter` `copyFile`/`cp`/`appendFile`;
  `io.exists`; a `resource-persistence` async-path test (write → read → excerpt)
  driven through the memory adapter to prove adapter routing (not disk).
- Grep guard: no non-type `node:fs`/`fs/promises` import remains in
  `frontend/src/lib/models/` except `io.ts`, `memoryAdapter.ts`,
  `backlinks-watcher.ts`.
- Smoke: `pnpm --filter getwrite-frontend build`; CLI `doctor`/`reindex` on a
  sample project; app create/open/edit/export path.

## Task list (for implementation)

1. Extend `StorageAdapter` (contract + default adapter + wrappers + `exists`) and
   `memoryAdapter`; add adapter unit tests. **Commit.**
2. Mechanical wrapper swaps across the ~13 clean/partial files (incl.
   `saved-queries` unlink→rm, `inverted-index`, `pruneExecutor`,
   `project-loader`). **Commit.**
3. `resource-persistence.ts` sync→async + caller ripple (`projects` route,
   `doctor` CLI) + async-path test. **Commit.**
4. Docs (`storage-context.md`, CLAUDE.md reconciliation). **Commit.**
5. Full gate + smoke; grep guard clean.

## Branch

`feat/tenant-adapter-isolation` (already created off `main`).

## Deferred (explicitly out of this slice)

- Backlinks watcher off `fs.watch`; a concrete alternate backend adapter;
  sync/stream adapter surface. (See spec "Out of scope".)
