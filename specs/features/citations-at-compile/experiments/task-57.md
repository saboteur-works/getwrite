# Task 57: FR-12 PDF page-finding without text extraction (experiment)

Run on 2026-11-15, Node v24.15.0, `@react-pdf/renderer` 4.5.1, branch `feat/citations-at-compile` base `c6e1c304`. Test: `frontend/tests/unit/citations-pdf-page-finding.test.ts` (5 tests; a throwaway harness calling the library directly; `CompilePDFDocument.tsx` and every production file untouched). Command (from `frontend/`): `pnpm exec vitest run tests/unit/citations-pdf-page-finding.test.ts --silent=false --reporter=verbose` (values below are the `TASK57 <label>` lines it logs). The test was written first; on its first run all 5 passed, so there is no failing run to record (the assertions were pinned after the measured values were logged, as the values were not known beforehand; one earlier probe in a scratch test, since deleted, printed the shape of the layout data).

A construction using only shipped dependencies was found, so this record is not headed "Returns to the owner (OQ-8)".

## A. Facilities tried to learn a reference's page (test A1)

| Facility | What it returned / why unusable |
|---|---|
| `render` prop on a top-level `Text` | Called with `{pageNumber}` first and `{pageNumber, totalPages}` second (`[{"pageNumber":1},{"pageNumber":1,"totalPages":11}]`): two calls for one paragraph, so it reports the page of the whole `Text` node, never of a position inside its text. Its returned string is the content. Unusable for a mark inside a paragraph without splitting the paragraph. |
| `render` prop on a `Text` nested in a `Text` | Called 12 times (`[1,2,...,11,11]`, one per page plus a repeat, not once at the nested node's page); the returned text "NESTED" was extracted on no page (`nestedTextPresentOnPage: []`). Unusable. |
| `fixed` element with `render` | Called once per page per layout pass (`1..11` twice); gets only `pageNumber`; it is not told which references lie on that page. Usable to draw the footer (pass 2), not to find a page. |
| `Document` `onRender` | Called after layout with `{_INTERNAL__LAYOUT__DATA_}` (keys: `["_INTERNAL__LAYOUT__DATA_"]`), via `renderToBuffer` (and, per the library source, `pdf().toBlob()` too). The data is the laid-out tree: `DOCUMENT > PAGE[] > ... > TEXT` with `lines[].string` and `lines[].runs[]` (`start`, `end`, `attributes.fontSize`) and `box` per node. Usable: a mark `Text` given a distinctive `fontSize` (7) appears as a run, so its text and its page (index of the `PAGE`) are read with no PDF text extraction. |

Not tried: `ref`s, `debug`, `getRect`-style APIs (none found in the 4.5.1 exports read; the renderer source `lib/react-pdf.js` was read for `onRender`).

The name `_INTERNAL__LAYOUT__DATA_` marks the field as internal by the library's own naming; it is not documented API. Stated as a fact about the name, not as a finding about stability across versions (the version is pinned at 4.5.1 in `package.json`; no test run here covers a different version).

## B. Corpus and construction (test B1)

Construction: pass 1 renders the body (3 resources, 8 paragraphs each, each ending `Claim NN ends here.` plus a mark `Text` of font size 7) with `Document onRender`; the page of each mark run is read from the layout data; pass 2 renders the same body with a `fixed` footer `View` whose `render` draws the notes of that page. Only `@react-pdf/renderer` is used by the construction. `pdfjs-dist` is used only by the test's check.

B1 (footer with `lineHeight: 1` on each footer `Text`): `{"pass1Pages":8,"pass2Pages":8,"pdfjsPass2Pages":8,"notes":24,"marksFound":24,"sameLayoutAndText":24,"noteNotFound":0,"sameNotePage":24,"notSameNotePage":0}`

- 3 resources, 24 notes, 8 pages (7 page breaks).
- Notes on the same page as their reference (pdfjs text: page holding `Claim NN ends here.NN` against page holding `NOTE-NN`): 24; not on the same page: 0; note text not found: 0.
- Layout-data page of the mark equals the pdfjs-text page of the reference for 24 of 24.

## C. `lineHeight: 1` and page-count stability

Same construction, footer `Text` without `lineHeight: 1` (tests C1, C2):

- C1 (short notes): `"noteNotFound":24,"sameNotePage":0` , pass 1 = 8 pages, pass 2 = 8 pages. No note text was extracted on any page. The layout data's footer box top in that run was a large negative number on every page (`-29594` on page 1, growing to about `-4.5e16` on page 8), against `765` with `lineHeight: 1`. Stated as measured; the cause is not established. The experiment that would settle it: render one footer `Text` under a page with `lineHeight: 1.8`, with and without `lineHeight` on the `Text`, and compare the layout node's box and the content-stream text operators.
- So the construction as built needs `lineHeight: 1` on the footer `Text` in this harness (24 of 24 with, 0 of 24 found without; short and tall notes alike).

Page-count stability (pass 1 against pass 2, test C2 and B1):

| Case | pass 1 pages | pass 2 pages | pdfjs pages (pass 2) | notes on their reference's page |
|---|---|---|---|---|
| short notes, `lineHeight: 1` (B1) | 8 | 8 | 8 | 24 |
| tall notes (each about 14 extra sentences), `lineHeight: 1` (C2) | 8 | 8 | 8 | 24 |
| tall notes, no `lineHeight` (C2) | 8 | 8 | 8 | 0 found |

The footer is `position: absolute`, so it reserves no space; in these runs pass 2 never changed the page count. Footer box against the body box (layout data, box values, not glyph positions): short notes, footer top 765 against body box bottom 770 (5 pt overlap of boxes) on full pages; tall notes, footer top 603 on pages with 4 notes and 530 with more, against body box bottom 770 (up to 240 pt overlap of boxes on page 3 and 6). Whether glyphs overlap was not measured. This confirms the Task 42 note: no space is reserved for the footer, so the page-count check Task 43 must carry cannot detect a footer drawn over body text.

## D. Production imports of `pdfjs-dist` (test D1)

`{"imports":0,"files":[]}`: a walk over `frontend/src` and `frontend/app` found 0 files containing `pdfjs-dist`; the test also asserts `pdfjs-dist` is absent from `dependencies` and present in `devDependencies`. Cross-check: `grep -rn pdfjs-dist frontend/src frontend/app` (run by the lead if wanted).

## Not measured

- The construction inside `CompilePDFDocument.tsx` (not edited; it has no `onRender` prop, so Task 43 or a later task adds one or renders through `pdf()` directly).
- The browser renderer (`pdf().toBlob()`, Android): per the library source `onRender` is called there too; not run.
- Marks wrapped across a page boundary, a mark inside a long paragraph split over two pages (here each mark ends its paragraph), formatting runs in note text, notes that need more than the bottom padding (glyph overlap with body text).
- Stability of `_INTERNAL__LAYOUT__DATA_` across library versions.

## Commands and results (from `frontend/`)

| Command | Result |
|---|---|
| `pnpm exec vitest run tests/unit/citations-pdf-page-finding.test.ts` | 5 passed |
| `pnpm typecheck` | pass |
| `pnpm exec eslint tests/unit/citations-pdf-page-finding.test.ts` | clean |

Not run: whole-suite `pnpm test:ci`, whole-repo `pnpm lint`, Electron and CLI typechecks (no file under `src/lib/models`, `electron` or `cli` changed).
