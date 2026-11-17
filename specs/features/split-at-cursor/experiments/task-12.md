# Task 12: pure document cut (FR-3, text half)

Files: `frontend/src/lib/models/split-cut.ts`, `frontend/tests/unit/split-cut.test.ts`. Environment: node v24.15.0, pnpm 10.28.0, vitest 4.1.6.

## Tests first, failing run

Command: `pnpm --filter getwrite-frontend exec vitest run tests/unit/split-cut.test.ts`, run before `split-cut.ts` existed.
Output summary: 1 test file failed, "no tests" (the import of `../../src/lib/models/split-cut` could not be resolved), exit code 1.

## Green run

After implementing, the same command plus `tests/unit/split-core-import-graph.test.ts`: 2 files passed, 30 tests passed (25 in `split-cut.test.ts`, 5 in the import-graph test).
One test failed on the first green attempt: a list-item case in which the test expected the cut at plain-text offset 5 to leave `one\ntw`. The offset was wrong in the test (`one\n` is 4 units, so offset 5 gives `one\nt`); the test was corrected to offset 6. The implementation was not changed for that.

## Checks

- `pnpm typecheck` (frontend): no errors.
- `pnpm lint` (frontend): 0 errors; the warnings listed are in other files; the two new files were also linted alone with eslint, no output.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): ran, no errors.
- `pnpm --filter getwrite-cli typecheck`: ran, no errors.

## Choices and what they rest on

- Id source: `generateUUID` from `frontend/src/lib/models/uuid.ts` is the default, overridable by the `generateId` option. Read in `frontend/components/Editor/editorExtensions.ts`: `UniqueID.configure({ types: [...] })` sets no `generateID`; the extension's source in `node_modules/@tiptap/extension-unique-id/dist/index.js` defaults it to `uuid`'s `v4`. `generateUUID` also makes a v4 UUID, imports no React, DOM or `node:*`, and falls back when `crypto.randomUUID` is absent (as over plain HTTP). A test asserts the default ids match the v4 pattern.
- Id-bearing types: `paragraph`, `heading`, `blockquote`, `codeBlock`, `table` (the `UniqueID` types), plus any node that already carries a non-null `attrs.id`. A test reads `editorExtensions.ts` and compares its type list with `ID_BEARING_NODE_TYPES`. Ids are assigned in pre-order. An id the source returns that already appears in the original document, or was already issued, is asked for again (up to 16 attempts per id); after that the cut fails with `id-source-exhausted`.
- Offset: a plain-text offset counted as `tiptapToPlainText` counts it (text characters, plus one unit after each paragraph and heading). Valid range `0` to the plain-text length.
- Block boundary: the end of a block's text and the position just after its line break give the same cut, with no empty paragraph in either half (the editor-side `doc.cut` in `task-6.md` left one; that is not reproduced here). A block with no text (an image) at the cut goes to the second half. Because plain text has no unit for an image, a cut before and a cut after an image in plain-text terms are the same offset; the image is placed in the second half in both. A half that holds an image and no text is treated as not empty; a half with only whitespace or empty paragraphs is empty.
- Tables and code blocks: a cut strictly inside a table (any row or cell, including the end of the last cell's text) fails `cursor-in-table-cell`; strictly inside a code block fails `cursor-in-code-block`; a cut just outside them succeeds. The failure strings are those of `SPLIT_REFUSAL_REASONS`.
- `cutPosition`: the ProseMirror position of the cut in the original document. A test builds the original with the real editor schema (`getSchema` over `baseSchemaExtensions` plus `CustomHeading`) and compares `Node.cut(0, cutPosition).textContent` and `Node.cut(cutPosition).textContent` with the two halves' text, at every offset of a mixed document. Every half is also checked with `schema.nodeFromJSON(half).check()`.
- Marks are copied to both parts of a split text run and otherwise untouched; a test shows a spanning `annotation` mark in both halves with one id (Task 13 handles it).
- The function does not modify its input and shares no object with either half (tested).

## Not measured

- A cut through a node carrying `textAlign` or paragraph-leading attributes, an inline image (not loadable per `task-6.md`), a document of hundreds of thousands of words (timing), and `hardBreak` at the cut.
