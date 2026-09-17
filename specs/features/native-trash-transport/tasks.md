# Native Trash transport — Tasks

Source spec: `specs/features/native-trash-transport.md` (finalized; all six
open questions resolved — none reopened here).

Two independently-mergeable steps, in order:

- **Step 1 (Tasks 1-5):** extract the transport-agnostic orchestration
  already sitting in the three HTTP routes into `trash-core.ts`, with no
  behavior change to the shipped web/desktop routes. Mergeable and
  shippable on its own — nothing in Step 1 depends on Step 2.
- **Step 2 (Tasks 6-10):** implement the real native backend on top of that
  core. Every task in Step 2 depends on Task 3 (`trash-core.ts` existing) at
  minimum, so Step 2 cannot start until Step 1's core lands.

Verification gate for every task unless stated otherwise:
`pnpm --filter getwrite-frontend typecheck`, `pnpm --filter getwrite-frontend lint` (0 errors),
`pnpm --filter getwrite-frontend test:ci`. New tests are `.test.ts` files under
the `node` vitest project — none of this work needs a jsdom environment.

---

### Task 1: Add a route-level PurgeSweepError regression test

**What:** A new test case in `trash-routes.test.ts` that drives a mid-sweep
`PurgeSweepError` through the actual `POST .../trash/purge` route handler and
asserts it surfaces as that item's `{ ok: false, error }` entry with the rest
of the batch continuing — closing the gap OQ-3 identified (the model layer's
`trash-purge-sweep.test.ts` has 4 such cases; the route layer has none).
**Files:** `frontend/tests/integration/trash-routes.test.ts` (or the
sibling file that actually contains the route-level trash purge cases —
confirm exact path before editing; TBD to pin down if it differs from
`trash-purge-sweep.test.ts`'s directory)
**Done when:** The new test exists, fails against a version of the purge
route with no `PurgeSweepError` handling (confirmed by temporarily reverting
the route's try/catch and observing the new test fail, then restoring it),
and passes against the current, pre-extraction route code — i.e., it is
written and passing against `purgeOne` as it exists today, BEFORE Task 3's
extraction, so it demonstrates behavior preservation rather than being
written to match whatever the extraction produces.
**Depends on:** none
**Estimate:** 3
**Notes:** This is the explicit prerequisite sub-task the spec's OQ-3
resolution calls for. Use `purgeResourceSteps` (already exported by
`trash.ts` for test substitution, per the model-layer sweep test) to force a
step failure via the route's HTTP surface, mirroring how
`trash-purge-sweep.test.ts` induces the failure at the model layer but now
observed through `POST .../trash/purge`'s JSON response.
**POS:** task_ef8ce343
**Done:** [ ]

### Task 2: Cross-.trash-subtree rename smoke check against the Capacitor fake

**What:** A small, standalone smoke test proving `createFakeCapacitorFilesystem()`'s
`rename` actually moves a file across `.trash` subtrees (e.g.
`resources/<id>/content.txt` -> `.trash/resources/<id>-content.txt`-shaped
path), the way `trash.ts`'s `rename` calls at lines 317, 331, 350, 554, 560,
861, 876 require.
**Files:** new `frontend/tests/unit/capacitor-fake-trash-rename-smoke.test.ts`
(or fold into an existing capacitor-filesystem fake test file if one already
covers `rename`/`copy` generally — check first)
**Done when:** The test exercises `capacitorFsAdapter` + `createFakeCapacitorFilesystem()`
directly (no `trash.ts` or route involved) with a rename whose source and
destination sit in different subdirectories both nested under a common
`.trash` root, and asserts the file exists at the destination and not at the
source afterward.
**Depends on:** none
**Estimate:** 2
**Notes:** Per the spec's OQ-5 recorded residual: no existing parity test
exercises this, so it is inference from the fake's contract, not an observed
precedent. Placed early and independent of Steps 1/2 so a failure here is
caught before Task 9's larger parity test is built on the same assumption —
if it fails, the parity harness choice (in-memory Capacitor fake for the
native half) needs revisiting before Task 9, not after.
**POS:** task_ffe51e33
**Done:** [ ]

### Task 3: Create `trash-core.ts` with the three single-item functions plus `purgeBatchCore`

**What:** New module `frontend/src/lib/models/trash-core.ts` exporting
`listTrashCore(projectPath)`, `restoreOneCore(projectPath, id)`,
`purgeOneCore(projectPath, id)` (each lifted with no logic change from the
current route-local `listTrashedItems` call / `restoreOne` / `purgeOne`),
and `purgeBatchCore(projectPath, selection: PurgeSelection)` (the `{ all:
true }` -> id-list resolution via `listTrashCore` plus the loop over
`purgeOneCore`, returning the per-item results array — per the spec's
resolved OQ-1). The module is `projectPath`-in/data-out, `Response`-free,
and binds no storage context of its own (resolved OQ-2) — binding stays
with each caller (HTTP route's `withStorageContext`, later the native
backend's `createNativeRunner`).
**Files:** new `frontend/src/lib/models/trash-core.ts`
**Done when:** `trash-core.ts` exists with all four exports, each has an
explicit `projectPath` guard rejecting an empty string (not merely relying
on a downstream `path.join`/model-layer throw — per resolved OQ-6,
`path.join("", ".trash")` silently returns the relative `.trash` with no
error, so this guard is load-bearing), the module does not import
`withStorageContext`/`runInStorageContext`/`NextResponse`, `pnpm --filter getwrite-frontend typecheck`
passes, and `restoreOneCore`/`purgeOneCore`'s logic is byte-for-byte
equivalent to the current `restoreOne`/`purgeOne` aside from the added
`projectPath` guard.
**Depends on:** Task 1 (the regression test must exist and pass against
pre-extraction code first, so it can prove the extraction itself changes
nothing)
**Estimate:** 5
**Notes:** No route is rewired yet in this task — that's Task 4. Restore
does NOT get a `restoreBatchCore` (resolved OQ-1's explicit non-symmetry):
restore's loop over ids has no `{ all: true }` resolution step, so there is
no duplication of substance to extract, and both the HTTP restore route and
the later native backend keep their own trivial loop over `restoreOneCore`.
**POS:** task_b39a7034
**Done:** [ ]

### Task 4: Rewire the three HTTP routes onto `trash-core.ts`

**What:** `app/api/project/[project-id]/trash/route.ts`,
`.../trash/restore/route.ts`, and `.../trash/purge/route.ts` each call the
corresponding `trash-core.ts` export instead of their current inline logic
(the trash route's inline `listTrashedItems` call, restore route's local
`restoreOne`, purge route's local `purgeOne` and inline `{ all: true }`
resolution-and-loop at `handlePost` lines 97-122) — with no change to
response shape or status codes.
**Files:** `frontend/app/api/project/[project-id]/trash/route.ts`,
`frontend/app/api/project/[project-id]/trash/restore/route.ts`,
`frontend/app/api/project/[project-id]/trash/purge/route.ts`
**Done when:** All three routes import from `trash-core.ts` and no longer
contain their own copies of the lifted logic (the purge route's local
`purgeOne` function and its inline `{ all: true }` resolution/loop are
deleted in favor of calling `purgeBatchCore`); the restore route keeps its
own trivial loop calling `restoreOneCore` directly (per Task 3's note); no
route's request/response contract changes.
**Depends on:** Task 3
**Estimate:** 3
**POS:** task_955ff7e4
**Done:** [ ]

### Task 5: Verify Step 1's full regression net and close it out

**What:** Confirm the pre-existing 114-case trash suite (across its 15
files, including `trash-routes.test.ts`'s 7 and `trash-legacy-layout.test.ts`'s
6) plus Task 1's new route-level `PurgeSweepError` test all pass unchanged
against the rewired routes — the evidence for FR-4 and FR-13 that the
extraction changed no behavior.
**Files:** none (verification-only; TBD if any test needs a trivial import
path update as a result of Task 4's rewiring)
**Done when:** `pnpm --filter getwrite-frontend test:ci` passes with all
trash-related test files green, `pnpm --filter getwrite-frontend typecheck`
and `lint` are clean, and this is recorded as the closing evidence for Step
1 — Step 1 is mergeable on its own at this point, independent of Step 2.
**Depends on:** Task 4
**Estimate:** 2
**POS:** task_6a458825
**Done:** [ ]

### Task 6: Replace the native-trash-backend.ts stub with a real implementation

**What:** `createNativeTrashTransport` in
`frontend/src/store/transport/native-trash-backend.ts` becomes a real
implementation of `TrashTransport`, following the `createNativeRunner`
pattern `native-entity-relationships-backend.ts` uses: `list` resolves the
project root via `resolveProjectRoot(projectId)` and calls `listTrashCore`
inside one `run(...)`; `restore` calls `restoreOneCore` once per requested
id, each call wrapped in its OWN `createNativeRunner` `run(...)` invocation
(per resolved OQ-4 — one `run()` per id, not one per batch); `purge`
resolves `{ all: true }` via `listTrashCore` and then calls `purgeOneCore`
once per resolved id, likewise one `run(...)` per id.
**Files:** `frontend/src/store/transport/native-trash-backend.ts`
**Done when:** All three methods are implemented against `trash-core.ts`
(not `trash.ts` directly), `list`/`restore`/`purge`'s output shapes match
the HTTP transport's for equivalent input, and the module no longer contains
the "not supported on this platform" stub text.
**Depends on:** Task 3
**Estimate:** 5
**Notes:** This task's own correctness only requires Task 3 (`trash-core.ts`)
to exist, but landing Step 1 in full first is the safer sequencing choice,
since Task 5 is the last point Step 1 can still be verified in isolation
before Step 2 work begins on top of it. **`purgeBatchCore` is HTTP-route-only
— do NOT call it here.**
This is a resolved owner decision (OQ-1/OQ-4/FR-7), not an open
implementation choice: `purgeBatchCore`'s internal loop calls `purgeOneCore`
directly without re-entering `run(...)` per iteration, but FR-7 requires
each id's `purgeOneCore` call to get its own `createNativeRunner` `run(...)`
invocation. An implementor who "simplifies" or "de-duplicates" the native
purge path onto `purgeBatchCore` — reasoning that it already does the `{
all: true }` resolution and loop — would silently reverse this resolved
decision and violate FR-7's per-id re-entry requirement. Loop over
`purgeOneCore` directly in the native backend, exactly as this task
describes.
**POS:** task_9fa4bf05
**Done:** [x]

### Task 7: Implement the failure taxonomy (FR-8/9/10) in the native backend

**What:** The native backend's exact failure behavior for all three
documented cases: (1) `resolveProjectRoot(projectId)` returning `null`
(invalid project id) makes `list`/`restore`/`purge` reject the WHOLE call
without invoking any per-item function — no per-item catching, since there
is no project root to operate against; (2) a Capacitor filesystem-bridge
error during `list` propagates as a rejected promise, but the same class of
error occurring inside a single item's `restoreOneCore`/`purgeOneCore` call
during a batch is caught at the per-item boundary and reported as that
item's `{ ok: false, error }`, with the rest of the batch continuing; (3) a
mid-sweep `PurgeSweepError` from `purgeOneCore` is caught at that same
per-item boundary and reported as `{ ok: false, error: <message> }`, leaving
completed sweep steps in place and continuing to the next id.
**Files:** `frontend/src/store/transport/native-trash-backend.ts`
**Done when:** Each of the three cases above is implemented exactly as
described (verified by Task 8's tests, not merely by inspection) and the
backend introduces no different failure contract than FR-8..FR-10 for any
of the three operations — `list` never degrades to an empty/partial
listing on any failure, and no whole `restore`/`purge` batch is rejected
because one item's core call threw.
**Depends on:** Task 6
**Estimate:** 5
**POS:** task_993464ff
**Done:** [x]

### Task 8: Native/web parity test

**What:** `native-trash-backend-native-web-parity.test.ts`, mirroring
`entity-relationships-native-web-parity.test.ts`'s structure: a real
tmp-dir project (`fs.mkdtemp` + `node:fs/promises`) for the HTTP half,
driven through the three trash routes, and a
`createFakeCapacitorFilesystem()` + `capacitorFsAdapter`-backed project for
the native half, driven through `createNativeTrashTransport({ fs, projectsDir })`,
both seeded with identical fixtures. Must include at least one
mixed-outcome batch (some ids succeed, some fail within the same
restore/purge call) and one `PurgeSweepError`-triggering fixture (using
`purgeResourceSteps` test substitution, matching Task 1's technique),
asserting both transports agree.
**Files:** new `frontend/tests/unit/native-trash-backend-native-web-parity.test.ts`
**Done when:** The file exists, covers list/restore/purge parity, the
mixed-outcome batch case, and the `PurgeSweepError` case, and all assertions
pass.
**Depends on:** Task 7, Task 2 (relies on the rename smoke check's
confirmation that the fake's `rename` behaves as trash.ts needs — if Task 2
had failed, this task's harness choice would need to change first)
**Estimate:** 5
**POS:** task_b842fffa
**Done:** [x]

### Task 9: Web-bundle exclusion test

**What:** `native-trash-backend-web-exclusion.test.ts`, mirroring
`native-entity-relationships-backend-web-exclusion.test.ts`: asserts
`native-trash-backend.ts` is referenced only from `lib/api/trash.ts`'s
dynamic import, that `lib/api/trash.ts` carries the literal
`import("../../store/transport/native-trash-backend")` specifier, that
`next.config.mjs`'s `turbopack.resolveAlias` substitutes the
`.web-stub` module for that specifier, that the web-stub contains no
`node:*` reference, and that the web-stub throws if actually invoked.
**Files:** new `frontend/tests/unit/native-trash-backend-web-exclusion.test.ts`
**Done when:** All five assertion groups (mirroring the entity-relationships
sibling's five `it` blocks) pass against the real implementation from Task
6, confirming the exclusion still holds now that the backend imports
`trash-core.ts` (and transitively `trash.ts`, `io.ts`, etc.).
**Depends on:** Task 6
**Estimate:** 2
**POS:** task_e913d19e
**Done:** [x]

### Task 10: Full-suite verification and FR-13 closing evidence

**What:** Confirm the complete suite — the pre-existing 114 trash cases,
Task 1's route-level sweep test, and Tasks 8-9's two new native test files —
all pass together, and that the shipped web/desktop Trash tab's behavior
(list/restore/purge, relocation/rename reporting, reference re-linking,
cascade delete/restore, the FR-18 ordered purge sweep) is unchanged end to
end after both steps.
**Files:** none (verification-only)
**Done when:** `pnpm --filter getwrite-frontend typecheck`, `lint` (0
errors), and `test:ci` all pass with the full trash + native-trash test set
green.
**Depends on:** Task 5, Task 8, Task 9
**Estimate:** 2
**POS:** task_9f6300ab
**Done:** [x]

---

## Summary

- Total tasks: 10
- Total estimated effort: 34 (story points)
- Critical path: Tasks 1 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 10 (Task 2 and
  Task 9 sit off the critical path but must complete before Task 8 and
  Task 10 respectively)
- Risks: Task 2 (the cross-`.trash`-subtree rename smoke check) is the
  highest-uncertainty task — it is inference from the Capacitor fake's
  contract with no existing precedent test, and a failure here would force
  a harness change before Task 8 can be built; Task 1 carries some risk in
  locating the exact existing route-level purge test file/location before
  it can be extended; Task 6/7 carry the risk of an implementor reversing
  the resolved `purgeBatchCore`-is-HTTP-only decision (flagged explicitly in
  Task 6's notes) — code review should check for this specifically.

## Open Questions

None. All six open questions in the source spec are resolved and are not
reopened here. One genuinely new, task-list-level question surfaced during
breakdown:

- OQ-T1: The exact existing file/location containing the 7 route-level
  trash purge test cases the spec attributes to `trash-routes.test.ts` was
  not independently reconfirmed against the live repo during this
  breakdown (the spec's own count is trusted) — Task 1 notes this as a
  location to confirm before editing. This does not affect scope or
  sequencing, only which file Task 1's new test case is added to.
  **Resolved (from evidence, 2026-09-16):** `frontend/tests/integration/trash-routes.test.ts`
  exists, contains exactly 7 `it(`/`test(` cases, and references
  `trash/purge` 6 times — confirming the route-level purge cases the spec
  attributes to this file are in fact there. It contains no reference to
  `PurgeSweepError`, which is precisely the gap Task 1 exists to close.
