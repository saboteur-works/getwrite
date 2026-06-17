# Patterns reference

This file is loaded by the `implement-feature` skill on demand when the
agent needs project-specific implementation patterns.

Fill this in with the patterns your project actually uses. The more specific
and project-grounded this file is, the more useful the skill becomes.
Generic advice ("use clean architecture") is less useful than concrete
patterns ("API route handlers live in `src/routes/`, each file exports a
single router, errors are thrown as `AppError` instances from
`src/lib/errors.ts`").

---

## API / route handlers

Next.js App Router. Routes are `route.ts` files under `frontend/app/api/...`
that read/write the filesystem directly (there is no database). A handler
typically: parses the typed request body, validates persisted data with a Zod
schema from `src/lib/models/schemas.ts` at the filesystem boundary, does its
work through the model layer in `src/lib/models/`, and serializes writes behind
the per-key async mutex in `locks.ts` / `meta-locks.ts` to avoid concurrent
corruption.

When several routes share a shape, factor the shared part into the model layer
(e.g. the compile/export routes all load sections via `loadTextSections` in
`src/lib/export/section-loader.ts`) rather than duplicating it per route.

**Use the `getwrite-api-route` skill when creating a route** — it is the
authoritative guide for the typed-request/response, error-handling, and locking
conventions.

---

## State management

Redux Toolkit, with a non-standard split that is easy to miss: each feature is
`<feature>Slice.ts` + a `*-transport-service.ts` (the HTTP calls) + optional
`*-guards.ts` (invariants). Sync is **explicit** — state loads on mount and is
updated via API calls; there is no optimistic or auto-sync layer, so don't add
one. Typed hooks `useAppDispatch` / `useAppSelector` live in `store/hooks.ts`.

**Use the `getwrite-redux-slice` skill when adding a slice or thunk** — the
transport-service/guards separation is the part improvised code usually gets
wrong.

---

## Background jobs / workers

<!-- How are async jobs run? Queue library? Cron? Worker threads?

Example:
Jobs use BullMQ. Queue definitions are in `src/queues/`.
Job processors are in `src/workers/<job-name>.worker.ts`.
Each worker exports a single `process` function.
-->

_Not yet documented._

---

## Database access

**There is no database.** All persistence is the filesystem under `projects/`
at the repo root (one UUID-named folder per project; see CLAUDE.md's Data Layer
section for the on-disk layout). Do not introduce a DB, ORM, or migration tool.

All filesystem I/O goes through the `StorageAdapter` abstraction in
`src/lib/models/io.ts` (over `fs/promises`) rather than calling `fs` directly —
this is what lets tests swap in the in-memory `memoryAdapter.ts`. Write new
model code against the adapter, not raw `fs`.

---

## Testing patterns

Vitest for unit/integration/component/a11y tests, which live in
`frontend/tests/` (not colocated). Prefer TDD and add to an existing test file
before creating a new one. Model-layer tests use the in-memory `memoryAdapter`
rather than touching the real filesystem. E2E (`frontend/e2e/`, Playwright,
Chromium-only) run against Storybook — start `pnpm storybook` on :6006 first.
Run a focused gate with `pnpm exec vitest run <filters>`; see
`docs/standards/testing.md`.

**Never hallucinate component props** — before using a prop on an in-project
component, open its source and `*.stories.tsx` to confirm it exists.

---

## Error handling

<!-- How are errors classified, thrown, and formatted?

Example:
All application errors extend `AppError` from `src/lib/errors.ts`.
Field validation errors use `ValidationError` (a subclass of `AppError`).
Unexpected errors are logged and re-thrown as a generic 500 `AppError`.
Never expose raw error messages or stack traces to API consumers.
-->

_Not yet documented._
