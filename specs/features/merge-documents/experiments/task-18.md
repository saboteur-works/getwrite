# Task 18: tree order and joint composition (pure, FR-3)

Implementation task; results below are measurements of the checks run, not explanations of cause.

## Files

- `frontend/src/lib/models/merge-compose.ts` (new): `orderAbsorbedDocuments`, `composeMergedDocument`, `MERGE_COMPOSE_FAILURES`.
- `frontend/tests/unit/merge-compose.test.ts` (new): 17 tests.

## Test-first

The test file was written first. Its first run, before `merge-compose.ts` existed, failed at import (`Test Files 1 failed, no tests`). After the module was written: `merge-compose.test.ts`, `split-core-import-graph.test.ts`, `merge-types.test.ts` run together: 3 files, 40 tests passed.

## Done-when clauses and the test pinning each

| Clause | Test |
|---|---|
| Absorbed ordered depth-first by folder then `orderIndex`, whatever the selection order | `orders depth-first by folder then orderIndex, whatever the selection order`; `orders siblings by orderIndex and not by array order` |
| Wherever the target sits | `orders without regard to where the target sits` (the target is not an input to the order) |
| Target's text first and unchanged | `keeps the target's text first and unchanged, with its ids` (input not mutated, no shared object) |
| Each joint exactly one empty paragraph; texts kept as stored; double blank | `puts exactly one empty paragraph at each joint...`; `keeps each text as stored: a double blank...` |
| Fully empty absorbed document: no joint, no content | `gives a fully empty absorbed document no joint and no content` (no content, whitespace, empty paragraphs, mixed) |
| No title, separator or other text | the joint test asserts every node is a paragraph and the texts are exactly `T, "", A, "", B` |
| Table, list, code block at either side of a joint | `joins correctly after and before a table, list or code block` |
| Fresh id for every id-bearing node of every appended text, nested included; disjoint; target ids unchanged; no `UniqueID` | `assigns a fresh id to every id-bearing appended node...` (8 appended ids, all distinct, none an old id); `makes appended ids disjoint when the documents share ids...` |
| Deterministic through the id source | `is deterministic through the id source`; `asks the id source again for an id already in use` |
| No I/O, no React/JSX; distinct failed outcome, never an empty result | `returns a distinct failed outcome when the id source cannot give an unused id`; `returns a failed outcome, never an empty document, for a text it cannot compose` (malformed doc, node, text; target gives `documentId: null`). Imports: `merge-types`, `split-cut` (`ID_BEARING_NODE_TYPES`), `types`, `uuid` only. |

Also tested: missing id, repeated id, an id inside a folder cycle each give a failed order result naming the document.

## Checks

- `pnpm typecheck` (frontend): clean.
- `pnpm lint` (frontend): 0 errors, 459 warnings (none in the new files: eslint on the two new files printed nothing).
- `pnpm typecheck` electron (both passes) and cli: clean.
- `tests/unit/split-core-import-graph.test.ts`: passes. It walks `split-*.ts` only, so `merge-compose.ts` is not walked by it as it stands; the module reaches `split-cut.ts`, which that test does walk.

## Assumptions

- Tree order treats folders and documents as siblings sorted by `orderIndex` (same walk as `folklore-narratives.ts`); ties keep input order.
- A target with no content still gets the joint before a non-empty absorbed text.
- Fresh ids avoid the target's ids and the absorbed texts' stored ids, so no appended id equals an id that stays on disk in an absorbed document.
- Id-bearing: the five types of `ID_BEARING_NODE_TYPES`, or any node already carrying a non-null `attrs.id`, as in `split-cut.ts`. A joint paragraph gets an id from the source.
- A non-text node with no content (image) counts as content, so an absorbed document holding only an image is not empty.

## Not done / follow-up

- The import-graph test does not yet cover `merge-*.ts` files; extending it is outside this task's declared Files.
