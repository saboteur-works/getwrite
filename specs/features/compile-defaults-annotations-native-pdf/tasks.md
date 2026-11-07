# Tasks: Compile defaults, annotations, native PDF (Feature 101)

Source spec: `specs/features/compile-defaults-annotations-native-pdf.md` (FR-1..FR-35, US-1..US-3; all 16 open questions resolved at Gate 3, 2026-11-04, and folded into the FRs). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 101. Branch: `feat/compile-defaults-annotations-native-pdf`; one PR for all three parts (F101-1).

Shape of the work: three largely independent dependency chains, joined only where tasks edit the same files.
- Task 1: shared prerequisite (PDF text tool, experiments file).
- Part 1, compile and export defaults (Tasks 2-8): 2 -> 3 -> 4 -> 5 -> 6 -> 7; Task 8 after 5.
- Part 2, annotations (Tasks 9-23): starts with the FR-8 compile test (Task 9) before any other Part 2 change (FR-7). Branches after Task 12: copy/template (13), routes (14), revision restore (19), search (22-23), and the editor chain (15 -> 16 -> 17 -> 18 -> 20 -> 21).
- Part 3, Android PDF (Tasks 24-28): reproduction first (24), fix (25), verification (26), Start Page error messages (27-28).
- Task 29: docs. Task 30: acceptance suites.

Cross-part orderings (same-file edits, must not run concurrently): Task 11 after Task 2 (`schemas.ts`, `types.ts`, `lib/api/schemas.ts`); Task 14 after Task 4 (`next.config.mjs` aliases); Task 25 after Task 10 (compile files); Task 27 after Task 8 (`StartPage.tsx`); Task 21 after Task 18 (editor component files); Task 1 before every task that appends to `experiments.md`.

Measurements go in `specs/features/compile-defaults-annotations-native-pdf/experiments.md`, created by Task 1 with one section per part (Part 1, Part 2, Part 3) so concurrent tasks append to different sections; style of `specs/features/hidden-and-lost-work/experiments.md` (environment record, command or test, observed value, what was not measured). A measurement states what was observed; a cause is written only where an experiment discriminated it.

**Builds:** `next build` and `pnpm build:native` only work in the main checkout, not in worktrees. No task below needs a static-export build except Task 30 (`pnpm build:native` where it can be run), which must run in the main checkout outside the sandbox. `pnpm test:e2e` (Task 30) builds Storybook and also runs outside the sandbox in the main checkout, with `pnpm storybook` stopped first.

**Not for the orchestrator:** FR-30 (device font check on Android: `pnpm build:native` from the main checkout, install, airplane mode, compile a PDF, copy it off the device, record embedded font names and whether the `font-fallback` notice showed) is recorded verification the pipeline lead performs with the owner, not a task. If it is not run it is listed under "Not verified" in the feature's notes, and no task, doc or PR text may claim the fonts embed on Android.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tests first (`docs/standards/testing.md`): add to an existing test file before creating one; code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions). Every catch added or touched follows `docs/standards/failure-visibility.md` (narrow catch; "failed" never returned as "empty"). Every new route or core follows `docs/standards/security.md` and `docs/standards/storage-context.md` (FR-31, FR-32). Nothing stored, body or error text is logged.
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run typecheck and lint on touched files before finishing. A suite not run is reported as not run, never as passing.
- Implementors do not commit and do not push; the orchestrator commits. Independent tasks may run concurrently in separate worktrees; tasks listed as dependent must not.
- Write no cause that no experiment separated.

### Task 1: PDF text tool and experiments file
**What:** Add `pdfjs-dist` as a frontend devDependency, write a test helper that returns the ordered per-page extracted text and a validity check (`%PDF-`, `%%EOF`, parses) for a PDF buffer, and create the experiments file.
**Files:** `frontend/package.json`, `pnpm-lock.yaml`, a helper under `frontend/tests/` (for example `frontend/tests/helpers/pdf-text.ts`) with its test added to an existing compile test file or a new `pdf-text-helper.test.ts` if none fits, `specs/features/compile-defaults-annotations-native-pdf/experiments.md`
**Done when:** The helper extracts the text of a PDF produced by `compilePdfCore` under the frontend node Vitest project and a control PDF with one changed letter extracts differently; if `pdfjs-dist` cannot run in the node test project, that is recorded in `experiments.md` as observed and the FR-8 fallback (compare react-pdf's rendered element tree; real extraction only for FR-26) is implemented and named; `experiments.md` exists with Part 1, Part 2 and Part 3 headings and the environment record; `pnpm knip` does not flag the dependency or helper as unused.
**Depends on:** none
**Estimate:** 3
**Notes:** Owner approved the dependency under `docs/standards/package-selection.md` (OQ-6, Gate 3). Satisfies the tooling half of FR-8, FR-26, FR-35. `pnpm add` needs network and writes `pnpm-lock.yaml`; this is the only task that edits `package.json`.
**Done:** [ ]

### Task 2: Saved-defaults config keys and Start Page entry shape
**What:** Declare `compileDefaults` and `exportDefaults` (each exactly `{ excludedResourceIds: string[] }`) in `ProjectConfig`, the Zod schema and the client schema, with a round-trip test, and record whether the Start Page project list entry carries `config`.
**Files:** `frontend/src/lib/models/types.ts`, `frontend/src/lib/models/schemas.ts`, `frontend/lib/api/schemas.ts`, existing schema and project-list tests under `frontend/tests/`, `specs/features/compile-defaults-annotations-native-pdf/experiments.md` (Part 1 section)
**Done when:** A test fails first, then passes, showing a project with both keys set survives the client list parse with both present and a project with neither parses with both absent; the shape rejects any extra field; the task reads `listProjectsCore` entries and `ProjectListEntrySchema` and records in `experiments.md` (as a reading) whether a list entry carries `config`.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-1 and the Start Page half of OQ-5 (the finding feeds Task 8). `lib/api/schemas.ts` strips undeclared keys, so omitting it there silently drops the keys.
**Done:** [ ]

### Task 3: Defaults setter cores and routes
**What:** Add a setter core for each key (read-modify-write under `withMetaLock` via `updateProjectJson`, touching only its own key) and its `PUT` route.
**Files:** new `frontend/src/lib/models/compile-defaults-core.ts` and `export-defaults-core.ts` (or one shared module), `frontend/app/api/project/compile-defaults/route.ts`, `frontend/app/api/project/export-defaults/route.ts` (or one route for both), tests added beside the `goal-filter` core and route tests
**Done when:** Tests show: a non-array, non-string id, non-UUID id, and more than 5000 ids are each refused with a message before any lock or write and nothing is stored (never truncated); duplicates are collapsed; clearing deletes the key (never `null` or `{}`); setting `compileDefaults` leaves `exportDefaults`, `goalFilter` and every other `config` key byte-equal; the route maps an invalid project id or body to 400 and a locked project to the existing locked response; locked-access errors are rethrown unchanged.
**Depends on:** 2
**Estimate:** 5
**Notes:** Model on `goal-filter-core.ts` (`setGoalFilterCore`) and `PUT /api/project/goal-filter`. Satisfies FR-2, FR-32. Project root comes from a validated `projectId`; no path argument.
**Done:** [ ]

### Task 4: Defaults transport clients and native backends
**What:** Add the `lib/api` clients on `createTransport`, the native backends with web stubs and the `next.config.mjs` aliases for the two setters.
**Files:** new `frontend/lib/api/compile-defaults.ts` and `export-defaults.ts` (or one module), `frontend/store/transport/native-compile-defaults-backend.ts`, `native-export-defaults-backend.ts` and `.web-stub.ts` pairs, `frontend/next.config.mjs`, `frontend/tests/native-compile-backend-web-exclusion.test.ts` (or its equivalent), a parity test beside the goal-filter transport tests
**Done when:** A test shows the same invalid input is refused with the same message through the HTTP implementation and the native backend; the web-exclusion test shows the new native backends are absent from the web build resolution; `pnpm typecheck` passes.
**Depends on:** 3
**Estimate:** 5
**Notes:** Exactly as `goal-filter` does (`native-goal-filter-backend.ts` + `.web-stub.ts`, alias near `next.config.mjs` ~273-277). Satisfies FR-3. This task owns the first `next.config.mjs` edit; Task 14 follows it. No static-export build is run here.
**Done:** [ ]

### Task 5: Saved-defaults read state and initial-selection logic
**What:** Add a pure function that resolves the initial selection from the resource list and saved excluded ids (dropping ids of missing resources without writing back) and a hook that exposes the saved-defaults read state (loading, ok, failed with Retry, locked rethrown).
**Files:** new module under `frontend/lib/` or `frontend/src/lib/` (for example `compile-defaults-selection.ts`) and a hook beside the dialogs, tests added to an existing compile-dialog test file or new `compile-defaults-selection.test.ts`
**Done when:** Tests show: with the keys absent the selection is every resource (identical to today's); excluded ids select everything else; ids of nonexistent resources are dropped silently and no setter is called by the read; a read error yields state `failed` with all resources selected and a `retry` that re-reads; a locked-access error is rethrown to the existing locked path rather than becoming `failed`; no code path names a resource kind or type.
**Depends on:** 4
**Estimate:** 3
**Notes:** Satisfies FR-4 (selection logic and no-write) and the logic half of FR-5 and FR-6. Shared by Tasks 6, 7 and 8.
**Done:** [ ]

### Task 6: Compile dialog saved-defaults behaviour and UI
**What:** Make `CompilePreviewModal` start from saved defaults, show which resources are left out by the project default, the count in effect, a failure notice with Retry, and a save-as-default and clear control, with the entity-scoped mode unchanged.
**Files:** `frontend/components/` `CompilePreviewModal.tsx`, a small shared presentational component for the default indicators and save control, its stories, dialog and a11y tests under `frontend/tests/`
**Done when:** Tests show: initial selection and the request body with keys absent equal today's; a per-run change to selection or options makes no setter call and writes nothing; saving writes the current exclusions, a failing save shows the refusal or error message and leaves the shown default unchanged and is never reported as saved; clearing removes the default; a failed read shows the notice with Retry, opens all selected, says the saved defaults are not applied, leaves compile allowed and "Save as default" disabled; `entityMode` applies no saved exclusions and renders none of the saved-defaults UI (`CompilePreviewModal.tsx:142-143, 227-228`); indicators do not rely on colour alone and use no red; the controls are keyboard operable with accessible names and focus returns to the opener of a confirmation; an a11y test passes; stories exist for default, failed-read and entity modes.
**Depends on:** 5
**Estimate:** 5
**Notes:** Satisfies FR-4, FR-5, FR-6 (entity half), FR-31. Read the component's source and stories before using any prop (project rule). Copy is working copy. A new context requirement on a component needs a Storybook decorator (e2e is run in Task 30).
**Done:** [ ]

### Task 7: Export dialog saved-defaults behaviour and UI
**What:** Apply the same saved-defaults behaviour to `ExportPreviewModal`.
**Files:** `frontend/components/` `ExportPreviewModal.tsx` (mounted in `ShellModalCoordinator.tsx`), its stories and tests
**Done when:** The task first reads `ExportPreviewModal.tsx` and its stories and records its selection and option state; then tests, mirroring Task 6's, show: initial selection from `exportDefaults` with absent keys identical to today's, no setter call on a per-run change, save and clear with a visible success or failure result, failed read notice with Retry and all selected, accessibility checks, and a story per state.
**Depends on:** 6
**Estimate:** 3
**Notes:** Reuses the shared indicator component from Task 6, hence the ordering. Satisfies FR-4, FR-5, FR-6 (generic across resource kinds). The reading of `ExportPreviewModal` is folded in here.
**Done:** [ ]

### Task 8: Start Page compile applies saved defaults when available
**What:** Make the Start Page compile path apply a project's `compileDefaults` if its list entry carries `config`; otherwise add no fetch and record the gap.
**Files:** `frontend/components/` `StartPage.tsx`, its tests, `specs/features/compile-defaults-annotations-native-pdf/experiments.md` (Part 1 section)
**Done when:** Using Task 2's recorded finding: if list entries carry `config`, a test shows the Start Page compile excludes the saved ids and drops missing ones silently; if they do not, a test shows output is unchanged from today, no per-project fetch is added, and the gap is written to `experiments.md` and flagged for the feature's notes.
**Depends on:** 2, 5
**Estimate:** 2
**Notes:** Satisfies FR-6 (Start Page half, OQ-5). `StartPage.tsx` is also edited by Task 27, which depends on this task.
**Done:** [ ]

### Task 9: FR-8 compile-output test with annotation marks (first Part 2 task)
**What:** Write and run the test that compiles annotated and unannotated documents through TXT, Markdown, PDF and DOCX paths and compares them, with no production change.
**Files:** existing compile and export test files under `frontend/tests/` (add cases) or a new `compile-annotation-marks.test.ts`, `specs/features/compile-defaults-annotations-native-pdf/experiments.md` (Part 2 section)
**Done when:** For cases (a) plain annotation on a word, (b) edge partway inside a bold run, (c) two overlapping annotations, (d) leading or trailing whitespace and a paragraph-edge end, the test compares: TXT and Markdown byte-identical across `compileTextCore`, `compileMarkdownCore`, `exportTextCore`, `exportMarkdownCore`; PDF by ordered per-page extracted text (Task 1 helper); DOCX by the `<w:body>` content of `word/document.xml` read with `jszip`; `collectMarkdownWarnings` returns the same list. A control document with one changed letter is shown to fail each comparison first. The first run, pass or fail per case, is recorded in `experiments.md` as observed.
**Depends on:** 1
**Estimate:** 5
**Notes:** Satisfies FR-7 and FR-8. This test gates the build; it is written before any other Part 2 change. Documents are built as JSON; the editor mark need not exist yet. If any case fails, product FR-89 stays unmet and Task 10 fixes it.
**Done:** [ ]

### Task 10: FR-8 fix, only if Task 9 shows a difference
**What:** If any Task 9 case differs, make the smallest serializer change (for example registering the mark with the Markdown manager so it renders content unchanged) so every case passes; otherwise close with no code change.
**Files:** compile and export serializer files as the failing case indicates (`compile-core.ts`, `export-core.ts`, Markdown serialization), existing tests
**Done when:** Every Task 9 case passes and the control comparisons still fail on a changed letter; or, if all passed at Task 9, `experiments.md` states "no serializer change needed" with the Task 9 evidence and this task is ticked with no diff.
**Depends on:** 9
**Estimate:** 3
**Notes:** Satisfies FR-8 (fix chosen only after the failing case exists). Ordered before Task 25 because both may edit compile files.
**Done:** [ ]

### Task 11: Annotation sidecar type, schemas and boundary validators
**What:** Add the `annotations` array type to the sidecar types and schemas and pure boundary validators for body, quote, id, count and unknown keys.
**Files:** `frontend/src/lib/models/types.ts`, `frontend/src/lib/models/schemas.ts`, `frontend/lib/api/schemas.ts` if sidecars are parsed there, a new `annotation-validation.ts`, existing schema tests
**Done when:** Tests show: an annotation is `{ id, body, quote, createdAt, updatedAt }` with no `target` field; body is 1 to 5000 characters, quote at most 500, at most 500 annotations per resource, each over-limit refused with a message naming the limit and never truncated; an unknown key is refused; a colliding id is refused; `TipTapNodeSchema` accepts a document with `annotation` marks and the task pins that; an `annotations` key is not among the five client-writable keys.
**Depends on:** 2, 9
**Estimate:** 3
**Notes:** Satisfies FR-9 (schema acceptance), FR-10 (shape), FR-11 (validation). Ordered after Task 2 because both edit `schemas.ts`, `types.ts`, `lib/api/schemas.ts`; after Task 9 per FR-7.
**Done:** [ ]

### Task 12: Annotation core (add, update, delete)
**What:** Add the annotation core functions that write only through `mutateSidecar`, refuse non-text resources and validate before any lock or write.
**Files:** new `frontend/src/lib/models/annotations-core.ts`, tests added beside the sidecar stale-save tests
**Done when:** Tests show: add, update and delete go through `mutateSidecar` (read inside the per-file lock); a whole-resource `updateSidecarCore` carrying a different or missing `annotations` key leaves the stored array unchanged; a concurrent annotation write and a sidecar field save lose neither; an annotation write for an image or audio resource is refused; validation failures carry a message and no lock or write happens; the resource id is a validated parameter, never a path; no revision is created and the text, word count and `content.txt` are untouched by add, edit or delete.
**Depends on:** 11
**Estimate:** 5
**Notes:** Satisfies FR-10, FR-11, FR-15 (core half), FR-23 (core refusal), FR-32. Does not enqueue an index task; Task 22 adds that.
**Done:** [ ]

### Task 13: Annotations travel with copy, duplicate, trash, encryption and lock
**What:** Copy annotations with new ids (remapped in sidecar and document marks) on resource copy and duplicate, keep them out of templates, and test trash, encryption and lock behaviour.
**Files:** `frontend/src/lib/models/resource-crud-core.ts` (`copyResourceCore` ~316-317), `resource-templates.ts` (`duplicateResource` ~473, `saveResourceTemplateFromResource` ~984-1052), a pure id-remap helper (for example `annotation-remap.ts`), tests added to existing copy, template, trash and encryption test files
**Done when:** Tests show: copying and duplicating a resource gives every annotation a new id, remapped in both the sidecar array and the document marks, bodies and quotes copied; ids are never shared between resources; a template saved from a resource carries no annotations or marks; a trashed and restored resource keeps its annotations; an encrypted project stores bodies encrypted as the sidecar is; a locked project refuses annotation reads and writes. Any that does not hold is recorded in `experiments.md` as a gap, not claimed.
**Depends on:** 12
**Estimate:** 5
**Notes:** Satisfies FR-21 and the copy half of OQ-14. The remap helper is reused by Task 21 for paste.
**Done:** [ ]

### Task 14: Annotation routes, client and native backend
**What:** Add the annotation HTTP route family calling the core, a `lib/api/annotations.ts` client on `createTransport`, the native backend with web stub and the `next.config.mjs` alias.
**Files:** `frontend/app/api/` annotation routes, new `frontend/lib/api/annotations.ts`, `frontend/store/transport/native-annotations-backend.ts` and `.web-stub.ts`, `frontend/next.config.mjs`, web-exclusion and parity tests
**Done when:** Tests show: invalid project or resource id and invalid body map to 400 with a message; a locked project follows the existing locked response; the same invalid input is refused with the same message on the HTTP route and the native backend; the web build excludes the native backend.
**Depends on:** 12, 4
**Estimate:** 5
**Notes:** Satisfies FR-22, FR-11 (400 mapping), FR-32. Ordered after Task 4 because both edit `next.config.mjs`. Exactly as `goal-filter` and `project-spelling` do. No static-export build here.
**Done:** [ ]

### Task 15: `annotation` mark in the editor
**What:** Add the id-only, overlapping, non-inclusive `annotation` TipTap mark that adds no characters and is inert when it has no body.
**Files:** a new `frontend/` TipTap extension (for example `AnnotationMarkExtension.ts`), the editor's extension list, editor tests under `frontend/tests/`
**Done when:** Tests show: the mark has attribute `{ id }` only, `excludes: ""`, `inclusive: false`; text typed at the start and at the end edge stays outside the passage (both edges tested); the mark stays on its passage while typing inside it, deleting around it and cutting and pasting around it; overlapping marks on the same text coexist; adding, editing or removing the mark leaves plain text, word count, `content.txt` and the revision diff for a text-only edit unchanged (one pin per item); the mark survives save and reload of `content.tiptap.json`; a mark whose id has no body does not break the editor or the save and the document is not rewritten at ordinary load.
**Depends on:** 11
**Estimate:** 5
**Notes:** Satisfies FR-9, FR-13, FR-18 (editor half). Whether `@tiptap/markdown` copes is already covered by Task 9.
**Done:** [ ]

### Task 16: Annotation data layer and write flows
**What:** Add the client state and flows for listing, adding (sidecar first, mark after), editing and deleting annotations, with failed reads kept distinct from empty.
**Files:** `frontend/store/` annotations slice with `transport-service` and `guards` split (only if shared state is needed, otherwise a hook), tests
**Done when:** Tests show: adding writes the sidecar first and applies the mark only after the write succeeds, a failed write applies no mark and surfaces the error message; delete removes the body and the mark and, if one of the two fails, the failure is surfaced and the leftover state is one that a body with no mark is detached and a mark with no body is inert; a failed read yields a failure state, never an empty list; state changes are explicit (non-optimistic); annotation changes do not change text, create a revision or count as an unsaved text change for the sync blockers.
**Depends on:** 14, 15
**Estimate:** 5
**Notes:** Satisfies FR-12 (write order), FR-14 (delete behaviour), FR-15, FR-22 (Redux split). Follow the pattern in the `getwrite-redux-slice` skill.
**Done:** [ ]

### Task 17: Annotations panel UI
**What:** Build the annotations panel listing attached and detached annotations with edit, delete and highlight behaviour.
**Files:** a new panel component and stories under `frontend/components/`, the editor toolbar button, `MetadataSidebar.tsx` only if the sidebar variant is chosen, panel and a11y tests, a highlight decoration extension
**Done when:** The task first checks whether the metadata sidebar is already visible at phone width and records which and why: a drawer or panel opened from an editor toolbar button (default) or a section in `MetadataSidebar.tsx` (only if visible at phone width). Tests show: the panel works at phone and desktop widths and focus returns to the opener on close; it lists each annotation with its body and highlights the passage without relying on colour alone and without red; selecting an item brings its passage into view; placing the caret in a passage indicates its annotation(s); a body can be edited and an annotation deleted after a confirmation; an annotation with no mark in the current document is listed as detached with its saved quote and is never deleted automatically, including across restarts; a detached annotation can be deleted; a failed read shows a failure, never an empty list; a body containing `<img src=x onerror=...>` renders as text; a body-less mark is not shown; an `a11y` test per `docs/standards/accessibility.md` passes (labelled region, keyboard only, visible focus); stories cover populated, empty, detached and failed states.
**Depends on:** 16
**Estimate:** 5
**Notes:** Satisfies FR-14, FR-15 (failure display), FR-16 (listing and delete), FR-18 (panel half), FR-11 (plain-text render), OQ-9. Read existing component source and stories before using props.
**Done:** [ ]

### Task 18: Add and re-attach controls
**What:** Add the add-annotation control for a non-empty text selection and the Re-attach action for detached annotations.
**Files:** editor toolbar and panel files from Task 17, their tests and stories
**Done when:** Tests show: with a non-empty selection the writer can add an annotation whose `quote` is the selected text; an empty selection offers no add; no add control is rendered on an image or audio resource (assertion of absence) and no existing image or audio flow changes; Re-attach applies the mark with the same id to the selection, updates `quote` to the newly selected text and bumps `updatedAt`, and the original quote is not kept; both controls are keyboard operable with accessible names.
**Depends on:** 17
**Estimate:** 5
**Notes:** Satisfies FR-12, FR-16 (re-attach), FR-23 (editor half), OQ-10.
**Done:** [ ]

### Task 19: Revision restore detaches and drops annotation marks
**What:** On restore, leave bodies untouched, make annotations whose marks are missing detached, and remove marks whose ids have no body without altering text.
**Files:** the restore path in `revision-core.ts`, `revision-manager.ts`, `revisionsSlice.ts` (found by reading and recorded), tests
**Done when:** The task first reads those files and records the restore path in `experiments.md`; tests show: after restore every annotation whose mark is missing is detached and no body is deleted; any `annotation` mark whose id has no body is removed while plain text and all other marks are equal before and after; web, desktop and native paths behave the same; body-less marks are removed only on restore, not at ordinary load.
**Depends on:** 12, 15
**Estimate:** 5
**Notes:** Satisfies FR-17, FR-16 (detach on restore), OQ-11. Reading folded in.
**Done:** [ ]

### Task 20: Clipboard operation recorder (cut versus copy)
**What:** Record the last clipboard operation (annotation ids and source resource id) from the editor's `cut` and `copy` DOM handlers and prove it distinguishes cut from copy.
**Files:** a new editor extension or module (for example `annotation-clipboard.ts`), tests
**Done when:** A test proves, before any paste logic is built on it, that a cut and a copy of annotated text are told apart and carry the ids and source resource id; the test and its result are recorded in `experiments.md`; if it cannot be made to hold, that is reported as a blocker for Task 21.
**Depends on:** 15
**Estimate:** 3
**Notes:** Satisfies the proof half of FR-19 (OQ-12).
**Done:** [ ]

### Task 21: Paste behaviour for annotated text
**What:** Implement paste rules: copy creates a new id and copied body; cut within a resource keeps the annotation; cross-resource cut gives the target a new id and detaches the source; outside paste drops the mark.
**Files:** the paste extension and editor wiring, tests
**Done when:** Tests cover: copy-paste in the same resource (new id, copied body and quote, independent edit and delete); copy-paste across resources; cut-paste in the same resource (same id and body, no copy); cut-paste across resources (target has a NEW id and copy of body, source annotation becomes detached with its mark left with the cut text, never deleted); a paste from outside the app (mark dropped, text stays); the pasted body is written through the annotation core and validated (never taken from the clipboard unvalidated); annotation ids are never shared between resources.
**Depends on:** 20, 16, 13, 18
**Estimate:** 5
**Notes:** Satisfies FR-19 (OQ-12 resolved). Uses the id-remap helper from Task 13. Ordered after Task 18 to avoid editor-file overlap.
**Done:** [ ]

### Task 22: Index annotation bodies
**What:** Index annotation bodies in `indexer-queue.ts`'s `runTask` under a separate term source, enqueue an index task on every annotation write, and keep them across `reindex`.
**Files:** `indexer-queue.ts`, the reindex code, `annotations-core.ts` (add the enqueue), tests
**Done when:** Tests show: a body-only match reaches the candidate list (the case `execute-search.ts:192,224` misses today); a body edit or delete changes the index without a manual reindex; `reindex` keeps annotation terms; detached annotation bodies are indexed; the term source is separate from prose.
**Depends on:** 12
**Estimate:** 5
**Notes:** Satisfies FR-20 (index half, OQ-13). Edits `annotations-core.ts` after Task 12 and before nothing else concurrently.
**Done:** [ ]

### Task 23: Search results and snippet labelled "Note:"
**What:** Surface body hits as one hit per resource with a "Note:" snippet, openable, on web and native.
**Files:** `frontend/lib/search/execute-search.ts`, the search result row component, tests
**Done when:** Tests show: a body match appears as a hit on its resource with the snippet taken from the body and labelled "Note:" in text, not by colour alone; a resource matching in prose and body appears once; clicking it opens the resource; body edit or delete changes results without reindex; detached bodies are found; the search path works through the native transport.
**Depends on:** 22
**Estimate:** 5
**Notes:** Satisfies FR-20 (OQ-13, OQ-136).
**Done:** [ ]

### Task 24: Reproduce the browser-build PDF failure and baseline the server path
**What:** Write the failing test that resolves `@react-pdf/renderer` to its browser build and shows the PDF compile rejecting with "Node specific API", and record the pre-change server-path extracted text.
**Files:** existing PDF compile tests (add) or new `compile-pdf-browser-build.test.ts`, `frontend/vitest.config.ts` only if an alias or conditions are needed for that test, `specs/features/compile-defaults-annotations-native-pdf/experiments.md` (Part 3 section)
**Done when:** The test, how it forces the browser resolution (alias or conditions; `vitest.config.ts:43-59` sets none today) and its outcome are in `experiments.md`; the test fails with a message matching "Node specific API" before any fix. If it cannot be made to fail that way, that is recorded, the on-device observation (note_875f2e5b) stays the only reproduction, and the fix test in Task 25 must name a stated reason for failing before and passing after. The extracted PDF text of one fixed document on the unchanged server path (from `main`) is recorded.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-24 and the baseline for FR-27. Part 3 tests first; no fix is written here.
**Done:** [ ]

### Task 25: Native PDF render path
**What:** Record the design and implement a browser-side render path behind a seam shared by the HTTP route and native backend, leaving the server path on `renderToBuffer`.
**Files:** `frontend/src/lib/models/compile-core.ts`, `frontend/store/transport/native-compile-backend.ts`, a new render-seam module, the design record in `experiments.md` or a notes file next to it
**Done when:** The design records which approach was chosen (browser `pdf(<Document/>).toBlob()` with a Blob-to-ArrayBuffer step chosen at run time as `download-file.ts` does, or rendering outside the WebView) and why, with the test that shows it works; Task 24's test now passes; `app/api/compile/pdf/route.ts` keeps its behaviour and `renderToBuffer` remains the render call on that path; `compile-pdf-route.test.ts`, `compile-pdf-fonts.test.ts` and `compile-transport-validation.test.ts` pass unchanged; the extracted text on the server path for the fixed document equals the Task 24 baseline.
**Depends on:** 24, 10
**Estimate:** 5
**Notes:** Satisfies FR-25, FR-27, FR-24 (green). The spec does not state the candidate works; the test decides. Ordered after Task 10 because both may edit compile files. No static-export build runs here.
**Done:** [ ]

### Task 26: Native PDF validity and parity with the server path
**What:** Test that a PDF compiled through the native path is valid and has the same extracted text as the server path, and that the font-fallback notice is preserved.
**Files:** native compile backend tests under `frontend/tests/`
**Done when:** A test shows the native-path PDF begins with `%PDF-`, ends with `%%EOF`, parses with the Task 1 helper, contains the selected resources in tree order with text and headers, and its extracted text equals the server path's for the same input; the font-fallback (`isFontError`, `font-fallback` warning) behaviour is preserved on the server path and shown to the writer on the native path if adopted.
**Depends on:** 25
**Estimate:** 3
**Notes:** Satisfies FR-26 and the font-fallback half of FR-27. Compares extracted content, not bytes.
**Done:** [ ]

### Task 27: Show the real error in all four Start Page compile catches
**What:** Change the Start Page PDF, DOCX, Markdown and text catches to show `err instanceof Error ? err.message : String(err)` and extend the test to all four.
**Files:** `frontend/components/` `StartPage.tsx` (~660-661, 675-676, 697-701, 713-717), its tests
**Done when:** For each of the four paths a test rejects the compile with a known message and asserts it is shown, not "Could not generate PDF" or the generic text; only the thrown message is shown, never a stack, path or response body.
**Depends on:** 8
**Estimate:** 3
**Notes:** Satisfies FR-28 (OQ-16: goes slightly beyond product FR-91's wording, by owner decision under `docs/standards/failure-visibility.md`). Mirror `AppShell.tsx:1335`. Ordered after Task 8 because both edit `StartPage.tsx`.
**Done:** [ ]

### Task 28: PDF compile works through both entry paths on native
**What:** Test that the AppShell and Start Page PDF compile paths both produce a PDF with the native transport injected, with no new control.
**Files:** existing AppShell and Start Page tests under `frontend/tests/`
**Done when:** One test per path, with the native transport injected, shows a PDF is produced after the fix; no new control is added to either path.
**Depends on:** 25, 27
**Estimate:** 3
**Notes:** Satisfies FR-29.
**Done:** [ ]

### Task 29: Handbook, feature docs and Code Map
**What:** Update the user handbook, `docs/features/` and the `frontend/CLAUDE.md` Code Map for the new behaviour.
**Files:** the user handbook pages for compile and export dialogs, a new annotations page or section, the Android PDF line, `docs/features/` pages, `frontend/CLAUDE.md`
**Done when:** The compile and export dialogs page covers saved defaults, override and save; the annotations page covers add, edit, delete, detached annotations, paste behaviour, "Note:" search hits and that annotations are not compiled; the Android PDF line is added with no statement about fonts on Android and no unmeasured result stated as fact; the Start Page gap from Task 8, if any, is stated honestly; the new cores, routes and native backend pairs are in `docs/features/` and the Code Map; each page keeps its existing style.
**Depends on:** 7, 8, 13, 18, 19, 21, 23, 26, 28
**Estimate:** 5
**Notes:** Satisfies FR-33. Invoke `write-user-guide` for plain-language handbook copy; verification evidence stays out of the copy.
**Done:** [ ]

### Task 30: Acceptance suites and reporting
**What:** Run the acceptance suites and record each as run or not run, and state which parts landed, closed with no product change, or stopped.
**Files:** `specs/features/compile-defaults-annotations-native-pdf/experiments.md` (results), no source changes except fixes the suites require
**Done when:** `pnpm typecheck`, `pnpm lint` and `pnpm test:ci` (from `frontend/`, per FR-34), `pnpm knip` (from the repo root) and `pnpm test:e2e` (builds Storybook; stop `pnpm storybook` first) pass, and `pnpm build:native` runs where it can, each reported as run or not run with its output; the FR-8 test (Task 9) and the Task 24 reproduction record are confirmed present; the report names which of Parts 1, 2 and 3 landed, which closed with no product change, and which stopped, and lists FR-30 under "Not verified" if it was not run.
**Depends on:** 29
**Estimate:** 3
**Notes:** Satisfies FR-34 and FR-35. Run outside the command sandbox and in the main checkout, never a worktree: `pnpm test:e2e` and `pnpm build:native` start processes and builds that fail in worktrees. FR-30 does not gate the merge.
**Done:** [ ]

## Summary
- Total tasks: 30
- Total estimated effort: 123 story points
- Critical path: 1 → 2 → 3 → 4 → 14 → 16 → 17 → 18 → 21 → 29 → 30
- Risks: Task 1 (`pdfjs-dist` may not run in the node test project; fallback is the react-pdf element tree); Task 9 and Task 10 (FR-8 may reveal a serializer difference that changes scope); Task 20 (cut versus copy detection from DOM handlers is unproven until its test passes and gates Task 21); Task 24 and Task 25 (the browser-build failure may not reproduce in Vitest; the native render approach is unproven on a device and FR-30 is not an orchestrator task); Tasks 17 and 21 (editor and panel files are touched by several tasks and are ordered, so they sit on the critical path); Task 22 (the index change touches the shared indexer and `reindex`).
