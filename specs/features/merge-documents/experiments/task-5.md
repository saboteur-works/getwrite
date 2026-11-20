# Task 5: FR-1 (d) lock edges, overlapping merges and failure injection over N+1 documents

## Contradicts the spec

Two readings in the spec text did not hold as written. Each is a measurement; no cause beyond the acquisition order named is claimed.

1. FR-6 says that taking the revision locks "in one recorded order" gives two overlapping merges that share a document "one applied and one refused and none deadlocked". With the order "target first, then the absorbed documents in append order" (the order of the FR-6 write sequence), two merges whose roles are swapped (O3 below: one merge has X as target and Y absorbed, the other has Y as target and X absorbed) neither settled within 1.5 s in 8 of 8 repetitions. With the same two merges taking the locks sorted by document id (O4), 8 of 8 settled, one applied and one refused. So an order that is a function of the role (target, then absorbed) was not the order that settled all runs here; an order that is a function of the document id was.
2. FR-6 says the project record is "as it was" after a compensated failure, allowing only the `metadataRevision` counter to differ. In these runs the counter advanced after every failure injected at or after step 3a (8 to 10, 12, 14, 16, 18, 20), and `meta/index/annotations.json` and `meta/index/inverted.json` differed byte for byte after compensation (I3 below). A comparison with the keys of those two files sorted found them equal in both rows re-checked (I3), so the difference measured is key order.

## How the probes were run

Each probe was a temporary Vitest file under `frontend/tests/unit/` (named `zz-probe-task5-merge.test.ts`), written in the scratch directory, copied in, run from `frontend/` with `PROBE_OUT=<file> pnpm exec vitest run tests/unit/zz-probe-task5-merge.test.ts`, and deleted afterwards. `git status --short` was empty after the deletion. Each case built a fresh project from `specs/002-define-data-models/project-types/novel_project_type.json` in a temp directory (no user project). `tests/setup.ts` installs the lock-order guard (`tests/helpers/lockOrderGuard.ts`) for every test file; rows labelled "guard" ran with it installed, rows labelled "null" called `installLockGuard(null)` first (the production setting). No production file, `package.json` or lockfile was edited; no repository test, typecheck or lint was run (nothing in the repository changed). Environment: see `experiments/task-1.md`. Three runs: the 41-test run (locks, overlap, injection k = 0 to 11), and two re-runs of injection k = 5 and 7 only (I3). All 41 probe tests passed; a probe row that records `TIMEOUT` is a measured value, not a failed test.

The merge core does not exist yet. Every merge step below is composed from primitives that exist: `acquireLock("revision-content:<resolved root>:<id>")`, `createRevision`, `readRevision`, `mutateSidecar`, `stripBodylessAnnotationMarks`, `writeCanonicalContentWithoutLog` (with `lockHeld: true`), `writeLatestOperation` (`kind: "merge"`, which `SPLIT_OPERATION_KINDS` already accepts, with `newDocumentId` set to the target's id), `setRevisionPreserve`, `deleteRevision`. The merged mark was written as a sidecar key `mergedMark: { targetId, date }`, a name chosen by the probe; no production code defines it yet. Appending to the target was composed as: parse the target's canonical document, push the absorbed documents' `content` nodes, write the result.

## (d) Lock edges, in the order the FR-6 write sequence takes them

Read first (code, not a probe; same reading as `specs/features/split-at-cursor/experiments/task-5.md`): `acquireLock(key)` is a per-key queue; `withMetaLock(projectRoot, fn)` chains on a per-root promise; `withFileLock(path, fn)` has its own map. `mutateSidecar` takes `withMetaLock(root)`, then the sidecar file lock for read, mutate and write, then the `project.json` file lock for the `metadataRevision` bump. `writeCanonicalContentWithoutLog(..., { lockHeld: true })` skips its own `revision-content` lock and calls `mutateSidecar` after its content writes (`revision-core.ts`, `writeCanonicalContentWithoutLogLocked`). `writeLatestOperation` takes `withMetaLock(root)` only.

Order of the probe's write sequence and the locks each step took, outermost first:

| Step | Locks taken |
|---|---|
| 1 lock the revisions of T, A1, A2 | `revision-content:<root>:<T>`, then `:<A1>`, then `:<A2>`, each taken after the previous was granted, all held to the end |
| 2 snapshot each (`createRevision`) | none of its own |
| 3 move chosen annotations (`mutateSidecar` on T, then on A1) | per call: `withMetaLock(root)` > sidecar file lock, released, then the `project.json` file lock |
| 4 mark each absorbed document (`mutateSidecar`) | as step 3 |
| 5 strip a moved note's mark from an absorbed text (`writeCanonicalContentWithoutLog`, `lockHeld: true`) | none for the content write; then as step 3 for `updatedAt` and `wordCount` |
| 6 append to the target (same function, `lockHeld: true`) | as step 5 |
| 7 write the latest-operation record (`writeLatestOperation`) | `withMetaLock(root)` |

Observed, with all three revision locks held, one call per row, 600 ms limit (command: the run above; rows `sec: "L"`):

| Row | Call made while holding the three locks | Guard installed | Guard null |
|---|---|---|---|
| L1 | `createRevision(T)` | ok | ok |
| L2 | `createRevision(A1)` | ok | ok |
| L3 | `mutateSidecar(A1)` | ok | ok |
| L4 | `writeCanonicalContentWithoutLog(A1, lockHeld: true)` | ok | ok |
| L5 | `writeCanonicalContentWithoutLog(T, lockHeld: true)` | ok | ok |
| L6 | `writeLatestOperation` | ok | ok |

Nested edges, one case per fresh project, 500 ms inner limit (rows `sec: "N"`). "TIMEOUT" means the inner call had not settled after 500 ms.

| Row | Nesting | Guard installed | Guard null |
|---|---|---|---|
| N1 | hold `revision(T)` > `writeCanonicalContentWithoutLog(T)` without `lockHeld` | TIMEOUT | TIMEOUT |
| N2 | hold `revision(T)` > `updateRevisionInPlace(T)` | TIMEOUT | TIMEOUT |
| N3 | hold `revision(T)` > `acquireLock(revision(T))` | TIMEOUT | TIMEOUT |
| N4 | hold `revision(T)` > `acquireLock(revision(A1))` | ok | ok |
| N5 | `withMetaLock(root)` > `withMetaLock(root)` | `LockOrderViolationError` | TIMEOUT |
| N6 | `withMetaLock(root)` > `writeLatestOperation` | `LockOrderViolationError` | TIMEOUT |
| N7 | `withMetaLock(root)` > `mutateSidecar` | `LockOrderViolationError` | TIMEOUT |
| N8 | `withMetaLock(root)` > `acquireLock(revision(T))` | ok | ok |
| N9 | `withFileLock(f)` > `withFileLock(f)` | `LockOrderViolationError` | TIMEOUT |
| N10 | `withFileLock(f)` > `acquireLock(revision(T))` | `LockOrderViolationError` | ok |

Facts that follow from the rows:

- Non-reentrant edges, each seen as TIMEOUT in production mode: `acquireLock` on a key already held (N3), `withMetaLock` on a root already held, including through `mutateSidecar` and `writeLatestOperation` (N5 to N7), and `withFileLock` on a file already held (N9). Under the guard the `withMetaLock` and `withFileLock` cases throw `LockOrderViolationError` instead of waiting; N3 is not caught by the guard and timed out in both modes.
- `writeCanonicalContentWithoutLog` and `updateRevisionInPlace` on a resource whose `revision-content` key is held by the caller timed out (N1, N2); the same call with `lockHeld: true` completed (L4, L5). Every step of the sequence that writes an absorbed document's or the target's text therefore needs `lockHeld: true`.
- Taking the three `revision-content` keys one after another, with a call to each other primitive while they were held, completed in both modes (L1 to L6, N4). The installed guard accepted that acquisition order.
- `revision-content` > `withMetaLock` > sidecar file lock > `project.json` lock completed (L3 to L6). `withMetaLock(root)` > `acquireLock(revision(T))` also completed (N8), so the guard does not forbid that reverse edge; no probe ran both orders racing, so a cycle between them is not measured.

## (d) Two overlapping merges that share a document

Probe: two merges started together, each composed as: read the content hash of every involved document (the "preview"), take the revision locks one at a time in the stated order with a 15 ms pause after each, then re-read each document's hash and `mergedMark` (refuse as `stale-text` if a hash differs from the preview, as `already-marked` if a `mergedMark` is present), then write the mark on each absorbed document and append to the target, then release. No staleness check exists in the repository yet; this one is the probe's. Three documents X, Y, Z. Each scenario ran 8 times on a fresh project. A result of `TIMEOUT` means that merge had not settled 1.5 s after the start. Rows `sec: "O"`.

| Row | Merges (target absorbs ...) | Lock order | Result over 8 runs |
|---|---|---|---|
| O1 | X absorbs Y, and X absorbs Y | target, absorbed | 4 runs: first merge refused (stale-text), second applied; 4 runs: first applied, second refused (stale-text) |
| O2 | X absorbs Z, and Y absorbs Z | target, absorbed | 7 runs: first applied, second refused (already-marked); 1 run: first refused, second applied |
| O3 | X absorbs Y, and Y absorbs X | target, absorbed | 8 runs: both TIMEOUT |
| O4 | X absorbs Y, and Y absorbs X | sorted by document id | 7 runs: first applied, second refused (already-marked); 1 run: first refused, second applied |
| O5 | X absorbs Z, and Y absorbs Z | sorted by document id | 4 runs: first refused (already-marked), second applied; 4 runs: first applied, second refused (already-marked) |
| O6 | X absorbs Y, and Y absorbs Z | target, absorbed | 8 runs: first refused (stale-text), second applied |
| O7 | X absorbs Y, and Y absorbs Z | sorted by document id | 6 runs: first applied, second refused (already-marked); 2 runs: first refused (stale-text), second applied |

What each merge returned, in one line: in every settled run exactly one merge applied and one was refused (O1, O2, O4 to O7); in O3 neither returned within the limit in any run. The probe did not check whether the O3 locks were later released, because the probe's two merges were left running when the test ended.

## (d) Failure injected after each write step, with reverse compensation

Probe: documents T (two paragraphs, one note), A1 (a note, a claim and a citation, each marked in its text and stored in its sidecar) and A2 (one note, marked). `project.json` `config.compileDefaults.excludedResourceIds` held T, so a change to compile exclusions would show. The moved annotations were A1's note and claim; A1's citation and A2's note stayed. A throw was raised after unit k, then reverse compensation ran. Units: 1 lock T, A1, A2; 2a, 2b, 2c snapshot T, A1, A2 (`createRevision` with `preserve: true`, a `mergeSnapshot: true` metadata key chosen by the probe); 3a add the two moved annotations to T's sidecar; 3b remove them from A1's sidecar; 4a, 4b write `mergedMark` on A1, A2; 5 strip the moved notes' marks from A1's text with `stripBodylessAnnotationMarks` (the known ids being A1's remaining annotation ids) and write it; 6 append A1's then A2's snapshot content to T and write it; 7 write the latest-operation record. Compensation, in reverse: remove the record file; put back the text files (`resources/<id>/content.txt`, `content.tiptap.json`, `revisions/<id>/v-1/content.bin`) and the sidecar `updatedAt` and `wordCount` of T and of A1 from a copy taken before step 5 and step 6; delete `mergedMark` from each marked document; write back each sidecar's earlier `annotations` array; `setRevisionPreserve(false)` then `deleteRevision` for each snapshot; release the three locks. The state compared was a recursive listing with contents of the whole project directory taken after the indexer flush and a 50 ms wait, before the first unit and after compensation, with `project.json` `config.metadataRevision` removed from the comparison and reported separately. Rows `sec: "I"`.

| k | Failure injected after | Compensation errors | Entries differing from the start | `metadataRevision` |
|---|---|---|---|---|
| 0 | (nothing ran) | none | 0 | 8 to 8 |
| 1 | lock | none | 0 | 8 to 8 |
| 2 | 2a snapshot T | none | 0 | 8 to 8 |
| 3 | 2b snapshot A1 | none | 0 | 8 to 8 |
| 4 | 2c snapshot A2 | none | 0 | 8 to 8 |
| 5 | 3a add to T's sidecar | none | 2: `meta/index/annotations.json`, `meta/index/inverted.json` | 8 to 10 |
| 6 | 3b remove from A1's sidecar | none | the same 2 | 8 to 12 |
| 7 | 4a mark A1 | none | the same 2 | 8 to 14 |
| 8 | 4b mark A2 | none | the same 2 | 8 to 16 |
| 9 | 5 strip A1's text | none | the same 2 | 8 to 18 |
| 10 | 6 append to T | none | the same 2 | 8 to 20 |
| 11 | no failure (all seven ran, no compensation) | not run | 22 entries: `meta/latest-operation.json` added; `revisions/<id>/v-2/` with `content.bin` and `metadata.json` added for each of the three documents (9 entries); the sidecars of T, A1 and A2, `resources/<T>/` and `resources/<A1>/` `content.txt` and `content.tiptap.json`, `revisions/<T>/v-1/content.bin` and `revisions/<A1>/v-1/content.bin` changed; `meta/index/annotations.json`, `diagnostics.json`, `inverted.json` changed | 8 to 14 |

Facts from the rows:

- No compensation step threw in any of rows 0 to 10.
- After compensation of a failure at k = 6 to 10 the text files (`content.txt`, `content.tiptap.json`, `v-1/content.bin`) and all three sidecars read byte for byte as before, as did `project.json` apart from `metadataRevision`; no `.trash` directory, no extra resource directory and no `v-2` directory remained. `compileDefaults` was unchanged in every row, including row 11.
- `deleteRevision` of a preserved snapshot was not attempted alone here; the compensation always called `setRevisionPreserve(false)` first (the split probe measured the refusal, `specs/features/split-at-cursor/experiments/task-5.md`, VA).
- `metadataRevision` rose by 2 for each `mutateSidecar` step (3a, 3b, 4a, 4b: 2, 2, 2, 2) and by 2 for step 5 and step 6 each, counting the forward write and its compensating write; the snapshot, record and lock steps did not change it. In row 11 (no compensation) it rose by 6 (one sidecar write for each of 3a, 3b, 4a, 4b, 5, 6).

### I3: the two index files

Re-run of k = 5 and k = 7 with an extra 600 ms wait and a second indexer flush before the comparison (rows `sec: "I2"`): both files still differed byte for byte in both rows, had the same length (374 and 945 characters), and were equal after sorting object keys (`sameAfterKeySort: true` for both files in both rows). The printed prefixes show the same keys in a different order. The probe did not establish why the order differs.

## Not measured

- A failure inside a compensation step (for example `deleteRevision` throwing), a failure inside a step before its write completes, and a process crash.
- A merge over more than three documents; Task 13 times 2, 10 and 50.
- The overlap rows with a 15 ms pause between lock acquisitions only; other pauses, and more than two concurrent merges.
- Whether the locks of the two O3 merges were released later.
- That an annotation moved to the target before the strip leaves the right marks in the appended text (Task 6).
- A latest-operation record without `newDocumentId` (read from code only: `isLatestOperationRecord` requires a valid UUID there until FR-21 changes it); the probe passed the target's id.
- An encrypted project, a second tenant and several server instances.
