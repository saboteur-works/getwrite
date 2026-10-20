# Feature 90 experiments

Measurements are recorded as observed values with the command that produced them. Each item is MEASURED (observed in a run, stated as values) or UNMEASURED (not run, with the reason). A cause is written only where an experiment separated it from the alternatives.

## Environment record

Date: 2026-10-19. Branch `feat/writer-project-types-and-paragraph-leading`, main checkout, no worktree. Node v24.15.0 and pnpm 10.28.0 were recorded in the Feature 88 baselines on this machine; they were not re-queried in this task (UNMEASURED for this run). Raw outputs for every command below are under `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/t1/` (outside the repo).

## Baselines (Task 1)

| Item | Command (cwd) | Observed |
| --- | --- | --- |
| Commit | `git rev-parse HEAD` | `65248d999f471175e043b43e4a1ec78824801ece` |
| Working tree before any run | `git status --short` | empty (clean) |
| Listeners before any run | `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` (`lsof-before.txt`) | one listener: `GetWrite` pid 88077, user jedaisaboteur, `TCP *:7340 (LISTEN)`. Nothing on 3000 or 6006. |
| 6006 free before the e2e run | `lsof -nP -iTCP:6006 -sTCP:LISTEN` (`lsof-6006-pre-e2e.txt`) | empty output, exit 1 |
| Listeners after the e2e run | same as the first (`lsof-after.txt`) | the same single listener (pid 88077 on 7340); nothing on 3000 or 6006 |
| frontend typecheck | `pnpm typecheck` (`frontend/`; `fe-typecheck.txt`) | exit 0 |
| frontend lint | `pnpm lint` (`frontend/`; `fe-lint.txt`) | 393 problems: 0 errors, 393 warnings; exit 0 |
| frontend tests | `pnpm test:ci` (`frontend/`; `fe-test-ci.txt`) | 615 files passed; 7094 passed, 2 expected fail, 1 skipped (7097 total), 0 failed; exit 0 |
| frontend e2e | `pnpm test:e2e` (`frontend/`, outside the sandbox; `e2e.txt`) | exit 0; 214 passed, 1 skipped, 0 failed (no failure names; no flaky or retry line) ; Playwright duration 51.9s |
| knip | `pnpm knip` (repo root; `knip.txt`) | exit 1; 411 findings: unused files 49, unused dependencies 1, unused devDependencies 4, unlisted dependencies 6, unlisted binaries 4, unused exports 164, unused exported types 169, duplicate exports 14 (plus 6 configuration hints, not counted) |
| electron typecheck | `pnpm typecheck` (`electron/`; `el-typecheck.txt`) | exit 0 (covers `tsc --noEmit` and the worker tsconfig) |
| electron tests | `pnpm test` (`electron/`; `el-test.txt`) | 32 files passed; 512 passed, 0 failed; exit 0 |
| electron worker build | `pnpm build:worker` (`electron/`; `el-worker.txt`) | exit 0 |
| CLI tests | `pnpm test` (`cli/`; `cli-test.txt`) | 22 files passed; 144 passed, 0 failed; exit 0 |

Scratchpad directory: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/t1`.

### Process notes

- The listener on 7340 (GetWrite, pid 88077) existed before this task and was not started by it. The desktop app was not started and the process was not touched. Anything that needs the desktop app on 7340 (Task 13) must account for it.
- 6006 was free before the e2e run. Playwright's webServer started and stopped its own Storybook; the post-run `lsof` shows no listener on 3000 or 6006, so nothing started by this task remained. No pid was recorded separately because the task started no process outside the test commands.
- No known load-dependent flake (entity-roster, search-route, schemaManagerRestriction a11y) failed in the `test:ci` run, so no rerun was needed.
- `pnpm` printed a warning that it could not read `~/.npmrc` (EPERM, sandbox) in sandboxed commands; not a test result.
- Frontend, electron, CLI unit suites, typecheck, lint and knip ran inside the sandbox; only `pnpm test:e2e` ran outside it.
- No file under `projects/`, `~/Library/Application Support/{getwrite-electron,GetWrite}`, `~/Library/Logs/*` or `~/Documents/GetWrite` was read, listed or written.

### Not measured

- Node and pnpm versions for this run (see Environment record).
- Knip's per-finding contents were not analysed, only counts per section. The saved output is in the scratchpad, not in the repo.
- Lint warnings were counted, not categorised.
- Figures from earlier features were not used; the values above were measured on this tree.

## Part 2: FR-1, paragraph leading across save and reopen (Task 2)

Date: 2026-10-19. Unchanged tree (branch `feat/writer-project-types-and-paragraph-leading`, HEAD `83a8866b`, no source change). Harness: `specs/features/writer-project-types-and-paragraph-leading/scripts/fr1-leading.mjs` (Playwright, Chromium, driving the web dev server; reads files only under the throwaway root). Raw outputs of the two runs: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/t2/` (`run1.json`, `run2.json`, outside the repo).

### Environment and safety record

- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:3100 -iTCP:6006 -sTCP:LISTEN` before: one listener, `GetWrite` pid 88077 on `*:7340` (the user's desktop app, not touched). Nothing on 3000, 3100 or 6006.
- Dev server: `next dev -p 3100` from `frontend/`, outside the sandbox, with `GETWRITE_PROJECTS_DIR=<scratchpad>/t2/projects` (throwaway). Pids started: 62620 (next dev), 62627, 62628 (next-server), 62754 (postcss helper) and the launching shell 62619. All five stopped by pid; confirmed gone. `lsof` after: only pid 88077 on 7340.
- Before the first mutating request the harness listed `GET /api/projects` and exited unless every returned `rootPath` resolved under `<scratchpad>/t2/projects`; it passed (one pre-existing throwaway project from a probe). Every project the harness created was also asserted to resolve under that root.
- `git status --short` after: only the new `scripts/` directory (and this file). The repo's `projects/` and every real app-data folder were not read, listed or written.

### Method

Two throwaway Blank projects created through `POST /api/projects`: "T2 Main" (body line height on disk `1.8`) and "T2 Body22" (body line height set to `2.2` through `POST /api/project/editor-config`, status 200; `2.2` read back from its `project.json`). In "T2 Main": a text resource created through the UI, three paragraphs typed ("First paragraph." / "Second paragraph." / "Third paragraph."), 5 s wait for autosave; a non-canonical revision (v-2) created with `POST /api/resource/revision/<id>` (no `content`, so from the stored content); the cursor placed in paragraph 2 and the toolbar Line Height field (`input[aria-label="Line Height"]`) filled with `1.2`; 5 s wait; then a full page load of `/`, the project reopened from the start page, the resource reopened; then, after 5 s more, the cursor placed in paragraph 3, End, Enter, a fourth paragraph typed, 5 s wait. In "T2 Body22": a text resource with two paragraphs typed, 5 s wait, page reloaded, project and resource reopened. "Close and reopen" here means a full page load and reopening the project and resource through the start page. The whole sequence ran twice (run1, run2); run2 added the non-canonical revision. DOM values are `p.style.lineHeight` (inline) and `getComputedStyle(p).lineHeight`. Stored values are read from `content.tiptap.json` and each revision's `content.bin` (the revisions' stored file is `content.bin`, JSON text).

### Observed values (run2; run1 gave the same DOM and stored values for the same steps, apart from no v-2)

| Step | Paragraph 1 | Paragraph 2 | Paragraph 3 | Notes |
| --- | --- | --- | --- | --- |
| After typing, DOM inline / computed | `1.5` / 22.5px | `1.5` / 22.5px | `1.5` / 22.5px | font size 15px |
| After typing, stored `paragraphLeading` in `content.tiptap.json` | string `"1.5"` | string `"1.5"` | string `"1.5"` | `has` attribute: true for each |
| Line Height field shown with the cursor in paragraph 2, before the edit | `1.5` | | | |
| After setting 1.2 on paragraph 2, DOM inline / computed | `1.5` / 22.5px | `1.2` / 18px | `1.5` / 22.5px | |
| After 5 s autosave, stored in `content.tiptap.json` | string `"1.5"` | string `"1.2"` | string `"1.5"` | |
| After autosave, canonical v-1 `content.bin` | string `"1.5"` | string `"1.2"` | string `"1.5"` | |
| After autosave, non-canonical v-2 `content.bin` (created before the edit) | string `"1.5"` | string `"1.5"` | string `"1.5"` | |
| After reopen, DOM inline / computed | `1.5` / 22.5px | `1.2` / 18px | `1.5` / 22.5px | |
| After reopen, stored (`content.tiptap.json`, v-1, v-2) | `"1.5"`, `"1.5"`, `"1.5"` | `"1.2"`, `"1.2"`, `"1.5"` | `"1.5"`, `"1.5"`, `"1.5"` | order: resource file, v-1, v-2; all strings |
| 5 s after reopen, stored `content.tiptap.json` | string `"1.5"` | string `"1.2"` | string `"1.5"` | unchanged from before the wait |
| (d) fourth paragraph created after opening: DOM inline / computed | `1.5` / 22.5px | | | stored string `"1.5"` in `content.tiptap.json` and in v-1; paragraphs 1-3 unchanged (`"1.5"`, `"1.2"`, `"1.5"`); v-2 unchanged (three `"1.5"`) |
| (d) "T2 Body22" (body line height 2.2 on disk), after typing and after reopen | `1.5` / 22.5px | `1.5` / 22.5px | | stored string `"1.5"` for both paragraphs, in `content.tiptap.json` and in v-1; no paragraph computed to 2.2 x 15px = 33px |

- The second paragraph kept its value across the reopen: inline `1.2`, computed 18px, stored string `"1.2"` before and after.
- The literal stored value of an untouched paragraph is the JSON string `"1.5"`, in the resource file, in the canonical revision's `content.bin` and in the non-canonical revision's `content.bin`. The value is also the string `"1.2"` (not a number) for the paragraph set through the toolbar.
- The non-canonical revision created before the edit held `"1.5"` for all three paragraphs after the edit and after the reopen.
- Page errors captured by the harness (`pageerror`): none.
- The `onCreate` hypothesis (that the `selectAll().setParagraphLeading("1.5")` stamp in `TipTapEditor`'s `onCreate` overwrites a stored value on open) is not supported by this run: the second paragraph kept `1.2` through the reopen. No cause is written for why the stored value survived. The run did not separate whether the stamp ran on the reopen, only that the end values were as above.

### Not measured

- Whether `onCreate` ran its stamp on the reopen (no instrumentation of the editor was added), and what the stamp does to a stored non-`"1.5"` value other than through the end values above.
- Any document loaded from a pre-existing project, a resource created before this run, or a resource opened through a revision (opening v-2 in the editor was not driven).
- Reopen by anything other than a full page load plus reopening the project and resource (for example selecting another resource and back in the same page).
- Other toolbar values (below 1.2, above 1.8, non-numeric), multi-paragraph selection, headings and lists.
- Electron, the packaged app, native/Capacitor, and other browsers; the result covers the web dev server (`next dev`, Chromium) on this tree and these inputs only.
- Node and pnpm versions for this run.

## Task 5: removal of the `onCreate` stamp (regression test, not a fix)

Date: 2026-10-19. Regression test, not a fix: in the Task 2 record (Part 2) the second paragraph kept its stored `"1.2"` (inline `1.2`, computed 18px) across the reopen on the unchanged tree, so no lost value was observed to fix. The new tests in `frontend/tests/unit/paragraph-leading-preserves-structure.test.ts` were red before the change (with a no-op normaliser and the old stamp, stored `"1.5"` paragraphs came back as `"1.5"` where `null` was expected: `[null, 1.2, 2, "1.5"]` against `[null, 1.2, 2, null]`) and green after.

## Task 6: reader search for `paragraphLeading` / `ParagraphLeading`

Date: 2026-10-19. Command (from the repo root): `grep -rIi "paragraphLeading" frontend electron cli` excluding `node_modules`, `.next`, `storybook-static`, `dist` (a case-insensitive match also covers `ParagraphLeading`). `electron/` and `cli/` returned no hit. Hits under `frontend/` by file (the generated `frontend/tsconfig.storybook.tsbuildinfo` also matches and is not source):

| File | Stored or live | Disposition |
| --- | --- | --- |
| `components/Editor/Extensions/GetWriteParagraphLeading.ts` | stored (parse, render, command) | reader 1, Task 4 (single-value rule) |
| `components/Editor/loadDocumentIntoEditor.ts` (via `normalizeParagraphLeadingInDocument`; the name matches `ParagraphLeading`) | stored | reader, Task 5 |
| `src/lib/paragraph-leading.ts` | the rule itself | Task 3 |
| `src/lib/export/markdown-serializer.ts` (`tallyNode`) | stored | reader 2, this task: counts only when `readParagraphLeading(...) !== null` |
| `components/Editor/MenuBar/menuBarState.tsx` | live editor attribute, which can hold a stored legacy value | reader 3, this task: `getWriteParagraphLeading` is `number \| null` |
| `components/Editor/MenuBar/toolbar-command-schema.ts` (`getValue`, `state.getWriteParagraphLeading`) | live, derived from menuBarState | consumer of reader 3, not a further reader of the stored attribute; adapted to the new `number \| null` type (`?.toString() ?? ""`); Task 7 rewrites it |
| `components/Editor/EditorContextMenu.tsx`, `MenuBar.tsx` | call `menuBarStateSelector` only | covered by the reader 3 test; no own read |
| `components/Editor/editorExtensions.ts` | registration | no read |
| `stories/Editor/MenuBar/MenuBar.stories.tsx`, `tests/editorMenuBar.test.tsx` | mock state / mock `getAttributes` fixtures | not readers; state fixtures changed from `"1.5"` to `null` for the new type |
| `tests/unit/markdown-custom-nodes.test.ts` | fixture `"2.0"` | not a reader |
| `e2e/editor-tier3.e2e.spec.ts` | live DOM inline style (comment only matches) | not a reader of stored data |
| tests: `paragraph-leading*.test.ts`, `markdown-warnings.test.ts`, `menu-bar-state-paragraph-leading.test.ts` | tests | n/a |

Further reader (reader 4): the search found none beyond the three named (extension, markdown warning, menuBarState). The PDF compile files match `lineHeight` only (the project body setting), not `paragraphLeading`.

Red then green: `tests/unit/menu-bar-state-paragraph-leading.test.ts` failed 3 of 5 before the change (`"1.5"` returned `'1.5'`, legacy `"1.2"` returned the string `'1.2'`, `"abc"` returned `'abc'`) and passed after. In `tests/unit/markdown-warnings.test.ts` the new tests for the stamp `"1.5"` not counted, numeric 1.5 counted and legacy `"1.2"` counted were already green before the change (the old comparison `!== "1.5"` gave the same answer for those inputs); the invalid-value test (`"abc"`, `"0"`, -1, 0, `""` not counted) is the one that distinguishes the new rule: re-run against the committed (HEAD) serializer it failed (1 failed, 7 passed), and with the new serializer all 8 pass.

## Part 1: FR-2 (a) and (b), freshness of the type read and cache instances, web (Task 12)

Date: 2026-10-19. Unchanged source tree (branch `feat/writer-project-types-and-paragraph-leading`, HEAD `edadee9b`; no source change). Harness: `specs/features/writer-project-types-and-paragraph-leading/scripts/fr2-saved-types-freshness.mjs` (HTTP only, Node `fetch`; no browser). Raw outputs of the two runs and the two server logs: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/t12/` (`run1.json`, `run2.json`, `server.log`, `server2.log`; outside the repo).

### Environment and safety record

- Substitution, stated: `GETWRITE_SAVED_PROJECT_TYPES_DIR` does not exist in code yet, so the experiment points the existing variables at a throwaway copy of the built-in type files. The route (`app/api/project-types/route.ts:9-17`) reads `GETWRITE_TEMPLATES_DIR`; the library (`projectTypes.ts:resolveTemplatesDir`) reads `GETWRITE_PROJECT_TYPES_DIR`. Both were set to the same throwaway directory. "Saved type" below means a file written by hand into that directory.
- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:3100 -iTCP:6006 -sTCP:LISTEN` before the server started: one listener, `GetWrite` pid 88077 on `*:7340` (the user's desktop app, not touched). Nothing on 3000, 3100 or 6006. After both runs and the stops: the same single listener (pid 88077).
- Asserted throwaway paths (the harness exits before its first request unless all three are under the temp root, none contains a protected folder name, and the types directory holds no symlink):
  - `GETWRITE_PROJECTS_DIR=/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/t12/projects`
  - `GETWRITE_PROJECT_TYPES_DIR` = `GETWRITE_TEMPLATES_DIR` = `.../scratchpad/t12/types` (same prefix). It held 7 files copied from `getwrite-config/templates/project-types/` (6 type files and `project-type.schema.json`); the originals were only read.
  - Before the first mutating request the harness listed `GET /api/projects` and exited unless every returned `rootPath` was under the projects root (run1 and run2: empty list). Every project it created was asserted under that root. The repo's `projects/` and every real app-data folder were not read, listed or written.
- Dev server: `pnpm exec next dev -p 3100` from `frontend/`, outside the sandbox, started with the three variables above, twice (a fresh server per run; run2 started with a new empty projects folder).
  - Run1 pids: 3492, 3494, 3498, 3499, 3505 (next-server), 3622 (postcss helper). All stopped by pid; confirmed gone.
  - Run2 pids: 7213, 7215, 7219, 7220, 7322 (next-server), 7327 (postcss helper). All stopped by pid; confirmed gone.
- `git status --short` after: only the new harness script (this file's edits are this task's).

### Method

One fresh server per run, in this order, all without a restart or any cache clearing by the harness. Types written are copies of the Blank spec with a changed `id`, `name` and one folder (`folders: [{ name: "AlphaFolder" }]`). "Create" is `POST /api/projects` with `{ name, projectType: <id> }`, which reaches `createProjectCore` (`project-crud-core.ts:373`) and `getProjectType` in the library; the folders of the created project are read from the throwaway project's directory.

1. S1: `GET /api/project-types` before any write (no request had reached the library).
2. S2: write `t12-alpha.json`; `GET`; create from `t12-alpha` (the first library read).
3. S3: write `t12-beta.json`; `GET`; create from `t12-beta`; 3 s later `GET` and create from `t12-beta` again (S3b).
4. S4: rewrite `t12-alpha.json` with folder `AlphaFolderEdited`; `GET`; create from `t12-alpha`.
5. S5: delete `t12-beta.json`; `GET`; create from `t12-beta`.
6. S6: create from `blank` (control).
7. S7 (run2 only; added after run1): delete `t12-alpha.json`; `GET`; create from `t12-alpha`.

### Observed values (run1 and run2 gave identical values for S1 to S6; S7 is run2 only)

| Step | `GET /api/project-types` | Create from the id |
| --- | --- | --- |
| S1, no write yet | 200; ids `article, blank, game_writing, novel, poetry_and_lyrics, serial` | not run |
| S2, `t12-alpha` written | 200; the six ids plus `t12-alpha` | 200; created project's folders `alphafolder` |
| S3, `t12-beta` written | 200; the six ids plus `t12-alpha`, `t12-beta` | `t12-beta`: 404 `{"error":"Project type not found"}`; no project created |
| S3b, 3 s later | 200; same eight ids | `t12-beta`: 404 again |
| S4, `t12-alpha` edited in place | 200; `t12-alpha` `folders` = `[{"name":"AlphaFolderEdited"}]` | 200; created project's folders `alphafolderedited` |
| S5, `t12-beta` deleted | 200; the six ids plus `t12-alpha` | `t12-beta`: 404 |
| S6, control | not run | `blank`: 200; folders `workspace` |
| S7, `t12-alpha` deleted (run2) | 200; the six built-in ids | `t12-alpha`: 500 `{"error":"ENOENT: no such file or directory, open '<throwaway types dir>/t12-alpha.json'"}`; no project created |

- (a) A valid type file written by hand while the server ran appeared in `GET /api/project-types` on the next request, and a project was created from its id on the next request, with no restart (S2). The same held for an in-place edit read through the route (S4).
- (b) Staleness of the library: a file written after the library's first read (S2) was listed by the route (S3) and not found by creation (404 at S3 and 3 s later at S3b). Creation from an id the library had already read followed an edit of that file (S4: folder name from the edited file) and, after that file was deleted, failed with a 500 carrying an ENOENT for that file's path (S7).
- (b) Route and creation path: for the same file changes the route listed `t12-beta` (S3) and creation did not find it (S3, S3b), so the two read paths gave different answers for the same directory and the same moment. The route does not import the library (`route.ts` imports only `schemas` and `locked-access`). `POST /api/projects` was the only server-side caller of `getProjectType` reached in this run; no second request path to the library was run, so whether other request paths share one `_cache` instance is UNMEASURED (see below).
- Page errors and server errors beyond the 404s and the one 500 above: none in `server.log` / `server2.log`.

### Not measured

- Whether `_cache` is one instance across all request paths into the library: only `POST /api/projects` reaches the library in the web server (`createProjectCore`); the plain-text and DOCX imports run through the CLI and the worker, which were not started, so no second path was compared. Whether a Next.js dev-server module reload (hot reload after a source edit) resets `_cache` was not run.
- `clearProjectTypeCache` and `listProjectTypes(true)`: nothing on the server's request paths calls them (grep of `frontend/src` and `frontend/app` found no caller outside `projectTypes.ts`), so a forced refresh was not exercised.
- Production build (`next start`) behaviour, Electron development app and packaged app (Task 13 covers the packaged/desktop built-in probe, not this), the standalone server, and other browsers or clients. The result covers `next dev` on this tree with these inputs.
- Behaviour with two files written in one tick, concurrent requests, a file that is invalid JSON or fails `validateProjectType`, and a directory that does not exist or is unreadable.
- Why creation (S4) followed an edit of an already-read file: the run shows the end values only. It was not instrumented to separate what the cached entry held from what was read at creation time.
- The saved-types variable and a separate saved directory: not in the code, so the built-in and saved directories were the same directory here.
- Node and pnpm versions for this run.

## Part 1: FR-2 (c), do the desktop server's probes find the built-in types (Task 13)

Date: 2026-10-19. Branch `feat/writer-project-types-and-paragraph-leading`, HEAD `f31ccfc6`, no source change. No harness script created: nothing was run.

### Result: UNMEASURED (development app and packaged build)

- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN`, run when this task started, output:

  ```
  COMMAND     PID          USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
  GetWrite  88077 jedaisaboteur   23u  IPv4 0x40e0cf9c038a3c74      0t0  TCP *:7340 (LISTEN)
  ```

  Port 7340, the desktop server port, is held by pid 88077, the user's own GetWrite desktop app. Per the task's Notes ("If 7340 is held, not run"), the Electron development app and any packaged (`--dir`) build were not started, no build was made, and pid 88077 was not touched. No further attempt was made.
- Therefore not recorded, because never observed: `app.getPath("userData")` and `app.getPath("logs")` assertions, the launch working directory, whether a new project from a built-in type id was created, any dialog text, and any throwaway `project.json`. No processes were started by this task; none to stop. No throwaway user-data, workspace or logs folders were created. The repo `projects/` and the real app-data, log and Documents folders were not read, listed or written.
- Whether `createProjectCore` finds the built-in types in the desktop app is UNMEASURED for the development app and for any packaged build. To settle it, rerun with the desktop app closed by its owner, using the throwaway `--user-data-dir`, workspace and logs folders and the unpacked build "launched from `/`" and from another directory, as the task describes.

### Static code reading (not a measurement of the app; not observed behaviour)

- Where the server's environment is set: `electron/src/main.ts:200-206` builds `env` as `{ ...process.env, PORT, GETWRITE_PROJECTS_DIR: dirs.projectsDir, GETWRITE_TEMPLATES_DIR: dirs.templatesDir, ... }`. `dirs.templatesDir` is `path.join(root, "getwrite-config", "templates", "project-types")` (`main.ts:141-145`). In the lines read, `GETWRITE_PROJECT_TYPES_DIR` is not set there; it would be present only if inherited from `process.env`.
- Which probes the library uses: `frontend/src/lib/projectTypes.ts` `resolveTemplatesDir` (line 65 onward) reads `process.env.GETWRITE_PROJECT_TYPES_DIR` as an override (line 68). It does not read `GETWRITE_TEMPLATES_DIR` (the only `process.env` reference in that file is line 68). If the override is unset it probes `readdir` of `getwrite-config/templates/project-types` and then `../getwrite-config/templates/project-types`, both relative to the process working directory (lines 36-52, 72-80), and if neither is readable returns the first path anyway.
- Reading-only implication, not observed: with only `GETWRITE_TEMPLATES_DIR` set, the library's result would depend on the server's working directory. Whether the desktop server's working directory makes either relative probe resolve, and whether `createProjectCore` (`frontend/src/lib/models/project-crud-core.ts`) therefore finds built-in types, was not run. The web-server record in Task 12 shows the route reads `GETWRITE_TEMPLATES_DIR` and the library reads `GETWRITE_PROJECT_TYPES_DIR`, so the two read paths can name different directories.

## Part 1: Task 14, basis for the built-in directory function

Date: 2026-10-19. The order `GETWRITE_PROJECT_TYPES_DIR`, then `GETWRITE_TEMPLATES_DIR`, then the existing probes rests on two records above. Task 12 (MEASURED, web `next dev`): the route read `GETWRITE_TEMPLATES_DIR` and the library read `GETWRITE_PROJECT_TYPES_DIR`, and a file added after the library's first read was listed by the route but not found by creation (module `_cache`). Task 13 is UNMEASURED (port 7340 held by the user's app), so what the desktop server's working directory resolves is from static reading only (`main.ts` sets `GETWRITE_TEMPLATES_DIR`, the library did not read it); the directory function was not validated against the desktop app.

## Part 1: Task 15, cache design chosen against the Task 12 record

Date: 2026-10-19. Design: built-in entries stay in the module-level `_cache` (cleared by `clearProjectTypeCache`, refreshed by `forceRefresh`); saved entries are read from the saved directory on every call and are never held in a module-level cache. Save-time invalidation was not used.

Observed in the Task 12 record (MEASURED, `next dev`, one directory standing in for both sources): a file written after the library's first read was listed by `GET /api/project-types` (S3) and not found by project creation (404 at S3 and at S3b, 3 s later); after a file already read was deleted, creation failed with a 500 carrying an ENOENT (S7). Whether the route and the creation path share one `_cache` instance was UNMEASURED there (only `POST /api/projects` reached the library), so the condition for the optional save-time invalidation in FR-13 (route and creation share one instance) was not established, and per-call reading of the saved directory was chosen. Resolver-level check in `frontend/tests/unit/project-types.test.ts`: a saved file written between two `listProjectTypes()` calls appears on the second call, and after it is removed `getProjectType` returns `undefined`, with no cache clearing. The server-level acceptance (route, `createProjectCore`, rename, delete in one running server) is not run in this task.

## Final suites (Task 28)

Date: 2026-10-19. Branch `feat/writer-project-types-and-paragraph-leading`, main checkout. Raw outputs: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/t28/`. Baseline column is the Task 1 table above. Frontend typecheck, lint and test:ci were re-run after the knip changes below; the values shown are from that last run (the first test:ci run, before those edits, gave the same counts).

| Item | Command (cwd) | Observed | Task 1 baseline |
| --- | --- | --- | --- |
| frontend typecheck | `pnpm typecheck` (`frontend/`) | exit 0 | exit 0 |
| frontend lint | `pnpm lint` (`frontend/`) | 393 problems: 0 errors, 393 warnings; exit 0 | 393 / 0 errors |
| frontend tests | `pnpm test:ci` (`frontend/`) | 626 files passed; 7425 passed, 2 expected fail, 1 skipped (7428), 0 failed; exit 0 | 615 files; 7094 passed, 2 expected fail, 1 skipped |
| frontend e2e | `pnpm test:e2e` (`frontend/`, outside the sandbox; 6006 empty beforehand) | exit 0; 218 passed, 1 flaky, 1 skipped, 0 failed. Flaky (passed on retry #1): `e2e/resource-context-menu.e2e.spec.ts:41` "keyboard navigation and activation fires action and closes". Rerun of that spec alone (`pnpm test:e2e e2e/resource-context-menu.e2e.spec.ts`): 6 passed, exit 0 | 214 passed, 1 skipped |
| knip | `pnpm knip` (repo root) | first run: exit 1, 413 findings: 50 unused files, 163 unused exports, 176 unused exported types (others unchanged). After the changes listed below: exit 1, 407 findings: unused files 49, unused dependencies 1, devDependencies 4, unlisted dependencies 6, unlisted binaries 4, unused exports 161, unused exported types 168, duplicate exports 14. Comparing finding names with the baseline file: no name present now that is absent from the baseline; four baseline names no longer reported (`ApiEditorConfigSchema`, `EditorConfigSchema`, `ShellProjectTypeLoaderState`, `resolveProjectTypesTransport`) | exit 1, 411 findings |
| electron typecheck | `pnpm typecheck` (`electron/`) | exit 0 | exit 0 |
| electron tests | `pnpm test` (`electron/`) | 32 files; 514 passed, 0 failed; exit 0 | 512 passed |
| electron worker | `pnpm build:worker` (`electron/`) | exit 0 | exit 0 |
| CLI tests | `pnpm test` (`cli/`) | outside the sandbox: 23 files, 153 passed, 0 failed; exit 0. See process note | 22 files, 144 passed |
| CLI build | `pnpm build` (`cli/`) | exit 0 (`dist/bin/getwrite-cli.cjs` 2.3mb) | not recorded in Task 1 |

### knip changes made by this task (new findings from this feature, removed)

The first run reported these names as new against the baseline; each was un-exported or removed, not added to an ignore list, except the last:
- `frontend/src/lib/project-types-write-core.ts`: `ProjectTypeConflict`, `ProjectTypeWriteSuccess` now unexported (used only inside the file).
- `frontend/src/lib/projectTypes.ts`: `UnusableSavedReason`, `UnusableSavedFile`, `SavedDirectoryStatus` now unexported.
- `frontend/src/lib/api/project-types.ts`: `ProjectTypeUnusableReason`, `SavedProjectTypesStatus` now unexported; the function `listProjectTypes` (no caller in `frontend/` or `cli/` outside its own definition) deleted.
- `frontend/src/lib/project-types-write-http.ts`: `readCappedText` now unexported.
- `frontend/src/lib/core.ts`: `type ProjectTypeEntry` removed from the barrel (no consumer).
- `cli/src/lib/server-only-stub.ts` (reported as an unused file): it is used only through the esbuild `--alias:server-only=` flag in `cli/package.json` and the alias in `cli/vitest.config.ts`, which knip cannot see; added to the `ignore` list in `knip.json` with a comment, the pattern already used there for alias-only files.
After these edits `pnpm typecheck` exit 0, and `pnpm test:ci`, `pnpm lint` as in the table.

### Process notes

- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` before: one listener, GetWrite pid 88077 on 7340 (the user's app, not started or touched by this task). After the final e2e run: the same single listener; nothing on 3000 or 6006.
- CLI tests, first attempts: `pnpm test` inside the sandbox did not finish (stopped by `timeout` at 240 s, exit 124; one earlier attempt moved to the background). `cli/tests/qa/server.test.ts` starts a real Next dev server and its blocker listener on 127.0.0.1:3000; a node process (pid 74542, cwd `cli/`, started by my first CLI run) was left holding 3000, which made a later `vitest run` fail that one test with `EADDRINUSE` (152 passed, 1 failed). I stopped pid 74542 by pid (outside the sandbox, since the sandbox refused `kill`). Excluding `server.test.ts`, the sandboxed run gave 22 files, 144 passed. The full suite then passed outside the sandbox (23 files, 153 passed). Whether the sandboxed hang is the sandbox (the sandbox note in project memory about `next dev`) was not tested; no cause is recorded.
- The killed dev-server run left `frontend/tsconfig.json` rewritten by Next (extra `.next-qa/...` include entries and reformatting). I restored it with `git show HEAD:frontend/tsconfig.json > frontend/tsconfig.json` and deleted the two `frontend/.next-qa/getwrite-cli-qa-server-*` directories it named (the directory is git-ignored). `git status` shows no `tsconfig.json` change.
- Known load-dependent flakes (entity-roster, search-route, schemaManagerRestriction a11y, writinglogfooter a11y): none failed in either `test:ci` run, so no rerun was needed. The one e2e flaky above is not on that list; it passed on retry and when the spec was run alone.
- `pnpm` printed an `~/.npmrc` EPERM warning in sandboxed commands; not a result. No desktop app and no `pnpm storybook` was started. Nothing under `projects/` or app-data folders was touched.

### Stories audit (components new or changed in `git diff --stat 65248d99..HEAD`)

| Component | Story file |
| --- | --- |
| Part 2 toolbar paragraph-leading control: `components/Editor/MenuBar/EditorMenuInput.tsx`, `MenuBar.tsx` (with `menuBarState.tsx`, `toolbar-command-schema.ts`, `useToolbarCommand.ts`) | `frontend/stories/Editor/MenuBar/EditorMenuInput.stories.tsx`, `MenuBar/MenuBar.stories.tsx` (changed) |
| `components/TipTapEditor.tsx` (leading extension, `GetWriteParagraphLeading.ts`) | `frontend/stories/Editor/TipTapEditorLeading.stories.tsx` (new) |
| Body Text Styles / manager field message: `components/preferences/BodySettingsModal.tsx`; `components/project-types/ProjectTypeEditorForm.tsx` | `frontend/stories/Preferences/BodySettingsModal.stories.tsx`; `frontend/stories/ProjectTypes/ProjectTypeEditorForm.stories.tsx` (both changed) |
| Part 1 manager: `ProjectTypesManagerPage.tsx`, `ProjectTypeListPane.tsx` | `frontend/stories/ProjectTypes/ProjectTypesManagerPage.stories.tsx`, `ProjectTypeListPane.stories.tsx` (changed) |
| `components/project-types/UnsavedChangesPrompt.tsx` (new) | `frontend/stories/ProjectTypes/UnsavedChangesPrompt.stories.tsx` (new) |
| `components/Start/CreateProjectModal.tsx`, `ImportDocxDialog.tsx` | `frontend/stories/Start/CreateProjectModal.stories.tsx`, `ImportDocxDialog.stories.tsx` (changed) |
| `components/Layout/ShellProjectTypeLoader.tsx`, `ShellModalCoordinator.tsx`, `AppShell.tsx` | no story of their own (non-visual loader and the shell wiring); `frontend/stories/AppShell.stories.tsx` and `Layout/AppShellAfterOpen.stories.tsx` render the shell and were not changed; both passed in the e2e run |

New context requirement: none was added. No decorator or `.storybook` file changed in the diff, `UnsavedChangesPrompt.tsx` imports only `Button` and no provider, and the full `pnpm test:e2e` run passed. No story or test change was needed to make a gap pass.

### git status --short (after this task)

```
 M frontend/src/lib/api/project-types.ts
 M frontend/src/lib/core.ts
 M frontend/src/lib/project-types-write-core.ts
 M frontend/src/lib/project-types-write-http.ts
 M frontend/src/lib/projectTypes.ts
 M knip.json
 M specs/features/writer-project-types-and-paragraph-leading/experiments.md
 M specs/features/writer-project-types-and-paragraph-leading/tasks.md
```

## Final suites (after Stage 6.5)

Date: 2026-10-20. Branch `feat/writer-project-types-and-paragraph-leading`, main checkout, HEAD 704edeaf (Tasks 29 to 33 committed). Raw outputs: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/t34/`. Compared with the "Final suites (Task 28)" table above.

| Item | Command (cwd) | Observed | Task 28 |
| --- | --- | --- | --- |
| frontend typecheck | `pnpm typecheck` (`frontend/`) | exit 0 | exit 0 |
| frontend lint | `pnpm lint` (`frontend/`) | 393 problems: 0 errors, 393 warnings; exit 0 | 393 / 0 errors |
| frontend tests | `pnpm test:ci` (`frontend/`) | 628 files passed; 7448 passed, 2 expected fail, 1 skipped (7451), 0 failed; exit 0 | 626 files; 7425 passed, 2 expected fail, 1 skipped |
| frontend e2e | `pnpm test:e2e` (`frontend/`, outside the sandbox; 6006 empty beforehand; `pnpm storybook` never started) | exit 0; 219 passed, 1 skipped, 0 failed, 0 flaky | 218 passed, 1 flaky, 1 skipped |
| knip | `pnpm knip` (repo root) | exit 1, 407 findings: unused files 49, unused dependencies 1, devDependencies 4, unlisted dependencies 6, unlisted binaries 4, unused exports 161, unused exported types 168, duplicate exports 14 | exit 1, 407 findings (same per-category counts) |
| electron typecheck | `pnpm typecheck` (`electron/`) | exit 0 | exit 0 |
| electron tests | `pnpm test` (`electron/`) | 33 files; 516 passed, 0 failed; exit 0. `tests/worker-bundles-load.test.ts` alone: 2 passed (the test builds the bundles itself in `beforeAll`) | 32 files; 514 passed |
| electron worker | `pnpm build:worker` (`electron/`) | exit 0 (both bundles 2.0mb) | exit 0 |
| CLI build | `pnpm build` (`cli/`) | exit 0 (`dist/bin/getwrite-cli.cjs` 2.3mb) | exit 0 |
| CLI tests | `pnpm test` (`cli/`, outside the sandbox) | 23 files, 153 passed, 0 failed; exit 0 | 23 files, 153 passed |

- knip comparison basis: the Task 28 final knip output (`scratchpad/t28/knip2.txt`) against this run, both with `:line:col` stripped and sorted. The two are identical line for line (422 lines each), so there is no new finding and no removed one. This is a comparison against Task 28's final state, not against a fresh run on the Task 1 baseline commit (no run on another commit was made; the main worktree was not switched). The CLI stub is gone: `cli/src/lib/server-only-stub.ts` does not exist and `knip.json` has no entry naming it.
- e2e: the Task 28 flake (`resource-context-menu.e2e.spec.ts:41`) did not occur in this run; no rerun was needed. No known flake (entity-roster, search-route, schemaManagerRestriction a11y, writinglogfooter a11y) failed in `test:ci`.
- lsof `-nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN`: before, no listener (exit 1, empty), so the user's GetWrite app that held 7340 during Task 28 was not running. After the last command (packaged probe stopped), none.
- Processes not started by this task, left alone: `next dev` pids 3763 (started 2026-10-19 20:33) and 15954 (started 2026-10-20 10:52), with their `next-server` children and `frontend/.next-qa/getwrite-cli-qa-server-*` directories. They are not on 3000 and were running before this task's CLI run. This task's own CLI run left no process behind.
- `frontend/tsconfig.json`: `git diff --stat` empty after the CLI suite, after the frontend build and at the end.
- No story, decorator or test was changed by this task.

## Packaged-app re-check

Date: 2026-10-20. Throwaway build, nothing under the owner's folders or the repo's `projects/` read or written. Build: `pnpm electron:build` (repo root), then from `electron/`: `pnpm exec electron-builder --config electron-builder.yml --dir --mac --arm64 -c.mac.identity=null -c.productName=GetWriteF90Probe -c.appId=works.saboteur.getwrite.f90probe -c.extraMetadata.name=getwrite-f90probe -c.directories.output=/tmp/getwrite-f90/dist` (both exit 0; unpacked, unsigned). Launched with `--user-data-dir=/tmp/getwrite-f90/userData` and a seeded `workspace.json` pointing at `/tmp/getwrite-f90/projects`, driven by the Task 28-era Playwright driver (copied, output directory changed). 7340 was free before launch. The Word import file picker was replaced in the main process (`dialog.showOpenDialog` returns `frontend/tests/fixtures/docx/multi-heading.docx`, copied to `/tmp/getwrite-f90/fixtures/`); the import itself, the worker fork and the project creation were the app's own.

In-app path assertion, before any action (`app.getPath`): `userData` = `/private/tmp/getwrite-f90/userData`, `logs` = `/Users/jedaisaboteur/Library/Logs/getwrite-f90probe`, `isPackaged` = true, name `getwrite-f90probe`, `resourcesPath` = `/private/tmp/getwrite-f90/dist/mac-arm64/GetWriteF90Probe.app/Contents/Resources`; under a protected folder: false; result PASS.

| Check | Result | Observed values | Finding |
| --- | --- | --- | --- |
| (a) Word import, built-in type (Novel) | MEASURED, succeeded | Dialog showed "The Word document was imported successfully."; `/tmp/getwrite-f90/projects/c7df4dbc-...` created with `project.json` name "Import Novel", `projectType` "novel"; app log: "Forking DOCX import worker: .../Resources/docx-import-worker.cjs"; no "exited unexpectedly" message | F-1 |
| (a) Word import, saved type | MEASURED, succeeded | After (c) saved "Probe Novel" (id `novel-copy`), the dialog's type list was Article, Blank, Game Writing, Novel, Poetry and Lyrics, Serial, "Probe Novel (Saved)"; import with it showed the same success text; project `6fb110c5-...` name "Import Saved", `projectType` "novel-copy" | F-1 |
| (b) Escape on the manager with unsaved changes opens the prompt and the draft is kept | MEASURED, did NOT hold, 0 of 3 | In each of 3 attempts (saved type "Probe Novel" selected, Name field edited, list row showing "UNSAVED CHANGES", Name field focused, one Escape): after 800 ms no dialog was open (neither the manager nor the prompt); the edited Name field was gone; reopening the manager showed the saved name "Probe Novel", so the edit was lost. The same edit followed by the manager's Close button opened the prompt ("Unsaved changes") in 3 of 3 | F-5 |
| (b) Escape on the prompt leaves the manager open | MEASURED, did NOT hold, 0 of 3 | In each of 3 attempts (prompt opened with the Close button, one Escape): afterwards zero dialogs, the manager was closed and the draft lost | F-5 |
| (c) Save as copy with "Probe Novel" typed | MEASURED, held | Novel selected, Name field set to "Probe Novel", Save as copy: status "Saved a copy as “Probe Novel”."; `userData/project-types/novel-copy.json` has `id` "novel-copy", `name` "Probe Novel"; the list shows "Probe Novel / novel-copy.json / Saved" | F-3 |
| (d) Name clash | MEASURED, held | Saved type's Name set to "Novel" and Save pressed: alert text "Novel (built-in) already uses this name."; the stored file's name stayed "Probe Novel" | F-4 |

Check (b) is the one result of this task that differs from what Tasks 29 to 33 aimed at. The built output was checked and contains the Task 30 code: the packaged client chunk holds the prompt's `onKeyDown:e=>{"Escape"===e.key&&e.stopPropagation()}` and the manager's `registerCloseGuard`; `pnpm test:ci` (including `ProjectTypesManagerPage.test.tsx` and `shellModalCoordinator.test.tsx`) and `pnpm test:e2e` pass. So the unit and Storybook runs pass while the packaged window shows the F-5 behaviour again. No cause is recorded. Experiments that would discriminate: (1) press Escape in the same state against the dev server in plain Chromium (Playwright, no Electron) to separate Electron from the web build; (2) log, at the dialog's `onOpenChange` and in the close guard, whether the guard is called and what it returns when Escape is pressed in the packaged window; (3) press Escape with the focus on the dialog container rather than an input. FR-17 and Task 30 are therefore not shown met in the packaged app; they are shown met only at the jsdom and Storybook level.

Cleanup: the app was closed through the driver (all seven recorded pids exited after `app.close`; `lsof` on 7340 afterwards: none). Deleted: `/tmp/getwrite-f90`, `~/Library/Logs/getwrite-f90probe`; `~/Library/Preferences/works.saboteur.getwrite.f90probe.plist` did not exist. Screenshots and logs kept only under the scratchpad `t34/` directory.

### git status --short (after this task)

```
 M specs/features/writer-project-types-and-paragraph-leading/experiments.md
```
