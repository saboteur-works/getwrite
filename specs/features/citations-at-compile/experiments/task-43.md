# Task 43: Wire the citations pass into the PDF and DOCX cores

Date: 2026-11-15. Records Task 43's own results only. Node v24, `@react-pdf/renderer` 4.5.1, `docx` ^9.6.1, vitest 4.1.6.

## Order followed

Tasks 57, 58, 59, 60, 61 and 62 ran before this task, as the Task 43 Notes require. This task's PDF construction follows `experiments/task-57.md` (pass 1 with `onRender`, layout data for each mark's page, a fixed footer with `lineHeight: 1` on each footer `Text`, which `CompilePDFDocument.tsx` already has from Task 42). The faces are `.woff` (Task 61), so `"`, `:` and `;` render.

## What was built

- `frontend/src/lib/models/compile-core.ts`: `compileWithCitations` (exported), registered as the default citations pass (the Task 24 seam is kept: `registerCitationsPass(undefined)` still makes a present option fail with `CitationsUnavailableError`, which the Task 24 tests rely on). `CompileCitationsRequest` gained an optional `render` (the PDF renderer `compilePdfCore` was called with). New exports: `CitationsCompileError`, `PDF_NOTE_LAYOUT_MAX_PASSES`.
- `frontend/src/lib/export/section-loader.ts`: `loadCitationSections` (TipTap document and sidecar `annotations` of each compiled resource) and `readCitedSources` (each cited Source: present, removed, or unreadable). Both rethrow a locked-access error unchanged; any other read failure is a failure result, never "no citations".
- `frontend/src/lib/export/CompilePDFDocument.tsx`: an `onRender` prop passed to `Document`, nothing else.
- Tests: `frontend/tests/unit/compile-citations-core.test.ts` (25 tests) and `frontend/tests/unit/citations-pdf-layout-data-shape.test.ts` (6 tests).

Flow with the option present: read sections and their sidecar annotations; read each cited Source once; load the bundled style; load the engine (the `.wasm` bytes are read from a `file:` URL, no `fetch`); `renderCitationPass` with `renderIncompleteCitation` as the `renderIncomplete` hook; refuse if any `section.unplaced` is not empty (names each citation's Source and resource); `buildBibliography`; map each `{path, offset}` anchor to the UTF-16 offset in `tiptapToPlainText(document)` (the section text, which the builders place by); build the DOCX or run the PDF notes loop. The bibliography is omitted when no Source is cited (an empty heading is not drawn).

With the option absent nothing new runs: the existing `compilePdfCore` and `compileDocxCore` paths are unchanged (`compile-citation-byte-identity.test.ts`, the Task 25 test, passes unmodified).

## PDF notes loop

`CompilePDFDocument` draws the footer `position: absolute`, which reserves no room (Task 57). The core therefore wraps the document in `ReservedPdfDocument`, which calls `CompilePDFDocument(props)` and clones its single `Page` with `paddingBottom` increased by `reserve` (it throws a named error if the document is not one `Page` with a numeric `paddingBottom`). `CompilePDFDocument.tsx` takes no reserve prop, as the Task 43 Files line allows only an `onRender` prop there.

Each pass renders with `onRender`, reads the layout data, and takes per page: the marks (runs of font size 7 holding digits, outside the fixed footer), the footer box (`props.fixed`), and the shortfall (`pageHeight - paddingBottom - (footerTop - 8)`). Pass 1 has no footers and gives the placement. Pass k draws the footers for the placement last measured, with `reserve` raised by the largest shortfall. The loop ends when a pass has no shortfall and its marks sit on the pages its footers were drawn for. Named constants: `PDF_NOTE_LAYOUT_MAX_PASSES = 8` (all passes, pass 1 included) and `PDF_NOTE_BODY_GAP = 8` points. If the bound is reached the compile fails with a message that names `PDF_NOTE_LAYOUT_MAX_PASSES` and its value.

Page-count check: a pass rendered with the same `reserve` as the pass before it must have the same page count, else the compile fails with "The PDF has A pages without the notes and B pages with them, so a note could sit on the wrong page." (pass 2 against pass 1 is the case the Notes name). When `reserve` has changed, a different page count is expected (that is the re-pagination the loop exists for) and the loop continues; the final pass is accepted only when its marks equal the placement its footers were drawn for, so the footers and marks agree on the pages of the PDF returned.

### Measured on the tall-notes corpus (test "tall notes: no footer box overlaps...")

3 resources of 8 paragraphs, 24 Sources whose title carries 14 copies of "Long note sentence for height." (the Task 57 tall-note text), each paragraph ending in a cited sentence:

- `TASK43 tall corpus: 4 passes, pages per pass [12,12,19,19]`. Pass 2 (no room reserved) has a footer box above the body box's bottom on at least one page (asserted, so the test is not vacuous); the final pass has `footer top >= body box bottom` on every one of its 19 pages, and every one of the 24 notes is on the page of its mark by `pdfjs-dist` page text.
- The bound of 8 was met with 4 passes on this corpus. No Done-when item had to be weakened.
- Cost of the construction: the reservation is the same on every page (the tallest footer's), because react-pdf takes one `paddingBottom` per `Page` and its splitter breaks every page at that one height. On this corpus the manuscript grows from 12 to 19 pages and pages with few notes carry blank space above the footer. Reserving per page would need a different construction (not tried). Stated as a measurement; whether it is acceptable is the owner's.
- Overlap is compared as layout boxes, as `task-57.md` did. Glyph overlap is not measured by any test.

## Failing before (measured)

1. `citations-pdf-layout-data-shape.test.ts`: written against `CompilePDFDocument.tsx` with the `onRender` prop temporarily reverted to the committed file. All 6 tests failed: `AssertionError: expected [] to include '_INTERNAL__LAYOUT__DATA_'` and `TypeError: Cannot read properties of undefined (reading 'type')` (no `onRender` call). Note the order: I had already written the one-line prop before the test; I restored the committed file to run the test, then put the prop back, and 5 of 6 passed; the sixth asserted a box on every node type, which the data does not give (some node type below a PAGE has no `box`), so it was narrowed to the `VIEW` and `TEXT` nodes the pass reads.
2. `compile-citations-core.test.ts`: first run, before any change to `compile-core.ts`: 25 of 25 failed, `CitationsUnavailableError: Citations are not available in this build.` (and a missing-`footnotes.xml` assumption in my own test, fixed: `docx` always writes an empty `word/footnotes.xml`, so the absent-option checks look for `w:footnoteReference` instead).
3. Later fixes were to the tests, not the code: a leaked `mockImplementation` (vitest 4 `restoreAllMocks` does not reset a `vi.fn(impl)`), the locked-project fixture writing through real `fs` instead of the storage adapter, and the page-of-mark search across a page break (a sentence split over a page puts "here." and its mark on the next page, behind the footer text of the previous one).

## What the tests cover

DOCX: footnote reference after the mark, note text with its italic run, cited text unchanged, bibliography after the manuscript; UTF-16 anchor offsets with `é日本😀` and `😀é` before the marks (and a note after `.` that follows a mark); the FR-16 marker for a removed Source (with a saved name and with none, "unnamed Source"), a Source missing a detail, and a Source with no fields; no bibliography or footnote when nothing is cited; a citation in a resource that is not compiled is not rendered; `section.unplaced` refuses naming the Source and the resource; the option absent never enters the seam; for both formats, a failed Source read, a failed sidecar read, a style-load failure, an engine failure and a bibliography engine failure each reject with a message naming what failed; a locked project raises `isLockedAccessError`; `fetch` is spied in the DOCX and PDF runs and never called. PDF: notes on the page of their marks with short notes and with the tall corpus; the two named failures (page counts, bound), missing layout data, and a missing mark.

## Commands and results (run from the package named)

| Command | Result |
|---|---|
| `frontend`: `pnpm exec vitest run tests/unit/compile-citations-core.test.ts tests/unit/citations-pdf-layout-data-shape.test.ts tests/unit/compile-citations-option.test.ts tests/unit/compile-citation-byte-identity.test.ts tests/unit/citations-module-off.test.ts tests/unit/compile-pdf-citations.test.ts` | 6 files, 138 tests passed |
| `frontend`: `pnpm test:ci` | 991 files passed, 13592 tests passed, 8 expected fail, 3 skipped |
| `frontend`: `pnpm typecheck` | no errors |
| `frontend`: `pnpm lint` | 0 errors, 459 warnings (the same count Task 61 recorded) |
| `electron`: `pnpm run typecheck` (`tsc --noEmit` and the worker project) | no errors |
| `cli`: `pnpm run typecheck` | no errors |

## Not verified

- Any `next build`, `build:native`, the Electron package, or hosted web: this ran in a worktree. In particular the `new URL("../citations/engine/hayagriva_wasm_bg.wasm", import.meta.url)` read in `compile-core.ts` was run under vitest only; whether the standalone file tracer carries the `.wasm` and the style assets (read through the Task 33 loader by working-directory path) is Task 52's check.
- The routes: `app/api/compile/{pdf,docx}/route.ts` were not changed (not in this task's Files), so a `CitationsCompileError` is not mapped to a status there and reaches the client as an unhandled error. The core's message names what failed; the route mapping is not done.
- Android and the browser PDF renderer: not changed, not run; no Android support is claimed. The layout data came from `renderToBuffer`; per the library source `onRender` is also called by `pdf().toBlob()`, not run.
- Glyph overlap, a manuscript with hundreds of notes, a mark wrapped across lines in a long paragraph with a footer on the next page, in-text styles in PDF (refused by name), and `omittedFromBibliography` (a cited Source the engine gave no bibliography text, for example an interview, is cited in its note and absent from the bibliography; nothing tells the writer).
- `compile-core.ts` grew by about 590 lines (after Prettier). A split into its own module would be tidier; the Files line names `compile-core.ts` only, so none was made.
