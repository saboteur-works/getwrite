# Tasks: Hidden and lost work (Feature 89)

Source spec: `specs/features/hidden-and-lost-work.md` (FR-1..FR-33, US-1..US-5; Gate 3 answers OQ-1..OQ-4 and decision 5 of 2026-10-18 are folded in). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 89. Branch: `fix/hidden-and-lost-work`, main checkout.

Shape of the work: five independent parts, cut by part (FR-30). A part closed by a non-reproducing reproduction, or stopped for the owner, is reported and does not block the others. Model: `specs/features/desktop-defects/tasks.md` (Feature 88).
- Task 1: baselines and `experiments.md`.
- Part 1, unreadable projects (Tasks 2-5): reproduce, core and schema, start-page card, Storybook story.
- Part 2, nested-folder delete (Tasks 6-7): reproduce, then cause and fix.
- Part 3, deprecated fields (Tasks 8-9): red test, then fix.
- Part 4, `entityKind` (Tasks 10-11): measure, then the branch (a)/(b)/(c) the measurement selects.
- Part 5, swallowed lock error (Tasks 12-15): survey, reproduction, fix, and the FR-32 tree-unreadable entry.
- Task 16: in-app exercise on a web build.
- Task 17: handbook, `docs/features/resource-subtype.md` and `frontend/CLAUDE.md` updates, in this branch (FR-26).
- Task 18: final suites including `pnpm test:e2e`.

Measurements go in `specs/features/hidden-and-lost-work/experiments.md`, in the style of `specs/features/desktop-defects/experiments.md` (environment record, method, observed values, what was not measured). A measurement states what was observed; a cause is written as a cause only where an experiment separated it from the alternatives.

**Sequencing rule (owner: no worktrees).** All tasks run one at a time, in the main checkout, on branch `fix/hidden-and-lost-work`. The dependencies below form a single chain on purpose, so the orchestrator must not parallelise any task into a worktree. A dependency on a task that closed with no product change, or stopped, is treated as satisfied by that task's recorded outcome.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Do not switch branches. Implementors do not commit and do not push; the orchestrator commits.
- Never read, list or write `~/Library/Application Support/getwrite-electron/`, `~/Library/Application Support/GetWrite/`, `~/Documents/GetWrite`, `~/Library/Logs/getwrite-electron`, or the repository's `projects/` (FR-28). Any run that needs a projects directory uses a throwaway one set through `GETWRITE_PROJECTS_DIR`, with its path recorded.
- Before starting any app or server, run `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` and record the output; run it again after the last process of the run stops. If anything listens on 7340 no desktop run starts. If 3000 is held, use another free port and say so. Stop only processes the task started, by recorded pid; never by port or name; never `pkill` or `killall`.
- Builds and anything that starts a process (`pnpm build`, `pnpm test:e2e`, `pnpm storybook`, `lsof`) run OUTSIDE the command sandbox in the main checkout. Unit suites, typecheck, lint, knip and git run inside the sandbox.
- Tests are written first and seen red before the fix (`docs/standards/testing.md`); code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions) and `docs/standards/failure-visibility.md`. Add to an existing test file before creating a new one. Run the narrowest file with `pnpm --filter getwrite-frontend exec vitest run <file>`.
- Write no cause that no experiment separated. Report a suite or run not made as not run, never as passing. Add no new route, feature flag or setting. Write no unmeasured result as fact in any handbook page.

### Task 1: Baselines on the unfixed tree and create `experiments.md`
**What:** Record the process listing and the unfixed-tree results of the frontend, knip, e2e, electron and cli suites, and create `experiments.md`.
**Files:** Creates `specs/features/hidden-and-lost-work/experiments.md` (header, environment record, "Baselines" section). No source change.
**Done when:** `experiments.md` states, each as an observed value with command and date: the `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` output; from `frontend/`, `pnpm test:ci` (passed / failed / skipped), `pnpm typecheck` (exit code) and `pnpm lint` (error and warning counts); from the repo root `pnpm knip` (finding count); `pnpm test:e2e` from `frontend/` (counts, names of any failures); from `electron/` and `cli/`, their test commands (counts); `git status --short` and `git rev-parse HEAD`. A command that cannot run is recorded as not run with the reason. `git status --short` shows no change outside `specs/`.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-28, FR-29 (baseline half), FR-31. `pnpm test:e2e` needs Storybook on 6006: record any existing 6006 listener first; if this task starts Storybook, record its pid and stop only that pid, confirming the listener is gone. Earlier figures (Feature 88 final suites) are reported, not current; measure. The uncommitted edits to `specs/product/getwrite.features.md`, `specs/product/getwrite.md` and `specs/features/hidden-and-lost-work.md` belong to the pipeline; leave them alone.
**Done:** [ ]

### Task 2: Part 1 reproduction: a wrong-typed manifest field and skipped manifests (FR-1)
**What:** Write the failing tests on `main` that show a wrong-typed `project.json` field rejects the whole project list, and that an unparseable manifest and one missing `id` or `createdAt` are absent from the response, and record the outcome.
**Files:** Modifies `frontend/tests/unit/projects-api-validation.test.ts` and the existing `listProjectsCore` test file under `frontend/tests/` (a new file only if none exists). Appends a Part 1 section to `experiments.md`. Reads `frontend/src/lib/models/project-crud-core.ts` (~98-104, 142-168), `frontend/src/lib/api/projects.ts` (~101), `frontend/src/lib/api/schemas.ts` (~248, ~265), `specs/features/user-handbook/verification.md` (D-38).
**Done when:** a throwaway projects directory holds a healthy project and a project whose `project.json` parses, has string `id` and `createdAt` and one wrong-typed field (the field D-38 names if `verification.md` names it, otherwise a string-typed field given a number); a test through `listProjectsCore` and `httpProjectsTransport.list` (or the schema directly) is red showing the whole list is rejected, and a second red/recorded case shows an unparseable manifest and a manifest missing `id` or `createdAt` are returned today as absent; the reproduction also checks, and records, whether a bad `folder.json` (a field `FolderSchema` rejects) or a bad resource sidecar (`AnyResourceSchema`) in an otherwise healthy project rejects the whole list, and which of manifest, folder or resource D-38's case tripped if it can be reproduced (otherwise the file says it could not, without guessing). If the wrong-typed project does NOT reject the list, the READ mechanism is wrong: Part 1 stops, Tasks 3-5 are left unticked with the halt noted, and `experiments.md` records what was seen.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-1, FR-25, FR-31. The red result reproduces the READ statement; it does not establish D-38's cause. No source change in this task.
**Done:** [ ]

### Task 3: Part 1 fix: unusable-project entries in `listProjectsCore`, the third schema member, native parity
**What:** Make `listProjectsCore` validate each manifest against `ProjectSchema` and return a distinct unusable entry (folder id plus reason category, no contents) for a project whose `project.json` exists and cannot be used, and add the strict third union member on the client.
**Files:** Modifies `frontend/src/lib/models/project-crud-core.ts` (including rewriting the ~158-163 comment that says the core deliberately does not run `ProjectSchema.parse`), `frontend/src/lib/api/schemas.ts` (a new unusable-entry schema beside `LockedProjectListEntrySchema`, declaring only the folder id and reason category), `frontend/src/lib/api/projects.ts` (third union member, still strict), `frontend/tests/unit/projects-api-validation.test.ts` and the `listProjectsCore` test file. Reads `frontend/src/lib/store/transport/native-project-backend.ts` (~68).
**Done when:** the Task 2 tests are green with the healthy project listed and each unusable project returned as an entry carrying folder id and reason `unparseable`, `missing-field`, `invalid-manifest` or `manifest-unreadable` (an existing-but-unreadable `project.json`, no error text) and no resources or folders; a directory with no `project.json` and a `project.json` that is ENOENT are still skipped and unlisted; a locked-access error on a manifest is rethrown, not folded into an unusable entry; the reason never contains file contents or any value read from the manifest; "REJECTS a malformed array entry" is replaced, not deleted, by one test that pins that an unusable entry is accepted as the third shape with the rest listed and a separate test that pins that a non-array response and an unrecognisable entry are still rejected and reported without the body; the client third-member schema declares only the id and reason category (FR-7); a test pins that the native backend path and the HTTP path return the same result because both sit on the one core; `isLocked` and `isEncrypted` are not reused; `pnpm typecheck` from `frontend/` exits 0.
**Depends on:** 2
**Estimate:** 5
**Notes:** Satisfies FR-2, FR-3, FR-6, FR-7, FR-25 (OQ-1, OQ-4). `tree-unreadable` is a member of the reason enumeration here (so FR-33 sees five categories) but is produced only by Task 15. This reverses the stated intent of the old comment; the comment must say what the code now does.
**Done:** [ ]

### Task 4: Part 1 UI: the unusable-project card and the start-page flows
**What:** Render each unusable entry on the start page as a card that cannot be opened, with a reason in plain language, and make the list-reading flows treat it as neither an openable project nor an empty list.
**Files:** Modifies `frontend/components/Start/StartPage.tsx` (~865-891 locked card pattern; sorting, empty state, package, delete flows), possibly a new `frontend/components/Start/UnusableProjectCard.tsx` and a pure reason-to-copy module; the existing `StartPage` tests under `frontend/tests/` (add to existing files first). Reads the locked card and `frontend/src/store/projectsSlice.ts` for how list entries reach the page.
**Done when:** a component test shows an `<article>` card per unusable entry with an accessible name, a label such as "Project · Cannot be opened", the reason text, the folder id as heading, and no open, rename, delete or package control; the "files are still on disk and unchanged" sentence appears only for reasons where that is true and never for `manifest-unreadable` or `tree-unreadable` unless it was checked; the card uses no red class and `text-gw-secondary` or stronger for its text; a test maps each of the five reason categories to its card text so that a category added without copy fails (FR-33); with only unusable entries present the "Create the first project" empty state is NOT shown, and healthy projects beside unusable ones are listed and openable exactly as before, including after sorting, package and delete; an axe-based a11y test (`frontend/tests/a11y/helpers/axe.ts`) on the card passes; `pnpm typecheck` and `pnpm lint` from `frontend/` are clean for touched files.
**Depends on:** 3
**Estimate:** 5
**Notes:** Satisfies FR-4, FR-5, FR-33, FR-25. Copy is working copy, not owner-reviewed. Confirm any prop against the component source before using it; do not guess props.
**Done:** [ ]

### Task 5: Part 1 Storybook story for the unusable-project card
**What:** Add a Storybook story for the new card so the e2e suite and a11y checks cover it.
**Files:** Creates or modifies the Start-page stories under `frontend/stories/Start/` (add to an existing stories file where the locked card already has one). Reads `docs/standards/storybook-implementation.md` and `docs/standards/accessibility.md`.
**Done when:** a story renders the card for each of the five reason categories (or one story per category), with `parameters: { a11y: { test: "error" } }` considered per the accessibility standard and its decision recorded in a comment or the experiments file; any context the card needs is provided by a decorator; `pnpm typecheck` from `frontend/` exits 0; the story renders when Storybook is started and stopped by pid (OUTSIDE the sandbox, pid recorded, listener gone confirmed), or "not run" is recorded with the reason.
**Depends on:** 4
**Estimate:** 2
**Notes:** Satisfies FR-29 (story half), FR-4. A new context requirement on a component needs a Storybook decorator or the e2e suite fails (Task 18 runs it).
**Done:** [ ]

### Task 6: Part 2 reproduction: nested-folder delete on `main` (FR-8)
**What:** Write a unit test over a real nested layout that calls `softDeleteFolder`, run it once, and record the outcome; if it does not fail, exercise the HTTP route once.
**Files:** Modifies the existing trash test file under `frontend/tests/` (a new file only if none exists). Appends a Part 2 section to `experiments.md`. Reads `frontend/src/lib/models/trash.ts` (`softDeleteFolder` ~446), `frontend/app/api/folder/[folder-id]/delete/route.ts`, `frontend/src/lib/models/project-creator.ts`.
**Done when:** the test builds a layout with `createProjectFromType` (not hand-written fixtures): a folder with one child folder, and a folder with a child and a grandchild, each with a resource at every level; it calls `softDeleteFolder` and asserts the result and the `.trash/` contents; the outcome is recorded as observed (layout, call, response, `.trash/` listing). If it fails on `main`, the failing output is recorded and Task 7 proceeds. If it does NOT fail, the 404 is not reproduced: `POST /api/folder/[folder-id]/delete` is exercised once against the same layout (a throwaway projects directory, server started and stopped by pid, `lsof` recorded) to see whether the 404 comes from the route or the model, the result is recorded, and Part 2 closes with no fix unless a failing case now exists (a fix without a red test is not accepted); Task 7 is then left unticked with "closed: not reproduced".
**Depends on:** 5
**Estimate:** 3
**Notes:** Satisfies FR-8, FR-25, FR-31. The earlier 404 (note_f818d108) is MEASURED earlier and not re-run on `main`; the parents-before-children cause is a HYPOTHESIS. Existing tests use flat layouts, so the nested layout is itself new coverage. No product change.
**Done:** [ ]

### Task 7: Part 2 cause and fix: nested-folder delete moves the whole subtree
**What:** Discriminate which cascade operation fails, then fix `softDeleteFolder` so the whole subtree at any depth goes to Trash and restores as one unit.
**Files:** Modifies `frontend/src/lib/models/trash.ts` (and `trash-core.ts` only if the route path needs it) and the existing trash test file. Appends to the Part 2 section of `experiments.md`.
**Done when:** `experiments.md` records which operation in the cascade fails and with what path, and whether moving a child before its parent changes the result; the hypothesis is called established only if that experiment shows it, otherwise the recorded cause is what was seen; after the fix, for depths 1, 2 and 3 and for a folder holding both a child folder and resources, the folder and every descendant folder and resource are in `.trash/`, `.trash/meta/folder-<id>.json` lists every descendant, `listTrashedItems` shows one entry with its descendants, and `restoreFolder` returns the whole subtree to its original place with each parent/child relation and `orderIndex` as before; a failure partway through is reported to the caller and the independently-idempotent retry-safe behaviour of the cascade is kept (or the change says how retry works); the existing `trash` tests pass unchanged except where a test asserts the failing behaviour; the index/backlink/mention removal, reference nullification and ref record, `" (restored)"` collision handling, root fallback and purge sweep are unchanged (FR-11); `pnpm typecheck` from `frontend/` exits 0.
**Depends on:** 6
**Estimate:** 5
**Notes:** Satisfies FR-9, FR-10, FR-11, FR-25. Runs only if Task 6 reproduced. Test first, seen red, then green.
**Done:** [ ]

### Task 8: Part 3 red test: deprecated fields in `MetadataSidebar` (FR-12)
**What:** Write the component tests that show a deprecated custom field is still shown in the resource sidebar, and record which cases fail on `main`.
**Files:** Modifies the existing `MetadataSidebar` test file under `frontend/tests/` (a new file only if none exists). Appends a Part 3 section to `experiments.md`. Reads `frontend/components/Sidebar/MetadataSidebar.tsx`, `frontend/src/lib/models/field-subtype-scope.ts`, `frontend/src/lib/models/types.ts` (~157).
**Done when:** `MetadataSidebar` is rendered with a project metadata schema holding a custom field with `deprecated: true` and a resource carrying a value for it, and the test asserting the field is not shown is red on `main` (output recorded); cases for a deprecated field that is folder-scoped by group and one restricted by `appliesTo` are also written, with the experiments file recording which of them were already hidden. If the first case does NOT fail, the READ is wrong: Part 3 stops at the finding, Task 9 is left unticked with "closed: already hidden", and `experiments.md` records what was seen. No source change.
**Depends on:** 7
**Estimate:** 3
**Notes:** Satisfies FR-12, FR-25, FR-31. Confirm `MetadataSidebar` props against its source and stories before using them.
**Done:** [ ]

### Task 9: Part 3 fix: hide deprecated fields, keep values, the "Add field" message, wording tests
**What:** Add a pure deprecated-field predicate, use it in `MetadataSidebar`, make the "Add field" form say a deprecated field exists and offer only Close, pin that values survive saves, and pin the four hidden-from-sidebar texts.
**Files:** Modifies `frontend/src/lib/models/field-subtype-scope.ts` or a new leaf module beside it (pure predicate), `frontend/components/Sidebar/MetadataSidebar.tsx` (its only non-test consumer), `frontend/components/Sidebar/AddFieldForm.tsx` and `frontend/src/lib/models/field-dedup.ts` (`findExisting`), and the existing tests; reads `frontend/components/SchemaManager/DeprecateOrClearDialog.tsx` (~89), `frontend/components/help/help-content.ts` (~555), `frontend/src/lib/models/types.ts` (~157), `frontend/src/lib/models/metadata-schema.ts` (~546).
**Done when:** the Task 8 tests are green; a deprecated field is not shown in the sidebar; typing the name of a deprecated field in the "Add field" form shows a message that the field exists and is deprecated (hidden from the sidebar) with only a Close action, does not route to `onFieldFocused`, writes no schema and creates no duplicate (a test pins the message and the absence of any other action); a test pins that saving another field on a resource whose deprecated field holds a value leaves that value in `userMetadata` on disk, and that restoring the field (`deprecated` removed) shows it again with the stored value; a test asserts on the `DeprecateOrClearDialog` text and the help text that each still says the field is hidden from the sidebar and its values are kept, and the four statements (dialog, help, `types.ts` comment, `deprecateField` doc comment) are re-read against the final behaviour and edited only if no longer accurate; a deprecated field stays queryable and flagged in the chip UI (no query, evaluator or Organizer file has a diff); `pnpm typecheck` and `pnpm lint` from `frontend/` are clean for touched files.
**Depends on:** 8
**Estimate:** 5
**Notes:** Satisfies FR-13, FR-14, FR-15, FR-25 (OQ-3 (b)). Runs only if Task 8 reproduced. Copy is working copy, not owner-reviewed. No new route, flag or setting; no un-deprecate action in the sidebar.
**Done:** [ ]

### Task 10: Part 4 measurement: what `updateSidecarCore` stores for `entityKind` (FR-17)
**What:** Measure with the real `updateSidecarCore` what a sidecar holds after a whole-resource payload that omits `entityKind`, and record the result before any fix is chosen.
**Files:** Modifies an existing resource-crud-core test file under `frontend/tests/` or a throwaway measurement script under `specs/features/hidden-and-lost-work/scripts/`; appends a Part 4 section to `experiments.md`. Reads `frontend/src/lib/models/resource-crud-core.ts`, `frontend/app/(app)/page.tsx` (`updateResource`, `applyUpdate`), `frontend/tests/page-stale-sidecar-save.test.tsx`.
**Done when:** `experiments.md` records, from a test or script calling the real `updateSidecarCore` (not a mock) against a sidecar already holding `entityKind`, with a second whole-resource payload that omits `entityKind` (the shape `page-stale-sidecar-save.test.tsx` recorded), what the sidecar holds afterwards (kept, deleted, or set to another value); the same measurement for the payload `page.tsx`'s `updateResource` actually builds, read from the code and not guessed; the branch FR-18 selects ((a) kept, (b) deleted or replaced, (c) other or timing-dependent) is named. Optionally, `aliases` and `wordCountGoal` are measured by the same method and recorded as observations for those keys only, with no product change from them (FR-24). The file states that the wider stale-save family was not measured unless that optional measurement was made.
**Depends on:** 9
**Estimate:** 3
**Notes:** Satisfies FR-17, FR-20, FR-24, FR-31. No product change. The harm to `entityKind` is a HYPOTHESIS until this result.
**Done:** [ ]

### Task 11: Part 4 outcome: pin or fix `entityKind` by the measured branch
**What:** Carry out the one FR-18 branch the Task 10 measurement selects: (a) pin and close, (b) red test then fix limited to `entityKind`, or (c) record and stop for the owner.
**Files:** Branch (a): the `updateSidecarCore` test file. Branch (b): the test files, then `frontend/app/(app)/page.tsx` (`applyUpdate`, adding only the `entityKind` key to the overlay it already applies for `resourceSubtype`) or `frontend/src/lib/models/resource-crud-core.ts`, whichever the measurement implicates. Branch (c): `experiments.md` only. Revises the record of the unfixed omission in `docs/features/resource-subtype.md` and `frontend/CLAUDE.md` (resource-subtype entry) only to what was measured.
**Done when:** the branch taken is named in `experiments.md`. (a) A pinning test at the `updateSidecarCore` level shows the stored `entityKind` is kept, the payload omission is recorded as a finding that did not cause loss, and the claim of harm is stated as disproved for `entityKind` only. (b) A red test at the point of loss is seen failing, then green after the fix; a test asserts that a later custom-field save carries or leaves `entityKind`; a separate red-then-green test shows the clear case still works (clearing Entity Kind or Remove Entity via `clearKeys` is not resurrected by the overlay); the fix touches only `entityKind`. (c) The result is recorded as seen and Part 4 stops for the owner, with no code change. In every branch the experiments file, commit-message draft and report say `aliases` and `wordCountGoal` were not measured (unless Task 10 measured them, then stated for that key only), and `pnpm typecheck` from `frontend/` exits 0 where code changed.
**Depends on:** 10
**Estimate:** 3
**Notes:** Satisfies FR-18, FR-19, FR-20, FR-24, FR-25. Do not claim to fix the wider stale-save family. If branch (b) is taken Task 16 also exercises part 4 in the app.
**Done:** [ ]

### Task 12: Part 5 survey: callers of `readFolderTree`, `childDirs` and adapter ENOENT coding (FR-21)
**What:** Record a survey of every caller of `readFolderTree` and of `childDirs`'s `catch`, and confirm which storage adapters code a missing entry as ENOENT.
**Files:** Appends a Part 5 section to `experiments.md`; adds adapter-level tests where a test per adapter can be written, in the existing adapter test files under `frontend/tests/`. Reads `frontend/src/lib/models/folder-utils.ts` (~5-45), `project-loader.ts` (~14-20, 67), `resource-templates.ts` (~386), `project-crud-core.ts` (~174), `cli/src/commands/doctor.ts` (~63), `core.ts` (~28), `io.ts`, `memoryAdapter.ts`, `objectStoreAdapter.ts`, `capacitorFsAdapter.ts`, `encryptingAdapter.ts`, `workspace-adapter.ts`.
**Done when:** `experiments.md` lists, from a fresh `grep` over `frontend/`, `cli/` and `electron/` including tests, every caller of `readFolderTree`, stating for each the call site, what it does with an empty result, whether it is reached for a project that may be locked or keyless, and whether a locked-access error can reach the `catch` (naming which adapter operation throws for a locked project, noting `childDirs(dir)` is outside that `catch`); the survey covers `childDirs`'s own `catch` around `readdir`; for the fs, memory, object-store, Capacitor and encrypting/workspace adapters it records, by reading and by a test per adapter where one can be written, what `readFile` and `readdir` throw for a missing entry, and names any adapter that does not code ENOENT as a finding (that adapter is fixed, or the tolerance for it decided and recorded, before Task 14). The survey marks each caller exposed or not exposed. No product change.
**Depends on:** 11
**Estimate:** 3
**Notes:** Satisfies FR-21, FR-25, FR-31. The Capacitor ENOENT behaviour is READ, not run. If no caller is marked exposed, Task 13 records that and Part 5 closes (see Task 13).
**Done:** [ ]

### Task 13: Part 5 reproduction: `readFolderTree` swallows a locked-access error (FR-22)
**What:** Write a failing test per exposed caller that calls `readFolderTree` against an adapter throwing `ProjectLockedError` and `MissingProjectKeyError` and shows today's result is empty or partial with no error.
**Files:** Modifies the existing `folder-utils` test file under `frontend/tests/` (a new file only if none exists); appends to the Part 5 section of `experiments.md`.
**Done when:** for each caller Task 12 marked exposed, a test over an adapter throwing `ProjectLockedError` (and one for `MissingProjectKeyError`) from `readFile` is red, asserting an error is surfaced and showing that today the result is an empty or partial array with no error (output recorded). If Task 12 found no caller exposed (for example the adapter throws from the directory listing and the error already propagates), the finding is recorded and Part 5 closes with no product change: Tasks 14 and 15 are then left unticked with "closed: no exposed caller" (FR-15's ENOENT narrowing in Task 14 is not done on its own). The survey, not the READ, decides.
**Depends on:** 12
**Estimate:** 3
**Notes:** Satisfies FR-22, FR-25. No product change. Task 15 (FR-32) is only needed if the narrowing of `readFolderTree`/`childDirs` lands; if Part 5 closes it is left unticked and the report says so.
**Done:** [ ]

### Task 14: Part 5 fix: `readFolderTree` and `childDirs` tolerate only ENOENT and a parse error
**What:** Narrow the `catch` in `readFolderTree` to a missing file (`code: "ENOENT"`) and a JSON parse error, and the `catch` in `childDirs`' `readdir` to ENOENT, rethrowing everything else including locked-access errors.
**Files:** Modifies `frontend/src/lib/models/folder-utils.ts` (the `stat` catch may stay, with a comment saying why), and each exposed caller's file if it has its own `catch` that turns the error back into an empty result (per the Task 12 survey), plus the existing tests. Reads `frontend/src/lib/models/locked-access.ts`, `frontend/src/lib/models/project-loader.ts` (`isMissingEntryError`, ~14-20).
**Done when:** the Task 13 tests are green; `readFolderTree` rethrows a locked-access error and any other non-ENOENT, non-parse error, and keeps its tolerance for an orphan directory with no `folder.json` and for a `folder.json` that does not parse; `childDirs` tolerates only ENOENT from `readdir`; no `catch` returns any other error as the same value as "no folder here"; each exposed caller found in Task 12 is shown by a test to surface the locked state (the HTTP route maps `ProjectLockedError` to 401 and `MissingProjectKeyError` to 409 through `with-storage-context.ts`; a caller with its own `catch` does not turn it back into an empty result); the `cli/` tests are run because `doctor` imports `readFolderTree`; `pnpm typecheck` from `frontend/` exits 0.
**Depends on:** 13
**Estimate:** 5
**Notes:** Satisfies FR-23, FR-25 (OQ-2 (b)). Runs only if Task 13 reproduced. A project that listed before may now fail to read; Task 15 turns that into an unusable card instead of a failed list.
**Done:** [ ]

### Task 15: Part 5 listing: unreadable `folders/` or `resources/` becomes a `tree-unreadable` entry (FR-32)
**What:** Make `listProjectsCore` return an unusable entry with reason `tree-unreadable` for a project whose `folders/` or `resources/` cannot be read for a non-locked-access reason, so one bad project never hides the rest.
**Files:** Modifies `frontend/src/lib/models/project-crud-core.ts` (the ~170 comment is rewritten to say what the code now does; the failure is logged server-side without file contents) and the `listProjectsCore` test file. Reads `project-loader.ts`.
**Done when:** a test shows an adapter that throws a permission-style error from the `folders/` read yields an entry with reason `tree-unreadable` (no error text, no contents) and the rest of the list is returned; a second test shows an adapter throwing `ProjectLockedError` (and `MissingProjectKeyError`) still propagates and is not demoted to an unusable entry; the same holds for `resources/`; the card copy for this reason does not claim the files are unchanged unless that was checked; the FR-33 mapping test from Task 4 stays green with all five categories; `pnpm typecheck` from `frontend/` exits 0.
**Depends on:** 14
**Estimate:** 3
**Notes:** Satisfies FR-32, FR-33, FR-25 (decision 5). Runs only if Task 14 ran; if Part 5 closed with no product change, this task is left unticked with "closed: no exposed caller" and the report states that `tree-unreadable` is declared but not produced. The ~170 comment says a transient failure on a healthy project propagates; that intent changes here.
**Done:** [ ]

### Task 16: In-app exercise of parts 1, 2 and 3 on a web build (FR-27)
**What:** Build the web app, run it against a throwaway projects directory, and exercise parts 1, 2 and 3 once each (and part 4 if branch (b) was taken), recording what is seen as observation.
**Files:** Appends an "In-app exercise" section to `experiments.md`; may create a harness script under `specs/features/hidden-and-lost-work/scripts/`. No source change. Builds in the main checkout.
**Done when:** `experiments.md` records the build used and commit, the throwaway projects directory path set through `GETWRITE_PROJECTS_DIR`, the `lsof` output before and after (compared), the port used (not 3000 if the owner's server holds it), and pids started and stopped by pid; part 1: a directory with one healthy project and one of each unusable kind (unparseable, missing `id`, wrong-typed field) shows the healthy project openable and one cannot-be-opened card per unusable project, the app log has no stack; part 2: a folder with a child and a grandchild is deleted in the tree, appears as one entry in Trash with its descendants, and Restore returns it; part 3: a field is deprecated in the Metadata Fields manager, the sidebar no longer shows it, and after restoring it (through the manager if offered, otherwise by editing the schema in the throwaway directory) it shows with its stored value; part 4 if branch (b). Any part closed with no product change or not exercised is reported as not exercised; a unit test is never reported as an in-app result.
**Depends on:** 15
**Estimate:** 5
**Notes:** Satisfies FR-27, FR-28, FR-31. Needs a build and a server: OUTSIDE the sandbox, in the main checkout, never a worktree (builds fail in worktrees here; `next dev` itself must run outside the sandbox). Do not read `projects/` or any protected folder. If the owner's own server blocks the port, use another free port and say so; do not stop it.
**Done:** [ ]

### Task 17: Handbook, resource-subtype doc and frontend/CLAUDE.md updates in this branch (FR-16, FR-20, FR-26)
**What:** Update the handbook pages for the behaviour that changed, stating only what the Task 16 run observed, and revise the record of the unfixed omission in `docs/features/resource-subtype.md` and `frontend/CLAUDE.md` to what was measured.
**Files:** Modifies `docs/user/handbook/organize/start-page.md` (the unusable-project card, its states and copy as built, including `manifest-unreadable` and `tree-unreadable`), `docs/user/handbook/protect-and-finish/trash.md` (lines 9 and 13 on folder delete, and its "Warnings and limits" list if a limit changed), `docs/user/handbook/story/metadata.md` (line 34: what was measured about Deprecate after the fix), and `docs/user/handbook/views/entity-roster.md` or `story/metadata.md` only if part 4 changed visible behaviour; `docs/features/resource-subtype.md` (the `page-stale-sidecar-save` paragraph) and `frontend/CLAUDE.md` (the resource-subtype / `page.tsx` `updateResource` entry), each to what was measured only.
**Done when:** each page whose behaviour changed is updated in the page's existing "observed" style and no sentence states an unmeasured result as fact; a part whose behaviour did not change changes no page (stated in the report); the Trash page says only what the post-fix run observed for nested depths; `git diff --stat` shows changes only under `docs/user/handbook/`, `docs/features/resource-subtype.md`, `frontend/CLAUDE.md` and `specs/`; the scribe is not named as a follow-up for these pages.
**Depends on:** 16
**Estimate:** 3
**Notes:** Satisfies FR-16, FR-20, FR-26. A part that closed with no product change or stopped contributes no handbook change. Copy for the card is working copy.
**Done:** [ ]

### Task 18: Final suites (FR-29) and acceptance record
**What:** Run the final suites, record each as run or not run against the baseline, and record which parts landed, closed with no product change, or stopped.
**Files:** Appends a "Final suites" section to `experiments.md`. No source change.
**Done when:** the section states for each part (1-5) whether it landed, closed with no product change, or stopped for the owner, citing its reproduction and test records (FR-1, FR-8, FR-12, FR-17, FR-21/22); from `frontend/`, `pnpm test:ci`, `pnpm typecheck` and `pnpm lint`, and from the repo root `pnpm knip` (findings naming touched files listed separately), are each recorded with counts or exit codes against the Task 1 baseline; `pnpm test:e2e` is run with Storybook on 6006 (port confirmed free first, pid recorded, stopped by that pid, listener gone confirmed) and compared to the baseline; `cli/` tests are run if `readFolderTree`'s behaviour changed (Task 14), otherwise `git diff --stat -- cli` (empty) is given; the electron tests are run only if `electron/` is touched; the `lsof` output before and after the whole feature run is compared; the in-app observations of Task 16 are listed separately from the suites, each as run or not run; a failing suite is recorded with test names and not fixed here; a suite not run is not reported as passing; `git status --short` shows changes only under `frontend/`, `cli/` (if touched), `docs/user/handbook/`, `docs/features/resource-subtype.md` and `specs/`.
**Depends on:** 17
**Estimate:** 3
**Notes:** Satisfies FR-29, FR-30, FR-31. `pnpm test:e2e`, `pnpm storybook` and `lsof` run OUTSIDE the sandbox in the main checkout; the others inside. A new context requirement on `StartPage` or the card needs the Storybook decorator from Task 5, or e2e fails. A dependency on a closed or stopped task is treated as satisfied by its recorded outcome.
**Done:** [ ]

## Summary
- Total tasks: 18
- Total estimated effort: 65 story points
- Critical path: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 (a single chain by design: sequential in the main checkout, no worktrees)
- Risks: Task 2, 6, 8 and 13 (each reproduction may not fail; the part then closes with no product change and its later tasks are not applicable); Task 3 (reverses the intent of an existing core comment; native and HTTP parity must hold); Task 7 (the cause is a hypothesis; the fix depends on what the discriminating experiment shows); Task 11 (branch (c) stops Part 4 for the owner); Task 12 (an adapter that does not code ENOENT must be fixed or decided before Task 14); Task 14 and 15 (a project that listed before can now fail to read, handled as an unusable card); Tasks 1, 5, 6, 16 and 18 (need a build, server or Storybook outside the sandbox in the main checkout with a recorded `lsof` check and stop-by-pid; a held port ends a run as not run).
