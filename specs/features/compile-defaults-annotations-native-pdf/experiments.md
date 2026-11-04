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
