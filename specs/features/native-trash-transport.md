# Native Trash transport

Note: this spec is longer than the usual 500-word guideline because the
owner's condition on OQ-35 requires the failure taxonomy below to be
enumerated explicitly before implementation is planned.

## Overview

Feature 26 shipped a project-wide Trash tab (list/restore/purge) on hosted
web and Electron desktop, backed by three Next API routes and the
`lib/models/trash.ts` model layer. The native (Capacitor/Android) transport
(`native-trash-backend.ts`) is a 44-line stub whose `list`/`restore`/`purge`
each unconditionally reject, so a writer on native sees a Trash tab that
does nothing. This feature closes that gap in two independently-mergeable
steps: (1) extract the transport-agnostic orchestration already sitting in
the three HTTP routes into a shared `trash-core.ts`, with no behavior
change to the shipped web/desktop paths, landing and merging on its own;
(2) implement the real native backend on top of that core, wired through
the already-existing `native-trash-backend.web-stub.ts` seam and
`next.config.mjs` `resolveAlias` entries.

## Goals

- `trash-core.ts` exists, exporting `Response`-free, `projectPath`-taking
  functions that the three HTTP routes call, with the shipped web/desktop
  routes behaviorally unchanged (FR-1..FR-4).
- The native Trash backend performs real list/restore/purge operations
  in-process, mirroring the model layer the HTTP routes already use
  (FR-5..FR-7).
- The native backend's failure behavior for a missing/invalid project
  root, a Capacitor filesystem-bridge error, and a mid-sweep
  `PurgeSweepError` is explicitly decided and matches `lib/api/trash.ts`'s
  all-reject contract (FR-8..FR-11).
- Sibling-pattern test coverage (native/web parity, web-bundle exclusion)
  exists for the new backend (FR-12).
- The shipped web/desktop Trash tab's behavior is unchanged end to end
  (FR-13).

## Non-goals

- Any UI change to `TrashView.tsx` or its sub-components.
- Any change to `lib/api/trash.ts`'s public `TrashTransport` contract or
  its degrade-vs-throw doc comment.
- Any change to `lib/models/trash.ts`'s exported behavior, signatures, or
  the FR-18 ordered purge sweep itself.
- Restoring/purging via any transport other than the existing three
  operations (list, restore, purge).

## User stories

- US-1: As a writer using GetWrite's native Android app, I want to see my
  project's trashed resources and folders so that I know what is
  recoverable.
- US-2: As a writer using GetWrite's native Android app, I want to restore
  a trashed item so that I get it back without switching to a desktop or
  web session.
- US-3: As a writer using GetWrite's native Android app, I want to
  permanently purge a trashed item (or empty my trash) so that I can free
  up space and be confident it is really gone.
- US-4: As a maintainer, I want to prove the web/desktop Trash routes'
  behavior is unchanged after the `trash-core.ts` extraction so that a
  regression in either shipped route stays bisectable from the native work
  that follows.

## Functional requirements

1. FR-1: `trash-core.ts` MUST export a `listTrashCore(projectPath: string)`
   function containing the ~5 lines of logic currently inline in
   `app/api/project/[project-id]/trash/route.ts`'s handler, called by that
   route with no change to its response shape or status codes. [US-4]
2. FR-2: `trash-core.ts` MUST export a `restoreOneCore(projectPath: string,
   id: string)` function lifted verbatim (no logic change) from
   `.../trash/restore/route.ts`'s existing `restoreOne`, called by that
   route in place of its current local definition. [US-4]
3. FR-3: `trash-core.ts` MUST export a `purgeOneCore(projectPath: string,
   id: string)` function lifted verbatim (no logic change) from
   `.../trash/purge/route.ts`'s existing `purgeOne`, called by that route
   in place of its current local definition. `trash-core.ts` MUST
   additionally export a `purgeBatchCore(projectPath: string, selection:
   PurgeSelection)` function performing the `{ all: true }` → id-list
   resolution (via `listTrashCore`) and looping `purgeOneCore` over the
   resolved ids, returning the per-item results array; the HTTP route
   calls `purgeBatchCore` in place of its current inline resolution-and-
   loop (today at `.../trash/purge/route.ts`'s `handlePost`, lines
   97-122). Restore does NOT get a symmetric `restoreBatchCore`: unlike
   purge's resolution-plus-loop, restore's loop has no `{ all: true }`
   resolution step and is a trivial single-line iteration over the ids the
   caller already has, so there is no substantive duplication to extract;
   both the HTTP restore route and the native backend keep their own
   (trivial) loop calling `restoreOneCore` directly. [US-4]
4. FR-4: After the extraction, the existing 13 route-level test cases
   (`trash-routes.test.ts`'s 7, `trash-legacy-layout.test.ts`'s 6) MUST
   pass unchanged, as the evidence that the extraction changed no
   behavior; any case the extraction reveals as insufficiently covering
   the lifted functions' branches (e.g. the mixed-outcome batch case) MUST
   be identified before this step is considered done, per OQ-3. [US-4]
5. FR-5: The native Trash backend's `list` MUST call `listTrashCore`
   (bound to the project root resolved from `projectId` the way
   `native-entity-relationships-backend.ts` resolves it via
   `resolveProjectRoot`), returning the same `TrashListing` shape the HTTP
   transport returns for the same on-disk state. [US-1]
6. FR-6: The native Trash backend's `restore` MUST call `restoreOneCore`
   once per requested id — each call wrapped in its own
   `createNativeRunner` `run(...)` invocation per OQ-4 — and return one
   `RestoreItemResult` per id, in input order, matching the per-item
   result shape the HTTP transport returns. [US-2]
7. FR-7: The native Trash backend's `purge` MUST resolve `{ all: true }`
   via `listTrashCore` and then call `purgeOneCore` once per resolved id —
   not `purgeBatchCore` — returning one `PurgeItemResult` per id, in the
   same order the HTTP transport would produce for the same requested
   selection. The native backend does not call `purgeBatchCore` for this:
   per OQ-4, each id's `purgeOneCore` call must be wrapped in its own
   `createNativeRunner` `run(...)` invocation, but `purgeBatchCore`'s own
   internal loop (FR-3) calls `purgeOneCore` directly without re-entering
   per-id storage-context binding. `purgeBatchCore` is used by the HTTP
   route only, where request-level storage-context binding already covers
   the whole batch. [US-3]
8. FR-8: When `resolveProjectRoot(projectId)` returns `null` (invalid
   project id), the native backend's `list` MUST reject with an `Error`,
   matching `lib/api/trash.ts`'s contract that `list` never degrades to an
   empty listing. `restore`/`purge` MUST likewise reject the whole call
   without invoking any per-item function, since there is no project root
   to operate against and per-item catching would misreport "the request
   never ran" as "every item failed." Independent of this native-backend
   check, and per OQ-6, `trash-core.ts` MUST itself validate `projectPath`
   and reject clearly (rather than relying on a downstream throw) for
   every caller — this additionally covers an empty-string `projectPath`,
   which a downstream `path.join` call would not itself catch. [US-1]
   [US-2][US-3]
9. FR-9: When a Capacitor filesystem-bridge operation fails
   (read/write/rename error) during `list`, the failure MUST propagate as
   a rejected promise, matching the HTTP transport's throw-on-any-failure
   contract for `list`. When such a failure occurs inside a single item's
   `restoreOneCore`/`purgeOneCore` call during a batch `restore`/`purge`,
   it MUST be caught at the per-item boundary (mirroring the try/catch
   already inside `restoreOne`/`purgeOne`) and reported as that item's
   `{ ok: false, error }` entry, with the rest of the batch continuing —
   not propagated as a whole-call rejection. [US-1][US-2][US-3]
10. FR-10: When `purgeOneCore` throws a `PurgeSweepError` mid-sweep for a
    given item, the native backend MUST catch it at the same per-item
    boundary FR-9 describes and report it as that item's
    `{ ok: false, error: <PurgeSweepError.message> }` entry, leaving every
    step the sweep already completed in place (per `purgeResource`'s own
    resumability guarantee) and continuing to process the remaining ids in
    the batch — mirroring the existing HTTP `purgeOne`'s behavior exactly,
    not inventing new behavior. A retried purge of that same id (native or
    HTTP) MUST resume from the failed step, since every step is
    independently idempotent. [US-3]
11. FR-11: The native backend MUST NOT introduce a different failure
    contract than FR-8..FR-10 describe for any of the three operations —
    specifically, it MUST NOT degrade `list` to an empty/partial listing on
    any failure, and MUST NOT reject an entire `restore`/`purge` batch
    because one item's core call threw (whether an ordinary error or a
    `PurgeSweepError`). [US-1][US-2][US-3]
12. FR-12: The native backend MUST ship with a
    `native-trash-backend-native-web-parity.test.ts` demonstrating the
    native and HTTP paths agree over the same fixtures (including at least
    one mixed-outcome batch and one `PurgeSweepError`-triggering fixture),
    and a `native-trash-backend-web-exclusion.test.ts` demonstrating no
    native-only import leaks into the web/desktop bundle, matching the
    sibling entity-layer backends' test bar. [US-1][US-2][US-3][US-4]
13. FR-13: The shipped web/desktop Trash tab's list/restore/purge behavior,
    including relocation/rename reporting, reference re-linking, cascade
    delete/restore, and the FR-18 ordered purge sweep, MUST be unchanged
    after both steps land. [US-4]

## Open questions

- OQ-1: `trash-core.ts`'s exact function names/signatures beyond the
  `listTrashCore`/`restoreOneCore`/`purgeOneCore` shapes named in FR-1..3
  (e.g. whether `purgeOneCore` takes the resolved id list or the raw
  `PurgeSelection` and resolves `{ all: true }` itself) — the existing
  routes' `restoreOne`/`purgeOne` already take `(projectPath, id)`, but
  where the `{ all: true }` → id-list resolution and the loop over ids
  should live (inside `trash-core.ts` vs. left in each route/backend) is
  not yet decided. — Impact: FR-1, FR-3, FR-7.
  **Resolved (owner decision, 2026-09-16):** add a batch-level core
  function, `purgeBatchCore(projectPath, selection)`, that performs the
  `{ all: true }` → id-list resolution, loops the ids calling
  `purgeOneCore`, and returns the per-item results array. Rationale: it
  removes the duplication `trash-core.ts` exists to prevent — otherwise
  the HTTP route and the native backend would each re-implement the same
  ~15-line resolution-and-loop. Precedent: `reorderResourcesCore`
  (`frontend/src/lib/models/resource-crud-core.ts:629-706`) is the one
  existing batch-shaped sibling core and it likewise contains its own
  loop. Accepted trade-off: the core's surface grows beyond the three
  single-item functions FR-1..FR-3 originally named. Restore is NOT
  treated symmetrically: it gets no `restoreBatchCore`, because restore
  has no `{ all: true }` mode and its loop over ids is a trivial
  single-line iteration with no resolution step to extract — there is no
  duplication of substance for a batch core to remove. In practice
  `purgeBatchCore` is used by the HTTP purge route only; the native
  backend does not call it (see OQ-4's resolution and FR-7).
- OQ-2: Whether `trash-core.ts` binds storage context itself (as
  `resource-crud-core.ts` sometimes does) or stays purely a
  `projectPath`-in/data-out module with all storage-context binding left
  to the caller (HTTP route's `withStorageContext`, native backend's
  `createNativeRunner`) — the sibling cores researched
  (`resource-crud-core.ts`) are not uniform on this point. — Impact: FR-1,
  FR-2, FR-3, FR-5, FR-6, FR-7.
  **Resolved (owner decision, 2026-09-16):** the core stays pure.
  `trash-core.ts` is `projectPath`-in/data-out, `Response`-free, and binds
  NO storage context of its own. Binding stays with the callers:
  `withStorageContext(...)` on the HTTP route side, `createNativeRunner`'s
  `run(...)` on the native side. This resolves a false premise in the
  original question — the siblings ARE uniform on this point: neither
  `resource-crud-core.ts` nor `project-crud-core.ts` references
  `runInStorageContext`/`withStorageContext` anywhere, and every caller
  checked (`app/api/resource/route.ts:8,43`;
  `native-resource-backend.ts:87`; `native-project-backend.ts:62`;
  `native-project-actions-backend.ts:41`) follows the same pattern.
- OQ-3: Whether the existing 13 route-level test cases are an adequate
  regression net for the FR-1..FR-3 extraction, or whether tests must be
  added first (e.g. exercising `restoreOneCore`/`purgeOneCore` directly
  rather than only through the route, or covering a `PurgeSweepError`
  mid-sweep case at the route level, which was not confirmed present
  during spec research beyond the one "purges a batch, reporting success
  for the rest when one item fails" case in `trash-routes.test.ts`) — this
  determines whether step 1 needs a test-writing sub-step before the
  extraction itself. — Impact: FR-4.
  **Resolved (from evidence, 2026-09-16):** total trash test coverage is
  114 cases across 15 files, not the 13 previously cited — 13 is the
  route-level subset only (`trash-routes.test.ts`'s 7 +
  `trash-legacy-layout.test.ts`'s 6). `PurgeSweepError` IS covered, at the
  model layer: `frontend/tests/integration/trash-purge-sweep.test.ts`, 4
  cases, including "stops on a mid-sweep failure, persists steps 1-2's
  effects, and completes only the remaining" and "stops on a mid-sweep
  failure inside a nested resource and completes on retry." It is NOT
  covered at route level — `trash-routes.test.ts` contains no
  `PurgeSweepError` reference. Conclusion: the existing suite is a strong
  regression net overall, with one specific thin spot exactly where the
  extraction cuts — the route-level glue converting a `PurgeSweepError`
  into a per-item `{ ok: false }`. Adding a route-level sweep-failure case
  is therefore a prerequisite sub-step of step 1, not an optional extra.
- OQ-4: Whether the native backend binds its storage context via
  `createNativeRunner(deps)` for every one of `list`/`restore`/`purge`
  individually (one `run(...)` call per call site, matching
  `native-entity-relationships-backend.ts`'s per-method pattern) or once
  per batch call — relevant because `restore`/`purge` each invoke
  `restoreOneCore`/`purgeOneCore` in a loop and it is not yet decided
  whether each iteration re-enters `run(...)` or the whole loop runs
  inside one `run(...)` call. — Impact: FR-6, FR-7.
  **Resolved (owner decision, 2026-09-16):** one `run(...)` per id. The
  native backend re-enters `createNativeRunner`'s `run(...)` once per
  requested id inside the loop, matching every sibling's "each call site
  gets its own `run()`" granularity and FR-6/FR-7's own "once per
  requested id" wording, and placing the per-item try/catch next to the
  boundary that owns context binding. This is cost-neutral, not merely
  convenient: `createNativeRunner`'s production path
  (`native-runner.ts:48-57`) awaits `ensureNativeStorageContext()` then
  calls `fn()`, and that bootstrap (`native-bootstrap.ts:57-104`) is a
  single memoized promise, so calls after the first resolve immediately
  against the already-installed ambient context. A consequence of this
  choice, made explicit in FR-7: the native `purge` path calls
  `purgeOneCore` per id directly rather than `purgeBatchCore` (OQ-1),
  since `purgeBatchCore`'s own internal loop does not re-enter `run(...)`
  per iteration.
- OQ-5: Whether the native/web parity test fixture set needs its own
  disk-backed test harness (mirroring `trash-routes.test.ts`'s tmp-dir
  pattern) or can reuse an in-memory adapter the way other native parity
  tests do — not yet confirmed which pattern the sibling
  `entity-relationships-native-web-parity.test.ts` actually uses in enough
  detail to commit to reusing. — Impact: FR-12.
  **Resolved (owner decision, 2026-09-16):** real tmp-dir for the HTTP
  half, in-memory Capacitor fake for the native half. Matches
  `entity-relationships-native-web-parity.test.ts:107-145` —
  `setupHttpProject` uses `fs.mkdtemp` with real `node:fs/promises`,
  `setupNativeProject` uses `createFakeCapacitorFilesystem()` +
  `capacitorFsAdapter`, both seeded with identical fixtures. Recorded
  residual, not treated as settled: the fake's contract
  (`capacitor-filesystem.ts:56-79`) includes `rename` and `copy`, which is
  what `trash.ts`'s moves need (it calls `rename` from `./io` at lines
  317, 331, 350, 554, 560, 861, 876), but NO existing parity test
  exercises a cross-`.trash`-subtree rename against the fake. That is
  inference from the contract, not an observed precedent, and warrants an
  early smoke check in the task list rather than being assumed to work.
- OQ-6: Whether FR-8's "invalid project root rejects the whole call"
  behavior for `restore`/`purge` should be implemented as an explicit
  upfront check in the native backend, or whether it falls out naturally
  from `resolveProjectRoot` returning `null` and a subsequent core call
  throwing on a `null`/empty path — i.e., whether an explicit guard clause
  is required by this spec or is an implementation detail. — Impact: FR-8.
  **Resolved (owner decision, 2026-09-16):** an explicit guard in the
  core. `trash-core.ts` MUST validate `projectPath` and reject clearly
  rather than relying on a downstream throw. This is settled by
  measurement, not preference: `trash.ts` contains NO `projectRoot` guard
  anywhere, and `trashPaths()` (`trash.ts:57-66`) calls
  `path.join(projectRoot, ".trash")` directly. Verified directly:
  `path.join(null, ".trash")` throws `ERR_INVALID_ARG_TYPE`, but
  `path.join("", ".trash")` returns the RELATIVE path `".trash"` with no
  error, so an empty-string root would silently operate against a wrong,
  cwd-relative directory. Relying on a downstream throw is therefore
  sufficient for `null`/`undefined` and NOT sufficient for `""` — this is
  broader than the native-backend-only framing the question was
  originally posed in, since `resolveProjectRoot` returning `null` was
  never the gap; an empty-string `projectPath` reaching `trash-core.ts`
  by any caller was. The guard therefore goes in `trash-core.ts` itself,
  covering every caller (HTTP route and native backend alike), not only
  the native path FR-8 names.

  Scoping note: the underlying absence of a guard in
  `lib/models/trash.ts` is a pre-existing gap, out of scope here and
  recorded as a follow-up. It is currently unreachable on the shipped
  routes because `resolveProjectPath` returns a 400 before any model
  call, but it is not structurally prevented.

## Out of scope (deferred)

- Any UI affordance communicating a native-specific Trash error
  differently from a web/desktop one.
- Performance characteristics of native Trash operations on very large
  trashes (no benchmark or cap is introduced by this feature).
- Extending the all-reject contract, or any of its native parity tests, to
  any other native transport backend not already covered by this spec.
- A real Gradle/Android packaging change — this feature is purely the
  in-process transport layer, consistent with ADR-021 Phase 2's scope.
