# Task 40: Undo routes and client carry the merge outcomes (FR-22)

Results only. Committed with the task.

## Files

- `frontend/app/api/project/split/undo/route.ts`: reads the stored record (`readLatestOperation`) and sends a merge record to `undoLatestMerge`; every other state (split record, no record, unreadable record) goes to `undoLatestSplit` as before. `record-changed` added to the fixed list of `could-not-be-checked` causes.
- `frontend/app/api/project/split/latest/route.ts`: **not edited.** It already returns the record with its `kind` (`split` or `merge`), `none`, and a failed read as `failed` with the stable cause `record-unreadable`; the new test pins that for a merge record.
- `frontend/src/lib/api/split.ts`: new merge result kinds (`MergeUndoClientResult`), a merge body schema, `mergeUndoResultOf`. `nothing-to-undo`, `could-not-be-checked` and the transport `failed` are shared with the split Undo.
- `frontend/tests/unit/split-undo-routes.test.ts`: new tests appended; the module mock gained `undoLatestMerge: vi.fn()` (setup line, no test changed).
- `frontend/tests/unit/split-transport.test.ts`: new tests added; **one existing test edited** (see below).

Edits outside the declared Files, each needed:

- `frontend/src/lib/models/split-undo-core.ts`: `undoLatestMerge` is exported (the route needs it); `MergeUndoAppliedFields` gained `targetName: string | null`, read after the locks with the sidecar `name`, `null` when that read fails (Undo is not affected). Reason: done_when asks for "undone with the target's name"; the Task 38 result carried only ids.
- `frontend/tests/unit/merge-undo-core.test.ts`: one new test (`reports the target's name`); no existing test touched.
- `frontend/components/Split/SplitUndoHost.tsx`: `reportNotCommitted` got a case for the four merge kinds so the frontend typechecks. It is a placeholder that Task 41 replaces: it resets availability and shows the existing "could not be checked" text. This host only runs while the stored record is a split, so a merge kind reaches it only if the record changed between the availability read and the request. It is not a result text for a merge Undo and it is not the final behaviour.

## Test-first (red run)

Route tests (`split-undo-routes.test.ts`) before the route change: 9 failed, 40 passed (the 9 new merge-record tests failed; the route still called `undoLatestSplit`). Transport tests (`split-transport.test.ts`) before the client change: 6 failed, 52 passed. After: both files green (49 and 58 tests; with `sharing-gate-enumeration` and `SplitUndoAction` selected: 3 files, 150 passed, 1 skipped).

## The one existing test edited

`split-transport.test.ts`, "maps nothing-to-undo, unsupported-operation and could-not-be-checked to their own kinds": its `unsupported-operation` row used `kind: "merge"`. done_when says the client no longer maps `unsupported-operation` for a merge, so the row now uses `kind: "future-kind"`; its expectation (kind `unsupported-operation`) is unchanged. The merge body is covered by a new test: an `unsupported-operation` body with `kind: "merge"` maps to `could-not-be-checked` with cause `unsupported-operation` (nothing was undone, and the check did not complete).

## Done-when clauses

| Clause | Test / fact |
|---|---|
| Latest read returns the record with its kind or none, a failed read distinct from none | `latest route: a merge record` (new), existing `none` and `failed` tests unchanged and green |
| Undo route returns typed outcomes for a merge: undone with the target's name and number of absorbed documents, refused with cause, failed with the state that remains, index-failed | `undo route: a merge record` (route, with the core faked); client: `merge-applied` (`targetName`, `absorbedCount`), `merge-refused` (reason and `MERGE_UNDO_REFUSAL_MESSAGES` text, not the server's), `merge-failed` (step, remaining state), `merge-index-failed` |
| Split outcomes unchanged, existing tests pass | existing tests of both files pass (one row edited as above) |
| `withStorageContext`, validated `projectId`, no path, locked fail closed | route unchanged in these respects; merge locked test (401, 409, other errors rethrown); the existing 400 and `withStorageContext` tests still pass |
| Hosted: only the signed-in tenant's project | `hosted tenancy of a merge Undo` (cores faked over the storage context, as the split tests do) |
| Client no longer maps `unsupported-operation` for a merge | see the edited test above and the new test |
| Route enumeration and smoke counts | **No route was added.** The two routes already exist and are enumerated; `sharing-gate-enumeration.test.ts` passes unmodified, so its route-file and route/method counts (90 and 126, per its Feature 120 Task 31 note) and the smoke script are unchanged |

## Decisions and assumptions

- Dispatch lives in the route, not in `undoLatestOperation`. Reason: the existing route tests mock `undoLatestSplit` at the module boundary, and a call from inside the core module to `undoLatestSplit` would not reach that mock; the route-level dispatch keeps those tests valid unchanged. `undoLatestOperation` (Task 38) is left in place and tested by `merge-undo-core.test.ts`.
- The route reads the record, then the merge core reads it again inside its locks and refuses a difference (`record-changed`).
- The server's refusal `message` is not used by the client; the client maps the reason to its own text table, as the split client does.
- `failures` of `merge-index-failed` use the same step labels as the split Undo.
- A failed target-name read gives `targetName: null`, which the client passes on; the host must not show an empty name (Task 41).

## Checks

- `pnpm typecheck`, `pnpm lint` (0 errors, 459 warnings), `pnpm --filter getwrite-electron typecheck` (both passes), `pnpm --filter getwrite-cli typecheck`: clean.
- Prettier check on the touched files: clean.

## Not measured

A real HTTP round trip through the Next server for a merge Undo (the route tests fake the cores; the cores are tested separately); a real hosted tenant or a paired device; Android (HTTP only, so not offered there); the host's behaviour for a merge result (Task 41).
