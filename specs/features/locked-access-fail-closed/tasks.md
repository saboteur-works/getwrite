# Tasks: Fail-closed locked-access gate (Feature 54)

Source spec: `specs/features/locked-access-fail-closed.md`.

## Sequencing note — read before starting

This feature has a hazard the task graph below is built to avoid: **the gate
(Task 2) and the ten catch-site fixes (Tasks 3-11) are not separately
mergeable.** The spec says so directly (Overview: "a gate that throws into an
untyped `catch` just changes which failure looks silent"). Concretely: today,
a locked read returns ciphertext-as-content (wrong data, nothing destroyed).
If Task 2 lands on `main` before any of Tasks 3-11, the ten existing `catch`
blocks that currently swallow a `SyntaxError` from parsing ciphertext as JSON
would instead swallow the new `ProjectLockedError`/`MissingProjectKeyError`
into their existing degrade branches (`{}` / `null` / `[]`). That is a
**worse** intermediate state than what exists today — wrong data replaced by
silently *missing* data (an empty trash, zero search results, a blank
editor) with no error surfaced at all, which is precisely the failure mode
US-1 exists to prevent. So:

- Task 1 (the shared predicate module) is safe to land alone — it is new,
  unimported code with no behavioral effect until something calls it.
- Task 2 (the gate) and Tasks 3-11 (the ten catch-site fixes, grouped by
  module) MUST merge to `main` together, as one wave, not as Task 2 followed
  later by Tasks 3-11. They may be developed as separate branches/commits for
  reviewability (per the "group by module, not by catch block" instruction),
  but Task 12 is the explicit gate that blocks any of Task 2/3-11 from
  merging independently — treat Task 12 as a hard merge precondition, not a
  formality.
- Tasks 13-16 (route mapping and route fixes) depend only on Task 1 to build,
  but FR-12's guarantee (a locked route returns 4xx instead of a 500) is only
  observable end-to-end once Task 2 has landed, since today `ProjectLockedError`
  is barely reachable through the routed `workspace-adapter.ts` path at all.
  Task 13 is still listed as buildable in parallel with the Task 2/3-11 wave
  because `with-storage-context.ts`'s mapping only needs the error *classes*
  (already used by `adapter-selection.ts`'s existing, unrelated
  `resolveProjectAdapter` path), not the new gate — but its own regression
  test needs Task 2 merged to be meaningful, so it is listed as depending on
  Task 1 for build and noted as needing Task 2 for verification.

## Tasks

### Task 1: Shared locked-access predicate module
**What:** New module `frontend/src/lib/models/locked-access.ts` exporting
`isLockedAccessError(error: unknown): error is ProjectLockedError |
MissingProjectKeyError` (a type guard, not a plain boolean predicate) and
re-exporting `ProjectLockedError`/`MissingProjectKeyError` from
`crypto/adapter-selection.ts`.
**Files:** `frontend/src/lib/models/locked-access.ts` (new)
**Done when:** The module exists, exports the type guard and the two
re-exported error classes, is covered by a unit test asserting it returns
`true` for both error types and `false` for `ProjectMarkerFormatError` and
for an unrelated error (e.g. plain `Error`), and `pnpm typecheck` /
`pnpm lint` pass. No other file imports it yet — this task adds no behavior
change.
**Depends on:** none
**Estimate:** 2
**Notes:** Per the spec's Decisions ("Shared helper location"), this must
import the two error classes from `crypto/adapter-selection.ts`, not
`workspace-adapter.ts` or `io.ts` — importing via `io.ts` would create a
cycle since `adapter-selection.ts` already imports from `../io`. The guard
must explicitly NOT cover `ProjectMarkerFormatError` (OQ-4, resolved) — a
corrupt/unreadable marker is a damaged project, not a locked one, and must
keep propagating uncaught rather than being folded into the lock predicate.
**Done:** [ ] — check off when the task is complete

### Task 2: Marker-first fail-closed rewrite of `adapterFor`
**What:** Rewrite `adapterFor` in `workspace-adapter.ts` per FR-1 through
FR-5: `!projectId` returns `inner` unconditionally with no marker read; read
`.encrypted.json` via `readProjectMarker` through the closed-over `inner`,
memoized per project id in a new sibling `Map<string, ProjectEncryptionMarker
| null>` alongside the existing `perProject` map; no marker returns `inner`
unconditionally; a marker present with `!keyring || keyring.isLocked()`
throws `ProjectLockedError(projectId)` (as a rejected promise, not a
synchronous throw — FR-4); an unlocked keyring with no key for that project
(`UnknownProjectError` from `keyring.projectKey(projectId)`) throws
`MissingProjectKeyError(projectId)`; a marker that fails to parse/validate
lets `ProjectMarkerFormatError` propagate uncaught.
**Files:** `frontend/src/lib/models/crypto/workspace-adapter.ts`
**Done when:**
- `adapterFor` matches FR-1's four-step order, verified by new tests for:
  (a) no `projectId` → `inner`, no marker read attempted; (b) no marker →
  `inner`, no keyring state consulted; (c) marker present, no/locked keyring
  → rejected promise with `ProjectLockedError`; (d) marker present, unlocked
  keyring, `UnknownProjectError` on `projectKey` → rejected promise with
  `MissingProjectKeyError`; (e) malformed marker → `ProjectMarkerFormatError`
  propagates uncaught, uncaught by this function.
- FR-4 verified: a locked read through `readFile`/`readFileBuffer` and a
  locked write through `writeFile`/`appendFile` all reject asynchronously
  (no synchronous throw escapes `writeFile`'s non-async arrow at
  `workspace-adapter.ts:143` today — confirm the rewrite preserves this).
- FR-5 verified: a project mid-conversion (write barrier held) still surfaces
  `ProjectBusyError` from `assertWritable`, not the new lock error, when
  both conditions hold (`io.ts:227-230` already runs `assertWritable` before
  adapter resolution in `mutatingAdapter` — a regression test confirms this
  ordering is unchanged by the rewrite).
- FR-3 verified: an unencrypted project (no marker) sees no behavior change
  — a byte-identical-passthrough test continues to pass.
- FR-13's marker-memoization scope requirement verified: a test asserting
  two separate requests (two separate `workspaceEncryptionAdapter(...)`
  closures) against the same project id do NOT share a memoized marker
  decision — each gets its own read.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:ci` pass for this file's test
  suite.
**Depends on:** none
**Estimate:** 5
**Notes:** Per Decisions ("Marker-read recursion, confirmed safe"),
`readProjectMarker` must be called with `inner` (the plain adapter), never
with `routed` — confirm no path from the marker read back into `adapterFor`.
**This task must not be merged to `main` independently of Tasks 3-11** — see
the Sequencing note above and Task 12.
**Done:** [ ] — check off when the task is complete

### Task 3: Catch-site fix — `tiptap-utils.ts`
**What:** Fix `loadResourceContent`'s catch block to rethrow a locked-access
error via `isLockedAccessError` instead of degrading.
**Files:** `frontend/src/lib/tiptap-utils.ts` (function at line ~41,
catch block at ~55-61)
**Done when:** The catch block checks `isLockedAccessError(err)` and
rethrows when true, preserving today's existing degrade behavior for every
other error (e.g. ENOENT/parse failure). A regression test simulates a
locked project and asserts `loadResourceContent` rejects with the
locked-access error rather than returning its degraded fallback value.
`pnpm typecheck`, `pnpm lint`, and this file's test suite pass.
**Depends on:** 1, 2
**Estimate:** 2
**Done:** [ ] — check off when the task is complete

### Task 4: Catch-site fix — `inverted-index.ts` (`loadIndex`)
**What:** Fix `loadIndex`'s catch block (FR-6) to rethrow a locked-access
error instead of degrading, which is also what makes `execute-search.ts`'s
existing non-ENOENT rethrow (FR-11, `:105-115`) reachable under lock for the
first time.
**Files:** `frontend/src/lib/models/inverted-index.ts` (function at line 67,
catch block at ~67-74)
**Done when:** The catch block rethrows via `isLockedAccessError`. A
regression test simulates a locked project and asserts `loadIndex` rejects
rather than returning an empty index, AND a second regression test confirms
`search()` (which calls `loadIndex`) now surfaces the locked-access error
through `execute-search.ts`'s pre-existing non-ENOENT rethrow rather than
returning `[]` as it does today. `pnpm typecheck`, `pnpm lint`, and this
file's test suite pass.
**Depends on:** 1, 2
**Estimate:** 3
**Notes:** Do NOT modify `execute-search.ts:105-115` (FR-11) — it already
does the right thing and only needs `loadIndex` fixed underneath it to
become reachable. That existing rethrow is verified, not touched, by this
task's second test.
**Done:** [ ] — check off when the task is complete

### Task 5: Catch-site fix — `backlinks.ts` (`loadBacklinks`, `loadRedirects`)
**What:** Fix both catch blocks in `backlinks.ts` (FR-6) to rethrow a
locked-access error instead of degrading.
**Files:** `frontend/src/lib/models/backlinks.ts` (`loadRedirects` at
~101-110, `loadBacklinks` at ~255-264)
**Done when:** Both catch blocks rethrow via `isLockedAccessError`. Two
regression tests (one per function) simulate a locked project and assert
each rejects rather than returning its degraded fallback. `pnpm typecheck`,
`pnpm lint`, and this file's test suite pass.
**Depends on:** 1, 2
**Estimate:** 3
**Done:** [ ] — check off when the task is complete

### Task 6: Catch-site fix — `mention-index.ts` (`loadMentionIndex`)
**What:** Fix `loadMentionIndex`'s catch block (FR-6) to rethrow a
locked-access error instead of degrading.
**Files:** `frontend/src/lib/models/mention-index.ts` (function at line 35,
catch block at ~35-44)
**Done when:** The catch block rethrows via `isLockedAccessError`. A
regression test simulates a locked project and asserts `loadMentionIndex`
rejects rather than returning its empty-index fallback. `pnpm typecheck`,
`pnpm lint`, and this file's test suite pass.
**Depends on:** 1, 2
**Estimate:** 2
**Done:** [ ] — check off when the task is complete

### Task 7: Catch-site fix — `previews.ts` (`loadPreview`)
**What:** Fix `loadPreview`'s catch block (FR-6) to rethrow a locked-access
error instead of degrading.
**Files:** `frontend/src/lib/models/previews.ts` (function at line 48,
catch block at ~48-57)
**Done when:** The catch block rethrows via `isLockedAccessError`. A
regression test simulates a locked project and asserts `loadPreview` rejects
rather than returning `null`/its fallback. `pnpm typecheck`, `pnpm lint`,
and this file's test suite pass.
**Depends on:** 1, 2
**Estimate:** 2
**Done:** [ ] — check off when the task is complete

### Task 8: Catch-site fix — `trash.ts` (`listTrashedItems` ×2, `collectFolderDescriptors`)
**What:** Fix the three catch blocks in `trash.ts` (FR-6) — the two
per-file swallows inside `listTrashedItems` (folder-manifest read at
~1485-1492, resource-sidecar read at ~1519-1526) and `collectFolderDescriptors`
(~406-412) — to rethrow a locked-access error instead of treating it as a
malformed/missing file.
**Files:** `frontend/src/lib/models/trash.ts`
**Done when:** All three catch blocks check `isLockedAccessError` and
rethrow when true, preserving today's per-file tolerance for a genuinely
malformed or missing file. Three regression tests (one per catch block)
simulate a locked project and assert the surfacing call
(`listTrashedItems` for the first two, whatever exercises
`collectFolderDescriptors` for the third) rejects rather than silently
omitting the affected item from its result. `pnpm typecheck`, `pnpm lint`,
and this file's test suite pass.
**Depends on:** 1, 2
**Estimate:** 5
**Notes:** `collectFolderDescriptors` is called from many places in
`trash.ts` (restore, purge, listing) — pick the call path FR-6 names
(feeding `listTrashedItems`) for the regression test; this task does not
need to re-verify every caller.
**Done:** [ ] — check off when the task is complete

### Task 9: Catch-site fix — `project-crud-core.ts` + `execute-search.ts` (project-root lookups)
**What:** Fix the catch blocks in `findProjectRootByInternalId`
(`project-crud-core.ts`) and `findProjectRoot` (`execute-search.ts`) — FR-6 —
to rethrow a locked-access error instead of degrading.
**Files:** `frontend/src/lib/models/project-crud-core.ts` (function at line
523, catch block at ~537-542), `frontend/src/lib/search/execute-search.ts`
(function at line 64, catch block at ~78-84)
**Done when:** Both catch blocks rethrow via `isLockedAccessError`. Two
regression tests simulate a locked project and assert each function rejects
rather than returning `null`/its fallback. `pnpm typecheck`, `pnpm lint`,
and each file's test suite pass.
**Depends on:** 1, 2
**Estimate:** 3
**Notes:** `execute-search.ts` has a second, separate, pre-existing catch
at `:105-115` (the non-ENOENT rethrow covered by Task 4/FR-11) — do NOT
touch that one here; this task only touches the `findProjectRoot` catch at
`:78-84`.
**Done:** [ ] — check off when the task is complete

### Task 10: Catch-site fix — sidecar read swallows (`resource-crud-core.ts`, `sidecar.ts`)
**What:** Fix the swallowed read half of `updateSidecarCore`
(`.catch(() => null)`) and `writeSidecar`'s pre-write read (FR-7) to rethrow
a locked-access error instead of treating it as "no prior sidecar".
**Files:** `frontend/src/lib/models/resource-crud-core.ts` (`updateSidecarCore`
at line 399, catch at ~409), `frontend/src/lib/models/sidecar.ts`
(`writeSidecar` at line 145, pre-write read at ~158-162)
**Done when:** Both catch sites rethrow via `isLockedAccessError`, preserving
today's "no prior sidecar" treatment for a genuine ENOENT. Two regression
tests simulate a locked project and assert each site rejects rather than
proceeding as if no sidecar existed. `pnpm typecheck`, `pnpm lint`, and each
file's test suite pass.
**Depends on:** 1, 2
**Estimate:** 3
**Notes:** Per FR-10, do NOT modify `sidecar.ts:170` (`writeSidecar`'s actual
write, which already surfaces errors correctly via `io.ts`'s async mutating
wrappers) or the query path's `readSidecar` rethrow at `sidecar.ts:71-79`
(reached from `query-evaluate-core.ts:160`, already correct) — this task
touches only the pre-write read at ~158-162.
**Done:** [ ] — check off when the task is complete

### Task 11: Catch-site fix — `indexer-queue.ts` (`rescanEntityAcrossProject`) + `sidecar.ts:178` propagation test
**What:** Fix `rescanEntityAcrossProject`'s log-only catch (FR-8) to
propagate a locked-access error to its caller instead of logging and
swallowing it, after confirming (FR-9's inference) the routed adapter is
actually reachable at that point in the call path. Also add the FR-13
regression test for `sidecar.ts:178` (`enqueueEntityRescan`'s `setImmediate`
callback) that verifies `AsyncLocalStorage` propagates the request's routed
adapter into that callback — this is OQ-1's resolution, closed from
"stronger than general Node semantics, short of verified" to verified by
this test.
**Files:** `frontend/src/lib/models/indexer-queue.ts` (`rescanEntityAcrossProject`
at line 310, catch at ~366-373), `frontend/src/lib/models/sidecar.ts`
(`enqueueEntityRescan`'s `setImmediate` callback at ~178, read-only — this
task adds a test exercising it, not a code change there)
**Done when:** The catch in `indexer-queue.ts` checks `isLockedAccessError`
and propagates when true. A regression test confirms the propagation reaches
the caller of `rescanEntityAcrossProject` under a locked project. A second,
separate regression test exercises `sidecar.ts:178`'s `setImmediate`
callback end to end (triggering `enqueueEntityRescan` from a request-scoped
storage context, then confirming the callback resolves the same routed
adapter that context bound, per `enqueueIndex`'s existing depended-on
behavior at `indexer-queue.ts:257-271`) — asserting the propagation FR-13
calls the weakest link in this feature's confidence. `pnpm typecheck`,
`pnpm lint`, and both files' test suites pass.
**Depends on:** 1, 2
**Estimate:** 5
**Notes:** If investigation shows the routed adapter is NOT reachable at
`rescanEntityAcrossProject`'s call site (i.e. FR-9's inference does not
hold), stop and report rather than forcing a fix — FR-8 is conditioned on
that inference being confirmed. This is the task most likely to surface a
finding rather than a clean fix; budget review time accordingly.
**Done:** [ ] — check off when the task is complete

### Task 12: Merge gate — verify the gate and all ten catch sites land as one wave
**What:** A verification checkpoint, not new code: confirm Tasks 2-11 are
complete, run the full suite, and confirm the combined change set is what
merges to `main` — never Task 2 alone, and never a subset of Tasks 3-11
without Task 2.
**Files:** none (verification only; may touch CI/PR description, not source)
**Done when:** `pnpm typecheck`, `pnpm lint`, and `pnpm test:ci` all pass
with Tasks 2 through 11 applied together. A manual check confirms all
fourteen catch sites named in FR-6/FR-7/FR-8 now rethrow (grep for
`isLockedAccessError` across the ten files touched by Tasks 3-11, expecting
exactly fourteen call sites). The PR/commit that lands this work contains
Task 2 and Tasks 3-11 together, not as separately mergeable units.
**Depends on:** 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
**Estimate:** 2
**Notes:** This task exists because landing Task 2 without Tasks 3-11 (or
vice versa) converts today's silent-wrong-data bug into a silent-missing-data
bug across ten call sites — see the Sequencing note at the top of this
document. Do not skip this gate under time pressure.
**Done:** [ ] — check off when the task is complete

### Task 13: Centralised route mapping (`with-storage-context.ts`)
**What:** Catch a propagated `ProjectLockedError`/`MissingProjectKeyError`
around the `handler(...args)` calls in `withStorageContext` and map to
401/409 respectively (FR-12; status codes resolved at OQ-3).
**Files:** `frontend/app/api/_tenant/with-storage-context.ts` (around the
`handler(...)` calls at ~221-227 and ~231-237)
**Done when:** Both `handler(...args)` call sites are wrapped so that a
propagated `ProjectLockedError` yields a 401 JSON response and a propagated
`MissingProjectKeyError` yields a 409 JSON response, mirroring the existing
401/403 short-circuit pattern already in this file (`unauthorizedResponse`/
`forbiddenCsrfResponse`). Every other error continues to propagate unchanged
(no new catch-all). A unit/integration test exercises both branches by
throwing each error type from a stub handler and asserting the response
status and that no `runInStorageContext` cleanup is skipped. `pnpm
typecheck`, `pnpm lint`, and this file's test suite pass.
**Depends on:** 1
**Estimate:** 3
**Notes:** This task can build independently of Task 2 (the error classes
already exist and are already thrown by the unrelated, already-correct
`resolveProjectAdapter` path in `adapter-selection.ts`), but its real-world
guarantee (a route hitting the *routed* `workspace-adapter.ts` path under
lock returns 4xx) is only observable once Task 2 (and ideally Task 12) has
landed. Land this task's code change whenever convenient; treat its
end-to-end verification as blocked on Task 12.
**Done:** [ ] — check off when the task is complete

### Task 14: Fix the nine confirmed-swallowing routes (FR-14)
**What:** Fix each of the nine routes already confirmed (2026-09-17) to
swallow any error into a fixed-shape response before it can reach Task 13's
mapping, so they test `isLockedAccessError` and rethrow instead.
**Files:** `frontend/app/api/projects/route.ts` (~14-20, ~34-43),
`frontend/app/api/project-types/route.ts` (~38-41),
`frontend/app/api/project/tags/route.ts` (~99-104),
`frontend/app/api/project/revision-settings/route.ts` (~63-68),
`frontend/app/api/project/features/route.ts` (~74-83),
`frontend/app/api/project/[project-id]/search/route.ts` (~100-103),
`frontend/app/api/encryption/route.ts` (~97-112),
`frontend/app/api/resource/upload/route.ts` (~80-84),
`frontend/app/api/project/metadata-schema/route.ts`
**Done when:** Each of the nine routes' catch blocks checks
`isLockedAccessError` and rethrows when true (letting Task 13's centralised
mapping produce the 4xx), while preserving each route's existing handling
for every other error. One regression test per route (nine total) simulates
a locked project against that route and asserts a 401/409 response rather
than the route's previous fixed-shape response. `pnpm typecheck`, `pnpm
lint`, and `pnpm test:ci` pass.
**Depends on:** 1, 13
**Estimate:** 8
**Notes:** Mechanical but wide — nine separate files, each with its own
existing catch shape (`encryption/route.ts` already has a multi-branch
catch for `WrongPassphraseError`/`NoKeyringError`/`EncryptionUnavailableError`
that this task adds a branch to, not replaces). `GET /api/projects` is
among these nine and is the app's first request — treat it as the
highest-priority file in this task if it must be split.
**Done:** [ ] — check off when the task is complete

### Task 15: Classify the remaining ~9 unclassified routes (FR-15)
**What:** Investigation task: for each of the roughly nine route files under
`frontend/app/api` not yet classified as clean-rethrow (the ~18 already
known-clean) or swallowing (the 9 fixed in Task 14), determine which bucket
it falls into.
**Files:** TBD — the ~9 unclassified route files (to be enumerated as part
of this task's own output; the spec does not name them, only the count)
**Done when:** Every one of the ~9 previously-unclassified route files has a
recorded classification (clean-rethrow, or swallows a locked-access error)
with the specific line(s) cited as evidence, delivered as a list (in the PR
description or a short findings note, not a spec edit — this task does not
modify the spec). No source code is changed by this task itself.
**Depends on:** 1, 13
**Estimate:** 5
**Notes:** This is investigation, not implementation — its output may be
"all ~9 are clean, nothing to fix" or may identify N routes needing the same
fix as Task 14. Do not assume either outcome going in. If prior tasks'
review already enumerated all 36 route files with certainty, this task may
turn out to have a shorter list to check than "~9" — reconcile the actual
count against the spec's total of 36 (18 clean + 9 confirmed-swallowing +
~9 unclassified) before reporting done.
**Done:** [ ] — check off when the task is complete

### Task 16: Fix any routes found swallowing in Task 15
**What:** Apply the same `isLockedAccessError` rethrow fix (as Task 14) to
any route Task 15's investigation identifies as swallowing a locked-access
error.
**Files:** TBD — determined entirely by Task 15's findings; may be zero
files.
**Done when:** Every route Task 15 flagged as swallowing now rethrows via
`isLockedAccessError`, each with its own regression test, following Task
14's pattern. If Task 15 finds zero swallowing routes among the
unclassified set, this task is closed as not needed with that finding
recorded (not silently dropped) — this outcome is uncertain by design and
must not be treated as a bug in the estimate.
**Depends on:** 15
**Estimate:** 3
**Notes:** Estimate assumes 1-2 routes need fixing based on the ~1:1 ratio
observed between Task 14's confirmed set and the total surveyed so far; if
Task 15 finds more, re-estimate before starting rather than absorbing scope
silently.
**Done:** [ ] — check off when the task is complete

## Summary
- Total tasks: 16
- Total estimated effort: 56 points (2+5+2+3+3+2+2+5+3+3+5+2+3+8+5+3)
- Critical path: Task 1 → Task 2 → Tasks 3-11 (parallelizable within the
  wave, each depending only on 1 and 2) → Task 12 → Task 13 → Task 14 →
  Task 15 → Task 16
- Risks:
  - **Tasks 2-11 as a single mergeable wave** is the feature's central risk:
    it is a large, ten-file simultaneous change that must land atomically
    per the Sequencing note. If reviewed as ten independent PRs without
    Task 12 gating the merge, an intermediate state worse than today's bug
    is easy to accidentally ship.
  - **Task 11** carries the feature's stated weakest-confidence item (the
    `AsyncLocalStorage`-across-`setImmediate` propagation at `sidecar.ts:178`,
    OQ-1) — it may surface that the propagation does not hold, which would
    require revisiting FR-8's premise, not just this task's fix.
  - **Task 15** is investigation with an unknown-until-run output; Task 16's
    scope and estimate are provisional until Task 15 completes.
  - **Task 8** (`trash.ts`) touches the file with the most call sites for
    `collectFolderDescriptors`; confirm the regression test's chosen call
    path actually exercises the swallowing catch before marking done.
