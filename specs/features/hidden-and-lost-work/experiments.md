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
