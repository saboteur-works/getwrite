# Task 5: FR-1 (g) lock edges and failure injection, (h) placement after the original

## Contradicts the spec

Three readings in the spec or task text did not hold as written. Each is a measurement; no cause beyond the code path named is claimed.

1. `computeMovePayload` (`frontend/components/ResourceTree/moveResource.ts`, the pure core of `moveResource`) returns `null` when the destination is the item's current parent (H5 below). A document created at the end of its own folder therefore cannot be placed after its original by `moveResource`. `reorderResourcesCore` itself does work for this, with a payload the split builds (H6), and is reachable from model code (it takes a `projectId`, resolves the root itself, and needs no client move).
2. Reverse compensation does not leave the project record "as it was" (FR-6): `config.metadataRevision` in `project.json` read higher after every compensated run that wrote a sidecar (K3 to K7), and nothing in the primitives used writes it back. Empty `.trash/` directories and a `diagnostics.json` record for the discarded new document id also remained (K3 to K7).
3. `deleteRevision` refuses the preserved snapshot (VA), so the reverse of the snapshot step cannot be `deleteRevision` alone. The composition that worked was `setRevisionPreserve(false)` then `deleteRevision` (two steps, each its own failure point).

## How the probes were run

Each probe was a temporary Vitest file under `frontend/tests/unit/` (named `zz-probe-task5-*.test.ts`), run from `frontend/` with `PROBE_OUT=<file> pnpm exec vitest run <probe file>` and deleted afterwards. `git status --short` was empty after deletion. Every probe built a fresh project from `specs/002-define-data-models/project-types/novel_project_type.json` in a temp directory. `tests/setup.ts` installs the lock-order guard (`tests/helpers/lockOrderGuard.ts`) for every test file; probes that needed production behaviour called `installLockGuard(null)`. No production file was edited; no test, typecheck or lint of the repository was run (nothing in the repository changed). Environment: see `experiments/task-1.md`.

## (g) Lock edges

Read first (code, not a probe): `acquireLock(key)` (`locks.ts`) is a per-key queue; `withMetaLock(projectRoot, fn)` (`meta-locks.ts`) chains on a per-root promise; `withFileLock(path, fn)` (`file-lock.ts`) has its own map and is documented as innermost. `mutateSidecar` takes `withMetaLock(root)`, then the sidecar file lock for the read, mutate and atomic write, releases it, then takes the `project.json` file lock for the `metadataRevision` bump, still inside `withMetaLock` (`sidecar.ts`, `runSidecarWrite`). `seedCompileExclusion` and `removeCompileExclusions` take `withMetaLock(root)` then `updateProjectJson`, which takes the `project.json` file lock. `createResourceCore` takes no lock of its own; its writes go through `writeSidecar` (the same meta then file lock path) and `writeRevision` (no lock). `updateRevisionInPlace` takes `acquireLock("revision-content:<resolved root>:<id>")` and, inside it, `mutateSidecar`. `stripBodylessAnnotationMarksFromRevision` (called by `setCanonicalRevision`) takes the same `revision-content` key (`revision-core.ts`). Other `acquireLock` callers found with `grep -rn "acquireLock(" frontend/src/lib/models`: `project-features.ts` and `metadata-schema.ts` (key: project root), `revision-manager.ts` (key: resource id).

Order the spec's write sequence takes them (each step after the first takes its locks and releases them before the next step; only the revision lock is held across steps):

| Step | Locks taken, outermost first |
|---|---|
| 1 lock the original's revision | `revision-content:<root>:<originalId>` (held through step 7) |
| 2 snapshot (`createRevision`) | none of its own |
| 3 new document (`createResourceCore`) | `withMetaLock(root)` > sidecar file lock, released, then `project.json` file lock (bump) |
| 4 move annotations (two `mutateSidecar`) | per call: `withMetaLock(root)` > sidecar file lock, then `project.json` file lock |
| 5 seed exclusion | `withMetaLock(root)` > `project.json` file lock |
| 6 truncate | per `mutateSidecar` as above (the content write itself takes no lock) |
| 7 record | none (`atomicWriteFile` gives each write its own temp name, per `frontend/CLAUDE.md`) |

Observed with `tests/unit/zz-probe-task5-locks*.test.ts`. "TIMEOUT" means the call had not settled after 400 ms (600 ms for the N rows); a timed-out nested call leaves the outer lock chain stuck for the rest of that project.

| Row | Probe | Guard installed | Guard null (production) |
|---|---|---|---|
| E1 | hold revision lock, `mutateSidecar` | ok | ok |
| E2 | hold revision lock, `seedCompileExclusion` | ok | ok |
| E3 | hold revision lock, `createResourceCore` (another document) | ok | ok |
| E4 | hold revision lock, `updateRevisionInPlace` on the same resource | TIMEOUT (settled ok after the outer release) | same |
| E5 | hold revision lock, `acquireLock` on the same key | TIMEOUT | same |
| E6 | inside `withMetaLock(root)`, `mutateSidecar` | `LockOrderViolationError` | TIMEOUT |
| E7 | inside `withMetaLock(root)`, `seedCompileExclusion` | `LockOrderViolationError` | (contaminated by E6, see N) |
| E8 | inside `withMetaLock(root)`, `acquireLock(revision key)` | ok | (contaminated by E6, see N) |
| E9 | inside `withFileLock(f)`, `acquireLock` | `LockOrderViolationError` | ok |
| E10 | inside `withFileLock(f)`, `withMetaLock` | `LockOrderViolationError` | (contaminated by E6, see N) |

The production-mode cells for E7, E8 and E10 were taken after E6 left the root's meta chain stuck, so they say nothing on their own. They were re-run one case per fresh project with the guard null (`zz-probe-task5-locks2`):

| Row | Nesting | Observed |
|---|---|---|
| N1 | `withMetaLock(root)` > `acquireLock(revision key)` | ok |
| N2 | `acquireLock(revision key)` > `withMetaLock(root)` | ok |
| N3 | `withMetaLock(root)` > `withMetaLock(root)` | TIMEOUT |
| N4 | `withFileLock(f)` > `withFileLock(f)` (same file) | TIMEOUT |
| N5 | `withFileLock(f)` > `withFileLock(g)` (other file) | ok |

Facts that follow from the rows:

- Non-reentrant edges: `acquireLock` on its own key (E5), `withMetaLock` on its own root (E6, N3) and `withFileLock` on its own file (N4). `updateRevisionInPlace` and `setCanonicalRevision` take the `revision-content` key, so calling either while the split holds that key for the same resource is the E4 case.
- The edge `revision-content` > `withMetaLock` > file lock (E1, E2, E3) completed in both modes.
- The installed guard does not flag `acquireLock` inside `withMetaLock` (E8 ok under the guard); it flags only a lock inside a file-lock body and a same-key `withMetaLock` inside `withMetaLock`. The reverse order meta > revision (N1) also completed here; no test in this task exercised both orders racing, so a cycle between them is not measured.
- N5 completed with two different files nested in production mode, although `file-lock.ts` forbids it; the guard (E9, E10) is what enforces the documented rule under test.

Why `createRevision` needs the revision lock held across it. `createRevision` calls `resolveNextVersionNumber` (list, then max + 1) and `writeRevision` (temp directory, then `rename`), and takes no lock (`revision-core.ts`).

- C1: two concurrent `createRevision` calls for one resource, no lock, 30 repetitions: both fulfilled 0 times, one rejected 30 times. The rejection message was `ENOTEMPTY: directory not empty, rename '<root>/revisions/<id>/.tmp<id> -> .../v-2'`; one revision directory `v-2` was on disk afterwards (versions `[1,2]`).
- C2: the same two calls each wrapped in `acquireLock("revision-content:...")`, 30 repetitions: both fulfilled 30 times, 0 rejections.
- V0: a destructive `updateRevisionInPlace` alone (60 words replaced by 1) left `[[1,true,"Initial Draft"],[2,false,"Auto-backup before large deletion"]]`.
- V1 and V2: a `createRevision` (preserve) started together with that destructive `updateRevisionInPlace`, 30 repetitions in each start order (`createRevision` first; update first): no call rejected in any run, and in 60 of 60 runs there was no "Auto-backup before large deletion" revision; the only extra revision was the preserved one (`[2,false,"snap"]`). `snapshotBeforeDestructiveWrite` catches a write failure and returns `null` (code, `revision-core.ts`), which is consistent with that outcome; the probe did not capture the swallowed error, so the mechanism is not established by an experiment.

What this implies for the split, as measurement only: a snapshot created without the lock held can collide with a concurrent writer on the version number (C1), and an overlapping canonical save can lose its own automatic snapshot without any error (V1, V2). Holding `revision-content` across the snapshot removed the C1 collisions (C2). Task 2 records the same-version question for `createRevision` against `updateRevisionInPlace` in more detail.

## (g) Failure injection after each write step

Probe `zz-probe-task5-inject.test.ts`. Setup: original `O` (two paragraphs, two annotations written to its sidecar, `v-1` canonical, `O` in `config.compileDefaults`). Steps composed from existing primitives, in the decided order: 1 `acquireLock(revision-content)`; 2 `readRevision` of the canonical then `createRevision(..., { metadata: { name: "Before split", preserve: true, splitSnapshot: true } })`; 3 `createResourceCore` (text, TipTap content); 4 `mutateSidecar` on the new document (annotations) then on `O` (annotations removed); 5 `seedCompileExclusion(new id)`; 6 truncate composed as `atomicWriteFile(content.bin)` + `persistResourceContent` + `mutateSidecar(updatedAt, wordCount)` (the no-log function of Task 16 does not exist yet; `writeRevisionContent` and `syncDerivedResourceContent` are not exported from `revision-core.ts`); 7 `atomicWriteFile(meta/lineage.json)`. A throw was simulated after step k (k = 1 to 7), then the reverse compensation ran: 7 `rm` the record; 6 write the snapshot content back and restore the previous `updatedAt` and `wordCount`; 5 `removeCompileExclusions`; 4 `mutateSidecar` restoring `O`'s annotations array; 3 `softDeleteResource` then `purgeResource`; 2 `setRevisionPreserve(false)` then `deleteRevision`; 1 release. State was a recursive file listing with contents, captured after `flushIndexer` plus a 50 ms wait, before step 1 and after compensation.

| k | Failure after step | Compensation errors | Entries differing from the start after compensation |
|---|---|---|---|
| 1 | lock | none | 0 |
| 2 | snapshot | none | 0 |
| 3 | new document | none | 6: four empty directories `.trash/`, `.trash/meta/`, `.trash/resources/`, `.trash/revisions/` added; `project.json` `config.metadataRevision` 4 -> 5; `meta/index/diagnostics.json` holds an extra record keyed by the new document id |
| 4 | annotations moved | none | 6: same four directories; `metadataRevision` 4 -> 8; `diagnostics.json` extra record |
| 5 | exclusion seeded | none | 6: same; `metadataRevision` 4 -> 8; `diagnostics.json` extra record. In a first run `meta/index/inverted.json` also differed (content not inspected); in the second run it did not, so that entry depends on indexer timing |
| 6 | truncated | none | 7: as k=5 plus `resources/<O>/content.txt` `""` -> `"before the cut\nafter the cut"` |
| 7 | record written | none | 7: same as k=6 |

Observations about these numbers:

- The `content.txt` difference is a property of the probe's setup: `O` was created with a TipTap document and no plain text, so its `content.txt` started empty and `persistResourceContent` filled it on the restoring write. `content.tiptap.json`, `content.bin` of `v-1` and the sidecar (`updatedAt`, `wordCount`, `annotations`) read as they did before. The probe did not test a document created with plain text.
- `metadataRevision` ends higher after every run that wrote a sidecar: 4 -> 5 after k=3 (one sidecar write by the new document's creation) and 4 -> 8 after k=4 and k=5; 4 -> 10 after k=6 and k=7. Code read: `runSidecarWrite` calls `bumpMetadataRevision` after each successful sidecar write.
- `softDeleteResource` followed by `purgeResource` removed the new document's resource directory, sidecar, revisions and index entries (no `resources/<newId>`, `meta/resource-<newId>...`, `revisions/<newId>` entry differed), but `diagnostics.json` still held a record for the new id. The ADDED `.trash` directories are the empty containers `softDeleteResource` creates.
- VA: removing the snapshot with `deleteRevision` alone threw `Protected revisions cannot be deleted. Unprotect it first.` and left `revisions/<O>/v-2/`, `v-2/content.bin` and `v-2/metadata.json` on disk.
- No compensation step failed in these runs. A failure inside compensation, a failure inside a step before its write completes (as opposed to after), a process crash, and two overlapping splits were not injected in this task.

## (h) Placement directly after the original

Probe `zz-probe-task5-place.test.ts`. Folder `F` (created with `createResourceCore({ type: "folder" })`) holding `A`, `B`, `C` (orderIndex 0, 1, 2) and a subfolder `Sub` (3). Folders and resources share one ordering space per parent (`resource-templates.ts`, `resolveTemplatePlacement`; confirmed by H1).

| Row | Observation |
|---|---|
| H1 | Siblings before any copy: `A(0) B(1) C(2) Sub(folder,3)`. |
| H1b | `createResourceCore` with no `orderIndex` gives orderIndex 0 (factory default `params.orderIndex ?? 0`); with `NoIdx` it tied with `A` at 0. |
| H2 | `copyResourceCore(A)`: the copy's sidecar has orderIndex 0, the same as `A`, and the same `folderId`. Siblings read `A copy(0) A(0) NoIdx(0) B(1) C(2) Sub(3)`. |
| H3 | The tree sorts children with `Array.sort` on `orderIndex` only (`ResourceTree.tsx`, `getChildren`). With `buildResourceTree`'s output, the tied items came out `A copy, A, NoIdx`, which is the order `getLocalResources` returned them; with the same resources passed in reversed order they came out `NoIdx, A, A copy`. So for a tie the shown order followed the load order of the array, not any stored field. |
| H4 | A new document created with `orderIndex` = max sibling + 1 (4 here) is accepted by `createResourceCore`. |
| H5 | `computeMovePayload(all, N, F)` where `F` is `N`'s current parent returns `null`. |
| H5b | `computeMovePayload(all, N, null)` (a different parent) returned a payload with 6 resource entries and 8 folder entries (every sibling of the destination, plus the old parent's siblings re-sequenced). |
| H6 | A contiguous renumber placing `N` directly after `A`, sent as one `reorderResourcesCore(pid, { folderOrder, resourceOrder })` (7 siblings: 6 resources, 1 folder, every entry carrying `folderId: F`): 5.7 ms, `metadataRevision` 8 -> 14 (6 resource sidecar writes). Result `A copy(0) A(1) N(2) NoIdx(3) B(4) C(5) Sub(6)`. |
| H7 | `reorderResourcesCore` called while holding `revision-content:<root>:<A>`: completed ok (it takes `withMetaLock` for folders, then one `mutateSidecar` per resource, never nested). |
| H8 | A folder entry sent without `folderId`: `folder.json` `parentId` changed from the parent folder's id to `null` (`parentId = fo.folderId ?? null`, `resource-crud-core.ts`). A split that renumbers a folder sibling must send that folder's `folderId`. |
| H9 | A resource entry with `folderId: null`: the resource stayed in its folder (`folderId: ro.folderId ?? existing?.folderId ?? null`). Not a hazard for a same-folder placement; it means that function cannot move a resource to the root. |
| H10 | A resource entry with `orderIndex: 0.5` was stored and re-read by `getLocalResources` as 0.5 (`schemas.ts` has `orderIndex: z.number()`). |
| H11 | Injected failure (one of three sidecar paths replaced by a directory): `reorderResourcesCore` threw `ReorderSaveError` ("Could not save the new order for 1 resource(s)."), `failedIds` named the one; the other two were written (`A` 20, `C` 22). So a failed placement leaves a partial renumber, with the failed ids reported. |
| H11b | While that sidecar path was a directory, `getLocalResources` itself threw `EISDIR` (the probe's own reads failed until it was removed). |

Cost, 200 siblings in one folder (`P1` to `P3`, the original being the first sibling, the worst case for a shift):

| Row | Placement written as | Time | `metadataRevision` delta |
|---|---|---|---|
| P1 | contiguous renumber of 201 siblings in one call | 96 ms | +201 |
| P2 | only the siblings after the original, 199 + `N` | 94 ms | +200 |
| P3 | one entry, `N` at a fractional `orderIndex` | 1 ms | +1 |

Each sidecar write also enqueues an index task (`enqueueAfterSidecarWrite`, code read), so P1 and P2 enqueue about 200 per-resource index tasks; the probe did not count them.

Facts about reachability: `reorderResourcesCore(projectId, input)` is exported from `frontend/src/lib/models/resource-crud-core.ts`, resolves the root from `projectId` itself and needs no client call. It writes the sidecars of the entries it is given, not of resources that stayed put. It does not rewrite `project.json` other than through the per-sidecar `metadataRevision` bump.

## Not measured

- A failure injected inside a compensation step, a crash between steps, and two overlapping splits.
- The truncating function of Task 16 (it does not exist yet); step 6 used a composition, and the indexes after the split (Task 4).
- An encrypted project, a second tenant, and several server instances.
- The index-task count behind P1 and P2.
- Whether any sibling order other than the one measured (a tie at the end of a folder, a folder as the original's next sibling) shows differently in the tree beyond H3.
