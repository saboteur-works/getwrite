# Indexing feature

Overview

The project includes a simple per-project full-text indexing system to enable fast search across resources. The index is incremental, persisted under the project's `meta/index/` directory, and is updated whenever resource content or metadata changes.

Key components

- `frontend/src/lib/models/inverted-index.ts`
  - Implements the inverted index data structure persisted as `meta/index/inverted.json`.
  - API:
    - `indexResource(projectRoot, resource)` — index a single resource (adds/updates postings).
    - `removeResourceFromIndex(projectRoot, resourceId)` — remove a resource from the index.
    - `search(projectRoot, query)` — simple term-frequency based search returning ranked resource ids.
  - Tokenization: lowercased, split on non-alphanumeric characters; only `[a-z0-9]` tokens are kept.
  - Ranking: sum of term frequencies across query terms, ties broken by higher freq for the first query term then lexicographic id.

- `frontend/src/lib/models/indexer-queue.ts`
  - Background FIFO queue that processes indexing tasks sequentially to avoid concurrent FS stress.
  - API:
    - `enqueueIndex(projectRoot, resourceId)` — enqueue a resource for indexing (non-blocking).
    - `flushIndexer(timeout?)` — wait for the queue to drain (useful in tests to avoid teardown races).
  - When processing tasks, the queue attempts to obtain canonical plain text from (in order): resource persisted content, tiptap content (converted to plain text), last revision content fallback.

- `frontend/src/lib/models/meta-locks.ts`
  - A lightweight per-project promise-chain lock to serialize writes to the `meta/` directory. Used to avoid races where multiple writers create/remove files concurrently.

Triggers / wiring

Indexing is triggered in the following places:

- After revision creation (revision manager enqueues the resource id).
- After resource saves (e.g., `persistResourceContent` enqueues indexing dynamically).
- After sidecar writes (`writeSidecar` enqueues indexing dynamically).

To avoid circular imports, enqueues are performed via dynamic `import()` calls.

Persistence

- Index file: `<projectRoot>/meta/index/inverted.json`
- Backlink index: `<projectRoot>/meta/backlinks.json`
- Entity mention index: `<projectRoot>/meta/index/mentions.json` (see [Entity mentions](#entity-mentions) below)

## Backlinks

The backlinks system maintains a cross-reference index: for each resource, it records which other resources link to it.

**What it tracks**

- Wiki-style links: `[[Resource Name]]` or `[[resource-slug]]` or `[[uuid]]` inside resource content
- Raw UUIDs embedded anywhere in the resource text
- Aliases defined in the resource's sidecar (`aliases` field)
- `resource-ref` / `multi-resource-ref` sidecar field values, detected structurally by `extractSidecarRefIds` (any `{ id, name }` shape or array of them) — scanned at the sidecar's top level and one level down under `sidecar.userMetadata`, since that's where user-defined metadata fields live

**`BacklinkIndex` type**

```ts
type BacklinkIndex = Record<string, string[]>;
// { resourceId: [referencedResourceId, ...] }
```

Each key is a resource UUID; its value is the list of resource UUIDs that the key resource links to (outgoing links). To find all resources that link _to_ a given resource, scan all values for that ID.

**Resolution order** (for `[[...]]` targets)

1. If the target is a UUID, use it directly
2. Check `meta/redirects.json` for slug/alias redirects
3. Match by `slug` from sidecar
4. Match by `name` (case-insensitive) from sidecar
5. Match by `aliases` array from sidecar
6. Slugify the target string and match by slug

**API** (`frontend/src/lib/models/backlinks.ts`)

| Function                               | Description                                                        |
| -------------------------------------- | ------------------------------------------------------------------ |
| `listResourceIds(projectRoot)`         | Lists resource UUIDs from `resources/` directory                   |
| `computeBacklinks(projectRoot)`        | Scans all resource content and builds the full `BacklinkIndex`     |
| `persistBacklinks(projectRoot, index)` | Writes `meta/backlinks.json` under meta lock (write only)          |
| `updateBacklinks(projectRoot, change)` | Loads, changes and saves `meta/backlinks.json` under one meta lock |
| `loadBacklinks(projectRoot)`           | Reads `meta/backlinks.json`, returns `{}` if absent                |

**Live updates** (`frontend/src/lib/models/backlinks-watcher.ts`)

`backlinks-watcher.ts` watches the project's resource files for changes and triggers `computeBacklinks` + `persistBacklinks` on updates. This keeps `meta/backlinks.json` in sync without requiring a full rebuild on every read.

**Storage**: `<projectRoot>/meta/backlinks.json`

## Entity mentions

Separate from backlinks (explicit `[[wiki-link]]`/UUID references), the entity mention index tracks resources whose prose _mentions_ a declared entity by name or alias, without an explicit link. A mention is detected, never authored; an explicit link is authored, never detected. The two are computed and stored independently and are only merged for display (see below) — never conflated into one record.

**What it tracks**

- A resource becomes an entity by setting `entityKind` (an open string, e.g. `"character"`, `"place"`) on its sidecar, optionally with an `aliases` array of alternate names.
- `frontend/src/lib/models/entity-detection.ts` scans other resources' persisted plain text for case-insensitive, word-boundary occurrences of an entity's name/aliases, including possessive (`Aria's`) and simple plural (`Arias`) forms.
- `frontend/src/lib/models/entity-alias-table.ts` builds the per-project table of every entity's matchable terms and flags terms claimed by more than one entity as ambiguous.
- `frontend/src/lib/models/entity-noise-check.ts` (`checkNoiseFlag`, renamed from `entity-alias-warnings.ts`'s `getAliasWarning`) is a non-blocking heuristic (never rejects a name or alias) that flags a short or noise-prone term — against a bundled frequency word list plus a project's own custom/global noise-word lists — as noise-prone. It now applies identically to an entity's `name` and its `aliases`, not aliases only. A writer can dismiss the observation per entity/term (persisted on the sidecar's `dismissedNoiseTerms`). See the "Entity mention noise flagging" glossary entry in `CLAUDE.md` for the full account.

**`MentionIndex` type** (`frontend/src/lib/models/mention-index.ts`)

```ts
type MentionIndex = Record<string, MentionRecord[]>;
// { resourceId: [{ entityId, resourceId, count, offsets }, ...] }
```

Keyed by `resourceId` so a resource's own mentions are a direct lookup; `invertMentionIndex` flips it to `entityId -> MentionRecord[]` for an entity's own "mentioned in" view.

**Reads** (`frontend/src/lib/models/mentions-core.ts`) — transport-agnostic, read-only (never triggers detection):

- `getResourceMentions(projectRoot, resourceId)` — which entities a resource mentions.
- `getEntityMentionedIn(projectRoot, entityId)` — which resources mention an entity, one snippet per occurrence, merged with the entity's explicit `linkedFrom` backlinks (a resource that is both linked and mentioned appears once with both flags set) and annotated with ambiguity when another entity's alias claims the same occurrence.
- `getProjectMentionCounts(projectRoot)` — per entity, its prose-occurrence total and the number of distinct resources those occurrences span (for the entity roster).
- `getEntityCooccurrence(projectRoot)` — for every declared entity, every other declared entity it shares at least one resource with by detected mention, with the shared-resource count and ids. Computed only from `MentionRecord`s grouped by `resourceId`; never reads `backlinks.json` and never merged with `getEntityMentionedIn`'s output, so an explicit link with no corresponding mention does not count. Same-resource is the whole unit — a mention's offset is not consulted. Pairs are unordered and non-reflexive; an entity with no shared resource is omitted entirely.

**Wiring**: `indexer-queue.ts` detects mentions on the normal per-resource save path, plus a targeted rescan of every resource whenever an entity's `name`/`aliases`/`entityKind` changes (so other resources are re-matched against the updated terms). `getwrite-cli reindex` rebuilds the mention index from scratch alongside the inverted index and backlinks.

**Storage**: `<projectRoot>/meta/index/mentions.json`

Testing and determinism

- `flushIndexer()` is exported and used in unit tests to wait for background indexing to complete before test cleanup (this avoids `ENOTEMPTY` directory errors on some platforms).
- Meta writes are serialized via `withMetaLock(projectRoot, fn)` to avoid concurrent write/remove races during tests and runtime. The mention-index and backlinks removal writers, `runTask`'s mention step and the entity-rescan writer load, change and save under one lock (`updateMentionIndex`, `updateBacklinks`); `runTask`'s backlinks step, importers, `reindex` and the backlinks watcher lock only the write (`persistBacklinks`), and a `computeBacklinks` recompute is not atomic: a removal that lands between its scan and its write is undone (measured 20 of 20, a known gap). See [project-configuration.md](./project-configuration.md).

Developer notes

- `flushIndexer()` uses a short polling loop with a configurable timeout; it's intended for tests and developer tooling, not for production control flows.
- If you need stronger guarantees in production (fsync or durable write semantics), consider adding explicit `fsync`/`fdatasync` after writes and handling graceful shutdown of the queue.

How to use the APIs

- Enqueue indexing (non-blocking):

```ts
import indexer from "../lib/models/indexer-queue";
indexer.enqueueIndex(projectRoot, resourceId);
```

- Wait for indexing to finish (tests / tooling):

```ts
import { flushIndexer } from "../lib/models/indexer-queue";
await flushIndexer(); // optional timeout: await flushIndexer(3000);
```

Maintenance

- To rebuild a project's inverted index, backlinks, and entity mention index from scratch (after bulk filesystem changes that bypassed the save path, or to recover from a corrupted/stale index), run the `reindex` CLI command: `getwrite-cli reindex [projectRoot]`. See [docs/features/cli.md](./cli.md).
- The index format is intentionally simple (JSON). For larger projects or better performance, consider moving to a binary/LMDB-backed store or using a search engine (e.g., SQLite FTS, Tantivy, or Elastic).
- Keep the tokenization and ranking logic in `inverted-index.ts` consistent with search UI expectations.

Contact

- For questions about design decisions, see `specs/002-define-data-models` and the commit history on branch `002-define-data-models`.

## TODO

- Replace `flushIndexer()` polling with a promise-based signaling mechanism.

  What: implement a completion signal in `frontend/src/lib/models/indexer-queue.ts` (for example an internal promise or EventEmitter-based API) that resolves when the queue has finished processing the currently enqueued tasks. Export a `waitForDrain()` or similar API consumers (tests and tooling) can call instead of polling.

  Why: polling adds latency and relies on timeouts which can mask races or cause flaky tests on slow CI. A promise-based signal is deterministic, faster, and eliminates the need for arbitrary timeouts, improving test stability and making shutdown semantics clearer.

## Proposals

- Promise-based drain signal

  What: replace `flushIndexer()` polling with a deterministic `waitForDrain()` API (e.g. an internal promise or EventEmitter) that resolves when the queue has finished processing currently enqueued tasks. Export this API for tests and tooling.

  Why: eliminates polling/timeouts, yields deterministic synchronization for tests and shutdown flows, reduces CI flakiness and wasted wait time.

- Durable meta writes (fsync)

  What: after writing key meta files (index, backlinks, templates), optionally perform an `fsync`/`fdatasync` on the file descriptor before closing to ensure data is flushed to disk.

  Why: reduces risk of data loss on sudden crashes and makes integration tests behave more deterministically across platforms. Note: this increases latency and should be configurable.

- Graceful indexer shutdown

  What: add an explicit shutdown/flush method for the indexer queue that stops accepting new tasks, finishes in-flight tasks, and signals completion. Integrate this with application lifecycle hooks (e.g. before-exit).

  Why: avoids data races and incomplete writes when the app is stopped or during test teardown; it's more explicit and safer than relying on ad-hoc waits.

- Optional backend/search engine migration

  What: evaluate replacing the JSON index with a more scalable store (SQLite FTS, Tantivy, or an external search service) for larger datasets.

  Why: a JSON file works for small projects but will become slow and memory-heavy at scale. A proper search engine will provide better performance, advanced queries, and durability guarantees.

Annotation bodies (Feature 101)

- A second term source, persisted as `meta/index/annotations.json` in the same shape as `inverted.json`. `runTask` indexes the sidecar `annotations` bodies with the text; an annotation write enqueues an index task; `reindex` and the three importers call the shared `rebuildDerivedIndexes` (`lib/models/derived-index-rebuild.ts`), which drops the file and rewrites it from every stored body (Feature 103). Before that, `reindex` left the file as it found it. The same function does not rebuild `meta/index/diagnostics.json` (deferred, OQ-11; why it was left out is not established). On a locked project the rebuild fails with the locked-access error instead of indexing nothing. `searchAnnotationBodies` (`inverted-index.ts`) reads it. A body-only term is absent from `inverted.json` and from `search()`. See [annotations.md](./annotations.md).

Per-document update after a split (Feature 120)

Spec: [specs/features/split-at-cursor.md](../../specs/features/split-at-cursor.md) (FR-9, OQ-10, OQ-11). Records: `specs/features/split-at-cursor/experiments/task-4.md`, `task-16.md`, `task-17.md`, `task-22.md`, `task-29.md`.

`enqueueIndex` cannot report a failure: `runTask` catches and logs each step's error, and its promise also resolves after 5 s whether or not the work ran (task-4 F8, F9, F12). `rebuildDerivedIndexes` covers the whole project and does not touch diagnostics (task-4 F5). A split needs the indexes of two documents brought up to date, and a failure reported, so it has its own function.

- `updateDocumentIndexes(projectRoot, documentIds)` in `split-index-update.ts`: awaited, returns `{ outcome: "updated", documentIds }` or `{ outcome: "failed", failures: { documentId, step }[] }`. The steps are `read-content`, `read-sidecar`, `inverted-index`, `annotation-index`, `backlinks`, `mention-index` and `diagnostics`, and every step is attempted after an earlier failure so the result lists all of them. A document whose text or sidecar cannot be read is a failure, never an empty document. Mentions are recomputed from each document's own text, not copied. The backlinks step recomputes over the whole project, as `enqueueIndex` does (task-4 F4), so a backlinks failure names every document in the set. It does not call `rebuildDerivedIndexes` and does not use `withIndexingSuspended`. The caller establishes the storage context (task-17).
- `applySplit` runs it after commit, awaited and outside the rollback, with the original and the new document. A failure does not undo the split. The outcome is `index-failed`, carrying the failure list and the writer message. The split's snapshot, new document, truncation and both records stay in place (task-22).
- `wordCount`: neither `enqueueIndex` nor `rebuildDerivedIndexes` writes the sidecar `wordCount` (task-4 F3). The split writes the original's in its no-log truncating write (task-16) and the new document's after commit, as `countWords(tiptapToPlainText(text))` through `mutateSidecar`, before the index update; a failed write of it is reported as the `word-count` failure (task-22).
- What `reindex` repairs (Owner decision, Gate 5): after an injected failure in each of `inverted-index`, `annotation-index`, `backlinks` and `mention-index`, `rebuildDerivedIndexes` (all that `reindex` runs) gave those four indexes equal to a rebuild of an untouched copy, compared as parsed values with sorted keys; file bytes differ only in key order (task-4 F2, task-17). It does not repair prose diagnostics: after a failed `diagnostics` step the rebuild left no record for the new document, and `enqueueIndex` for that document, which a save triggers, wrote one (task-17, task-22). `reindex` is not extended to rebuild diagnostics. So the failure message says that `reindex` repairs search, note search, links and mentions, and that prose diagnostics refresh the next time the document is saved (draft text in `split-messages.ts`, owner wording review pending).
- Undo split runs the same function for the original only, after commit, and reports `index-failed` with the failure list and no split-specific text (task-29).

Not measured: whether the mention-index and backlinks writes interleave safely with a background `enqueueIndex` of the same project running at the same time (task-17); an encrypted project; several server instances.

Per-document update after a merge and Undo merge (Feature 121)

Spec: [specs/features/merge-documents.md](../../specs/features/merge-documents.md) (FR-12). Records: `specs/features/merge-documents/experiments/task-27.md`, `task-38.md`.

A merge uses the same awaited per-document update as the split, not a whole-project reindex.

- `applyMerge` (`merge-core.ts`) calls `updateDocumentIndexes` after commit and after the latest-operation record is written, outside the rollback, with the target and each absorbed document whose sidecar or text changed (task-27: one call, ids `[target, absorbed document that lost a note]`, spy on `rebuildDerivedIndexes` not called). The inverted index, annotation-body index, backlinks, mentions (recomputed, not copied) and diagnostics reflect the target when `applyMerge` resolves (task-27). A link in an appended passage resolves from the target, a link to an absorbed document still resolves, and the absorbed document stays in search and keeps its mentions (task-27).
- `wordCount`: the target's is written by the merge's no-log text write, as `countWords(tiptapToPlainText(text))` (task-27, true already from task-25).
- A failed update leaves the merge applied and returns `index-failed` naming the failing steps, with no `failedStep`; the compensation of task-26 is not run (task-27). The text (`MERGE_INDEX_FAILURE_MESSAGE`) says `reindex` repairs the search index, the notes search index, links and mentions, and that prose diagnostics refresh the next time the document is saved.
- What `reindex` repairs: after an injected `inverted-index` failure the four index files of a rebuild of the failed project equal those of a rebuild of a copy, compared with sorted keys. That compares a rebuild with a rebuild of the same files, as the split test does; `reindex` was not run as the CLI (task-27). A failed `diagnostics` step is not repaired by the rebuild and the next save writes it (task-27).
- The merge does not await the indexer queue's background drain. Measured (task-27, 5 runs on a fresh project each, documents of 5000 words, 3 and 25 documents): the index files were the same right after the merge returned and after the drain; the drain after the return was 26 to 27 ms at 3 documents and 388 to 431 ms at 25. Not supported: the same at the roughly 8 s drain at 50 documents recorded in `task-13.md`, whose cause was not established, with annotations or entities, or when a background task fails (the failure is logged and swallowed by `enqueueIndex`).
- Undo merge runs the same function after commit for the target and each absorbed document that was not skipped, and reports `index-failed` with the failure list (task-38, `undoLatestMerge`; its test with an injected `updateDocumentIndexes` failure shows the failure reported without undoing the Undo).

Not measured for a merge: the same interleaving of the mention-index and backlinks writes with a background `enqueueIndex` (the split's record names it, task-17; the merge records did not run it); an encrypted project; several server instances; an index failure thrown, not returned, by `updateDocumentIndexes` (task-27).
