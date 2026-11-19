# Task 2: FR-1 (a), (b), (c) and the version-number half of (g)

## Contradicts the spec

None found. Two readings in the spec are narrowed by measurement and are listed under "Notes for later tasks" below; neither makes the planned approach (flush, hash under the revision lock, no-log truncating write, snapshot under the lock) fail.

## Method

One throwaway Vitest file (`frontend/tests/unit/zz-task2-probe.test.ts`, node environment, run with `pnpm exec vitest run tests/unit/zz-task2-probe.test.ts` from `frontend/`: 1 file, 4 tests passed) drove the real model functions against a real temporary directory on the real filesystem adapter, with a seeded `project.json`, sidecar, `content.txt` (the text `SEED`) and `content.tiptap.json`. Results were written to a JSON file in the scratchpad. The file was deleted afterwards; `git status --short` was empty before this record was added and no production file, `package.json` or lockfile was edited. Documents are one paragraph of N words (`w0 w1 ...`). Node v24.15.0, commit 55dad987. The background indexer (`setImmediate` after each write) was allowed to run (150 ms settle) and its output was not inspected here (Task 4).

A caveat on every item: this is one run of each probe on one machine, in process, with one server-side process. The 200-trial race counts below are counts from one run, not rates.

## (a) Pending autosave and stale hash

Reading (source): `useCanonicalAutosave.ts` sends `patchRevisionContent(resourceId, projectId, revisionId, JSON.stringify(doc))`; the request carries the revision id and the content and no hash or version precondition. The server route (`app/api/resource/revision/[resource-id]/route.ts`) passes `content` straight to `updateRevisionInPlace`, which checks only that the revision exists and is canonical. A save is debounced 2500 ms; `registerSaveFlusher("queued", ...)` flushes the debounce and resends a failed doc; `flushPendingSaves` runs the `queued` stage, then the `source` stage, and resolves `false` if any tracked save rejected.

Observed (probe, `a`):

| Check | Observed |
|---|---|
| `updateRevisionInPlace` with a 40-word document over a 100-word one, then `updateRevisionInPlace` with the original 100-word text (a pending autosave firing after a truncation) | second write accepted; stored `content.bin` equals the 100-word text again (`true`) |
| SHA-256 of stored `content.bin` taken while holding `acquireLock("revision-content:<resolved root>:<resourceId>")` and compared with a hash taken before an intervening edit | differs, so the stale value is refused (`true`); a hash re-read under the lock matches itself (`true`) |
| `updateRevisionInPlace` started while that lock was held by the probe | not finished after 100 ms (`false`); finished after release (`true`) |
| Probe wrote a truncated document under the lock, released it, and the waiting autosave (old text) then ran | stored `content.bin` equals the old text (`true`) |
| `flushPendingSaves` with one `queued` flusher that tracks an 80 ms save | flusher ran once, resolved `true`, waited at least 70 ms |
| `flushPendingSaves` with a flusher that tracks a rejecting save | resolved `false` |

Fact: nothing on the server stops an autosave that was pending when a truncation ran from writing after it; a hash compared under the revision lock does refuse a stale value in the probe. The hash and comparison in the probe were written by this task (the feature does not exist yet), so this shows the mechanism works with the existing lock and file, not that the feature's route does. The client flush closing the gap relies on `flushPendingSaves` also covering the `source` (Markdown) stage; a failed save makes it return `false`, which the split host must treat as "do not split" (decision for Task 25).

## (b) Canonical-content writers on a truncation

Writers found by search of `src/`, `app/` (callers of `writeRevision`, `content.bin`, `persistResourceContent`, `setCanonicalRevision`): `updateRevisionInPlace` (revision route PUT/PATCH and `native-resource-backend.patchRevisionContent`, `native-revision-backend`), `createRevision` in `revision-core.ts` (revision route POST path and native backend), `createRevision` in `revision-manager.ts` (separate function, takes `acquireLock(resourceId)`, prunes, enqueues indexing), `setCanonicalRevision` (`revision-core.ts` wrapping `revision.ts`), and `writeRevision` itself (`project-creator`, `resource-initial-revision`, `resource-templates` and the three importers write a first revision at creation; the importers and creator write nothing later).

Probe `b`: a 100-word canonical `v-1` truncated to 40 words (survives 40%, 60 words lost) and to 70 words. Columns: writing-log entries appended (added/deleted), revisions after, `content.txt`, `content.tiptap.json` length (seeded as 474), sidecar `wordCount` (seeded 100), sidecar `updatedAt` changed.

| Writer | Writing log (40 / 70) | Revisions after, `*` canonical (40 / 70) | `content.txt` | `content.tiptap.json` | `wordCount`, `updatedAt` |
|---|---|---|---|---|---|
| `updateRevisionInPlace` | +0/-60 / +0/-30 | `v1*`, `v2` "Auto-backup before large deletion" (`automaticSnapshot: true`) / `v1*` only | rewritten (`len=149` / `len=269`) | rewritten (321 / 441) | 40 / 70; changed |
| `revision-core.createRevision` `isCanonical: true` | none | `v1`, `v2*` / same | untouched (`SEED`) | untouched (474) | 100; unchanged |
| `revision-core.createRevision` non-canonical | none | `v1*`, `v2` / same | untouched | untouched | 100; unchanged |
| `revision-manager.createRevision` `isCanonical: true` | none | `v1`, `v2*` / same | untouched | untouched | 100; unchanged |
| `setCanonicalRevision` to an older truncated `v2` | none | `v1`, `v2*` / same | untouched | untouched | 100; unchanged |
| `writeRevision` onto existing `v-1` | none | throws "revision directory already exists" | | | |

Facts: the automatic snapshot appears at 40 of 100 words and does not appear at 70 of 100, for `updateRevisionInPlace` only. The only writer that appends a writing-log entry, rewrites the derived files and updates `wordCount` and `updatedAt` is `updateRevisionInPlace`; a truncation through it logs deleted words. The other canonical writers leave `content.txt`, `content.tiptap.json`, `wordCount` and `updatedAt` as they were, so a truncation through them leaves the derived files describing the old text (observed: `SEED` and 474, `wordCount` 100 against 40 words in the canonical `content.bin`). `result.writingLog` was absent (no log trouble) in both `updateRevisionInPlace` runs.

## (c) `setCanonicalRevision` with body-less annotations, and a failure partway

Probe `c`. Setup: canonical `v1` (100 words), `v2` (30 words) whose text carries an `annotation` mark with id `ann-gone`, the sidecar `annotations` array empty; `setCanonicalRevision` to `v2`.

| Check | Observed |
|---|---|
| mark in `v2` `content.bin` before / after | present / absent (stripped, rewritten) |
| revisions after | `v1` not canonical, `v2` canonical |
| `content.txt`, `content.tiptap.json` (length), `wordCount`, sidecar `updatedAt` | all unchanged (`SEED`, 474, 100, unchanged) |
| `content.tiptap.json` contains `ann-gone` | no (it was never written from `v2`; the seeded file came from `v1`) |

Failure injection: a storage adapter wrapper (the real adapter with `writeFile` throwing on the k-th write to a `revisions/**/metadata.json`) around `setCanonicalRevision` to `v3` of three revisions (`v1` canonical at start). The loop in `revision.ts` writes metadata ascending by version.

| Failing write | Error | Revisions reading canonical afterwards |
|---|---|---|
| 1 (`v-1`) | injected, propagated | 1 (`v1`) |
| 2 (`v-2`) | injected, propagated | 0 |
| 3 (`v-3`) | injected, propagated | 0 |

Fact: a failure after the first metadata write leaves no canonical revision, with nothing written afterwards to repair it (the three-revision case only; the number of revisions at which a `repair` path exists was not measured; `repairMissingInitialRevisions` handles a missing `v-1`, not this state, per its description in `frontend/CLAUDE.md`, not tested here). Whether any caller resyncs the derived files after a restore was searched only for direct callers (the revision route, `native-revision-backend`, `revisionsSlice` thunk `setCanonicalRevisionForSelectedResource`); no resync was observed in `setCanonicalRevision` itself (above). What the client does after the thunk resolves was not read in this task.

## Version numbers (FR-1 (g), second half)

Reading: `createRevision` (core) calls `resolveNextVersionNumber` (list, then max+1) with no lock and then `writeRevision` (stat, create temp directory, rename). `updateRevisionInPlace` holds the `revision-content` lock but its snapshot also uses `resolveNextVersionNumber`, which is not covered by the other callers.

Method: 200 trials per pair, each a fresh resource, the two calls started together with `Promise.allSettled`, then the revisions listed. In the "destructive" pair, `updateRevisionInPlace` truncates 100 words to 5 so it takes the snapshot path.

| Pair | Both succeeded | Rejected | Trials with a repeated version number on disk |
|---|---|---|---|
| core `createRevision` + `updateRevisionInPlace` (snapshot path) | 199 | 1, `ENOTEMPTY` on the rename of the temp directory to `v-2` | 0 |
| core `createRevision` + core `createRevision` | 0 | 200 (one per trial), `ENOTEMPTY` rename onto `v-2` | 0 |
| core `createRevision` + `revision-manager.createRevision` | 0 | 200 (one per trial), `ENOTEMPTY` | 0 |

Fact: two callers can pick the same number; the second to rename fails loudly with `ENOTEMPTY` (not the "already exists" message, which no trial hit), and no trial left a repeated version number or lost a revision. The snapshot path with a concurrent `createRevision` collided once in 200 in this run. Cause of the difference in frequency between the pairs is not established.

## Notes for later tasks

- Spec reading "`updateRevisionInPlace` ... always calls `logCanonicalSave`": it appends nothing when the change adds and deletes no words (source, `revision-core.ts` `logCanonicalSave`); not exercised with an equal-word truncation here.
- Task 16 (no-log truncating write) must itself sync `content.txt`, `content.tiptap.json`, `wordCount` and `updatedAt`, because none of the other canonical writers measured does; and it must not produce the automatic snapshot-at-40% as a second revision unless intended (the split takes its own snapshot under the lock).
- A snapshot taken under the `revision-content` lock is not excluded from core `createRevision`, which takes no lock; the failure observed is a loud `ENOTEMPTY`, so Task 20/21 should handle that error as "retry or abort", not as silent corruption.

## Not run

No suite, typecheck or lint was run beyond the probe above (specification record only; no model file touched, so the Electron and CLI typechecks of the inherited rule do not apply).
