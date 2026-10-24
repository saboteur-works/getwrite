# Feature 92 experiments: one project.json lock

Each item is MEASURED (observed in a run, stated as values) or UNMEASURED (not run, with the reason). No cause is written for any value.

## Environment record

- Date of all runs below: 2026-10-23.
- Branch `fix/project-json-write-lock`, main checkout, no worktree.
- `git rev-parse HEAD`: `a8931fb2a7889d0c26daaa76bcf58be09bcf3fd1`.
- `git status --short` before any run: empty output (clean tree).
- Node `v24.15.0` (`node -v`). Vitest v4.1.6 (as printed by the runs).
- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN`, run immediately before `pnpm test:e2e`: no output, exit 1 (nothing listening on 7340, 3000 or 6006). Run again after the suites on 6006: no output, exit 1.
- `pnpm test:ci`, `pnpm test:e2e`, `pnpm knip` and the CLI and electron suites were run outside the sandbox; `typecheck` and `lint` inside it. Logs were written to the session scratchpad, not the repo.

## Baselines (unchanged tree)

| Command | Directory | Observed |
| --- | --- | --- |
| `pnpm typecheck` | `frontend/` | exit code 0 |
| `pnpm lint` | `frontend/` | exit code 0; `391 problems (0 errors, 391 warnings)`; 7 warnings reported as potentially fixable with `--fix` |
| `pnpm test:ci` (`vitest run`) | `frontend/` | exit 0; Test Files 660 passed (660); Tests 7925 passed, 2 expected fail, 1 skipped (7928); duration 46.44s. Failed: 0 |
| `pnpm test:e2e` (`playwright test`) | `frontend/` | exit 0; 230 passed, 1 skipped, 0 failed (1.1m). Names of failures: none |
| `pnpm knip` | repo root | exit 1 (`ELIFECYCLE`). Findings by section: Unused files 49; Unused dependencies 1; Unused devDependencies 4; Unlisted dependencies 6; Unlisted binaries 4; Unused exports 160; Unused exported types 174; Duplicate exports 14. Sum 412. Separately, 6 configuration hints (not counted as findings) |
| `pnpm --filter getwrite-cli test` | repo root | exit 0; Test Files 23 passed (23); Tests 153 passed (153). Stderr lines `error: missing required argument 'scrivPath'`, `error: missing required argument 'source'`, `error: unknown option '--saved-types-dir'` were printed during the passing run |
| `pnpm --filter getwrite-electron test` | repo root | exit 0; Test Files 34 passed (34); Tests 528 passed (528) |

Notes on the figures:

- The knip baseline is a non-zero exit on the unchanged tree; later tasks compare finding counts per section against this table, not against exit 0.
- The lint figure is warnings only; later tasks compare the count 391 and the error count 0.
- `git status --short` after all runs: empty output (no change outside `specs/`; this file is the only addition and was written after the check).

## Not measured

- Nothing in the Task 1 command list was skipped.

## FR-15 sidecar races

Task 2. Run on 2026-10-23 on branch `fix/project-json-write-lock` at `HEAD` `ce84dc34` (no source change; `main`'s sidecar and lock code is unchanged on this branch). Run inside the sandbox with Vitest v4.1.6 via an experiment-only config, so `frontend/vitest.config.ts` is not edited and the suite does not reach the script.

- Script: `specs/features/project-json-single-lock/scripts/fr15-sidecar-races.test.ts`; config: `specs/features/project-json-single-lock/scripts/vitest.fr15.config.ts`.
- Command, from `frontend/`: `timeout 580 pnpm exec vitest run --config ../specs/features/project-json-single-lock/scripts/vitest.fr15.config.ts < /dev/null`. Exit 0, 1 test passed (the test records counts and does not assert on them).
- Design: each repetition builds a fresh project in its own subdirectory (`rep-<n>`) with one sidecar `{ id, updatedAt: "1970-01-01T00:00:00.000Z", marker: "before", userMetadata: { tone: "ominous", other: "keep" } }`, one canonical revision and a one-field metadata schema. Two writers are started together via `Promise.allSettled`, the second delayed 0-3 ms by a per-repetition offset. Each writer changes a distinct field:
  - `sidecar` writer: `readSidecar` then `writeSidecar` (`withMetaLock`) setting `marker: "after"`.
  - `revision` writer: `updateRevisionInPlace` (`revision-content:` `acquireLock`), which sets `updatedAt`.
  - `migrate` writer: `clearField` (reaches `forEachUserMetadata`, `metadata-schema.ts:307`), which deletes `userMetadata.tone`.
- After both settle the sidecar is read from disk. A "lost change" is one writer's field not holding its new value (`marker !== "after"`, `updatedAt` still the 1970 value, `userMetadata.tone` still present). "Unparseable" is a sidecar that does not `JSON.parse`. Counts are per writer change, so one repetition can lose up to 2.
- Temp directories are left in place (not cleaned) so the sidecars can be inspected.

| Pair | Repetitions | Lost changes | Unparseable files | Rejected writer promises | Temp directory |
| --- | --- | --- | --- | --- | --- |
| `writeSidecar` vs `updateRevisionInPlace` | 100 | 41 | 0 | 0 | `/tmp/claude-501/gw-fr15-sidecar-revision-sDoVl3` |
| `writeSidecar` vs `forEachUserMetadata` (via `clearField`) | 100 | 10 | 0 | 0 | `/tmp/claude-501/gw-fr15-sidecar-migrate-xmpLAN` |
| `updateRevisionInPlace` vs `forEachUserMetadata` (via `clearField`) | 100 | 0 | 0 | 0 | `/tmp/claude-501/gw-fr15-revision-migrate-lpa4HL` |

Breakdown read back from the retained sidecars (observed final states):

- `writeSidecar` vs `updateRevisionInPlace`: 59 repetitions held both changes, 23 held `marker: "after"` with `updatedAt` unchanged, 18 held `updatedAt` changed with `marker: "before"`.
- `writeSidecar` vs `forEachUserMetadata`: 90 repetitions held both changes, 9 held `marker: "before"` with `tone` removed, 1 held `marker: "after"` with `tone` still present.

An earlier 3-repetition smoke run of the same script (directories deleted) recorded 0, 3 and 0 lost changes for the three pairs in the order above.

Observed, no cause stated: two pairs reproduced a lost update on this tree: `writeSidecar` vs `updateRevisionInPlace` (41 of 100 repetitions' worth of changes) and `writeSidecar` vs `forEachUserMetadata` (10 of 100). `updateRevisionInPlace` vs `forEachUserMetadata` did not (0 of 100). Per the Task 2 and spec FR-15 rule this is a scope question for the owner; sidecars are out of scope until decided, and no source was changed.

Closing line: lost update reproduced: YES for 2 of 3 pairs (`writeSidecar` vs `updateRevisionInPlace`; `writeSidecar` vs `forEachUserMetadata`); NO for `updateRevisionInPlace` vs `forEachUserMetadata`. Unparseable sidecars: 0 in all 300 repetitions.

## FR-16 cross-request reads

Task 3. Date 2026-10-23, branch `fix/project-json-write-lock`. Read-only task: no source change, nothing run, no test or script executed. Every item below is READ (the file and line were read, not executed); nothing is MEASURED in this section. A reading states what the code does, not that the loss happens; where a loss is predicted it is a hypothesis and the experiment that would settle it is named. Searches used `/usr/bin/grep` over `frontend/src`, `frontend/app`, `frontend/components`, `cli/src` and `electron/src`; the line numbers are as of `HEAD` on this branch.

### Part A: `project.json`, per writer family

Definition used: a "cross-request" or "cross-function" read-then-write is one where the value a write is based on was read in an earlier function or request than the write, so no lock held by the writer covers the read. A client that sends a whole block it holds in memory is the same pattern, because the server cannot see that the block is older than the stored one.

| Family | Callers read (file:line) | Result |
| --- | --- | --- |
| A, editor config | `editor-config-core.ts:106-124` (read inside `updateProjectJson`). Senders: `native-editor-config-backend.ts:52`, `:66`; `lib/api/editor-config.ts:128` `saveHeadingSettings`, `:144` `saveBodySettings` | Server side: none found. The core merges each of `headings` and `body` as a whole block over the stored `config.editorConfig` (`:113-119`); a client that holds an older whole `body` or `headings` replaces the stored block. Which UI component builds the block was not traced beyond the transports. Candidate for a follow-up (client whole-block, same class as the features route); effect UNMEASURED. |
| A, rename | `project-crud-core.ts:531-534`; sender passes only the new name | none found |
| A, preferences | `project-preferences-core.ts:91-103`; `mergeUserPreferencesIntoProjectMetadata` merges a partial over stored metadata; senders `UserPreferencesPage.tsx:119`, `AppShell.tsx:851` | none found (partial merge inside the lock) |
| A, default revision name | `revision-settings.ts:30-37`; a scalar | none found |
| A, tags | `tags.ts:76-85` `mutateTags`; `createTag :121`, `deleteTag :148`, `createCheckedTag :248`, `updateTag :279`, `assignTagToResource :313`, `unassignTagFromResource :345`; each check (duplicate name, missing tag) runs inside the mutate callback. `listTags :99`, `listResourcesByTag :374`, `tags-crud-core.ts:100` read for display only | none found |
| B, word-count goal / daily goal / mention highlight duration | `word-count-goal-core.ts:55-70`, `writing-log-core.ts:181-196`, `mention-highlight-duration-core.ts:63-76`; each sets one scalar | none found |
| B, entity graph settings | `entity-graph-settings-core.ts:124-131`: sets `entityGraphConnectionTypes` (the whole list) and `entityGraphFocalHopRadius` together from the request | Server side: none found. Client sends the whole connection-type list and the radius, so two stale clients overwrite each other's key even under a correct lock. Same class as the features route; UNMEASURED. |
| B, project noise words | `project-noise-words-core.ts:113-125` `mutateNoiseWordLists`; callers `addCustomNoiseWordCore :144`, `removeCustomNoiseWordCore :165`, `excludeGlobalNoiseWordCore :184`, `unexcludeGlobalNoiseWordCore :205` each add or remove one item inside the lock. `readRawConfig :85-91` and `getNoiseWordListsCore :100` are display reads | none found |
| C, 13 `withLockedSchema` operations and the migrations | `metadata-schema.ts:100-114`; dispatch `metadata-schema-dispatch-core.ts:258-376` (one action per operation, applied to the in-lock schema). `reorderFields :617` and `reorderGroups :747` take a client ordering and throw if it does not match the in-lock set exactly (`:625-631`, `:752-757`) | none found for a silent loss. A stale ordering after a concurrent add fails with a visible error. |
| C, `migrateProjectOnLoad` | `metadata-schema.ts:389-438`; called from `project-loader.ts:97`. The first `readProject` (`:392`) decides whether to scan; `seeded` is computed from the sidecars outside the lock (`:394-396`, `detectFeatureDataFromSidecars :352-376`) and written inside the lock (`:418`) when `features` is still undefined | One cross-function read that is written later: the sidecar scan result `seeded`, read outside the lock, is stored in `config.features`. The project file itself is re-read inside the lock. It is the read FR-2 already allows outside the lock (it decides what to seed); recorded, not a follow-up candidate on its own. |
| C, `getSchema` migration | `metadata-schema.ts:475-496` (re-read inside lock `:485`) | none found |
| D, `updateFeatureConfig` | callers `app/api/project/features/route.ts:77`, `native-feature-config-backend.ts:71`, `import-scrivener-project.ts:447`; client thunks `projectsSlice.ts:531` (`updateProjectRelationshipTypes`), `:538` (`updateProjectSubtypes`), `updateProjectFeatures`, `updateProjectOrganizerCardBody` through `makeFeatureConfigThunk` (`:495`). UI senders: `SubtypesSettings.tsx:63` (`persist([...subtypes, trimmed])`, the list comes from the Redux selector `selectActiveProjectSubtypes`), `RelationshipTypesSettings.tsx:76` (`persist([...relationshipTypes, trimmed])`) | FOUND, see F-1. |
| E, `bumpMetadataRevision` | `sidecar.ts:27-47`, called at `:180` | none found (read, `+1` and write are one function, no value from an earlier request) |

`POST /api/project/features` (explicitly addressed). READ: `app/api/project/features/route.ts:77-82` passes the request's `features`, `organizerCardBody`, `relationshipTypes` and `subtypes` to `updateFeatureConfig`, which replaces each provided block wholesale (`project-features.ts:112-123`, doc comment `:60-63`). The UI builds `subtypes` and `relationshipTypes` as the complete new list from the Redux copy plus one added item (`SubtypesSettings.tsx:94`, `RelationshipTypesSettings.tsx:110`; the removal and reorder handlers send the complete list the same way). A list that was changed by another tab, window or paired device after this client loaded it is overwritten by the client's list. A per-file lock does not change this because the older list arrives inside the request. Whether it happens in the app was not run. The experiment that would settle it: two `updateFeatureConfig` calls, the second built from a list read before the first, 20 or more repetitions, counting items lost. Result of this task: found, F-1 below. `docs/features/project-configuration.md:20` is correct that the replacement is wholesale.

Writers of `project.json` found that the spec's inventory does not list: none. A search for `project.json`, `PROJECT_FILENAME` and write calls over `frontend/src`, `frontend/app`, `cli/src` and `electron/src` returned only the writers in the spec's two lists (families A to E; the creation and import writers `project-creator.ts:241`, `import-scrivener-project.ts:340`, `import-plaintext-project.ts:411`, `import-docx-project.ts:709`; `app/api/encryption/route.ts:304`). The other `PROJECT_FILENAME` users read only (`project-config.ts:46`, `:82`, `query-cache.ts:85`, `query-evaluate-core.ts:85`, `tags-crud-core.ts:100`).

### Part B: sidecars

Every `writeSidecar` caller (found by `grep`): `apply-document-metadata.ts:132`; `resource-crud-core.ts:311`, `:534`, `:706`, `:907`; `resource-templates.ts:526`; `trash.ts:240`, `:784`; `revision-core.ts:519`; `resource-persistence.ts:177`; `metadata-schema.ts:331`. Two sidecar writes do not go through `writeSidecar`: `resource-templates.ts:446` (a batch of files for a new resource) and `trash.ts:921` (restore, below).

Confirmation of the spec's S1 to S4 list (each read and write line read):

| Spec family | Read / write as read | Result |
| --- | --- | --- |
| S1 `updateSidecarCore` | `resource-crud-core.ts:505` / `:534` | confirmed. Both are in one function, so the read is not cross-request; the whole-object input is (below). A non-locked read error is turned into `null` (`:512-513`), so the write then builds the sidecar from the client's update alone. |
| S2 `updateRevisionInPlace` | `revision-core.ts:518` / `:519` | confirmed, same function |
| S3 `forEachUserMetadata` | `metadata-schema.ts:326` / `:331`; four callers at `:578`, `:770`, `:917`, `:1025` | confirmed. Comment at `:300-304` says unreadable sidecars are skipped; the code lets a read error from `readSidecar` (`:326`) propagate (only a missing sidecar returns `null`). Recorded as an observation about the comment, not changed. |
| S4 `setNoiseTermDismissedCore` | `resource-crud-core.ts:628` / `:642` (through `updateSidecarCore`) | confirmed as cross-function. CORRECTION: no production caller was found. The only importers are `tests/unit/resource-crud-core-noise-dismissal.test.ts` and a comment in `EntityRosterView.tsx:291`, which says it has no route or transport. The three UI dismissal paths build the list on the client (below). |
| S4 `renameResourceSidecarCore` | `:698` / `:706`; callers `app/api/resource/[resource-id]/rename/route.ts:88`, `native-resource-backend.ts:146` | confirmed, same function |
| S4 `reorderResourcesCore` loop | `:901` / `:907`; callers `app/api/projects/[projectId]/reorder/route.ts:26`, `native-resource-backend.ts:206` | confirmed, same function. `orderIndex` and `folderId` come from the client's order (`ro`); `folderId` from the client wins when non-null (`:905`). Positions arrive in the request; same class as OQ-9. |
| S4 `nullifyResourceRefs` | `trash.ts:206` / `:240`; called from `resource-crud-core.ts:353` (`deleteResourceCore`) and the folder path | confirmed, same function |
| S4 `relinkResourceRefs` | `trash.ts:735` / `:784` | confirmed, same function |
| S4 `applyDocumentMetadata` | `apply-document-metadata.ts:102` / `:132`; caller `import-scrivener-project.ts:684` | confirmed, same function |

Spec's "read-only callers" list: confirmed for every file named. Checked in the surrounding code: `resource-crud-core.ts:343` (reads the name for `deleteResourceCore`, then calls `nullifyResourceRefs`, `writeTrashRefRecord`, `softDeleteResource`; writes no sidecar from that read), `resource-templates.ts:1005` (builds a template from the sidecar; writes no sidecar), `metadata-schema.ts:363` (feature detection), `project-loader.ts:127`, and the importers' `:753`, `:493`, `:803` (read the name for a report). The rest of the list was matched by `grep` only. No `readSidecar` caller outside the writer files above can write a sidecar from its read, because the writers are the files listed. Callers of `readSidecar` found that the spec does not list: none.

Whole objects built from an earlier read, in another function or request (FR-16 sidecar extension):

| Sender | file:line | What it sends | Result |
| --- | --- | --- | --- |
| Page `updateResource` | `app/(app)/page.tsx:536` (`sent = applyUpdate(resource)`), overlay `:503-531` | a whole local resource copy; only `resourceSubtype` and `wordCount` are overlaid from Redux; other keys are "deliberately not reconciled" (`:507`) | cross-request whole object: FOUND, F-2 |
| `EntitySection` `persist` | `components/Sidebar/EntitySection.tsx:128-135`; dismissal `:186-189` | `updated` = `{ ...resource, ... }` | FOUND, F-2, F-3 |
| `EntityMentionsSection` | `components/Sidebar/EntityMentionsSection.tsx:600-606` | `{ ...resource, dismissedNoiseTerms: [...dismissedNoiseTerms, normalized] }` | FOUND, F-2, F-3 |
| `EntityRosterView` | `components/WorkArea/Views/EntityRosterView/EntityRosterView.tsx:301-310` | `{ ...resource, dismissedNoiseTerms: [...current, normalized] }` from the Redux copy | FOUND, F-2, F-3 |
| `WordCountGoalSection` | `components/Sidebar/WordCountGoalSection.tsx:73-75` | `updated` whole resource | FOUND, F-2 |
| `RemoveEntityControl` | `components/Sidebar/RemoveEntityControl.tsx:186` | `withoutEntityFields(resource)` plus `clearKeys` `["entityKind", "aliases"]` | FOUND, F-2 |
| `SubtypeSection` | `components/Sidebar/SubtypeSection.tsx:77-81` | `subtypePayload` (`:29-31`): only `{ resourceSubtype }` or `{}` | not a whole object; no stale-copy path found |

Does a client-sent `updatedAt` reach the stored sidecar? READ: yes, when the client copy carries it. `updateSidecarCore` drops only `wordCount` (`SERVER_DERIVED_SIDECAR_KEYS`, `resource-crud-core.ts:382`; `omitServerDerivedKeys :465-473`), then spreads the update over the stored sidecar (`:517-519`), so `updatedAt` from the update replaces the stored one. The client copy carries `updatedAt` (`types.ts:204`, `:303`; `schemas.ts:361`) and the canonical autosave writes the server's value into Redux after a save (`useCanonicalAutosave.ts:131-135`). A whole-object send composed before an autosave resolves would therefore carry an older `updatedAt`. Not run; Task 5 measures it (OQ-9).

Trash move and restore (input to OQ-10), READ:

- Move: `softDeleteResource` removes the resource from the indexes, then renames the live sidecar into `.trash/meta/` (`trash.ts:335-343`). It takes no `withMetaLock` or file lock. The delete path before it (`resource-crud-core.ts:343-364`) reads the sidecar, nullifies references in other sidecars, writes the ref record, and only then calls `softDeleteResource`; none of these steps is one unit under a lock.
- Consequence by reading, not run: a read-modify-write of that sidecar that reads before the rename and writes after it recreates `meta/resource-<id>.meta.json` (`writeSidecar` creates `meta/` and the file, `sidecar.ts:152-181`); one that reads after the rename gets `null` from `readSidecar` and `updateSidecarCore` writes a sidecar built from the client update alone (`resource-crud-core.ts:505-526`). Either leaves a live sidecar beside the trashed one. Hypothesis, untested; Task 5 measures it.
- Restore: `restoreResource` reads the trashed sidecar with `readFile` (`trash.ts:872-876`), computes the destination name and folder, then writes the live sidecar with `atomicWriteFile` directly (`trash.ts:921-925`) and removes the trashed copy (`:926`). This write does not go through `writeSidecar`, so it takes no `withMetaLock` and does not bump `metadataRevision`. WRITER NOT IN THE SPEC'S SIDECAR INVENTORY AS A WRITER (the spec lists it only under "Moves"); it is a direct `atomicWriteFile` to a sidecar path.

### Part C: writers found that the spec's inventory does not list (for Task 20)

1. `trash.ts:921` `restoreResource` direct `atomicWriteFile` of the live sidecar (`sidecarDest`). It bypasses `writeSidecar`, so the Task 16 sink and the Task 23 source scan (which keys on `writeSidecar`/`readSidecar`) would not see it. Left unlocked by the OQ-10 decision (option a); Task 23's allow-list must name it explicitly so a later change cannot go unnoticed.
2. `resource-templates.ts:446` builds `meta/resource-<id>.meta.json` as part of a batch for a new id (spec lists it as a first write; confirmed, no earlier copy). Also bypasses `writeSidecar`; allow-list it in Task 23.
3. `setNoiseTermDismissedCore` (`resource-crud-core.ts:619`) has no production caller, so converting it under FR-21 changes only tests today; the live dismissal writers are the three client senders in Part B.

No sidecar read-then-`writeSidecar` sequence beyond S1 to S4 was found. No `project.json` writer beyond the inventory was found.

### Follow-ups (POS notes to be created by the lead; none created here, no route contract changed)

- Follow-up (POS note to be created by lead): F-1. `POST /api/project/features` replaces `config.subtypes` and `config.relationshipTypes` (and `features`, `organizerCardBody`) wholesale from the client's list; a stale client list overwrites another writer's change under any lock. `app/api/project/features/route.ts:77`, `project-features.ts:112-123`, senders `SubtypesSettings.tsx:63`, `RelationshipTypesSettings.tsx:76`. Proposed title: "Project features route replaces subtype and relationship-type lists from a stale client copy".
- Follow-up (POS note to be created by lead): F-2. `updateSidecarCore` merges a whole client resource object over the stored sidecar; every key the client carries, including `updatedAt`, overwrites the stored value. `resource-crud-core.ts:517-519` (merge), `:382` (only `wordCount` dropped); senders `app/(app)/page.tsx:536`, `EntitySection.tsx:135`, `EntityMentionsSection.tsx:606`, `WordCountGoalSection.tsx:75`, `RemoveEntityControl.tsx:186`, `EntityRosterView.tsx:310`. Proposed title: "Sidecar update stores whole client object, so a stale copy overwrites newer keys".
- Follow-up (POS note to be created by lead): F-3. The three UI noise-term dismissal handlers compute the new `dismissedNoiseTerms` list on the client from Redux and send the whole list, while the server-side `setNoiseTermDismissedCore` that computes it from the stored list has no caller. `EntityMentionsSection.tsx:600-606`, `EntityRosterView.tsx:301-310`, `EntitySection.tsx:186-189`; server function `resource-crud-core.ts:619-643`. Proposed title: "Noise-term dismissal is computed on the client; server dismissal function unused".
- Follow-up (POS note to be created by lead): F-4. The trash move and restore of a sidecar are not under any lock, and restore writes the live sidecar by a direct `atomicWriteFile`. `trash.ts:335-343` (move), `trash.ts:872-926` (restore). Proposed title: "Trash move and restore of a sidecar are unlocked and can leave or lose a live sidecar" (title states the hypothesis; the lead may reword after Task 5 measures it).
- Follow-up (POS note to be created by lead): F-5. Editor config `body`/`headings` and the entity graph settings (`entityGraphConnectionTypes`, radius) are replaced as whole blocks from the client, the same class as F-1. `editor-config-core.ts:113-119`, `entity-graph-settings-core.ts:124-131`. Proposed title: "Editor config and entity graph settings replace whole blocks from the client". Lower confidence: the UI components that build these blocks were not traced.
- Follow-up (POS note to be created by lead): F-6. `reorderResourcesCore` writes `orderIndex` and a non-null `folderId` from the client's order over the stored sidecar. `resource-crud-core.ts:899-913`. Proposed title: "Reorder writes client-held positions over stored sidecar order". Lower confidence: positions from one drag are the intended input; a concurrent drag from a stale tree is not measured.

### Closing line

Cross-request or cross-function writers found: `project.json` 1 confirmed by reading (F-1) and 2 lower-confidence candidates (F-5 in two files); sidecars 3 (F-2, F-3, F-6) plus the trash paths (F-4). Spec S1 to S4 list confirmed, with one correction (S4 `setNoiseTermDismissedCore` has no production caller). Writers the spec does not list: `trash.ts:921` (direct restore write) and `resource-templates.ts:446` as a non-`writeSidecar` write; none for `project.json`. Nothing was run in this task.

## FR-10 before

Task 4. Run on 2026-10-23 on branch `fix/project-json-write-lock`, lock code unchanged (the only edited file is `frontend/tests/unit/metadata-concurrent-writes.test.ts`). Inside the sandbox, Vitest v4.1.6.

- Test: `an editor-style save racing a schema change keeps both changes` (replaces `...never leaves project.json unparseable`). Per repetition (20): fresh temp project (`os.tmpdir()/gw-meta-race-*`, removed by the file's `afterEach`), `addGroup("custom-group")`, then `Promise.all([updateEditorConfigCore({ projectId, body: { fontSize: "19px" } }), addField(projectRoot, "custom-group", { key: "mood", ... })])`. It then records `<rep>:unparseable` if `project.json` does not parse, `<rep>:fontSize` if `config.editorConfig.body.fontSize !== "19px"`, and `<rep>:mood` if no group field has `key === "mood"`; it asserts the list is empty.
- Command, from `frontend/`, 9 times: `timeout 300 npx vitest run tests/unit/metadata-concurrent-writes.test.ts < /dev/null`. Logs: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/fr10b-1.log` to `fr10b-9.log`.
- Observed failing assertion in all 9 runs: `AssertionError: expected [ '0:fontSize', ... ] to deeply equal []` (the list held 20 entries in every run).

| Run | Exit | Test result | Repetitions that failed (of 20) | Entries `:fontSize` | Entries `:mood` | `:unparseable` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | failed | 20 | 18 | 2 | 0 |
| 2 | 1 | failed | 20 | 18 | 2 | 0 |
| 3 | 1 | failed | 20 | 17 | 3 | 0 |
| 4 | 1 | failed | 20 | 18 | 2 | 0 |
| 5 | 1 | failed | 20 | 17 | 3 | 0 |
| 6 | 1 | failed | 20 | 19 | 1 | 0 |
| 7 | 1 | failed | 20 | 20 | 0 | 0 |
| 8 | 1 | failed | 20 | 18 | 2 | 0 |
| 9 | 1 | failed | 20 | 16 | 4 | 0 |

- Each failed repetition lost exactly one of the two changes (the two columns sum to 20 in every run); no repetition lost both or neither; no unparseable file. Totals over 9 runs: 161 `:fontSize` entries, 19 `:mood` entries, of 180 repetitions.
- Other tests in the file (`a status change survives a canonical save of the same resource`, `concurrent heading and body saves both reach project.json`): passed in all 9 runs (`Tests 1 failed | 2 passed (3)`). `tsc --noEmit` and ESLint on the file reported nothing.
- Difference from the comment this replaced (schema change lost in 20 of 20 repetitions in each of 9 runs): in these 9 runs the font size was the lost change in 161 of 180 repetitions and the field in 19. Not explained here. Hypothesis, untested: which writer reads first varies with scheduling; an experiment that logs read and write order per writer per repetition would settle it. The earlier comment's measurement may also have used a different assertion.
- Status: red by design until Task 15.
