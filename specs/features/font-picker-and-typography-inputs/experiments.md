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
