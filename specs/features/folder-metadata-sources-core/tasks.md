# Tasks: Folder metadata, folder subtypes and Sources core (Feature 102)

Source spec: `specs/features/folder-metadata-sources-core.md` (FR-1..FR-38, US-1..US-2; OQ-1..OQ-12 all resolved at Gate 3, 2026-11-07, and folded into the FRs). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 102. Branch: `feat/folder-metadata-sources-core`; one PR for both parts (FR-37).

Shape of the work: settling tests first, then one deliberate enum task, then two parts that share hot files and are therefore ordered.
- Tasks 1-3: Part 1 settling tests (FR-2 (a), (b), (c)) and the experiments file. No product change. Part 1 product changes (Tasks 6 onward) depend on all three.
- Task 4: `source` added to `ResourceTypeSchema`, the FR-18 type-branch survey recorded, and `frontend/` typecheck made green. Task 5 makes `cli/` and `electron/` typechecks green. Every other Part 2 task depends on Task 4.
- Task 6: the single declaration task for shared model files (`schemas.ts`, `types.ts`, `lib/api/schemas.ts`). After Task 6 no task edits those three files except where its own Notes say so.
- Part 1, folder metadata (Tasks 7-19): 7 -> 8 -> 9 (transport); 8 -> 10 -> 11 -> 12 (Trash and folder operations); 6 -> 13 (fields); 3, 8 -> 14 (query) -> 16, 17 (surfaces); 9, 13 -> 15 (sidebar); 8 -> 18; 5 -> 19.
- Part 2, Sources core (Tasks 20-36): 12 -> 20 -> 21 -> 23 -> 24 -> 25 -> 27 -> 28; 22 beside; 29 after 23; text-parity tests 30-32 after 29; sidebar 33 after 15 and 28; e2e 34; FR-31 (d) 35; FR-30 record 36.
- Tasks 37-38: docs. Task 39: acceptance.

Hot files and the order in which tasks touch them (tasks listed for one file must never run concurrently; the dependency graph already forces this order):
- `schemas.ts`, `types.ts`, `lib/api/schemas.ts`: Task 4 (enum), Task 6 (all declarations).
- `sidecar.ts`: Task 7 only (Task 8 uses `mutateSidecar`; attachments in Task 23 use it without editing it).
- `trash.ts`, `trash-core.ts`: Task 10, then 11, then 24, then 25 (Task 26 adds tests and edits only if a test fails).
- `resource-crud-core.ts`: Task 12 (reorder, only if a test fails), Task 20, Task 21, Task 23 (only if a test fails), Task 29.
- `MetadataSidebar.tsx`: Task 15, then Task 33.
- `next.config.mjs`: Task 9, then Task 28.

Measurements go in `specs/features/folder-metadata-sources-core/experiments.md`, created by Task 1 with fixed headings (Environment, Part 1 FR-2 (a), (b), (c), Part 2 FR-18 survey, Part 2 FR-28 observation, Part 2 FR-31 (d), Acceptance) so concurrent tasks append to different sections. Style of `specs/features/compile-defaults-annotations-native-pdf/experiments.md` (environment record, command or test, observed value, what was not measured). A measurement states what was observed; a cause is written only where an experiment discriminated it.

**Builds:** `next build` and `pnpm build:native` only work in the main checkout, not in worktrees. No task needs a static-export build except Task 39. `pnpm test:e2e` (Tasks 34 and 39) builds Storybook, runs outside the sandbox in the main checkout, with `pnpm storybook` stopped first.

**Device verification:** Android device verification is not a merge gate. Native behaviour is tested through the native transport in unit and component tests (as Feature 101's `native-compile-entry-paths` does). FR-31 (d) on a device, if not run, is listed under "Not verified" and no task, doc or PR text may claim the Phase 3 baseline holds.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tests first (`docs/standards/testing.md`): add to an existing test file before creating one; code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions). Every catch added or touched follows `docs/standards/failure-visibility.md` (narrow catch; "failed" never returned as "empty"; locked access rethrown via `isLockedAccessError`). Every new route and core follows `docs/standards/security.md` and `docs/standards/storage-context.md` (no client-supplied path, validated ids, boundary validation before any lock or write, nothing stored or error text logged). New data operations follow the core + route + native backend + `.web-stub.ts` + `next.config.mjs` alias pattern (`goal-filter`, `project-spelling`, Feature 101 saved defaults). UI follows `docs/standards/accessibility.md` and `docs/standards/storybook-implementation.md`; read a component's source and stories before using any prop.
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run typecheck and lint on touched files before finishing. A suite not run is reported as not run, never as passing.
- A task whose survey-driven or test-driven fix would need a hot file owned by another task (see the list above) records the need in `experiments.md` and in its report instead of editing that file.
- Implementors do not commit and do not push; the orchestrator commits. Independent tasks may run concurrently in separate worktrees; tasks listed as dependent must not.
- Write no cause that no experiment separated. Every statement in the spec marked READ is a reading until its test runs.

### Task 1: Experiments file and FR-2 (a) concurrent folder.json writers
**What:** Create the experiments file with its fixed headings and write the test that observes two concurrent `folder.json` writers and whether either takes the per-file lock, recording the first run as observed.
**Files:** `specs/features/folder-metadata-sources-core/experiments.md` (new), an existing folder or sidecar-lock test file under `frontend/tests/` (or a new `folder-json-concurrency.test.ts` if none fits)
**Done when:** `experiments.md` exists with the headings named above and an environment record (Node version, commit, command); a test runs rename and reorder concurrently on one folder, plus every other `folder.json` writer pair the task finds (`folder-utils.ts`, `resource-persistence.ts:125-135`, `project-creator.ts`, `resource-crud-core.ts:953-992`), and the first-run result (which writer took which lock, whether a write was lost) is recorded under "Part 1 FR-2 (a)" as observed, with a reading marked "not confirmed" if the test does not confirm it; no product source file is changed.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-2 (a), FR-37. A reading the test does not confirm is recorded as such; keeping or changing the requirement it motivated is the owner's decision, so report it rather than adjusting the spec.
**Done:** [ ]

### Task 2: FR-2 (b) Trash round trip with an undeclared key, and the Trash descriptor record
**What:** Write the test that adds an undeclared key to a `folder.json`, round-trips it through Trash and restore, and record the result and every folder-descriptor path in `trash.ts` and `trash-core.ts`.
**Files:** an existing Trash test file under `frontend/tests/`, `specs/features/folder-metadata-sources-core/experiments.md` (Part 1 FR-2 (b) section)
**Done when:** A test shows whether an undeclared `folder.json` key survives trash and restore (including a folder with nested subfolders) and its first-run result is recorded as observed; the record names each Trash entry, restore and conflict path in `trash.ts` (`:437`, `:588`, `:1150-1153` as readings) and `trash-core.ts` that handles the folder descriptor, with file and function for each; no product source file is changed.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-2 (b) and the naming duty of FR-6. Feeds Tasks 10 and 11.
**Done:** [ ]

### Task 3: FR-2 (c) type = folder query reading and mixed-type definition
**What:** Write the test that runs a `type = folder` query today and records what it returns, and record the defined result of a mixed-type query.
**Files:** an existing query evaluator test file under `frontend/tests/`, `specs/features/folder-metadata-sources-core/experiments.md` (Part 1 FR-2 (c) section)
**Done when:** A test runs `type = folder` against a project with folders and records the observed result (the reading is that it matches nothing, from `listResourceIds` at `backlinks.ts:89-99`); the record states the defined result for `type = folder OR type = text` and `type = folder AND type = text`, as a proposal consistent with FR-13 that Task 14 pins by test; no product source file is changed.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-2 (c) and the first-task record duty of FR-13.
**Done:** [ ]

### Task 4: Add `source` to ResourceTypeSchema, record the FR-18 survey, restore a green frontend typecheck
**What:** Add `"source"` to `ResourceTypeSchema`, record the full type-branch survey with a disposition for every site and the attachment key name and entry shape, and fix `frontend/` so `pnpm typecheck` passes.
**Files:** `frontend/src/lib/models/schemas.ts` (the enum line only), `frontend/src/lib/models/types.ts` (only if the `ResourceType` union is declared there), every frontend file the typecheck errors or survey name, `specs/features/folder-metadata-sources-core/experiments.md` (Part 2 FR-18 survey section)
**Done when:** `pnpm typecheck` from `frontend/` passes; the survey section records the typecheck errors, then every site found by grepping `type === "text"`, other type comparisons, exhaustive switches, `"text"`, `"image"` and `"audio"` literals, string-keyed maps and `ResourceType` references across `frontend/`, `cli/` and `electron/` (including the `cli` `repair-revisions` command and the electron import workers), each with a disposition (needs a `source` case, treats a Source like text, or deliberately unchanged, with the reason) and the count recorded as observed, not asserted; the record also names the sidecar key that will hold the attachment list and the shape of an entry (FR-22); existing tests pass unchanged.
**Depends on:** 1
**Estimate:** 8
**Notes:** Satisfies FR-18, the survey half of FR-38, FR-22 (record). Treat a Source as text unless the site is one of the two FR-38 exceptions (templates stay text-only; annotations allowed). Sites in `cli/` and `electron/` are recorded here and fixed in Task 5. If a fix would touch `trash.ts`, `trash-core.ts` or `sidecar.ts` beyond a one-line type case, record it and leave it to the owning task.
**Done:** [ ]

### Task 5: cli and electron typechecks green for the new type
**What:** Apply the survey dispositions in `cli/` and `electron/` so both typechecks and tests pass with the `source` type.
**Files:** files under `cli/` and `electron/` named in the Task 4 survey (including `repair-revisions` and the import workers), their existing tests
**Done when:** The `cli/` and `electron/` typechecks pass; every `cli/` and `electron/` site recorded in the survey has its disposition applied; the existing `cli/` and `electron/` tests pass; a test shows `repair-revisions` writes the missing `v-1` for a Source as for a text resource.
**Depends on:** 4
**Estimate:** 3
**Notes:** Satisfies FR-18, FR-36 (cli and electron typechecks). No frontend files are edited.
**Done:** [ ]

### Task 6: Shared model declarations for both parts
**What:** Declare, in the three shared model files, the folder-sidecar shape, `appliesToFolders`, the attachment list entry and the attachment Trash item kind, with the round-trip tests.
**Files:** `frontend/src/lib/models/types.ts`, `frontend/src/lib/models/schemas.ts`, `frontend/lib/api/schemas.ts`, existing schema and client-parse tests under `frontend/tests/`
**Done when:** A test fails first, then passes, showing: a project's field definitions with `appliesToFolders: true` survive the client parse with the boolean present; a field definition without it parses unchanged; the folder sidecar shape holds `userMetadata.notes`, field values and `resourceSubtype` and has no body; a Source sidecar's attachment list entries validate against the shape recorded in Task 4 and an extra key is rejected; the Trash item union accepts a new `attachment` kind carrying Source id, entry and stored name; a project with none of these parses exactly as before; `pnpm typecheck` passes.
**Depends on:** 2, 3, 4
**Estimate:** 5
**Notes:** Satisfies FR-9 (declaration half), FR-3, FR-22, FR-26 (declaration). `lib/api/schemas.ts` strips undeclared keys, so omitting a declaration there silently drops it. This is the only task that edits these three files after Task 4.
**Done:** [ ]

### Task 7: Folder sidecar path and read semantics in sidecar.ts
**What:** Teach `sidecar.ts` the folder sidecar path `meta/folder-<id>.meta.json` and a read that returns an empty value for an absent file without creating it and an error for an unreadable or unparseable one.
**Files:** `frontend/src/lib/models/sidecar.ts`, an existing sidecar test file under `frontend/tests/`
**Done when:** Tests show: the path is built from a validated folder id and never from client input; a folder with no sidecar reads as empty notes, no field values and no subtype and a read creates no file; a sidecar that exists but cannot be read or parsed raises an error and is never returned as empty; a locked or missing-key read rethrows `isLockedAccessError` errors unchanged; resource sidecar behaviour is unchanged (existing sidecar tests pass).
**Depends on:** 6
**Estimate:** 5
**Notes:** Satisfies FR-1 (path), FR-15, FR-31 (a2) for the folder sidecar. This is the only task that edits `sidecar.ts`.
**Done:** [ ]

### Task 8: Folder sidecar write core with allowlist and boundary validation
**What:** Add the folder metadata core that writes the folder sidecar through `mutateSidecar`-style locking with one declared client-writable allowlist, boundary validation and subtype validation.
**Files:** new `frontend/src/lib/models/folder-metadata-core.ts`, a test file beside the `goal-filter` core tests
**Done when:** Tests show: a write leaves `folder.json` byte-equal; a client write carrying a key outside the single declared allowlist is refused with a message before any lock or write and the stored value is unchanged; notes are plain text stored only at `userMetadata.notes` and the top-level `notes` of `ResourceBase` and `Folder` is never set or read; a subtype is stored under `resourceSubtype`, validated and normalised with `normalizeSubtypeLabel`, and removing a subtype from `config.subtypes` does not rewrite a stored value; the first write creates the sidecar and a read does not; a failure maps to a named error the route turns into 400; locked-access errors are rethrown; two overlapping writes lose neither change; the folder sidecar has no body key.
**Depends on:** 7
**Estimate:** 5
**Notes:** Satisfies FR-1, FR-3, FR-4, FR-10 (storage half), FR-15 (first write), FR-33, FR-34. Model on `mutateSidecar` (`sidecar.ts:255`) and `InvalidResourceSubtypeCoreError`. The core is the only writer of the folder sidecar.
**Done:** [ ]

### Task 9: Folder metadata route, client and native backend
**What:** Add the HTTP route, the `lib/api` client on `createTransport`, the native backend, the web stub and the `next.config.mjs` alias for folder metadata read and write.
**Files:** new `frontend/app/api/project/folder-metadata/route.ts` (or the repo's equivalent route path), new `frontend/lib/api/folder-metadata.ts`, `frontend/store/transport/native-folder-metadata-backend.ts` and `.web-stub.ts`, `frontend/next.config.mjs`, `frontend/tests/native-compile-backend-web-exclusion.test.ts` (or its equivalent), a parity test beside the goal-filter transport tests
**Done when:** Tests show: the same invalid input is refused with the same message on the HTTP route and the native backend; the route maps a refusal to 400, an invalid project or folder id to 400 and a locked project to the existing locked response; the web build resolution excludes the native backend; a test or recorded review step confirms no folder sidecar operation is routed through Electron IPC (`electron/src/main.ts` handlers); `pnpm typecheck` passes.
**Depends on:** 8
**Estimate:** 5
**Notes:** Satisfies FR-8, FR-34. Exactly as `goal-filter` and `project-spelling` do (alias near `next.config.mjs:279-288`). Native lock parity is reasoned, not run, and no test name or doc claims it measured. This task owns the first `next.config.mjs` edit; Task 28 follows it.
**Done:** [ ]

### Task 10: Trash carries the folder sidecar
**What:** Extend `softDeleteFolder` and its restore, entry and conflict paths so `meta/folder-<id>.meta.json` moves to and from Trash under the file lock.
**Files:** `frontend/src/lib/models/trash.ts`, `frontend/src/lib/models/trash-core.ts`, the Trash test file extended in Task 2
**Done when:** Tests show: after trash and restore, notes, field values and subtype read back identical, including a folder with nested subfolders and a folder whose `folder.json` carries a key `FolderSchema` does not declare, and the metadata survives without that key being needed; a folder with no sidecar trashes and restores without creating one; a restore conflict path carries the sidecar with the folder; the sidecar of a folder still in the tree is untouched; existing Trash tests pass unchanged.
**Depends on:** 2, 8
**Estimate:** 5
**Notes:** Satisfies FR-6 (OQ-3). Move under the file lock as `softDeleteResource` does for a resource sidecar. Use the paths recorded in Task 2.
**Done:** [ ]

### Task 11: Folder sidecar purge sweep, permanent delete and empty Trash
**What:** Add the folder sidecar to the idempotent `purgeFolder` sweep and make permanent delete, purge and empty Trash leave no folder sidecar behind.
**Files:** `frontend/src/lib/models/trash.ts`, `frontend/src/lib/models/trash-core.ts`, folder permanent-delete code named by the test, the Trash test file
**Done when:** Tests list `meta/` before and after permanent delete, purge from Trash and empty Trash and assert no `folder-<id>.meta.json` remains for a deleted folder; the sidecar of a folder in Trash or in the tree is untouched; purging twice and purging a folder with no sidecar do not fail.
**Depends on:** 10
**Estimate:** 3
**Notes:** Satisfies FR-7. Same hot files as Task 10, so it follows it.
**Done:** [ ]

### Task 12: Folder rename, reorder, move and delete preserve the sidecar
**What:** Add the per-operation tests and any minimal fix proving rename, reorder, move and delete keep folder metadata, reorder does not deadlock with a metadata save, and documents do not inherit folder data.
**Files:** `frontend/src/lib/models/folder-utils.ts`, `frontend/src/lib/models/resource-crud-core.ts` (only if a test fails), existing folder and reorder test files
**Done when:** Tests show: after each of rename, reorder and move the folder's notes, field values and subtype read back identical and `folder.json` carries no metadata; each operation overlapped with a metadata save loses neither change; reorder concurrent with a folder metadata save completes without deadlock (reorder holds `withMetaLock` and does not call the folder core inside it); rename, reorder and move do not read or write the sidecar; after changing a folder's notes, field values and subtype every document inside it reads back byte-equal sidecars and project search hits and counts are unchanged.
**Depends on:** 8, 11
**Estimate:** 3
**Notes:** Satisfies FR-5, FR-12, FR-1 (rename keeps the sidecar). Mostly tests; edit product code only where a test fails, and record any such finding in `experiments.md`.
**Done:** [ ]

### Task 13: Fields offered on a folder and folder subtype scoping
**What:** Add the pure function deciding which fields a folder is offered, reusing `isFieldVisibleForSubtype` unchanged, and pin that no built-in folder subtype exists.
**Files:** `frontend/src/lib/models/field-subtype-scope.ts`, `metadata-schema.ts`, `metadata-schema-dispatch-core.ts` (as the test requires), existing tests for those modules
**Done when:** Tests show: a folder is offered custom fields marked `appliesToFolders`, custom fields with no `appliesTo`, and among built-ins notes only; a field limited by `appliesTo` to labels the folder does not carry is not offered; `appliesToFolders` with no `appliesTo` is also offered on documents; `isFieldVisibleForSubtype` is called unchanged (a test pins it); a folder subtype matches an `appliesTo` label through `normalizeSubtypeLabel`; a new project of every built-in project type has no folder subtype; field definitions with `appliesToFolders` survive the dispatch core.
**Depends on:** 6
**Estimate:** 3
**Notes:** Satisfies FR-9, FR-10, OQ-4 (`appliesToFolders` semantics). The declarations are in Task 6; do not edit the three shared model files here.
**Done:** [ ]

### Task 14: Query evaluator folder source
**What:** Add a second id source used only when a query names `type = folder`, with folder field and subtype filtering and a defined mixed-type result.
**Files:** `frontend/src/lib/models/backlinks.ts` (only if the id source lives there) and the query evaluator module and its existing tests
**Done when:** Tests show: `type = folder` matches the project's folders; folders filter by field values and subtype through the existing query language; `type = folder OR type = text` returns the result recorded in Task 3 and a test pins it; for a project with no folder metadata and every existing saved query in the test corpus, results are identical before and after; a query that does not name the folder type does not change; a failed folder read raises an error and is not returned as no folders.
**Depends on:** 3, 8
**Estimate:** 5
**Notes:** Satisfies FR-13 (OQ-4). Folders enter only through the second id source, so existing results are unchanged by construction.
**Done:** [ ]

### Task 15: Folder section in the metadata sidebar
**What:** Replace the folder placeholder in the metadata sidebar with notes, applicable fields and a subtype choice, each editable, with visible save results.
**Files:** `frontend/components/` `MetadataSidebar.tsx`, a new folder-metadata section component and its story, component and a11y tests under `frontend/tests/`
**Done when:** Tests show: selecting a folder shows its notes, the fields from Task 13 and a subtype choice from `config.subtypes`, all editable; the section calls `isFieldVisibleForSubtype` explicitly; a save shows a visible success or failure and a failed save is never shown as saved and keeps the writer's edit; a failed read shows an error, not an empty folder; controls are keyboard operable with visible focus and accessible names, use no red and do not rely on colour alone; an a11y test passes; a story covers the folder view; Storybook decorators exist for any new context requirement.
**Depends on:** 9, 13
**Estimate:** 5
**Notes:** Satisfies FR-11, FR-14 (error visibility in the sidebar). Read `MetadataSidebar.tsx` and its stories before using any prop. Task 33 edits the same file after this task. The e2e run is Task 34.
**Done:** [ ]

### Task 16: Data view and smart folders show and filter folders
**What:** Make the Data view and smart folders able to show folders (name, subtype, chosen field columns) and filter them by fields, with unchanged output for projects without folder metadata.
**Files:** the Data view component and slice files, `querySlice` and `saved-queries.ts` callers, their stories and tests under `frontend/tests/`
**Done when:** Tests show: a Data view folder row shows name, subtype and the chosen field columns and no notes preview or child count; a smart folder with `type = folder` lists folders and filters by fields; for a project with no folder metadata each surface shows the same rows and counts as before (the output with and without the feature is compared); a failed folder read shows a failure in each surface, never a project with no folders; any new control passes an a11y test.
**Depends on:** 9, 14
**Estimate:** 5
**Notes:** Satisfies FR-14 (Data view and smart folders). Follows the Redux `transport-service` / `guards` split and the explicit sync model if state is added. Does not edit `MetadataSidebar.tsx`.
**Done:** [ ]

### Task 17: Organizer folder cards
**What:** Make the Organizer show folders as cards with name and subtype, filterable by fields, with unchanged output for projects without folder metadata.
**Files:** the Organizer component files, their stories and tests under `frontend/tests/`
**Done when:** Tests show: an Organizer folder card shows name and subtype and no notes preview or child count; folders filter by their fields; for a project with no folder metadata the Organizer shows the same cards and counts as before; a failed folder read shows a failure, never a project with no folders; the new card passes an a11y test and has a story.
**Depends on:** 9, 14
**Estimate:** 3
**Notes:** Satisfies FR-14 (Organizer). Can run concurrently with Task 16; the two edit different component files.
**Done:** [ ]

### Task 18: Folder notes excluded from compile and export
**What:** Add the test proving folder notes appear in no compile or export output and that the dialogs offer no option to include them.
**Files:** existing compile and export test files under `frontend/tests/`
**Done when:** A test compiles and exports a project in each format with and without folder notes on every folder and the extracted content is identical (using Feature 101's extraction helper and control); the compile and export dialogs render no control to include folder notes; no product change is needed, or the minimal one is made if the test fails.
**Depends on:** 8
**Estimate:** 3
**Notes:** Satisfies FR-16 (OQ-141). PDF extraction uses the helper Feature 101 added.
**Done:** [ ]

### Task 19: Scrivener import report states folder metadata was not imported
**What:** Make the Scrivener import report state that folder metadata (synopsis, notes and metadata) was not imported and ensure the importer creates no folder sidecar.
**Files:** the Scrivener importer and report files under `frontend/` and `electron/` (import workers) named by Task 4's survey, their existing tests and fixtures
**Done when:** A test imports a fixture whose folders carry synopsis, notes and metadata and asserts the report states folder metadata was not imported and `meta/` contains no `folder-<id>.meta.json`; existing import tests pass unchanged.
**Depends on:** 5
**Estimate:** 3
**Notes:** Satisfies FR-17 (OQ-142). Follows Task 5 because both may touch the import workers. The report wording is working copy.
**Done:** [ ]

### Task 20: Create, open, rename, move and delete a Source
**What:** Make the generic resource cores, routes and tree create control handle a Source end to end, with a canonical revision `v-1` and the body stored as a text resource's is.
**Files:** `frontend/src/lib/models/resource-crud-core.ts`, `resource-initial-revision.ts`, the resource routes, the resource tree create control component and its story, existing resource tests under `frontend/tests/`
**Done when:** Tests show: "Source" is offered in the tree's create control; create, open, rename, move and delete each succeed for a Source and existing text, image and audio tests pass unchanged; a new Source has canonical revision `v-1` and its body saves and reloads with `content.txt` and `content.tiptap.json`; its attachment list is empty; delete goes to Trash and restore returns it; the existing editor edits the Source body; the create control passes an a11y test.
**Depends on:** 5, 6, 12
**Estimate:** 5
**Notes:** Satisfies FR-19, FR-22 (body, revision, empty list). No new Source view or panel (FR-30). Edits `resource-crud-core.ts`, so it follows Task 12.
**Done:** [ ]

### Task 21: Source sidecar rules: subtype scoping and entity refusal
**What:** Make a Source's subtype and `appliesTo` scoping work and make the sidecar core refuse `entityKind` and `aliases` for a Source while still allowing their `clearKeys`.
**Files:** `frontend/src/lib/models/resource-crud-core.ts` (`CLIENT_WRITABLE_SIDECAR_KEYS` handling near `:397-403`), the sidecar route error mapping, entity alias table code (`entity-alias-table.ts`) only as the tests require, existing tests
**Done when:** Tests show: a subtype set on a Source is stored, and a field scoped to it is offered on that Source and not on a text document without the label; a Source's name is not matched as an entity name in prose; a Source does not appear in the entity roster or the entity graph; no code in this feature links a Source to an entity; submitting `entityKind` or `aliases` for a Source raises a named error mapped to HTTP 400 like `InvalidResourceSubtypeCoreError` and stores nothing; `clearKeys` for those two keys is still allowed and removes a stored value; entity behaviour for text resources is unchanged.
**Depends on:** 20
**Estimate:** 5
**Notes:** Satisfies FR-20, FR-21 (OQ-9, OQ-151).
**Done:** [ ]

### Task 22: Attachment validation with magic-byte check
**What:** Add an attachment validator that reuses `validateMediaFile` and a new magic-byte content check, applied to attachments only.
**Files:** `frontend/src/lib/models/media-validation.ts`, its existing test file
**Done when:** Tests show: an accepted image and an accepted audio file pass; a video file, an unknown type and a file whose name claims a kind its bytes do not are each refused with a message naming the reason and nothing stored; the kind is decided by the same extension and MIME maps, 100 MB limit (`MAX_MEDIA_FILE_BYTES`), allowlisted stored extension and `isPlainFileName` as image and audio upload; the magic-byte check runs for attachments and a test pins that existing image and audio upload validation is unchanged; the messages are exported so Task 28 can assert the same text on both transports.
**Depends on:** 4
**Estimate:** 3
**Notes:** Satisfies FR-23 (OQ-10), FR-34. Pure functions, no `node:fs`. Does not edit any hot file.
**Done:** [ ]

### Task 23: Attachment core: add, list and reorder
**What:** Add the attachment core that stores validated files inside the Source's `resources/<id>/` directory under server-generated names and maintains the ordered list through `mutateSidecar`.
**Files:** new `frontend/src/lib/models/source-attachments-core.ts`, `resource-crud-core.ts` (only if a test fails), a test file beside the media upload tests
**Done when:** Tests show: after adding two attachments the resource tree and resource list contain no entry for either, the files are inside the Source's directory under server-generated names and a client-supplied name or path is never used as a path; reorder changes only the sidecar list and not the bytes; the list is not among the client-writable keys of `updateSidecarCore` and a whole-sidecar client write with a different or missing list leaves the stored list unchanged; a concurrent attachment write and a sidecar field save lose neither; the 501st add is refused with a visible message and nothing stored; the core rejects a non-Source resource; `revisions/<id>/` is listed before and after each operation and after a body save, no attachment file appears and the revision count changes only for the body save; revision prune, restore and compare of a Source do not touch the attachments or the list; code uses `io.ts` and the storage adapter only, never direct `node:fs` (pinned by a test or lint check); locked-access errors are rethrown.
**Depends on:** 21, 22
**Estimate:** 5
**Notes:** Satisfies FR-24 (data half), FR-25, FR-31 (a2), FR-34. Uses the key name and entry shape recorded in Task 4 and declared in Task 6.
**Done:** [ ]

### Task 24: Attachment remove and replace to Trash, and restore
**What:** Make remove and replace move the previous file to Trash as a new `attachment` item kind and make restore return it to the end of the Source's list.
**Files:** `frontend/src/lib/models/trash.ts`, `trash-core.ts`, `source-attachments-core.ts`, the Trash test file
**Done when:** Tests show: remove then restore returns the attachment to the Source's list with bytes identical; replace then restore of the previous file returns it with bytes identical; restore appends to the end of the list and a name clash uses the existing " (restored)" suffix; restore is refused with a visible message and the entry stays when the Source is in Trash or purged; remove and replace create revisions in no case; the entry is a distinct Trash item kind.
**Depends on:** 23, 11
**Estimate:** 5
**Notes:** Satisfies FR-26 (OQ-8), FR-25. Follows Task 11 because of `trash.ts` and `trash-core.ts`.
**Done:** [ ]

### Task 25: Attachment purge, empty Trash and Trash tab entry
**What:** Make purge and empty Trash handle the attachment kind and show the entry in the Trash tab as "Attachment of <Source name>".
**Files:** `frontend/src/lib/models/trash.ts`, `trash-core.ts`, the Trash tab component and its story, existing Trash tests
**Done when:** Tests show: purging an attachment entry deletes its file and leaves nothing in `.trash/`; empty Trash removes every attachment entry and file; the Trash tab lists "Attachment of <Source name>" with restore and purge controls operable by keyboard with accessible names; an a11y test passes; existing Trash tab tests and stories pass unchanged.
**Depends on:** 24
**Estimate:** 3
**Notes:** Satisfies FR-26 (purge, empty, label), `specs/features/trash-ui.md`.
**Done:** [ ]

### Task 26: Encryption, lock and whole-directory tests for Sources and folder sidecars
**What:** Add the FR-31 (a), (b), (c) and (a2) tests for attachments, Source trash and permanent delete, and the folder sidecar.
**Files:** existing encryption, storage-adapter and Trash test files under `frontend/tests/`, `trash.ts` and `trash-core.ts` only if a test fails
**Done when:** Tests show: an attachment is encrypted at rest, readable when unlocked and refused when locked, as an image or audio resource is; the folder sidecar is sealed by the adapter as resource sidecars are; trashing and restoring a Source carries its whole directory including every attachment, bytes identical; permanently deleting a Source and purging it from Trash leave no attachment file and no sidecar behind; the new cores (folder metadata and attachments) rethrow `ProjectLockedError` and `MissingProjectKeyError` and never degrade a locked read to empty; places where behaviour does not hold are recorded in `experiments.md` as gaps, not claimed.
**Depends on:** 8, 25
**Estimate:** 5
**Notes:** Satisfies FR-31 (a), (b), (c), (a2), FR-34 (OQ-6). Expected behaviour, not run, until these tests pass.
**Done:** [ ]

### Task 27: Attachment routes and clients
**What:** Add the HTTP routes and `lib/api` clients for attachment add, remove, replace, reorder and restore.
**Files:** new route files under `frontend/app/api/project/` for attachments and the Trash restore kind, new `frontend/lib/api/source-attachments.ts`, route and client tests
**Done when:** Tests show: each operation succeeds through its route for a Source; an invalid project id, resource id or body maps to 400; a refused file returns the Task 22 message; the 501st add returns a refusal and stores nothing; a locked project returns the existing locked response; no request carries a path and no stored value or file name is logged; restore of an attachment kind works through the Trash restore route; `pnpm typecheck` passes.
**Depends on:** 25
**Estimate:** 5
**Notes:** Satisfies FR-23 (HTTP half), FR-24, FR-32, FR-34. Multipart handling follows the existing media upload route.
**Done:** [ ]

### Task 28: Attachment native backends, aliases and parity
**What:** Add the native (Android) backend, `.web-stub.ts` pair and `next.config.mjs` alias for the attachment operations and Source create, with the same-message parity tests.
**Files:** `frontend/store/transport/native-source-attachments-backend.ts` and `.web-stub.ts`, the native resource backend if Source create needs an entry, `frontend/next.config.mjs`, `frontend/tests/native-compile-backend-web-exclusion.test.ts` (or its equivalent), a parity test
**Done when:** Tests show: for each operation the same invalid input is refused with the same message on the HTTP route and the native backend; the web build resolution excludes the new native backends; Source create, attachment add, remove, replace, reorder and restore work through the native transport under the native runner; Redux state, if any, follows the `transport-service` / `guards` split and the explicit sync model; `pnpm typecheck` passes.
**Depends on:** 9, 27
**Estimate:** 5
**Notes:** Satisfies FR-32, FR-23 (parity). Follows Task 9 for `next.config.mjs`. Native lock parity is reasoned, not run.
**Done:** [ ]

### Task 29: Seed Sources into the compile default exclusions
**What:** Add each new, copied and duplicated Source's id to `config.compileDefaults.excludedResourceIds`, with the visible refusal at the 5000-id cap.
**Files:** `frontend/src/lib/models/resource-crud-core.ts`, the compile-defaults core from Feature 101, the copy and duplicate code paths, the create route response and the tree create control for the message, existing tests
**Done when:** Tests show: creating a Source adds its id to `compileDefaults.excludedResourceIds` leaving the `{ excludedResourceIds }` shape unchanged; seeding also happens on copy and duplicate with the new id, and in a project that existed before the feature; clearing the saved default brings every Source back in; `exportDefaults` is never seeded; at the 5000-id cap the Source is created, seeding is refused and the response and UI show a visible message that the Source is not excluded from compile; compile through the compile core with explicit resource ids including a Source has its body in the output of every format, and the same for export.
**Depends on:** 21, 23
**Estimate:** 5
**Notes:** Satisfies FR-27 (OQ-1, OQ-144), FR-33. Edits `resource-crud-core.ts` and the create control, so it follows Tasks 20, 21 and 23.
**Done:** [ ]

### Task 30: Goal and counting parity for Sources
**What:** Add the tests for goal membership, word counts, the status roll-up and the writing log treating a Source as text, and record the observed project and daily totals.
**Files:** existing goal-filter, word-count, status-roll-up and writing-log test files, the goal computation module only if a test fails, `specs/features/folder-metadata-sources-core/experiments.md` (Part 2 FR-28 section)
**Done when:** Tests show: a new project's `config` carries no `goalFilter` excluding the `source` type and the goal computation has no branch that excludes a Source by type; a Source's body words are evaluated by the same rule as a text document's under a writer-set goal filter; word counts, the status roll-up and the writing log include a Source as text; whether a Source's words count toward the project and daily totals with no filter is recorded as observed in `experiments.md` with the owner's reading left to the owner.
**Depends on:** 29
**Estimate:** 3
**Notes:** Satisfies FR-28 (OQ-145), part of FR-38. Edit only each site's own file; a needed fix in a hot file is recorded, not made.
**Done:** [x]

### Task 31: Spell check, prose diagnostics and mention detection for Sources
**What:** Add the tests (and minimal fixes) showing spell check, prose diagnostics and mention detection treat a Source body as a text document.
**Files:** existing spell-check, prose-diagnostics and entity-detection test files, the modules themselves only if a test fails
**Done when:** Tests show: a misspelling in a Source body is flagged; diagnostics are computed for a Source and persisted at `meta/index/diagnostics.json` as for text; an entity's name in a Source body is detected as a mention and stored in the mention index; each feature ignores attachments and the list.
**Depends on:** 29
**Estimate:** 3
**Notes:** Satisfies FR-29 (OQ-146). Can run concurrently with Tasks 30 and 32.
**Done:** [ ]

### Task 32: Search, backlinks, compile outline, previews, annotations and templates for Sources
**What:** Add a test per remaining text-rule site showing a Source behaves as text, with annotations allowed on a Source body and templates staying text-only.
**Files:** existing search, backlinks, compile outline, preview, annotation and template test files, the modules themselves only if a test fails
**Done when:** Tests show: full-text search and snippets find a Source body; backlinks from and to a Source work as for text; the compile outline lists a Source; previews handle a Source; an annotation can be added to a Source body and is not compiled or exported; no template can be created for a Source; every FR-38 site in the Task 4 survey has a test or a recorded reason.
**Depends on:** 29
**Estimate:** 5
**Notes:** Satisfies FR-38 (OQ-7). Edit only each site's own file; a needed fix in a hot file is recorded, not made.
**Done:** [ ]

### Task 33: Attachments section in the metadata sidebar
**What:** Add the one Source-specific component, an "Attachments" sidebar section to add, remove, replace and reorder a selected Source's attachments.
**Files:** `frontend/components/` `MetadataSidebar.tsx`, a new attachments section component and its story, component and a11y tests under `frontend/tests/`
**Done when:** Tests show: selecting a Source shows the section with its list in order and no preview or playback; add, remove, replace and reorder call the Task 28 client; a refusal (unsupported kind, 501st attachment, restore refused) is shown with its message and the list is not shown as changed; reorder is operable by keyboard; controls have accessible names and visible focus, use no red and do not rely on colour alone; an a11y test passes; a story covers the section; selecting a text resource shows no such section.
**Depends on:** 15, 28
**Estimate:** 5
**Notes:** Satisfies FR-24 (UI), FR-30. Edits `MetadataSidebar.tsx` after Task 15. Read the component's source and stories before using any prop.
**Done:** [ ]

### Task 34: End-to-end tests for the folder view and the Attachments section
**What:** Add Playwright e2e tests against the Storybook stories for the folder sidebar view and the Attachments section.
**Files:** `frontend/e2e/` (extend an existing spec or add a new one), the two stories from Tasks 15 and 33
**Done when:** `pnpm test:e2e` (from `frontend/`, builds Storybook, `pnpm storybook` stopped first) passes with a scenario for editing folder notes and a scenario for adding, reordering and removing an attachment, each reported as run or not run.
**Depends on:** 15, 33
**Estimate:** 3
**Notes:** Satisfies FR-24 (e2e), FR-11. Run outside the command sandbox in the main checkout, never a worktree.
**Done:** [ ]

### Task 35: Largest-attachment native transport test, FR-31 (d) record, and owner-decision fixes (folder 404, locked restore and purge, Source goal exclusion)
**What:** Add the test that adds and reads an attachment of the largest accepted size through the native backend and record the observed run. Also apply four owner decisions of 2026-11-07, each test-first: (1) folder metadata write for a nonexistent folder is 404 on route and native with no sidecar created (FR-3); (2) restore and purge propagate the project-locked error instead of returning `ok: false` (FR-26, FR-31 a2); (3) attachment purge in a locked encrypted project is refused with files and record kept (FR-26); (4) Sources are excluded from the project total and daily word goals unless an explicit goal filter selects them (FR-28). The low-level `purgeFolder` keeps throwing on a second purge (FR-7, no change).
**Files:** a native transport test under `frontend/tests/`, `specs/features/folder-metadata-sources-core/experiments.md` (Part 2 FR-31 (d) and FR-28 observation sections), the folder metadata core, its route and native backend, `frontend/src/lib/models/trash-core.ts` and `trash.ts` (restore and purge, attachment purge), the Trash routes and native Trash backend that map the locked error, the goal computation and daily-goal aggregate modules, and the existing tests for each (folder metadata core, route and native parity, trash-core, attachment trash, goal-filter, writing-log)
**Done when:** A test adds and reads back an attachment at the 100 MB cap through the native backend under the native runner and passes; the observed duration, size and build are recorded in `experiments.md` as a measurement of that test, stated as not a device measurement; the section lists the on-device run under "Not verified" if it was not run and states nothing about the Phase 3 baseline holding. Further, tests show: a folder metadata PUT and the native write for an unknown folder id return 404 Not Found with the same message and leave no `meta/folder-<id>.meta.json`; `restoreOneCore` and `purgeOneCore` for an attachment entry and for a Source in a locked project throw or propagate `ProjectLockedError` and the HTTP and native responses match the existing locked convention (no `{ ok: false, error: "...locked..." }`); purging an attachment entry in a locked encrypted project is refused with its files and record intact; with no goal filter the project total and the daily aggregate exclude Source words (the daily aggregate ignores writing-log entries whose `documentId` is a Source), a goal filter that selects Sources includes them, and the per-resource goal is unchanged; the FR-28 observation section records the before and after of the 17 of 1,000 measurement as observed values and the owner decision that produced the change.
**Depends on:** 8, 9, 11, 25, 27, 28, 30
**Estimate:** 8
**Notes:** Satisfies FR-31 (d) as far as it can run without a device; also FR-3, FR-7, FR-26, FR-28, FR-31 (a2) as amended 2026-11-07. Device verification is not a merge gate. These fixes edit `trash.ts` and `trash-core.ts` after Task 26 and are the last task to do so; no other remaining task edits them. FR-7: do not change `purgeFolder`.
**Done:** [x]

### Task 36: Record the Source-specific and folder interface files
**What:** Record the list of files added or changed under `frontend/components/` with, for each, why it is not a Sources view or panel.
**Files:** `specs/features/folder-metadata-sources-core/experiments.md` (Acceptance section)
**Done when:** The Acceptance section lists every file added or changed under `frontend/components/` by this feature (from `git diff --stat` against `main`, read-only) with a reason per file, and states that the only Source-specific interface is the create control entry, the existing editor and the one Attachments sidebar section; no Sources view, panel, excerpt, citation, bibliography, claim or module seam exists.
**Depends on:** 15, 16, 17, 20, 33
**Estimate:** 2
**Notes:** Satisfies FR-30. Read-only git only; no commits.
**Done:** [ ]

### Task 37: Feature docs, Code Map, glossary and sidecar and Trash docs
**What:** Update `docs/features/`, the `frontend/CLAUDE.md` Code Map, the root `CLAUDE.md` glossary and the sidecar and Trash docs for folder metadata and Sources.
**Files:** new or updated pages under `docs/features/` (folder metadata, Sources), `docs/features/sidecars.md`, `docs/features/revisions.md` (Trash section), `docs/features/resource-subtype.md`, `frontend/CLAUDE.md`, `CLAUDE.md`
**Done when:** The new cores, routes and native backend pairs are in `docs/features/` and the Code Map; the root glossary gains **Folder sidecar** (folder metadata) and **Source** (including attachment) entries in the existing short style; `sidecars.md` states the folder sidecar and attachment list behaviour and `revisions.md` states the folder sidecar and attachment Trash behaviour; no sentence states an unmeasured result as fact and the Not verified items are named; the docs state the 2026-11-07 owner decisions as built (Sources excluded from the project and daily word goals unless a goal filter selects them; locked restore and purge raise the locked error; folder metadata write for an unknown folder is 404; a Source carrying `entityKind` is an entity); every referenced file path exists.
**Depends on:** 12, 16, 17, 18, 19, 26, 28, 29, 30, 31, 32, 33, 35
**Estimate:** 3
**Notes:** Satisfies FR-35 (developer docs). Can run concurrently with Task 38; the two edit different files.
**Done:** [ ]

### Task 38: User handbook pages
**What:** Update the user handbook for folder notes, fields and subtypes and for Sources, attachments, restoring an attachment and the compile and export defaults.
**Files:** the user handbook pages for folders and metadata, resources and the resource tree, Trash, and the compile and export dialogs
**Done when:** The handbook covers folder notes, fields and subtypes; Sources as a resource type; adding, removing and reordering attachments; restoring an attachment from Trash; that new projects start with Sources out of compile and in export and how to change it; each page keeps its existing style; no verification evidence or unmeasured result appears in the copy; where the handbook describes goals it says Sources do not count toward the project or daily word goal unless the goal filter selects them.
**Depends on:** 12, 16, 17, 18, 19, 26, 28, 29, 30, 31, 32, 33, 35
**Estimate:** 5
**Notes:** Satisfies FR-35 (handbook). Invoke `write-user-guide` for plain-language copy.
**Done:** [ ]

### Task 39: Acceptance suites and reporting
**What:** Run the acceptance suites and record each as run or not run, and state which parts landed or stopped.
**Files:** `specs/features/folder-metadata-sources-core/experiments.md` (Acceptance section), `cli/src/commands/reindex.ts` and its CLI test, the entity pinning test (existing backlinks and entity-shared-metadata test files), no other source changes except fixes the suites require
**Done when:** Two owner decisions of 2026-11-07 are met test-first: `cli/src/commands/reindex.ts` no longer hard-codes `type: "text"` and reindexes Sources, shown by a CLI test in which a Source is searchable after reindex (found by reading, not run; the test settles it, and its first run is recorded as observed); a pinning test shows a Source sidecar carrying `entityKind` is treated as an entity (`backlinks.ts` about line 391 and `entity-shared-metadata.ts` about line 81, behaviour kept). Then `pnpm typecheck`, `pnpm lint` and `pnpm test:ci` from `frontend/`, the `cli/` and `electron/` typechecks and tests, `pnpm knip` from the repository root, `pnpm test:e2e` (builds Storybook; stop `pnpm storybook` first) pass, and `pnpm build:native` runs where it can, each reported as run or not run with its output; the FR-2 first-run records (Tasks 1-3) and the FR-18 survey (Task 4) are confirmed present; the report names which of Part 1 and Part 2 landed or stopped and lists FR-31 (d) on a device and native lock parity under "Not verified" if they were not run.
**Depends on:** 34, 36, 37, 38
**Estimate:** 5
**Notes:** Satisfies FR-36, FR-37, and FR-38 (reindex) and FR-21 (entity pinning) as amended 2026-11-07. Run outside the command sandbox and in the main checkout, never a worktree: `pnpm test:e2e` and `pnpm build:native` start processes and builds that fail in worktrees.
**Done:** [ ]

## Summary
- Total tasks: 39
- Total estimated effort: 166 story points
- Critical path: 1 → 4 → 6 → 7 → 8 → 10 → 11 → 12 → 20 → 21 → 23 → 24 → 25 → 27 → 28 → 33 → 37 → 39
- Risks: Task 4 (the survey size is unknown, "at least 22" files is a proxy, and its fixes can ripple into files other tasks own); Tasks 1-3 (a reading the tests do not confirm changes the scope of Part 1 and is the owner's decision); Tasks 10, 11, 24, 25 (`trash.ts` and `trash-core.ts` are edited in sequence and carry the new folder and attachment kinds); Task 21 and Task 29 (`resource-crud-core.ts` allowlist and seeding behaviour are readings until tested); Task 22 (the magic-byte check is new and must leave existing uploads unchanged); Task 28 (native lock parity is reasoned, not run); Task 35 (the 100 MB test may be slow or exceed test memory; the device run is not a gate; it also carries four owner-decision fixes across folder, Trash and goal code, the largest remaining task); Tasks 15 and 33 (both edit `MetadataSidebar.tsx`, ordered).

## Open Questions
None.
