# Experiments: Sources view, excerpts and citations, module registry (Feature 103)

Measurements are recorded as observed values. A cause is written only after an experiment has separated it from the alternatives.

## Environment

- Node: v24.15.0 (`node -v`), Darwin arm64 (Darwin 25.5.0), run inside the Bash sandbox.
- Base commit: `32924842` (`spec(feature-103): Sources module and first cut of the contribution seam`), branch `feat/sources-module-seam`, worktree for Wave 1 Task 1.
- Commands (from `frontend/`):
  - `pnpm exec vitest run tests/unit/indexer-queue.test.ts tests/unit/project-json-lock-scan.test.ts`
  - `F103_T1_OUT=<file> pnpm exec vitest run tests/unit/indexer-queue.test.ts -t "F103"` (appends the measurement line to `<file>`)
  - `pnpm typecheck`, `pnpm exec eslint tests/unit/indexer-queue.test.ts`
- Build: none. `next build`, `pnpm build:native` and `pnpm test:e2e` were not run (main checkout only, per `tasks.md`). No product source file was changed.

## Wave 1 config.modules read cost (FR-6)

Task 1. Test: `frontend/tests/unit/indexer-queue.test.ts`, `describe` "indexer queue per-save time with an extra project.json read (F103 Task 1)". It records; it asserts no timing threshold.

Method as built. `runTask` in `frontend/src/lib/models/indexer-queue.ts` is not exported, so each save is one `enqueueIndex` followed by `flushIndexer`, over a real-filesystem adapter wrapped to timestamp every adapter call. The span measured is the start of the first adapter call to the end of the last adapter call of that one task. In the "with" condition the wrapper, at the sidecar read that opens `runTask`, first awaits one plain `readFile` of `project.json` followed by `JSON.parse`, inside the measured span. No lock is taken for that read. The two conditions alternate (order flipped each iteration); 5 unmeasured warm-up saves precede them.

Project size: 40 text resources of 400 words each (`content.txt` plus sidecar), no entities, no backlinks authored; `project.json` 5252 bytes (200 statuses and 200 subtypes in `config`). Runs: 30 saves per condition per test run. The test was run 3 times in the same invocation shape (three test processes), giving these lines, with per-run median, min and max over 30 saves (milliseconds):

| Test run | Without extra read (median / min / max) | With one extra project.json read (median / min / max) |
| --- | --- | --- |
| 1 | 10.76 / 9.36 / 19.75 | 11.11 / 10.13 / 19.82 |
| 2 | 11.10 / 10.20 / 12.51 | 10.92 / 9.68 / 12.28 |
| 3 | 10.94 / 10.12 / 20.39 | 11.18 / 9.62 / 19.68 |

An earlier set of 3 runs with a 46-byte `project.json` gave medians of 10.72, 10.89, 10.92 ms without and 11.06, 10.82, 10.77 ms with the read; an intermediate set of 3 runs at 5252 bytes gave medians of 11.06, 11.22, 11.15 ms without and 10.97, 11.11, 11.04 ms with it.

Observed: across these runs the per-save median is about 10.7 to 11.2 ms in both conditions, and the difference between the two medians within a run ranges from -0.2 to +0.4 ms. Min and max vary by run. These are values from one machine and one project size; no cause is stated for them, and the 30-run samples were not tested statistically.

## FR-9 reindex runs

Not yet recorded.

## FR-10 spike

Not yet recorded.

## Module-switch cases

### Module-switch write path choice (Task 8)

Choice: a new operation (`module-config-core.ts`, `PUT /api/project/modules`, `lib/api/modules.ts`, `native-modules-backend.ts` and its web-stub, one `next.config.mjs` alias), following `goal-filter`. The existing `updateFeatureConfig` path (`POST /api/project/features`) was not reused or extended. This is a reading from the code, not a measurement.

Reasons read from the code:

- `updateFeatureConfig` takes whole blocks: `features`, `organizerCardBody`, `relationshipTypes`, `subtypes`, `statuses` each replace the stored block. A module flag written through it would need a new `modules` block replaced whole, which is last-write-wins over the entire map (the route's own header says so for its blocks). Two devices switching different modules would drop one flag, and a flag written by a newer build for an id this build does not know would be dropped when an older build writes back its copy of the map. FR-5 asks that unknown module ids survive. The new core reads the stored map inside the lock and sets one entry.
- `updateFeatureConfig` also sets `project.updatedAt` and, for `features`, enforces the Timeline invariant. The switch needs neither, and FR-6 (a) wants only the one `config.modules` entry to change.
- `POST /api/project/features` has a pinned role: `sharing-limits-routes.test.ts` lists it as unlimited, and its response type is `FeatureConfigResult`. Extending it would widen a route and a transport used by the seven existing flags, which FR-5 asks to stay unchanged.
- The new route validates a request of exactly `projectId`, `moduleId`, `enabled`, refuses any other key with one message shared by the route and the native backend, and never echoes client input.

Paired-device limit for this write (FR-12, FR-13): no `checkLimit` call, none expected. The write overwrites one config entry and deletes no writer data (module data is kept when a module is off). `sharing-limits-routes.test.ts` was run and still passes (see the Task 8 report). Recorded as a reading; no paired-device run was made.

Case (a), data on disk byte-identical before and after switching off and on: tested in `frontend/tests/unit/module-config-route.test.ts` ("leaves every file but the config.modules entry byte-identical across off then on") over a real temporary directory with a project, a Source resource, its sidecar, a revision and an index file. After each switch every file other than `project.json` has the same bytes and the same file set, and `project.json` equals the original once its `config.modules` key is removed.

Native lock parity with the server is reasoned from both calling the same core, not run on a device; no Android run was made.

Cases (b), (c) and (d): not yet recorded here (Tasks 7 and 13).

## FR-13 inventory

Task 14. Classification is by reading the code and the existing limit routes; no paired-device run was made for the new rows beyond the unit tests named below. "Covered" means an existing switch applies; no sixth switch is proposed.

Done in Task 14 (tested): `DELETE /api/annotations` now calls `checkLimit(req, "permanentDeletion")` before `withStorageContext` and before the body is parsed, for every annotation (plain note, and later excerpt and citation). Tests: `frontend/tests/unit/sharing-limits-routes.test.ts` (403 `{ error, limit }` for a paired device with the limit on and for an unclassified request; 200 for the window and for a paired device with the limit off; the route is pinned in the limited-route list; the switch list is still the five keys). This changes existing paired-device behaviour for plain notes (owner decision OQ-10).

### Wave 1 actions (reading)

| Action Wave 1 adds                                                              | Permanently deletes or overwrites data?                                                                                                            | Classification and cover                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module-config write (Task 8): sets one `config.modules` entry in `project.json` | Overwrites one config entry; deletes no writer data. Switching a module off keeps its data (FR-6 a, tested in Task 8).                             | Reading: a config write of the same kind as the existing `POST /api/project/features` write (`updateFeatureConfig`), which is in the unlimited list in `sharing-limits-routes.test.ts`. No existing switch applies and none is needed; it is not a deletion of data, so the owner's decision is not needed. Reading: no paired-device limit check expected on the Task 8 route ("none expected"); Task 8 records the confirmation. |
| Registry and manifest (Tasks 3, 9)                                              | No storage operation.                                                                                                                              | Not applicable.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Shared derived-index rebuild (Tasks 5, 6, 7)                                    | Rewrites derived files (`inverted.json`, `backlinks.json`, `index/mentions.json`) the same way the importers and `reindex` do today; no new route. | Not applicable: no route is added; the rebuild is internal to importers and the CLI.                                                                                                                                                                                                                                                                                                                                               |
| Sources view, read of the project's Sources (Tasks 12, 13)                      | Read-only list; may add a list-read operation (Task 12).                                                                                           | Reading: read-only, not limited.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Module switch control (Task 10)                                                 | Calls the Task 8 write.                                                                                                                            | Same as the module-config write.                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR-10 spike (Task 15)                                                           | Throwaway worktree; not on the branch.                                                                                                             | Not applicable.                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Wave 2 and Wave 3 actions (for Task 34 to complete)

| Action                                                          | Reading of the existing mechanism                                                                                                  | Existing switch that covers it                                                                                                                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove an attachment                                            | `removeAttachmentCore` moves the file to Trash as an `attachment` item (`source-attachments-core.ts`, header comment); restorable. | Not a permanent delete at this step. Not yet decided whether it needs a switch; the Trash move is not limited today (`project/source-attachments/route.ts` does not call `checkLimit`). |
| Replace an attachment                                           | `replaceAttachmentCore` moves the previous file to Trash.                                                                          | Same as remove.                                                                                                                                                                         |
| Purge a removed attachment or a Source from Trash               | `POST /api/project/[project-id]/trash/purge` (`discardTrashAttachment` for the attachment kind).                                   | `permanentDeletion`, covered.                                                                                                                                                           |
| Empty Trash                                                     | Same purge route, `all: true`.                                                                                                     | `permanentDeletion`, covered.                                                                                                                                                           |
| Delete an excerpt                                               | An excerpt is an annotation (OQ-156); `DELETE /api/annotations`.                                                                   | `permanentDeletion`, covered by Task 14.                                                                                                                                                |
| Delete a citation                                               | An annotation with a `target`; `DELETE /api/annotations`.                                                                          | `permanentDeletion`, covered by Task 14.                                                                                                                                                |
| Re-attach, edit an annotation, excerpt or citation (PUT, PATCH) | Overwrites a body or quote in the sidecar; no data is removed.                                                                     | Not limited (as notes today); not yet decided.                                                                                                                                          |
| Attachment byte-read (Task 19)                                  | Read-only.                                                                                                                         | Not limited; read-only.                                                                                                                                                                 |
| Create or rename a Source (Task 18)                             | Create adds data; rename overwrites a name field through the existing resource update path.                                        | Not yet decided for any new route; existing create and rename paths are not limited.                                                                                                    |
| Reorder attachments                                             | Existing `reorderAttachmentsCore`; overwrites an order list.                                                                       | Not yet decided; not limited today.                                                                                                                                                     |
| Module switch off or on (Task 8)                                | Config entry write.                                                                                                                | None applies (see above).                                                                                                                                                               |
| Any other route Waves 2 and 3 add                               | Not known yet.                                                                                                                     | Not yet decided; Task 34 lists it.                                                                                                                                                      |

## Wave 2 Android image display

Not yet recorded.

## Wave 2 Android 100 MB baseline

Not yet recorded.

## Not verified

- Task 1: the measurement covers the extra read as issued from a wrapper adapter at the start of the task, not a read added inside `runTask` (that would be a product source change, which Task 1 does not make; Task 7 applies it). Only one machine, one project size and one storage adapter (real filesystem, no encryption, no hosted tenant adapter) were measured. A locked or encrypted project was not measured.
- `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck` were not run for Task 1 (the only file changed under the code tree is a frontend test; no models, `core.ts`, `cli/` or `electron/` file changed).
- A write of project.json by an older build dropping or keeping a newer module flag: not run.

## Acceptance

Not yet recorded.
