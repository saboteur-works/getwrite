# Tasks: Change the desktop server's default port (Feature 80)

Source spec: `specs/features/desktop-server-port.md` (FR-1..FR-31, US-1..US-7). Gate 3 answers of 2026-10-10 are folded in: OQ-1 (refuse to start when the port is busy, no fallback; readiness accepts only the forked server), OQ-3, OQ-6 (ADR plus a `CLAUDE.md` line), OQ-7, OQ-8 and OQ-9 are resolved; OQ-2, OQ-4 and OQ-5 are PROVISIONAL directions accepted by the owner for writing this list and are finalized at the Task 7 stop. Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 80. Builds on Features 75 to 77 (merged to `main`, not released). Release hold: nothing containing Feature 75 is released until this feature is merged.

Shape of the work: measure first (baselines, the grep inventory, port-in-use today, dev command ports, cookie scope, the old port), stop for the owner, then change the one constant, make readiness accept only the server the app forked, refuse to start with a plain message when the port is busy, add the workflow comment and the convention ADR, then verify one thing at a time in the main checkout.

**Repo rules every task inherits (the implementor sees only its own task plus the spec):**
- TDD: write the tests first, SEE THEM FAIL, and report the failing run (failing test names and the assertion message) before making them pass. Add to an existing test file before creating a new one (`docs/standards/testing.md`). Tests live in `frontend/tests/` and `electron/tests/` (`vitest run`, node environment).
- No `any`; explicit types (`docs/standards/typescript-implementation.md`). A failure must not render as absence (`docs/standards/failure-visibility.md`).
- Commands. Frontend, from `frontend/`: `pnpm typecheck`, `pnpm lint`, `pnpm test:ci`, `pnpm exec vitest run <path>`, `pnpm test:sharing-smoke`, `pnpm test:e2e` (needs `pnpm storybook` on 6006). Electron, from `electron/`: `pnpm typecheck`, `pnpm test`, `pnpm build`. Repo root: `pnpm knip`, `pnpm --filter getwrite-cli test`, `pnpm electron:dev`, `pnpm electron:build`, `pnpm electron:package`. `electron/src/main.ts` cannot be imported outside Electron, so logic worth testing goes in plain modules beside it under `electron/src/sharing/` or `electron/src/`.
- Node versions: CI runs Node 22 (frontend, Electron, build) and Node 20 (CLI). Nothing loaded at config time (`frontend/next.config.mjs`, vitest, eslint, knip, tsconfig, electron build scripts) may import a TypeScript file or need a Node newer than 20 (FR-28). Do not claim Node 20 coverage unless a Node 20 run or CI result is actually seen.
- **Builds do NOT work in git worktrees on this machine** (measured earlier; cause not established). Every task that needs `pnpm build`, a standalone server, `next dev`, `pnpm test:sharing-smoke`, a browser, Storybook or the real Electron app runs DIRECTLY IN THE MAIN CHECKOUT, one such task at a time, never two at once; the orchestrator commits each before the next starts. Pure code tasks (8 to 14) need no build and may run in a worktree. Electron, Playwright, builds, Storybook and `next dev` run OUTSIDE the command sandbox (they fail inside it with `EMFILE` or `Operation not permitted`); every record says which was used.
- **Process-safety rules, repeated by every task that starts a server or app (FR-27).** Before starting anything: check for a listener on the port the app will use (3000 before Task 8 lands, 7340 after) and on every port the task itself uses (`lsof -nP -iTCP:<port> -sTCP:LISTEN`), and REFUSE to run if the app's port is busy, unless the task itself created that throwaway listener (Tasks 3 and 6 and the port-in-use steps of 17 and 19). Servers the task starts use a free port the task picks itself unless the task is checking 7340 or 3000 on purpose. Record the pids the task starts and stop only those pids, never by port, never a listener's parent or a process the task did not start (on 2026-10-10 a pipeline script stopped every listener on port 3000, including the owner's running desktop app). Use throwaway user-data and projects folders under `$TMPDIR`, assert the paths in the script before using them, and NEVER read or write `~/Library/Application Support/getwrite-electron/`. Never print or record credentials, cookies, secrets, window-secret values or pairing codes; header presence is recorded as present or absent only. Scripts live under `specs/features/desktop-server-port/scripts/` (not under `frontend/`, so `pnpm knip` does not see them) and are described in `experiments.md`.
- **Dev-mode approach (reuse of Feature 77 Task 29).** Real Electron in development mode takes `isPackaged === false` to mean projects live in `<repo root>/projects` with no override, so running `electron/dist/main.js` in the repo tree would write into the repo's own `projects/`. Use the copied-tree approach recorded in `specs/features/paired-device-limits/experiments.md` (~line 975): a throwaway fake repo root with a copy of `electron/dist` and `electron/package.json`, symlinks to the real `frontend` and `getwrite-config`, an empty `projects/`, and Electron started on `<throwaway>/repo/electron` with a throwaway `--user-data-dir`. Say in the record that this is "the development code path in a copied tree" and that the difference from the repo tree itself was not measured.
- **Recording rule for every measuring task (FR-31).** Write each result as a measured fact (command, date, counts, statuses). Name no cause unless an experiment discriminated it from the alternatives; where a cause is not established say which experiment would settle it. End the section with a "Not verified" list of everything not run.
- **Verification tasks record and do not fix.** A product defect found in Tasks 15 to 20 is recorded in `experiments.md` with its evidence; the task is NOT ticked if its done condition is unmet, and the orchestrator halts.
- **Port statement.** Measurements before Task 8 can only be made on 3000, the port the code uses until the constant changes; measuring the port-in-use mechanism on 3000 with a throwaway listener is valid for the mechanism and says nothing about 7340. After Task 8 the same measurement is repeated on 7340 (Tasks 17 and 19).
- Do NOT change: the hosted-auth fallbacks (`frontend/src/lib/auth/auth-server.ts`, `frontend/better-auth.config.ts`, `frontend/app/api/_tenant/with-storage-context.ts`) and their two tests; `device-credentials.json` handling or the credential-store schema; the scripts under `specs/features/paired-device-limits/scripts/`; any workflow other than the comment in Task 11; `frontend/next.config.mjs`. No migration code. No new listener on any port; no redirector on 3000. Tests that use 3000 only as a fixture value passed as input MUST pass unchanged (FR-6).
- Implementors do not commit and do not push; the orchestrator commits. Writing under `specs/` only where a task says so, apart from the code and the two documentation lines named in Tasks 8 to 14.
- No new unused exports: `pnpm knip` must not grow compared by set to Task 1.
- Documentation (FR-25) is a later pipeline stage and is NOT in this list, except the ADR and `CLAUDE.md` convention line (Task 12), which the spec makes a requirement (FR-26). The release-note or docs line for OQ-4 and OQ-5 is carried to that stage if the Task 7 stop turns it on.
- Tasks 7 and 21 are NOT executable by an implementor: Task 7 is a stop for the owner, Task 21 is the owner's manual check. The orchestrator leaves each unticked until the owner has acted and does not treat that as a failure. Tasks 13 and 14 are conditional.
- Task order: every dependency appears earlier in the list. A dependency on a conditional task is satisfied when that task is closed "not needed" at the stop.

### Task 1: Baselines (agent): run every suite on the unedited tree and record the numbers
**What:** Run all suites on this branch before any code change and record counts and outcomes in the new `experiments.md`, so later tasks and Task 20 compare against measured baselines.
**Files:** Creates `specs/features/desktop-server-port/experiments.md` (section "Baselines"). No source change.
**Done when:** the section records, with command, date, exit status, counts, `git rev-parse --short HEAD` and `node --version`: from `frontend/`, `pnpm test:ci` (passed, failed, skipped), `pnpm typecheck`, `pnpm lint` (errors, warnings), `pnpm test:sharing-smoke` (checks and failures; after `pnpm build` and copying `.next/static` into `.next/standalone/frontend/.next/static`), and `pnpm test:e2e` (passed, failed, skipped, against `pnpm storybook` on 6006, with the Storybook pid started by the task and stopped by that pid); from `electron/`, `pnpm test` and `pnpm typecheck`; from the repo root, `pnpm knip` with the issue count per section AND the list of names (so later runs are compared by set), and `pnpm --filter getwrite-cli test`. The record also states the reported reference figures (Feature 77: frontend 6434 passed and 1 skipped, desktop 384, CLI 144, smoke 28 checks, e2e 214 passed and 1 skipped) and marks them "reported, not re-run" unless the run reproduces them. A failing baseline suite is recorded as failing with its test names and not fixed. Before starting, the task checks 3000, 6006 and 7340 for listeners and refuses if 6006 is busy; any server it starts uses a free port it picks, and it stops only the pids it started. `git status --short` afterwards shows no change outside `specs/`, apart from the spec work already present at the start (paste the output).
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-9. Main checkout, outside the sandbox; say so. The e2e run needs Storybook on a port the task confirms free; do not stop any Storybook it did not start. Do not take figures from earlier features' records; measure them.
**POS:** task_2af1f1ce
**Done:** [x]

### Task 2: Inventory (agent): recorded search for 3000 used as a port, with a disposition for every hit
**What:** Run and record the grep inventory of every place that holds or assumes 3000 and give each hit a classification and a disposition.
**Files:** Appends section "Inventory of 3000" to `specs/features/desktop-server-port/experiments.md`. No source change. Reads `README.md`, `CLAUDE.md`, `docs/`, `.github/workflows/`, `scripts/`, `demo/`, `cli/`, `electron/`, `frontend/`, `specs/`, `package.json` files, and `electron/src/sharing/server-readiness.ts` (confirm by `ls` that the readiness file's path is `electron/src/sharing/server-readiness.ts`, not `electron/src/server-readiness.ts`).
**Done when:** `experiments.md` records the exact commands (for example `rg -n -w '3000'` with the excluded directories named, plus searches for `localhost:3000`, `127.0.0.1:3000`, `:3000`, `PORT`, `-p 3000`, `--port`, `process.env.PORT`, `next dev`, `next start`, and ports written without the literal such as `3e3` or a port computed from another value) and their FULL output, covering source, tests, docs, workflows, scripts and `specs/`. Every hit is classified as (a) follows the single source, (b) hard-coded elsewhere, (c) implicit default with no literal, (d) historical record, or (e) unrelated (a duration, word count, test count), and ends with a disposition (follows the source, changed, deliberately left, or historical) and a reason. The starting list of FR-6 is checked against the result and every difference is listed, including any hit the list missed. The expected dispositions per the Gate 3 answers are recorded as owner decisions: hosted-auth fallbacks and their two tests left; the `paired-device-limits` scripts left (historical, not valid against the new port, and why); the AppImage smoke workflow left except for a comment (Task 11). Every "changed" disposition names the test or check that will cover it (FR-24). `git status --short` shows no change outside `specs/`.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-5, FR-6, FR-8, FR-24. No process is started. Classification (c) for `next dev` and `next start` is a Hypothesis from Next's documented behaviour until Task 4 shows the listening port.
**POS:** task_b45e8d90
**Done:** [x]

### Task 3: Experiment (agent): port in use TODAY, measured on 3000 with a throwaway listener
**What:** Measure what the unchanged app does when something already listens on its port, on 3000 (the only port the unchanged code uses), so the owner has the mechanism before Tasks 9 and 10 are sized.
**Files:** Appends section "Port in use today (3000)" to `specs/features/desktop-server-port/experiments.md`; script `specs/features/desktop-server-port/scripts/port-in-use-today.mjs`. Reads `electron/src/main.ts` (the fork at ~173 and ~209, the "Server exited unexpectedly" path ~815, `requestSingleInstanceLock`, `installWindowSecret` ~782), `electron/src/sharing/server-readiness.ts` (lines 49 to 53), `electron/src/sharing/window-secret.ts`.
**Done when:** `experiments.md` states in its first lines WHICH PORT this used and why: 3000, because the constant has not changed yet; valid for the mechanism; says nothing about 7340; Task 17 and Task 19 repeat it on 7340. It records, using the dev-mode copied-tree approach and a throwaway `--user-data-dir` and projects folder: that 3000 had no listener before the task's own throwaway listener started (the task refuses to run otherwise); the throwaway listener is a tiny HTTP server on 3000 answering a distinct marker page with status 200, started by the task, its pid recorded, which records only the PRESENCE (yes/no) of the `x-getwrite-window` request header on each request it receives and never the value; for the app launched against it: what the window showed (screenshot description or window title and a DOM text excerpt that contains no secret), whether the window loaded the listener's page (yes/no), whether the listener received the window header (present or absent only, and how many requests), whether the app showed "Server exited unexpectedly" or any other message, the forked server child's exit code and the app log lines (names and messages only), what the sharing status reported, and whether the app exited. A second variant with a listener answering status 500 and a third with no response at all (accepts the connection and stays silent) are recorded the same way if they run without extra setup. The reading in FR-10 ("resolves on any status below 500, sends the secret on every poll") is stated as read, and the run is stated as the measurement; a cause is named only where a variant discriminates it. The record ends with a plain statement for Tasks 9 and 10 of which of these hold today: the window showed a foreign page; the header reached a foreign process; a failed bind of the child is or is not visible to the app. The app and listener are stopped by their recorded pids and the throwaway folders removed. `git status --short` shows no change outside `specs/`.
**Depends on:** 1, 2
**Estimate:** 5
**Notes:** Satisfies FR-10 (measurement), FR-22 (first half, mechanism). Main checkout, outside the sandbox (Electron needs it). Process-safety rules apply in full; the only listener on 3000 is the task's own. Never read the real `userData`. The nonce-versus-child-state choice in Task 9 uses this result.
**POS:** task_ad487946
**Done:** [x]

### Task 4: Experiment (agent): which port each dev command listens on, and whether a dev app and a packaged app can run at once
**What:** Record the port each development command actually listens on and whether two app instances (as a dev app and a packaged app would be) can run at once, so OQ-2 can be finalized.
**Files:** Appends section "Dev commands and coexistence" to `specs/features/desktop-server-port/experiments.md`; script `specs/features/desktop-server-port/scripts/dev-ports.mjs`. Reads root `package.json` and `frontend/package.json` scripts (`dev`, `start`, `electron:dev`), `electron/src/main.ts` (`requestSingleInstanceLock`, `startServer` ~224 to 228, how `userData` is chosen), `cli/src/qa/server.ts`, `demo/README.md`, `demo/seed.mjs`, `demo/playwright.demo.config.ts`.
**Done when:** `experiments.md` records, per command, the port it LISTENS on measured by `lsof -nP -iTCP -sTCP:LISTEN -a -p <pid>` for the pid the task started: `pnpm dev` (frontend), `pnpm start` (alias for the frontend dev), and `pnpm electron:dev` in the copied-tree approach on today's code (3000); plus `next dev` with `PORT` set to a free port the task picks (to show `PORT` is honoured; the QA harness comment is read, this is the run); the demo scripts are read for the port they assume and marked "read, not run". For coexistence it records, by reading and by a run: how `requestSingleInstanceLock` is keyed (Electron keys it by `userData` path; stated as read from the Electron documentation if not run), and the result of starting two instances of the dev-mode copied-tree app with two DIFFERENT throwaway `--user-data-dir`s (the second quits or not; whether the second's server bound or failed), with the facts only. It states what is not established (for example the behaviour of a packaged build and a dev build together, which Task 19 can add to). All servers are started on 3000 only when the task has confirmed 3000 free, otherwise the task refuses; pids recorded and stopped by pid; throwaway folders removed. `git status --short` shows no change outside `specs/`.
**Depends on:** 3
**Estimate:** 5
**Notes:** Satisfies FR-12 (run), part of FR-5(c), and the evidence for OQ-2. Main checkout, outside the sandbox. `pnpm dev` writes nowhere outside the repo's `projects/` only if started in the copied tree; use the copied tree for every command here and say so.
**POS:** task_28437125
**Done:** [ ]

### Task 5: Experiment (agent): does a paired device stay paired when the same host is reached on another port (cookie scope, in a real browser)
**What:** Measure in a real browser against a built server with a throwaway sharing directory whether a device paired at one port is treated as paired at another port on the same host with the same credential store.
**Files:** Appends section "Cookie scope across ports" to `specs/features/desktop-server-port/experiments.md`; script `specs/features/desktop-server-port/scripts/cookie-scope.mjs`. Reads `frontend/scripts/sharing-refusal-smoke.mjs` (how it starts a built standalone server with sharing on and obtains a paired cookie), `frontend/src/lib/sharing/classify-request.ts`, `credential-store.ts`, `host-allowlist.ts`.
**Done when:** `experiments.md` records, with the Chromium version (Playwright's build) and the host LAN address shown as `<lan-ip>`: two instances of the built standalone server started from the same build on two free ports the task picks (A and B), with `GETWRITE_SHARING=1`, the same `GETWRITE_SHARING_DIR` (throwaway) and `GETWRITE_WINDOW_SECRET` (throwaway, value never recorded), each with its own `PORT` and `GETWRITE_PROJECTS_DIR`; a device paired at `http://<lan-ip>:A` in a fresh browser context by the task's own pairing step (value of code and cookie never printed); then in the SAME context a request to `http://<lan-ip>:B` — status and whether the application page or the pairing page was shown; and the cookie's attributes (name, domain, path, SameSite, HttpOnly, Secure, expiry present or absent) with no value. Separately listed, each as its own item: `localStorage` and `sessionStorage` presence at A versus B (origin-scoped, from the run), and the saved-bookmark case stated as what a bookmark at the old address does (it is a different origin; recorded as reasoning, not run, unless exercised). Verdict stated as a fact: stays paired at B, or does not, with the observed status; the Hypothesis in FR-14 is marked confirmed or contradicted by this run only. The statement from the project notes that a port change means pairing again is NOT repeated anywhere. Servers stopped by recorded pids; throwaway folders removed. `git status --short` shows no change outside `specs/`.
**Depends on:** 4
**Estimate:** 5
**Notes:** Satisfies FR-14 and the evidence for OQ-4. Main checkout, outside the sandbox, after `pnpm build` and copying `.next/static` into `.next/standalone/frontend/.next/static` (the build needs 3000 and 7340 free only to start nothing; the servers use free ports A and B). A request from the host to its own LAN address is not a second-device result: label it so. If the machine has no LAN address, record that and stop.
**POS:** task_b7d271a3
**Done:** [ ]

### Task 6: Experiment (agent): what a client opening the old address sees, and whether a real browser accepts port 7340
**What:** Record what real Chromium shows at the old port with nothing listening, whether it answers from the LAN address when a dev server holds it, and whether Chromium accepts a page served on port 7340.
**Files:** Appends section "Old address and browser acceptance of 7340" to `specs/features/desktop-server-port/experiments.md`; script `specs/features/desktop-server-port/scripts/old-port-and-7340.mjs`.
**Done when:** `experiments.md` records: the check that 3000 and 7340 had no listener before the task started its own throwaway ones (the task refuses otherwise); with NOTHING on 3000, what Chromium (version recorded) shows for `http://<lan-ip>:3000` and `http://localhost:3000` (error page text, no secret); with a throwaway server on 3000 started by the task as a `next dev` of the repo's frontend in the copied tree with sharing off (pid recorded, stopped by pid), whether a request from the host to its own LAN address on 3000 returns project data or a refusal (status and whether `x-getwrite-gate` was present; labelled as from the host, not a second device; whether it predates Feature 75 is not checked); with a throwaway plain HTTP server the task starts on 7340 (pid recorded, stopped by pid), whether Chromium loaded `http://<lan-ip>:7340` and `http://localhost:7340` (accepted yes/no, with the Chromium version) and the page's status. Firefox, desktop Chrome and Safari are listed as "not checked", and the restricted-port statement in the spec's scope note stays labelled unchecked memory for them. The Android phone result is NOT claimed (Task 21). `git status --short` shows no change outside `specs/`.
**Depends on:** 5
**Estimate:** 3
**Notes:** Satisfies FR-16, FR-21 (Chromium half), and the evidence for OQ-5. Main checkout, outside the sandbox. This is the one task that deliberately places a throwaway listener on 7340, before the constant changes; it removes it before the task ends and confirms 7340 is free afterwards.
**POS:** task_ea9caf34
**Done:** [ ]

### Task 7: STOP (owner, not executable by an implementor): report Tasks 1 to 6 and finalize OQ-2, OQ-4 and OQ-5 before any dependent work
**What:** The orchestrator reports the measurements to the owner and waits; the owner answers the three provisional questions and confirms the size of the readiness and refusal work.
**Files:** none (reads `specs/features/desktop-server-port/experiments.md`).
**Done when:** the owner has seen the baselines, the inventory, the port-in-use-today result, the dev-port and coexistence result, the cookie-scope result and the old-port and 7340 result, and has said (1) OQ-2: `electron:dev` follows the constant, plain `pnpm dev` and `pnpm start` stay on 3000, and whether the optional dev port 7341 (Task 13) is turned on, depending on whether a dev app and a packaged app can run at once; (2) OQ-4: leave `device-credentials.json` alone, whether a paired device must pair again from the cookie result, and whether a release-note or docs line is wanted; (3) OQ-5: a release-note or docs line only, and whether panel text (Task 14) is turned on because the old-address failure is confusing; and (4) the size and mechanism of Tasks 9 and 10 given Task 3's result (a per-launch nonce the child echoes, or the child's exit or bind state); and the orchestrator has recorded the answers in the spec and ticked this task. If Task 3 shows the readiness check or the window secret already behaves safely, or shows the work is larger than 5 points each, the list is re-planned here.
**Depends on:** 1, 2, 3, 4, 5, 6
**Estimate:** 1
**Notes:** NOT executable by an implementor. The orchestrator does not tick it itself and does not treat it as a failure while it is unticked. Every task after this depends on it. The provisional directions are recorded in the spec as provisional, not resolved, until this stop.
**POS:** task_49f18d0c
**Done:** [ ]

### Task 8: Change the constant to 7340 with tests first, and show every consumer follows it
**What:** Change `PORT` in `electron/src/server-config.ts` to 7340 and show with tests that each consumer and the server's Host allowlist follow the single source.
**Files:** `electron/src/server-config.ts` (line 11), `electron/tests/server-config.test.ts` (add the one pinning test), consumer tests under `electron/tests/` for `addresses.ts`, `navigation-guard.ts`, `window-secret.ts`, the sender checks and the sharing status (extend existing files first), `frontend/tests/unit/sharing-host-allowlist.test.ts` or the existing host-allowlist/gate test files (extend). Reads `electron/src/main.ts` lines ~173, 292, 300, 304, 313, 683, 732, 738, 745, 782, `electron/src/sharing/addresses.ts`, `frontend/src/lib/sharing/gate.ts` (~158 `parseServerPort`), `host-allowlist.ts`, `same-origin.ts`.
**Done when:** tests first, seen failing, then green. The pinning test asserts `PORT === 7340` in `server-config.test.ts` only; the existing guard tests (exactly one numeric export, `main.ts` assigns no numeric literal to a port) pass unchanged; each consumer listed in FR-3 is shown by a unit test with a port other than 3000 or 7340 passed in as input (for example 41234) to produce URLs, origins and addresses with that port and none with 3000 or 7340; where a consumer in `main.ts` is not reachable from a plain module, the consumer is moved behind a small pure function in a plain module and tested there, and the move is described; the Host allowlist test shows, with `PORT=7340`, a Host of `<lan-ip>:7340`, `localhost:7340` and `127.0.0.1:7340` accepted and the same names on `:3000` and on another port refused, plus the missing/invalid `PORT` still refusing every request; no other source file in `electron/src/` gains a numeric port literal; no environment override or setting for the port is added; the inventory's "changed" dispositions from Task 2 each have their test; the hosted-auth files and their two tests are unchanged (`git diff --stat` pasted). From `electron/`: `pnpm test`, `pnpm typecheck`; from `frontend/`: touched test files, `pnpm typecheck`, `pnpm lint`; `pnpm knip` nothing new compared by set to Task 1.
**Depends on:** 7
**Estimate:** 3
**Notes:** Satisfies FR-1, FR-2, FR-3, FR-4, FR-24 (changed hits), FR-28. Fixed constant (OQ-7 resolved). Tests that use 3000 only as an input fixture must pass unchanged; if one fails because of the new value, record why before touching it.
**POS:** task_7bfc2419
**Done:** [ ]

### Task 9: Readiness accepts only the server the app forked, and the window secret is never sent to another process (tests first)
**What:** Change the readiness check so it succeeds only for the server the app itself started, and so the per-launch window secret is never attached to a request answered by a process the app did not start.
**Files:** `electron/src/sharing/server-readiness.ts` (lines ~49 to 53), `electron/tests/server-readiness.test.ts` (extend), `electron/src/main.ts` (where readiness is awaited and `installWindowSecret` is called, ~782), possibly `electron/src/sharing/window-secret.ts`, and, only if the chosen mechanism needs the child to echo an identity, the smallest server-side addition under `frontend/` named in the task's report. Reads `specs/features/desktop-server-port/experiments.md` (Task 3 and the Task 7 answers).
**Done when:** tests first, seen failing, then green. The mechanism chosen at Task 7 (a per-launch nonce the child echoes, or the child's exit or bind state) is named in the report with the reason. Unit tests, at the lowest level that can show them, show: a listener that answers 200, 404, 401 or 500 but is not the forked child does NOT make readiness succeed (it fails or keeps waiting and finally times out with a distinct error); the forked child's identity makes it succeed; the poll request carries NO window-secret header to anything until identity is established, and the window-secret session installation happens only after readiness has confirmed the forked child, shown by a test of the pure ordering logic; a forked child that exits non-zero before readiness is reported as such; the previous behaviour for the real server (resolves on success within 30 s polling every 500 ms) is unchanged; no secret value is logged or returned. If the mechanism needs a server change, a test shows the server still refuses an unclassified request exactly as before (the gate's classification rules are not changed) and that the identity response reveals no window secret, credential or project data. From `electron/`: `pnpm test`, `pnpm typecheck`; from `frontend/` if touched: touched tests, `pnpm typecheck`, `pnpm lint`; `pnpm knip` nothing new.
**Depends on:** 7, 8
**Estimate:** 5
**Notes:** Satisfies FR-11 (second half), FR-10. The estimate is provisional: Task 7 confirms the size from Task 3's measurement. Do not change `classify-request.ts` or `gate.ts` classification rules. The exact mechanism is a design choice; the requirement is behavioural.
**POS:** task_18291efb
**Done:** [ ]

### Task 10: Refuse to start the server when the port is in use, and show a plain message naming the port (tests first)
**What:** When 7340 is already in use at launch, the app refuses to start the server, shows a plain message naming the port, does not fall back to another port, and never loads a foreign page into the window.
**Files:** a new pure module under `electron/src/` (for example `electron/src/port-in-use.ts`) with `electron/tests/port-in-use.test.ts` (NEW or extend), `electron/src/main.ts` (the startup and "Server exited unexpectedly" paths ~815 and following), the existing error-screen helper if one exists (open it first; otherwise the smallest local HTML in the same style). Reads `electron/src/server-config.ts`, `electron/src/sharing/server-readiness.ts`.
**Done when:** tests first, seen failing, then green. A pure function decides, from the observable outcome of the start attempt (the child exited before readiness, readiness timed out, readiness identity mismatch, or success), whether to show the port-in-use message; the message names the port taken from `PORT` (tested with a port other than 3000 or 7340 passed in) and says in plain words that another program is using it, how to find what holds it (a short, platform-neutral hint), and that GetWrite did not start; no fallback port is tried (a test asserts no second port is derived from the constant); the displayed addresses, the Host allowlist and the window secret target never change with the launch; a foreign listener's response is never loaded into the window (tested at the pure ordering level together with Task 9); the existing "Server exited unexpectedly" screen is unchanged for other exits. The message contains no secret, path of the user's data, or pairing code. `requestSingleInstanceLock` behaviour is unchanged (a second copy of the same app still quits). From `electron/`: `pnpm test`, `pnpm typecheck`, `pnpm build`; `pnpm knip` nothing new.
**Depends on:** 9
**Estimate:** 5
**Notes:** Satisfies FR-11 (first half), FR-10, US-4. Real-app behaviour is verified in Tasks 17 and 19, not here. The estimate is provisional and confirmed at Task 7. The message text is working copy (reviewed in the later copy pass).
**POS:** task_41c8f551
**Done:** [ ]

### Task 11: Comment in the AppImage smoke workflow (comment only)
**What:** Add a comment near the workflow's "nothing may answer on :3000" check saying a future matrix entry for a 7340 build needs its own probe port.
**Files:** `.github/workflows/linux-appimage-smoke.yml` (around lines 132 to 140).
**Done when:** `git diff -- .github/workflows/linux-appimage-smoke.yml` shows ONLY added comment lines (every added line starts with `#` after its indentation), no probe, matrix, step or command changed, and the YAML still parses (`node -e` or `python3 -c` with a YAML loader if available, otherwise `git diff --stat` shows insertions only); the comment says the workflow tests the published 1.8.0 and 2.0.0 releases, which listen on 3000, and that a future matrix entry for a build on 7340 needs its own probe port. No other workflow file is changed.
**Depends on:** 7
**Estimate:** 1
**Notes:** Satisfies FR-7 (OQ-9 resolved). No process is started.
**POS:** task_e6025b18
**Done:** [ ]

### Task 12: Record the block-of-ten convention (ADR and one `CLAUDE.md` line)
**What:** Write a new ADR for the port-block convention and add one line to `CLAUDE.md` pointing at it.
**Files:** `docs/architecture/ADRs/adr-023-saboteur-port-blocks-of-ten.md` (NEW; open `adr-022-end-to-end-encryption-via-storage-adapter-decorator.md` and `docs/architecture/ADRs/README.md` first and follow their format and index), `CLAUDE.md` (one line, in the Electron Shell section next to the server-port sentence or in Standards; no other CLAUDE.md edit).
**Done when:** the ADR has Date (2026-10-10 or the day written), Status, Context, Decision, Options considered and Consequences in the existing format, and states: GetWrite owns 7340 to 7349; the next Saboteur app starts at the base plus 10 (7350), and so on; the desktop server uses 7340; the Gate 0 screening was against a local `/etc/services` and not the live IANA registry, and that 7340 being absent from Chrome's and Firefox's restricted-port lists is memory and not checked (or the Task 6 result for Chromium only); the hosted-auth fallbacks and development commands keep 3000 as recorded at the Task 7 stop (stated as the owner's decision); that a copy in a shared cross-repo location is the owner's own step and is NOT made by this task. The ADR index (if the ADR README lists ADRs) gains one line. `CLAUDE.md` gains exactly one line linking the ADR; `git diff --stat` shows only these files changed. Each statement is dated and labelled read, measured or reported.
**Depends on:** 7
**Estimate:** 2
**Notes:** Satisfies FR-26 (OQ-6 resolved). This is the only documentation task in the list; the rest of FR-25 is a later pipeline stage. Do not write anywhere outside this repository.
**POS:** task_59c67a2f
**Done:** [ ]

### Task 13: CONDITIONAL - Give development mode its own port 7341 so a dev app and a packaged app can run at once
**What:** If the owner turns it on at Task 7, make development mode (`isPackaged === false`) use 7341 while the packaged app keeps 7340.
**Files:** `electron/src/server-config.ts`, `electron/tests/server-config.test.ts`, `electron/src/main.ts` (dev branch only), tests beside the consumers of Task 8; `demo/*` only if the owner says the demo follows. Reads the Task 4 and Task 7 records.
**Done when:** CLOSED "not needed" if the owner kept the provisional direction without the dev port (then nothing changes and the task is ticked with that statement). Otherwise: tests first, seen failing, then green; the spec's guard "exactly one numeric export, `PORT`" in `server-config.test.ts` is amended explicitly by the owner's answer (the report names the amendment, and Feature 75 FR-25's rule that no other test depends on the value still holds); dev mode listens on 7341 and packaged on 7340, chosen by one function tested with both inputs; every consumer of Task 8 still reads the value from the single source; `pnpm dev` and `pnpm start` are untouched; the Block-of-ten ADR (Task 12) is updated by one line saying 7341 is the development port. From `electron/`: `pnpm test`, `pnpm typecheck`; `pnpm knip` nothing new.
**Depends on:** 7, 8, 12
**Estimate:** 3
**Notes:** CONDITIONAL on the Task 7 stop (OQ-2 option c). Provisional direction in the spec is that `electron:dev` follows the constant; this task exists only if the owner turns the optional dev port on. It may conflict with the "exactly one numeric export" guard, which is why the owner must say so.
**POS:** task_b6dd8cf6
**Done:** [ ]

### Task 14: CONDITIONAL - State in the sharing panel that the old address no longer works
**What:** If the owner turns it on at Task 7 because Task 6 showed the old-address failure is confusing, add one plain sentence to the sharing panel's address display.
**Files:** `frontend/components/Sharing/sharing-copy.ts`, `frontend/components/Sharing/SharingSettings.tsx` (open the component and its stories first; do not invent props), its existing test and story.
**Done when:** CLOSED "not needed" if the owner kept the provisional direction (a release-note or docs line only, carried to the documentation stage). Otherwise: tests first, seen failing, then green; the sentence is working copy marked as such, the address displayed still ends in the port from the status the desktop returns (a test with a port other than 3000 or 7340), the sentence names no port literal other than the one it is given as input, no red or alert styling, the component's accessibility test still passes; From `frontend/`: touched tests, `pnpm typecheck`, `pnpm lint`; `pnpm knip` nothing new.
**Depends on:** 7, 8
**Estimate:** 2
**Notes:** CONDITIONAL on the Task 7 stop (OQ-5 option c). No redirector or listener on 3000 is ever built.
**POS:** task_fb3eb80c
**Done:** [ ]

### Task 15: Verification (agent): built-server check, Host allowlist on the new port and the sharing smoke
**What:** Against a built standalone server, show the Host allowlist accepts `:7340` and refuses `:3000`, and run the sharing smoke.
**Files:** Appends section "Built server on the new port" to `specs/features/desktop-server-port/experiments.md`; script `specs/features/desktop-server-port/scripts/built-server-check.mjs`. Reads `frontend/scripts/sharing-refusal-smoke.mjs`, `frontend/src/lib/sharing/host-allowlist.ts`.
**Done when:** `experiments.md` records, in the main checkout after `pnpm build` and the `.next/static` copy (outside the command sandbox; say so): the pre-check that 7340 and 3000 have no listener (the task refuses otherwise); a built standalone server started by the task with sharing on, `PORT=7340`, a throwaway sharing directory and projects folder, its pid recorded and stopped by pid: requests with `Host: <lan-ip>:7340`, `localhost:7340`, `127.0.0.1:7340` are accepted by the Host allowlist (status and `x-getwrite-gate` presence stated), and `<lan-ip>:3000` and `localhost:3000` are refused with the plain-text 403; the same names on a port other than `PORT` are refused; labelled that a request from the host to its own LAN address is NOT a second-device result. Separately, `pnpm test:sharing-smoke` counts (checks, failures) compared with Task 1 (the smoke picks a free port itself; the record says whether it did not depend on 7340). Any difference from the baseline is listed with its cause as measured or as unestablished. No credentials, cookies, secrets or codes printed. `git status --short` shows no change outside `specs/`. If a check fails, the product defect is recorded and the task is not ticked.
**Depends on:** 8, 10, 13, 14
**Estimate:** 3
**Notes:** Satisfies FR-17 (built-server half), FR-29 (smoke). Main checkout, one task at a time. Records and does not fix. A dependency on a conditional task is satisfied when it was closed "not needed".
**POS:** task_25b80177
**Done:** [ ]

### Task 16: Verification (agent): pairing end to end on 7340 in a real browser, loading `/pair` unpaired
**What:** Pair a fresh, unpaired Chromium context at `http://<lan-ip>:7340` using a code obtained through the real app's own flow, counting main-frame navigations on the pairing page.
**Files:** Appends section "Pairing on 7340" to `specs/features/desktop-server-port/experiments.md`; script `specs/features/desktop-server-port/scripts/pair-on-7340.mjs`. Reads `electron/src/main.ts` (pairing code IPC), `frontend/components/Sharing/PairingScreen.tsx` and `frontend/app/pair/page.tsx`, the Feature 77 record of the pairing-page defect in `specs/features/paired-device-limits/experiments.md`.
**Done when:** `experiments.md` records, with the dev-mode copied-tree approach (the real Electron app, throwaway `--user-data-dir`, throwaway projects folder, sharing turned on through the app's own settings, outside the command sandbox; say so): the pre-check that 7340 had no listener (refuse otherwise) and that 3000 was checked; the app's pid recorded and stopped by pid; a pairing code obtained through the app's own window flow (generated by the app's UI and read from the window, held in memory by the script, NEVER printed or written to any file); a fresh Playwright Chromium browser context with no cookie loading `http://<lan-ip>:7340/pair` UNPAIRED, typing the code into the page by the page's own fields (not by a helper that posts to the pair route), and reaching the paired application; the Chromium version; the number of main-frame navigations on the pairing page counted by a `framenavigated` listener (main frame only), with the number stated and what each navigation was (URL path only); whether the port was accepted by the browser for the pairing page and an application page (FR-21); and a statement of whether the Feature 77 pairing-page defect (extra navigation) reappears, as a count and not a cause. If the app cannot be driven to produce a code, the blocker is recorded and the task is not ticked. `git status --short` shows no change outside `specs/`.
**Depends on:** 15
**Estimate:** 5
**Notes:** Satisfies FR-20, FR-21 (Chromium half on the changed build). Main checkout, one task at a time, never two. Never record the code, cookie, secret or device name beyond a generic label. A request from the host to its own LAN address is not a second-device result: label it so.
**POS:** task_1ff65dbc
**Done:** [ ]

### Task 17: Verification (agent): the real Electron app in development mode on 7340
**What:** Run the real Electron app in development mode (copied tree) and record that the window loads from 7340 with sharing off and on, the displayed addresses end in 7340, nothing of the app answers on 3000, and a busy 7340 gives the port-in-use message.
**Files:** Appends section "Electron development mode on 7340" to `specs/features/desktop-server-port/experiments.md`; script `specs/features/desktop-server-port/scripts/electron-dev-7340.mjs`. Reads `electron/src/main.ts`, `electron/src/sharing/addresses.ts`, `frontend/components/Sharing/SharingSettings.tsx`, `SharingStatus.tsx`.
**Done when:** `experiments.md` records, using the copied-tree approach described above, a throwaway `--user-data-dir` and projects folder (paths asserted under `$TMPDIR`; the real `userData` never read or written), outside the command sandbox: pre-checks that 7340 and 3000 had no listener (refuse otherwise); with sharing OFF, the window's loaded URL origin (expected `http://localhost:7340`), listening port of the forked server by `lsof -a -p <pid>`; with sharing ON (turned on through the real settings and restart as the app requires), the loaded origin again and every address shown in the status and settings surfaces as shown text, each ending in `:7340` and none ending in `:3000` (counts stated); the Host allowlist against the real app (a request with `Host: <lan-ip>:7340` accepted, with `Host: <lan-ip>:3000` refused, labelled as sent from the host); a request to `http://localhost:3000` does not reach the app's server (status or connection refused, only after confirming nothing else listens on 3000); port in use on 7340: the task starts its own throwaway listener on 7340 answering a distinct marker with the window-header presence recorded as present or absent only, launches the app against it, and records what the window shows (the plain message naming 7340 expected), whether the window loaded the listener's page, whether the listener received the window header (present or absent only), the app's exit and log lines, and what the sharing status reports; the first-half measurement of Task 3 on 3000 is quoted beside it; each pid started is stopped by pid, the throwaway listener by its own recorded pid, and 7340 is confirmed free afterwards. `git status --short` shows no change outside `specs/`. If a check fails the defect is recorded and the task is not ticked.
**Depends on:** 16
**Estimate:** 5
**Notes:** Satisfies FR-18, FR-19, FR-22 (second half), FR-17 (real-app half), FR-11 (verification). Main checkout, one task at a time. Never print window-secret values, codes or cookies. Dev mode here is "the development code path in a copied tree"; the difference from the repo tree was not measured.
**POS:** task_ee7bf4f1
**Done:** [ ]

### Task 18: Build the unpacked app (agent) and record the build
**What:** Produce the unpacked desktop build (no installer) from the changed tree so Task 19 can run it.
**Files:** Appends section "Unpacked build" to `specs/features/desktop-server-port/experiments.md`. No source change; build output under `electron/` stays untracked (check `git status --short`).
**Done when:** `experiments.md` records the exact commands (`pnpm electron:build`, then `pnpm electron:package` with the electron-builder option that produces the unpacked directory only), exit statuses, the path of the unpacked `.app` or directory, the date, `node --version`, and what was not produced (no installer, no signing, no notarization); the pre-check that 7340 and 3000 had no listener is recorded though the build starts nothing long-running; if the build cannot be produced here the failing step and error are recorded and reported as a blocker, nothing substituted. `git status --short` shows no tracked-file change and no new untracked file outside ignored build output and `specs/`.
**Depends on:** 17
**Estimate:** 3
**Notes:** Main checkout only (builds fail in git worktrees here), outside the command sandbox. Packaging may take long. Remember the packaged build resolves projects to `~/Documents/GetWrite` unless overridden: Task 19 must override with a throwaway projects folder or start the app only with an override mechanism read from `electron/src/projects-dir.ts`; if no override exists that keeps it away from `~/Documents/GetWrite`, record that as a blocker for Task 19 rather than risk the owner's real folder.
**POS:** task_d145a897
**Done:** [ ]

### Task 19: Verification (agent): the unpacked build on 7340
**What:** Run the unpacked build with throwaway folders and repeat Task 17's checks against it.
**Files:** Appends section "Unpacked build on 7340" to `specs/features/desktop-server-port/experiments.md`; script `specs/features/desktop-server-port/scripts/electron-unpacked-7340.mjs`. Reads `electron/src/projects-dir.ts` (override mechanism via `workspace.json` in the throwaway user-data folder), `electron/electron-builder.yml`.
**Done when:** `experiments.md` records, for the unpacked app launched with a throwaway `--user-data-dir` and a throwaway projects folder set so that `~/Documents/GetWrite` and `~/Library/Application Support/getwrite-electron/` are never read or written (the script asserts the throwaway paths and records which mechanism kept the app off `~/Documents/GetWrite`; if none exists the task stops and reports a blocker): the pre-checks that 7340 and 3000 had no listener (refuse otherwise); sharing OFF and ON, the window's loaded origin (`http://localhost:7340`), every displayed address ends in `:7340` and none in `:3000`, the forked server's listening port by pid, nothing of the app answering on 3000 (checked after confirming no other listener), the Host allowlist against the real app (accepted `:7340`, refused `:3000`; labelled as sent from the host), and the port-in-use result with the task's own throwaway listener on 7340 (window text, whether the listener's page loaded, window header present or absent only, exit and log lines, sharing status), each pid and the throwaway listener stopped by its own recorded pid; the run also notes, as a fact, whether a second instance (the dev-mode app of Task 17 with a different `--user-data-dir`) started alongside it, if the owner turned the dev port on at Task 7 (otherwise "not run"). `git status --short` shows no change outside `specs/`. A failed check is recorded and the task is not ticked.
**Depends on:** 18
**Estimate:** 5
**Notes:** Satisfies FR-18, FR-19, FR-22 (second half), FR-17 (real app). Main checkout, one task at a time, outside the command sandbox. Never print secrets, codes or cookies.
**POS:** task_fe063a5e
**Done:** [ ]

### Task 20: Final suites (agent): run every suite against the baselines, including e2e, knip and the CLI suite
**What:** Re-run the full suites after all code tasks and compare each to Task 1's baseline.
**Files:** Appends section "Final suites" to `specs/features/desktop-server-port/experiments.md`. No source change.
**Done when:** the section records, with command, date, exit status, counts, commit and `node --version`, the same list as Task 1: from `frontend/` `pnpm test:ci`, `pnpm typecheck`, `pnpm lint`, `pnpm test:sharing-smoke` and `pnpm test:e2e` (Storybook on 6006 started and stopped by the task, with the 6006 check first); from `electron/` `pnpm test`, `pnpm typecheck`; from the repo root `pnpm knip` (compared BY SET to the baseline names) and `pnpm --filter getwrite-cli test`; each with its baseline beside it and the difference stated; every difference is listed with a cause as measured or as unestablished (the tests added by Tasks 8 to 10 and 13 to 14 are the expected increase; the record names the count of new tests); the record states `git diff --stat main..HEAD` for the code changed and confirms the hosted-auth files, the two hosted tests and the `paired-device-limits` scripts are unchanged. A failing suite is recorded as failing and the task is not ticked. `git status --short` shows no change outside `specs/`.
**Depends on:** 11, 12, 19
**Estimate:** 3
**Notes:** Satisfies FR-29, FR-9 (comparison). Main checkout, one task at a time, outside the command sandbox. Records and does not fix.
**POS:** task_8a461b95
**Done:** [ ]

### Task 21: Owner manual check (owner, not executable by an implementor): unpacked build, Android phone, the new address
**What:** The owner runs the unpacked build with sharing on, opens the new address on the Android phone and reports what happens.
**Files:** none (the owner reports; the orchestrator may record it in `experiments.md` as "Reported by the owner").
**Done when:** the owner has reported, for the unpacked build with sharing on: (1) the address shown in the app ends in `:7340`; (2) opening `http://<lan-ip>:7340` on the Android phone, whether a phone paired before the change is still paired or must pair again (this is the real-device counterpart of Task 5); (3) pairing again if asked, with the code from the app; (4) an edit made on the phone appears on the desktop; (5) the old address `:3000` no longer works on the phone and what the phone shows (the real-device counterpart of Task 6); and, if the owner chooses, the Android Chrome version and whether the port was accepted. The port-in-use message is NOT something the owner needs to stage (Tasks 17 and 19 cover it). The orchestrator records the report labelled "Reported by the owner", not as a pipeline observation.
**Depends on:** 20
**Estimate:** 3
**Notes:** NOT executable by an implementor. The orchestrator leaves it unticked until the owner has done it and does not treat that as a failure. The owner's step of copying the convention to a shared cross-repo location (OQ-6) is separate and is not part of this task.
**POS:** task_7ac7c01c
**Done:** [ ]

## FR to task coverage

| FR | Tasks |
|---|---|
| FR-1 | 8 |
| FR-2 | 8 |
| FR-3 | 8 |
| FR-4 | 8, 15 |
| FR-5 | 2 |
| FR-6 | 2, 8 |
| FR-7 | 2, 11 |
| FR-8 | 2 |
| FR-9 | 1, 20 |
| FR-10 | 3, 9, 10 |
| FR-11 | 9, 10, 17, 19 |
| FR-12 | 4, 7, 13 |
| FR-13 | 2, 8 (hosted files left unchanged; checked in 20) |
| FR-14 | 5, 7 |
| FR-15 | 5, 7 (no code; no migration) |
| FR-16 | 6, 14, 21 |
| FR-17 | 15, 17, 19 |
| FR-18 | 17, 19 |
| FR-19 | 17, 19 |
| FR-20 | 16 |
| FR-21 | 6, 16, 21 |
| FR-22 | 3, 17, 19 |
| FR-23 | 7 |
| FR-24 | 2, 8 |
| FR-25 | none: a separate documentation stage, per the task rules, except the convention line in Task 12 |
| FR-26 | 12 |
| FR-27 | every task that starts a server or app (header rule; Tasks 1, 3, 4, 5, 6, 15 to 19) |
| FR-28 | 8, 9, 10 (header rule) |
| FR-29 | 1, 15, 20 |
| FR-30 | 21 |
| FR-31 | every measuring and verification task (header rule) |

## Summary
- Total tasks: 21
- Total estimated effort: 73 points (Task 1: 3, 2: 3, 3: 5, 4: 5, 5: 5, 6: 3, 7: 1, 8: 3, 9: 5, 10: 5, 11: 1, 12: 2, 13: 3, 14: 2, 15: 3, 16: 5, 17: 5, 18: 3, 19: 5, 20: 3, 21: 3; Tasks 13 and 14 are conditional and are 5 of the 73)
- Critical path: Tasks 1 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 15 → 16 → 17 → 18 → 19 → 20 → 21 (Task 7 is the owner's stop; Tasks 2, 11 and 12 run off the path; Tasks 13 and 14 sit between 10 and 15 only if turned on; Task 21 is the owner's)
- Risks: Task 3 decides how large Tasks 9 and 10 are (if a foreign listener already cannot receive the window secret, or the child's failed bind is not visible to the app, the mechanism changes and the list is re-planned at Task 7); Tasks 3, 17 and 19 drive the real Electron app and place a throwaway listener on a port the app uses, so the process-safety rules must hold exactly (never stop by port, never touch the real `userData` or `~/Documents/GetWrite`); Task 19 depends on the packaged build having a way to avoid `~/Documents/GetWrite` (Task 18 flags it as a blocker if none exists); Task 13 may conflict with the "exactly one numeric export" guard and needs an explicit owner amendment; builds fail in git worktrees here (cause not established), so Tasks 1, 3 to 6 and 15 to 20 run only in the main checkout, one at a time, outside the command sandbox; Tasks 7 and 21 wait on the owner.

## Open Questions

- OQ-2, OQ-4 and OQ-5 are provisional in the spec and are finalized at Task 7; Tasks 13 and 14 are written for options the owner may decline, and the release-note or docs line for OQ-4 and OQ-5 is carried to the documentation stage, not built here.
- Task 9 leaves open, for the implementor to record and Task 7 to confirm, whether the readiness identity is a per-launch nonce the child echoes or the child's exit or bind state; the spec requires only the behaviour.
