# Tasks: Protect revision

Source spec: `specs/features/protect-revision.md`. Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.md` FR-45; `specs/product/getwrite.features.md` Feature 58.

### Task 1: Change prune counting so protected revisions are excluded from the cap (FR-6, FR-7)
**What:** In `frontend/src/lib/models/revision.ts`, change `selectPruneCandidates` so the count compared with `maxRevisions` excludes protected revisions (`metadata.preserve` truthy) while still counting the canonical revision, keep protected and canonical revisions non-candidates, make `pruneRevisions`' `requiredToRemove` / `autoPrune === false` abort path use the same new count instead of `revisions.length`, and correct the stale doc comments (~260-262 "protected revisions consume capacity", and the `selectPruneCandidates` doc).
**Files:** frontend/src/lib/models/revision.ts, frontend/tests/unit/revision.test.ts (add to the existing file, which already holds two tests from this session)
**Done when:** tests written first fail and then pass: the FR-7 worked example (`maxRevisions` 3, 6 revisions, 2 protected, canonical unprotected -> exactly 1 candidate, the oldest unprotected non-canonical); the same resource with no protected revisions counts 6 and selects 3; a protected revision is never returned as a candidate (FR-6); a protected canonical revision IS counted (decided at Gate 4), so the count is all revisions minus protected non-canonical revisions, with a numeric example pinned: `maxRevisions` 2, 5 revisions, canonical protected, 2 other protected non-canonical, 2 unprotected non-canonical -> count 3 (5 - 2), exceeding the cap by 1, so exactly 1 candidate, the oldest unprotected non-canonical (under the rejected rule that excludes a protected canonical the count would be 2 and 0 would be selected); and with 3 unprotected non-canonical (6 revisions, canonical protected, 2 protected non-canonical) -> count 4, exactly 1 candidate (the oldest unprotected non-canonical); a `pruneRevisions` test with `autoPrune: false` uses the new count for its abort decision; existing revision tests pass unmodified; `pnpm typecheck` and `pnpm lint` are clean; no doc comment in revision.ts still says protected revisions consume capacity.
**Depends on:** none
**Estimate:** 3
**Notes:** Measured: `pruneRevisions` computes `requiredToRemove = revisions.length - maxRevisions` separately from `selectPruneCandidates`, so it must be changed together or the autoPrune abort path keeps the old counting. Decided at Gate 4: a protected canonical revision counts toward the cap (the canonical rule wins over the protected-exclusion rule), so the compared count is (all revisions) minus (protected revisions that are not canonical). This decision is now recorded in FR-7 of specs/features/protect-revision.md (amended at Gate 4, 2026-09-25, with a second discriminating example: maxRevisions 2, 5 revisions) and in FR-45 / OQ-40 of specs/product/getwrite.md, and Task 1's tests must implement FR-7's two worked examples plus the protected-canonical example.
**Done:** [ ]

### Task 2: Add a core function that sets or clears `preserve` by merging into metadata (FR-3, FR-4, FR-8)
**What:** Add `setRevisionPreserve(projectRoot, resourceId, revisionId, preserve: boolean)` to `frontend/src/lib/models/revision-core.ts`, which merges `preserve` into the revision's existing `metadata` (leaving `name` and other keys unchanged), works on canonical and non-canonical revisions, throws `Revision ${revisionId} not found.` for an unknown id, and returns the updated `Revision`.
**Files:** frontend/src/lib/models/revision-core.ts, frontend/tests/unit/revision.test.ts (or the existing revision-core test file if one exists; add to an existing file before creating a new one)
**Done when:** tests written first confirm: setting `preserve: true` on a revision with `metadata.name` keeps `name` and any other key byte-for-byte; `preserve: false` clears protection (and the revision is then a prune candidate again); it works on a canonical and a non-canonical revision, leaving `isCanonical` unchanged; an unknown id throws the not-found message; the persisted `metadata.json` on disk reflects the change; `pnpm typecheck` clean.
**Depends on:** none
**Estimate:** 3
**Notes:** Whether clearing removes the `preserve` key or writes `false` is an implementation detail; either must read as unprotected under the truthy check. Same file as Task 3, so those two should be sequenced or merged carefully if run in parallel worktrees.
**Done:** [ ]

### Task 3: Make `deleteRevision` refuse a protected revision (FR-10)
**What:** In `frontend/src/lib/models/revision-core.ts`, make `deleteRevision` throw a clear, stable-message error when the target's `metadata.preserve` is truthy, after the existing not-found and canonical checks, and update its doc comment.
**Files:** frontend/src/lib/models/revision-core.ts, frontend/tests/unit/revision.test.ts (existing file)
**Done when:** tests written first confirm: deleting a protected non-canonical revision throws the new error and leaves its directory on disk; after unprotecting (Task 2 or a fixture without `preserve`) the same delete succeeds; not-found and canonical behaviour and messages are unchanged; the error message is exported or otherwise asserted as a constant so Task 4's route can match it.
**Depends on:** none
**Estimate:** 2
**Notes:** The route maps errors by exact message match (measured, route.ts ~218-224), so export the message as a shared constant rather than duplicating the string. Parallel-safe logically with Task 2 but edits the same file.
**Done:** [ ]

### Task 4: Extend `PATCH /api/resource/revision/[resource-id]` with the preserve mode and map the protected-delete error (FR-8, FR-10, FR-11)
**What:** In `frontend/app/api/resource/revision/[resource-id]/route.ts`, add a third `handlePatch` mode for body `{ projectId, revisionId, preserve: boolean }` that calls Task 2's function; reject with 400 any body carrying both `content` and `preserve` without applying either; reject a non-boolean `preserve` with 400; leave content-only and neither-field (set canonical) behaviour unchanged; accept no generic `metadata` merge; and map Task 3's protected-delete error to 400 in the DELETE handler.
**Files:** frontend/app/api/resource/revision/[resource-id]/route.ts, the existing route test file for this route under frontend/tests (locate it; create a sibling only if none exists)
**Done when:** route tests written first confirm: `{projectId, revisionId, preserve: true}` returns 200 with the updated revision and persists; `preserve: false` clears it; `{content, preserve}` returns 400 and the file on disk and metadata are unchanged (neither applied); a body with `metadata` cannot change `name`; content-only and canonical-flip requests behave as before; DELETE of a protected revision returns 400 with the error message and the revision remains; a locked project is rethrown via `isLockedAccessError` (fail closed, not degraded); unknown revision returns 404; `pnpm typecheck` clean.
**Depends on:** 2, 3
**Estimate:** 3
**Notes:** Check whether any client uses PATCH beyond canonical changes (spec "Not verified"); the existing modes must be unchanged.
**Done:** [ ]

### Task 5: Add `setPreserve` to the revision transports (HTTP, native, web-stub) (FR-8)
**What:** Add a `setPreserve(context, revisionId, preserve)` method to the `RevisionTransport` interface and `httpRevisionTransport` in `frontend/src/store/revision-transport-service.ts` (hitting Task 4's PATCH mode) and to `frontend/src/store/transport/native-revision-backend.ts` (in-process call to Task 2's function via the same runner pattern as `setCanonical`/`delete`), plus the matching throw-if-reached method in `native-revision-backend.web-stub.ts`, with a public wrapper resolving through `createTransport`.
**Files:** frontend/src/store/revision-transport-service.ts, frontend/src/store/transport/native-revision-backend.ts, frontend/src/store/transport/native-revision-backend.web-stub.ts, existing revision transport / native-backend / parity tests under frontend/tests (extend, do not create new unless none exist)
**Done when:** tests written first confirm: the HTTP method sends `{projectId, revisionId, preserve}` and rejects on non-2xx (a failure must not render as absence, per docs/standards/failure-visibility.md); the native method returns the same result as the HTTP path for the same fixture; a locked project surfaces via `isLockedAccessError` on native rather than degrading; a protected-revision delete rejects through both transports; the web build check for the web-stub still passes with no new `node:*` import reachable; `pnpm typecheck` clean.
**Depends on:** 2, 4
**Estimate:** 3
**Notes:** ADR-021 collapse; no new dynamic-import specifier or next.config change expected, since this adds a method to an already-collapsed module.
**Done:** [ ]

### Task 6: Expose `preserve` in normalization and add a slice thunk (FR-1, FR-2, FR-5 data path)
**What:** Add an `isProtected: boolean` (derived from `metadata.preserve`) field to `RevisionEntry` in `frontend/src/store/revision-normalization.ts` and add a `setRevisionPreserveForSelectedResource` thunk to `frontend/src/store/revisionsSlice.ts` (using `makeRevisionThunk` like the neighbouring thunks) that calls Task 5's transport and updates state on success.
**Files:** frontend/src/store/revision-normalization.ts, frontend/src/store/revisionsSlice.ts, existing revisions slice / normalization tests under frontend/tests
**Done when:** tests written first confirm: normalization yields `isProtected: true` for truthy `metadata.preserve` and false otherwise, without altering `displayName`; the thunk on success updates the matching entry's protected state and leaves others unchanged; on rejection the state is unchanged and the error is surfaced through the slice's existing error path; existing slice tests pass; a test that `deleteRevisionForSelectedResource` rejecting with the core's protected-delete message leaves that exact message as the rejected payload and in `errorMessage` (pins that the message is carried through unchanged for Task 7); `pnpm typecheck` clean.
**Depends on:** 5
**Estimate:** 3
**Notes:** Confirm by reading the slice how canonical changes are refetched vs patched locally, and follow that pattern.
**Done:** [ ]

### Task 7: Add the protect/unprotect control and protected indicator to `RevisionControl` (FR-1, FR-2, FR-4, FR-5)
**What:** In `frontend/components/Editor/RevisionControl/RevisionControl.tsx`, add a protect/unprotect button on every revision card (canonical cards too, unlike the current action grid which renders only for non-canonical cards) wired to Task 6's thunk, plus a protected indicator (text label and icon, not colour alone, and not red) beside the existing "Canonical" badge; keep the Delete button enabled on protected cards (the disable/hide variant was not chosen in spec OQ-3), and change `handleDeleteRevision`'s catch (~:165) to show the core's refusal message in the error toast instead of the generic "Failed to delete revision." (falling back to the generic text only when the rejection carries no message).
**Files:** frontend/components/Editor/RevisionControl/RevisionControl.tsx, its existing tests under frontend/tests (component and a11y; extend), the RevisionControl story under frontend/stories/Editor (read the component's props and the story args first; do not guess props)
**Done when:** component tests written first confirm: a protect button appears on a canonical and on a non-canonical card and toggles to unprotect on a protected card; clicking dispatches the thunk with the right revision id and `preserve` value; a protected card shows a text-labelled indicator that is present in the accessibility tree and uses no red token; the control's accessible name states the action and the revision; Delete remains enabled on protected cards; a refused delete of a protected revision (mocked thunk rejection carrying the core's refusal message) shows that message in the error toast, not the generic text, and the revision remains in the list; a failed protect surfaces an error rather than silently reverting; an axe-based a11y test (per docs/standards/accessibility.md helper) passes with a protected and an unprotected card; the Storybook story covers protected, unprotected, and protected-canonical states and `pnpm test-storybook` for that story passes (run outside the sandbox); `pnpm lint` reports no new errors.
**Depends on:** 6
**Estimate:** 5
**Notes:** Styling rule from CLAUDE.md: red is reserved for position/canonical indicators only; the Canonical badge is a text badge, so use a distinct text badge for Protected. Measured by reading the code: the message already survives the transport (`throwApiError` in revision-transport-service.ts reads the response body's message) and the thunk (`makeRevisionThunk` does `rejectWithValue(error.message)`), so `.unwrap()` throws that string; it is dropped only by the component's bare `catch` at ~:165, which is why this task owns the fix. Task 4 must put the message in the 400 body and Task 6 pins the pass-through.
**Done:** [ ]

### Task 8: Update `docs/api/openapi.yaml` for the PATCH and DELETE changes (FR-8, FR-10, FR-11)
**What:** Update the `PATCH /api/resource/revision/{resource-id}` entry (~line 1953, currently describing two modes) to document the third `{ projectId, revisionId, preserve: boolean }` mode and the 400 for a body carrying both `content` and `preserve`, and update the DELETE entry (~line 2009) to state that a protected revision cannot be deleted (400).
**Files:** docs/api/openapi.yaml
**Done when:** the PATCH description lists three modes, the request schema includes an optional boolean `preserve` and the both-fields 400 response, the DELETE 400 description mentions protected revisions, and the file still parses as valid YAML/OpenAPI (validated with whatever OpenAPI lint the repo uses, or a YAML parse if none).
**Depends on:** 4
**Estimate:** 1
**Notes:** Measured: PATCH is at ~1953 and DELETE at ~2009; both bodies were read.
**Done:** [ ]

### Task 9: Update the user and developer revision docs (FR-9)
**What:** Update `docs/user/revisions.md` to describe the protect/unprotect control and the protected indicator, document the `metadata.name` convention, and describe the new counting (protected revisions do not count toward the cap; total storage per resource is unbounded); update `docs/features/revisions.md` (~line 85, the `pruneRevisions` "protected revisions consume capacity" bullet, and the developer reference) for the counting change, the new core function, the PATCH mode, and the delete refusal.
**Files:** docs/user/revisions.md, docs/features/revisions.md
**Done when:** neither doc states that protected revisions consume capacity; `docs/user/revisions.md` describes the control as it ships (matching Task 7's labels) and mentions names; `docs/features/revisions.md` describes the counting example, `setRevisionPreserve`, the PATCH third mode, and FR-10 refusal; a grep for "consume capacity" across docs returns no stale hit; links still resolve.
**Depends on:** 1, 4, 7
**Estimate:** 2
**Notes:** The doc comment at revision.ts ~260-262 is corrected in Task 1, not here.
**Done:** [ ]

### Task 10: Final verification gate
**What:** Run the repository gates against the completed feature and confirm every FR-1..FR-11 has passing coverage.
**Files:** none (verification only)
**Done when:** from `frontend/`, `pnpm typecheck` is clean, `pnpm lint` reports no new errors versus baseline, `pnpm test:ci` passes; `pnpm knip` from the repo root reports no new findings versus baseline (the new core function, transport method and thunk are all reachable); the RevisionControl story test passes (outside the sandbox); the web build (`pnpm build`) completes with no `node:*` leak from the native revision backend.
**Depends on:** 1, 2, 3, 4, 5, 6, 7, 8, 9
**Estimate:** 1
**Notes:** Record the baseline counts before starting, as earlier features in this repo do.
**Done:** [ ]

## Summary
- Total tasks: 10
- Total estimated effort: 26 points (unchanged)
- Critical path: 2 -> 4 -> 5 -> 6 -> 7 -> 9 -> 10
- Risks: Task 7 is the largest and least certain (new control on canonical cards, non-colour indicator, a11y and Storybook gates, prop discovery from the existing component). Task 1 touches the prune path that deletes data, so its tests must pin the FR-7 example and the autoPrune abort path, which computes its own count separately. Tasks 2 and 3 edit the same file, so parallel worktrees risk a merge conflict. Delete-refusal message plumbing needs no new task: the message already flows through the transport and thunk, and Task 7 stops the component discarding it. Task 4 depends on exact-message matching for the delete error, so Task 3 must export its message.

## Parallelism
- Tasks 1, 2 and 3 have no dependencies and can start together (2 and 3 share revision-core.ts; 1 is independent).
- After 4: Task 5 and Task 8 can run in parallel.
- Task 9 can start once 1, 4 and 7 are done; Task 10 is last.

## FR coverage
- FR-1: 6, 7
- FR-2: 6, 7
- FR-3: 2
- FR-4: 2, 7
- FR-5: 6, 7
- FR-6: 1
- FR-7: 1
- FR-8: 2, 4, 5, 8
- FR-9: 9
- FR-10: 3, 4, 8
- FR-11: 4, 8

## Open Questions

None.

Resolved at Gate 4 (2026-09-25): a protected canonical revision counts toward the cap; the compared count is all revisions minus protected non-canonical revisions (Task 1).
Resolved at Gate 4 (2026-09-25): Delete is not disabled or hidden on protected cards; the core's refusal message is shown in the error toast instead (Task 7).
