# Task 12: what compile and annotation marks give PDF and DOCX; PDF byte reproducibility (FR-3 (e), (f))

Read-and-probe. No production or existing test file was edited. Probes were two throwaway vitest files
(`frontend/tests/unit/zz-task12-probe.test.ts`, `zz-task12-dump.test.ts`) that had to live in the repo tree to
resolve the `@/` and component imports; both were deleted before this file was written (`git status` shows only this
file). Output was appended to a scratchpad file, `console.log` being swallowed by the test setup. Run with
`cd frontend && pnpm exec vitest run <probe>`. Packages: `@react-pdf/renderer` 4.5.1.

## (e) What a compile gets today

### Source reading (files read)

- `frontend/src/lib/export/section-loader.ts` `loadTextSections(projectPath, resourceIds, resources, toSection)`:
  keeps ids whose `ResourceMeta.type` is `text` or `source` in the requested order, calls
  `loadResourceContent(projectPath, id)` per id, and passes `(meta, content)` to `toSection`.
- `frontend/src/lib/tiptap-utils.ts` `loadResourceContent` returns `{ tiptap?: TipTapDocument; plainText?: string }`.
  `tiptap` is `JSON.parse` of `resources/<id>/content.tiptap.json`; `plainText` is `content.txt`, or
  `tiptapToPlainText(tiptap)` when `content.txt` is unreadable. A locked-access error is rethrown; any other failure
  reading the tiptap file is swallowed (the `tiptap` key is then absent).
- `frontend/src/lib/models/compile-core.ts`: `compilePdfCore`, `compileDocxCore` and `compileTextCore` call
  `loadTextSections` with `toSection = (meta, { plainText }) => ({ name, content: plainText ?? "" })`, so the
  TipTap document is discarded for PDF, DOCX and TXT. `compileMarkdownCore` takes `{ tiptap }` instead.
- `frontend/src/lib/export/CompilePDFDocument.tsx`: renders `<Text>{section.content}</Text>` as one string per
  section. `CompileDocxDocument.ts`: `section.content.split("\n")`, one `Paragraph` with one `TextRun` per line.
  Neither takes marks, offsets or a sidecar. The sidecar `annotations` array is not read anywhere under
  `src/lib/export/` or by `compile-core.ts` (grep for "annotation" in those paths: no match).
- `frontend/tests/unit/compile-citation-byte-identity.test.ts` pins that a document carrying an `annotation` mark
  compiles identically to the plain one in txt, md, docx and pdf. It compares PDF as ordered per-page extracted text
  (`tests/helpers/pdf-text.ts`), not raw bytes.

### Probe: `loadResourceContent` and `loadTextSections` on a document with annotation marks

Document: paragraph with `quick` carrying `annotation {id:"A1"}`; level-2 heading; bulletList item with a `bold` mark;
paragraph with `Second ` carrying annotations A2 and A3 and `end` carrying A3. `content.txt` deliberately absent.

- `Object.keys(await loadResourceContent(...))` = `["tiptap","plainText"]`.
- `plainText` = `"The quick brown fox.\nHead\nitem\nSecond end"`.
- `JSON.stringify(tiptap).includes('"annotation"')` = `true`: the marks reach the loader.
- `loadTextSections(..., [RID, "nope"], [meta], (m, content) => ...)`: `toSection` received `content` with keys
  `["tiptap","plainText"]`; the unknown id `nope` produced no section (one section returned).

### Where an annotation mark's text and range end are available

- Available today inside the loader callback, not yet used by PDF or DOCX: `content.tiptap`, in which each text node
  carries `marks: [{ type: "annotation", attrs: { id } }]`. A mark covers the text of the node(s) carrying it; a range
  may span several adjacent text nodes (A3 above spans `Second ` and `end`), so the end of a range is the end of the
  last consecutive text node with that id within the block. The mark's text is the concatenation of those nodes' `text`.
  Overlapping marks sit on the same node (A2 and A3 on `Second `).
- `plainText` carries no mark information. Its derivation (`tiptap-text.ts` `tiptapToPlainText`) concatenates text
  nodes and adds `\n` after each `paragraph` and `heading` only; it adds nothing between list items, table cells or
  `hardBreak`, as the probe output shows (`"Head\nitem\nSecond end"`: the list item's paragraph newline is the only separator).
  A character offset in `plainText` therefore does not correspond one-to-one to document structure.
- Consequence for Tasks that place a footnote or marker: PDF and DOCX would need `toSection` to take `tiptap` (as
  Markdown does) or a pre-walked structure; the rendered `section.content` string alone cannot locate the end of a mark.
  This is an observation about what is available, not a design choice.

### TipTap node and mark types a compile would meet

Probe: `getSchema([...baseSchemaExtensions, CustomHeading.configure({}), Math])`, the same set the Markdown serializer uses.

- Nodes (18): `paragraph`, `doc`, `hardBreak`, `horizontalRule`, `text`, `blockquote`, `bulletList`, `orderedList`,
  `listItem`, `codeBlock`, `table`, `tableCell`, `tableHeader`, `tableRow`, `image`, `heading`, `blockMath`, `inlineMath`.
- Marks (9): `link`, `textStyle`, `bold`, `code`, `italic`, `strike`, `underline`, `highlight`, `annotation`.
- A `wikiLink` and the editor-only extensions add no node or mark names in this schema set.

## (f) PDF byte reproducibility with a fixed creation date

Method: `CompilePDFDocument({ sections, includeHeaders: true })` returns a `<Document>` element;
`React.cloneElement(el, { creationDate: new Date("2026-01-01T00:00:00Z") })` sets the prop that
`@react-pdf/renderer` reads (`creationDate = new Date()` default in `lib/react-pdf.js`, line 151). Rendered with
the shipped `renderPdfOnServer` after `registerIBMPlexFonts()`. Input: one section, two lines.

Observed:

- Fixed date, same input, rendered twice: SHA-256 `8eb0f738...` vs `b7bcca4d...`; `Buffer.compare` = 1; both 40107 bytes.
  The raw bytes are NOT identical.
- Five fixed-date renders of the same input: 5 distinct SHA-256 values.
- A second pair (one line of text, dumped to the scratchpad as `pdf-a.pdf`, `pdf-b.pdf`): `cmp -l` reports 36 differing
  bytes. `strings` diff shows every difference is the 6-letter font subset tag in `/FontName` and `/BaseFont`:
  `GJKCQD+IBMPlexSans-Bold` vs `TDNYZP+IBMPlexSans-Bold`, and `ONXYEV+IBMPlexSerif-Regular` vs `VTDLXE+IBMPlexSerif-Regular`.
  `/CreationDate` is `(D:20260101000000Z)` in both. The trailer `/ID` is identical in both
  (`2080cf55055dd0bc97f18ae5d59fd11a`) and, in the first pair, identical within each file.
- Default date (not fixed), rendered 1.1 s apart: SHA-256 differ (`identical = false`), sizes equal at 40107 bytes.
- `compilePdfCore` as shipped, 1.1 s apart: not identical. Back to back: not identical. `compilePdfCore` offers no way
  to fix the date, and the subset tag differs even back to back.
- Non-vacuity: changing one letter in the input (fox to fax) with a fixed date gives a different hash (`true`).
- `extractPdfPageTexts` on the fixed-date PDF returned `["Ch\nThe quick brown fox.\nSecond paragraph."]`.

What this does and does not establish: fixing `creationDate` does not make two renders byte-identical in this
environment; the differing bytes seen are the font subset tag. The cause of the random tag (which library generates it)
was not isolated by an experiment here (reading `@react-pdf/pdfkit` or pinning a seed would settle it).

### Decision for Task 25

Compare PDF as ordered per-page extracted text (`tests/helpers/pdf-text.ts` `extractPdfPageTexts`), not raw bytes. Raw
byte comparison would fail on identical input. This matches the existing comparison in
`compile-citation-byte-identity.test.ts`. Keep its non-vacuity check (a one-letter change must differ in extracted text).

## Not verified

- DOCX byte reproducibility was not probed (outside the task's (f)); the existing test compares entry names and
  `word/document.xml` text.
- Behaviour of `renderPdfInBrowser` (browser build) was not probed.
- No sidecar-annotation read was probed, because no compile path reads sidecars.
