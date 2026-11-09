# Tasks: Inbox and Capture box (Feature 106)

Source spec: `specs/features/inbox-quick-capture.md` (FR-1..FR-24, US-1; OQ-1 to OQ-18 resolved at Gate 3 and approved by the owner, 2026-11-09, none open). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 106. Branch: `feat/inbox-quick-capture`; one PR. Measurements: `specs/features/inbox-quick-capture/experiments.md` (created by Task 1).

Shape of the work:
- Task 1 is the experiments record (FR-1 a, b, c, e) and comes first; Task 2 (LEAD-RUN) adds FR-1(d), observed in the running app. No behaviour change is merged before both are recorded.
- Tasks 3 to 6 are the independent foundations: types and schemas, pure capture text helpers, the Inbox membership helper, the compile-exclusion seed and removal.
- Tasks 7 to 9 are the capture core in three steps (Inbox resolution, item creation and seeding, writing log). Task 10 is the route, client, native backend and sharing-gate tests.
- Tasks 11 to 13 are the goal exclusion in the three places. Tasks 14 and 15 are the clearing of the compile exclusion on a move out and its visible failure message.
- Tasks 16 to 21 are the interface: the box, its project choice, its host, the locked and Trash flows, the AppShell mount and key handler, the palette row. Tasks 22 and 23 are the tree count and "File to...". Task 24 is the sidebar block. Task 25 is the FR-16 pins.
- Task 26 (LEAD-RUN) is the FR-13 shortcut checks. Task 27 is documentation for the scribe. Task 28 (LEAD-RUN) is the final CI run.

Requirement traceability (every FR-1..FR-24 maps to at least one task; FR-19 is also an inherited rule of every code task):
- FR-1: 1, 2. FR-2: 4, 8, 9, 10. FR-3: 3, 7. FR-4: 7, 19. FR-5: 4, 8. FR-6: 6, 8. FR-7: 5, 11, 12, 13. FR-8: 9. FR-9: 7, 8, 10, 19. FR-10: 10.
- FR-11: 16, 18, 20. FR-12: 17, 20. FR-13: 26. FR-14: 5, 22. FR-15: 14, 15, 23. FR-16: 25. FR-17: 15, 16, 18, 19. FR-18: 1, 2, 26, 28. FR-19: 3 to 25 (each task's inherited rules and stories). FR-20: 28. FR-21: 27. FR-22: 3, 4, 8, 24. FR-23: 5, 6, 14, 15. FR-24: 21.

Compact dependency graph (`a -> b` means b depends on a):
- 1 -> 2, 3, 4, 5, 6; 3 -> 7 -> 8 -> 9 -> 10; 4, 6 -> 8; 3, 5 -> 11, 12, 13; 5, 6 -> 14 -> 15; 3 -> 16, 17, 24, 25; 10, 16, 17 -> 18 -> 19; 2, 19 -> 20 -> 21, 26; 5, 15 -> 22 -> 23; 11, 12, 13, 21, 23, 24, 26 -> 27; 25, 27 -> 28.

Parallel waves the orchestrator may run (LEAD-RUN tasks are never run by the orchestrator):
- Wave 1: {1}.
- Wave 2: {3, 4, 5, 6} (Task 2 is LEAD-RUN and may be done by the lead at any time after Task 1 and before Task 20).
- Wave 3: {7, 11, 12, 13, 14, 16, 17, 24, 25}.
- Wave 4: {8, 15}.
- Wave 5: {9, 22}.
- Wave 6: {10, 23}.
- Wave 7: {18}. Wave 8: {19}. Wave 9: {20}. Wave 10: {21, 26 (LEAD-RUN)}. Wave 11: {27}. Wave 12: {28 (LEAD-RUN)}.
A wave lists tasks whose dependencies are all done after the previous wave; the hot-file rules below keep every task inside a wave off every other task's files.

Hot files and the only tasks allowed to edit them (file conflicts for wave planning):
- `frontend/src/lib/models/types.ts`, `schemas.ts`, `frontend/src/lib/api/schemas.ts`: Task 3 only (later tasks read them).
- New `frontend/src/lib/models/inbox-capture-text.ts` (name located by the task) and its test: Task 4 only.
- New `frontend/src/lib/models/inbox-membership.ts` (name located by the task) and its test: Task 5 only.
- `frontend/src/lib/models/saved-defaults-core.ts` and `tests/unit/saved-defaults-core.test.ts`: Task 6 only.
- New `frontend/src/lib/models/inbox-folder-core.ts`: Task 7 only.
- New `frontend/src/lib/models/inbox-capture-core.ts`: Task 8 creates, Task 9 extends (sequential); `writing-log.ts` only if Task 9 needs a new entry point, Task 9 only.
- `app/api/project/capture/route.ts` (new), `frontend/src/lib/api/inbox-capture.ts` (new), the new native capture backend and `.web-stub.ts`, `frontend/next.config.mjs`, the sharing gate test file: Task 10 only.
- `goal-filtered-total-core.ts` and its tests: Task 11 only. `writing-log-core.ts` and its tests: Task 12 only. `components/WorkArea/DataView.tsx` and `tests/dataViewGoalFilter.test.tsx`: Task 13 only.
- `app/api/projects/[projectId]/reorder/route.ts`, the native reorder or project backend (located by the task) and a new clearing core: Task 14 only.
- `frontend/src/store/resourcesSlice.ts`, `components/ResourceTree/useResourceReorder.ts` and the message surface for a failed clearing: Task 15 only.
- `components/ResourceTree/ResourceTree.tsx`, `moveResource.ts`, `MoveResourceModal.tsx`, `FolderTreePicker.tsx`: Task 22 (count) then Task 23 ("File to..."), sequential; Task 15 must be done before Task 22 and edits none of these except through `useResourceReorder.ts`.
- New `CaptureBox.tsx` and its stories and tests: Task 16 only. New project-choice hook and preferences module: Task 17 only. New `CaptureBoxHost.tsx`: Task 18 creates, Task 19 extends (sequential).
- `app/(app)/page.tsx`, `components/Layout/AppShell.tsx`, `components/Layout/ShellModalCoordinator.tsx`: Task 20, then Task 21 for the coordinator and palette wiring (sequential).
- `components/common/ResourceCommandPalette.tsx` and its stories: Task 21 only.
- `components/Sidebar/MetadataSidebar.tsx` (or the section file the task adds): Task 24 only.
- `specs/features/inbox-quick-capture/experiments.md`: created by Task 1 with fixed headings (Environment, FR-1 inventory (a), (b), (c), (d), (e), FR-13 shortcut checks, Writing-log and goal figures, Not verified, Acceptance) so later tasks append to different sections; Task 2 appends (d), Task 26 appends FR-13, Task 28 appends Acceptance and Not verified.

**Builds and devices:** `next build`, `pnpm build:native`, `pnpm test:e2e`, `cap sync`, Gradle and every real-browser or Electron run only happen from the main checkout, outside the command sandbox, by the lead with the owner. No orchestrator task runs them. A worktree cannot run `next build` or `build:native`. Tasks that write an e2e spec or a story check only that it typechecks and lints.

**Electron worker constraint:** every task whose Files include anything under `frontend/src/lib/models/`, `frontend/src/lib/core.ts`, `cli/` or `electron/` MUST also run `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`) and `pnpm --filter getwrite-cli typecheck`, and record each as run or not run. A bare frontend `tsc` is not accepted as evidence.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tests first (`docs/standards/testing.md`): add to an existing test file before creating one; code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions). Code doc comments are written in the code tasks (`docs/standards/code-documentation.md`). Every catch added or touched follows `docs/standards/failure-visibility.md` (narrow catch; a failure never rendered as absence or empty). Boundary and fail-closed rules follow `docs/standards/security.md` (no client-supplied path; ids validated before any read; text length bounded). The storage context is established as `docs/standards/storage-context.md` requires. Read a component's source and stories before using any prop. New components get Storybook stories (`docs/standards/storybook-implementation.md`) and meet `docs/standards/accessibility.md`. No red in any new UI (CLAUDE.md red rule).
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run `pnpm typecheck` and `pnpm lint` on touched files. A suite not run is reported as not run, never as passing.
- Unit tests with fakes are not evidence about browsers, devices, or a real tenant. Write no cause that no experiment separated. A statement in the spec marked READ is a reading until its test runs.
- Implementors do not commit and do not push; the orchestrator commits.

### Task 1: Experiments record: FR-1 inventory (a), (b), (c), (e)
**What:** Create `experiments.md` with fixed headings and record, as observed values with the command or test that produced each, the FR-1 items a, b, c and e.
**Files:** `specs/features/inbox-quick-capture/experiments.md` (new); reads `frontend/src/lib/models/resource-factory.ts`, `resource-initial-revision.ts`, `resource-crud-core.ts`, `project-json-write.ts`, `meta-locks.ts`, `folder-utils.ts`, `frontend/src/store/transport/create-transport.ts`; a throwaway timing script or test kept out of the tree (scratchpad only)
**Done when:** `experiments.md` exists with the headings listed above and an environment record (node version, commit, commands). "FR-1 inventory" records: (a) that `CreateResourceOpts` accepts `text.plainText` and `text.tiptap` and that `writeResourceWithInitialRevision` writes them into `v-1`, each shown by a command or a throwaway vitest run that creates a text resource with a body and reads `v-1` back, with the result as observed; (b) how a folder is created and persisted today (the function and file that do it, found by search and run once against a temporary project) and that `updateProjectJson` inside `withMetaLock(projectRoot)` is how a `config` write is made, with file:line labelled READ unless a run shows it; (c) that `NEXT_PUBLIC_GETWRITE_RUNTIME` is inlined as the raw `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` comparison in `create-transport.ts`, labelled READ with file:line, or MEASURED from built output if a build already exists on main; (e) the time cost of reading the folder tree once per goal aggregate (`readFolderTree`) and of a client `parentId` walk over a fixed synthetic project size stated in the record (for example 1,000 resources in 100 folders), as measured numbers with the machine, or as "not run". Heading (d) exists and says "not yet run, recorded by Task 2". "Not verified" is seeded with: a paired-device run of capture and of its refusal, hosted web against a real tenant, the Android entry (Feature 107), a locked-project capture in the real unlock flow, Chrome, Safari, Firefox and Electron key delivery (until Task 26). `git status` shows no product file changed. No cause is written as a cause.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-1 (a, b, c, e), FR-18 (record). The sandbox may block a real build; record (c) as READ then. If (a) shows `CreateResourceOpts` cannot carry the body, stop and return to the owner: FR-5 assumes it can. The finding for (b) tells Task 7 where folder creation lives.
**Done:** [x]

### Task 2: LEAD-RUN: FR-1(d), AppShell is not mounted when no project is open
**What:** In the running app, observe that `AppShell` (and so its Cmd/Ctrl+K handler) is absent on the Start screen with no project open, and record it.
**Files:** `specs/features/inbox-quick-capture/experiments.md` (FR-1 inventory (d) section)
**Done when:** "(d)" records, as what was seen and with the build, browser or shell and OS, that with no project open the Cmd/Ctrl+K palette does not open (or the equivalent observation chosen by the lead, such as no `AppShell` element in the DOM), and that with a project open it does; the reading `app/(app)/page.tsx:131, 1111` is labelled READ and the observation MEASURED. `git status` shows no product file changed.
**Depends on:** 1
**Estimate:** 1
**Notes:** LEAD-RUN, not for the orchestrator: the lead runs the app (`pnpm start` or the desktop shell) outside the sandbox with the owner. Satisfies FR-1(d), FR-18. Must be recorded before Task 20 starts. If the observation contradicts the reading, return to the owner before Task 20. Recorded 2026-11-09: the reading was contradicted (AppShell mounted on the Start screen); returned to the owner, who chose to mount inside AppShell (spec OQ-6 amendment, FR-11). The project-open half of Done when was not run, since the shell is mounted either way.
**Done:** [x]

### Task 3: Config and sidecar types and schemas
**What:** Add `inboxFolderId` to `ProjectConfig` and the capture sidecar keys `capturedAt` and `capturedLink` to the sidecar type and schema, server-writable only, plus the shared capture request and result types.
**Files:** `frontend/src/lib/models/types.ts`, `frontend/src/lib/models/schemas.ts`, `frontend/src/lib/api/schemas.ts`, a new types-only module for the capture request, result and notice shapes beside the existing api types (located by the task), existing schema and sidecar test files under `frontend/tests/`
**Done when:** Tests first, then green: `inboxFolderId` is an optional UUID in `ProjectConfig` in all three files, a config round-trips it through the `lib/api` schema without it being stripped, a non-UUID value is rejected, and a project with no value still parses unchanged; the sidecar accepts `capturedAt` (a valid ISO timestamp) and `capturedLink` (a string of bounded length, the bound stated in a constant) and rejects an invalid timestamp and an over-long link; `capturedAt` and `capturedLink` are not in `CLIENT_WRITABLE_SIDECAR_KEYS` (`resource-crud-core.ts:454`, read only here) and a test shows a client sidecar update carrying either key leaves them unchanged; the default metadata schema is unchanged (existing test passes); the capture result type distinguishes created, needs-choice (carrying only the state), and refused, and carries notices; the types module imports no React and no `node:*`. Electron and cli typecheck are run and recorded.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-3 (field), FR-22 (keys and validation), FR-2 (result shape), FR-19. `frontend/CLAUDE.md` says `lib/api/schemas.ts` strips undeclared keys, so the field must be declared there. Hot files: Task 3 only.
**Done:** [x]

### Task 4: Pure capture text helpers
**What:** Add the pure functions that validate the captured text and link, derive the title, and build the body, with no I/O.
**Files:** a new `frontend/src/lib/models/inbox-capture-text.ts` (name located by the task) and a new test file beside the related model tests
**Done when:** Tests first, then green: empty and whitespace-only text with no link is a refusal with a plain message and no other output; text longer than 50,000 characters, counted as given with no trimming, is a refusal whose message names the limit, and 50,000 exactly is accepted; the title is the first non-empty line, trimmed, cut to 80 characters with no word-boundary rule (a test with an 80-character-plus word cut mid-word), and "Captured note" when there is no non-empty line; a link-only capture produces a body that is the link and a title from the first line; the body is the whole text; the plain-text and TipTap body forms are produced from the text deterministically; a link longer than the bound, or not a string, is refused; the `capturedAt` value is a full ISO UTC timestamp from an injected clock; none of the functions reads the network or the file system. The module imports no React and no `node:*`. Electron and cli typecheck are run and recorded.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-2 (refusals as returned notices), FR-5 (title and body), FR-22 (validation), FR-19. Refusals are returned values, not thrown errors (OQ-4, OQ-8). The TipTap shape must match what `createResourceCore` expects (`resource-factory.ts:239-254`, per Task 1(a)).
**Done:** [x]

### Task 5: Inbox membership helper
**What:** Add a pure helper that, from a folder list and the Inbox folder id, returns the Inbox subtree (the folder and all its descendant folders) and whether a resource or folder is in it, usable by the client and the server.
**Files:** a new `frontend/src/lib/models/inbox-membership.ts` (name located by the task) and a test file beside the related model tests; reads `frontend/src/lib/models/folder-utils.ts` and `components/ResourceTree/moveResource.ts`
**Done when:** Tests first, then green: with `inboxFolderId` unset or naming no folder, no item is in the Inbox; the subtree is the Inbox folder and every descendant folder at any depth; a resource whose `folderId` is any subtree folder is in it, a resource at root or in a folder outside it is not; a folder nested inside the Inbox is in it; a parent cycle in malformed data terminates and is reported as a failure value, never an infinite loop or a silent "not in"; a function returns the ids of every resource in the subtree; the count of items in it counts resources only (not folders); a move classifier answers, for a moved item and its new parent, "out of the Inbox", "within the Inbox", or "unrelated", including the folder case. The module imports no React and no `node:*`, so the server and the client share it. Electron and cli typecheck are run and recorded.
**Depends on:** 1
**Estimate:** 2
**Notes:** Satisfies FR-7 (membership), FR-14 (count basis), FR-23 (move classification), OQ-9. The client walk and the server `readFolderTree` result both feed it as plain lists; it does no reading itself. Task 1(e) records the cost; if the measured cost is not acceptable, report it and do not change the semantics.
**Done:** [x]

### Task 6: Compile-exclusion seeding for a captured item and removal on a move out
**What:** Make the compile-exclusion seeding mechanism callable for a text item and add a removal function that deletes ids from `config.compileDefaults.excludedResourceIds`.
**Files:** `frontend/src/lib/models/saved-defaults-core.ts`, `frontend/tests/unit/saved-defaults-core.test.ts` (existing)
**Done when:** Tests first, then green: the seeding mechanism of `seedSourceCompileExclusion` (`saved-defaults-core.ts:140`) is exposed for a non-Source id, either by exporting a generically named wrapper or by sharing the inner function, with the existing Source behaviour and tests unchanged; it returns a notice, not a throw, at the 5000-id cap and for an unusable stored shape, and throws on a read or write failure; it never touches `exportDefaults`; a new removal function takes a list of ids, runs `updateProjectJson` inside `withMetaLock(projectRoot)` with a callback that takes no lock, removes each present id, is a no-op for an absent id and for a project with no `compileDefaults`, leaves other ids and `exportDefaults` unchanged, writes nothing when nothing changes, and throws on a read or write failure; the removal also removes an id the writer set deliberately (the owner accepted this). Electron and cli typecheck are run and recorded.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-6 (mechanism), FR-23 (removal), OQ-3, OQ-4. Hot file: Task 6 only. Task 8 calls the seeding, Task 14 calls the removal.
**Done:** [x]

### Task 7: Inbox folder resolution core
**What:** Add the core that resolves a project's Inbox in its three states (live, in Trash, purged or unknown), creating the folder and writing the config id in one locked step.
**Files:** a new `frontend/src/lib/models/inbox-folder-core.ts` (name located by the task) and a new test file beside the related model tests; reads `trash.ts` (`restoreFolder`, `trashFolderManifestPath`), `meta-locks.ts`, `project-json-write.ts`, the folder-creation path recorded in Task 1(b)
**Done when:** Tests first, then green, with a temporary project or an in-memory fake adapter: a live id returns that folder and writes nothing; an id naming a folder in Trash (found by a direct read of `trashFolderManifestPath(projectRoot, folderId)`, never by listing Trash) returns a needs-choice result that carries nothing but the state and writes nothing; with the choice `restore` it restores through `restoreFolder`, reports `relocated` and `renamed`, and returns the folder whatever the restore did; with the choice `new` it creates a new Inbox, repoints the config id and leaves the old one in Trash; a missing manifest (purged), an id naming no folder, or no id creates a new Inbox named "Inbox" at the project root and repoints the id with no prompt; reading `config.inboxFolderId`, creating the folder and writing the id are one step inside `withMetaLock(projectRoot)` through `updateProjectJson` whose callback takes no lock; two concurrent calls on a project with no Inbox leave exactly one Inbox folder and both calls return the same folder id; if the folder was created and the config write then fails, the just-created empty folder is removed and the function fails with an error (not success), and a failure of the removal itself is reported, not swallowed; a restore of an old Inbox beside a new one is exercised and reported, not prevented; a locked-access error propagates uncaught and a fake locked storage shows nothing was written first; the project id is validated before any path is built; the `special` flag is never read or written (a test checks the created folder's flag is unchanged from the default). The module imports no React and nothing the native build cannot bundle. Electron and cli typecheck are run and recorded.
**Depends on:** 3
**Estimate:** 8
**Notes:** Satisfies FR-3, FR-4, FR-9 (propagation), OQ-2, OQ-17. The race guarantee is in-process only; write that as a code comment and do not claim cross-process safety. The largest and riskiest core task: if the folder-creation path from Task 1(b) cannot be called inside a held `withMetaLock` callback without taking a lock, stop and report. Estimate may move if the folder-creation path is entangled with route code.
**Done:** [x]

### Task 8: Capture core: create the item, seed the exclusion, write the sidecar keys
**What:** Create `inbox-capture-core.ts`, which resolves the Inbox, creates one text resource with its whole body in one call, seeds its compile exclusion, and writes `capturedAt` and `capturedLink`, returning the resource, the Inbox folder id and notices.
**Files:** a new `frontend/src/lib/models/inbox-capture-core.ts` and a new test file beside the related model tests; reads `resource-crud-core.ts`, `resource-factory.ts`, `resource-initial-revision.ts`, `inbox-folder-core.ts`, `inbox-capture-text.ts`, `saved-defaults-core.ts`
**Done when:** Tests first, then green, without HTTP: a typed capture of text creates one text resource in the Inbox through `createResourceCore` with `text.plainText` and `text.tiptap`, whose `v-1` body is the whole text, with the title of Task 4 and no change to shared creation code (`git diff` shows none); `capturedAt` is written server-side as an ISO timestamp and `capturedLink` only when a link was given; a link-only capture creates a resource whose body is the link, titled from it, with `capturedLink` set; empty, whitespace-only and over-50,000-character text each return a refusal notice and write nothing (no Inbox is created either); the item's id is added to `config.compileDefaults.excludedResourceIds` and `exportDefaults` is untouched; a seeding notice (cap, unusable shape) is returned and the item is kept; a seeding throw is returned as a visible error of the seeding and the item is kept; a needs-choice result from Task 7 is returned unchanged and nothing is written, and a second call carrying `restore` or `new` creates the item after the Inbox is resolved; a failure creating the item after the Inbox was created leaves the Inbox and is reported as a failure; the project id is validated first, the root comes from the storage context, no client path is used, a locked-access error propagates uncaught with nothing written; the function makes no network call. Electron and cli typecheck are run and recorded.
**Depends on:** 4, 6, 7
**Estimate:** 5
**Notes:** Satisfies FR-2, FR-5, FR-6, FR-9 (core), FR-22 (server write). Unlike a Source, a failed seeding must not remove the item (`source-seeding.ts:59` is the contrast). Task 9 extends this file; keep the function structured with a clear step list so the writing-log step slots in.
**Done:** [x]

### Task 9: Capture core: writing-log entry and the import-graph pin
**What:** Add the writing-log step to the capture core (typed words as additions, shared text as an import) and a test that pins the core's import graph.
**Files:** `frontend/src/lib/models/inbox-capture-core.ts` and its test (Task 8's), `frontend/src/lib/models/writing-log.ts` only if no existing entry point can record an import with a `source` field (then a minimal addition and its existing test file)
**Done when:** Tests first, then green: a typed capture appends its body's word count as additions to the writing log of the captured-into project on the capture day, and no entry is written for any other project; an origin of `shared` writes an import entry with the `source` field the product spec FR-48 defines, on its separate line, which `aggregateForRoot` does not count toward the daily goal (test through the existing aggregate); pasted and typed text are logged the same (no paste detection); a failure writing the entry returns a notice that the writing log was not updated and the item is kept, never silence; the notice is distinct from the refusal and seeding notices; a refused capture writes no entry; a test walks the static import graph of `inbox-capture-core.ts` and its local dependencies and fails if any `node:*` import appears outside the storage adapter or any React import appears. Electron and cli typecheck are run and recorded.
**Depends on:** 8
**Estimate:** 3
**Notes:** Satisfies FR-8, FR-2 (import-graph pin for Feature 107 reuse). Read `writing-log.ts` first; the spec says the entry shapes exist (product FR-48). Do not touch the writing-log read-time aggregation (Task 12).
**Done:** [x]

### Task 10: Route, client, native backend, web stub and sharing-gate tests
**What:** Expose the capture core through `POST /api/project/capture`, a `lib/api` client resolved through `createTransport`, and a native in-process backend with a `.web-stub.ts` alias.
**Files:** `frontend/app/api/project/capture/route.ts` (new), `frontend/src/lib/api/inbox-capture.ts` (new), a new native capture backend and its `.web-stub.ts` under `frontend/src/store/transport/` (pattern `native-resource-bytes-backend.ts`), `frontend/next.config.mjs`, existing route, transport and sharing-gate tests under `frontend/tests/`
**Done when:** Tests first, then green: the route is wrapped in `withStorageContext`, validates the project id and the body (text, optional link, origin of `typed` or `shared`, optional choice of `restore` or `new`) at the boundary and returns 400 for a malformed one, rethrows locked-access errors so the response is the existing locked response, returns the core's refusal and needs-choice results as typed bodies, and on hosted web writes only into a project of the signed-in tenant (a test with a second tenant's project id is refused or not found, never written); the route calls no `checkLimit` and adds no limit switch or route guard, and a test with the sharing gate (`src/lib/sharing/gate.ts:247-274`) shows a not-confirmed request is refused and a confirmed device is allowed; the client is resolved through `createTransport` with the raw `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` comparison, calls `POST /api/project/capture` on web and the in-process backend on native, never composes existing create, config or log calls, and passes the typed results and `isLockedAccessError` failures through unchanged on both transports; the native backend is loaded by a literal dynamic import and `next.config.mjs` aliases it to the `.web-stub.ts` for the web build mirroring the existing alias entries (a test or build-config check shows the entry exists); a context-less native call fails closed. Electron and cli typecheck are run and recorded if a file under `lib/models` is touched; `pnpm typecheck` and `pnpm lint` on touched files run.
**Depends on:** 9
**Estimate:** 5
**Notes:** Satisfies FR-10, FR-9 (both transports), FR-2 (module reached through route, client and backend), OQ-1, OQ-5. Do not run `pnpm build:native` or `next build` (LEAD-RUN, Task 28). Fakes for tenancy and the gate are not evidence about a real tenant or a paired device; those stay under "Not verified".
**Done:** [x]

### Task 11: Goal exclusion: server goal-filtered total
**What:** Exclude Inbox items from the server-computed project total goal unless a goal filter is set.
**Files:** `frontend/src/lib/models/goal-filtered-total-core.ts`, `frontend/tests/unit/goal-filtered-total-core.test.ts` (existing); reads `inbox-membership.ts`, `folder-utils.ts`, `goal-read-error.ts`
**Done when:** Tests first, then green: with no goal filter, a text resource in the Inbox folder or any descendant folder does not add to the total and an equivalent resource outside does; with a goal filter that selects the Inbox through the query builder's "Folder" intrinsic (`query-intrinsics.ts:72-81`) the Inbox items count and the filter alone decides; after the item is moved out, its words count; the folder tree is read once per aggregate (a spy shows one `readFolderTree` call for many resources); an unreadable folder tree or sidecar makes the figure unavailable as the existing code does today, never 0; existing Source-exclusion tests pass unchanged. Electron and cli typecheck are run and recorded.
**Depends on:** 3, 5
**Estimate:** 3
**Notes:** Satisfies FR-7 (server total). Hot file: Task 11 only. Do not edit `writing-log-core.ts` (Task 12) or `DataView.tsx` (Task 13).
**Done:** [x]

### Task 12: Goal exclusion: daily aggregate in the writing log
**What:** Exclude Inbox items from the daily goal figure computed by `aggregateForRoot` when there is no goal filter.
**Files:** `frontend/src/lib/models/writing-log-core.ts`, the existing writing-log and daily-goal tests under `frontend/tests/unit/` (for example the existing `aggregateForRoot` tests, located by the task); reads `inbox-membership.ts`
**Done when:** Tests first, then green: a typed capture's words appear in the writing log and do not change today's daily-goal figure with no filter; with a goal filter that selects the Inbox through the "Folder" intrinsic they count; after the item is moved out they count (read-time membership, `memberIds === null` branch of `aggregateForRoot`, `writing-log-core.ts` 212-261); an unreadable folder or sidecar makes the figure unavailable, never 0; the shared-origin import entries remain excluded from the daily goal as before; existing tests pass unchanged. Electron and cli typecheck are run and recorded.
**Depends on:** 3, 5
**Estimate:** 3
**Notes:** Satisfies FR-7 (daily goal). Hot file: Task 12 only. The documented consequence that a filed-out item makes all its words count so today's figure can jump is stated in docs (Task 27), not in this task.
**Done:** [x]

### Task 13: Goal exclusion: client-side project total in the Data view
**What:** Exclude Inbox items from the client-computed project total in `DataView.tsx` unless a goal filter is set.
**Files:** `frontend/components/WorkArea/DataView.tsx`, `frontend/tests/dataViewGoalFilter.test.tsx` (existing); reads `inbox-membership.ts`
**Done when:** Tests first, then green: where `r.type === "source"` is skipped today (`DataView.tsx:270`), a text resource in the Inbox subtree is also skipped when no goal filter is set, found by a `parentId` walk over the store's folders with no request of its own; with a goal filter the filter alone decides; after a move out the words count; a malformed parent cycle does not hang and is not shown as 0; existing tests pass unchanged; the typecheck and lint of the touched files run.
**Depends on:** 3, 5
**Estimate:** 2
**Notes:** Satisfies FR-7 (client total). Hot file: Task 13 only. Read `DataView.tsx` and its stories before using any prop.
**Done:** [x]

### Task 14: Clear the compile exclusion on a move out of the Inbox: core, route and native backend
**What:** After a move out of the Inbox subtree, remove the moved item's id (and for a folder every contained resource's id) from `compileDefaults`, in both the reorder route and the native backend, and return a notice when the clearing fails.
**Files:** `frontend/app/api/projects/[projectId]/reorder/route.ts`, the native reorder or project backend that implements the same move (located by the task, under `frontend/src/store/transport/`), a new clearing core function in `frontend/src/lib/models/` (name located by the task) or an addition to an existing move core, existing reorder route and native backend tests under `frontend/tests/`; reads `inbox-membership.ts`, `saved-defaults-core.ts`
**Done when:** Tests first, then green, one set per path (route and native backend): moving a resource from the Inbox to a folder outside the Inbox subtree removes its id from `compileDefaults.excludedResourceIds`; moving a folder out removes the ids of every resource inside it and its descendant folders; moving within the Inbox subtree leaves every id; a move from outside into the Inbox leaves ids as they are; an id absent from the list is a no-op; an exclusion the writer had set deliberately is removed too; the removal runs after the move and uses `updateProjectJson` under `withMetaLock(projectRoot)` through Task 6's function; if the removal throws, the move stands and the response carries a notice saying the compile default was not cleared (not an error status and not silence); a project with no `inboxFolderId` changes nothing; existing reorder tests pass unchanged. Electron and cli typecheck are run and recorded.
**Depends on:** 5, 6
**Estimate:** 5
**Notes:** Satisfies FR-23, FR-15 (same result through the existing move path), OQ-3. The "move route" is the reorder route used by `persistReorder` (`components/ResourceTree/moveResource.ts` builds its payload); confirm that is the single move path, including `MoveResourceModal`, and record any other writer found. Do not edit `resourcesSlice.ts` (Task 15).
**Done:** [x]

### Task 15: Show the message when the compile default was not cleared
**What:** Carry the notice of Task 14 through the move action to a visible message, so a failed clearing is never silent.
**Files:** `frontend/src/store/resourcesSlice.ts`, `frontend/components/ResourceTree/useResourceReorder.ts` (and the transport function that returns the reorder response, located by the task), existing tests for the slice and the reorder hook under `frontend/tests/`
**Done when:** Tests first, then green: a reorder response carrying the notice produces a visible message in a region exposed to assistive technology (`role="status"` or the app's existing toast mechanism, which the task names), reading that the compile default was not cleared; a response without a notice shows nothing new; a failed move (error response) shows the existing failure message and leaves the item where it was; the notice and the move failure produce different messages; existing tests pass unchanged. No red.
**Depends on:** 14
**Estimate:** 3
**Notes:** Satisfies FR-23 (visible message), FR-15 (failed move message), FR-17 (visibility). Edits `resourcesSlice.ts` and `useResourceReorder.ts` only; not `ResourceTree.tsx` (Tasks 22 and 23). Read the toast or notice component's source and stories before using any prop.
**Done:** [x]

### Task 16: Capture box dialog component
**What:** Build the presentational Capture box dialog with a text area, a project choice slot, keyboard handling, focus management and accessible messages.
**Files:** a new `CaptureBox.tsx` under `frontend/components/` (a new `Capture/` folder, located by the task), its stories, and a new test file for the component plus an a11y test beside the existing a11y tests under `frontend/tests/a11y/`
**Done when:** Tests first, then green: the box is a dialog with an accessible label, traps focus while open and is fully keyboard operable; Enter submits, Shift+Enter inserts a newline, and Enter does not submit while `event.nativeEvent.isComposing` is true (tests for each, including a composition event); Escape closes without calling submit; on success the box closes, focus returns to the element that had it before the box opened, and a status message ("Captured to <project>" or the wording the task fixes) is announced in a `role="status"` region that does not take focus; every failure state (refused empty text, project not found, locked and unlock declined, Inbox in Trash awaiting a choice, seeding notice, writing-log notice, network or server error, paired device refused) renders its own distinct readable message in a `role="alert"` or `role="status"` region as the severity requires, and the typed text stays in the box in every failure; "failed" and "empty" never share a message; a disabled state with "a project is needed" shows when no project can be chosen; an axe test and a keyboard test pass; stories cover idle, submitting, each failure state and the disabled state; no red token or colour is used for any state (the repository red rule). The component takes props only (no store, no fetching); every prop is declared in its stories.
**Depends on:** 3
**Estimate:** 5
**Notes:** Satisfies FR-11 (box behaviour), FR-17, FR-19. Read `ConfirmDialog` or the existing modal component's source and stories first and reuse its focus trap; do not use a prop before opening its source. The project choice is a slot or prop filled by Task 17's output and Task 18.
**Done:** [x]

### Task 17: Capture project choice: list, default and remembered keys
**What:** Add the hook and the small preferences module that read the project list when the box opens, pick the default project, and remember the last-captured and most-recently-opened project ids in `localStorage`.
**Files:** a new project-choice hook and a new capture-preferences module (names located by the task, beside `useSpellcheckEnabled.ts` and `spellcheck-preference.ts` as the pattern), existing or new test files under `frontend/tests/`
**Done when:** Tests first, then green: two new `localStorage` keys exist as exported constants, in the manner of `SPELLCHECK_ENABLED_STORAGE_KEY`, and nothing is written to `project.json`; the project list is read from the existing tenant-scoped listing when the box opens, with a loading state, a failed state with a readable message and a retry (never an empty picker), following `app/(app)/page.tsx:150-219`, and the store's list alone is never used; the default is the last-captured project, falling back to the most recently opened one when the first is gone, and empty with a "project is needed" state when there are no projects; a stored id that is malformed or not in the list is treated as gone; a `localStorage` read or write failure does not block capture (the default falls back and the failure is not shown as an empty list); a locked project is listed and selectable, shown as "Locked project" with its encryption date and no name; an unusable project (`isUnusable`) is not offered; on hosted web only the signed-in tenant's projects appear (the tenant-scoped listing, tested with a fake); `typecheck` and `lint` run.
**Depends on:** 3
**Estimate:** 5
**Notes:** Satisfies FR-12 (all), OQ-14, OQ-15, OQ-18. The write of the most-recently-opened key in `handleOpen` is Task 20, not this task. Read the project listing client's source before using it.
**Done:** [x]

### Task 18: Capture box host: submit, notices and status
**What:** Add the host component that fills the dialog with the project choice, calls the capture client, shows each returned notice and error, and closes with a confirmation on success.
**Files:** a new `CaptureBoxHost.tsx` beside `CaptureBox.tsx` and its stories and test file; reads `frontend/src/lib/api/inbox-capture.ts`
**Done when:** Tests first, then green, with a fake client: a successful typed capture calls the client once with the project id, text, `origin: "typed"` and no choice, remembers the project as last-captured, closes and confirms; a refusal notice (empty text, over 50,000 characters naming the limit) is shown and the text stays; a seeding notice or a writing-log notice is shown to the writer and the capture is reported as made with the notice, not as a failure; a network or server error, a project not found and a paired-device 403 refusal each show their own message and keep the text; a rejected promise is never shown as success; submitting twice quickly sends one request; the typed text is kept in component state only and never written to `localStorage`, a log or a file; stories cover the host's states; `typecheck` and `lint` run.
**Depends on:** 10, 16, 17
**Estimate:** 5
**Notes:** Satisfies FR-11 (capture from the box), FR-2 (notices shown), FR-17. The locked-project and Inbox-in-Trash flows are Task 19; this task leaves them as a clearly named unhandled branch that returns an error message, not a silent success. Hot file: Task 18 creates `CaptureBoxHost.tsx`, Task 19 extends it.
**Done:** [x]

### Task 19: Capture box host: locked project unlock flow and Inbox-in-Trash choice
**What:** Handle a locked project by showing the existing unlock prompt and retrying once, and handle the Inbox-in-Trash needs-choice result by offering "restore it" or "make a new one".
**Files:** `CaptureBoxHost.tsx`, its test file and stories (Task 18's); reads `frontend/components/common/UnlockModal.tsx`, its stories and `unlock-prompt-gate`
**Done when:** Tests first, then green, with fakes: a locked-access error from the client (recognised through `isLockedAccessError` on both transports) opens the existing `UnlockModal`, gated for a paired device by `unlock-prompt-gate`; the typed text is held in component memory only while the prompt is open and never in `localStorage`, a log or a temporary file (a test inspects `localStorage` and the console); a successful unlock retries the capture exactly once with the held text and shows success; declined, failed, or limited (the `unlocking` limit on a paired device) unlock writes nothing and shows plainly that nothing was captured and why, never success, and keeps the text in the box; a needs-choice result shows "restore it" and "make a new one" (keyboard operable, announced), each sends the second call with `restore` or `new`, a restore that relocated or renamed the folder shows where the item landed (`relocated`, `renamed` reported to the writer), and cancelling the choice writes nothing and keeps the text; a second needs-choice after a retry shows the choice again, not a loop; a locked project chosen from the picker leads to the unlock prompt before any capture is sent; stories cover the locked and choice states; an axe and a keyboard test pass for each. No red.
**Depends on:** 18
**Estimate:** 5
**Notes:** Satisfies FR-9 (interface), FR-4 (interface choice), FR-17, OQ-180, OQ-179. A real unlock flow is not exercised here and stays under "Not verified". Read `UnlockModal.tsx` source and stories before using any prop.
**Done:** [x]

### Task 20: Mount the Capture box host inside AppShell, add Capture to its key handler, record the last-opened project
**What:** Mount the Capture box host once inside `AppShell` (which already renders on the Start screen), add Cmd/Ctrl+Shift+K to `AppShell`'s existing document keydown handler (`AppShell.tsx:916-926`, which stays in `AppShell`) with the missing `shiftKey` check fixed, and write the most-recently-opened key in `handleOpen`.
**Files:** `frontend/components/Layout/AppShell.tsx`, existing `appShell*` tests under `frontend/tests/` (a key-combination test and a host-render test added to an existing file), `frontend/components/Layout/ShellModalCoordinator.tsx` (read only, unless the host must be rendered through it), `frontend/app/(app)/page.tsx` for `handleOpen` (the most-recently-opened write; also a prop thread only if the host needs one, which is not required)
**Done when:** Tests first, then green: the Capture box host is mounted once, inside `AppShell`, and a test shows it renders while `AppShell` has no project (`showSidebars` false); a single document keydown handler exists in `AppShell` (a test fails if two listeners respond to one keydown); Cmd+K and Ctrl+K without Shift open the palette (and not Capture), Cmd+Shift+K and Ctrl+Shift+K open only the Capture box (not the palette), and neither opens both (a test of the four combinations plus plain K); the palette still opens only while a project is open, as today; `handleOpen` (`app/(app)/page.tsx:338`) writes the most-recently-opened project id to the second `localStorage` key of Task 17, and the import-complete and restore paths that call it write it too (test through one of them); a `localStorage` write failure in `handleOpen` does not stop the project opening; existing AppShell and page tests pass unchanged; `typecheck` and `lint` run.
**Depends on:** 2, 19
**Estimate:** 5
**Notes:** Satisfies FR-11 (mount, shortcut, shiftKey fix), FR-12 (recent-project write), OQ-6 (amended 2026-11-09). Hot files `page.tsx`, `AppShell.tsx`: Task 20 then Task 21 only. Task 2 measured `AppShell` mounted on the Start screen, so no handler moves to `page.tsx`. The key-combination unit test is not evidence that any browser or the Electron shell delivers the key; that is Task 26.
**Done:** [ ]

### Task 21: "Capture..." row in the resource command palette
**What:** Add a "Capture..." row to `ResourceCommandPalette.tsx`, shown first for an empty query or a prefix of "capture", hidden otherwise, that opens the Capture box.
**Files:** `frontend/components/common/ResourceCommandPalette.tsx`, its stories, existing palette tests under `frontend/tests/`, `frontend/components/Layout/ShellModalCoordinator.tsx` (pass the new prop), `frontend/components/Layout/AppShell.tsx` (only the wiring, if needed)
**Done when:** Tests first, then green: the source and stories of `ResourceCommandPalette.tsx` were opened before the new prop (for example `onCapture`) was added; the row type sits beside the resource rows; the row "Capture..." is first when the query is empty or is a case-insensitive prefix of "capture" ("c", "CAP", "capture") and is absent for other queries ("note", "captures"); the "No resources match your search." empty state does not show while the Capture row is visible and does show for a query matching nothing (not even Capture); the "Enter to open" hint reads correctly for the Capture row; Enter and click on the row both open the Capture box and close the palette; the row is keyboard operable (arrow keys reach it, selected state announced like the other rows); stories cover empty query, the "cap" prefix and a non-matching query; existing palette tests pass unchanged; an axe check passes; no red; `typecheck` and `lint` run.
**Depends on:** 20
**Estimate:** 3
**Notes:** Satisfies FR-24. Edits `ShellModalCoordinator.tsx` and `AppShell.tsx` after Task 20 for wiring only.
**Done:** [ ]

### Task 22: Inbox count in the resource tree
**What:** Show a count of the items in the Inbox on its tree row, computed in the client from the store, exposed in the row's accessible name.
**Files:** `frontend/components/ResourceTree/ResourceTree.tsx` (and the row component it renders, located by the task), its stories, existing tree tests (`tests/resourceTree.test.tsx`, `resourceTree.order.test.tsx`); reads `inbox-membership.ts` and the project's `config.inboxFolderId` from the store
**Done when:** Tests first, then green: the config's Inbox folder row shows a count of the resources in the Inbox folder and all its descendant folders (folders not counted); the count updates when an item is captured, filed out or moved in, with no reload and no request of its own (a spy shows no fetch); the badge is absent when the Inbox is empty (no "0", no differently styled zero) and absent on every folder that is not the config's Inbox, including a folder merely named "Inbox"; there is no toast, sound or focus change; the count is part of the row's accessible name (a test reads the name); a project with no `inboxFolderId` shows no badge; stories cover a count and an empty Inbox; existing tests pass unchanged; an axe check passes; no red; `typecheck` and `lint` run.
**Depends on:** 5, 15
**Estimate:** 3
**Notes:** Satisfies FR-14. Hot file `ResourceTree.tsx`: Task 22 then Task 23. Read the row component's source and stories before using any prop. The Inbox config id must reach the tree from the store; if it is not exposed by the project slice, adding a selector is in scope, a store change beyond that is not.
**Done:** [x]

### Task 23: "File to..." action on a tree item
**What:** Add a "File to..." entry to the item row menu and context menu that opens the existing folder picker and moves the item through the existing move path.
**Files:** `frontend/components/ResourceTree/ResourceTree.tsx` (row menu and context menu wiring), `frontend/components/ResourceTree/MoveResourceModal.tsx` and `FolderTreePicker.tsx` only if a prop is needed (read their source and stories first), `frontend/components/ResourceTree/moveResource.ts` (read, reuse), existing tree and menu tests (`tests/resourceTreeContextMenu.test.tsx`, `tests/moveResource.test.ts`)
**Done when:** Tests first, then green: "File to..." appears in the row menu and the context menu of an item and opens the existing folder picker; choosing a folder moves the item through `computeMovePayload` and `persistReorder`, the same path as drag and `MoveResourceModal`, so the compile-exclusion clearing of Task 14 and its message of Task 15 apply with no second path (a test asserts the same function is called and no separate move code exists); the action is keyboard operable and announced; a failed move shows a message and leaves the item where it was; a no-op or invalid destination (the item's own folder, a folder moved into its own descendant) is refused as `computeMovePayload` already does; the entry is not limited to Inbox items; existing tests pass unchanged; an axe check passes; no red; `typecheck` and `lint` run.
**Depends on:** 22
**Estimate:** 3
**Notes:** Satisfies FR-15. "File to..." and the tree move must give the same result including the end of the goal exclusion (read time) and the clearing of the compile exclusion.
**Done:** [x]

### Task 24: Sidebar block for capture time and link
**What:** Show `capturedAt` and `capturedLink` read-only in a small metadata block in the sidebar for a captured item.
**Files:** `frontend/components/Sidebar/MetadataSidebar.tsx` (or a new section component beside `EntitySection.tsx`, located by the task), its stories, existing sidebar tests under `frontend/tests/`
**Done when:** Tests first, then green: a resource whose sidecar has `capturedAt` shows a block "Captured" with the time formatted for the writer's locale and the ISO value available to assistive technology or as the element's `title` or `dateTime` the task names; `capturedLink` shows as a read-only link or plain text (the task decides and states it; a non-http(s) scheme is shown as text and not as a link); the block has no input, and a test shows no control can change either key; a resource with neither key shows no block; the default metadata schema and the schema manager are unchanged; stories cover both fields and neither; existing tests pass unchanged; an axe check passes; no red; `typecheck` and `lint` run.
**Depends on:** 3
**Estimate:** 2
**Notes:** Satisfies FR-22 (read-only display). A link opened from the sidebar must not make a network request on render (capture itself makes none). Read `MetadataSidebar.tsx` source and stories before using any prop.
**Done:** [x]

### Task 25: FR-16 pins: search, smart folders, Data view queries, Organizer and export treat an Inbox item as ordinary
**What:** Add the tests that show an Inbox item is found by search and a smart folder query and is included in export by default, with no special case in those modules.
**Files:** existing test files for search, saved queries and export selection under `frontend/tests/` and `frontend/tests/unit/` (located by the task); no product source change
**Done when:** Tests written first and green on the current tree: with the Inbox flag unset in those modules (the test fixture sets `config.inboxFolderId` and places a text resource in the Inbox folder), a search for a word in the item returns it; a smart folder (saved query) matching the item returns it; a Data view query matches it; the Organizer lists it as it lists any resource; the export selection includes it by default and compile's default selection leaves it unticked only because of the seeded exclusion, both overridable per run; a source search of those modules (`git grep` recorded in the task report) finds no reference to `inboxFolderId` or "Inbox" outside the files Tasks 5, 11 to 14 and 22 edit; each assertion is shown to fail when the item is replaced by one that the module ought not to return, to show the test is not vacuous (recorded in the task report). If a module is found to special-case the Inbox, the test returns to the owner as a defect.
**Depends on:** 3
**Estimate:** 3
**Notes:** Satisfies FR-16. Tests only; adds to existing test files where a fit exists, a new file only for a path with no existing test. Runs in parallel with Tasks 7 and 11 to 14 because it touches different test files; if a file conflict with Task 6's saved-defaults test appears, this task uses its own file.
**Done:** [x]

### Task 26: LEAD-RUN: Cmd/Ctrl+Shift+K in Chrome, Safari, Firefox and the Electron shell
**What:** Run the real app in each of Chrome, Safari, Firefox and the Electron desktop shell and record whether the page's handler receives Cmd/Ctrl+Shift+K with `preventDefault` taking effect.
**Files:** `specs/features/inbox-quick-capture/experiments.md` (FR-13 shortcut checks and Not verified sections)
**Done when:** "FR-13 shortcut checks" has one recorded entry per browser or shell run, each with the browser or shell version, the operating system, whether the Capture box opened from the keypress, whether `preventDefault` took effect, and, if not, what the browser or shell did instead, as observed values with no cause; the Electron entry also records whether the shell registers a menu accelerator for the same key (the spec's unknown, observed by running or reading the electron menu code, labelled as one or the other); Firefox on Windows or Linux (known candidate clash, console shortcut) is recorded as measured or as not run, never as fact; a browser or shell not run is listed under "Not verified"; if any check shows the key cannot be received, the entry says so and the work returns to the owner, and no other key is chosen by this task or by any other.
**Depends on:** 20
**Estimate:** 3
**Notes:** LEAD-RUN, not an implementor task: the lead or owner runs the real app outside the sandbox from the main checkout (`pnpm start` for the browsers, `pnpm electron:dev` or the packaged shell for Electron). Satisfies FR-13, FR-18. Unit tests with fakes (Task 20) are not evidence about browsers.
**Done:** [ ]

### Task 27: Documentation updates for the Inbox and Capture box
**What:** List and apply the documentation changes FR-21 requires, with the scribe stage writing the prose, so that no document states an unmeasured result as fact.
**Files:** the user handbook pages under `docs/user/handbook/` (located by the task; `specs/features/user-handbook.md` names its pages), a new `docs/features/inbox.md`, `frontend/CLAUDE.md` (Code Map: each file or seam added by Tasks 3 to 24), repo-root `CLAUDE.md` (glossary entries "Inbox" and "Capture box"); `specs/product/getwrite.features.md` is not edited (status is the pipeline lead's)
**Done when:** The handbook and `docs/features/inbox.md` state, in each page's existing style and in plain language: the shortcut (with the browser and shell results exactly as recorded by Task 26, and any browser not run said to be unchecked), the palette entry, what the Inbox is and that it is created on first capture, that it is left out of compile by default and out of the project and daily word goals by default, that export includes it, how to file an item (drag, "File to...", the move dialog), that filing an item out makes all its words count from then on so today's goal figure can jump, that filing an item out clears a compile exclusion the writer set on it, and that the first-capture guarantee holds within one running app and not across processes; no sentence states an unmeasured result as fact, and no test-run wording or "verified against" line appears; the `frontend/CLAUDE.md` Code Map lists each file or seam added; the repo-root `CLAUDE.md` glossary has an "Inbox" and a "Capture box" entry; `prettier --check` passes on every touched file. Code doc comments belong to the code tasks and are not part of this task.
**Depends on:** 11, 12, 13, 21, 23, 24, 26
**Estimate:** 3
**Notes:** Satisfies FR-21. Prose is the scribe stage's job; the orchestrator passes it the files and the facts above. Do not name a cause in any document.
**Done:** [ ]

### Task 28: LEAD-RUN: final suites exactly as CI runs them
**What:** Run every CI command from the places the workflows run them, record each as run or not run, and write the acceptance record including the "Not verified" list.
**Files:** `specs/features/inbox-quick-capture/experiments.md` (Acceptance and Not verified sections)
**Done when:** The CI command list is first re-read with `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` and any difference from the list below is recorded; each of these is run and its result recorded, from the main checkout, outside the sandbox: from the repo root `pnpm run format:check`; frontend (`cd frontend`) `pnpm lint`, `pnpm run check:no-hex`, `pnpm typecheck`, `pnpm test:ci`, `pnpm test:e2e` (builds and serves Storybook on :6006; `pnpm storybook` stopped first), `pnpm --filter getwrite-frontend build`; electron `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`), `pnpm --filter getwrite-electron test`, `pnpm --filter getwrite-electron build`; cli `pnpm --filter getwrite-cli typecheck`, `pnpm --filter getwrite-cli test`, `pnpm --filter getwrite-cli build`, then `node cli/dist/bin/getwrite-cli.cjs --help | head -n 20`, `node cli/dist/bin/getwrite-cli.cjs doctor --help | head -n 20` and `node cli/dist/bin/getwrite-cli.cjs prune --help | head -n 20`; android `pnpm --filter getwrite-android build`; root `pnpm build:native` and `pnpm knip`, with the knip output compared to main (any finding on HEAD absent on main listed, for example an exported helper added by Tasks 4 to 6 that nothing imports); a command that cannot run is listed under "Not verified" and not claimed; "Not verified" also lists, unless run: a paired-device run of capture and of its refusal, hosted web against a real tenant, the Android entry (Feature 107), a locked-project capture in the real unlock flow, and any browser or shell not run in Task 26; the Acceptance section states that no bare `tsc` was used as evidence, that unit tests with fakes are not evidence about browsers, devices or a real tenant, and names no cause that no experiment separated.
**Depends on:** 25, 27
**Estimate:** 5
**Notes:** LEAD-RUN: not for the orchestrator. `pnpm test:e2e`, `next build` and `pnpm build:native` run outside the sandbox from the main checkout, never a worktree. Satisfies FR-20, FR-18. `pnpm knip` is not in `.github/workflows` today; the owner asked for it, so it is run and compared with main. All other tasks are covered transitively through Tasks 25 and 27 (the dependency graph reaches every task).
**Done:** [ ]

## Summary
- Total tasks: 28
- Total estimated effort: 102 story points (3 + 1 + 3 + 3 + 2 + 3 + 8 + 5 + 3 + 5 + 3 + 3 + 2 + 5 + 3 + 5 + 5 + 5 + 5 + 5 + 3 + 3 + 3 + 2 + 3 + 3 + 3 + 5)
- Critical path: Tasks 1 → 3 → 7 → 8 → 9 → 10 → 18 → 19 → 20 → 26 → 27 → 28
- Risks: Task 7 (largest core task; the folder-creation path was not located at Gate 3 and the in-process race guarantee depends on creating the folder inside a held `withMetaLock` callback; Task 1(b) records the path first); Task 1 (if `CreateResourceOpts` cannot carry the body the spec's FR-5 assumption fails and work returns to the owner); Task 20 (changes the existing Cmd/Ctrl+K handler in `AppShell.tsx` to add the `shiftKey` check and Capture, and edits `page.tsx` for `handleOpen`, hot files; regressions in the palette shortcut are the risk); Task 26 (a browser or the Electron shell may not deliver Cmd/Ctrl+Shift+K, in which case the work returns to the owner and no key is chosen here; Firefox on Windows or Linux may not be runnable); Task 14 (the single move path must be confirmed; a second writer of folder placement would leave a gap); Tasks 22 and 23 and Task 15 (shared tree and reorder files, kept strictly sequential); Task 19 (the locked flow and the paired-device limit cannot be run in a real unlock flow or a paired device from fakes, so they stay under "Not verified"); Task 28 (e2e and builds only run from the main checkout outside the sandbox).

## Open Questions
None. OQ-1 to OQ-18 of the feature spec are resolved at Gate 3 and approved by the owner (2026-11-09) and are folded into the tasks above.
