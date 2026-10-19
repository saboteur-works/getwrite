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
