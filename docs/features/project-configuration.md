# Project Configuration (developer)

Purpose

This document explains the internal project configuration model used by the codebase and how developers can extend or integrate with it.

Location

- The project configuration file lives at the project root as `project.json`.
- Runtime loader: `frontend/src/lib/models/project-config.ts` (loads `project.json` and applies defaults).

Primary fields

- `id` (string, optional): project identifier. Generated when omitted.
- `name` (string): human-friendly project name.
- `description` (string, optional): a short description used in listings.
- `maxRevisions` (number, default 50): normalized into the project config (`project.ts`) but not read by any code path that prunes. `getwrite prune` takes `--max`; `revision-manager.ts` reads an option of the same name but has no caller outside tests. When pruning does run, protected non-canonical revisions are not counted toward the cap.
- `autoPrune` (boolean, default true): normalized into the project config but not read anywhere. It is an option on `pruneRevisions` only (`revision.ts`); no caller passes it from config.
- `config.dailyWordGoal` (integer >= 0, optional): the writer's daily writing goal, compared against today's non-import net words from the [writing log](./writing-log.md). Distinct from `config.wordCountGoal` (a separate config field, not changed by the daily goal). Set or cleared from Project Settings.
- `config.subtypes` (array of strings, optional): the project's ordered resource-subtype list (Feature 72). Omitted from `project.json` when never set. Replaced wholesale by `POST /api/project/features` (`updateFeatureConfig`, `project-features.ts`); blank entries and entries equal under trim-then-lowercase are rejected with HTTP 400. A project type may seed it on creation. See [resource-subtype.md](./resource-subtype.md).
- `meta` (object, optional): per-project meta options (e.g., paths or flags for previews/indexing). See examples below.

Meta/Derived storage

- Sidecars: `meta/resource-<id>.meta.json` (written by `writeSidecar()`)
- Index: `meta/index/inverted.json` (managed by `frontend/src/lib/models/inverted-index.ts`)
- Backlinks: `meta/backlinks.json` (managed by `frontend/src/lib/models/backlinks.ts`)
- Entity mentions: `meta/index/mentions.json` (managed by `frontend/src/lib/models/mention-index.ts`)
- Writing log: `meta/writing-log/YYYY-MM-DD.json`, one file per UTC day (managed by `frontend/src/lib/models/writing-log.ts`; see [writing-log.md](./writing-log.md))
- Templates: `meta/templates/<id>.json`
- Previews: `meta/previews/<resourceId>.json`

Concurrency and durability concerns

- All writers that modify files under `meta/` should use `withMetaLock(projectRoot, fn)` from `frontend/src/lib/models/meta-locks.ts` to serialize operations and avoid races.
- `project.json` has its own per-file lock, `withFileLock` in `frontend/src/lib/models/file-lock.ts`, separate from `withMetaLock` and `acquireLock`. A read-modify-write of `project.json` goes through `updateProjectJson` (`project-json-write.ts`), which reads, mutates and atomically writes inside that lock, so the read is never older than the previous locked writer's write. `metadata-schema.ts` uses `updateProjectJson` too, after `acquireLock(projectRoot)`. The file lock is always innermost: nothing (no other lock, no second file lock) is taken inside it. Allowed outer locks are `acquireLock(*)` and `withMetaLock`. A test-only guard (`lock-guard.ts`, installed from `tests/setup.ts`) and a source scan (`tests/unit/project-json-lock-scan.test.ts`) check this under test; production has no guard. `POST /api/project/features` replaces its blocks wholesale; see "Last-write-wins per block" below.
- **Mention index and backlinks (Feature 93).** `updateMentionIndex` (`mention-index.ts`) and `updateBacklinks` (`backlinks.ts`) hold `withMetaLock(projectRoot)` across load, change and save, writing through an unlocked save helper because `withMetaLock` is not reentrant (a test-only guard throws on a nested call for the same key). They are used by `removeResourceFromMentionIndex`, `removeResourceFromBacklinks`, `runTask`'s mention and backlinks steps and `rescanEntityAcrossProject`. `persistMentionIndex` and `persistBacklinks` still lock the write only; their callers (the Scrivener, DOCX and plaintext importers, the `reindex` CLI command, and the backlinks watcher) are unchanged and can still save an index loaded before another writer's save. A `computeBacklinks` recompute is not atomic: it reads every resource before the save, so it can still save an older result. Measured after the change (20 repetitions per pair): remove against `runTask`, remove against `rescanEntityAcrossProject`, rescan against `runTask` and `removeResourceFromBacklinks` against `persistBacklinks` lost 0 in natural and gated start modes; two `persistMentionIndex` callers lost in 20 of 20 and two `persistBacklinks` callers in 20 of 20; the watcher's save against `runTask` lost in 20 of 20 gated and 0 of 20 natural; `removeResourceFromBacklinks` against a `computeBacklinks` recompute lost in 20 of 20 in both modes. A 0 is a count for that construction only. Those pairs are pinned as known gaps (`it.fails`).
- Indexing runs asynchronously via the indexer queue: `frontend/src/lib/models/indexer-queue.ts`. Tests may call `flushIndexer()` to wait for the queue to drain.
- For operations that require durable writes (e.g., export/import workflows), consider performing an `fsync` on the file descriptor after `writeFile` (not currently enabled by default).

Last-write-wins per block (`POST /api/project/features`, Feature 93)

- The route takes up to four whole blocks (`features`, `relationshipTypes`, `subtypes`, `organizerCardBody`); an omitted block is untouched and at least one is required. Each block sent replaces the stored block. The route does not merge items inside a block.
- Between two devices (for example under home-network sharing) the newest write to a block wins, and an item added on the other device can be dropped. There is no version check and no conflict screen.
- From one window, an in-flight guard was added to two senders: `RelationshipTypesSettings` and `ProjectFeatureToggles`. While a save is in flight their controls are disabled and further edits are not queued. `SubtypesSettings` already had one (`isSaving`). Before the guards, two quick edits from one window were measured with a stubbed fetch against the real route: the stored block held both edits in 0 of 20 repetitions for both senders at both hold points. After the guards, a 20-repetition test per sender, again with a stubbed fetch, kept both edits in 20 of 20.
- `OrganizerCardBodySettings` has no guard (owner decision, 2026-10-24). Nothing else writes `organizerCardBody`, and each save sends the section's full current state, so a later save already carries the earlier edit. Measured with the same stubbed-fetch setup: at one hold point the stored block was the second edit's in 20 of 20 while the client store ended on the first edit's block in 20 of 20; at the other, the stored block was the first edit's, lacking the second, in 20 of 20. A guard disabled the length input during each save, which drops the following keystrokes, so it was reverted. Follow-up: save the length on blur or after a pause in typing, not on every keystroke.
- Editor config (`headings`, `body`) was measured in the shapes the modals send and did not reproduce a loss (0 of 20 for overlapping saves, 0 of 20 for an older copy); no code was changed, and that is not evidence the case is safe under other timing. A whole-copy `{headings, body}` request reverted `body` in 20 of 20; no sender uses that shape.
- Entity-graph settings (`PUT /api/project/entity-graph-settings`) send both `entityGraphConnectionTypes` and `entityGraphFocalHopRadius` on every request; an older panel copy reverted either key in 20 of 20 repetitions. Not fixed: an accepted follow-up (send only the changed key, or add a version check).

Schema and validation

- Runtime schema definitions live in `frontend/src/lib/models/schemas.ts` and are validated at load time. When adding new configuration keys, update the zod schema there and add unit tests.

Extension points

- Add new meta keys under `meta` and provide a clear default in the loader.
- If adding a new background task that writes into `meta/`, ensure it uses `withMetaLock` and (if necessary) enqueues indexing via dynamic `import()` to avoid circular imports.

Examples

Minimal `project.json`:

```json
{ "name": "My Project", "maxRevisions": 50, "autoPrune": true }
```

Advanced `project.json` (dev-friendly):

```json
{
  "id": "proj-abc",
  "name": "Novel Draft",
  "description": "A project for my novel",
  "maxRevisions": 100,
  "autoPrune": true,
  "meta": { "enablePreviews": true, "index": { "enabled": true } }
}
```

Testing

- Unit tests should mock filesystem through `frontend/src/lib/models/io.ts` where practical and call the loader to ensure defaults are applied.
- When tests touch `meta/` and background indexing may run, call the indexer `flushIndexer()` helper to avoid teardown races.

See also

- `frontend/src/lib/models/project-config.ts`
- `frontend/src/lib/models/schemas.ts`
- `specs/002-define-data-models/tasks.md`
