# Task 36: FR-12 footnote placement experiment

Run on 2026-11-15, Node v24.15.0, worktree base commit `0c549c27`. Test: `frontend/tests/unit/citations-footnote-placement.test.ts` (4 tests, a throwaway harness that calls the libraries `@react-pdf/renderer` 4.5.1 and `docx` ^9.6.1 directly; `CompilePDFDocument.tsx` and `CompileDocxDocument.ts` were not edited, and only `registerIBMPlexFonts` is imported from the former). PDF text is extracted per page with `frontend/tests/helpers/pdf-text.ts` (`extractPdfPageTexts`, `pdfjs-dist` legacy build). No fallback was built.

## What each renderer can do with notes (read from the source)

- `CompilePDFDocument.tsx` (140 lines): one `<Page size="A4">` holding one `<View>` per section, each with an optional header and one `<Text>` of the section's plain `content`. It takes `CompileSection[]` (name, content strings) and has no notion of a note, a mark, a run or a footer. `@react-pdf/renderer` exports no component whose name matches `/foot/i` (test 2 below). The library does offer a `fixed` prop and a `render({ pageNumber })` prop, used in the prototype.
- `CompileDocxDocument.ts` (84 lines): builds `Paragraph`/`TextRun` per line of `section.content` and a `Document` with one section; no `footnotes` option, no `FootnoteReferenceRun`. The `docx` library supports both (`new Document({ footnotes })` and `FootnoteReferenceRun`), used in the prototype.

## Observed values

Corpus: 3 resources ("Chapter 1" to "Chapter 3"), 8 notes each, 24 notes in all; each note is one paragraph with a reference token `[^NN]` and a note text `NOTE-NN Author, Title NN, 19NN.`.

| Test (name in the file) | Observed |
|---|---|
| corpus is large enough | 3 resources, 24 notes, 7 pages (6 page breaks); passes the "at least 20 notes, at least 3 page breaks" threshold |
| the library exports no footnote component | `@react-pdf/renderer` exports matching `/foot/i`: `[]` |
| PDF: each note's text is on the same page as its reference mark | pass 1 pages=7, pass 2 pages=7, notes=24, same-page=24, not-same-page=0 |
| DOCX: footnotes.xml present and each reference resolves | `word/footnotes.xml` present=true, `w:footnoteReference` elements in `word/document.xml`=24, note ids in `footnotes.xml`=26 (24 plus the two separator notes the library writes), unresolved references=0, notes with no reference=0, note texts missing from `footnotes.xml`=0 |

Result by format, by the observed values above:
- PDF: **pass** for this prototype (24 of 24 notes on the page of their reference mark, by ordered per-page extracted text).
- DOCX: **pass** (`word/footnotes.xml` present, 24 of 24 references resolve to a note). Page placement is left to Word and is not claimed; a DOCX was not opened in Word.

## How the PDF prototype is built (what the pass depends on)

`@react-pdf/renderer` has no footnote construction, so the passing PDF is a two-pass build, written in the test file:
1. Render the body with the reference tokens and no notes; extract per-page text; record the page of each token.
2. Render the same body with a `fixed`, absolutely positioned footer `<View render={({ pageNumber }) => ...}>` that draws the notes recorded for that page number.
Pass 1 and pass 2 both have 7 pages. The footer is absolutely positioned and reserves no space in the flow.

## Measured while building it (facts, no cause named)

- First run of the test file, before the harness drew anything in the footer's text: 3 passed, 1 failed; the PDF placement test reported not-same-page=24 (every note's text was absent from every page: `NOTE` occurred 0 times per page on 7 pages) although the footer's render function was called once per page with the expected note counts (2 calls per page, 2 to 4 notes). This is the failing result the file was written to produce; it is recorded here and not hidden.
- A probe (a scratch test, since deleted) with the production page style (`fontSize 11`, `lineHeight 1.8`, padding 72) and a one-line footer: footer text absent from the extracted text with the footer `View` carrying `lineHeight` 1 or 1.8 or nothing, present when `lineHeight: 1` was set on the footer's `Text`. With `padding: 72` alone, or `fontSize: 11` and `padding: 72` without `lineHeight`, the footer text was present on every page. The cause of the absence is not established. The experiment that would settle it: render one footer `Text` under a page with `lineHeight: 1.8`, with and without `lineHeight` set on the `Text`, and compare the page's content-stream text operators and the extracted text, to tell "not drawn" from "drawn and not extracted".
- The harness sets `lineHeight: 1` on each footer `Text`; the pass above is with that setting.

## Not measured (open before Task 42 relies on this)

- Overlap of the footer with body text. By the style values (at most 4 notes per page at 6 pt, `lineHeight` 1, bottom offset 12 pt, page bottom padding 72 pt) the footer sits inside the padding; this was not read from glyph positions in the output.
- Long notes (more lines than fit the padding), a note whose reference is in the last lines of a page, and a note text long enough to change the page count of pass 2 against pass 1. Notes here are one line each.
- Anything about the real compile path: `compilePdfCore`, TipTap input, the Hayagriva engine's runs, formatting runs (italic and the like) in note text, the browser renderer used on Android.
- DOCX in Word: whether Word shows each note on the page of its reference (left to Word by the requirement), and whether the engine's formatting runs fit `TextRun` in a note.
- Whether the owner accepts a two-pass construction as "PDF places the note on its page" (OQ-8 is the owner's, at Task 37). The PDF result is a pass by the Task 36 criterion for this prototype; it is not headed "Returns to the owner (OQ-8)" because the criterion was met, but the result still goes to Task 37 whether it passes or fails.

## Commands and results

| Command (from `frontend/`) | Result |
|---|---|
| `pnpm exec vitest run tests/unit/citations-footnote-placement.test.ts` (first run, JSX in a `.ts` file) | suite failed to transform (esbuild: expected ">"), 0 tests; fixed by `React.createElement` |
| same, second run | 3 passed, 1 failed (PDF same-page, 24 of 24 not on the page) |
| same, final | 4 passed |
| `pnpm typecheck` | pass (one `DocumentProps` error in the test file fixed first) |
| `pnpm exec eslint tests/unit/citations-footnote-placement.test.ts` | clean |
| Final-state note: the committed test asserts the pass results and contains no `it.fails`, because both formats met the criterion; if the owner later changes the construction and the PDF prototype stops passing, the test should become an `it.fails` with the observed values pinned. | |

Not run: `pnpm test:ci` (whole suite), `pnpm lint` (whole project, known to carry one error from Task 56's vendored glue per `task-32.md`), Electron and CLI typechecks (no files outside the test were changed).
