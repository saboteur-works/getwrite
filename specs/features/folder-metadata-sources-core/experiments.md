# Feature 102 experiments

Measurements are recorded as observed values with the command or test that produced them. A cause is written only where an experiment separated it from the alternatives; anything else is labelled "not confirmed". Each task appends to its own section.

## Environment

Date: 2026-11-07. Tree: branch `worktree-agent-a8f2f0c4db41bf166` (isolated worktree), base commit `4f6b4992` plus the Task 1 files. Node v24.15.0, pnpm 10.28.0, Vitest v4.1.6. Everything ran inside the command sandbox; `pnpm` printed a `~/.npmrc` EPERM warning on each call (a sandbox denial, not a result). `next build`, `pnpm build:native`, Storybook and Playwright were not run.

## Part 1 FR-2 (a): concurrent `folder.json` writers

Test: `frontend/tests/unit/folder-json-concurrency.test.ts` (node project). Command, from the repository root: `pnpm --filter getwrite-frontend exec vitest run tests/unit/folder-json-concurrency.test.ts` (add `--disableConsoleIntercept` to see the logged lines). 13 tests passed on every run (three runs; two with logs shown below). The assertions pin the first-run observations; the race counts are logged, not asserted.

Writers found by grep and read (all write `folders/<slug>/folder.json`):

| Id | Writer | Site |
| --- | --- | --- |
| R | `renameFolderCore` to `renameFolderById` (read, spread, write) | `folder-utils.ts:51-76`; `resource-crud-core.ts` `renameFolderCore` |
| O | `reorderResourcesCore` folder loop (read, set `orderIndex` and `parentId`, write) | `resource-crud-core.ts:941-995`, inside `withMetaLock(projectRoot)` |
| W | `writeResourceToFile` for a folder (whole-object overwrite) | `resource-persistence.ts:125-135`; callers include Trash restore (`trash.ts:1135`, `:1152`) and the importers |
| C | `createProjectFromType` (folder and subfolder descriptors) | `project-creator.ts:272`, `:310`; runs at creation only, so no overlap partner exists on an existing folder |

### Which locks each writer requested (writer run alone, recording guard)

| Writer | Lock requests observed |
| --- | --- |
| R | none |
| O | `withMetaLock` on the project root (one request); no file lock |
| W | none |
| C | no lock whose key ends in `folder.json` (the recorder saw none) |

No writer requested `withFileLock` for a `folder.json` path.

### Held-lock gates (lock held by the test, writer started, file compared after 50 ms)

| Writer | File lock on `folder.json` held: file changed during hold | Project meta lock held: file changed during hold |
| --- | --- | --- |
| R | yes | yes |
| O | yes | no |
| W | yes | yes |

So, as observed: none of the three waits on a file lock for `folder.json`; only O waits on the project meta lock.

### Two writers started at once (50 repetitions each, fresh project per repetition)

Counts from two runs; the second run is the right-hand figure where they differ. "lost" counts a repetition in which the final file lacks that writer's change. "unparseable" counts a final `folder.json` that `JSON.parse` rejected (the file was read without error). W writes the whole folder object it was given at fixture time with `metadataSource.isMetadataSource: true`, so it carries the pre-race name and order.

| Pair | Run 1 | Run 2 |
| --- | --- | --- |
| R + O | rejected 0, unparseable 1, lost `R:name` 48, `O:orderIndex` 1 | same |
| R + W | rejected 0, unparseable 23, lost `W:flag` 27 | rejected 0, unparseable 24, lost `W:flag` 25, `R:name` 1 |
| O + W | rejected 0, unparseable 0, lost `W:flag` 48, `O:orderIndex` 2 | rejected 0, unparseable 0, lost `O:orderIndex` 4, `W:flag` 46 |

An earlier run of R + O and R + W (before the test was changed to separate read errors from parse errors) gave unparseable 5 and 25, so the counts vary run to run. Unreadable files (read error) were 0 in every counted run.

### Readings

- Reading (from the code): rename, reorder and Trash-restore writers take no per-file lock on `folder.json`. Confirmed by the lock-request records and by the held-lock gate for the file lock. Confirmed.
- Reading: two concurrent `folder.json` writers can lose a change. Observed: at least one change was missing from the final file in most repetitions of every pair. Confirmed as an observation.
- Observed: a final `folder.json` that does not parse occurred in R + O (1 of 50) and R + W (23 to 25 of 50) and not in O + W. Why those files did not parse is not confirmed: the test did not capture the bytes, so interleaved writes to one file is a hypothesis, not a finding.
- Why R + O lost the rename in 48 of 50 repetitions (and not the order) is not confirmed. The test shows only the outcome. Which writer read the old file before the other wrote was not traced.
- The R + W and O + W counts for W are partly by construction: W overwrites the whole object from a stale snapshot, so a write by R or O that lands first is overwritten whenever W finishes last. They show W's overwrite semantics, not a defect separate from that.
- Not measured: Trash restore calling W while a rename or reorder runs; importers calling W; two renames at once; two reorders at once (O serialises with itself on the meta lock by construction of `withMetaLock`, not run here); behaviour on the native transport; whether a real client can issue these overlaps. FR-5 (OQ-3, resolved) keeps rename, reorder and move unlocked; this record does not change that, and whether to keep or change the requirement is the owner's decision.

## Part 1 FR-2 (b): Trash round trip with an undeclared `folder.json` key

Not run (Task 2).

## Part 1 FR-2 (c): `type = folder` query

Not run (Task 3).

## Part 2 FR-18 survey

Not run (Task 4).

## Part 2 FR-28 observation

Not run.

## Part 2 FR-31 (d)

Not run.

## Acceptance

Not run (Task 39).
