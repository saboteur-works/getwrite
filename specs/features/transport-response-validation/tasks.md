# Transport response-body validation — Task List

Source spec: `specs/features/transport-response-validation.md` (finalized,
all seven open questions resolved — not reopened here).

### Task 1: Add the API-response schema module with three new schemas
**What:** Creates `frontend/src/lib/api/schemas.ts` exporting
`ProjectApiEntry`, `EntityRelationshipEdge`, and `EntityAliasTable` Zod
schemas, plus a composed `z.object({ resource: AnyResourceSchema })` schema
for FR-1, importing `AnyResourceSchema` from
`frontend/src/lib/models/schemas.ts:395`.
**Files:** `frontend/src/lib/api/schemas.ts` (new)
**Done when:** The module exports all four schemas (three newly authored —
`ProjectApiEntrySchema`, `EntityRelationshipEdgeSchema`,
`EntityAliasTableSchema` — plus the composed resource-wrapper schema), each
schema's shape matches the corresponding TypeScript type already declared in
its owning `lib/api/*.ts` module (`projects.ts`'s project-list-entry shape,
`entity-relationships.ts`'s `EntityRelationshipEdge` type,
`entity-alias-table.ts`'s `EntityAliasTable` type), the module imports
`AnyResourceSchema` from `models/schemas.ts` and no other symbol from
`models/schemas.ts`, and `pnpm --filter getwrite-frontend typecheck` passes
with no new errors.
**Depends on:** none
**Estimate:** 3
**Notes:** This module is deliberately separate from
`frontend/src/lib/models/schemas.ts` per OQ-1's resolution — do not add to
or import the models schema file except for the one named type. FR-2's
`ProjectTypeSchema` is reused as-is from `models/schemas.ts` and is NOT
redefined here (see Task 4).
**POS:** task_4acbe145
**Done:** [x]

### Task 2: Add the shared transport-validation-failure helper
**What:** Adds a new synchronous helper (e.g.
`reportTransportValidationFailure(callSite: string, issues: z.ZodIssue[])`)
importable by every `lib/api/` module, with no Redux or UI dependency.
**Files:** `frontend/src/lib/api/transport-validation.ts` (new, or
equivalent name)
**Done when:** The helper is exported, is synchronous (no `Promise` return,
no `await` inside), accepts exactly a call-site identifier string plus a
Zod issue list and no third parameter, does not accept or reference a raw
response body anywhere in its signature or body, contains no import from
`frontend/src/store/` or any React/UI module, and
`pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** none
**Estimate:** 2
**Notes:** Per FR-9/OQ-3/OQ-4, this must exactly mirror the existing
synchronous fire-and-forget `console.warn`/`console.error` pattern already
used in `frontend/src/lib/models/` — no async contract, no body logging,
ever. A unit test asserting the signature and that it never logs anything
resembling the input issues' data payload (only paths/messages) is worth
adding alongside this task, though the full call-site regression coverage
lands with Tasks 3-8.
**POS:** task_8618bc70
**Done:** [x]

### Task 3: Validate `resources.ts`'s create/uploadMedia/copy against the composed resource schema (FR-1, FR-8, FR-9)
**What:** Adds runtime validation of the parsed response body in
`httpResourcesTransport.create`, `.uploadMedia`, and `.copy` against the
`z.object({ resource: AnyResourceSchema })` schema from Task 1, calling the
Task 2 helper and rejecting on failure.
**Files:** `frontend/src/lib/api/resources.ts`,
`frontend/tests/unit/resources-api.test.ts`,
`frontend/tests/unit/resources-api-delete-folder.test.ts` (only if either
file already exercises these three methods and needs a new
malformed-response case)
**Done when:** All three methods parse `response.json()` to `unknown`,
validate against the schema, call
`reportTransportValidationFailure` before throwing on a failed parse,
continue to throw exactly as before on a non-ok HTTP response (unchanged
behavior), a new test case per method feeds a malformed/short-of-shape body
on an otherwise-2xx response and asserts the method rejects, and
`pnpm --filter getwrite-frontend test:ci` and `typecheck` and `lint` all
pass with these tests included.
**Depends on:** Task 1, Task 2
**Estimate:** 5
**Notes:** These three methods currently reject only on non-ok HTTP status;
this task adds the new failure mode without touching the non-ok path. Tests
stay in the `node` vitest project per OQ-6 (no `@vitest-environment jsdom`
docblock needed).
**POS:** task_0cf10ff9
**Done:** [x]

### Task 4: Validate `project-types.ts`'s list against `ProjectTypeSchema` (FR-2, FR-8, FR-9)
**What:** Adds runtime validation of `httpProjectTypesTransport.list`'s
parsed response body against the existing `ProjectTypeSchema`
(`frontend/src/lib/models/schemas.ts`), reused as-is per OQ-2's resolution,
calling the Task 2 helper and rejecting on failure.
**Files:** `frontend/src/lib/api/project-types.ts`,
`frontend/tests/unit/project-types.test.ts`
**Done when:** `list` parses its response to `unknown`, validates each
entry (or the array) against `ProjectTypeSchema` unmodified, calls
`reportTransportValidationFailure` before throwing on a failed parse,
preserves its existing throw-on-non-ok contract unchanged, a new test case
feeds a malformed body on a 2xx response and asserts rejection, and
`pnpm --filter getwrite-frontend test:ci`/`typecheck`/`lint` pass.
**Depends on:** Task 2 (imports `ProjectTypeSchema` directly from
`models/schemas.ts`, not from Task 1's new module — no dependency on Task 1)
**Estimate:** 3
**Notes:** Per OQ-2's resolution, `ProjectTypeSchema`'s `.strict()` mode is
not a false-rejection risk here since the server already round-trips
through this same schema before responding — do not relax or copy the
schema.
**POS:** task_940301b3
**Done:** [x]

### Task 5: Validate `projects.ts`'s list/open/create against the new `ProjectApiEntry` schema (FR-3, FR-8, FR-9)
**What:** Adds runtime validation of `httpProjectsTransport.list`,
`.open`, and `.create`'s parsed response bodies against the
`ProjectApiEntrySchema` from Task 1, calling the Task 2 helper and
rejecting on failure — the direct closure of the FU-10 regression.
**Files:** `frontend/src/lib/api/projects.ts`,
`frontend/tests/unit/task9d-api-projectid.test.ts` (add cases; add a new
test file only if none of the existing suite covers all three methods)
**Done when:** All three methods parse to `unknown`, validate against
`ProjectApiEntrySchema`, call `reportTransportValidationFailure` before
throwing on a failed parse, preserve each method's existing
throw-on-non-ok contract, a dedicated regression test reproduces the FU-10
shape (an `open` response missing/malformed the fields `TrashView`
dereferenced after a restore) on an otherwise-2xx response and asserts the
call rejects rather than resolving with a malformed value, and
`pnpm --filter getwrite-frontend test:ci`/`typecheck`/`lint` pass.
**Depends on:** Task 1, Task 2
**Estimate:** 5
**Notes:** This is the task carrying the FU-10 regression test called out
in the assignment — do not fold that regression test into Task 3 or Task 4.
**POS:** task_85329a43
**Done:** [x]

### Task 6: Validate `entity-relationships.ts`'s list and listOrThrow against the new `EntityRelationshipEdge[]` schema (FR-4, FR-5, FR-8, FR-9)
**What:** Adds runtime validation of `httpEntityRelationshipsTransport.list`
and `.listOrThrow`'s parsed response bodies against an array schema built
from `EntityRelationshipEdgeSchema` (Task 1), calling the Task 2 helper on
failure, with `list` continuing to degrade to `[]` and `listOrThrow`
continuing to reject.
**Files:** `frontend/src/lib/api/entity-relationships.ts`,
`frontend/tests/unit/entity-relationships-transport.test.ts`
**Done when:** Both methods parse to `unknown` and validate against the
array schema; `list` calls `reportTransportValidationFailure` then returns
`[]` on a validation failure exactly as it already does on a non-2xx
response, a non-array body, or a thrown network error (no change to that
existing degrade path's other branches); `listOrThrow` calls
`reportTransportValidationFailure` then rejects on a validation failure
exactly as it already rejects on its existing non-array check; the
existing `create`/`remove`/`removeForEntity` methods and their own guards
in this file are byte-for-byte unmodified (FR-7's adjacent
non-regression intent extended to this file's other methods, which are
out of scope); new test cases cover a well-formed-but-schema-violating
array element (e.g. wrong `relationshipType` field type) for both methods;
and `pnpm --filter getwrite-frontend test:ci`/`typecheck`/`lint` pass.
**Depends on:** Task 1, Task 2
**Estimate:** 5
**Notes:** Only `list` and `listOrThrow` are in scope per FR-4/FR-5 — do
not touch `create`, `remove`, or `removeForEntity` in this task.
**POS:** task_41411e90
**Done:** [x]

### Task 7: Validate `entity-alias-table.ts`'s getEntityAliasTable against the new `EntityAliasTable` schema (FR-6, FR-8, FR-9)
**What:** Adds runtime validation of
`httpEntityAliasTableTransport.getEntityAliasTable`'s parsed response body
against the `EntityAliasTableSchema` from Task 1, calling the Task 2 helper
and continuing to degrade to `{ entities: {}, claimedBy: {} }` on failure.
**Files:** `frontend/src/lib/api/entity-alias-table.ts`,
`frontend/tests/unit/entity-alias-table-transport.test.ts`
**Done when:** `getEntityAliasTable` parses to `unknown`, validates against
`EntityAliasTableSchema`, calls `reportTransportValidationFailure` then
returns `{ entities: {}, claimedBy: {} }` on a validation failure exactly
as it already degrades on a non-2xx response or thrown network error, a
new test case feeds a malformed body on a 2xx response and asserts the
degraded fallback is returned, and
`pnpm --filter getwrite-frontend test:ci`/`typecheck`/`lint` pass.
**Depends on:** Task 1, Task 2
**Estimate:** 3
**Notes:** None.
**POS:** task_a2ca12e0
**Done:** [x]

### Task 8: Confirm `trash.ts` is untouched and native backends carry no validation logic (FR-7, FR-10)
**What:** A verification-only task closing FR-7 and FR-10: confirms
`lib/api/trash.ts`'s three existing guards are unmodified by this feature's
diff, and confirms none of the five native in-process backend modules
(`native-resource-backend`, `native-project-types-backend`,
`native-project-backend`, `native-entity-relationships-backend`,
`native-entity-alias-table-backend`) import the Task 1 schemas or the Task
2 helper.
**Files:** none modified; this task inspects
`frontend/src/lib/api/trash.ts` and the five
`frontend/src/store/transport/native-*-backend.ts` files named above
**Done when:** A diff against the pre-feature `trash.ts` shows zero changes
(`git diff` on that file is empty at the point this task is checked), a
grep of the five native backend files for the new schema module's import
path and the new helper's import path returns zero matches, and this is
recorded (e.g. in the PR description or a short note in this task's
checkbox comment) as the explicit FR-7/FR-10 confirmation.
**Depends on:** Task 3, Task 4, Task 5, Task 6, Task 7
**Estimate:** 1
**Notes:** This task exists because FR-7 and FR-10 are non-regression
requirements with no code of their own to write — they are verified after
the other tasks land, not implemented standalone. If either check fails,
the fix belongs in whichever of Tasks 3-7 introduced the regression, not
in this task.
**POS:** task_eb8558ad
**Done:** [x]

### Task 9: Full-suite gate check
**What:** Runs the repository's three-part gate
(`pnpm --filter getwrite-frontend typecheck`, `lint`, `test:ci`) once across
the complete feature diff, after all other tasks are done, to catch any
cross-task interaction the per-task checks missed.
**Files:** none (verification only)
**Done when:** `pnpm --filter getwrite-frontend typecheck` reports zero
errors, `pnpm --filter getwrite-frontend lint` reports zero errors, and
`pnpm --filter getwrite-frontend test:ci` passes in full, including all six
named pre-existing test files
(`tests/unit/resources-api.test.ts`,
`resources-api-delete-folder.test.ts`, `project-types.test.ts`,
`task9d-api-projectid.test.ts`, `entity-relationships-transport.test.ts`,
`entity-alias-table-transport.test.ts`) plus any new test files added in
Tasks 3-7.
**Depends on:** Task 3, Task 4, Task 5, Task 6, Task 7, Task 8
**Estimate:** 1
**Notes:** None.
**POS:** task_06e18f16
**Done:** [x]

## Summary
- Total tasks: 9
- Total estimated effort: 28 (story points: 3+2+5+3+5+5+3+1+1)
- Critical path: Tasks 1 -> 5 -> 8 -> 9 (Task 1 and Task 2 are the two
  prerequisites; Task 5 carries the highest-stakes FU-10 regression test
  among the parallel call-site tasks 3-7, all of which can run
  independently and concurrently once 1 and 2 are done; Task 8 must wait
  for all five call-site tasks; Task 9 is the final gate)
- Risks: Task 5 (FR-3) is the highest-value and highest-scrutiny task since
  it directly closes the FU-10 incident — reproducing the exact malformed
  shape from that incident in a test is more open-ended than the other
  call-site tasks and may take longer than its estimate suggests. Task 1's
  three newly authored schemas (`ProjectApiEntry`, `EntityRelationshipEdge`,
  `EntityAliasTable`) have no existing schema to check shape-parity
  against, unlike Task 4's reuse of `ProjectTypeSchema` — a shape mismatch
  discovered only once a call-site task (3, 5, 6, or 7) starts writing
  tests would require revising Task 1 after the fact; reviewing each new
  schema against its owning module's current TypeScript type before
  starting Tasks 5-7 mitigates this.

## Open Questions

None. All open questions in the source feature spec were resolved by the
owner on 2026-09-16 and are not reopened by this task list.
