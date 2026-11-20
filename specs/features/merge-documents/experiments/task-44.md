# Task 44: packaged desktop run (lead-run)

## Defects found and fixed

### Undo merge greyed out after a merge, with "Some data couldn't be loaded correctly."

**Observed (owner, packaged app, 2026-11-19).** After merging three documents, right-clicking showed the toast "Some data couldn't be loaded correctly." and "Undo merge" was greyed out. On disk `meta/latest-operation.json` held a valid merge record with no `newDocumentId` (allowed by FR-21 and `isLatestOperationRecord`), and the absorbed documents carried correct `mergedMark`s.

**Cause, as established by the failing tests.** `LatestBodySchema` in `frontend/src/lib/api/split.ts` required `newDocumentId: z.string()` on every found record. Fed a real-shaped merge record (no `newDocumentId`, kind `merge`, 3 affected ids, 3 snapshot revisions, full ISO date), `requestLatestSplitOperation` returned `{ kind: "failed", cause: "transport-failed" }` instead of the record (red run in `split-transport.test.ts`), and with the real client behind the palette the "Undo merge" row had `aria-disabled="true"` (red run in `MergeUndoAction.test.tsx`). Both went green only after the schema change.

**Why the tests missed it (measurement).** `split-transport.test.ts` exercised the latest read with a split record only. `MergeUndoAction.test.tsx` replaced `requestLatestSplitOperation` with a mock returning `MERGE_RECORD`, so the client schema never ran, and that fixture carried `newDocumentId: TARGET_ID`, a field the server does not write for a merge.

**Fix.** `LatestBodySchema` now uses a `LatestRecordSchema` discriminated on `kind`: a split requires `newDocumentId`; a merge takes it optionally (a pre-Feature-121 stored merge record that has one is still accepted). This mirrors `isLatestOperationRecord`. The `LatestOperationRecord` type in `split-types.ts` already had the same shape, and `SplitUndoHost` reads `newDocumentId` only on the split branch, so nothing else in the path changed.

**Tests.**
- `tests/unit/split-transport.test.ts`: merge record without `newDocumentId` is returned as a record and raises no validation report; a split record without it is still refused and reported.
- `tests/component/MergeUndoAction.test.tsx`: the palette row is enabled for the merge record as the transport returns it (real client, stubbed `fetch`); the `MERGE_RECORD` fixture no longer carries `newDocumentId`.

Results: `pnpm typecheck` clean, `pnpm lint` 0 errors, `pnpm test:ci` 1053 files / 15078 tests passed. Not checked: the packaged app itself.

## Owner observations

### Step 7: Undo merge reverses only the most recent merge (as specified)

**Observed (owner, packaged app, 2026-11-19).** The owner used Undo merge at step 7, expecting it to reverse the Cross-Folders merge. Undo reversed a different merge, and afterwards Undo merge was no longer offered. The Undo confirmation named the document it would restore ("Target left out of compile").

**On disk after the Undo (lead read of the sample project):**

- The Cross-Folders merge (into Cross C, at 00:44:45Z) was followed by the other step 2 merges. The last of them was "Opening scene" into "Target left out of compile", with its "Before merge" snapshot `v-2` at 23:10 local time. Each merge replaced `meta/latest-operation.json`.
- Undo at 23:18:56 local time reversed that last merge. The canonical text of "Target left out of compile" (`v-1`) is byte-identical to its "Before merge" snapshot `v-2` (153 bytes, the same sha). The text from just before the Undo is kept as the preserved revision `v-3` "Before undo merge". "Opening scene" has no `mergedMark`.
- `meta/latest-operation.json` is absent: Undo cleared it, as FR-21 says (Undo runs once).
- Cross A and Cross B still carry `mergedMark` pointing at Cross C. The marks from the other step 2 merges remain too ("Absorbed with notes", "Metadata two", "Metadata three", "Empty document", "Second scene").

This matches the spec: one latest-operation record per project, replaced by each later split or merge. Nothing failed.

### Follow-up (owner decision: recorded, not changed in this feature)

Only Undo merge removes a Merged mark, and Undo reaches only the latest operation. Once a later split or merge replaces the record, nothing in the app can clear an older merge's marks. Those documents stay out of compile, the project goal and the project word totals for good. The owner asked for this to be tracked as a follow-up (POS `task_f8423a8d`); Feature 121 is unchanged.

### Step 9: timings

Merges of 2, 10 and 25 documents (25 is the cap, `MERGE_DOCUMENT_CAP`; the 50 in the task cannot be merged). The owner reported each as "pretty fast". This is the owner's impression in the packaged app, not a timed measurement. The timed figures at the cap come from Task 27's probe of the core, not from the app (`task-27.md`): `applyMerge`, including the awaited index update, returned in 110 to 120 ms over 3 runs, and the index queue then drained in 388 to 431 ms.

### Step 7, rerun: Undo merge after edits (lead read of the files)

The owner merged "Tide table" into "Harbor history" (snapshots at 06:23:56Z), edited both, then used Undo merge at 06:25:33Z. On disk:

- "Harbor history" (base): the text of its canonical `v-1` is identical to its "Before merge" snapshot `v-3`. The text from just before the Undo, which ends with the owner's "Edit B", is kept as the preserved revision `v-4` "Before undo merge". `v-1` was written again at 06:25:36Z, three seconds after the Undo. Its text is unchanged, but its TipTap JSON differs byte-wise from `v-3` (sha `c2883a8a` against `832aa9e5`). That write added no writing-log entry. Which component made it was not checked.
- "Tide table" (absorbed): canonical `v-1` is byte-identical to its snapshot `v-2`. The text from just before the Undo is the preserved `v-3`. Its `mergedMark` is gone.
- The earlier "Before merge" snapshot `v-2` of "Harbor history" (04:56:48Z, from the Empty document merge) is still there and preserved. "Empty document" still carries its mark pointing at "Harbor history", because that merge was no longer the latest operation (see the follow-up above).

### Step 10: writing log

- Baseline `meta/writing-log/2026-11-19.json` is unchanged (sha `a986d0de…`, the same as before the run).
- A new day file, `2026-11-20.json` (UTC), has four entries, each 2 or 3 words added:
  - "Already merged document" at 06:18:34Z;
  - "Mark target" at 06:18:41Z;
  - "Tide table" at 06:24:06Z;
  - "Harbor history" at 06:24:23Z.
- These match the owner's edits before the two Undo runs. No entry carries the time of a merge (00:44Z, 04:44Z, 04:48Z, 04:56Z, 06:09Z, 06:10Z, 06:23Z, 06:38Z) or of an Undo (06:18:56Z, 06:25:33Z). This is consistent with FR-8: a merge and its Undo add nothing to the writing log, and later ordinary edits log their own words.
- The current latest-operation record is the 25-document merge from step 9 (06:38:48Z, 25 affected ids, 25 snapshots at revision 2).

### Owner summary of the remaining steps (2026-11-19)

- Step 8: the encrypted project (generated sample, seed 121, workspace pointed at its folder through App Settings) locked and unlocked without problems. The workspace was then pointed back at `~/Documents/GetWrite`.
- Wording: signed off as built (recorded in `task-43.md`).
- Steps 2 to 6 (merges, refusals, Cancel and Escape, carry-over choices, reload and the mark after reopening, the compile, export, search, goal, Data view, status roll-up and tree surfaces, Trash and restore) all worked as the owner expected, apart from the items recorded above.
- Seen during the run, and reported by the owner as an issue that predates this feature: citations appear to render only a checkbox. Not investigated here; tracked in POS as `task_3032a6f2`.
- The owner approved Task 44.
