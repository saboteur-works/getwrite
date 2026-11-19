# Task 11: Eligibility function (pure, FR-2)

Files: `frontend/src/lib/models/split-eligibility.ts` (new), `frontend/tests/unit/split-eligibility.test.ts` (new). No other file edited; `split-types.ts` untouched. No `package.json` or lockfile change.

## Failing run (tests first)

Command: `pnpm --filter getwrite-frontend exec vitest run tests/unit/split-eligibility.test.ts`, with the test file written and `split-eligibility.ts` absent.
Result: 1 file failed, no tests ran: `Cannot find module '../../src/lib/models/split-eligibility'`. (A first attempt used an `@/` alias import that does not resolve in this repo, a test-file error; the imports were changed to relative paths like the other split tests, and the run above is the one with the module absent.)

## Green run

Command: `pnpm --filter getwrite-frontend exec vitest run tests/unit/split-eligibility.test.ts tests/unit/split-core-import-graph.test.ts`
Result: 2 files passed, 41 tests passed (36 in `split-eligibility.test.ts`, 5 in the import-graph test; the import graph now walks `split-eligibility.ts` as well). Re-run after the lint rename and after prettier formatting of the test file: passed.

## Checks

| Check | Command | Result |
|---|---|---|
| frontend typecheck | `pnpm typecheck` (frontend) | run, no errors |
| frontend lint | `pnpm lint` (frontend) | run; first run had 4 errors in `split-eligibility.ts` (naming-convention: boolean variables `before`, `after`), renamed to `hasBefore`, `hasAfter`; second run 0 errors, 459 warnings, none naming a `split-` file |
| prettier | `prettier --check` on both files | test file reformatted with `--write`; source file clean |
| electron typecheck (both tsc passes) | `pnpm --filter getwrite-electron typecheck` | run, no errors |
| cli typecheck | `pnpm --filter getwrite-cli typecheck` | run, no errors |

The full unit suite was not run.

## Design as built

- Input: `{ document, sidecar, offset }`; `document` may be null (media, folder). Pure, nothing mutated (asserted by a test). Types `SplitEligibilityInput`, `SplitEligibilityDocument`, `SplitEligibilitySidecar` are defined in `split-eligibility.ts`, because only Task 9 edits `split-types.ts`.
- Order of checks: media (`type` image or audio), folder, source, entity (non-empty `entityKind`), merged, then cursor location (`stale-cursor`), table cell, code block, empty first half, empty second half. The first applicable wins.
- `isMergedDocument(sidecar, key = MERGED_MARK_SIDECAR_KEY)`: true when the value under the key is neither undefined nor null; false for a sidecar without it. Tests substitute the key to prove the seam.
- Offset scheme: the stored plain text of `tiptapToPlainText` (text characters plus one newline after each paragraph and heading, wherever nested). The mirror is re-implemented here and not imported, because `tiptap-text.ts` imports the `./models` barrel and uses `any`. Not measured: agreement with `tiptapToPlainText` on a document by a test that calls both; the tests use hand-computed offsets.
- Cut points per `experiments/task-6.md`: allowed in paragraph, heading, blockquote and list-item text and at block boundaries and next to a block image; refused in table cells (`tableCell`, `tableHeader`, any `table`/`tableRow` ancestor) and code blocks.

## Decisions where task 6 or the spec is silent (recorded, not measured)

- An offset that is not a whole number, is negative, past the last text block, or a text resource with no document, returns the existing `stale-cursor` reason. No new reason was added.
- At a code block's end, where a following block starts at the same offset, the offset resolves to the code block and is refused as `cursor-in-code-block`.
- A table-cell ancestor is checked before the code-block rule (a code block inside a cell reports the table-cell reason).
- A block image counts as content of the half it falls in (an image-only half is not empty). The spec says only that whitespace and empty paragraphs count as empty. Task 6 recorded no inline-image cut (an inline image did not load), so inline images are not read.
- A node of an unlisted type that has text children is treated as a text block with no trailing newline; only paragraph and heading add one, as `tiptapToPlainText` does.

## Not covered

- Mapping the editor's cursor to this offset on the client, and the server's hash check, belong to later tasks (19, 20, 26).
