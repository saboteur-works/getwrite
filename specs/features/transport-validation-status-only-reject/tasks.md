# Tasks: Transport response-body validation — status-only reject, unchecked success cast (Feature 51)

Source spec: `specs/features/transport-validation-status-only-reject.md`.

## New-file declaration note — read before starting

Every task that creates a new file — including a new test file, not just new
source files — MUST declare that file's exact path in its `Files` field. Two
tasks in this repo have previously collided by independently choosing the
same new path (see `specs/features/locked-access-fail-closed/tasks.md`'s
Task 4/Task 9 note); this list declares every new path up front so that
cannot recur here.

## Sequencing note — read before starting

All five in-scope sites import from one shared module,
`frontend/src/lib/api/schemas.ts`. Two tasks editing that file concurrently
in separate worktrees is a real integration hazard (an add-only diff to the
same file from two branches is usually mergeable, but only if neither task
needs to read the other's addition first, and the compile/export tasks below
do not). So:

- **Task 1 adds all five new schemas in one pass** — `TextCompileResultSchema`,
  `MarkdownCompileResultSchema`, `TextExportResultSchema`,
  `MarkdownExportResultSchema`, `PatchRevisionContentResponseSchema` — rather
  than splitting schema authorship across the site tasks. This is a
  deliberate deviation from a stricter one-task-per-site split: it removes
  all `schemas.ts` contention downstream, at the cost of Task 1 being
  slightly broader than a single call site.
- **Tasks 2 and 3 (compile.ts, export.ts) touch disjoint files** and can run
  in parallel once Task 1 lands — they are separate modules with
  near-identical work (per the spec's OQ-1 resolution, deliberately using
  independent schemas, not a shared one), so grouping each module's two
  methods (`text`+`markdown`) into one task keeps each task's diff coherent
  and matches how Feature 48/50 grouped by module.
- **Task 4 (`patchRevisionContent`) is its own task**, separate in kind from
  Tasks 2-3: it is a contract change (stop fabricating a timestamp; resolve,
  never throw) plus a type-widening ripple through
  `resources.ts`/`useCanonicalAutosave.ts`, not a same-shape reject-and-throw
  site. It depends only on Task 1.
- Tasks 2, 3, and 4 have no dependency on each other and can proceed in
  parallel once Task 1 is merged.

## Tasks

### Task 1: Author the five new transport-response schemas
**What:** Add `TextCompileResultSchema`, `MarkdownCompileResultSchema`,
`TextExportResultSchema`, `MarkdownExportResultSchema`, and
`PatchRevisionContentResponseSchema` to `frontend/src/lib/api/schemas.ts`, per
FR-1 through FR-5 and OQ-1's resolution (four independent schemas, no sharing
between compile and export).
**Files:** `frontend/src/lib/api/schemas.ts` (edit only — appends new
exported schemas; no new file)
**Done when:** `schemas.ts` exports all five schemas with these exact shapes:
`TextCompileResultSchema` and `TextExportResultSchema` both
`{ text: string; filename: string }`; `MarkdownCompileResultSchema` and
`MarkdownExportResultSchema` both `{ markdown: string; filename: string;
warnings: MarkdownConstructWarning[] }` (with a local Zod object matching
`MarkdownConstructWarning`'s four fields — `construct: string`, `label:
string`, `kind: "html-fallback" | "dropped"`, `count: number` — from
`frontend/src/lib/export/types.ts:11-30`, since `schemas.ts` has no existing
import of that type); `PatchRevisionContentResponseSchema` is
`{ updatedAt: z.string().optional() }`. None of the five schemas is imported
or referenced by any other file yet (this task only adds them). `pnpm
typecheck` and `pnpm lint` pass for `schemas.ts`.
**Depends on:** none
**Estimate:** 2
**Notes:** Per FR-8, these MUST land in `frontend/src/lib/api/schemas.ts`,
never in `frontend/src/lib/models/schemas.ts`. Compile's and export's two
schemas are intentionally byte-identical in shape but independently declared
(OQ-1) — do not factor out a shared base type for them.
**Done:** [x] — check off when the task is complete

### Task 2: Validate `compile.ts`'s `text` and `markdown` (FR-1, FR-2, FR-7, FR-9)
**What:** Validate `httpCompileTransport.text` (`compile.ts:120-122`) and
`httpCompileTransport.markdown` (`compile.ts:124-127`) against
`TextCompileResultSchema`/`MarkdownCompileResultSchema` before returning,
rejecting (throwing) on a validation failure and reporting via
`reportTransportValidationFailure` first, matching the existing reject-on-
`!response.ok` contract.
**Files:** `frontend/src/lib/api/compile.ts`,
`frontend/tests/unit/compile-transport-validation.test.ts` (new)
**Done when:**
- `text` and `markdown` each parse the response body with `safeParse`
  against their schema; on failure, each calls
  `reportTransportValidationFailure("compile.text", issues)` /
  `reportTransportValidationFailure("compile.markdown", issues)` (call-site
  ids matching the `<module>.<method>` convention already used across
  `projects.ts`/`tags.ts`/`resources.ts`) and then throws; on success, each
  returns the parsed body unchanged.
- New test file asserts, for both methods: (a) a well-formed body resolves
  and `reportTransportValidationFailure` is NOT called; (b) a malformed body
  (missing/wrong-typed field) rejects (`rejects.toThrow()`), and
  `reportTransportValidationFailure` IS called once with the exact call-site
  id and `expect.any(Array)`; (c) a leak check — a malformed body seeded
  with a sentinel manuscript-text string never appears in any argument
  passed to `reportTransportValidationFailure` or to `console.warn` (mirror
  `frontend/tests/unit/resource-excerpts-transport.test.ts`'s sentinel-string
  pattern), for both the `text` and `markdown` methods.
- `httpCompileTransport.pdf`/`docx` are untouched (still read
  `response.arrayBuffer()`, no schema check) — confirmed by leaving those
  two methods out of both the diff and the new test file, per the spec's
  Non-goals and OQ-2.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test:ci` pass for the changed and
  new files.
**Depends on:** 1
**Estimate:** 3
**Notes:** `native-compile-backend.ts` needs no change (FR-9) — it returns
the compile core's already-typed result directly, crossing no serialization
boundary; confirm this by inspection before finishing, do not edit that file.
**Done:** [x] — check off when the task is complete

### Task 3: Validate `export.ts`'s `text` and `markdown` (FR-3, FR-4, FR-7, FR-9)
**What:** Validate `httpExportTransport.text` (`export.ts:84-87`) and
`httpExportTransport.markdown` (`export.ts:89-92`) against
`TextExportResultSchema`/`MarkdownExportResultSchema` before returning,
rejecting (throwing) on a validation failure and reporting via
`reportTransportValidationFailure` first, matching the existing reject-on-
`!response.ok` contract.
**Files:** `frontend/src/lib/api/export.ts`,
`frontend/tests/unit/export-transport-validation.test.ts` (new)
**Done when:**
- `text` and `markdown` each parse the response body with `safeParse`
  against their schema; on failure, each calls
  `reportTransportValidationFailure("export.text", issues)` /
  `reportTransportValidationFailure("export.markdown", issues)` and then
  throws; on success, each returns the parsed body unchanged.
- New test file asserts the same three shapes as Task 2's test file (well-
  formed resolves with no report call; malformed rejects with the report
  call carrying the exact call-site id; leak check with a sentinel
  manuscript-text string absent from every reporter/console argument), for
  both `text` and `markdown`.
- Confirmed per the spec's Non-goals: `export.ts` has no binary-format
  (`ArrayBuffer`) methods today, so there is no equivalent of Task 2's
  pdf/docx exclusion to record here beyond noting it in the PR.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test:ci` pass for the changed and
  new files.
**Depends on:** 1
**Estimate:** 3
**Notes:** `native-export-backend.ts` needs no change (FR-9) — same
reasoning as Task 2; confirm by inspection, do not edit that file.
**Done:** [x] — check off when the task is complete

### Task 4: `patchRevisionContent` — stop fabricating `updatedAt`, widen the type (FR-5, FR-6, FR-7, FR-9)
**What:** Change `httpResourcesTransport.patchRevisionContent`
(`resources.ts:325-336`) to validate its parsed body against
`PatchRevisionContentResponseSchema`, report via
`reportTransportValidationFailure("resources.patchRevisionContent", issues)`
on a validation failure, and return `{ updatedAt: data.updatedAt }` (absent
when the server sent none) instead of substituting
`new Date().toISOString()`; widen the `ResourcesTransport.patchRevisionContent`
interface return type (`resources.ts:162-167`) and the public wrapper
(`resources.ts:563-576`) from `Promise<{ updatedAt: string }>` to
`Promise<{ updatedAt?: string }>`; widen
`useCanonicalAutosave.ts`'s `persistCanonicalRevisionContent` return type
(`components/WorkArea/useCanonicalAutosave.ts:47`) from
`Promise<{ updatedAt: string } | undefined>` to
`Promise<{ updatedAt?: string } | undefined>`.
**Files:** `frontend/src/lib/api/resources.ts`,
`frontend/components/WorkArea/useCanonicalAutosave.ts`,
`frontend/tests/unit/resources-patch-revision-content-validation.test.ts`
(new)
**Done when:**
- `httpResourcesTransport.patchRevisionContent` no longer calls `new
  Date().toISOString()` anywhere; on a malformed body it calls
  `reportTransportValidationFailure("resources.patchRevisionContent",
  issues)` and resolves with `{ updatedAt: undefined }` (does NOT throw); on
  a well-formed body it resolves with the server's real `updatedAt` and does
  NOT call the reporter.
- The three type signatures named above are widened as described; `pnpm
  typecheck` passes with no `any`/unsafe-cast workaround introduced to paper
  over the widening.
- `saveCanonicalRevisionNow`'s existing guard,
  `if (selectedResourceId && result?.updatedAt)`
  (`useCanonicalAutosave.ts:76`), is left unchanged — confirm no edit was
  needed there, since an absent `updatedAt` already skips the dispatch.
- New test file covers the third test shape from the spec's OQ-3: (a) a
  malformed body — resolves (does not throw), returns `{ updatedAt:
  undefined }`, and `reportTransportValidationFailure` is called once with
  `"resources.patchRevisionContent"` and `expect.any(Array)`; (b) a
  well-formed body — resolves with the real `updatedAt` string and the
  reporter is NOT called.
- `native-resource-backend.ts`'s `patchRevisionContent` (`:187-198`) is left
  unmodified — verified by inspection that it always returns a defined
  `updatedAt` from `updateRevisionInPlace`, which remains valid under the
  widened optional type (FR-9). `frontend/tests/unit/native-resource-backend.test.ts`'s
  `patched.updatedAt` assertion (`expect(patched.updatedAt).toBeDefined()`,
  around line 303) is left unmodified and still passes unchanged.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test:ci` pass for all changed and
  new files, including a full run to confirm no other consumer of
  `patchRevisionContent`'s return type broke under the widening.
**Depends on:** 1
**Estimate:** 5
**Notes:** This site must NOT be promoted to a rejection (per FR-5 and the
spec's Out-of-scope list) — the save already succeeded server-side; do not
add a `throw` path here even for symmetry with Tasks 2/3. OQ-4 (accepted as
permanent end state: a malformed body leaves the resource tree/word count
stale until a real save follows) needs no code change in this task — it
describes existing, already-accepted behavior downstream of the guard, not a
new requirement.
**Done:** [x] — check off when the task is complete

### Task 5: Full-suite verification and regression check
**What:** A verification checkpoint, not new code: run the complete
frontend verification suite with Tasks 1-4 applied and confirm no
regression against the pre-existing baseline.
**Files:** none (verification only)
**Done when:** From `frontend/`: `pnpm typecheck`, `pnpm lint`, and `pnpm
test:ci` all pass with Tasks 1 through 4 merged. `pnpm test:ci`'s totals are
at or above the pre-existing baseline (430 files / 4046 passed / 1 skipped)
with the difference accounted for exactly by the new tests added in Tasks
2-4 (three new test files) — no existing test newly fails or is skipped.
Manual grep confirms exactly five new `reportTransportValidationFailure`
call sites were added across `compile.ts` (2), `export.ts` (2), and
`resources.ts` (1), each with the call-site id documented in the task that
introduced it.
**Depends on:** 2, 3, 4
**Estimate:** 1
**Notes:** This gate exists because three separate tasks touch import
surfaces of the same `schemas.ts` module Task 1 extended; running the full
suite once all three have landed is cheaper than trusting each task's
individual test run to catch a subtle interaction (e.g. an accidental
schema name collision).
**Done:** [x] — check off when the task is complete

## Summary
- Total tasks: 5
- Total estimated effort: 14 points (2+3+3+5+1)
- Critical path: Task 1 → Task 4 → Task 5 (Task 4 is the largest and only
  task touching three files across two directories; Tasks 2 and 3 are
  parallelizable with Task 4 once Task 1 lands but are individually shorter)
- Risks:
  - **Task 1 is a shared-file bottleneck by design** — all four downstream
    tasks import from it. Keeping it a single, narrowly-scoped, no-consumer
    task (adds schemas, wires nothing) is what makes Tasks 2-4 safely
    parallel afterward; do not let Task 1's scope creep into wiring any
    call site.
  - **Task 4** carries the only contract change and the only cross-file type
    widening in this feature — it is the task most likely to surface an
    unexpected consumer of `patchRevisionContent`'s return type that the
    spec's traced blast radius missed. If `pnpm typecheck` surfaces a
    consumer not named in FR-6, stop and reconcile against the spec before
    silently patching it.
  - **Leak-check tests (Tasks 2, 3)** are a hard requirement per the spec's
    OQ-3, not a nicety — compile/export bodies can carry server-decrypted
    manuscript prose. A task that skips the sentinel-string leak assertion
    and only asserts the throw/report-call shape has not met its Done
    condition, even if the tests it wrote pass.
