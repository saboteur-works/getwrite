# Revisions (developer reference)

This document covers the GetWrite revision system: on-disk layout, version numbering, the canonical invariant, pruning, the `preserve` flag, and soft-delete (trash). For the writer-facing guide to revisions in the app, see [docs/user/revisions.md](../user/revisions.md).

---

## On-Disk Layout

Each revision is stored in its own directory under the project root:

```
<projectRoot>/revisions/<resourceId>/v-<versionNumber>/
├── content.bin       — serialized content payload (UTF-8 text or TipTap JSON)
└── metadata.json     — revision metadata object (see fields below)
```

Writes are atomic: content and metadata are first written to a temporary directory (`revisions/<resourceId>/.tmp-<uuid>/`) and then atomically renamed into the final `v-<N>` directory. Partial writes are never exposed.

---

## Version Numbering

- Version numbers are sequential integers starting at `1`.
- The highest version number is the most recently created revision.
- When saving a new revision, the next version number is: `max(existing versionNumbers) + 1`, or `1` if no revisions exist yet.
- Version numbers are never reused after a revision is deleted.

---

## Revision Metadata Fields

Each `metadata.json` contains a `Revision` object:

| Field           | Type       | Description                                                                                                                    |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`            | UUID       | Stable revision UUID (not the same as versionNumber)                                                                           |
| `resourceId`    | UUID       | Resource this revision belongs to                                                                                              |
| `versionNumber` | number     | Sequential version number                                                                                                      |
| `createdAt`     | ISO string | When the revision was created                                                                                                  |
| `savedAt`       | ISO string | When the metadata was last written (updated on canonical set)                                                                  |
| `author`        | string?    | Optional author identifier                                                                                                     |
| `filePath`      | string     | Absolute path to `content.bin`                                                                                                 |
| `isCanonical`   | boolean    | Whether this is the currently canonical revision                                                                               |
| `metadata`      | object?    | Arbitrary key/value bag; `metadata.preserve = true` protects it from pruning and deletion; `metadata.name` is the display name |

---

## The `isCanonical` Invariant

**Exactly one revision per resource is canonical at any time.**

- When a project is created, the initial revision (v-1) is written with `isCanonical: true`.
- When `setCanonicalRevision(projectRoot, resourceId, versionNumber)` is called, it rewrites every `metadata.json` under `revisions/<resourceId>/`: the target version is set to `isCanonical: true`, all others to `isCanonical: false`.
- The Redux layer enforces this invariant client-side via `revision-canonical-guards.ts`, which provides `applyCanonicalRevision` (marks one entry canonical, clears all others) and `isStaleCanonicalUpdate` (guards against out-of-order updates).

The `revision-transport-service.ts` resolves revision operations through the transport seam (HTTP on web/desktop, in-process on native; ADR-021) and feeds normalized `RevisionEntry` objects to the Redux slice via `revision-normalization.ts`.

---

## The `preserve` Flag

Setting `metadata.preserve = true` on a revision marks it as protected (the UI calls this "Protected"). Protection has three effects:

- The pruning system never selects a protected revision for deletion.
- A protected non-canonical revision does not count toward `maxRevisions` (see Pruning), so storage per resource is unbounded if revisions keep being protected.
- `deleteRevision` refuses to delete it (FR-10, below).

Use it to protect milestone revisions (e.g., submitted drafts, chapter completions). `metadata.name` is the convention for a revision's display name (set when saving an explicit revision; `resolveRevisionDisplayName` falls back to `Revision v<N>`); setting or clearing `preserve` merges into existing `metadata` and leaves `name` and other keys untouched.

### `setRevisionPreserve(projectRoot, resourceId, revisionId, preserve)`

In `revision-core.ts`. Sets `metadata.preserve = true`, or deletes the `preserve` key when `preserve` is `false`, merging into the existing metadata and rewriting that revision's `metadata.json`. Works on canonical and non-canonical revisions, never changes `isCanonical`, and returns the updated `Revision`. Throws `Revision <id> not found.` for an unknown id.

### Delete refusal (FR-10)

`deleteRevision` throws `PROTECTED_REVISION_DELETE_MESSAGE` ("Protected revisions cannot be deleted. Unprotect it first.") when the target is protected. The DELETE route maps it to HTTP 400, and the UI shows it in the error toast.

### Transport and state

- `PATCH /api/resource/revision/[resource-id]` has a third mode, body `{ projectId, revisionId, preserve: boolean }`, which calls `setRevisionPreserve`. Sending both `content` and `preserve` returns 400, as does a non-boolean `preserve`. There is deliberately no generic `metadata` merge, so clients cannot write arbitrary keys such as `name`.
- The `RevisionTransport` method is `setPreserve`; the exported wrapper in `revision-transport-service.ts` is `persistRevisionPreserve(context, revisionId, preserve)`. The native backend calls `setRevisionPreserve` directly.
- The Redux thunk is `setRevisionPreserveForSelectedResource`; `RevisionEntry` carries `isProtected`, derived from `metadata.preserve`.

---

## Pruning

Pruning removes old revisions to enforce a `maxRevisions` cap.

**When it runs.** Only from the `getwrite prune` CLI command, via `pruneExecutor.ts` (its `--max` value, default 50, is passed straight through; `project.json` is not read). The other non-test caller of `pruneRevisions`, `createRevision` in `revision-manager.ts`, has no importer outside tests, and the app's own `createRevision` (`revision-core.ts`) does not prune. No code reads `config.maxRevisions` or `config.autoPrune` to drive pruning. This describes the code as measured, not observed at runtime.

### Selection rules (`selectPruneCandidates`)

Given all revisions for a resource:

1. Compute the count compared with the cap: all revisions minus protected non-canonical revisions. A protected canonical revision still counts.
2. If that count is at most `maxRevisions`, return nothing.
3. Exclude canonical revisions (`isCanonical: true`) and protected revisions (`metadata.preserve` truthy) from the candidates
4. Sort remaining by ascending `versionNumber` (oldest first)
5. Return the oldest `count - maxRevisions` entries

Worked example: `maxRevisions` 3, 6 revisions, 2 of them protected, canonical unprotected. The count is 6 - 2 = 4, so there is 1 prune candidate: the oldest unprotected non-canonical revision.

### `pruneRevisions(projectRoot, resourceId, maxRevisions, options)`

- Calls `selectPruneCandidates` to identify deletion candidates
- Deletes each candidate's `revisions/<resourceId>/v-<N>/` directory
- If `options.autoPrune === false` and the required number of revisions cannot be removed (because canonical or protected revisions leave fewer eligible candidates than the count over the cap requires), the function aborts and returns `[]` without deleting anything
- Default `maxRevisions` in the project config is `50`

### CLI pruning

The `getwrite prune` command runs pruning across all resources in a project:

```sh
getwrite prune [projectRoot] [--max <number>]
```

See [docs/features/cli.md](./cli.md) for full CLI reference.

### `pruneExecutor.ts`

The `runCli` function in `pruneExecutor.ts` orchestrates CLI-driven pruning. It:

1. Reads all resource IDs from `resources/`
2. Calls `pruneRevisions` for each with the `--max` value (default 50)
3. Reports pruned counts to stdout

---

## API Routes

| Method | Path                                   | Description                                               |
| ------ | -------------------------------------- | --------------------------------------------------------- |
| GET    | `/api/resource/revision/[resource-id]` | Fetch revision metadata + content                         |
| POST   | `/api/resource/revision/[resource-id]` | Save a new revision                                       |
| PATCH  | `/api/resource/revision/[resource-id]` | Set canonical, update content, or set/clear `preserve`    |
| DELETE | `/api/resource/revision/[resource-id]` | Delete a revision by UUID (400 if canonical or protected) |

See [docs/api/openapi.yaml](../api/openapi.yaml) for full request/response schemas.

---

## Soft-Delete (Trash)

GetWrite implements **soft-delete** for resources and folders via `trash.ts`. When a resource is deleted, `softDeleteResource` moves its files to a `.trash/` directory inside the project root rather than permanently deleting them; `softDeleteFolder` does the same for a folder and its entire descendant subtree. A project-wide **Trash** tab in the app (`TrashView.tsx`) lists everything currently trashed and drives restore/purge.

### `.trash/` layout

`.trash/` is split into `resources/`, `meta/`, `revisions/`, and `folders/` subtrees. Each moved resource file is prefixed with the resource ID, and the sidecar keeps its canonical name:

```
<projectRoot>/.trash/
├── resources/
│   ├── <resourceId>-content.txt
│   └── <resourceId>-content.tiptap.json
├── revisions/
│   └── <resourceId>/v-<N>/...
├── folders/
│   └── <folder directory, unchanged from `folders/`>
└── meta/
    ├── resource-<resourceId>.meta.json
    ├── refs-<resourceId>.json
    └── folder-<folderId>.json
```

A resource's revision directory under `<projectRoot>/revisions/<resourceId>/` is moved into `.trash/revisions/<resourceId>/` alongside its content and sidecar. `softDeleteResource` also removes the resource from the inverted index, backlinks, and mention index immediately, rather than deferring that to purge.

`refs-<resourceId>.json` (validated by `TrashRefRecordSchema` in `schemas.ts`) records every inbound `resource-ref` sidecar field that `nullifyResourceRefs` cleared to `{ id: null, name }` when the resource was deleted, so restore can re-link them. `folder-<folderId>.json` (`TrashFolderManifestSchema`) records a deleted folder's own descriptor plus every descendant folder/resource id with its original `parentId`/`orderIndex`, so restore can rebuild the subtree.

### Recovery

`trash.ts` exports `restoreResource(projectRoot, resourceId)` and `restoreFolder(projectRoot, folderId)`, which move content/sidecar/revisions (and, for a folder, the whole recorded subtree) back out of `.trash/`. A resource whose original parent folder no longer exists is restored to the project root instead; a name collision with an existing sibling is resolved by appending `" (restored)"`, then `" (restored 2)"`, etc. Restoring a resource re-indexes it (inverted index, backlinks, mentions) and re-links any reference still in its cleared `{ id: null, name }` state; a reference repointed elsewhere since the delete is left alone. A resource trashed before this ref-record/manifest tracking existed is tolerated (no ref record, or a folder manifest with no descendants) rather than treated as an error.

`purgeResource`/`purgeFolder` permanently delete a trashed item via a fixed, ordered, idempotent five-step sweep (index/backlinks/mentions removal, authored entity-relationship edges, trashed revisions, trashed sidecar + ref record, then trashed content files last) — see `PurgeSweepError`/`PurgeStepName` for how a mid-sweep failure is reported; since every step is idempotent, a retried purge simply re-runs the sweep from the top.

Both restore and purge are reachable from the app's **Trash** tab, individually or as a batch (including an "Empty trash" action that purges everything). The native Android transport (`native-trash-backend.ts`) is an in-process implementation over the shared `trash-core.ts` (the same core the HTTP routes call), not a stub.

---

## Source Files

| File                                                         | Role                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `frontend/src/lib/models/revision.ts`                        | Core revision filesystem utilities                                            |
| `frontend/src/lib/models/pruneExecutor.ts`                   | CLI-orchestrated pruning across all project resources                         |
| `frontend/src/lib/models/trash.ts`                           | Soft-delete, restore, and purge implementation (resources and folders)        |
| `frontend/src/lib/api/trash.ts`                              | Client transport for the Trash tab (`createTransport`, web/desktop only)      |
| `frontend/components/WorkArea/Views/TrashView/TrashView.tsx` | The project-wide Trash tab UI                                                 |
| `frontend/src/store/revisionsSlice.ts`                       | Redux state for revision UI                                                   |
| `frontend/src/store/revision-canonical-guards.ts`            | Client-side canonical invariant enforcement                                   |
| `frontend/src/store/revision-normalization.ts`               | Normalizes raw revision data into `RevisionEntry` shape                       |
| `frontend/src/store/revision-transport-service.ts`           | Transport layer for revision operations (HTTP web/desktop, in-process native) |
| `frontend/app/api/resource/revision/[resource-id]/route.ts`  | Next.js route handler                                                         |
