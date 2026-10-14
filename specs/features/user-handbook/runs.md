# Feature 81 runs: how to start and stop each runtime, and the proof runs

Measured 2026-10-14 in the main checkout (`/Users/jedaisaboteur/Repositories/getwrite`, branch `docs/user-handbook`, base commit `c8c2189f`), Node via the shell default, Electron from `electron/node_modules`. Scripts are in `specs/features/user-handbook/scripts/`; they share `scripts/lib/safety.mjs` (path assertion, port check, pid recorder, redaction). Logs and screenshots of out-of-sandbox runs are in `/tmp/getwrite-handbook/logs/` (outside the repo, not committed).

## Runtime names to use in the verification record

- `desktop, Electron dev, fake root`
- `web build of the same frontend`
- `CLI, built, throwaway project`

## How to run

| Method | Command (repo root) | Where | Port | Notes |
| --- | --- | --- | --- | --- |
| Desktop | `node specs/features/user-handbook/scripts/desktop-dev.mjs` (proof run). For a longer session `import { startDesktop, stopDesktop, appLogLines } from "./desktop-dev.mjs"`, with `createRun("desktop")` from `lib/safety.mjs` | OUTSIDE the sandbox | 7340 (fixed in `electron/src/server-config.ts`); the script refuses if 7340 has a listener | Needs built `electron/dist` and `frontend/.next/standalone` (present, built after the last frontend/electron commit touching them). Fake repo root, `--user-data-dir`, throwaway app `name`; sharing, hosted auth and dev identity env removed. `startDesktop` exits unless the app reports its userData as the throwaway folder and its logs folder as `~/Library/Logs/gw-handbook-throwaway-<run-id>`; `stopDesktop` removes that log folder. Returns a Playwright `app` and `page`. |
| Web | `node specs/features/user-handbook/scripts/web-standalone.mjs` (proof run). Longer session: `startWeb(run)` / `stopWeb(handle)` | OUTSIDE the sandbox | a free port chosen at start, never 7340, 3000 or 6006; refuses if busy | Built standalone `server.js`, `GETWRITE_PROJECTS_DIR` throwaway, `GETWRITE_TEMPLATES_DIR` the repo's read-only project-type specs, bound to 127.0.0.1. |
| CLI | `node specs/features/user-handbook/scripts/cli.mjs build` (INSIDE the sandbox), then `node .../cli.mjs proof` (outside: it writes under `/tmp/getwrite-handbook/`). Later tasks: `import { runCli } from "./cli.mjs"` | build inside, proof outside | none | Executable invoked as `node cli/dist/bin/getwrite-cli.cjs <args>`. |

Before each start: `lsof -nP -iTCP:<port> -sTCP:LISTEN` for the task's own port and for 7340, 3000, 6006 (done by the scripts; the result is printed). Stop: only recorded pids, by pid (`Recorder.stop`), then confirm no listener on the task's own port. Run one thing at a time.

## Substitution recorded (lead override of Task 1's Done-when)

Task 1 asks for a pre-run and post-run `ls -ld` modification time of `~/Library/Application Support/getwrite-electron/` and `~/Documents/GetWrite`. By the owner's rule those two paths are never read, listed or stat'ed, so that check was not done. Instead no-contamination is shown by (a) every throwaway path asserted by `realpath` under `/tmp/getwrite-handbook/` before anything starts, (b) the userData, logs and projects paths the app itself reports (below), all under the throwaway root or the throwaway log folder, and (c) `git status --short projects/` empty before and after. This is weaker than the mtime comparison: it shows where the app said it wrote, not that nothing else was written.

## Port state before the first run (lead check, then mine)

`lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` (outside the sandbox): no output, exit 1. Nothing listening on 7340, 3000 or 6006.

## Proof run: CLI (build inside the sandbox, proof outside)

- `node specs/features/user-handbook/scripts/cli.mjs build` -> `pnpm cli:build` exit 0, `dist/bin/getwrite-cli.cjs 2.2mb`, two esbuild warnings about `import.meta` in the cjs output (not investigated).
- `node specs/features/user-handbook/scripts/cli.mjs proof`:
  - `cli/package.json` bin: `{"getwrite-cli":"dist/bin/getwrite-cli.cjs"}`.
  - `--help` exit 0, first line `Usage: getwrite-cli [options] [command]`. **Executable name the CLI answers to: `getwrite-cli`** (the old pages write `getwrite`). Commands listed in the first 14 output lines: `prune [options] [projectRoot]`, `templates`, `screenshots`, `project`, `reindex [projectRoot]`, `doctor [projectRoot]`, `repair-revisions [options] [projectRoot]`.
  - `getwrite-cli project create <throwaway-root> --spec blank_project_type.json -n "Handbook Proof"` exit 0: `Folders: 1, Resources: 0`; `project.json` present.
  - `getwrite-cli doctor <throwaway-root>` exit 0: `OK — no broken folder associations`.
  - Throwaway run folder removed: true.

## Proof run: web (outside the sandbox)

Output saved at `/tmp/getwrite-handbook/logs/web-proof-output.txt`.

- Ports before: 7340, 3000, 6006 no listener. `git status --short projects/` before: empty.
- Server pid 79088 on port 50529. `GET /` -> 200. `GET /api/project-types` -> 200. Projects folder in use: the throwaway one, 0 entries.
- Stop: recorded 79088 (`next-server (v16.2.6)`); after SIGTERM none alive; listener on 50529 after stop: none. Throwaway run folder removed: true. Ports after: none listening. `git status --short projects/` after: empty.

## Proof run: desktop (outside the sandbox)

Output saved at `/tmp/getwrite-handbook/logs/desktop-proof-output.txt`; screenshot `/tmp/getwrite-handbook/logs/desktop-mv8kimat-567be6-window.png`; the app's own log (redacted) next to it as `...-app.log`.

- Ports before: 7340, 3000, 6006 no listener. `git status --short projects/` before: empty.
- Electron pid 79658, `isPackaged=false`. The app reported its userData as the throwaway `userdata` folder and its logs folder as `~/Library/Logs/gw-handbook-throwaway-desktop-mv8kimat-567be6` (both compared by the script before it went on).
- App log lines (names and messages): `standaloneDir: <run-dir>/repo/frontend/.next/standalone`, `projectsDir:   <run-dir>/repo/projects`, `server ready`, readiness request `GET /api/sharing/ready?challenge=<redacted> 200`.
- Window: `http://localhost:7340/`, title `"GetWrite"`; the screenshot shows the Start Page with buttons START A NEW PROJECT, IMPORT, IMPORT WORD DOCUMENT, APP SETTINGS and "No projects yet".
- `Electron` listener on 7340 while running: pid 79768 (`next-server`), one of the recorded pids. Recorded set: 79658, 79663, 79664, 79666, 79670, 79762, 79768, 79848, 79955.
- Stop: after `app.close()` and SIGTERM to the recorded pids none alive; listener on 7340 after stop: none; throwaway log folder removed: true; throwaway run folder removed: true. Ports after: none listening. `git status --short projects/` after: empty.

## Not established

- That nothing was written to the owner's userData, workspace or log folders is not checked directly (substitution above).
- Behaviour with sharing on, packaged builds, and Windows or Linux were not run.
