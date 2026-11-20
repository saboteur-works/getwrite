# Task 10: sample project generator, merge-specific coverage

Test tooling only (POS `task_23e9c7df`). Generated projects went to the OS temp directory; no real project and no `projects/` path was used; `package.json` and lockfiles are unchanged (`git diff --stat` on them prints nothing).

## What changed

- `scripts/sample-project/driver.ts` (a driver file inside `scripts/sample-project/`, allowed as in Task 9): adds a top-level folder "Merge checks" and the merge documents below, and a `merge` object in the JSON line.
- `scripts/sample-project/generate.mjs`: header comment only (names the new `merge` object); no behaviour change in the wrapper.
- `frontend/tests/unit/sample-project-generator.test.ts`: a `merge-specific coverage (Task 10)` block, one test per item.

The driver calls the real cores as in Task 9, plus `seedCompileExclusion` (compile exclusion), `uploadMediaResourceCore` (audio), `listRevisions`, and `writeMergedMark` from `merge-mark-core.ts` for the marked document. No merge core is called (none exists).

## Where each item is (names in the JSON line, `merge.<key>`)

| Key | Content |
|---|---|
| `crossFolder` | `selection` (3 docs in 3 sibling folders Cross A/B/C, selected C, A, B) and `treeOrder` (A, B, C); first selected is not first in tree order |
| `absorbedWithAnnotations` | "Absorbed with notes" (a note, a citation with a Source target, a claim) and its target "Absorb target" |
| `metadataDiffers` | 3 docs: status Draft/Final/Revising, themes (multiselect) all different, genre differing or absent |
| `emptyDocument` | text document with an empty paragraph, no annotations |
| `excludedTarget` | in `config.compileDefaults.excludedResourceIds` |
| `inboxTarget` | a text document inside the Inbox folder |
| `refusals` | `source` (existing Field notes), `entity` (Mara Venn), `folder` (Scenes), `image`, `audio` (new), `marked` |
| `markedDocument` | the marked document and the target it names |
| `timing` | folder "Timing 50", `fifty` (50 docs, 5000 words each), `ten` and `two` as prefixes of `fifty` |

## Marked document

`mergedMark` is written with `writeMergedMark` (real store), `targetSnapshotRevisionId` being the target's existing `v-1` revision id and `date` the run time. It is hand-written: no merge ran, so the snapshot is not a "Before merge" revision. README (Task 12) should say so and show how to make a real one after Task 25.

## Tests first

Tests were added before the driver change. First run: `Tests 10 failed | 26 passed (36)` (every new test failed with `Cannot read properties of undefined` on `summary.merge`). After the driver change one test still failed: `names a document already marked as merged` (`expected undefined to be defined`). The cause was in the test: `MERGED_MARK_SIDECAR_KEY` was imported from `merge-mark-core`, which does not export it (it is exported by `merge-types`), so the key was `undefined`. The "no mark" assertions in other tests passed vacuously in that run. Import fixed to `merge-types`; final run: `Tests 36 passed (36)`.

## Done-when clauses

| Clause | Verification |
|---|---|
| Cross-folder selection, first not first in tree order | test "names a cross-folder selection..." (3+ ids, 3+ distinct folders, eligible: text, no mark, no entity, `selection[0] != treeOrder[0]`, named tree order equals folder order as loaded) |
| Absorbed doc with note, citation, claim | test "names an absorbed document with a note, a citation and a claim" |
| Differing metadata incl. status and multiselect | test "names documents whose status and multiselect values differ" |
| Fully empty document | test "names a fully empty document" (content.txt blank, no annotations) |
| Excluded target; Inbox target | tests "names a target excluded from compile", "names a target in the Inbox" |
| Source, entity, folder; image, audio | tests "names a Source, an entity document and a folder for refusals", "names an image resource and an audio resource for refusals" |
| Already merged document | test reads it with the real `readMergedMark` (outcome `found`, target id, a snapshot id that exists among the target's revisions, a valid date) |
| 50 documents of about 5000 words, grouped 2/10/50 | test: 50 ids, `ten`/`two` prefixes, same folder, eligible, word count of `content.txt` within 4500 to 5500 (not in compile exclusions) |
| Task 9 assertions still pass | the 26 earlier tests, in the same run |
| typecheck, lint | `pnpm typecheck`: no error. `pnpm lint`: 0 errors (459 warnings repo-wide, none in the touched test file) |
| package.json, lockfiles unchanged | `git diff --stat` on both: empty |

## Not established

- `driver.ts` is outside `frontend/tsconfig.json`, so `pnpm typecheck` does not see it; it is checked only by the esbuild bundle running (esbuild does not type-check). Not separately run through `tsc` this time.
- Run time: the test file takes about 23 s in total here (generator runs several times, 50 large documents each); not timed per run.
- Word counts are those of the stored `content.txt`, not the app's `countWords`.
- Only text is synthetic; the 50-document group was not opened in the app or used for a merge.
