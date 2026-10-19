# Feature 89 experiments

Measurements are recorded as observed values with the command that produced them. A cause is written only where an experiment separated it from the alternatives; anything else is labelled HYPOTHESIS.

## Baselines (Task 1)

Date: 2026-10-18 (the `date -u` of the first command read `Mon Oct 19 02:08:30 UTC 2026`; local time MDT). Tree: branch `fix/hidden-and-lost-work`, unfixed (no source change in this task). Node v24.15.0, pnpm 10.28.0. Main checkout, no worktree.

| Item | Command (cwd) | Observed |
| --- | --- | --- |
| Commit | `git rev-parse HEAD` | `23ac1c8e104be9e6379d284f49fdc98f75902657` |
| Listeners before any run | `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` (outside sandbox) | empty output, exit 1 (no listener on 7340, 3000 or 6006) |
| Listeners immediately before the e2e run | same command | empty output, exit 1 |
| Listeners after the e2e run | same command | empty output, exit 1 |
| frontend tests | `pnpm test:ci` (`frontend/`) | 612 files passed; 6967 passed, 2 expected fail, 1 skipped (6970 total), 0 failed |
| frontend typecheck | `pnpm typecheck` (`frontend/`) | exit 0 |
| frontend lint | `pnpm lint` (`frontend/`) | exit 0; 393 problems: 0 errors, 393 warnings |
| knip | `pnpm knip` (repo root) | exit 1; 413 findings across sections: unused files 49, unused dependencies 1, unused devDependencies 4, unlisted dependencies 6, unlisted binaries 4, unused exports 166, unused exported types 169, duplicate exports 14 (plus 6 configuration hints, not counted). Output kept outside the repo. |
| e2e | `pnpm test:e2e` (`frontend/`, outside sandbox) | exit 0; 214 passed, 1 skipped, 0 failed (no failure names; no "flaky" or "retry" line in the output); Playwright duration 47.7s |
| electron tests | `pnpm test` (`electron/`) | exit 0; 32 files passed; 510 passed, 0 failed |
| cli tests | `pnpm test` (`cli/`, inside sandbox) | NOT RUN to completion. vitest printed `RUN v4.1.6` and no further output for about 10 minutes; the two processes it had started (pids 58290, 58322) were stopped by pid; the shell reported exit 143. No test counts were produced. A retry outside the sandbox was requested and was denied by the permission system, so it was not made. |
| git status | `git status --short` | empty at the start of the task; at the end, after the runs, it listed one modified file, `frontend/tsconfig.json` (see Process notes), which was then restored with `git checkout -- frontend/tsconfig.json`, after which `git status --short` was empty |

### Process notes

- No listener existed on 6006 before the e2e run. Playwright's webServer started its own Storybook server for the run (config as in Feature 88: `reuseExistingServer: true`); this task did not start Storybook separately, no pid was recorded, and the post-run `lsof` shows no listener on 7340, 3000 or 6006.
- No desktop app or other server was started by this task.
- After the first (sandboxed) test batch and the e2e run, `git status --short` listed ` M frontend/tsconfig.json`. The diff showed the `lib`, `types`, `plugins` and `exclude` arrays reformatted onto multiple lines and two added `include` entries, `.next-qa/getwrite-cli-qa-server-nhXUWU/dev/types/**/*.ts` and `.next-qa/getwrite-cli-qa-server-nhXUWU/dev/dev/types/**/*.ts`. Which command rewrote the file was not separated: the candidates run in that window were the cli test run, the frontend typecheck and lint, knip, `test:ci` and `test:e2e`. The file was restored to its committed content; it was not part of this task's change.
- `pnpm` printed a warning that it could not read `~/.npmrc` (EPERM, sandbox); not a test result.

### Not measured

- Figures from Feature 88 (frontend 6967 passed / 1 skipped, e2e 214 passed / 1 skipped, electron 488 passed at its baseline) were not used; the values above were measured on this tree. The frontend and e2e figures equal the Feature 88 baseline figures; the electron count differs (510 against 488).
- cli test counts: not obtained (see the table).
- Knip's per-finding contents were not analysed; only counts per section.
- Lint warnings were counted, not categorised.

## Part 1: unreadable projects, reproduction (Task 2, FR-1)

Date: 2026-10-18. Tree: branch `fix/hidden-and-lost-work` at `ecababc0` plus the two test-file edits of this task; no source change. Node v24.15.0. Unit tests only (sandbox); no server or app started, no process other than vitest, so no `lsof` run for this task. Fixtures: a throwaway directory per test, `fs.mkdtemp` under `$TMPDIR` (`/tmp/claude-501/gw-f89-p1-*`), set as `GETWRITE_PROJECTS_DIR` for the test and removed afterwards. The repository's `projects/` and the protected folders were not read, listed or written.

### Method

- Projects were built with `createProjectFromType` (spec `getwrite-config/templates/project-types/novel_project_type.json`), then one file was damaged on disk.
- The real `listProjectsCore()` output was JSON round-tripped and returned from a stubbed `fetch` to the real `httpProjectsTransport.list` (`frontend/src/lib/api/projects.ts`), so the real core and the real client schema ran together.
- Files: `frontend/tests/unit/project-crud-core-listing.test.ts` (new describe block "unusable projects (Feature 89, FR-1)", real filesystem) and `frontend/tests/unit/projects-api-validation.test.ts` (one added case, schema level).
- The wrong-typed manifest fields are the three `specs/features/user-handbook/verification.md` D-38 names (`config.statuses: "oops"`, `config.maxRevisions: "abc"`, `config.features.timeline: "yes"` as `config.features = { timeline: "yes" }`), plus `name` given a number.

### Observed (commands: `pnpm --filter getwrite-frontend exec vitest run tests/unit/project-crud-core-listing.test.ts` and `.../projects-api-validation.test.ts`, run from `frontend/`)

| Case | Result |
| --- | --- |
| Two healthy projects, core then transport | 2 entries listed (baseline passes) |
| Healthy project plus a project whose `project.json` has `config.statuses: "oops"` | `httpProjectsTransport.list` throws `projects.list: response failed validation`; the healthy project is not returned. RED |
| Same with `config.maxRevisions: "abc"` | same throw. RED |
| Same with `config.features = { timeline: "yes" }` | same throw. RED |
| Same with `name: 42` | same throw. RED |
| Schema level (`projects-api-validation.test.ts`): a healthy entry and an entry with `config.statuses: "oops"` in the same array | `listProjects()` throws the same message. RED |
| Healthy project plus an unparseable `project.json` (`{ not json`) | `listProjectsCore()` returns 1 entry, expected 2 (the damaged directory is absent). RED |
| Healthy project plus a `project.json` with no `id` | 1 entry, expected 2. RED |
| Healthy project plus a `project.json` with no `createdAt` | 1 entry, expected 2. RED |
| Healthy project plus a project whose `folders/<dir>/folder.json` has `name: 42` | `listProjectsCore()` returns both entries; `httpProjectsTransport.list` throws `projects.list: response failed validation`. Characterisation test, passes today |
| Healthy project plus a project whose `meta/resource-*.meta.json` has `name: 42` | `listProjectsCore()` itself rejects with a `ZodError` (message listing the `AnyResourceSchema` union issues); no list is returned to the transport. Characterisation test, passes today |

Red output recorded from the run (the first line of each failure; counts "7 failed | 5 passed" for the core/transport file and "1 failed | 13 passed" for the validation file):

```
Error: projects.list: response failed validation
 ❯ Object.list src/lib/api/projects.ts:104:13
AssertionError: expected [ { project: { …(7) }, …(2) } ] to have a length of 2 but got 1
```

The "length of 2 but got 1" form is the three unparseable / missing `id` / missing `createdAt` cases. The "response failed validation" form is the four wrong-typed-manifest cases and the schema-level case.

### What this establishes and what it does not

- Established by the red runs: on this tree a project whose `project.json` parses, has string `id` and `createdAt`, and carries one wrong-typed field is returned by `listProjectsCore` and then rejects the whole list at `projects.ts:104`, for each of the four fields tried. The READ mechanism in the spec (a wrong-typed field passes `isListableProjectManifest`, is returned, and the client rejects the array) reproduced; Part 1 does not stop.
- Established: an unparseable manifest and one missing `id` or `createdAt` are absent from the core's result today, with no entry for the directory.
- Established, and not in the READ: a bad `folder.json` (a field `FolderSchema` rejects) also rejects the whole list, at the client schema, with the same message as a wrong-typed manifest. A bad resource sidecar fails differently: the error is thrown inside `listProjectsCore` by `validateResource` in `getLocalResources` (`resource-persistence.ts`, outside the manifest `try/catch`), so the core rejects before any response body exists. What the HTTP route returns for that rejection was not exercised.
- D-38: the three fields it names are all manifest (`project.json` `config`) fields, and each reproduced the list rejection as a manifest case. D-38 records `GET /api/projects` answering 200 with the config as written and the client console message `projects.list: response validation failed`; that matches the manifest path observed here (core returns the raw manifest, the client then rejects). That the folder and resource paths were not the ones D-38 tripped is not separately shown: D-38 recorded only edits to `project.json`. The `maxRevisions` top-level case D-38 recorded as having no effect was not tested here.

### Not measured

- Any run of the real route (`GET /api/projects`), a server, or a browser; the web-server log contents.
- Which `ProjectSchema` issue path (`config.statuses`, `config.features.timeline`, ...) the client reported for each case; only the thrown message was asserted.
- A `project.json` that exists but cannot be read (permissions); a locked or encrypted project; a resource sidecar that is not JSON.
- The route's status code and body for the resource-sidecar case.

## Part 1: unreadable projects, core fix (Task 3, FR-2, FR-3, FR-6, FR-7)

Date: 2026-10-18. Tree: branch `fix/hidden-and-lost-work` at `edb28e16` plus the Task 3 edits. Unit tests only (sandbox); no server or app started, so no `lsof` run. Fixtures as in the Task 2 section (throwaway `fs.mkdtemp` directories under `$TMPDIR`; the repository's `projects/` and the protected folders were not touched).

### Observed (run from `frontend/`)

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/project-crud-core-listing.test.ts` | 21 passed, 0 failed (includes the Task 2 cases, which were 7 failed on the unfixed tree) |
| `pnpm exec vitest run tests/unit/projects-api-validation.test.ts` | 22 passed, 0 failed |
| `pnpm exec vitest run tests/unit/native-project-backend.test.ts` | 5 passed, 0 failed (includes the native/HTTP parity case) |
| `pnpm test:ci` | 612 files passed; 6996 tests passed, 2 expected fail, 1 skipped |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | 0 errors, 393 warnings (baseline was 393) |

- Wrong-typed manifest fields (`config.statuses`, `config.maxRevisions`, `config.features.timeline`, `name: 42`): `listProjectsCore` now returns `{ project: { id: <folder id> }, folders: [], resources: [], isUnusable: true, unusableReason: "invalid-manifest" }` for the damaged project and the healthy project is listed; the strict client accepts both.
- Unparseable `project.json` returns reason `unparseable`; no `id`, no `createdAt`, and a JSON array return `missing-field`; a `project.json` replaced by a directory (read fails with a non-ENOENT error) returns `manifest-unreadable`.
- A directory with no `project.json` is absent from the result; a `project.json` read that raises ENOENT is absent; a `ProjectLockedError` on the manifest read is rethrown.
- Task 2's schema-level case (a wrong-typed `config.statuses` entry inside a client response array is accepted by `listProjects`) was removed, not made green: the strict client still rejects such an entry, which is the intended client behaviour (FR-6); the rejection is now pinned by "still REJECTS ..." cases. The conversion of that manifest into an unusable entry is pinned at the core.

### Not changed or not measured

- A bad `folder.json` (`name: 42`) still rejects the whole list at the client, and a bad resource sidecar still makes `listProjectsCore` itself throw a `ZodError`; both characterisation tests from Task 2 remain and pass. Neither is in Task 3's scope.
- `tree-unreadable` is in the reason enumeration and accepted by the client schema; nothing produces it yet.
- No server, route, browser or app run.

## Part 1, Task 5: stories for the unusable-project card (2026-10-18)

- Added five stories to `frontend/stories/Start/StartPage.stories.tsx` (`UnusableUnparseable`, `UnusableMissingField`, `UnusableInvalidManifest`, `UnusableManifestUnreadable`, `UnusableTreeUnreadable`), one per reason category, each beside a healthy project. The card needs no new context, so no decorator was added. Each play function asserts the label, the folder-id heading, the category's reason text, and no button or link inside the card.
- Process listing before and after: `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` printed nothing both times (exit 1). No Storybook dev server was started and no pid exists; the run used the Vitest Storybook runner (`pnpm exec vitest run --config=vitest.storybook.config.ts --configLoader runner stories/Start/StartPage.stories.tsx`), which drives Chromium itself.
- a11y decision: the stories set `parameters.a11y.test = "error"`. First run with strict on: 5 failed, each with one violation, `landmark-complementary-is-top-level` on StartPage's own `<aside>` (the page shell, not the card). Contrast and all other rules reported nothing on the card. Observation only: whether the same violation exists on the other StartPage stories was not measured (they run at the global `todo` level). Decision: the stories switch off that one rule and keep strict on; a page-shell fix is not in this feature.
- Result after that: 16 passed, 0 failed for the whole file (11 existing stories plus the 5 new). `pnpm typecheck` exit 0.

## Part 2: nested-folder delete reproduction on the unfixed tree (Task 6, FR-8, FR-25, FR-31)

Date: 2026-10-18. Tree: branch `fix/hidden-and-lost-work` at `b4eab56d`; the only edit is the new test block in `frontend/tests/unit/trash-folder-cascade.test.ts`. No product change. Unit test only (inside the sandbox); no server, app or Storybook was started, so no `lsof` was run and no pid exists. Fixtures are throwaway `fs.mkdtemp` directories under `$TMPDIR`; the repository's `projects/` and the protected folders were not touched.

### Method

- Layout built by `createProjectFromType` with an inline spec: top folders `Depth One` and `Depth Two`; `defaultFolders` `One Child` (under Depth One), `Two Child` (under Depth Two), `Two Grandchild` (under Two Child); a text resource at every level (5 resources).
- On disk, `createProjectFromType` nests subfolder directories: `folders/depth-one/one-child/`, `folders/depth-two/two-child/two-grandchild/`, each with its own `folder.json`. The existing cascade tests in the same file build folders with `writeResourceToFile`, which stores every folder flat at `folders/<slug>/` even when `parentFolderId` is set, so they did not exercise nested directories (an observation about the existing fixtures, not a claim about what real projects contain).
- Call: `softDeleteFolder(tmp, <Depth One id>)` and `softDeleteFolder(tmp, <Depth Two id>)`, each on a fresh layout. Asserted: the returned path is `<tmp>/.trash`; `.trash/meta/folder-<id>.json` lists exactly the descendant folder and resource ids; each descendant resource sidecar is gone from the live project; no live directory remains under the target; the folder descriptors under `.trash/folders/` are exactly the target plus every descendant folder.

### Observed (`pnpm --filter getwrite-frontend exec vitest run tests/unit/trash-folder-cascade.test.ts`)

Result: 8 tests, 1 failed, 7 passed (the 6 pre-existing tests pass unchanged).

| Case | Outcome |
| --- | --- |
| Depth 1: `Depth One` with child `One Child`, resources at both levels | PASSED: no error, all assertions held |
| Depth 2: `Depth Two` with child `Two Child` and grandchild `Two Grandchild`, resources at all three levels | FAILED: `softDeleteFolder` threw |

Failing output, as seen:

```
Error: ENOENT: no such file or directory, rename '<tmp>/folders/depth-two/two-child/two-grandchild' -> '<tmp>/.trash/folders/two-grandchild'
 ❯ softDeleteFolder src/lib/models/trash.ts:550:5
    550|     await rename(fd.dirPath, dest);
```

State after the thrown error for the depth-2 layout (from a one-off listing, not kept as a test):

- Live `folders/`: `depth-one/` (with `one-child/`) untouched; `depth-two/` and `depth-two/folder.json` remain. `depth-two/two-child/` is gone.
- `.trash/folders/`: `two-child/folder.json` and `two-child/two-grandchild/folder.json` (the grandchild went to trash nested inside the moved child directory, not as its own entry). The target `Depth Two` descriptor is NOT in trash.
- `.trash/meta/`: `folder-<DepthTwoId>.json` (manifest) present; `resource-*.meta.json` and `refs-*.json` for the three `Depth Two` subtree resources present; `.trash/resources/` holds the three resources. Live `meta/` holds no `resource-*` sidecar.
- So the call returned an error and left the subtree partly in Trash: the resources and the child/grandchild descriptors moved, the target folder descriptor did not.
- Depth 1 passed, which is consistent with a failure needing a folder two levels below the target; this is the only nesting depth pair measured (depth 1 passes, depth 2 fails). Depth 3 was not run.

### Reading the code against the observation (not an experiment)

- `softDeleteFolder` builds `descendants` depth-first with each folder entry pushed before its own children, then renames every descendant folder's `dirPath` in that order, then the target. The failing rename is the grandchild's path after `two-child` (its parent) had already been renamed away; that sequence is what the listing above shows. Whether moving a child before its parent changes the result was not tried: the hypothesis (parents moved before children) is consistent with this output but is NOT established; Task 7 owns the discriminating experiment.
- The ENOENT is thrown by `rename` inside the model (`trash.ts:550`), reproduced at the unit level. The 404 in note_f818d108 was not re-run, and what `POST /api/folder/[folder-id]/delete` returns for this error (status, body) was not exercised, because the unit test reproduced. Whether that earlier 404 and this ENOENT are the same event is not shown.

### Not measured

- The HTTP route; any server or browser run.
- `listTrashedItems` and `restoreFolder` on the partly-trashed state; retry after the failure.
- Depth 3, and a folder holding both a child folder and resources beyond the depth-1/2 layouts above.
- Whether projects created outside `createProjectFromType` (UI folder creation, import) nest directories on disk.

Outcome: reproduced on the unfixed tree by a test that asserts the desired behaviour; it stays red until Task 7. Task 7 proceeds.

## Part 2: cause discrimination and fix (Task 7, FR-9, FR-10, FR-11)

Date: 2026-10-18. Tree: `fix/hidden-and-lost-work`, on top of Task 6. Unit tests only, inside the sandbox; no server or app started (no `lsof`, no pid). Fixtures are throwaway `fs.mkdtemp` directories under `$TMPDIR`.

### Discriminating experiment

- Change tried (temporary, reverted before the fix): in `softDeleteFolder`'s descendant-folder loop, iterate `[...descendants].reverse()` (children before parents; the manifest list is pre-order, so reversed it is deepest-first) and nothing else.
- Command: `pnpm --filter getwrite-frontend exec vitest run tests/unit/trash-folder-cascade.test.ts`.
- Before (unfixed, Task 6): 8 tests, 1 failed. The failing operation is `rename` at `trash.ts:550` with source `<tmp>/folders/depth-two/two-child/two-grandchild` and destination `<tmp>/.trash/folders/two-grandchild`, ENOENT.
- With children moved before parents: 8 tests, 8 passed, including the depth-2 case.
- Observed in the same run family on the unfixed tree for depth 3: `rename '<tmp>/folders/deep-root/level-a/level-b' -> '<tmp>/.trash/folders/level-b'` ENOENT (level-a, its parent, had already been moved).

Result: moving a child before its parent changes the outcome from failure to success. Because the only variable changed was the order of the renames, the cause is established as: a folder's directory contains its subfolders' directories on disk (`createProjectFromType` nests them), the cascade moved a parent directory first (carrying the child with it), and the later rename of the child's recorded path no longer existed. The hypothesis (parents moved before children) is established by this experiment. Not shown: that this is the same event as the 404 in note_f818d108.

### Fix (`frontend/src/lib/models/trash.ts`)

- Descendant folder directories are moved deepest first, then the target.
- A destination name already taken under `.trash/folders/` (moves are flat, two depths can share a directory name) gets `-<folderId>` appended; trashed descriptors are found by the id in `folder.json`.
- Retry: on a retry the live tree no longer holds what an earlier attempt moved, so the earlier manifest is read and its entries kept (new live entries are added); resources no longer live are skipped, so a retry does not overwrite their ref records with empty ones. A failure still throws to the caller; the target moves last, so it stays live and a retry can find it.
- Unchanged: index/backlink/mention removal, reference nullification and ref record, collision handling and root fallback on restore, purge sweep.

### Evidence

- Red before the fix (`trash-folder-cascade.test.ts`, 11 tests): 3 failed, 8 passed. Failing: depth 2 (Task 6), the new depth 3 case (ENOENT as above), the new partial-failure/retry case (the retry also threw ENOENT, so red for the same cause, not for the injected failure). The new "folder holding child folders and resources" case passed on the unfixed tree (it has only depth 1 below the target); kept as a regression guard.
- Green after the fix: 11 of 11.
- Partial-failure test: the target's parent directory (`folders/deep-root`) is made read-only (`chmod 555`), so moving its child out fails after the deeper directories already moved; `softDeleteFolder` rejects, the target is still live; permissions restored, retry completes, the manifest lists all 7 descendants, `listTrashedItems` shows one entry with 7 descendants, and `restoreFolder` restores them.
- Restore test (depth 3 and mixed): the live folder set (id, parentId, name, orderIndex) equals the set before delete; each resource sidecar keeps `folderId` and `orderIndex`.
- `pnpm test:ci` (frontend): 612 files passed; 7026 tests passed, 2 expected fail, 1 skipped (7029). `pnpm typecheck`: exit 0. `pnpm lint`: 0 errors, 393 warnings (touched files: no output from eslint).

### Not measured

- The HTTP route and native backend after the fix; projects created outside `createProjectFromType`; the on-disk directory layout after restore was not compared with the layout before delete (the tests compare id, parentId, name and orderIndex from each `folder.json`, not directory paths).

## Part 3: deprecated custom fields in `MetadataSidebar`, reproduction (Task 8, FR-12, FR-25, FR-31)

Date: 2026-10-18. Tree: `fix/hidden-and-lost-work`, on top of Task 7, no source change. Component tests only, inside the sandbox; no server or app started (no `lsof`, no pid). No `projects/` or app-support folder was touched; the store is the in-memory Redux store from `makeStore()`.

### Method

- Added a `describe` block, "MetadataSidebar — deprecated custom fields (Feature 89, Task 8)", to the existing `frontend/tests/metadataSidebar.test.tsx`. Props confirmed against `MetadataSidebar.tsx` (`onChangeField?`, `className?`) and the file's existing mounts: the component reads the project schema, selected project and selected resource from the store, so each case dispatches `setProject({ metadataSchema })`, `setSelectedProjectId`, `setResources`, `setSelectedResourceId`.
- Schema: one group holding a live text field `live-field` and a text field `old-field` with `deprecated: true`. The text resource carries `userMetadata` `{ "live-field": "live", "old-field": "value on a deprecated field" }`. Each case asserts `live-field` is shown with its value (the group renders) and that `queryByLabelText("old-field")` is absent.
- Cases: (1) plain group; (2) group with `folderId: "f1"` and a resource with `folderId: "f1"` (folder-scoped by group, scope matching); (3) deprecated field with `appliesTo: ["Scene"]` and a resource with `resourceSubtype: "Scene"` (restricted, subtype matching).
- Command: `pnpm --filter getwrite-frontend exec vitest run tests/metadataSidebar.test.tsx -t "deprecated custom fields"`.

### Observed (unfixed tree)

All three cases failed at the `not.toBeInTheDocument()` assertion; in each, `live-field` assertion before it passed:

```
 ❯ |jsdom| tests/metadataSidebar.test.tsx (67 tests | 3 failed | 64 skipped)
     × does not show a deprecated field that holds a value (the non-deprecated sibling is shown)
     × does not show a deprecated field in a folder-scoped group the resource matches
     × does not show a deprecated field restricted by appliesTo when the subtype matches
Error: expected document not to contain element, found <input
  aria-label="old-field" ... type="text" value="value on a deprecated field"
/> instead
```

(identical element and value in all three).

- Which were already hidden: none. Case 1, the one FR-12 makes decisive, did fail, so the READ (the sidebar renders a deprecated field) is reproduced and Part 3 does not stop; Task 9 proceeds.
- For reference, reading `MetadataSidebar.tsx` (not an experiment): the `visibleFields` filter at ~525 checks `isFieldVisible` (feature flags) and `isFieldVisibleForSubtype`; neither reads `deprecated`. The test result above is consistent with that and was not separated further.
- The tests stay in the file asserting the desired behaviour (field not shown); they are red until Task 9. The rest of `metadataSidebar.test.tsx` was run in the same file (67 tests: 3 failed, 64 passed).

### Not measured

- A folder-scoped group whose folder does not match, or an `appliesTo` field whose subtype does not match, for a deprecated field: those are already hidden by the existing scope checks regardless of `deprecated`, and were not run as separate cases.
- Image and audio resources; the "Add field" form; query, Organizer and chip UI; saving another field on a resource holding a deprecated value (Task 9 pins it).

Outcome: reproduced on the unfixed tree by tests asserting the desired behaviour; they stay red until Task 9. Task 9 proceeds.

### Part 3 fix, Task 9 (FR-13, FR-14, FR-15, FR-25; OQ-3 (b))

Date: 2026-10-18. Sandbox only; no server started; the on-disk test used a throwaway `os.tmpdir()` projects directory via `GETWRITE_PROJECTS_DIR`.

Tests written first, run before the source change (`pnpm exec vitest run` on the three files): 6 failed, 68 passed.

- Red: the three Task 8 cases; a new restore case (hidden while `deprecated: true`, field shown with the stored value after `deprecated` is removed; failed at the first "not shown" assertion); the "Add field" form message case (no message found); the "Add field" suggestions case (a `deprecated` field was listed as an option).
- Passing before the change (characterisation, cannot fail first): value survival across `updateSidecarCore` (payload shaped as the page's `handleChangeDynamicMetadata` builds it, spreading the whole `userMetadata`; the merge in `updateSidecarCore` is shallow, so survival depends on that payload shape and the test pins only this shape); the `DeprecateOrClearDialog` text; the help-text item; a live field still routing to `onFieldFocused`.

After the change: the same files plus `add-field-form.test.ts` and `field-dedup.test.ts` pass (120 tests). From `frontend/`: `pnpm test:ci` 614 files passed, 7036 tests passed, 2 expected fail, 1 skipped (7039); `pnpm typecheck` clean; `pnpm lint` 0 errors, 393 warnings (unchanged).

Re-read of the four statements (dialog, `help-content.ts`, `types.ts` comment, `deprecateField` doc comment) against the final behaviour: each says the field is hidden from the sidebar, values kept, queryable/flagged; behaviour now matches; none edited.

Not measured: the "Add field" form and sidebar in a running app (Task 16); Storybook stories for them (not run); a save through the page's React handler (the on-disk test starts at `updateSidecarCore`); image and audio resources.

## Part 4: what `updateSidecarCore` stores for `entityKind` when a whole-resource payload omits it (Task 10, FR-17, FR-20, FR-24, FR-31)

Date: 2026-10-18. Tree: `fix/hidden-and-lost-work`, on top of Task 9, no product change. Sandbox only; no server or app started (no `lsof`, no pid). Throwaway `os.tmpdir()` projects directory per case via `GETWRITE_PROJECTS_DIR`; no `projects/` or app-support folder touched.

### Method

- New test file `frontend/tests/unit/resource-crud-core-entity-kind-omitted.test.ts` (a new file rather than an addition to an existing resource-crud-core file, because the existing ones are scoped to other features: entity-graph position, locked sidecar, deprecated field values). It calls the real `updateSidecarCore` (no mock) against a sidecar written first with `entityKind` and reads it back with `readSidecar`. The assertions pin the observed values; the tests pass.
- Payload "recorded": the second `updateSidecar` payload recorded by `tests/page-stale-sidecar-save.test.tsx`: `{ id, name: "Chapter One", type: "text", folderId: null, orderIndex: 0, userMetadata: { mood: "calm" } }`, no `entityKind` key.
- Payload "page", read from `frontend/app/(app)/page.tsx` `updateResource` (~439-519), not guessed: `updateSidecar(resourceId, dir, applyUpdate(resource))` with no `clearKeys`. `applyUpdate` = the updater's result (the page's local resource copy spread), then Redux `resourceSubtype` (key deleted if Redux has none), then Redux `wordCount` if numeric. It adds no `entityKind`, so a local copy without the key sends none. The test sends the recorded shape plus `wordCount: 42`, through a JSON round trip (as HTTP does).
- Reading `updateSidecarCore` (`resource-crud-core.ts` ~458-498, not an experiment): `merged = { ...existing, ...update, orderIndex, folderId }`, then `clearKeys` deleted. The measurements below are what separate "kept" from that reading.
- Command: `pnpm --filter getwrite-frontend exec vitest run tests/unit/resource-crud-core-entity-kind-omitted.test.ts`.

### Observed (unfixed tree; sidecar before: `entityKind: "character"`)

| Payload | `entityKind` after |
| --- | --- |
| recorded (no `entityKind`) | `"character"` (kept); `userMetadata` = `{ mood: "calm" }` |
| page.tsx `updateResource` shape (no `entityKind`, `wordCount: 42`) | `"character"` (kept); `userMetadata` = `{ mood: "calm" }`; stored `wordCount` stayed 5 (client value dropped) |
| page.tsx shape with a local copy holding `entityKind: undefined` (dropped by JSON) | `"character"` (kept) |

Result: 5 tests passed (3 rows above, plus the two below).

Additional core-level observation (not one of the two required payloads): sidecar holding `entityKind: "place"`, payload carrying `entityKind: "character"` -> stored `"character"` (replaced, as the merge reading predicts). This is a statement about the core only. Whether a stale local resource copy carrying an older `entityKind` reaches `updateResource` in a running app was NOT measured, so no claim is made that the app sends such a payload.

### FR-18 branch selected

(a): for the two payloads FR-17 requires, both of which omit `entityKind`, the stored `entityKind` is kept. The omission in the payload did not delete it at the `updateSidecarCore` level. The spec's claim of harm is disproved for the omit-case for `entityKind` only, at the core level. Caveat for the owner/Task 11: the harm path via a payload that CARRIES an older value (row "replaced" above) is a different shape from what FR-17 specified; it was observed at the core only and is not selected as branch (c) because no measured payload the page builds from the recorded test produced it, but whether the page can build it was not measured.

### Observations for `aliases` and `wordCountGoal` (FR-24), those keys only

Sidecar holding `aliases: ["Al", "Ally"]` and `wordCountGoal: 1500`, payload the recorded shape (omitting both): both kept (`["Al","Ally"]`, `1500`). No product change from this. The wider stale-save family (any other key a whole-resource save may omit, and payloads that carry stale values for these keys) was not measured.

### Not measured

- The page's React handler and HTTP route end to end (the test starts at `updateSidecarCore`; the page payload was read from code and reproduced by hand).
- A stale local copy carrying an older `entityKind` in a running app; timing or editor-state dependence (no concurrent writes were run).
- Any key other than `entityKind`, `aliases`, `wordCountGoal`; the native transport; encrypted projects.

### Task 11 outcome (FR-18, FR-19, FR-20, FR-24, FR-25)

Branch taken: **(a)**, stored `entityKind` kept. No product change. Branch (b) (red test, fix, clear-case test) and branch (c) (stop for the owner) were not taken, so FR-19's tests are not applicable.

- Pinning test at the `updateSidecarCore` level: `frontend/tests/unit/resource-crud-core-entity-kind-omitted.test.ts` (from Task 10). It asserts the stored `entityKind` stays "character" for the recorded payload, for the payload `page.tsx` `updateResource` builds, and for a JSON-dropped `undefined` `entityKind`. Confirmed to fulfil (a); no addition needed. Run in the sandbox for Task 11, result below.
- The payload omission (`entityKind` absent from the second `updateSidecar` payload) is recorded as a finding that did not cause loss.
- The claim of harm is disproved for `entityKind` ONLY, at the `updateSidecarCore` level.
- `aliases` and `wordCountGoal`: observations for those keys only (both kept when the payload omitted them). Neither was fixed; the wider stale-save family was not measured and is not claimed fixed or harmless.
- Open caveat, not a measured loss: at the core, a payload carrying a different `entityKind` replaces the stored one; whether the app can send such a payload was not measured.
- Docs revised only to what was measured: `docs/features/resource-subtype.md` (the `page.tsx` overlay and stale-copy section, and the Known limitations line) and `frontend/CLAUDE.md` (Resource subtype entry). Handbook pages are left to Task 17.
