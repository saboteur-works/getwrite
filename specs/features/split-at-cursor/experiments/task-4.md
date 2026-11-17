# Task 4: FR-1 (f) and (l), derived indexes and word counts

Measurement task. No production file, test, `package.json` or lockfile was edited. Every probe ran from a throwaway vitest file and a generated project kept outside the repository; the probe file and its output are not part of this change. Source reading is labelled READ; everything else is an observed value with the probe that produced it.

## Contradicts the spec

One statement does not hold as worded; the planned approach still holds.

- Task 4's "Done when" and the Task 4 `What` text ask for "what neither updates (diagnostics)". Measured: `rebuildDerivedIndexes` does not update diagnostics (see F5), but `enqueueIndex` does write a diagnostics record for the document it indexes (F5, F6). The spec's own line (Derived indexes row) says only the rebuild "does not rebuild diagnostics", which agrees with the measurement. The per-document function of FR-9 (a new awaited function that also rebuilds diagnostics, OQ-11) is not contradicted: `enqueueIndex` still reports no failure (F8, F9) and so cannot serve, and the diagnostics step it runs is the one the new function would repeat.
- Nothing else measured contradicts the plan. Two facts the plan has to account for are listed under "Notes for later tasks".

## Environment and method

| Item | Command | Observed |
|---|---|---|
| node | `node --version` | v24.15.0 |
| pnpm | `pnpm --version` | 10.28.0 |
| commit | `git rev-parse HEAD` | 55dad987 (tip of the Task 1 close-out; worktree of `feat/split-merge`) |
| harness | `pnpm --filter getwrite-frontend exec vitest run --root <scratch dir> --config <scratch config>` with `globals: true`, `environment: node`, no `setupFiles` | 9 probe tests, 9 passed, 54.7 s wall |
| generated project | probe test "generates a 500-document project" | 500 resource directories, 500 sidecars (`meta/resource-<id>.meta.json`), each with `content.txt` and `content.tiptap.json`; 5 of them entities (`entityKind: "character"`, one with alias); 28 with annotations in the sidecar; some prose with double-quoted dialogue, `[[wiki]]` links and one raw UUID reference; plain text only, about 300 words per filler document |
| storage | probe | default Node filesystem adapter; every call that the production code makes inside a request is made inside `runForTenant(projectRoot, ...)` (`io.ts`) |
| indexer environment | probe prints `process.env.VITEST` | `true`, so `ensureBacklinkWatcher` in `indexer-queue.ts` returns without starting a watcher (READ at its top); the repository's own `tests/setup.ts` (lock-order guard) was not loaded |

Not measured: an encrypted project (locked-access errors), several server instances, a document of hundreds of thousands of words, a hosted deployment. Timings are one machine, one run of the probe, in a command sandbox; they are not benchmarks.

## (f) What each derived index holds for one document

The document D of the probe has four paragraphs, two annotations (one in each half), a `[[...]]` link in each half, and a mention of one entity in the second half. The probe:

1. ran `rebuildDerivedIndexes` (state S0);
2. ran `enqueueIndex` for D once on the unchanged document;
3. changed the stored files directly with `fs` (first two paragraphs kept in D's `content.txt` and `content.tiptap.json`; D's sidecar `annotations` reduced to the first annotation; a new document N written with the last two paragraphs, its own sidecar, the second annotation and `wordCount: 0`), calling no index function;
4. copied the project twice. Copy A: `enqueueIndex` for D and N, then `flushIndexer`. Copy B: `rebuildDerivedIndexes`.

No write in step 3 went through `persistResourceContent`, because that function itself schedules `enqueueIndex` (READ, `tiptap-utils.ts`, via `setImmediate`); see Notes for later tasks.

Observed per index, for D and N (term counts are distinct terms stored for that resource id):

| Index (file) | D after rebuild (S0) | D and N after the disk change, before any index call | After `enqueueIndex` for D and N (copy A) | After `rebuildDerivedIndexes` only (copy B) |
|---|---|---|---|---|
| Inverted (`meta/index/inverted.json`) | 30 terms, weight 51; both halves' marker terms present; title terms weight 10 each | D unchanged (30 terms, both halves' markers); N: 0 terms | D 15 terms, weight 33, only first-half marker; N 17 terms, weight 53, only second-half marker, title terms weight 10 | same values as A for D and N |
| Annotation bodies (`meta/index/annotations.json`) | 8 terms, from both bodies | D unchanged (still both bodies); N: none | D: terms of the first body only; N: terms of the second body only | same as A |
| Backlinks (`meta/backlinks.json`, keyed by the linking document) | D links to two documents | D unchanged (two links); N: no key | D: `[]`; N: one link; file 501 keys | same as A |
| Mention index (`meta/index/mentions.json`) | D: 1 record, 1 offset (188) | D unchanged; N: no key | D: no key (the entity name is in the second half); N: 1 record, offset 49 | same as A |
| Diagnostics (`meta/index/diagnostics.json`) | no key (file did not exist) | D unchanged | D and N both have records; D's `averageSentenceLength` 7.8 became 8.5 | D has the old record (7.8, unchanged by the rebuild); N has no key |
| Sidecar `wordCount` | D 39 | D 39; N 0 | D 39; N 0 | D 39; N 0 |

Facts, each from the probe above:

- F1. Nothing is updated by the disk change itself: after step 3 and before any index call the indexes hold D's old values and no values for N (table, third column).
- F2. After `enqueueIndex` for D and N (copy A) and after `rebuildDerivedIndexes` (copy B) the inverted index, annotation-body index, backlinks and mention index hold the same values for D and N. A byte comparison of the five index files between copy A and copy B printed false for the inverted index, annotation index and mention index; after sorting object keys (`JSON.stringify` of key-sorted values, run on the two copies' files) the inverted index, annotation index, mention index and backlinks compared equal, and diagnostics differed (copy A: 2 keys, copy B: 1 key). The byte difference of the first three is a key-order difference only, by that sorted comparison. A `reindex`-against-rebuild comparison (FR-9) therefore has to compare parsed values with sorted keys, not file bytes.
- F3. Neither `enqueueIndex` nor `rebuildDerivedIndexes` changed any sidecar `wordCount`: D stayed 39 and N stayed 0 on both paths, while `countWords` over the stored text is 17 for D's first half and 17 for N's second half (same probe, `countWords` called on the strings the probe wrote).
- F4. Backlinks hold a whole-project value: copy A's file went from 500 to 501 keys. READ (`indexer-queue.ts` `runTask`): every `enqueueIndex` task calls `computeBacklinks` over every document and rewrites the whole file, then catches and logs a failure of that step only.
- F5. Diagnostics. `rebuildDerivedIndexes` on a project with no `diagnostics.json` left no file (`existsSync` printed false after the rebuild); on a project whose file held one record it left that record unchanged after D's text changed (7.8 stayed). `enqueueIndex` created the file with one record for D on the unchanged document (rows "before" and "after enqueue on an unchanged document": absent, then present) and replaced D's record with a new value after the text changed.
- F6. What neither updates: neither updates a sidecar `wordCount` (F3). The rebuild does not touch diagnostics (F5). `enqueueIndex` is the only one of the two that writes diagnostics.
- F7. READ (`derived-index-rebuild.ts`, `inverted-index.ts`): the rebuild drops `meta/index/annotations.json` and rewrites it; `indexResource` and `indexAnnotationBodies` purge a resource id's postings before writing, so a removed term for D (second-half marker in the table) went away on both paths.

### Whether either reports a failure

All three probes below used copies of the generated project.

- F8. Corrupt sidecar (D's `meta/resource-<id>.meta.json` replaced by `{not json`):
  - `enqueueIndex` resolved normally (no rejection); one `console.error` line "[indexer-queue] task failed: SyntaxError ...".
  - `rebuildDerivedIndexes` rejected with the `SyntaxError` after two `console.error` lines ("sidecar of <id> unreadable: indexed under its id" and "annotation bodies ... not indexed"). That is, it reported failure by rejecting, after the inverted index and annotation index had already been rewritten (F10).
- F9. `meta/index/mentions.json` replaced by a directory (so its write cannot succeed), D's text changed to a new marker word:
  - `enqueueIndex` resolved normally. One `console.error` ("mention detection failed: ... EISDIR"). The inverted index did contain D's new marker, and diagnostics held a record for D. The only failed step was the mention update, and the awaited promise carried no sign of it.
  - `rebuildDerivedIndexes` rejected with the same `EISDIR` error and logged nothing. Before the rejection it had already rewritten the inverted index (D's new marker present) and backlinks (501 keys).
- F10. So a failed rebuild leaves earlier steps written and later steps not written; a failed `enqueueIndex` leaves the remaining steps written (F9). Neither run left a marker saying which step failed.
- F11. A stopped queue (`shutdownIndexer` called, then `enqueueIndex` for D after a content change): the promise resolved after 3 ms and the inverted index did not contain the new marker. READ (`enqueueIndex` top): it returns a resolved promise when stopped.
- F12. The 5-second resolve. With 150 other resources enqueued ahead of D (a project of 500 documents, then D enqueued last), D's promise resolved after 4999 ms; at that moment D's new marker was not in the inverted index; after `flushIndexer` it was, and the whole queue drained in 21655 ms (about 144 ms per task). So the promise can resolve before the work it stands for has run.
- Not measured: whether a locked project makes either function fail. READ: the rebuild rethrows `isLockedAccessError`; `runTask` in `indexer-queue.ts` wraps its body in a catch that logs and does not rethrow (the same catch that produced the single log line in F8). This was not run.

### Time on 500 documents

Wall time with `process.hrtime.bigint()` around each call in the probe; "resolve" is when the awaited promise settled, "drain" is when `flushIndexer` returned.

| Operation | Runs (ms) |
|---|---|
| `rebuildDerivedIndexes` on the 500-document project, four calls in a row | 1646, 3196, 3192, 3228 |
| `rebuildDerivedIndexes` on the copy with D and N changed (copy B) | 3392 |
| `enqueueIndex` for one document, five calls in a row, resolve / drain | 150 / 176, 202 / 228, 150 / 176, 151 / 177, 150 / 176 |
| `enqueueIndex` for D and N together (copy A), resolve | 301 |
| `computeBacklinks` alone, median of 5 | 98.5 |
| `buildEntityAliasTable` alone, median of 5 | 21.2 |
| `indexResource` for one document, median of 5 | 5.5 |

Observed: the resolve times of `enqueueIndex` are 150 ms or more in every run and its poll in the source is 50 ms (READ); the three step medians above sum to about 125 ms. No cause for the rise from 1646 ms (first rebuild) to about 3200 ms (later rebuilds) was tested.

## (l) The word counts available for a document

Probe "(l) word counts for one document": five documents written with `content.tiptap.json`, a `content.txt` taken from `tiptapToPlainText`, and a sidecar `wordCount` chosen by the probe (for the last case deliberately 99, to stand for a sidecar not rewritten after the text was cut). The columns are the figures each reader produces for that document.

| Case | `countWords(tiptapToPlainText(doc))` | sidecar `wordCount` as stored | `countWords(content.txt)` | `loadProjectFromDisk` resource figure | `getLocalResources` figure | whitespace split in `previews.ts` |
|---|---|---|---|---|---|---|
| plain paragraphs, 5 words | 5 | 5 | 5 | 5 | 5 | 5 |
| bare `-` and `#` tokens and a hyphenated word | 5 | 5 | 5 | 5 | 5 | 8 |
| code block followed by a paragraph | 3 | 4 | 3 | 3 | 4 | 3 |
| bullet list of three items | 5 | 5 | 5 | 5 | 5 | 5 |
| sidecar stale (text cut, sidecar 99) | 3 | 99 | 3 | 3 | 99 | 3 |

Facts:

- L1. The code-block case: `tiptapToPlainText` printed `"alpha betagamma delta"` (JSON-escaped, from the probe), so the last word of a code block and the first word of the next paragraph read as one word and the count is 3 where a reader of the page sees 4. READ (`tiptap-text.ts`): a newline is added after `paragraph` and `heading` nodes only. A list item contains a paragraph, so list items are separated.
- L2. `loadProjectFromDisk` (the figure that fills the Redux resource at project open) follows `content.txt`, and ignores the sidecar value (the stale 99 became 3). `getLocalResources` keeps the sidecar value whenever one is stored (99 and 4 above) and counts `content.txt` only when the sidecar has none (READ, `resource-persistence.ts`). The sidecar value is also what `goal-filtered-total-core.ts` sums (`userMetadata.wordCount ?? wordCount ?? 0`, READ) and what `sidecarToResourceBase` sets, which `deriveTextCounts` in `query-evaluate-core.ts` replaces with `countWords(content.txt)` when `content.txt` is readable (READ).
- L3. `previews.ts` counts with a bare whitespace split and so differs from `countWords` for documents with bare punctuation tokens (8 against 5).
- L4. Neither `enqueueIndex` nor `rebuildDerivedIndexes` writes `wordCount` (F3), so after a truncating write that does not itself write the sidecar the sidecar value stays at its old value (D: 39 against 17 counted from the stored text in the probe).

Where each figure is shown (READ, by search; no UI was run):

| Figure | Producer | Shown or used in |
|---|---|---|
| `countWords(tiptapToPlainText(editor doc))` | `EditView.tsx` (`useMemo`, lines 218 to 223) | the "Words:" figure in the editor footer; also the number `useCanonicalAutosave.ts` dispatches with `updateResource` after each save, which sets the Redux resource's `wordCount` |
| Redux resource `wordCount` (from `loadProjectFromDisk`, then `updateResource`) | `project-loader.ts`, `useCanonicalAutosave.ts` | Data view per-resource list and total (`DataView.tsx`, `userMetadata.wordCount ?? wordCount ?? 0`), Stub section (`StubResourcesSection.tsx`), sidebar word-count-goal section (`WordCountGoalSection.tsx`), Organizer card "Words:" (`OrganizerCard.tsx`), status roll-up (`status-rollup.ts`) |
| sidecar `wordCount` | written by `resource-persistence.ts`, `revision-core.ts` (`mutateSidecar` with the count from `syncDerivedResourceContent`), `resource-factory.ts`, `inbox-capture-core.ts` and the importers | `getLocalResources` (project listing), the goal total (`goal-filtered-total-core.ts`), `sidecarToResourceBase` |
| `countWords(content.txt)` | `project-loader.ts`, `query-evaluate-core.ts` | the resource list at project open, and smart-folder / query `wordCount` and `charCount` predicates |

The resource tree component directory (`components/ResourceTree`) contains no word figure (a search for `wordCount`, `isStub` and `words` there returned nothing). I did not find where the Start page shows a word figure: a search of `components/Start*` for `wordCount` and `words` returned only unrelated matches.

## Notes for later tasks

- `persistResourceContent` (reached by `syncDerivedResourceContent` in `revision-core.ts`, READ) schedules `enqueueIndex(projectRoot, resourceId)` with `setImmediate` after writing the two content files, outside any caller's await. A split that writes content through that path starts a background index of the document by itself, separate from the awaited per-document function of FR-9. Task 16 (the no-log write) and Task 22 (post-commit indexing) should read this before choosing which write function to call; this probe does not measure what the double indexing does.
- The rebuild is whole-project and takes about 1.6 to 3.4 s at 500 documents (time table above); one `enqueueIndex` is about 150 ms and its backlinks step reads every document (F4, 98.5 ms median at 500). A per-document function that wants to avoid the whole-project backlinks scan would have to update one key of `meta/backlinks.json` itself; whether that gives the same file as the scan was not tested.
- A `reindex`-against-rebuild comparison (FR-9) must compare sorted-key parsed values (F2).
- A rebuild failure and an `enqueueIndex` failure each leave earlier steps written (F9, F10). A "repairable by `reindex`" check should use a project where the failed step's file is not the one that `reindex` rewrites last.
