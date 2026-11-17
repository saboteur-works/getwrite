# Task 6: FR-1 (i), TipTap cut points, marks and `UniqueID`

Measurement only. No production file, `package.json` or lockfile was edited. The probe was a temporary vitest file in `frontend/tests/` (jsdom), run with `pnpm --filter getwrite-frontend exec vitest run <probe file>` from the repository root and deleted afterwards; `git status --short` was empty after deletion. Environment: node v24.15.0, pnpm 10.28.0, `@tiptap/core` and `@tiptap/extension-unique-id` 3.26.1, vitest 4.1.6.

## Contradicts the spec

One reading in the spec does not hold as written.

- OQ-3 and FR-3 ask for "fresh `UniqueID`s on moved nodes" and say FR-1(i) measures whether the extension does that. Measured: the extension does not refresh the id of a node that already has one. A cut copies the node attributes, so the nodes cut through, and every node kept whole in the second half, carry the same `attrs.id` as in the original. Loading that half into a new editor leaves them unchanged (observations U3, U4). The extension generates an id only for a node whose `attrs.id` is null, or, in a live editor, for the second node when a block is split inside the editor (U6, U7). A cut made on stored JSON, with no editor, is not touched by the extension at all. If FR-3 needs fresh ids in the new document, the split code has to remove or regenerate `attrs.id` on the moved half itself (the strip-then-load run, U5, gave 8 non-null ids in the new document of which none equal an original id).
- Not a contradiction but a trap for Tasks 12 and 18: ids are assigned by a timer after the editor is constructed, not at construction (see "Probe notes").

Nothing else read in the spec was contradicted. Facts below are labelled observed; no cause is claimed unless an experiment separated it.

## How the cuts were made

Schema: `baseSchemaExtensions` from `frontend/components/Editor/editorExtensions.ts` plus `CustomHeading` (as `frontend/src/lib/export/markdown-serializer.ts` builds it), loaded into a headless `Editor`. A marker character in the text gave the cut position; the marker was deleted, then the position `pos` was cut three ways on the resulting document:

- A: `doc.cut(0, pos)` and `doc.cut(pos)` (ProseMirror `Node.cut`).
- B: `tr.delete(pos, end)` for the first half and `tr.delete(0, pos)` for the second.
- C: `doc.slice(pos, end)` (open depths recorded).

Notation below: `type#uN` is a node with `attrs.id` labelled in order of first appearance within the case, `null` is a missing id, `{annotation:a1}` is a text run carrying that mark. A and B gave the same structure in every case except where noted; C gave the same content as A with the open depth shown.

## Cut points (observed)

The loaded document always had one extra empty `paragraph` appended after a last node that is not a paragraph (heading, list, table, code block, blockquote, image). It is present in the loaded value of each case, not in the JSON given to the editor.

| Case | First half (A) | Second half (A) | Notes |
|---|---|---|---|
| Inside a paragraph, `Hello wor¦ld there` | `paragraph#u1("Hello wor")` | `paragraph#u1("ld there")` | C open depth start 1. Both halves hold id u1. |
| Inside a heading, `Head¦ing` | `heading#u1("Head")` | `heading#u1("ing") paragraph#u2()` | Heading keeps its level; id u1 in both. u2 is the trailing paragraph. |
| Inside the 2nd of 3 list items | `bulletList(li#(u1 "one") li(u2 "tw"))` | `bulletList(li(u2 "o") li(u3 "three")) paragraph#u4()` | The list wrapper is kept in both halves, the cut item exists in both halves, id u2 in both. `listItem` has no id. C open depth start 3. |
| Inside a parent item that holds a nested list | `bulletList(li(p "par"))` | `bulletList(li(p "ent" bulletList(li(p "child")))) paragraph` | Nested list goes wholly to the second half. |
| Inside a table cell (2x2) | `table#u1(tableRow(tableCell(p#u2 "ce")))` | `table#u1(tableRow(tableCell(p "ll a") tableCell(p "cell b")) tableRow(tableCell(p "cell c") tableCell(p "cell d")))` plus trailing paragraph | First half is a table of one row with one cell; second half is a table with the full 2x2 grid, the cut cell holding the tail. Both halves hold the table id u1 and the cell paragraph id u2. A and B agree. |
| Inside a code block, `line1\nli¦ne2` | `codeBlock#u1("line1\nli")` | `codeBlock#u1("ne2") paragraph#u2()` | id u1 in both. |
| Inside a blockquote, first of two paragraphs | `blockquote#u1(p#u2 "quo")` | `blockquote#u1(p#u2 "te one", p#u3 "quote two") paragraph#u4()` | Blockquote wrapper kept in both; ids u1 and u2 in both. |
| Block boundary, cursor at the end of paragraph 1 | `paragraph#u1("first")` | A: `paragraph#u1() paragraph#u2("second")`; B: `paragraph#u2("second")` | A leaves an empty leading paragraph in the second half carrying the original paragraph's id; B (`tr.delete(0, pos)`) does not. |
| Block boundary, cursor at the start of paragraph 2 | `paragraph#u1("first") paragraph#u2()` (both A and B) | `paragraph#u2("second")` | An empty trailing paragraph stays in the first half carrying the id of paragraph 2. |
| Next to a block image, cursor at the end of the paragraph before it | `paragraph#u1("before")` | A: `paragraph#u1() image() paragraph#u2("after")`; B: `image() paragraph#u2("after")` | The image goes to the second half. |
| Next to a block image, cursor at the start of the paragraph after it | `paragraph#u1("before") image() paragraph#u2()` | `paragraph#u2("after")` | The image stays in the first half with an empty trailing paragraph. |
| Image inside a paragraph | not loadable | not loadable | The schema reports `image` with `isInline=false`. A paragraph holding an inline image in JSON failed to load in the probe (`Invalid content for node paragraph`, `Called contentMatchAt on a node with invalid content`), so there is no inline-image cut to record. An image is a sibling block, as in the two rows above. |

Observed consequences for the halves: a cut through nested structure (list, blockquote, table) keeps the open ancestors in both halves, and the node holding the cursor appears, truncated, in both. An image carries no `id` (`image()` in every output).

`UniqueID` is configured for `paragraph`, `heading`, `blockquote`, `codeBlock`, `table` only (read back from the extension options in the probe). `listItem`, `bulletList`, `tableRow`, `tableCell` and `image` have none.

## `annotation` marks (observed)

Cut with A. Ids are the mark attribute `id`; `collectAnnotationMarkIds` (`frontend/src/lib/models/annotation-mark-ids.ts`) was run on each half's JSON. "Reloaded" is each half's JSON loaded into a new editor and read back with `getJSON`.

| Case | First half | Second half | Marked text (whole / first / second) |
|---|---|---|---|
| Spans the point, `[a1: bb¦cc]` | `"aa " "bb"{a1}` | `"cc"{a1} " dd"` | `bbcc` / `bb` / `cc`; id a1 in both halves |
| Ends at the point, `[a2: abc]¦def` | `"abc"{a2}` | `"def"` (no mark) | `abc` / `abc` / empty; id a2 only in the first half |
| Starts at the point, `abc¦[a3: def]` | `"abc"` (no mark) | `"def"{a3}` | `def` / empty / `def`; id a3 only in the second half |
| Two overlapping ids, a4 and a5 on `xx¦yy`, a4 also on ` zz` | `"xx"{a4,a5}` | `"yy"{a4,a5} " zz"{a4}` | a4: `xxyy zz` / `xx` / `yy zz`; a5: `xxyy` / `xx` / `yy` |
| Same id a6 on two separate runs either side of the point | `"ab"{a6} " "` | `" " "cd"{a6}` | `abcd` / `ab` / `cd`; a6 in both halves |
| Mark a7 at the end of paragraph 1 and the start of paragraph 2, cut at the boundary | `paragraph("one " "two"{a7})` | `paragraph() paragraph("thr"{a7} "ee")` | `twothr` / `two` / `thr`; a7 in both halves |
| Mark a8 across two paragraphs, cut inside the first | `"one " "t"{a8}` | `paragraph("wo"{a8}) paragraph("three"{a8})` | `twothree` / `t` / `wothree` |
| Mark a9 across two list items, cut in the second item | `li("one"{a9}) li("t"{a9})` | `li("wo"{a9})` | `onetwo` / `onet` / `wo` |

Observed in all eight cases: the cut text node is split into two text nodes that each carry a copy of the mark with the same `id`; so a mark that spans the point, or an id on two runs on either side of it, appears in both halves with one id. A mark that ends at the point stays only in the first half and one that starts at it only in the second. Reloading each half into a new editor kept every mark id (`reloaded first ids`, `reloaded second ids` equal the ids of the A halves in each case). `removeMark(0, end, annotation)` over a whole document left no annotation id (`removeMark(annotation) over whole doc leaves ids=[]` in each case); that is the transaction form for stripping marks of annotations not carried.

Stored `quote`: the quote lives in the sidecar, not in the document. The cut reads and writes no sidecar. For the spanning case, the marked text of the original was `bbcc` and of the first half `bb`; a stored quote of the whole passage would therefore be longer than the text its mark covers in the original after the cut. This is a comparison of the two strings measured here; no code in the probe touched a sidecar.

## `UniqueID` (observed)

Observations on a document with heading, paragraph, list, blockquote, code block, table and image, loaded with no ids in the JSON (U0), then used as below.

- U0: ids appear after load only for the types listed above (`heading#u1`, `paragraph#u2`, list item paragraph `#u3`, `blockquote#u4`, its paragraph `#u5`, `codeBlock#u6`, `table#u7`, cell paragraph `#u8`, trailing paragraph `#u9`); `listItem`, lists, `tableRow`, `tableCell`, `image` none.
- U1: the same JSON, now carrying ids, loaded again gave identical JSON (`reloaded same JSON gives same ids: true`).
- U2: two paragraphs given the same id `DUP` in the JSON loaded as `DUP | DUP | <a generated id for the third>`; a duplicate id in one document is not repaired at load.
- U3: the second half of a cut inside `para one`, `doc.cut(pos)`, kept ids u2 (the cut paragraph), u3 to u9 (every later node): the same ids as the original.
- U4: that half loaded into a new editor read back with the same ids (u2 to u9).
- U5: the same half with `attrs.id` removed from every node, loaded into a new editor, read back with new ids on all eight id-bearing nodes (`ids in stripped-then-loaded half that also occur in the original: 0 of 8`).
- U6: `splitBlock` (the Enter command) inside a paragraph in a live editor gave the original id to the first paragraph and a new id to the second.
- U7: `tr.split(4)` on a paragraph in a live editor gave two paragraphs with ids; the probe did not print the id of the paragraph before the split, so it does not show which of the two kept it.
- U8: `editor.commands.setContent(secondHalfJson)` on an existing editor kept the ids carried by the JSON.
- Not run: paste and drop into the editor. The extension source (`@tiptap/extension-unique-id`) registers `handleDOMEvents.paste` and `drop` and a `transformPasted` that removes ids; that was read in the source and not exercised, so it is a reading.
- The extension did not repair the case where a cut leaves the same id on both the first-half and second-half paragraph, because the two halves are in different documents; within one document (U2) it did not either.

## Probe notes (things that bounded the measurement)

- `UniqueID.onCreate` ran after a timer, not at construction. In a first run that read the document immediately after construction, most nodes showed `null` ids and only nodes touched by the marker-deletion transaction had ids. The recorded values above come from the second run, which waited 20 ms after constructing each editor. Any code or test that builds an editor and reads ids at once will see nulls.
- Two editors built for the two inline-image cases (invalid content) raised an uncaught `RangeError: Invalid content for node type paragraph` from `UniqueID` `createIds` after the test, reported by vitest as 2 unhandled errors; the three probe tests passed. These are the editors built from invalid JSON, so the error is expected from the input; no other editor produced one.
- Not measured: a cut made without an editor (a hand-written JSON cut), the mapping from a plain-text offset to a ProseMirror position (`offset-resolver.ts`), table and code-block cuts through the real command palette or menu, a cut through a node with `GetWriteParagraphLeading` or `textAlign` attributes, the effect of a cut on `textStyle` marks, and a document of hundreds of thousands of words.

## Test and build status

No production code changed. Typecheck, lint and Electron/CLI typecheck were not run (no file under `frontend/src/lib/models/`, `cli/` or `electron/` was touched). The only run was the throwaway probe described above, which passed (3 of 3 tests; 2 unhandled errors as noted).
