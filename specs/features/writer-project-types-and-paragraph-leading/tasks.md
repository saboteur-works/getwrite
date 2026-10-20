# Tasks: Writer-made project types, and paragraph leading that follows the project's line height (Feature 90)

Source spec: `specs/features/writer-project-types-and-paragraph-leading.md` (FR-1..FR-26, US-1..US-4; Gate 3 answers OQ-1..OQ-6 of 2026-10-19 are folded in). Parent: `specs/product/getwrite.features.md` Feature 90. Branch: `feat/writer-project-types-and-paragraph-leading`, main checkout. Granularity: story points (1/2/3/5/8); sizes S = 1-2, M = 3, L = 5 or more. No task is L: anything that was L is split.

Shape of the work: one baseline, then two independently cuttable parts, then the final suites.
- Task 1: baselines.
- Part 2 (paragraph leading and the 1.8 floor; FR-1, FR-18..FR-24; Tasks 2-11). Smaller part, ordered first. Starts with the FR-1 experiment (Task 2) before any code it informs. Tasks 3-7 are the leading chain; Tasks 8-9 are the floor chain and do not depend on the leading chain (they can run in parallel with Tasks 3-7). Task 10 is the browser-level test, Task 11 the part's documentation. Part 2 depends on nothing in Part 1.
- Part 1 (saved project types; FR-2..FR-17; Tasks 12-27). Starts with the FR-2 experiments (Tasks 12, 13) before any code they inform. Part 1 depends on nothing in Part 2 (the manager's Line Height field, FR-23, is in Part 2 Task 9; if Part 2 is cut, Part 1 still ships and its Save is gated by `validateDraft` as it stands).
- Task 28: final suites, Storybook stories and decorators audit (FR-26).

Parallelism: after Task 1, the experiment tasks 2, 12, 13 and the floor chain (8) have no mutual dependency. Within Part 2: {3 then 4 then (5, 6 in parallel) then 7}, and {8 then 9}. Within Part 1: {14 then 15 then (16, 18, 20)}, {19 after 18}, {21 after 17 and 19}, {22 after 21}, {23 after 22}, {24 after 17}, {25 after 17 and 20}, {26 after 16}. Tasks that share a source file (listed under Notes) should not run in parallel even where the graph allows it; the orchestrator serialises them.

Measurements go in `specs/features/writer-project-types-and-paragraph-leading/experiments.md`, in the style of `specs/features/desktop-defects/experiments.md` (environment record, method, observed values, what was not measured). Each recorded item is labelled MEASURED (observed in a run, stated as values) or UNMEASURED (not run, with the reason). A measurement states what was observed; no cause is written except where an experiment discriminated it from the alternatives. Task 1 creates the file (the spec says the first task that records a measurement creates it).

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Work in the main checkout on branch `feat/writer-project-types-and-paragraph-leading`. No worktrees; do not switch branches. Implementors do not commit and do not push; the orchestrator commits.
- Throwaway data only. Every experiment and every run of the app, a dev server, Storybook-backed e2e or the CLI that touches project data uses throwaway folders under `$TMPDIR` or the scratchpad (`GETWRITE_PROJECTS_DIR` set to a throwaway projects folder; `GETWRITE_SAVED_PROJECT_TYPES_DIR` set to a throwaway folder). NEVER read, list or write the repo's `projects/`, `~/Library/Application Support/getwrite-electron/`, `~/Library/Application Support/GetWrite/`, `~/Documents/GetWrite`, or `~/Library/Logs/*`. Any desktop (Electron) run uses a throwaway `--user-data-dir`, a throwaway workspace folder and a throwaway logs folder, and its first action reads `app.getPath("userData")` and `app.getPath("logs")` and stops, reporting "not run", if either is under a protected folder above. The path assertion decides safety. Each task below that runs the app, a server or the CLI repeats this constraint.
- Before starting any app, dev server or Storybook, run `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` and record the output. If anything listens on 7340 the desktop app MUST NOT start (it has no fallback port). `pnpm test:e2e` builds and serves Storybook itself on :6006: never start `pnpm storybook` first, and if 6006 is already held, stop and report (the run refuses the port).
- Never stop a process the task did not start. Record the pid (and descendants) of every process the task starts and stop only those, by pid. Never stop by port or name; no `pkill`/`killall`. Confirm they exited.
- Commands that start a server, the app, a build or Playwright run OUTSIDE the command sandbox, in the main checkout (builds fail in worktrees here; `next dev` needs to run outside the sandbox). Unit suites, typecheck, lint, knip and read-only git run inside the sandbox. If a dev server of the user's blocks, report it; do not build workarounds.
- Never print, log or write credentials, cookies or secrets.
- TDD (`docs/standards/testing.md`): write the named test first and show it failing for the stated reason before the change, then passing after. Extend an existing test file before creating one. Never use a prop on an in-project component without opening its source and stories first. Code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions), `docs/standards/failure-visibility.md`, `docs/standards/security.md`, `docs/standards/accessibility.md`. Red is never used for actions or alerts (CLAUDE.md, Styling). Run the narrowest file with `pnpm --filter getwrite-frontend exec vitest run <file>` (or `getwrite-electron` / `getwrite-cli`).
- Write no cause no experiment separated; do not state a suite or run that was not made as passing.
- Halt rule: if a task cannot meet its done condition, leave it unticked, record why, and report; do not work around it. A halted part does not stop the other part.

### Task 1: Baselines on the unchanged tree, and create experiments.md
**What:** Record the process listing and the pre-change results of every final suite, and create `experiments.md` with an environment record and a "Baselines" section.
**Files:** Creates `specs/features/writer-project-types-and-paragraph-leading/experiments.md`. No source change.
**Done when:** `experiments.md` states, each as an observed value with command and date: the `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` output (6006 confirmed free before the e2e run); from `frontend/`, `pnpm typecheck` (exit code), `pnpm lint` (error and warning counts), `pnpm test:ci` (passed / failed / skipped) and `pnpm test:e2e` (counts and names of any failures); from the repo root, `pnpm knip` (finding count and saved-output path); from `electron/`, `pnpm typecheck`, `pnpm test` (counts) and `pnpm build:worker` (exit code); the CLI suite from `cli/` (`pnpm test`, counts); `git status --short` and `git rev-parse HEAD`. A command that cannot run is recorded as not run with the reason. `git status --short` shows no change outside `specs/`.
**Depends on:** none
**Estimate:** 3 (M)
**Notes:** Satisfies FR-26 (baseline half) and the final-suite list. Safety: `pnpm test:e2e` starts Storybook only (no desktop app, no project data); it still runs outside the sandbox with the lsof record, the pid of anything started recorded and stopped by pid, and no read or write of `projects/` or any real app-data folder. Earlier figures are reported, not current; measure. The uncommitted edits to `specs/product/getwrite.features.md`, `specs/product/getwrite.md` and the spec itself are the pipeline's; leave them alone.
**Done:** [ ]

### Task 2: FR-1 experiment: paragraph leading across save and reopen on the unchanged tree
**What:** Run the FR-1 experiment on the unchanged tree and record the observed values in `experiments.md` (Part 2 section).
**Files:** Appends to `experiments.md`. Creates a harness script under `specs/features/writer-project-types-and-paragraph-leading/scripts/` (web dev server plus a Playwright or CDP script; any helper that reads files reads only the throwaway projects folder). No source change.
**Done when:** `experiments.md` records, with a throwaway `GETWRITE_PROJECTS_DIR` and the `lsof` output: in a text resource of at least three paragraphs, (a) the second paragraph set through the toolbar Line Height field to 1.2, first and third as opened; (b) after the autosave and a close and reopen; (c) the inline `line-height` of each paragraph from the DOM and the literal stored `paragraphLeading` of each paragraph (type, string or number, and text) in `content.tiptap.json`, before and after the reopen, and the same literal values in the canonical revision's stored file and in one non-canonical revision's; (d) a paragraph created after opening (Enter at the end of the third paragraph) and a paragraph in a new Blank project whose Body Text Styles line height is 2.2. The record states as observed values only whether the second paragraph kept its value across the reopen and the literal stored value (type and text) of an untouched paragraph in the resource and in its revisions, and what was not measured. If the second paragraph kept its value the record says so and the `onCreate` hypothesis is recorded as "not supported by this run"; no cause is written either way. Processes started are recorded by pid and stopped by pid; nothing outside the throwaway folder was touched.
**Depends on:** 1
**Estimate:** 3 (M)
**Notes:** Satisfies FR-1 (US-4). Its result decides whether Task 5's removal of the `onCreate` stamp is labelled a fix or a regression test; it does not change what FR-18..FR-21 require. Safety: runs a dev server outside the sandbox with `GETWRITE_PROJECTS_DIR` pointing to a throwaway folder under `$TMPDIR` or the scratchpad, never the repo's `projects/` and never a real app-data folder; the harness asserts the resolved projects folder is under the throwaway root before the first request. Web build only; the Electron app is not needed. The result covers this build and these inputs only.
**Done:** [x]

### Task 3: Pure paragraph-leading read/normalise functions
**What:** Add `readParagraphLeading` (single value) and `normalizeParagraphLeadingInDocument` (whole stored document) as pure functions under `frontend/src/lib/`, implementing FR-20's load rule.
**Files:** Creates a module under `frontend/src/lib/` (name TBD by reading; for example `paragraph-leading.ts`) and its unit test file. No consumer changes yet.
**Done when:** the new tests fail first (module absent) and then pass: the string `"1.5"` reads as unset; a number `1.5` reads as 1.5; legacy `"1.2"` reads as the number 1.2; `"abc"`, `"0"`, `"-1"`, `""`, `NaN`, `Infinity`, `null`, `undefined` and an object read as unset; `normalizeParagraphLeadingInDocument` on a document of paragraphs holding unset, 1.2, 2, `"1.5"` and `"1.2"` returns a document equal except that the `"1.5"` attributes are removed and `"1.2"` becomes the number 1.2, does not mutate its input, recurses into nested nodes (lists, blockquotes), and leaves non-paragraph nodes unchanged. `pnpm typecheck` and `pnpm lint` from `frontend/` pass.
**Depends on:** 1
**Estimate:** 2 (S)
**Notes:** Satisfies FR-20 (rule, tests (c) and (e) at function level), FR-21 (finite number greater than 0 test). No upper bound and no minimum above 0 (OQ-5). In memory only: the function marks nothing changed.
**Done:** [x]

### Task 4: Paragraph-leading extension: unset by default, number when set, safe render
**What:** Change `GetWriteParagraphLeading` so the attribute defaults to absent, renders no inline `line-height` when unset, parses pasted `line-height` through the Task 3 rule, and `setParagraphLeading` stores a JSON number and refuses non-positive or non-finite input.
**Files:** Modifies `frontend/components/Editor/Extensions/GetWriteParagraphLeading.ts`; extends `frontend/tests/unit/paragraph-leading-preserves-structure.test.ts` (or the existing extension test file found by reading) rather than creating a new file.
**Done when:** extension-level tests that fail first and pass after: the default attribute is `null`; a rendered unset paragraph has no `line-height` in its style attribute; `setParagraphLeading("1.2")` stores the number `1.2`; `setParagraphLeading` with `"abc"`, `"0"`, `"-1"`, `""` and `NaN` returns false and writes nothing; a stored non-finite or non-positive value renders with no inline style (never interpolated); pasted HTML with inline `line-height: 1.5` reads as unset, `line-height: 2` reads as the number 2, and a non-numeric inline value reads as unset; the command still updates every selected paragraph and `unsetParagraphLeading` still works (`:78-84`). Existing tests in the file still pass, with any that assumed the "1.5" default updated to the rule they now follow and stated.
**Depends on:** 3
**Estimate:** 3 (M)
**Notes:** Satisfies FR-18 (schema half), FR-20, FR-21 (render validity; security.md section 6). The browser-level computed-line-height check is Task 10 (jsdom cannot compute layout).
**Done:** [x]

### Task 5: Remove the `onCreate` stamp and normalise legacy leading at editor creation and content swap
**What:** Delete the `selectAll().setParagraphLeading("1.5")` stamp from `TipTapEditor`'s `onCreate` and apply `normalizeParagraphLeadingInDocument` where stored content enters the editor (creation `content:` and `loadDocumentIntoEditor`).
**Files:** Modifies `frontend/components/Editor/TipTapEditor.tsx` (~417, ~483-491, ~622); extends the existing TipTapEditor test file found by reading (or `paragraph-leading-preserves-structure.test.ts`).
**Done when:** tests that fail first and pass after: for a document whose paragraphs carry unset, 1.2, 2 and a legacy `"1.5"`, the `paragraphLeading` set from `editor.getJSON()` immediately after `onCreate` equals the set before except that the legacy `"1.5"` is now unset (FR-19 acceptance), and opening the document triggers no autosave (nothing marked changed; `isStructuralOnly` path); a pre-change fixture, every paragraph the string `"1.5"`, loads with every paragraph unset; a legacy `"1.2"` paragraph loads as the number 1.2 and renders 1.2 (FR-20 test (a), (c), (d)-reader 1); the same holds after an external content swap (opening a revision). The math migration and cursor reset in `onCreate` are unchanged (existing tests green). The test comment cites the Task 2 record in `experiments.md`, and `experiments.md` gets one line stating whether this change was a fix (second paragraph lost its value in Task 2) or a regression test (it kept it), as observed values.
**Depends on:** 2, 3, 4
**Estimate:** 3 (M)
**Notes:** Satisfies FR-19, FR-20 reader (1). Shares `TipTapEditor.tsx` with Task 7 only through the toolbar wiring; serialise if both touch it.
**Done:** [x]

### Task 6: Other readers of stored leading, and the Markdown export warning
**What:** Apply the single-value rule at the remaining readers of `paragraphLeading` and make the export warning count set leading only.
**Files:** Modifies `frontend/src/lib/export/markdown-serializer.ts` (`tallyNode` ~70, ~100-104), `frontend/components/Editor/MenuBar/menuBarState.tsx` (~61); extends `frontend/tests/unit/markdown-warnings.test.ts` (~82) and the existing menuBarState test file found by reading. Records the reader search in the Notes of this task and in `experiments.md`: a search for `paragraphLeading` and `ParagraphLeading` across `frontend/`, `electron/` and `cli/` (including `.ts`, `.tsx`, tests and stories), listing every hit and whether it reads stored or live data.
**Done when:** tests that fail first and pass after: a legacy `"1.5"` is not counted, the number 1.5 is counted and a legacy `"1.2"` is counted in the "Paragraph line spacing" warning (FR-24); `menuBarState` reports unset for `"1.5"` and null and the number for a set value (reader 3); one test per further reader the search finds (reader 4), or the record states the search found none beyond the three named; the unit tests that used `"1.5"` as the no-warning value are updated with the rule they now follow. The search output is in `experiments.md`.
**Depends on:** 3, 4
**Estimate:** 3 (M)
**Notes:** Satisfies FR-20 readers (2)-(4), FR-24. Can run in parallel with Task 5 (different files). Reader search recorded in `experiments.md` (Task 6 section): readers found are the three named only (extension, markdown warning, menuBarState); `toolbar-command-schema.ts` `getValue` consumes the derived state and was type-adapted; Task 7 rewrites it.
**Done:** [x]

### Task 7: Toolbar Line Height control shows the effective leading and rejects invalid input
**What:** Make the Line Height control show the explicit value or the project's body line height (1.8 when absent) without writing it, drop `initialValue: "1.5"`, and reject non-positive or non-finite typed values with a visible message.
**Files:** Modifies `frontend/components/Editor/MenuBar/toolbar-command-schema.ts` (~348-357) and, as needed, `menuBarState.tsx` and the control's component (found by reading; open its source and stories before using any prop); extends their existing tests and the component's stories.
**Done when:** tests that fail first and pass after: with the cursor in an unset paragraph in a project with line height 2.2 the control shows 2.2 and the document is unchanged; with an explicit 1.2 it shows 1.2; with no project setting it shows 1.8; typing 1.2 sets an explicit 1.2 (no floor: 1.2 and 0.5 are accepted); typing `abc`, `0`, `-1` writes nothing and shows a visible message (linked to the field, `aria-describedby`); `initialValue` no longer appears in the schema entry. A story shows the unset and explicit states.
**Depends on:** 4, 6
**Estimate:** 3 (M)
**Notes:** Satisfies FR-21 (US-4). The explicit leading has no floor (settled decision); only the project fields have the 1.8 floor. If a new context is required by the control, add a Storybook decorator (checked again in Task 28).
**Done:** [x]

### Task 8: 1.8 floor validator, server core, route and schemas
**What:** Add the shared floor validator to `editor-body-settings.ts` and apply it in `updateEditorConfigCore`, the editor-config route, `ApiEditorBodySchema` and `EditorBodySchema`.
**Files:** Modifies `frontend/src/lib/editor-body-settings.ts` (`sanitizeEditorBody` ~37-50), `frontend/src/lib/editor-config-core.ts` (~106-111), `frontend/app/api/project/editor-config/route.ts` (via the core), `frontend/src/lib/api/schemas.ts` (~87), `frontend/src/lib/models/schemas.ts` (~110); extends `frontend/tests/unit/project-editor-config-route.test.ts`, `project-type-validation.test.ts`, `editor-config-transport-validation.test.ts`, `native-editor-config-backend.test.ts` (to confirm the native path inherits the core) and the editor-body-settings test found by reading.
**Done when:** tests that fail first and pass after: the validator accepts empty (meaning 1.8), `"1.8"`, `"2"`, `"3.5"`, and refuses `"1.7"`, `"1"`, `"0.5"`, `"normal"`, `"150%"`, `"1.8em"`, `"28px"`, `"abc"` with the one message "Line height must be a number of at least 1.8."; `updateEditorConfigCore` and `PUT /api/project/editor-config` return 400 for each refused value and write nothing; `ApiEditorBodySchema`, `EditorBodySchema` and therefore `ProjectTypeSchema` reject the same set, and a spec with `lineHeight` below 1.8 fails `validateProjectType`; the native `updateEditorConfig` path rejects the same values (or the test records that it does not share the core and the gap is reported); all six built-in type files still pass `validateProjectType` (test reads them) and existing stored values below 1.8 are not rewritten by any read.
**Depends on:** 1
**Estimate:** 3 (M)
**Notes:** Satisfies FR-22 (b)-(d), FR-26 (floor at core and schema). Refuse, do not clamp (OQ-6). No migration.
**Done:** [x]

### Task 9: Floor in Body Text Styles and in the Project Type Manager Line Height field
**What:** Show the floor refusal in `BodySettingsModal` and the manager's Line Height field, keeping the typed value and refusing Save.
**Files:** Modifies `frontend/components/.../BodySettingsModal.tsx` (~93-95, ~130-137; path found by reading) and `frontend/components/project-types/ProjectTypeEditorForm.tsx` (~533-539); extends `frontend/tests/bodySettingsModal.test.tsx`, the form's existing test and their stories.
**Done when:** tests that fail first and pass after: in Body Text Styles, entering `1.7` or `normal` and pressing Save shows "Line height must be a number of at least 1.8." linked to the field with `aria-describedby`, keeps the typed value, and sends no request; entering empty or `2` saves; in the Project Type Manager the same value shows the same message linked to the field and Save is refused, and `validateDraft` also refuses it (so the two agree). Stories show the error state. An a11y test covers the linked message.
**Depends on:** 8
**Estimate:** 3 (M)
**Notes:** Satisfies FR-22 (a), FR-23 (US-3, US-4). Touches `ProjectTypeEditorForm.tsx`, which Part 1 Tasks 21-22 also edit: do not run Tasks 9 and 22 in parallel. If Part 2 is cut, FR-23 is cut with it.
**Done:** [x]

### Task 10: Browser-level test: computed line height and reopen
**What:** Add a Storybook story and Playwright e2e test that show computed paragraph line height follows the project setting, explicit leading is kept, and a deliberate 1.5 survives save and reopen.
**Files:** Extends or creates a story for the editor with a project body line height prop (open `TipTapEditor`/`EditView` stories first), and extends `frontend/e2e/editor-formatting.e2e.spec.ts` (or the existing editor e2e file found by reading) before creating a new one.
**Done when:** the e2e fails first (against Task 4/5 behaviour reverted, or recorded as such) and passes: with Body Text Styles line height 2.2 an unset paragraph's computed `line-height` is 2.2 times its font size with no inline `line-height`; after the setting changes to 2.4 the same untouched paragraph computes 2.4; with the setting absent it computes 1.8; a paragraph with explicit leading keeps its inline value in all three; after setting one paragraph to 1.5 through the toolbar and a close and reopen (remount from the stored JSON), the stored value is the number 1.5, that paragraph's inline `line-height` is 1.5 and an untouched paragraph has none (FR-20 test (b)). `pnpm test:e2e` passes for the new spec.
**Depends on:** 5, 7
**Estimate:** 3 (M)
**Notes:** Satisfies FR-18 (acceptance), FR-20 (b), FR-26 (Playwright for part 2). Safety: `pnpm test:e2e` builds and serves Storybook itself on :6006 outside the sandbox; check 6006 is free first, never start `pnpm storybook`, record any pid started and stop only it by pid. The stories use in-memory data only; no read or write of `projects/` or any real app-data folder.
**Done:** [x]

### Task 11: Part 2 documentation (FR-25, Part 2 half)
**What:** Update the Body Text Styles text and the docs for the floor and for paragraphs with their own spacing.
**Files:** Modifies the Body Text Styles description (`BodySettingsModal.tsx` ~93-95), `frontend/components/help/help-content.ts` entries about line height, and the relevant `docs/features/` page found by reading (editor or settings page; if none covers paragraph spacing, add a short section to the nearest one); records in the task notes any `docs/user/handbook` page that names line height (the scribe stage reconciles; do not edit `docs/user/`).
**Done when:** the modal text no longer says the settings "apply to all editor body text" without qualification, states the 1.8 minimum and that a paragraph with its own spacing keeps it; the docs page states that an unset paragraph follows the project line height, an explicit leading may go below 1.8, and the legacy 1.5 reads as unset; help-content and modal copy tests are updated and pass; `pnpm lint` and `pnpm typecheck` from `frontend/` pass.
**Depends on:** 9, 10
**Estimate:** 2 (S)
**Notes:** Satisfies FR-25 (Part 2). Wording is a working copy, not owner-reviewed. No new user-visible controls.
**Handbook pages naming line height (for the scribe; not edited):** `docs/user/handbook/write/editor-appearance.md` (says Body Text Styles line height does not change rendering, rendered 1.5 vs stored 1.8, toolbar accepted 0.5; now stale).
**Done:** [x]

### Task 12: FR-2 experiment (web): freshness of the saved-types read and cache instances
**What:** Run FR-2 (a) and (b) on the web dev server with a throwaway saved-types directory and record the observed values.
**Files:** Appends to `experiments.md` (Part 1 section). Creates a harness script under `specs/features/writer-project-types-and-paragraph-leading/scripts/`. No source change.
**Done when:** `experiments.md` records, with the `lsof` output and the asserted throwaway paths: (a) one valid type file written by hand into the throwaway directory while the server runs, then `GET /api/project-types` and a project creation from that type's id, each without a restart, with what each returned; (b) whether the library's module-level `_cache` (`projectTypes.ts:85`) makes a second read stale (read before and after a second file is written), and whether the route and the project-creation path see the same cache instance, as observed values (for example by reading both after a file change); anything not run is recorded UNMEASURED with the reason. No cause is stated beyond what the runs discriminate. Processes started are recorded and stopped by pid.
**Depends on:** 1
**Estimate:** 3 (M)
**Notes:** Satisfies FR-2 (a), (b) (US-2). Safety: dev server outside the sandbox with `GETWRITE_PROJECTS_DIR` and `GETWRITE_SAVED_PROJECT_TYPES_DIR` set to throwaway folders under `$TMPDIR` or the scratchpad, asserted before the first request; never the repo's `projects/` or any real app-data folder. The saved-types variable does not exist in code yet, so the experiment uses the existing `GETWRITE_PROJECT_TYPES_DIR` / `GETWRITE_TEMPLATES_DIR` pointing at a throwaway copy of the type files and says so in the record; the FR-13 cache design (Task 15) stands on this record.
**Done:** [x]

### Task 13: FR-2 experiment (desktop/packaged): do the server's probes find the built-in types
**What:** Record FR-2 (c): whether `createProjectCore` finds the built-in types in the Electron development app and, if a packaged build can be made, in it, given the server's environment sets only `GETWRITE_TEMPLATES_DIR`.
**Files:** Appends to `experiments.md`. Creates or reuses a harness under `specs/features/writer-project-types-and-paragraph-leading/scripts/`, modelled on `specs/features/desktop-defects/scripts/`. No source change.
**Done when:** `experiments.md` records the `lsof` output, the asserted `app.getPath("userData")` and `app.getPath("logs")`, the working directory the app was launched from, and for the development app (and, if built, the unpacked `--dir` build with a throwaway `productName`, from the main checkout at the recorded commit, labelled "unpacked build launched from `/`" and the other directory, never "Finder-launched") whether a new project from a built-in type id was created (observed dialog text and the throwaway `project.json`). If the app or a packaged build cannot be run safely, the item is recorded UNMEASURED with the reason and no further attempt. Processes started are recorded and stopped by pid.
**Depends on:** 1
**Estimate:** 3 (M)
**Notes:** Satisfies FR-2 (c). Safety: needs the desktop app and possibly a build, OUTSIDE the sandbox in the main checkout, never a worktree. Throwaway `--user-data-dir`, throwaway workspace folder (seeded `workspace.json`), throwaway logs folder; first action asserts `userData` and `logs` are not under `~/Library/Application Support/getwrite-electron`, `~/Library/Application Support/GetWrite`, `~/Documents/GetWrite` or `~/Library/Logs/*`, and the run stops as "not run" if either is. If 7340 is held, not run. A packaged result covers that build only.
**Done:** [x]

### Task 14: Resolver, built-in side: one directory function and the merged list shape
**What:** Create the single project-type resolver with one built-in-directory function, validated entries carrying `source`, and the native-bundle exclusion intact.
**Files:** Modifies `frontend/src/lib/projectTypes.ts` (or creates the resolver module beside it; the single module for FR-3, name TBD by reading); extends `frontend/tests/unit/project-types.test.ts` and `native-project-types-backend-web-exclusion.test.ts` (stay green).
**Done when:** tests that fail first and pass after: the built-in directory resolves to `GETWRITE_PROJECT_TYPES_DIR` if set, else `GETWRITE_TEMPLATES_DIR`, else the existing probe order; the list returns entries `{ spec, filePath, source: "built-in" }` validated by `validateProjectType`, and an invalid built-in file is skipped as today; built-in entries may be cached in memory and `clearProjectTypeCache` still clears them; `native-project-types-backend-web-exclusion.test.ts` and the native bundle config (`next.config.mjs:203-208`) are unchanged and green. `experiments.md` gets one line citing the Task 13 record as the basis for the directory function.
**Depends on:** 12, 13
**Estimate:** 3 (M)
**Notes:** Satisfies FR-3 (resolver and built-in directory), FR-13 (built-in cache). The test over the source tree that no other `readdir` of a project-type directory remains is added in Task 16 (it fails until the readers move).
**Done:** [x]

### Task 15: Resolver, saved side: fail-closed store, status and unusable files, no saved cache
**What:** Make the resolver read `GETWRITE_SAVED_PROJECT_TYPES_DIR` on every call and report status and unusable files, failing closed when unset or when hosted auth is active.
**Files:** Modifies the Task 14 resolver; extends its test file (a fixtures directory under `$TMPDIR` created by the tests; no real folders).
**Done when:** tests that fail first and pass after: saved entries are listed with `source: "saved"`; unset or empty variable gives built-in only and status `not-configured`; `isHostedAuthActive()` true gives built-in only and status `not-configured`; an absent saved directory is status `ok` with no entries (ENOENT only); any other `readdir` error is status `unreadable` and not folded to `[]`; a saved file that is unparseable, invalid against `validateProjectType` or unreadable is listed in `unusable` with `fileName` and reason `unparseable` / `invalid` / `unreadable` and no file content or parser text; no fallback to `cwd`, the repository, the built-in directory or the projects directory is read (test asserts the resolver reads nothing when the variable is unset); a saved file written between two calls appears on the second call with no cache clearing (FR-13 acceptance at resolver level). The cache design used is recorded against the Task 12 record in `experiments.md`.
**Depends on:** 14
**Estimate:** 3 (M)
**Notes:** Satisfies FR-4 (reader), FR-5, FR-6 (server side), FR-13. The variable is read by the resolver and nothing else (the desktop main process sets it in Task 20). Narrow catches as `project-loader.ts` does.
**Done:** [x]

### Task 16: Move every reader to the resolver, and the GET response shape
**What:** Make the route, the manager page, `createProjectCore`, the DOCX import and the plain-text import read types only through the resolver, and extend the GET response with entries, `unusable` and saved-directory status.
**Files:** Modifies `frontend/app/api/project-types/route.ts` (~10-37), `frontend/app/project-types/page.tsx` (~22-62), `frontend/src/lib/project-crud-core.ts` (~381), `import-docx-project.ts` (~317-322), `import-plaintext-project.ts` (~224); extends `frontend/tests/unit/project-types-api.test.ts`, `project-types-route-locked-access.test.ts`, `sharing-gate-enumeration.test.ts` (the changed GET stays registered), and the import tests found by reading.
**Done when:** tests that fail first and pass after: a test over the source tree asserts no `readdir` of a project-type directory exists outside the resolver; GET returns the merged list with `source`, `unusable` and status; a saved type is accepted by `createProjectCore` and by both imports; an unknown id still raises `UnknownProjectTypeError`; the locked-access behaviour of the route is unchanged; the existing tests pass or are updated with the reason stated.
**Depends on:** 15
**Estimate:** 3 (M)
**Notes:** Satisfies FR-3 (readers), FR-6 (response). Write routes are Task 19.
**Done:** [x]

### Task 17: Client response schema, transport and failure notice
**What:** Replace the bare array schema with a validated list-response schema and surface a one-line notice when files were unusable or the saved directory is not `ok`.
**Files:** Modifies `frontend/src/lib/api/schemas.ts`, `frontend/src/lib/api/project-types.ts` (~50) and the transport tests; extends `frontend/tests/unit/project-types-api.test.ts` and `editor-config-transport-validation.test.ts`-style transport tests found by reading.
**Done when:** tests that fail first and pass after: a response with entries, `unusable` and status parses; a malformed response is reported through `reportTransportValidationFailure` and does not render as an empty list; the transport returns the notice data to callers; the native build's static registry still satisfies the same client type (native exclusion tests green).
**Depends on:** 16
**Estimate:** 2 (S)
**Notes:** Satisfies FR-6 (client side). The notice UI is added with the manager (Task 22) and the dialogs (Tasks 24, 25).
**Done:** [x]

### Task 18: Saved-types write core: clash rules, atomic and exclusive write, delete
**What:** Create the server-side write core for create, replace and delete of saved types, with clash detection, exclusive creation, atomic replacement and built-in protection.
**Files:** Creates a core module beside the resolver (name TBD by reading `editor-config-core.ts` style) and a test file; reuses or mirrors `normalizeSubtypeLabel` for names; models the atomic write on `electron/src/projects-dir.ts` `writeFileViaTemporary` (a local helper; no import across packages).
**Done when:** tests (throwaway directories under `$TMPDIR`) that fail first and pass after: create writes `<id>.json` and creates the directory on first save; a second create of the same id fails (exclusive creation; two concurrent creates, only one succeeds); `id-clash` and `name-clash` with `conflictsWith` built-in and saved are returned for an equal id, and for a name that matches after trim and case-folding ("  novel " clashes with "Novel"), and a replace does not clash with itself; replace keeps the previous file when the write is made to fail (injected failure) and leaves no temporary file; a read-only directory returns an error and not success; delete removes only that file; delete of a built-in id is refused with reason `built-in`; saving unavailable (variable unset or hosted auth) returns `saving-unavailable` for save and delete; a checksum of every built-in file is identical before and after save, copy-save, rename and delete; the validation gate is the same `validateProjectType` the resolver uses (a file the core accepts, the resolver lists).
**Depends on:** 15
**Estimate:** 3 (M)
**Notes:** Satisfies FR-5 (write refusals), FR-8, FR-9, FR-10 (server), FR-26. Safety: tests write only to throwaway directories; the built-in checksum test only reads the built-in directory.
**Done:** [x]

### Task 19: Write routes, id validation, body cap and sharing-gate registration
**What:** Add `POST /api/project-types`, `PUT /api/project-types/[id]` and `DELETE /api/project-types/[id]` over the Task 18 core, with all client input validated.
**Files:** Modifies `frontend/app/api/project-types/route.ts`; creates `frontend/app/api/project-types/[id]/route.ts` and route tests; extends `frontend/tests/unit/sharing-gate-enumeration.test.ts` and `sharing-gate-proxy.test.ts` (if it enumerates routes).
**Done when:** tests that fail first and pass after: `POST` with `../x`, `a/b`, `%2e%2e`, an empty id, an over-long id, a body with an extra key, an oversize body (over 256 KiB, refused before parsing) and (on `PUT`) a path id that differs from the body id each return 400 and write no file; no route reads a path, file name, directory or `source` from the client; the resolved path's parent is asserted equal to the saved directory; clashes return 409 `{ error, reason, conflictsWith }`; `DELETE` of a built-in returns 403 with reason `built-in`; `saving-unavailable` is returned with its message when unconfigured; the handlers are not wrapped by `withStorageContext` and a comment says why; the three write routes and the changed GET are registered in the gate-enumeration test(s) with a gate decision, and a route added without one fails the test; no new paired-device limit is added (the limits store has no diff).
**Depends on:** 18
**Estimate:** 3 (M)
**Notes:** Satisfies FR-7, FR-8, FR-9, FR-10 (server), FR-26. Per OQ-2, once the pairing gate passes a paired device may save and delete saved types.
**Done:** [x]

### Task 20: Desktop environment: set `GETWRITE_SAVED_PROJECT_TYPES_DIR` for the server and the DOCX worker
**What:** Have the Electron main process set the variable to `path.join(app.getPath("userData"), "project-types")` in the server environment and pass it into the DOCX worker's fork options.
**Files:** Modifies `electron/src/main.ts` (~203-219, beside `GETWRITE_SHARING_DIR`) and `electron/src/docx-import/fork-options.ts` (~29-35: a new input and the variable in `env`); extends the existing fork-options test under `electron/tests/`.
**Done when:** tests that fail first and pass after: `fork-options` output carries `GETWRITE_SAVED_PROJECT_TYPES_DIR` equal to the directory given, still preserves inherited variables and the existing `GETWRITE_PROJECT_TYPES_DIR` and `cwd`; `main.ts` uses `app.getPath("userData")` directly (not `projectsDirEnvironment().userDataDir`, which is `""` unpackaged; a grep result is recorded); `workspace.json` is neither read nor written for this (`git diff` shows no change to `projects-dir.ts`); `pnpm typecheck`, `pnpm test` and `pnpm build:worker` from `electron/` exit 0. No test imports `electron/src/main.ts`.
**Depends on:** 15
**Estimate:** 2 (S)
**Notes:** Satisfies FR-4, FR-26 (`fork-options`). Does not run the app; a measurement of the real app is Task 28's optional check only if the safety assertion holds. Safety: no app run in this task.
**Done:** [x]

### Task 21: Draft service and transport: save, save as copy, delete
**What:** Add the client transport for the three write routes and the draft-service operations that use them, with `hasChanges`, `fileName` and refusals handled.
**Files:** Modifies `frontend/src/lib/api/project-types.ts`, `frontend/src/lib/api/schemas.ts` (write response and refusal schemas), `frontend/components/project-types/ProjectTypeDraftService.ts` (~120-140 `validateDraft` stays the gate); extends `frontend/tests/unit/project-type-draft-service.test.ts` and `project-types-api.test.ts`.
**Done when:** tests that fail first and pass after: save of a draft that passes `validateDraft` posts once and on success sets `hasChanges` false and `fileName` to `<id>.json`; a draft failing `validateDraft` sends nothing and lists the errors; editing a built-in and saving posts a copy whose id and name differ, leaves the built-in entry unchanged and still listed; a saved type's id cannot change after first save (rename is a `PUT` that changes `name`); a 409, 400, 403 and `saving-unavailable` response is returned to the caller as a refusal with its message and the draft is unchanged; a response that fails schema validation is reported through `reportTransportValidationFailure`, never as success; delete refuses built-ins client-side as well.
**Depends on:** 17, 19
**Estimate:** 3 (M)
**Notes:** Satisfies FR-8 (client), FR-10, FR-11 (copy flow), FR-12 (service). The native build keeps its static registry: write transport calls are not bundled for native (exclusion tests green).
**Done:** [x]

### Task 22: Project Type Manager UI: Save, Save as copy, Delete, labels and alerts
**What:** Add the Save, Save as copy and Delete controls, the "Built-in" / "Saved" text labels, the read-only id for a saved type, the delete confirmation and the `role="alert"` refusal and notice regions to the manager.
**Files:** Modifies `frontend/components/project-types/ProjectTypeListPane.tsx`, `ProjectTypesManagerPage.tsx`, `ProjectTypeEditorForm.tsx`, `ShellProjectTypeLoader.tsx` as needed (open each file and its stories first), and their stories; extends the existing component tests and a11y tests under `frontend/tests/`.
**Done when:** tests that fail first and pass after: each of Save and Delete is a native button with an accessible name, keyboard-reachable with a visible focus state; Save is disabled and says so while a request is in flight; on success the item shows "Saved", the list refreshes from the server and a polite status message says the type was saved; a refusal (409, 403, `saving-unavailable`, a failed write) shows next to the id or name field that caused it with `role="alert"` and the draft stays as the writer left it; a built-in shows the label "Built-in", Save reads "Save as copy" and no Delete control; the id field is read-only for a saved type and editable for a draft; the delete confirmation says that projects already made from the type are unaffected and the type can no longer be chosen; the unusable-files / status notice is shown when non-empty; no red is used; stories cover built-in, saved, draft, refusal, saving-unavailable and notice states; any new context requirement has a Storybook decorator.
**Depends on:** 21
**Estimate:** 3 (M)
**Notes:** Satisfies FR-6 (notice), FR-10 (UI), FR-11, FR-12 (US-1, US-3). Shares `ProjectTypeEditorForm.tsx` with Task 9; do not run in parallel with it.
**Done:** [x]

### Task 23: Unsaved-changes prompt on every exit path
**What:** Offer Save, Discard and Keep editing when any item has `hasChanges` and the writer selects another item, closes the page or modal, goes back, or closes the window or tab.
**Files:** Modifies `frontend/components/project-types/ProjectTypesManagerPage.tsx` (~87-97), `frontend/components/ShellModalCoordinator.tsx` (~398), and creates a prompt component using the Radix dialog already in the dependency tree (open an existing confirm dialog and its stories first, `confirmDialog.test.tsx`); extends tests and stories.
**Done when:** one test per exit path (select another item, page Close, modal dismissal, browser back, window/tab close via `beforeunload`) fails first and passes: the prompt appears when any item has `hasChanges` and not otherwise; Esc means Keep editing; focus moves into the prompt and returns to the control that opened it; Save from the prompt that is refused by 409 or `saving-unavailable` keeps the writer in the manager with the draft intact; Discard drops the edits; an a11y test covers the prompt; a story and any needed decorator exist.
**Depends on:** 22
**Estimate:** 3 (M)
**Notes:** Satisfies FR-17 (US-3), FR-26.
**Done:** [x]

### Task 24: New-project dialog and manager loader read the resolver list
**What:** Make `CreateProjectModal` and `ShellProjectTypeLoader` list built-in and saved types from the resolver response, re-read on each open, mark saved types and show the notice.
**Files:** Modifies `frontend/components/CreateProjectModal.tsx` (~70-100) and `frontend/components/ShellProjectTypeLoader.tsx` (~46-66, `fileName` at ~55-58 stops being invented); extends `frontend/e2e/create-project-modal.e2e.spec.ts`, the component tests and stories.
**Done when:** tests that fail first and pass after: the loader uses the response's `source` and no longer builds `${id}.json` for built-ins; a type saved in the manager appears the next time the dialog opens (re-read on each open, no restart); saved types are marked "Saved" in text; the notice shows when `unusable` is non-empty or status is not `ok`; a load failure shows the error and no stale list; stories and any decorator exist; `create-project-modal.e2e.spec.ts` passes with the updated stories.
**Depends on:** 17
**Estimate:** 3 (M)
**Notes:** Satisfies FR-14, FR-6 (notice). Safety: the e2e run is Storybook-only (in-memory data), run per Task 28's rules.
**Done:** [x]

### Task 25: Desktop import dialog loads the list and the worker refuses a deleted id
**What:** Replace the hard-coded type list in `ImportDocxDialog` with the transport list and keep the worker's refusal of an id that disappeared.
**Files:** Modifies `frontend/components/.../ImportDocxDialog.tsx` (~22-29, ~328-338; path found by reading), and extends its test and stories; extends the DOCX import test around `import-docx-project.ts:177-183`.
**Done when:** tests that fail first and pass after: the dialog loads the list through the transport on open, defaults to `blank`, offers saved types, and on a load failure shows the error and offers no list (no fallback to the old constant); the old six-entry constant no longer exists (grep recorded); an import of an id deleted between choosing and importing is refused before any write with `UnknownProjectTypeError`; stories cover loaded, loading and error states, with any decorator needed.
**Depends on:** 17, 20
**Estimate:** 3 (M)
**Notes:** Satisfies FR-15, FR-26 (import dialog). Does not run the app.
**Done:** [x]

### Task 26: CLI: resolver, `--project-type`, `project types`, unset-variable notice
**What:** Make the CLI resolve types through the resolver, add `project create --project-type <id>` (exclusive with `--spec`) and `project types`, and print the unset-variable notice.
**Files:** Modifies `cli/src/commands/project.ts` (~51-56, ~132-135); extends `cli/tests/project.test.ts` and `cli/tests/templates-registered-commands.test.ts`-style registration tests found by reading.
**Done when:** tests (throwaway `GETWRITE_PROJECTS_DIR` and `GETWRITE_SAVED_PROJECT_TYPES_DIR`) that fail first and pass after: `project import-docx --project-type <saved-id>` works with no other change; `project create --project-type <id>` creates a project from a built-in and from a saved id; `--project-type` together with `--spec` is refused; an unknown id is refused before any write with a message listing the ids it could see; `project types` lists the merged list with each `source`; with the variable unset the list output and the unknown-id refusal both say saved types were not included; `--spec <path>` behaves as before; the CLI reads no path derived from the desktop app's userData and adds no `--saved-types-dir` flag (OQ-1); the CLI bundle (esbuild) builds and the full CLI suite passes.
**Depends on:** 16
**Estimate:** 3 (M)
**Notes:** Satisfies FR-16, FR-26 (CLI). Safety: CLI tests run only against throwaway folders; never the repo's `projects/` or a real app-data folder; the encryption-guard tests are unchanged.
**Done:** [x]

### Task 27: Part 1 documentation (FR-25, Part 1 half)
**What:** Document the saved store, the variable, the resolver and the new CLI options, and correct the help text that says types can be created and deleted.
**Files:** Modifies `docs/features/project-types.md`, `docs/features/cli.md`, `cli/CLAUDE.md` (command list), `frontend/components/help/help-content.ts`, `electron/CLAUDE.md` and `frontend/CLAUDE.md` where they list environment variables or the Code Map (only if they do); a developer note that `pnpm start` without `GETWRITE_SAVED_PROJECT_TYPES_DIR` cannot save a type and says so. Records in the task notes any `docs/user/handbook` page that names project types (do not edit `docs/user/`; the scribe stage reconciles).
**Done when:** `docs/features/project-types.md` states the store location on desktop (`<userData>/project-types`, app-wide, survives moving the workspace and updates), the variable, fail-closed behaviour, the clash rule (id, name after trim and case-folding), built-ins never change, "Save as copy", and the unsaved prompt; `docs/features/cli.md` and `cli/CLAUDE.md` list `project create --project-type`, `project types` and the consequence that the CLI list can differ from the dialog's until the variable is exported; the help text is true of what the app now does; the CLAUDE.md glossary is updated only if a new term needs it; `pnpm lint` and `pnpm typecheck` from `frontend/` pass and help-content tests are updated and pass.
**Depends on:** 22, 23, 24, 25, 26
**Estimate:** 2 (S)
**Notes:** Satisfies FR-25 (Part 1). Wording is a working copy.
**Done:** [ ]

### Task 28: Final suites, Storybook stories and decorators
**What:** Run every final suite on the branch, confirm every new or changed component has stories (and a decorator for any new context requirement), and record results against the Task 1 baseline.
**Files:** Appends a "Final suites" section to `experiments.md`. Modifies only stories, decorators or tests needed to make a genuine gap pass (each such change recorded).
**Done when:** `experiments.md` records, as observed values with command and date, compared with the Task 1 baseline: from `frontend/`, `pnpm typecheck` (exit code), `pnpm lint` (counts), `pnpm test:ci` (counts) and `pnpm test:e2e` (counts and names of any failures; 6006 confirmed free first; Storybook built and served by the command itself); from the repo root, `pnpm knip` (no new findings against the baseline; any new unused export from this feature removed); from `electron/`, `pnpm typecheck`, `pnpm test`, `pnpm build:worker`; from `cli/`, the CLI suite; `lsof` before and after (6006, 3000, 7340 not held by anything this task started); a list of every new or changed component (the Part 2 toolbar control and Body Text Styles / manager field message; the Part 1 manager controls, labels, prompt, dialogs) each with its story file, and any new context requirement with its decorator, or the statement that none was added; `git status --short` showing only intended changes. A suite that cannot run is recorded as not run with the reason, not as passing.
**Depends on:** 11, 27
**Estimate:** 3 (M)
**Notes:** Satisfies FR-26 (final suites include `pnpm test:e2e`; decorator for any new context). Safety: runs outside the sandbox in the main checkout; no desktop app is started and no `pnpm storybook` is started first; throwaway folders only, never `projects/` or any real app-data folder (`~/Library/Application Support/getwrite-electron`, `~/Library/Application Support/GetWrite`, `~/Documents/GetWrite`, `~/Library/Logs/*`). If an optional real-app check is made, it follows the Task 13 path assertion and throwaway `--user-data-dir`, or is recorded UNMEASURED. If only one part ships, its own final suites are the same list; the part not shipped is excluded from the stories audit.
**Done:** [ ]

## Summary
- Total tasks: 28
- Total estimated effort: 78 story points (S = 2 or less, M = 3; no L tasks)
- Critical path: 1 → 12 → 14 → 15 → 18 → 19 → 21 → 22 → 23 → 27 → 28 (Part 2's longest chain, 1 → 2 → 5 → 10 → 11 → 28 and 1 → 3 → 4 → 6 → 7 → 10 → 11 → 28, is shorter; Part 2 is independently shippable at Task 11 and Part 1 at Task 27)
- Risks: Task 2 (the FR-1 result decides whether Task 5 is a fix or a regression test and may show the stored value is not what the spec expects; it changes labels, not requirements); Tasks 12 and 13 (FR-2 may leave items UNMEASURED, notably packaged behaviour; the cache design in Task 15 stands on Task 12, and Task 14's directory function on Task 13); Tasks 2, 10, 12, 13 and 28 (need a dev server, the app or Playwright outside the sandbox in the main checkout with throwaway folders; port 7340 and 6006 must be free; a protected-path report means not run); Task 5 and Task 6 (every reader of stored `paragraphLeading` must apply the rule; a missed reader is only found by the Task 6 search); Task 8 (the native `updateEditorConfig` path may not share the core, which would surface a gap rather than a pass); Tasks 9 and 22 (both edit `ProjectTypeEditorForm.tsx`; serialise); Task 19 (the sharing gate-enumeration test must register the new routes or the suite fails); Task 22 and Task 23 (new components may need a Storybook decorator or `pnpm test:e2e` fails); Task 26 (the CLI list differing from the dialog's is a stated consequence of OQ-1, not a defect).
