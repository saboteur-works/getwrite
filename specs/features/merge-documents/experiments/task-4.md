# Task 4: FR-1 (c) daily goal and (h) copy paths carrying the mark

Measurement task. No production file, `package.json` or lockfile was edited and nothing was committed. Two throwaway vitest files were written under `frontend/tests/unit/` (`zz-task4-probe-c.test.ts`, `zz-task4-probe-h.test.ts`), run, and deleted; `git status --short` was empty afterwards. Commit at run time: `ce509a987fce`. Node v24.15.0.

Labels: MEASURED = output of a probe run; READ = from reading source, no probe ran it.

## Method

Both probes ran from `frontend/` as `pnpm exec vitest run tests/unit/<file> --project node`, with `PROBE_OUT` set to a scratch file the test wrote its observations to.

- Probe (c) used the in-memory adapter and the project shape of `tests/unit/writing-log-core.test.ts`. Entries were written with `appendWritingLogEntry` (real timestamps assigned from the supplied instant). Figures were read with `getWritingLogAggregateCore` for three consecutive local days in UTC+10: day+0 is 2026-09-26 (window 2026-09-25T14:00Z to 2026-09-26T14:00Z), day+1 and day+2 the next two. Document D (the "absorbed" document) had entries 10 added / 2 deleted at 2026-09-26T01:00Z and 20 / 0 at 2026-09-26T12:00Z (both day+0), 5 / 1 on day+1 and 7 / 0 on day+2. Document T (the "target") had 100 / 0 at 2026-09-26T02:00Z. The mark was written by rewriting D's sidecar with `mergedMark: { targetId, snapshotRevisionId, date: "2026-09-26T06:00:00.000Z" }`. The value shape of the mark here is the probe's own, not a decided shape.
- Probe (h) used a real temporary project created with `createAndAssertProject` from the novel project type, `GETWRITE_PROJECTS_DIR` pointing at a temporary directory. A text document was created with `createResourceCore`, given `mergedMark` through `mutateSidecar`, then copied with `copyResourceCore` and duplicated with `duplicateResource`; each result sidecar was read back with `readSidecar`.

## (c) Daily goal and the mark

MEASURED, probe (c). Totals are the `totals` of `getWritingLogAggregateCore` (all documents, no goal filter, no Inbox set), shown as net.

| Step | day+0 | day+1 | day+2 |
|---|---|---|---|
| A. entries written, no mark | 128 (D 28, T 100) | 4 | 7 |
| B. `mergedMark` set on D | 128 | 4 | 7 |

- Setting the key on D changed no figure on any of the three days, and `incomplete` stayed false. Observed: `getWritingLogAggregateCore` and the code it calls (`aggregateForRoot`, `findExcludedDocumentIds` in `writing-log-core.ts`) read from the sidecar only `folderId` and `type`. READ: no line of `writing-log-core.ts` or `writing-log.ts` names the key.
- Arithmetic only, not product code: applying "skip a document's entries whose timestamp is after the mark date" to the same entries, with the mark at 06:00Z on day+0, gives D a day+0 net of 8 (the 01:00Z entry counts, the 12:00Z entry does not), and 0 on day+1 and day+2. In this probe the 12:00Z entry and the 06:00Z mark are both artificial: the entry exists before the mark is written but is dated after it. Whether a real merge can leave such an entry (a clock moving back, or an entry written for a merge made earlier the same day) was not measured.
- Not established: the stored form of the mark's date. Entries are instants (`timestamp`, ISO) filed in UTC day files and the window is a client-supplied local day. A mark date stored as a date only, or as an instant, would give different outcomes for entries on the day of the merge; Task 15 and Task 30 must choose and test each.

### Does `writing-log-core.ts` count an Inbox item's words "from then on"?

MEASURED, probe (c), D with entries on day+0 (28 net), day+1 (4) and day+2 (7), T 100 on day+0, `inboxFolderId` set to a folder `INBOX`:

| Step | day+0 | day+1 | day+2 |
|---|---|---|---|
| D in an ordinary folder, no Inbox config | 128 | 4 | 7 |
| `inboxFolderId` set, D still in an ordinary folder | 128 | 4 | 7 |
| D moved into the Inbox (sidecar `folderId` rewritten) after its entries were written | 100 | 0 | 0 |
| a new entry (+1000, day+0 13:00Z) written for D while D is in the Inbox | 100 | 0 | 0 |
| D moved back out | 1128 (D 28 + 1000, T 100) | 4 | 7 |

Observed behaviour: membership is read from the sidecar's present `folderId` at every read. A move into the Inbox removed D's entries written before the move from the figures of all three days, and a move out brought back every entry of D, including the one written while D was in the Inbox. So the figure follows the document's current folder for all its entries, with no date boundary. The root `CLAUDE.md` glossary says that filing an item out of the Inbox "makes all its words count from then on". The observation above is that, at the figure level, entries written before the move out count too. This record states the observation for the docs task, which owns any correction. READ: the existing test "after the document is moved out its entries count" in `writing-log-core.test.ts` ("Inbox exclusion") covers the move-out direction; the move-in direction and the per-day split above are from this probe.

## (h) Copy paths and the `mergedMark` key

MEASURED, probe (h), on current code. The source sidecar held `mergedMark` as `{ targetId: "t-1", snapshotRevisionId: "rev-x", date: "2026-09-26T06:00:00.000Z" }`.

| Path | Copy has the key | Copy's value | Source keeps its mark |
|---|---|---|---|
| `copyResourceCore(projectId, sourceId, "Copy")` | true | equal to the source's value | yes, unchanged after both calls |
| `duplicateResource(projectRoot, sourceId)` | true | equal to the source's value | yes, unchanged after both calls |

This agrees with the Feature 120 `task-3.md` (d) and (m) measurement, which found an unknown top-level sidecar key carried by both paths.

Where each builds the copy's sidecar (READ, with the lines):

- `copyResourceCore`, `frontend/src/lib/models/resource-crud-core.ts` line 372: `remapCopiedAnnotations(projectRoot, newId, { ...(sourceSidecar ?? {}), id: newId, name: newName, createdAt: new Date().toISOString() })`, written by `writeSidecar` at the next statement. The whole source sidecar is spread.
- `duplicateResource`, `frontend/src/lib/models/resource-templates.ts` line 528: `remapCopiedAnnotations(projectRoot, newId, { ...meta, id: newId })`, written by `writeSidecar` at the next statement. The whole source sidecar is spread.
- `remapCopiedAnnotations`, `frontend/src/lib/models/annotation-copy.ts`: returns the sidecar it is given with `annotations` replaced when present; it returns the input unchanged when the type is not text or source, or when there are no notes and no marks. It does not read or remove other keys.

Where a drop would sit (a reading, not a measurement): both call sites build an object literal from a spread of the source sidecar immediately before `remapCopiedAnnotations`, so each is one place; there are two places, one per path, as the spec's FR-5 test list assumes. Task 22 owns the edit.

## What is not established

- Whether a real merge can leave a writing-log entry for an absorbed document dated after the mark (see (c)).
- The stored form of the mark's date (instant or date only).
- The daily figure with a goal filter set (the filtered branch of `aggregateForRoot`, `resolveFilterMembers`) and with a Source: not probed. READ: the filtered branch checks membership by document id from `evaluateGoalMembership`, not from entry data, so the same mark-blind reading applies to it, but no probe ran it. Task 30 must test it.
- Copy paths for a document in a locked project, Source copies (`seedSource`), and Trash restore of a marked document: not probed here (Task 7 covers Trash).
- Real-filesystem writing log: probe (c) used the in-memory adapter; probe (h) used the real filesystem for sidecars only.

## Tests and build

Only the two throwaway probes ran (both passed as harnesses, not as assertions of behaviour). `pnpm typecheck`, `pnpm lint`, `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck`: not run, because no file under `frontend/src/lib/models/`, `cli/` or `electron/` was edited and the only repository file created is this record.
