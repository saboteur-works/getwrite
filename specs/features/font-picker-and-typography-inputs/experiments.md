# Feature 91 experiments

Measurements are recorded as observed values with the command that produced them. Each item is MEASURED (observed in a run, stated as values) or UNMEASURED / NOT RUN (not run, with the reason). A cause is written only where an experiment separated it from the alternatives.

## Environment record

Date: 2026-10-21 (local; `date -u` read Thu Oct 22 02:16 UTC at the start of the run). Branch `feat/font-picker-and-typography-inputs`, main checkout, no worktree. Platform Darwin 25.5.0, arm64. Node v24.15.0, pnpm 10.28.0 (`node -v`, `pnpm -v`). Playwright 1.60.0 (`frontend/node_modules/@playwright/test/package.json`). Vitest v4.1.6 (from run banners). `pnpm build` and `pnpm test:e2e` ran outside the command sandbox; every other command ran inside it. Throwaway `GETWRITE_PROJECTS_DIR` (a `mktemp -d` folder under the system temp dir) was set for the build and e2e runs; no protected folder or the repo `projects/` was read, listed or written. No process was started that needed stopping (the build and e2e commands exited on their own).

## Baselines (Task 1)

| Item | Command (cwd) | Observed |
| --- | --- | --- |
| Commit | `git rev-parse HEAD` | `87803df5d7bfaf70de7494ed564b707f2272b140` |
| Working tree before any run | `git status --short` | empty (clean) |
| Listeners before any run | `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` | empty output, exit 1 (nothing listening on 7340, 3000 or 6006) |
| Listeners before `pnpm build` | same command | empty output, exit 1 |
| 6006 free before the e2e run | same command, run immediately before `pnpm test:e2e` | empty output, exit 1 |
| 6006 after the e2e run | `lsof -nP -iTCP:6006 -sTCP:LISTEN` | empty output |
| frontend typecheck | `pnpm typecheck` (`frontend/`) | exit 0 |
| frontend lint | `pnpm lint` (`frontend/`) | 393 problems: 0 errors, 393 warnings; exit 0 |
| frontend tests | `pnpm test:ci` (`frontend/`) | exit 0; 637 files passed; 7646 passed, 2 expected fail, 1 skipped (7649 total), 0 failed |
| frontend build | `pnpm build` (`frontend/`, outside the sandbox) | exit 0 |
| frontend e2e | `pnpm test:e2e` (`frontend/`, outside the sandbox) | exit 0; 222 passed, 1 skipped, 0 failed (no failure names). The name of the skipped test was not extracted. |
| knip | `pnpm knip` (repo root) | exit 1; 412 findings: unused files 49, unused dependencies 1, unused devDependencies 4, unlisted dependencies 6, unlisted binaries 4, unused exports 161, unused exported types 173, duplicate exports 14 (plus 6 configuration hints, not counted) |
| electron typecheck | `pnpm typecheck` (`electron/`) | exit 0 |
| electron tests | `pnpm test` (`electron/`) | exit 0; 34 files passed; 528 passed, 0 failed |
| electron worker build | `pnpm build:worker` (`electron/`) | exit 0 (output `dist/docx-import-worker.cjs` 2.0mb) |
| cli tests | `pnpm test` (`cli/`) | exit 0; 23 files passed; 153 passed, 0 failed |
| Working tree after all runs | `git status --short` | empty (clean) at the time of the last check, before this file was created; build output is not shown by git status |

Notes: the `pnpm test:ci` run showed no failed test, so the known flaky-under-load files were not re-run. The four App Settings dialog stories that fail in the Storybook runner were not run here (Storybook-runner story tests are not part of `pnpm test:ci`); not measured.

## Not measured in this task

- Story-runner (`vitest.storybook.config.ts`) results: NOT RUN, not part of the Task 1 contract.

## Size before (Task 2)

Date: 2026-10-21. Commit: `git rev-parse HEAD` = `5af5f49132f5328fd8963e2b045150c0252a2e34`. `git status --short` before the builds showed no source change (only this task's new `scripts/` folder appeared, untracked). `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` before the builds: empty, exit 1. All builds ran outside the command sandbox in the main checkout, with `GETWRITE_PROJECTS_DIR` set to a `mktemp -d` throwaway folder. No server or app was started, so no pid needed stopping. No folder under `~/Library/Application Support` or `~/Library/Logs` was read or written.

Measuring script (read-only, `find` + `stat -f %z` + `du -sk`): `specs/features/font-picker-and-typography-inputs/scripts/measure-build-size.sh <dir>...`. It prints `apparent_bytes` (sum of file sizes), `disk_bytes` (`du -sk` x 1024), `files` and `woff2` (count of `*.woff2`). Run from the repo root.

### (a) Web build

Command: `pnpm build` (cwd `frontend/`), exit 0. Then `scripts/measure-build-size.sh frontend/.next/static frontend/.next/standalone`.

| Output | apparent bytes | disk bytes | files | `*.woff2` |
| --- | --- | --- | --- | --- |
| `frontend/.next/static` | 4372400 | 4673536 | 124 | 20 (all in `static/media`) |
| `frontend/.next/standalone` | 107213394 | 132898816 | 5380 | 27 |

Contents of `frontend/.next/standalone` seen at the top level: `frontend`, `getwrite-config`, `node_modules`, `projects`. Parts of that total that are not the Next server output proper:
- `standalone/frontend/storybook-static`: 16778861 apparent bytes, 558 files, 27 `*.woff2` (4 in `sb-common-assets`, 19 in `assets`, 4 in the folder itself). `frontend/storybook-static` existed in the working tree before this task (left by the Task 1 `pnpm test:e2e` run; not created or removed by this task) and has the identical byte count.
- `standalone/projects`: 7808070 apparent bytes, 1027 files (measured by count and size only; its contents were not listed or read). It is present in the standalone output of this build.
- The 27 `*.woff2` in standalone are all within `storybook-static`; the Next-emitted `*.woff2` are the 20 under `static/media` (the standalone copy has none of its own `.next/static`).

Observation for the after comparison (Task 27): the standalone total depends on whether `frontend/storybook-static` and the repo `projects/` content are present in the tree at build time.

### (b) Electron bundle

Command: `pnpm electron:build` (repo root; runs `pnpm --filter getwrite-frontend build && pnpm --filter getwrite-electron build && pnpm --filter getwrite-electron build:worker`), exit 0. Then `scripts/measure-build-size.sh frontend/.next/static frontend/.next/standalone electron/dist`.

| Output | apparent bytes | disk bytes | files | `*.woff2` |
| --- | --- | --- | --- | --- |
| `frontend/.next/static` | 4372400 | 4673536 | 124 | 20 |
| `frontend/.next/standalone` | 107213394 | 132898816 | 5380 | 27 |
| `electron/dist` | 4277186 | 4366336 | 37 | 0 |

The static and standalone values equal those from (a).

Packaged app (MEASURED, unpacked only): `cd electron && CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --config electron-builder.yml --dir --mac --arm64 -c.directories.output=<mktemp -d folder>`, exit 0 (electron 34.5.8, electron-builder 25.1.8, code signing skipped by that variable). Then `scripts/measure-build-size.sh <out>/mac-arm64/GetWrite.app <out>/mac-arm64/GetWrite.app/Contents/Resources/frontend`:

| Output | apparent bytes | disk bytes | files | `*.woff2` |
| --- | --- | --- | --- | --- |
| `GetWrite.app` (arm64, unpacked) | 359677196 | 386805760 | 5607 | 47 |
| `GetWrite.app/Contents/Resources/frontend` | 111585794 | 138293248 | 5504 | 47 |

Installer size: UNMEASURED. `--dir` produces no dmg, and building the dmg targets (x64 and arm64) was not attempted; the throwaway output folder was removed after measuring. A repo-root `dist-electron/` folder (dated Aug and Sep 2026, containing a `GetWrite-1.7.0-arm64.dmg`) existed before this task and was not touched or measured; it is not from this commit.

### (c) Native output

Command: `pnpm build:native` (cwd `frontend/`), exit 1. `frontend/out` was not produced (`ls frontend/out`: No such file or directory). Error (from the log):

```
./stories/Start/CreateProjectModal.stories.tsx:6:8
Type error: Cannot find module '../../../frontend/components/Start/CreateProjectModal' or its corresponding type declarations.
[build-native-static] ERROR: `next build` exited with status 1.
```

(c) is UNMEASURED: the build fails at this error, the one named in `frontend/CLAUDE.md`. `*.woff2` count for `frontend/out`: not applicable, no output.

### Left behind

Build artifacts (all gitignored; `git status --short` shows only the new `scripts/` folder): `frontend/.next` (rewritten by the builds; existed from Task 1), `electron/dist` (rewritten; existed), `frontend/.native-build` (exists; existed before this task, and the failed native build was run against it), `frontend/storybook-static` (from Task 1). Created and removed by this task: the electron-builder throwaway output folder and the first throwaway projects folder. Empty `mktemp -d` projects folders from the later builds remain under the system temp dir (not distinguishable from other temp folders by name); they hold no data.

### Not measured

- Installer (dmg, x64 or arm64) size; the x64 packaged app.
- `frontend/out` (build fails).
- Sizes with `frontend/storybook-static` absent from the tree.

## FR-1 loading behaviour (Task 3)

Date: 2026-10-21 (local, MDT; the measuring run printed `Wed Oct 21 2026 21:23:55 GMT-0600`). Tree: branch `feat/font-picker-and-typography-inputs`, HEAD `cd803717` (docs and experiments only since the build; the `frontend/.next` build measured is the one made by Task 2 from source commit `5af5f49`; no source change since). No source file was changed by this task.

Harness: `specs/features/font-picker-and-typography-inputs/scripts/fr1-font-loading.mjs` (run from the repo root, outside the command sandbox: `node specs/features/font-picker-and-typography-inputs/scripts/fr1-font-loading.mjs`). It starts `node frontend/node_modules/next/dist/bin/next start -p 3100 -H 127.0.0.1` (production, existing build) with `GETWRITE_PROJECTS_DIR` set to a `mkdtemp` folder, drives Chromium through Playwright with a CDP session (`CSS.getPlatformFontsForNode` as the rendered-fonts readout), and prints one JSON result.

Environment: Chromium 148.0.7778.96 (Playwright 1.60.0), viewport 1400x900, a fresh browser context per scenario (no cached fonts or storage), macOS Darwin 25.5.0 arm64, Next 16.2.6. The machine was online: `curl https://fonts.googleapis.com/css2?family=Inter` returned HTTP 200 immediately before the runs.

Safety record:
- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -iTCP:3100 -sTCP:LISTEN` before the runs: empty output, exit 1 (nothing on 7340, 3000, 6006 or 3100). The same command after the final run: empty, exit 1.
- `lsof -nP -iTCP:3100 -sTCP:LISTEN` read by the harness after the server was listening and before any request: `node 52738 jedaisaboteur 12u IPv4 ... TCP 127.0.0.1:3100 (LISTEN)` (final run).
- Throwaway `GETWRITE_PROJECTS_DIR` of the final run: `/private/var/folders/qk/x8z53mfn36q33gbbzrhmpws00000gn/T/fr1-projects-xq7enT` (a `mkdtemp` folder, asserted empty and not under the repo `projects/`, `~/Library` or `~/Documents`). Asserted before the first request: the harness read the live server process environment (`ps -Eww -p <pid>`, polled from spawn until it matched, before the server was listening) and checked `GETWRITE_PROJECTS_DIR` equals the realpath of that folder; it then made its first request. The server later retitles itself to `next-server`, after which `ps` no longer shows its environment, so the assertion could only be made in that early window. After seeding, the folder held exactly the four seeded project directories (listing recorded by the harness); the app's start page also printed each project's root path under this folder.
- Processes started: the harness (node) and, in the final run, the `next start` server pid 52738 (the listener; it had no child process) and Chromium (launched and closed by the harness). Stopped by pid with SIGTERM; `process.kill(52738, 0)` afterwards reported it gone (`stoppedPids: {52738: exited}`), and the lsof after the run was empty. Earlier development runs of the harness (server pids 90233, 97795, 98415, 99127, 406, 49943 and others) were stopped the same way. Two `next-server` processes, pids 89504 and 47440, were left running by two of my own manual test starts (a shell wrapper killed only the parent) and were stopped by pid after I confirmed with `ps` that they were my `next-server (v16.2.6)` on port 3100; no other pid was signalled. Nothing was started on 3000 or 7340; no existing process was stopped.
- Throwaway folders and temp files this task created under the system temp dir (`fr1-projects-*`, `dbg-*`, result and debug files) were removed after the values below were copied here. No file under `~/Library/Application Support/*`, `~/Library/Logs/*`, `~/Documents/GetWrite` or the repo `projects/` was read, listed or written.

Seeding (the app's own API, against the throwaway server only): `POST /api/projects {name, projectType: "blank"}`; `POST /api/resource` with one text resource "Sample" holding an h1 ("Sample Heading One") and one paragraph; `POST /api/project/editor-config` for the settings below (the same endpoint Project Settings saves through; the Project Settings dialog itself was not driven). The resource was then opened through the UI (Open button on the start page, then the resource in the tree). Four projects, one per scenario:

| Scenario | Project name | Editor config stored in `project.json` |
| --- | --- | --- |
| A | FR1 default | none |
| C | FR1 plex | `body.fontFamily` "IBM Plex Serif" |
| D | FR1 merri | `body.fontFamily` "Merriweather" |
| E | FR1 source | `headings.h1` fontFamily "Source Serif 4" (fontSize 40px, fontWeight 700), `body.fontFamily` "Source Serif 4" (read back from the stored `project.json`: both strings are stored as typed) |

### (a) Requests to fonts.googleapis.com and fonts.gstatic.com on first load of a text resource (scenario A, no toolbar interaction)

MEASURED. Exactly two events, one request: `GET https://fonts.googleapis.com/css2?family=Domine:wght@400..700&display=swap` (resource type stylesheet), finished with status 200. Zero requests to `fonts.gstatic.com`. The same single request appeared on first load in scenarios C, D and E. After load, `document.fonts` listed two `Domine|400 700` entries, both with status `unloaded`, and the 20 KaTeX faces, all `unloaded`.

### (b) The same after choosing each toolbar font in turn (scenario A, paragraph text selected, then each option of the toolbar font `<select>`)

MEASURED. The toolbar select listed seven options: Inter, Merriweather, Playfair Display, Lato, Source Serif 4, Playwrite IE, Fascinate Inline. Requests recorded after each choice (all status 200):

| Choice | fonts.googleapis.com request | fonts.gstatic.com request |
| --- | --- | --- |
| Inter | `css2?family=Inter:wght@400;500;700&display=swap` | `/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2` |
| Merriweather | `css2?family=Merriweather:wght@400;700&display=swap` | one `.woff2` under `/s/merriweather/v33/` |
| Playfair Display | `css2?family=Playfair+Display:wght@400;700&display=swap` | `/s/playfairdisplay/v40/nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgEM86xQ.woff2` |
| Lato | `css2?family=Lato:wght@400;700&display=swap` | `/s/lato/v25/S6uyw4BMUTPHjx4wXiWtFCc.woff2` |
| Source Serif 4 | `css2?family=Source+Serif+4:wght@400;600&display=swap` | none requested |
| Playwrite IE | `css2?family=Playwrite+IE:wght@100..400&display=swap` | `/s/playwriteie/v11/fC1mPYtWYWnH0hvndYd6GCGMUgLHplg.woff2` |
| Fascinate Inline | `css2?family=Fascinate+Inline:wght@400&display=swap` | `/s/fascinateinline/v24/jVyR7mzzB3zc-jp6QCAu60poNqIy5grIfDfySZU.woff2` |

Rendered font after each choice, read for the span that got the inline `font-family` style (CDP `CSS.getPlatformFontsForNode`, `isCustomFont`, glyph count 43):
- Inter: span `style="font-family: Inter;"`, computed `Inter`, rendered Inter (Inter-Regular), custom font true.
- Merriweather: span `font-family: Merriweather;`, computed `Merriweather`, rendered "Merriweather Light 18pt" (Merriweather-Regular), custom true.
- Playfair Display: span `font-family: "Playfair Display";`, computed `"Playfair Display"`, rendered Playfair Display (PlayfairDisplay-Regular), custom true.
- Lato: span `font-family: Lato;`, computed `Lato`, rendered Lato (Lato-Regular), custom true.
- Source Serif 4: no `span[style*='font-family']` element was found in the paragraph after the choice (the span selector returned nothing); the paragraph's computed `font-family` was `"IBM Plex Serif"` and its rendered font was Times (Times-Roman), custom false. One googleapis request was made and no gstatic request.
- Playwrite IE: span `font-family: "Playwrite IE";`, computed `"Playwrite IE"`, rendered Playwrite IE (PlaywriteIE-Regular), custom true.
- Fascinate Inline: span `font-family: "Fascinate Inline";`, computed `"Fascinate Inline"`, rendered Fascinate Inline (FascinateInline-Regular), custom true.

The `fonts.gstatic.com` fetches in the table are the unicode-range files the page needed for the 43 glyphs rendered (the harness recorded every request; the full list is as given). The harness did not record what the toolbar select displayed as its current value.

### (c) Computed font-family and rendered font for a paragraph set to IBM Plex Serif where it is not installed

MEASURED, on this machine. IBM Plex Serif is not installed here: `fc-list | grep -i plex` printed no match (fontconfig printed only cache-directory errors), `find /System/Library/Fonts /Library/Fonts ~/Library/Fonts -iname "*plex*"` printed nothing, and `system_profiler SPFontsDataType | grep -i -E "Full Name:.*(plex|merriweather|source serif)"` printed nothing. Chromium therefore ran with no local Plex (the harness used a clean profile).
- Scenario A (no body family stored; the editor default) paragraph: computed `font-family` `"IBM Plex Serif"`, weight 400; `--gw-body-font-family` custom property `IBM Plex Serif` on the editor wrapper's inline style (`--gw-body-font-family: IBM Plex Serif; --gw-body-font-size: 15px; --gw-body-line-height: 1.8; --gw-paragraph-spacing: 16px;`); rendered font `Times` (PostScript `Times-Roman`), `isCustomFont` false, 43 glyphs.
- Scenario C (body family "IBM Plex Serif" stored): the same values: computed `"IBM Plex Serif"`, rendered Times (Times-Roman), custom false.
- The default h1 (style attribute `font-size: 40px; font-family: "IBM Plex Serif"; font-weight: 700; letter-spacing: 0.01em;`): computed `"IBM Plex Serif"`, weight 700, rendered `Times` (Times-Bold), custom false, 18 glyphs.
- No request to any host for an IBM Plex file was recorded in any scenario (the only Google request on load was the Domine stylesheet). `document.fonts.check('16px "IBM Plex Serif"')` returned true in scenarios C and E although the rendered font is Times; the check is recorded as observed and not used as evidence of rendering.
- Not measured: the same paragraph on a machine with IBM Plex Serif installed.

### (d) Body family "Merriweather" set in Project Settings, toolbar never used (scenario D, fresh context)

MEASURED. The paragraph computed `font-family` `Merriweather` (the stored `--gw-body-font-family` was `Merriweather`, unquoted) and its rendered font was `Times` (Times-Roman), `isCustomFont` false. It did not render as Merriweather. The only Google request was the Domine stylesheet (no Merriweather request; zero gstatic requests). `document.fonts.check('16px "Merriweather"')` returned true; the document held no Merriweather face (`Domine` and KaTeX faces only, all `unloaded`). The h1 stayed the default (`"IBM Plex Serif"`, rendered Times-Bold). For comparison, in scenario A after the toolbar had loaded Merriweather, the same family rendered as Merriweather (b).

### (e) Heading and body family "Source Serif 4" (scenario E, fresh context, toolbar never used)

MEASURED. Neither rendered as Source Serif 4; both fell back.
- Body paragraph: `--gw-body-font-family: Source Serif 4` (unquoted, as stored); computed `font-family` `"IBM Plex Sans", sans-serif`; rendered `Helvetica` (Helvetica), `isCustomFont` false.
- h1: stored family "Source Serif 4"; the rendered element's `style` attribute was `font-size: 40px; font-weight: 700; letter-spacing: 0.01em;` (no `font-family` declaration in the attribute); computed `font-family` `"IBM Plex Sans", sans-serif`, weight 700; rendered `Helvetica` (Helvetica-Bold), custom false.
- No Source Serif 4 request was made (only the Domine stylesheet). `document.fonts.check('16px "Source Serif 4"')` returned true; no Source Serif 4 face was in `document.fonts` before any toolbar use.
- Related (b): choosing "Source Serif 4" in the toolbar made a googleapis request, no gstatic request, no `font-family` span, and the paragraph rendered Times.

### Which READ rows of the spec's evidence table this confirms, contradicts or leaves unobserved

| READ row | Result |
| --- | --- |
| Dropdown shows one value | Unobserved (no settings form was driven). |
| Fonts load from Google | Confirmed for the layout request (the Domine stylesheet `fonts.googleapis.com/css2?family=Domine:wght@400..700&display=swap` on first load, status 200) and for the toolbar path (each of the seven choices requested a googleapis stylesheet; six also requested a gstatic file; Source Serif 4 requested none). "Project Settings never calls it": consistent with scenario D (no request for Merriweather or Source Serif 4 on load with those families stored); the code-level statements about the single caller were not tested. The layout's `fonts.gstatic.com` preconnect was not checked (no gstatic request was made on load). |
| No Plex files | Consistent: no request for any IBM Plex file in any scenario, and Plex Serif rendered as Times where not installed (this machine). Rendering on a machine that has Plex installed: unobserved. The `@font-face`/package/stylesheet absence itself was not re-searched here. |
| Domine leftovers | Partly observed: the Domine stylesheet is requested on first load (above) and two `Domine|400 700` faces exist, both `unloaded` after load. The toolbar's `"Domine"` fallback, `isDomine` and `.domine-400` were not observed. |
| Family applied unquoted | Confirmed for the editor body variable: stored "Merriweather" and "Source Serif 4" appear unquoted in `--gw-body-font-family`. For the h1 with "Source Serif 4" the `style` attribute had no font-family declaration. Whether the heading attribute is built unquoted was not observed directly for a name with a space (the quoted forms seen belong to the default "IBM Plex Serif" and to the toolbar spans). The expectation that a name beginning with a digit does not apply as written is consistent with scenario E (both fell back); no cause is stated. |
| Toolbar font control | Confirmed: seven options in the order Inter, Merriweather, Playfair Display, Lato, Source Serif 4, Playwrite IE, Fascinate Inline; no system fonts and no "Other..." in the select; choosing an option made the Google requests tabulated in (b). |
| Weight vocabularies differ; Settings and Type Manager fields differ; Row heights | Unobserved (Tasks 4 and later). |

### Not measured

- Offline behaviour (the machine was online; (a) and (b) are therefore recorded as requests that succeeded).
- A machine with IBM Plex Serif installed.
- The toolbar select's displayed value and the Project Settings dialog itself (the editor config was written through the same API endpoint).
- The production Electron server or the native build (this run used the web `next start` build).
