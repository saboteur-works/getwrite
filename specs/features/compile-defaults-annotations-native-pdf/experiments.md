# Feature 101 experiments

Measurements are recorded as observed values with the command or test that produced them. A cause is written only where an experiment separated it from the alternatives; anything else is labelled HYPOTHESIS. Each part appends to its own section.

## Environment record

Date: 2026-11-04. Tree: branch `feat/compile-defaults-annotations-native-pdf`, isolated worktree, base `cfb18b51` plus the Task 1 files. Node v24.15.0, pnpm 10.28.0, Vitest v4.1.6, `pdfjs-dist` 6.5.438 (`frontend/node_modules/pdfjs-dist/package.json`). Everything ran inside the command sandbox; `pnpm` printed a `~/.npmrc` EPERM warning on each call (a sandbox denial, not a result). `next build`, `pnpm build:native`, Storybook and Playwright were not run.

### PDF text tool (Task 1, FR-8, FR-26, FR-35)

| Item | Test or command (cwd) | Observed |
| --- | --- | --- |
| `pdfjs-dist` runs in the node Vitest project | `pnpm exec vitest run tests/unit/pdf-text-helper.test.ts` (`frontend/`) | 1 file, 6 tests passed; the project label in a failing first run was `\|node\|`; import is `pdfjs-dist/legacy/build/pdf.mjs` |
| Extraction of a `compilePdfCore` PDF | same file, first test | extracted page texts contain the header `Chapter One` and body `The quick brown fox` |
| Control: one changed letter | same file, second test | pages extracted from "fox" and "fax" inputs are not equal |
| Validity check | same file | a `compilePdfCore` PDF reports `{ valid: true }`; a buffer without `%PDF-` is invalid; a PDF with its last 2048 bytes removed is invalid; a body with header and `%%EOF` but no PDF structure makes extraction throw |
| First run before a fix | same command | 3 tests failed with `doc.destroy is not a function` (in pdfjs-dist 6.5.438 `destroy` is on the loading task, not the document); helper changed to call `task.destroy()`; then 6 passed |
| typecheck | `pnpm typecheck` (`frontend/`) | exit 0 after removing an `isEvalSupported` option the 6.5.438 types do not declare (first run: TS2353) |
| eslint, prettier | `pnpm exec eslint` and `prettier --check` on the two new files | no output from eslint; prettier clean |
| knip | `pnpm knip` (repo root) | exit 1 (pre-existing findings); no line mentions `pdfjs` or `pdf-text` |

The FR-8 fallback (compare react-pdf's element tree) was not needed and not implemented: `pdfjs-dist` ran in the node project.

Not measured: extraction on multi-page output or with bold, italic or non-Latin runs; whether extraction order matches reading order for those; the `font-fallback` document (`CompilePDFFallbackDocument`); the native path of `compilePdfCore` (FR-26); the text-item join (newline on `hasEOL`) is the helper's own choice, and its stability across `pdfjs-dist` versions was not checked.

## Part 1: compile and export defaults

### Start Page list entry `config` (Task 2, OQ-5) - a reading, not a run

Read: `frontend/src/lib/models/project-crud-core.ts` `listProjectsCore` (157-236, `listEncryptedProject` 279-321), `frontend/src/lib/api/schemas.ts` (`ProjectListEntrySchema` and its three members, `ProjectSchema`, `ApiProjectConfigSchema`), `frontend/src/lib/api/projects.ts:116-130` (`httpProjectsTransport.list`).

Observed, by entry shape:

| List entry shape | Carries `project.config`? | Where |
| --- | --- | --- |
| Normal (unencrypted, usable) | Yes. `listProjectsCore` returns `{ project: manifest, resources, folders }` with the parsed `project.json` verbatim; `config` is whatever the manifest holds | `project-crud-core.ts:232` |
| Encrypted, unlocked | No. `project` is built as `{ id, name, createdAt, rootPath }` | `project-crud-core.ts:299-319` |
| Encrypted, locked | No. `project` is `{ id, createdAt }` | `project-crud-core.ts:290-297`; `LockedProjectListEntrySchema` |
| Unusable | No. `project` is a strict `{ id }` | `UnusableProjectListEntrySchema` |

On the client, `httpProjectsTransport.list` parses with `z.array(ProjectListEntrySchema)` and returns the parsed data, so any `config` key not declared in `ApiProjectConfigSchema` is dropped. Before this task `compileDefaults` and `exportDefaults` were not declared there; the new test "keeps compileDefaults and exportDefaults through the client list parse" failed first (keys absent from the result) and passes now that they are declared.

Reading consequence for Task 8 (OQ-5): a normal Start Page entry carries `config` and so can carry saved defaults. Encrypted entries (unlocked or locked) and unusable entries do not carry `config`, so no saved defaults are available from the list for them. The native list path (`native-projects-backend`) was not read, so whether it returns the same shape was not checked; `listProjectsCore` is the shared core for it per its header comment, but that was not verified here.

Tests added in this task (frontend node project, `pnpm exec vitest run` on the three files, 89 passed): `tests/unit/project-config.test.ts` (schema parse, absence, extra field rejected, bad shape rejected), `tests/unit/projects-api-validation.test.ts` (client list parse keeps both keys, neither key absent, extra field rejects the list), `tests/unit/project-crud-core-listing.test.ts` (a normal entry carries the manifest's `config`).

### Start Page compile applies saved defaults from the list entry (Task 8, FR-6, OQ-5)

Test: `frontend/tests/component/StartPage.test.tsx` (jsdom project), `pnpm exec vitest run tests/component/StartPage.test.tsx` (`frontend/`), 67 passed. The saved-defaults reader module is mocked and asserted not called.

Observed before the change: `StartPage.tsx` passed `projectId={compileTargetProjectId}` (the entry's `project.id`, not the directory id) to `CompilePreviewModal`, so opening Compile called the default `readCompileDefaults` (an `openProject` fetch) for every project. The test "an entry without config ... adds no per-project fetch" failed first (reader called once); "applies the entry's saved compileDefaults" failed first (no `Compile (1)` button, all resources selected).

After the change: the Start Page passes the modal a `readSavedDefaults` that returns the entry's `config.compileDefaults.excludedResourceIds` (no fetch), and a `projectId` (the directory id) only when the entry carries `config`. Observed: with `compileDefaults` set to one existing and one missing id, the dialog shows `Compile (1)`, the request `resourceIds` omit the saved id and the missing id is dropped without a message; an entry with no `config` shows `Compile (2)`, sends both ids and the reader is not called.

Gap (for the feature's notes): encrypted (unlocked and locked) and unusable entries carry no `project.config` (Task 2 reading), so the Start Page compile applies no saved defaults for them and shows no saved-defaults panel; their output is unchanged from before. Not measured: the native list path's entry shape (not read in Task 2 either). Also not tested: after a save from the Start Page dialog, the list entry is not refreshed, so reopening the dialog in the same page session applies the list's earlier value until the list reloads.

## Part 2: annotations

### FR-8 compile-output test with annotation marks (Task 9, FR-7, FR-8)

Test: `frontend/tests/unit/compile-annotation-marks.test.ts` (node project); `pnpm exec vitest run tests/unit/compile-annotation-marks.test.ts` (`frontend/`). Documents are TipTap JSON with `{ type: "annotation", attrs: { id } }` marks; the mark is not registered in the editor or the Markdown manager. `content.txt` for each document is `tiptapToPlainText` of that document. Each case compiles the annotated document, the same document without annotation marks, and a control with one changed letter, through `compileTextCore`, `compileMarkdownCore`, `exportTextCore`, `exportMarkdownCore`, `compilePdfCore` (ordered per-page text via the Task 1 helper), `compileDocxCore` (`<w:body>` of `word/document.xml` via `jszip`), plus `collectMarkdownWarnings` and the `warnings` of both Markdown cores. Compile used `includeHeaders: true`, one resource.

First run (before any edit to the test), per case (a) plain annotation on a word, (b) edge partway inside a bold run, (c) two overlapping annotations, (d) leading/trailing whitespace and paragraph-edge end:

| Comparison, annotated vs plain | (a) | (b) | (c) | (d) |
| --- | --- | --- | --- | --- |
| compileTextCore | equal | equal | equal | equal |
| compileMarkdownCore | equal | equal | equal | equal |
| exportTextCore | equal | equal | equal | equal |
| exportMarkdownCore | equal | equal | equal | equal |
| PDF extracted text per page | equal | equal | equal | equal |
| DOCX `<w:body>` | equal | equal | equal | equal |
| collectMarkdownWarnings and both cores' warnings | equal | equal | equal | equal |

Controls, first run: the one-changed-letter control differed from the plain document in TXT, Markdown (compile and export), PDF and DOCX for all four cases. For `collectMarkdownWarnings` the one-letter control did NOT differ (4 of 60 tests failed on first run: warning lists are empty for both documents, so a changed letter cannot change them). The test was changed so that comparison's control adds a text colour (`textStyle` mark, which Markdown drops) instead; that control differs, and 60 of 60 pass.

Observation: no case differed, so no serializer change is indicated by this test (Task 10). Not measured: the annotation mark registered in the editor or Markdown manager (does not exist yet; an unregistered mark was the only form tested); multi-resource compile; includeHeaders false; the font-fallback PDF document; the native PDF path; any annotation mark attrs other than `id`.

### FR-8 serializer fix decision (Task 10, FR-8)

Decision: no serializer change needed. No file under `compile-core.ts`, `export-core.ts` or the Markdown serialization was edited; this task has no diff other than this entry.

Evidence: the Task 9 first-run record above (every annotated-vs-plain comparison equal for cases (a)-(d) on TXT, Markdown, PDF text, DOCX body and warnings, annotation mark unregistered). Re-run in this task, not taken on trust: `pnpm exec vitest run tests/unit/compile-annotation-marks.test.ts --reporter=verbose` (`frontend/`): 1 file, 60 of 60 tests passed. The listing showed, for each of the four cases, the annotated-equals-plain test passing for all seven comparisons and the control (one changed letter) differing for the six letter-sensitive outputs, with the warnings control using a lossy construct (text colour) as recorded above. The test file builds its annotated documents with `{ type: "annotation", attrs: { id } }` marks (test line 55).

Not measured: the annotation mark registered in the editor or the Markdown manager (it does not exist yet; Task 15 adds the mark and re-runs this test then as a check); multi-resource compile; `includeHeaders` false; the font-fallback PDF document; the native PDF path; mark attrs other than `id`.

### Task 15 re-run (annotation mark registered, FR-8)

Change under test: `AnnotationMark` (`components/Editor/Extensions/AnnotationMarkExtension.ts`) added to `baseSchemaExtensions` in `components/Editor/editorExtensions.ts`, the list the editor and the headless Markdown serializer share, so the mark is now registered in both. Command (`frontend/`): `pnpm exec vitest run tests/unit/annotation-mark-extension.test.ts tests/unit/compile-annotation-marks.test.ts`. Observed: 2 files, 76 of 76 tests passed (16 new mark tests, 60 Task 9 tests). In the Task 9 test every annotated-vs-plain comparison (TXT, Markdown, PDF extracted text, DOCX body, warnings) stayed equal for cases (a)-(d) with the mark registered, and the one-changed-letter controls still differed. Also run: `tests/unit/markdown`, `tests/unit/editor`, `tests/unit/export`, `tests/unit/compile` and `tests/editorContextMenu.test.tsx` paths, 22 files, 246 passed and 1 expected fail, none failing. Not measured: multi-resource compile, `includeHeaders` false, the font-fallback PDF document, the native PDF path, the browser build.

### Task 13: annotations on copy, duplicate, template, trash, encryption and lock (FR-21, OQ-14)

Before the change (tests first): the new copy and duplicate tests failed, 2 of 30 in `tests/unit/resource-copy-revision.test.ts` (`copyResourceCore` and `duplicateResource` each, the test "gives every annotation a new id ..."), on `expected true to be false`, i.e. the copy's annotation ids were still the source's ids. The other two new tests per function passed vacuously before the change. That `copyResourceCore` spreads the whole sidecar (`resource-crud-core.ts`) and that `duplicateResource` does the same with `{ ...meta, id }` is read from the code; the failing assertion is the measurement.

After: `annotation-remap.ts` (pure `remapAnnotationIds`) and `annotation-copy.ts` (`remapCopiedAnnotations`, called by both functions before the copy's sidecar is written). 30 of 30 pass in `resource-copy-revision.test.ts`. Observed for both functions: every annotation in the copy has a new id; body and quote are equal to the source's; each mark in the copied `content.tiptap.json` carries the same new id as its annotation; the source sidecar and document are unchanged; the copy's `content.txt` is equal to the source's; the copy's `v-1` `content.bin` equals the copy's remapped document; a copy of an unannotated resource has no `annotations` key.

Decisions where the spec is silent (a choice, not a measurement): a body with no mark (detached) is copied under a new id and stays detached; a mark with no body is kept in the copy under a new id that no body owns (so no id is shared between resources and the text is unchanged), not dropped. Task 21 (paste) may drop body-less marks itself; the helper does not.

Template (`saveResourceTemplateFromResource`): no code change. Observed in `resource-templates.test.ts`: for a source with one marked annotation, the template file contains no `annotations` key, no "annotation" substring, no id and no body text; a resource created from it has no `annotations` key and no annotation mark. The function already records an explicit key set; the test pins that.

Trash (`tests/unit/trash-core.test.ts`): after `softDeleteResource` and `restoreOneCore` the sidecar `annotations` array equals the one stored before, and `content.tiptap.json` is byte-identical.

Encryption and lock (`tests/unit/annotations-core.test.ts`, in-memory adapter through `workspaceEncryptionAdapter`): after `addAnnotationCore` the sidecar bytes read from the base adapter contain neither the body text nor the string "annotations", and reading through the encrypting adapter returns the body. With the keyring locked, `addAnnotationCore`, `updateAnnotationCore`, `deleteAnnotationCore` and a sidecar read each reject with a locked-access error. There is no separate annotation read function in the core; "read" is the sidecar read.

Gaps: none of the "Done when" clauses failed. Not measured: copy of a resource inside an encrypted project (copy and annotation tests ran on the plain filesystem adapter); folder-cascade trash of annotated resources; the HTTP routes (Task 14); search index entries of the copy (annotation bodies are not indexed until Task 22). A copy's `content.tiptap.json` is rewritten with `JSON.stringify(doc, null, 2)` as `persistResourceContent` does; whether the source file used the same formatting was not compared byte for byte.
### Revision restore path and body-less mark removal (Task 19, FR-17, FR-16, OQ-11)

Restore path, read (not run): the app has no operation named restore. Choosing an older revision calls `setCanonicalRevisionForSelectedResource` (`revisionsSlice.ts`) -> `persistCanonicalRevision` (`revision-transport-service.ts`) -> the transport's `setCanonical`. On web and desktop that is `PATCH /api/resource/revision/[resource-id]` with neither `content` nor `preserve`, which calls `setCanonicalRevision` in `revision-core.ts`; on native it is `native-revision-backend.ts` `setCanonical`, which calls the same `setCanonicalRevision` in `revision-core.ts`. That core only re-flags `isCanonical` in each revision's `metadata.json` (via `revision.ts`); before this task it did not read or write document content. `revision-manager.ts` (`createRevision`, `nextVersionNumber`) has no restore step. The editor then loads the canonical revision and autosave (`updateRevisionInPlace`) rewrites it later. All three paths therefore share one core function.

Change: `setCanonicalRevision` in `revision-core.ts` now first calls `stripBodylessAnnotationMarksFromRevision`, which (under the per-resource `revision-content` lock) reads the sidecar `annotations`, reads the target revision's `content.bin`, removes `annotation` marks whose id is not in the sidecar (pure helper `annotation-mark-strip.ts`), and rewrites `content.bin` only if a mark was removed. It never writes the sidecar, so no body is deleted and a body whose mark is missing is detached by derivation. A resource with no sidecar, or a revision that is not a TipTap doc, is left unchanged; read and write errors propagate. Nothing else calls it, so ordinary load and listing do not rewrite the document.

Observed: `pnpm exec vitest run tests/unit/revision-restore-annotations.test.ts` (`frontend/`). Before the change: 2 failed, 4 passed (the two restore tests; the pure-helper and no-rewrite tests passed). After: 7 of 7 passed, covering the helper (plain text and other marks equal, input not mutated, same object when nothing removed), core restore (marks and text equal except the body-less mark; both sidecar bodies still present, including the one with no mark; all annotation marks removed when the sidecar has none; a document whose marks all have bodies is byte-identical), no rewrite across `listRevisions` and `readSidecar`, and the native in-process backend giving the same result. Also run, 73 of 73 passed across 6 files: this file plus `revision-invariants`, `native-revision-backend`, `revision-locked-access`, `revision-route-canonical`, `inverted-index`.

Not measured: the HTTP route itself and the desktop shell (read to call the same core; no route-level test was added); `content.tiptap.json`/`content.txt` are not re-synced at restore (autosave does that later, as before), so compile or search between a restore and the next autosave read the pre-restore derived files; concurrent restore with an autosave beyond the shared lock; a restore of a very large document.
### Cut versus copy recorder (Task 20, FR-19 proof half, OQ-12)

Question: can the editor's `cut` and `copy` DOM handlers tell a cut from a copy of annotated text and carry the annotation ids and the source resource id? Module: `frontend/components/Editor/Extensions/annotation-clipboard.ts` (a ProseMirror plugin with `handleDOMEvents.cut` and `.copy`, returning false so ProseMirror's own handler still runs; the last operation is kept at module level because the clipboard is shared by all editors). It is not registered in `editorExtensions.ts` (Task 21 wires it) and has no paste logic. Test: `frontend/tests/unit/annotation-clipboard.test.ts` (jsdom); `pnpm exec vitest run tests/unit/annotation-clipboard.test.ts` (`frontend/`). The test mounts the editor with `baseSchemaExtensions` plus the recorder, selects text, and dispatches a bubbling `Event("cut")` or `Event("copy")` on `editor.view.dom` (jsdom, no `clipboardData`).

Before the module existed the test file failed to load (import not resolved, no tests ran). After: 1 file, 8 of 8 passed. Observed: a copy of text carrying annotation A records `{ kind: "copy", annotationIds: [A], sourceResourceId }`; a cut of the same selection records `kind: "cut"` with the same ids and resource; alternating copy and cut on one identical selection yields "copy" then "cut"; with two editors, the record carries the resource id of the editor that fired last; overlapping annotations give distinct ids in document order and plain text gives `[]`; a later plain cut replaces an earlier annotated copy; an empty selection records nothing and keeps the earlier record; an editor with no resource id records `null`. The existing `annotation-mark-extension.test.ts` still passes with it (24 of 24 across both files).

Conclusion from these runs: in jsdom, with synthetic events, the distinction holds, so Task 21 is not blocked on it. Not measured: a real browser or Electron/Android WebView, events fired by the real keyboard shortcut or context menu (a native `ClipboardEvent` with `clipboardData`), and a paste. Not covered by the recorder: a cut or copy made outside the editor DOM handlers (the app's context-menu items, if they call `document.execCommand` or the Clipboard API directly, were not checked here), and a clipboard changed by another application between the cut and the paste (the record would be stale; Task 21 needs to compare the pasted content with the record, which was not tested).
### Annotation-body index (Task 22, FR-20 index half)

Tests: the "annotation core, index" block in `frontend/tests/unit/annotations-core.test.ts` (real files, real indexer queue; `pnpm exec vitest run tests/unit/annotations-core.test.ts` from `frontend/`). First run, with the tests written and no source change: the three tests that need a body hit (body-only match, edit/delete, reindex keeps terms) failed with `[]` where the resource id was expected; the "once" and "leaves the index" tests passed trivially. After the change: 20 of 20 pass. Whole `tests/unit` project: 466 files, 6112 passed, 7 expected fail, 1 skipped. Observed: `mutateSidecar` already enqueues an index task after every sidecar write, so before this task an annotation write did trigger `runTask`, which did not read annotations. Terms go to `meta/index/annotations.json` (same shape as `inverted.json`); a body-only term is absent from `inverted.json` and from `search()`. `executeSearch` takes candidates from `search()` plus `searchAnnotationBodies()` (prose hits first, annotation-only ids after, de-duplicated). Not measured: the CLI `reindex` command run end to end (the test calls `indexResource` per resource and `reindexMissingResources`, the calls `reindex` makes, and neither touches `annotations.json`); multi-term queries whose terms split between prose and bodies (annotation matching is AND within bodies, prose AND within prose, so such a query finds neither); the "Note:" snippet (Task 23); encrypted projects and the native transport.

### Flake follow-up: search-route annotation-body test (measurements)

- Before: `pnpm exec vitest run tests/unit/search-route.test.ts` x10: 5 failed. Every failure was `TypeError: Cannot read properties of undefined (reading 'snippet')` in "shows the edited body and drops a deleted one" (`edited[0]` undefined, an assertion in the test, not a cleanup error). Some failing runs also printed `[indexer-queue]` ENOENT/EINVAL stderr for `meta/index` temp files.
- Change (test only, `tests/unit/search-route.test.ts`): `flushIndexer()` before the sidecar write and before/after `indexAnnotationBodies` in the `setAnnotations` helper, and before temp-dir removal in `afterEach`. Production code unchanged.
- After: same command x12: 0 failed, no ENOENT/EINVAL stderr. Full `pnpm test:ci` x3: 1 exit 0; 2 exit 1 with all 766 files and 9664 tests passed and 1-2 unhandled errors `ReferenceError: document is not defined`, attributed by vitest to `tests/unit/annotation-clipboard.test.ts` (timer in prosemirror-view firing after jsdom teardown). That file passed 5 of 5 run alone.
- Reading: `indexer-queue.ts` also indexes annotation bodies from the sidecar (line ~282), so a queued task from an earlier sidecar write can run after the test's explicit `indexAnnotationBodies`. Not measured: which of the three flush points is individually sufficient; the ENOENT stderr was only shown to disappear with the flushes, not attributed per message. The production queue behaviour is by design (last write from sidecar wins); no production race shown.
- `tests/noiseWordsSettingsTab.test.tsx` alone x8: 0 failed. It did not fail in the 3 full runs above. Not reproduced; the one earlier failure under a full run is not explained (load was not varied under control).
### Annotations panel placement and annotation-only saves (Task 17, FR-14, FR-15, OQ-9)

Placement check (a reading of `components/Layout/AppShell.tsx`, not a run): the right-hand metadata sidebar is docked only when `layout.tier === "desktop"` (`hidden lg:flex`); at the phone tier (and tablet) it renders inside `ShellDrawer`, an overlay opened on demand. So the metadata sidebar is not visible at phone width, the OQ-9 exception does not apply, and the panel is opened from a new editor toolbar button (`AnnotationsToolbarButton`, `aria-expanded`/`aria-controls`) and rendered below the editor body in `TipTapEditor` at every width (`max-h-[45vh]`, scrolls inside itself). It is non-modal, so the caret can move in the text while it is open (the caret indicator needs that); `MetadataSidebar.tsx` is untouched. Not measured: the panel in a real browser at a 375px viewport (Storybook and Playwright cannot run in the worktree); the width tests only assert the same labelled region opens at `innerWidth` 375 and 1280 in jsdom, which has no layout.

Task 16 gap (annotation transactions and the unsaved flag). Measured in a real TipTap editor with the app's extensions: one `addAnnotationFlow` produces an update with two transactions, the primary one (meta `annotation: true`, one `addMark` step) and an appended `UniqueID` transaction (meta `__uniqueIDTransaction: true`, one step, no `addToHistory` meta). A first version of the classifier that treated only `addToHistory === false` as structural returned "text edit" for that update (test failed with `[false]`); treating `__uniqueIDTransaction` as structural too made it classify as annotation-only. The change: `TipTapEditor.onUpdate` passes a fourth argument `isAnnotationOnly` (`Editor/Annotations/update-kind.ts`); `EditView.handleChange` still queues the autosave (so the mark is saved) but tracks `isPendingAnnotationOnly`, and `hasUnsavedWork` ignores a pending or saving status while that flag is set; a save error still counts, and any later text edit clears the flag and counts again. Test `tests/integration/editViewAutosave.test.tsx` ("saves an annotation-only change without counting it as unsaved text work..."): one PATCH is sent, `onUnsavedChange(true)` is never called for the annotation change and is called after a text edit. Not measured: that a save which began as annotation-only and meets a text edit mid-flight reports unsaved correctly beyond the flag being cleared by that edit; the real `TipTapEditor.onUpdate` in a browser (the component renders an HTML mock under test, so the classifier is tested on a real editor's transactions and `EditView` on its mocked editor's 4-argument `onChange`).

## Part 3: Android PDF

### Browser-build reproduction and server-path baseline (Task 24, FR-24, baseline for FR-27)

Test: `frontend/tests/unit/compile-pdf-browser-build.test.ts` (node project); `pnpm exec vitest run tests/unit/compile-pdf-browser-build.test.ts` (`frontend/`).

How it forces browser resolution: `vi.mock("@react-pdf/renderer", () => import("@react-pdf/renderer/lib/react-pdf.browser.js"))`. No alias or conditions were added; `frontend/vitest.config.ts` is unchanged. The package's `package.json` has `"browser": { "./lib/react-pdf.js": "./lib/react-pdf.browser.js" }` and no `exports` field, so the deep import resolves. The real `compilePdfCore` runs over a real temp project dir; only the renderer module is swapped (it is swapped for `CompilePDFDocument` and `registerIBMPlexFonts` too).

Outcome: reproduced. Before the test was marked, the "produces a PDF" test failed with `Error: renderToBuffer is a Node specific API. You're either using this method in a browser, or your bundler is not loading react-pdf from the appropriate web build.` The message was not caught by `isFontError` (`/font|fetch|404|network/i`), so it propagates out of `compilePdfCore` as thrown. This shows that the browser build's `renderToBuffer` throws this message; it does not show that the on-device failure (note_875f2e5b) has this same path, which was not observed here.

How the suite stays green (form chosen: both): (1) "rejects with the Node specific API error (the reproduction)" asserts `rejects.toThrow(/Node specific API/)` and passes today; (2) "produces a PDF with the server-path text" is `it.fails` (reported by Vitest as an expected fail) asserting the browser-build compile yields `FIXED_DOCUMENT_SERVER_PAGE_TEXTS`. For Task 25: delete test (1) and drop `.fails` from test (2); if test (2) then passes it will be a real before/after pair. Reason it fails before and passes after: before, the compile path calls the browser build's `renderToBuffer`, which throws; after, it must render through a browser-side call.

Not measured: a real browser or WebView, the static-export bundle, Metro/Next bundler resolution (only the Vitest module swap).

Server-path baseline (unchanged `compilePdfCore` -> `renderToBuffer`, no mock): test `frontend/tests/unit/compile-pdf-server-baseline.test.ts`. Fixed document and expected text live in `frontend/tests/helpers/compile-pdf-fixed-document.ts` (`FIXED_DOCUMENT_RESOURCES`, `writeFixedDocument`, `fixedDocumentBody`, `FIXED_DOCUMENT_SERVER_PAGE_TEXTS`); Task 25 and 26 reuse it. Input: two text resources in order, "Chapter One" (paragraphs "The lighthouse keeper counted the ships at dusk." and "Seven passed, none stopped.") and "Chapter Two" ("Morning brought fog and a single bell."), `includeHeaders: true`. Extracted text via the Task 1 helper, one page:

```
Chapter One
The lighthouse keeper counted the ships at dusk.
Seven passed, none stopped.
Chapter Two
Morning brought fog and a single bell.
```

The result is a valid PDF (`checkPdfValidity`) with no `warning`. The run is from this branch, which has not changed the PDF render path since `main`.

Side observation (not part of the task, cause not established): with the paragraph "Seven passed; none stopped" (a semicolon, no final period) the server path threw `RangeError: Offset is outside the bounds of the DataView` from fontkit `TTFSubset._addGlyph` during `renderToBuffer`, deterministically on 3 runs. Replacing the semicolon with a comma and adding a period made it render. Which of the two changes mattered was not discriminated (the semicolon variant also lacked the final period); an experiment would render a paragraph that differs by only one of them. The fixed document avoids the semicolon.

### Native PDF render path design (Task 25, FR-25, FR-27, FR-24 green)

Chosen: a browser-side render behind a seam, not rendering outside the WebView. New module `frontend/src/lib/export/pdf-render.ts` exports `PdfRenderer`, `renderPdfOnServer` (`renderToBuffer` plus Buffer-to-ArrayBuffer, the default) and `renderPdfInBrowser` (`pdf(<Document/>).toBlob()` then `Blob.arrayBuffer()`). `compilePdfCore(body, render = renderPdfOnServer)` takes the renderer; `native-compile-backend.ts` passes `renderPdfInBrowser`; `app/api/compile/pdf/route.ts` is unchanged and calls `compilePdfCore(body)`, so `renderToBuffer` stays the render call on that path. Font fallback (`isFontError`, `font-fallback` warning) wraps whichever renderer is passed, so it applies to both.

Run-time choice: the caller picks (native backend vs route) rather than feature detection as `download-file.ts` does through `createTransport`; the native backend is already selected that way, so no second detection step was added. Why this approach: the browser build of `@react-pdf/renderer` exports `pdf` with `toBlob` (seen in `react-pdf.browser.js`), and the Task 24 reproduction showed only `renderToBuffer` throws there. Rendering outside the WebView was not tried.

Test that shows it works: `frontend/tests/unit/compile-pdf-browser-build.test.ts`. With `@react-pdf/renderer` mocked to the browser build, `compilePdfCore(fixed, renderPdfInBrowser)` yields a valid PDF whose extracted page text equals `FIXED_DOCUMENT_SERVER_PAGE_TEXTS` (the Task 24 baseline). The Task 24 "rejects" test was replaced by one asserting the default server renderer still rejects with "Node specific API" under the browser build (the history is kept here). The run was in Node, using Node's `Blob`.

Not verified: any device or Android WebView, the static-export bundle (`pnpm build:native` not run), FR-30 fonts on device. It is not claimed to work on a device.

### Native PDF validity and parity with the server path (Task 26, FR-26, font-fallback half of FR-27)

Test: `frontend/tests/unit/native-compile-pdf-parity.test.ts` (node project); `pnpm exec vitest run tests/unit/native-compile-pdf-parity.test.ts` (`frontend/`). Result: 5 passed. The tests were written after the code they exercise (Task 25 was already merged), so there is no failing-first run for them.

Method: the server path is `compilePdfCore(body)` (real `renderToBuffer`) over a temp project dir. The native path is `createNativeCompileTransport({ fs: fake Capacitor filesystem }).pdf(body)`, loaded after `vi.resetModules()` and `vi.doMock("@react-pdf/renderer", ...)` to `react-pdf.browser.js`, so it renders through `renderPdfInBrowser`. Both use the Task 24 fixed document.

Observed:
- Native PDF begins with `%PDF-`, its trimmed text ends with `%%EOF`, `checkPdfValidity` returns valid, filename `fixed-document.pdf`, no warning.
- Extracted text contains "Chapter One", its two paragraphs, "Chapter Two" and its paragraph, in that order (header before body for each).
- Native per-page extracted text equals the server path's per-page text measured in the same run, and the server text equals `FIXED_DOCUMENT_SERVER_PAGE_TEXTS`. Content is compared, not bytes.
- A resource present in the project but not in `resourceIds` is absent from the native PDF; selected order is kept. The fixed document has no folder structure, so "tree order" here means the order of `resourceIds` supplied by the caller; tree-order selection itself is not exercised in this test.

Font fallback:
- Server path (demonstrated): with `Font.register` made to throw `Failed to fetch font`, `compilePdfCore` returns `warning: "font-fallback"` and a valid PDF whose text contains the fixed document text.
- Native path (demonstrated at the level below): with the browser-build module mock and the same injected error, the native transport result carries `warning: "font-fallback"` and a valid PDF with the text. Passing that result to `runCompileAndDownload` (with `compilePdf`, the toast service and `downloadFile` mocked) calls `toastService.info("PDF compiled with fallback fonts — IBM Plex fonts were unreachable")`.
- Not demonstrated: that a real font load failure occurs on native, or that the toast shows in the real UI on a device. The failure is injected via `Font.register`; the real native fonts are same-origin paths loaded by the WebView and were not exercised. The `lib/api/compile.ts` transport selection (`createTransport`) is bypassed in the toast step.

Not verified: any device or Android WebView, the static-export bundle, FR-30.
