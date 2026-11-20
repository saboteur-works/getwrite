# Task 19: annotation carry and mark strip (pure, FR-9)

Implementation task; the results are measurements of the checks run.

## Files

- `frontend/src/lib/models/merge-annotations.ts` (new): `partitionMergeAnnotations`, `groupAnnotationsForOffer`, `MERGE_ANNOTATION_FAILURES`.
- `frontend/tests/unit/merge-annotations.test.ts` (new): 13 tests.

Imports by reference, not edited: `annotation-mark-ids.ts`, `annotation-mark-strip.ts`, `annotation-validation.ts` (`ANNOTATION_LIMITS`), `merge-types.ts`. `split-annotations.ts` was read as a model only.

## Test-first

The test file was written first. Its first run, before the module existed, failed at import (`Test Files 1 failed, no tests`). After the module: `merge-annotations.test.ts` and `split-core-import-graph.test.ts` together, 2 files, 22 tests passed.

## Done-when clauses and the test pinning each

| Clause | Test |
|---|---|
| Chosen note, citation (with `target`) and claim (status and date) go to the target keeping id, body, target, claim; absent from the absorbed list | `moves a chosen note, citation and claim to the target unchanged` |
| Moved mark in the appended text; moved mark stripped from the absorbed stored text; no annotation id in both documents | `keeps a moved mark in the appended text and strips it from the absorbed text` |
| Unchosen stays in the absorbed list unchanged; its mark stripped from the appended text | `leaves an unchosen annotation in the absorbed list...`; `with no choice moves nothing...` |
| Handled the same whether or not a module is on | The function takes no module state and no config; the three kinds go through one path (first test) |
| Offered grouped by absorbed document and kind | `groups by absorbed document, then kind...`; `treats a claim with a target as a claim` |
| Over 500 on the target: refusal naming counts, before any write, nothing changed | `refuses over the limit naming the counts` (498 + 3: `{existing: 498, incoming: 3, limit: 500}`); `allows exactly 500` |
| Strip leaves every node id (and text) unchanged | `leaves every node id and text unchanged and does not mutate its input` |
| No I/O | Imports are `annotation-mark-ids`, `annotation-mark-strip`, `annotation-validation`, `merge-types`, `types` only; the input is not mutated (same test) |
| Case not covered returns failed naming the id | `fails naming an unknown chosen id`; `...chosen annotation with no mark`; `...id shared with the target`; `...absorbed list over the limit` |

## Checks

- `pnpm typecheck` (frontend): clean.
- `pnpm lint` (frontend): no errors; `eslint` on the two new files printed nothing.
- `pnpm typecheck` electron (both passes) and cli: clean.
- `tests/unit/split-core-import-graph.test.ts`: passes. It walks `split-*.ts` only, so `merge-annotations.ts` is not walked by it (same as noted in `task-18.md`); the import list above was checked by reading.

## Assumptions

- Kind: a claim is any annotation with `claim`; a citation has a `target` and no `claim`; a note is the rest. An attachment excerpt (a `target`, no mark by design) therefore counts as a citation, and choosing one fails with `chosen-without-passage` (no mark in the document) rather than being guessed.
- Any annotation id shared across the target list and absorbed lists fails as `duplicate-annotation-id`, chosen or not, because `task-6.md` L5 measured that no cross-resource check exists.
- The absorbed document's stored text is stripped of moved ids by keeping the marks whose ids are not moved. As `stripBodylessAnnotationMarks` defines it, an `annotation` mark with no string id is also removed from that text.
- The limit is checked after the structural checks, so a malformed input is reported as failed and a sound one over the limit as refused.

## Not measured

- A merge through the full core (Task 25); the composed target text, with marks, written to disk.
- Marks inside tables or on `textStyle` text, as in `task-6.md`.
