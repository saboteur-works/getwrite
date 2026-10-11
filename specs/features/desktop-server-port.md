# Feature Spec: Change the desktop server's default port

> **Scope note:** this is larger than the 500-word guideline for a feature
> spec, as the Feature 75 to 77 specs it follows are. The code change is one
> constant; the weight is in decisions and verification. Source: Feature 80 in
> `specs/product/getwrite.features.md` (amended with the Gate 0 decision,
> 2026-10-10); `specs/product/getwrite.md`; the merged code of Features 75 to
> 77; `specs/features/home-network-sharing.md` (FR-25, FR-31),
> `paired-device-management.md` and `paired-device-limits.md` for conventions.
> Features 75 to 77 are merged to `main` and not released.
>
> **Release hold (Owner decision, Gate 2, 2026-10-09; updated 2026-10-10):**
> nothing containing Feature 75 is released until Feature 80 is merged. With
> Features 76 and 77 merged, this feature is the last blocker. The reason is
> that a paired device saves the desktop's address, host and port.
>
> **Gate 0 decision (Owner decision, Gate 0, 2026-10-10), settled and not
> reopened:** the desktop app's bundled server port becomes **7340** (was
> 3000). Saboteur apps take blocks of ten: GetWrite owns 7340 to 7349, the next
> Saboteur app starts at the base plus 10 (7350), and so on. The final suites
> include `pnpm test:e2e`.
>
> **Screening, stated as facts and not as guarantees (done by the pipeline
> lead).** On the owner's Mac, `/etc/services` (a local copy of the registry,
> not the live IANA list) registers no TCP service in 7340 to 7349, 7350 to
> 7359, 7370 to 7379 or 7380 to 7389; 7365 is registered in the 7360 block and
> 7391 to 7395 and 7397 in the 7390 block. 7340 is not among the common
> development defaults (3000, 4200, 5000, 5173, 6006, 7000, 8000, 8080, 8888,
> 9000) and lies between 1024 and 32767. That 7340 is absent from Chrome's and
> Firefox's restricted-port lists is from memory and **not checked**; FR-21
> requires loading the app in real browsers.
>
> **Provenance labels.** **Read, not run** means read in code or a file, cited,
> and not executed; every code fact below is read, not run, unless it says
> otherwise. **Measured** means a recorded run; nothing in this document was
> run by its author. **Unverified** means not established; the check that would
> settle it is named. **Hypothesis** marks a cause or a prediction no
> experiment has discriminated. A measurement is a fact; a cause is a
> hypothesis, and no claim here goes beyond what a check shows.
>
> **Measurements first, then a stop (FR-23).** Several decisions below depend
> on what the code does when the port is busy, on whether a paired device's
> cookie survives a port change, and on whether browsers accept the port. The
> plan measures first and reports to the owner before the dependent work.

## Overview

The desktop app starts a bundled server on port 3000, a common default that
other local software also uses. The owner has decided it becomes 7340, inside
a block of ten (7340 to 7349) that GetWrite owns, with the next Saboteur app
starting at 7350. A writer who shares projects on the home network pairs other
devices against the desktop's address, host and port, so the change must be
merged before any release containing sharing. This feature changes the value
in its single source, establishes by a recorded search every other place that
holds or assumes 3000, decides each one (several decisions are open below),
and verifies in the real desktop app and real browsers that the window, the
displayed addresses, the Host allowlist and pairing all work on the new port.

## Goals

- The desktop app's bundled server listens on 7340, and the window loads from `http://localhost:7340`, with sharing off and with sharing on.
- Every address the app shows and every check the server makes follows the one port source; no consumer of the desktop port keeps 3000 by accident.
- Every place that holds or assumes 3000 is listed from a recorded search and has a recorded disposition: follows the source, changed, deliberately left, or historical.
- The behaviour when the port is already in use, for already-paired devices, and for a device still opening the old address is measured and decided, not assumed.
- The block-of-ten convention is recorded where other Saboteur apps will find it, and the change is verified by checks that cannot harm the owner's running app.

## Non-goals

- Choosing the port value or the block scheme: decided at Gate 0.
- Hosted web deployment behaviour: the hosted app is a different deployment from the desktop server (OQ-3 asks only whether its local-development fallbacks move).
- The native Android shell, which has no HTTP server in the native path; and the Android app as a client of the desktop (a later feature, by standing decision).
- TLS, a redirector listening on 3000, or any new network listener.
- Rewording working-copy strings (reviewed in one later copy pass, by standing decision).
- Editing recorded measurements in older specs and experiments files to say 7340.

## User stories

- US-1: As a writer who shares my projects on my home network, I want to have the desktop app serve on port 7340 so that the address I give my other devices is not a generic default shared with other local software.
- US-2: As a writer who shares my projects on my home network, I want to have every displayed address and every server address check use the same port so that the address I type on my phone is the one the app accepts.
- US-3: As a writer who has already paired a device, I want to know what happens to that device when the port changes so that I am not left with a phone that fails without explanation.
- US-4: As a writer launching the desktop app, I want to be told plainly if its port is already taken so that I never see a blank window or another program's page presented as GetWrite.
- US-5: As a maintainer of several Saboteur apps, I want to have the block-of-ten port convention recorded where the next app's author will find it so that ports do not collide and the offset rule is not rediscovered.
- US-6: As a maintainer who holds a release, I want to have the change verified in the real desktop app and real browsers by checks that never touch my running app or my data so that the release hold can be lifted on evidence.
- US-7: As a developer, I want to know which ports development mode, the hosted-auth fallbacks and the scripts use after the change so that nothing silently disagrees with the desktop's port.

## Functional requirements

FR-1: The constant `PORT` in `electron/src/server-config.ts` (read, not run: line 11, `export const PORT = 3000;`) MUST become 7340. No other source file in `electron/src/` MUST gain a numeric port literal. The port is a fixed constant (OQ-7, resolved): no environment override and no writer-facing setting MUST be added. [US-1]

FR-2: The existing guard tests MUST still pass unchanged: `electron/tests/server-config.test.ts` (exactly one numeric export, `PORT`; `main.ts` assigns no numeric literal to a port; read, not run). One test pinning the value 7340 MAY be added in that file only, because Feature 75 FR-25 forbids any other test depending on the value. [US-1]

FR-3: Each consumer of the desktop port MUST keep reading it from the single source, and a unit test MUST show it with a port other than 3000 or 7340 passed in as input. The consumers, read, not run: the server's `PORT` env (`electron/src/main.ts` line 173); the window load, retry and readiness URLs (lines 732, 738, 745); the navigation guard (line 683); the IPC sender checks (lines 292, 300, 304); the window-secret installation (line 782); the sharing status port (line 313) and `candidateAddresses(interfaces, port)` in `electron/src/sharing/addresses.ts`. Task 8 MUST also handle the inventory's finding (read, plus one measured `URL` check, Node v24.15.0): `electron/tests/device-ipc.test.ts` and `electron/tests/limits-ipc.test.ts` build a "lookalike port" sender origin as `http://localhost:${PORT}1/`, which with 7340 is `http://localhost:73401/`, not a valid port; `new URL` rejects it, so `isTrustedSender` refuses it for the parse error and not for the origin comparison the test names. Those cases MUST be rewritten so they still exercise a valid lookalike origin (a valid port that differs from `PORT`, derived from the input port, not from string concatenation). [US-2]

FR-4: The server's own port MUST continue to come from its `PORT` env, which the main process sets, and not from a constant or the request. (Read, not run: `frontend/src/lib/sharing/gate.ts` line 158 calls `parseServerPort(env.PORT)` and refuses every request when it is missing or not a plain decimal in 1..65535; `host-allowlist.ts` builds accepted names as `<name>:<port>`; `same-origin.ts` compares `Origin`/`Referer` to `Host` and has no port constant.) A test MUST show a Host of `<lan-ip>:<PORT>` accepted and the same name on another port refused, with `PORT=7340`. [US-2]

FR-5: The task list MUST begin with a recorded search for 3000 used as a port, in a new `specs/features/desktop-server-port/experiments.md`: the exact command, its full output, and a classification of every hit as (a) follows the single source, (b) hard-coded elsewhere, (c) implicit default with no literal (for example `next dev` and `next start` with no `PORT`, which default to 3000: Hypothesis from Next's documented behaviour, to be settled by reading the dev scripts and by FR-12's run), (d) historical record, or (e) unrelated (a duration, a word count, a test count). The search MUST cover source, tests, docs, workflows, scripts and `specs/`, and MUST also look for ports written without the literal. The list in this spec below is from a search made while writing it and is a starting point, not the record. [US-7]

FR-6: Hard-coded elsewhere, from that search (read, not run), each needing a recorded disposition under FR-24: `frontend/src/lib/auth/auth-server.ts` line 273 and `frontend/better-auth.config.ts` line 86 (`http://localhost:3000` when `BETTER_AUTH_URL` is unset); `frontend/app/api/_tenant/with-storage-context.ts` lines 155 and 165 (the same fallback for the allowed Origin); tests asserting those fallbacks (`frontend/tests/unit/auth-server.test.ts` line 265, `better-auth-cli-config.test.ts` line 61); `README.md` line 106 (the fallback, documented); `scripts/hosted-smoke/smoke.mjs` line 36 and its README; `docs/api/openapi.yaml` lines 9 and 25; `demo/seed.mjs`, `demo/playwright.demo.config.ts` and `demo/README.md` (the dev server on 3000); `CLAUDE.md` line 219 (the Electron section says 3000); `docs/features/home-network-sharing.md` lines 73 and 173 (examples in recorded measurements); `.github/workflows/linux-appimage-smoke.yml` lines 67, 94 and 138; `cli/src/qa/server.ts` and `cli/tests/qa/server.test.ts` (a comment and a throwaway occupier on 3000; the harness picks a free port itself); the scripts under `specs/features/paired-device-limits/scripts/`. Test files that use 3000 only as a fixture value passed in as input (the gate, same-origin, host-allowlist and pair-route tests, `host-allowlist.cases.json`, `electron/tests/addresses.test.ts`, `window-secret.test.ts`, `navigation-guard.test.ts`) follow FR-25 of Feature 75 and MUST pass unchanged. [US-7]

FR-7: The linux AppImage smoke workflow MUST NOT be pointed at 7340 on the strength of this feature alone (OQ-9, resolved). Read, not run: it downloads the published releases 1.8.0 and 2.0.0 (`gh release download getwrite-v${{ matrix.version }}`) and probes `http://localhost:3000`; those builds were released with 3000 and the workflow tests them. The only workflow change MUST be a comment near its "nothing may answer on :3000" check (`.github/workflows/linux-appimage-smoke.yml`, around line 138) saying that a future matrix entry for a build on 7340 needs its own probe port; no probe, matrix or step is changed. The disposition is recorded under FR-24. [US-7]

FR-8: The scripts under `specs/features/paired-device-limits/scripts/` are historical records. Read, not run: they refuse to run when port 3000 has a listener and `electron-limits.mjs` line 81 sets `BASE` to `http://127.0.0.1:3000`, so against a build with 7340 they would test the wrong address. They MUST NOT be edited by this feature (OQ-8, resolved); the new experiments file MUST say they are not valid against the new port and why. [US-6]

FR-9: Before any code change, the plan MUST record baselines on `main` (or this branch before the edit): the frontend, electron, CLI, typecheck, lint, knip, `pnpm test:sharing-smoke` and `pnpm test:e2e` results, each with its command and counts. For reference only, the feature list records for Feature 77 frontend 6434 passed and 1 skipped, desktop 384, CLI 144, sharing smoke 28 checks with 0 failures, e2e 214 passed and 1 skipped; those figures were reported, not re-run by this author. [US-6]

FR-10: Port in use, today's behaviour, by reading first. The task MUST record what the code does when something already listens on the app's port, and then measure it (FR-22). Read, not run: the server is forked with `PORT` in its env (`main.ts` lines 173, 209); readiness (`electron/src/sharing/server-readiness.ts`, lines 49 to 53) polls the local origin every 500 ms for 30 s and resolves on any status below 500, sending the window secret header on each poll, with no check that the responder is the child it forked; a child exit raises the "Server exited unexpectedly" screen (`main.ts` line 815 and following); `requestSingleInstanceLock` hands focus to a running instance and quits the duplicate. Measured (Task 3, 2026-10-10, unchanged app on 3000, dev mode in a copied tree, sharing off, one run per variant; `experiments.md` "Port in use today (3000)"): a foreign listener on `::` answering 200 was loaded into the window and the window header reached it on every readiness poll; the forked child's failed bind (`EADDRINUSE`, exit 1) was reported only as `Server exited unexpectedly (code 1)` with no port named; with a listener bound to `127.0.0.1` the dev server bound the wildcard address beside it, nothing failed, and the window showed the foreign page for the whole run (cause of that coexistence: not established); the foreign page on the local origin received the desktop bridge and passed the main process's trusted-sender check. The packaged server child and sharing on were not measured. [US-4]

FR-11: Owner decisions (OQ-1 = (a), Gate 3, 2026-10-10; scope confirmed at the Task 7 stop, 2026-10-10). The app MUST satisfy all of (a) to (d), and there MUST be no fallback port, so the displayed addresses, the Host allowlist, the window secret's target origin and a paired device's saved address never change with the launch. [US-4] (a) Before forking the server the app MUST check that nothing is listening on the port on any address (at least `127.0.0.1`, `::1`, and the wildcard `0.0.0.0` and `::`) and, if something is, MUST refuse to start the server and show a plain message naming the port. Motivation (Task 3, measured): a listener on `127.0.0.1` and the app's dev server on the wildcard address coexisted and nothing failed; the cause of that coexistence is not established. (b) Readiness MUST accept only the server the app itself forked, by a per-launch value the server echoes, and the per-launch window secret MUST NOT be sent to anything before that is confirmed. Motivation (Task 3, measured): the window header reached a foreign listener on every readiness poll (1 of 1, 1 of 1, 61 of 61, 1 of 1 across four runs), readiness resolved on a foreign 200, and the readiness check did not know the child's state. (c) The window MUST load the local origin only after that confirmation, so a foreign page is never loaded into a window that has the desktop bridge. Motivation (Task 3, measured): a foreign 200 page was loaded into the window and, on the local origin, received the desktop bridge and passed the trusted-sender check. (d) Readiness polling MUST stop when the forked server exits, and each poll MUST have a timeout. Motivation (Task 3, measured): with a listener that accepted connections and never answered, polling continued, with the header, 61 times and after the exit page was shown.
The value the server echoes needs the smallest server-side addition under `frontend/`; it MUST NOT change the gate's classification rules, MUST NOT be usable as an oracle for the window secret, and MUST be covered by the existing route-enumeration and no-device-route tests or by an explicit, justified exception. All behaviours MUST be covered by tests at the lowest level that can show them (pure readiness, probe-decision and message logic in plain modules, since `main.ts` cannot be imported outside Electron); the pre-fork check MUST be a pure decision over probe results so it is testable without sockets. The packaged server child (`utilityProcess.fork`) was not measured in Task 3; Task 19 does it.

FR-12: Development mode MUST follow OQ-2 (resolved, Owner decision, Task 7 stop, 2026-10-10): `pnpm electron:dev` follows the constant (it already inherits `PORT`) and plain `pnpm dev` and `pnpm start` stay on 3000; there is no separate development port. Accepted cost: a dev desktop app and a packaged app both want 7340; whether the two can otherwise run together was not measured. Read, not run: `pnpm electron:dev` runs `electron dist/main.js`, whose `startServer` spawns `pnpm dev` in `frontend/` with the same env including `PORT` (`main.ts` lines 224 to 228), and `cli/src/qa/server.ts` documents that `next dev` honours `PORT`; plain `pnpm dev` and `pnpm start` run `next dev` with no port argument (`package.json`, `frontend/package.json` line 6). The disposition of each of `pnpm dev`, `pnpm start`, `pnpm electron:dev` and the demo scripts MUST be recorded, and a run MUST show which port a started dev server actually listens on. [US-7]

FR-13: Hosted-only behaviour follows OQ-3 (resolved, confirmed by the owner, Gate 3, 2026-10-10): the hosted-auth fallbacks (`auth-server.ts`, `better-auth.config.ts`, `with-storage-context.ts`) stay at `http://localhost:3000`, and those files and the tests that assert them MUST be left unchanged, and the hosted web app MUST NOT be affected by this feature. (Read, not run, from the project notes: with hosted auth inactive `with-storage-context.ts` skips its session and Origin checks, and sharing and hosted auth never run together, so the desktop server does not reach these fallbacks; this MUST be re-read from the code during the task, not relied on.) [US-7]

FR-14: Cookie scope, measured. The task MUST measure, in a real browser against a built server with a throwaway sharing directory, whether a device paired at `http://<lan-ip>:<port A>` is still treated as paired at `http://<lan-ip>:<port B>` with the same host, the same credential store and the same cookie. Measured (Task 5, 2026-10-10, Playwright Chromium 148.0.7778.96, headless, two instances of one build on two free ports sharing one credential store, requests from the host to its own LAN address, not a second device): a device paired at one port was treated as paired at the other, with one host-only cookie (no port in its scope) accepted against the same store; a never-paired context at the second port was sent to the pairing page. `localStorage` and `sessionStorage` were separate per port. This contradicts the project notes' statement that a port change means pairing again, which MUST NOT be repeated in any document. The result is for Chromium only; Android Chrome, Firefox and Safari were not checked, and the run did not separate whether the browser's cookie scoping or the shared store alone would suffice. Browser storage that is scoped by origin (for example `localStorage`) and the saved bookmark MUST be listed as separate items in the same record. [US-3]

FR-15: What happens to already-paired devices and to old `device-credentials.json` records follows OQ-4 (resolved, Owner decision, Task 7 stop, 2026-10-10): `device-credentials.json` MUST be left alone and no migration code MUST be written. One documentation line MUST say that a paired device normally stays paired on the new port (measured in Chromium only, Task 5, same store, requests from the host machine) and that if it does not, it is paired again; it MUST NOT say a device must pair again. The owner's Android check (FR-30) covers Android Chrome. No credential, cookie or code value MUST be printed or recorded (FR-27). [US-3]

FR-16: A device that opens the old address MUST be examined, not assumed: with nothing listening on 3000 (checked first), the record MUST state what a real Chromium and, by the owner, the Android phone's browser show. If a development server is also running on 3000 (OQ-2), the record MUST state whether it answers a request from the host's LAN address with project data, because the record of Feature 76 shows a `next dev` server did so with sharing off (measured then, from the host, not a second device; whether it predates Feature 75 was not checked). Measured (Task 6, 2026-10-10, Chromium 148): with nothing on 3000 both the LAN address and localhost gave `net::ERR_CONNECTION_REFUSED` (the text of a headed browser's error page was not captured); a `next dev` on 3000 with sharing off answered a request from the host to its own LAN address with status 200, no `x-getwrite-gate` header, and an empty project array (the projects folder was empty; whether it predates Feature 75 was not checked). What is done about it follows OQ-5 (resolved, Owner decision, Task 7 stop, 2026-10-10): one documentation line only, no listener or redirector on 3000, and no text in the sharing panel. [US-3]

FR-17: With sharing on, the Host allowlist MUST accept `<lan-ip>:7340`, `localhost:7340` and `127.0.0.1:7340` and MUST refuse `<lan-ip>:3000` and `localhost:3000`, shown against a built server started on a free port set through `PORT` and, separately, against the real app. A request sent from the host to its own LAN address is not a second-device result and MUST be labelled so. [US-2]

FR-18: With sharing on, every address shown in the desktop window (the status and settings surfaces) MUST end in `:7340`, and none MUST end in `:3000`, shown in the real Electron app in development mode and in an unpacked build, each with a throwaway `--user-data-dir` and a throwaway projects folder. [US-2]

FR-19: In the same two real-app runs, with sharing off and with sharing on, the window MUST load its content from `http://localhost:7340`, and a request to `http://localhost:3000` MUST NOT reach the app's server (checked only after confirming nothing else listens on 3000). [US-1]

FR-20: Pairing MUST be exercised end to end on the new port by loading `/pair` UNPAIRED in a real browser (Chromium through Playwright, a fresh browser context with no cookie) at `http://<lan-ip>:7340`, typing a pairing code obtained from the real app's own window flow, and reaching the paired application. This is required because Feature 77's pairing-page defect was found only that way and its scripted runs, which paired by a helper, did not show it; the run MUST also count main-frame navigations on the pairing page. [US-2]

FR-21: The port MUST be loaded in real browsers: Chromium (Playwright's build) for the window-equivalent page, the pairing page and an application page, and the owner's Android Chrome (FR-30). The result for each browser MUST state the browser, its version and whether the port was accepted; a browser or version not exercised (Firefox, desktop Chrome, Safari) MUST be recorded as "not checked", and the restricted-port statement in the scope note MUST stay labelled as unchecked memory for it. [US-1]

FR-22: Port in use MUST be measured twice, and each record MUST say which port it used and why. First, before the constant changes, today's mechanism on 3000 with a throwaway listener (valid for the mechanism, because the readiness and fork code is the same for any port; it says nothing about 7340 itself). Then again on the changed build on 7340. For the 7340 run: the task starts its own throwaway listener on 7340 (after confirming nothing else listens there), launches the real app in development mode and in an unpacked build against throwaway folders, and records what the window shows, whether the window loaded the listener's response, whether the listener received the window header (recorded as present or absent only, never its value), the app's exit and log lines, and what the sharing status reports. The listener MUST be stopped by its own recorded process id. Results go to the owner before FR-11's behaviour is built. [US-4]

FR-23: The plan MUST place the measurements (FR-5, FR-9, FR-10's reading, FR-14, FR-16, FR-21's browser result, FR-22) first, followed by a stop: the results are reported to the owner and no task that depends on an open question starts until the owner has answered it, as Features 75 and 77 did. [US-6]

FR-24: Every hit in FR-5's record MUST end with a disposition and a reason, and a test or check MUST exist for every disposition that is "changed". Dispositions "left" and "historical" need the reason only. [US-7]

FR-25: Documentation MUST be updated in the same change, with each statement dated and labelled read, measured or reported: `CLAUDE.md` (the Electron Shell section's port, and the sharing text if it states 3000); `docs/features/home-network-sharing.md` (a dated note giving the current value, leaving the recorded measurements as they were); the README and user-facing docs for any place that tells a writer an address; the `openapi.yaml` development base URL per the FR-12 disposition. The feature list's Feature 80 status is updated by the owner's process, not by the implementer. [US-5]

FR-26: Owner decision (OQ-6 = (b), Gate 3, 2026-10-10): the block-of-ten convention MUST be recorded as a new ADR in `docs/architecture/ADRs/` (`adr-023-...`, the next number after adr-022, following the existing ADR format) plus a line in `CLAUDE.md`. Each MUST state GetWrite's block (7340 to 7349), that the next Saboteur app starts at base plus 10 (7350), and that the Gate 0 screening was against a local `/etc/services` and not the live registry. A copy in a shared cross-repo location is the owner's own step, outside this feature and this repository, and is not made by the pipeline. [US-5]

FR-27: Process safety. Any task that starts a server or app MUST: check the app's port (7340, and 3000 when a development server may be involved) for a listener first and refuse to run if one exists; start servers on free ports it picks itself where the check does not need 7340; stop only the process ids it started and recorded, never by port and never a listener's parent; use throwaway user-data and projects folders; never read or write `~/Library/Application Support/getwrite-electron/`; and never print or record credentials, cookies, secrets or pairing codes. (On 2026-10-10 a pipeline script stopped every listener on port 3000, including the owner's running desktop app; PDM experiments, "A run that does not count, and a mistake".) [US-6]

FR-28: Nothing loaded at configuration time (`frontend/next.config.mjs`, vitest and eslint configs, `electron` build scripts) MAY import a TypeScript file or need a Node newer than 20; if the port is needed there it MUST be repeated with a guard test, as the fix in `0fe43651` did. [US-6]

FR-29: The final suites MUST be run against the FR-9 baselines and reported with counts: frontend `test:ci`, electron, CLI, typecheck for frontend and electron, lint, knip, `pnpm test:sharing-smoke` against a built standalone server (read, not run: `frontend/scripts/sharing-refusal-smoke.mjs` picks a free port itself and sets `PORT`, so it should not depend on 7340; to be shown), and `pnpm test:e2e` against Storybook on 6006. Any difference from baseline MUST be listed with its cause as measured or as unestablished. [US-6]

FR-30: The owner's manual check with the Android phone MUST be listed as a task the implementer cannot do: with sharing on, open `http://<lan-ip>:7340` on the phone, record what a phone paired before the change shows (this is FR-14's real-device counterpart), pair again if asked, and confirm an edit made on the phone appears on the desktop. It is reported by the owner and is not an observation of the pipeline. [US-3]

FR-31: A recording rule applies to every document this feature writes: state what was measured as fact, name no cause until an experiment has discriminated it from the alternatives, say which experiment would settle an unestablished cause, and claim nothing beyond what a check shows. Items not exercised MUST be listed as "Not verified". [US-6]

## Open questions

Gate 3 answers and the Task 7 stop answers (both 2026-10-10) are folded in; full text of the resolved ones is under "Resolved questions" below. The ids are kept contiguous. No question is open.

- OQ-1 (resolved): port in use at launch. Owner decision (a): refuse to start, plain message naming the port, no fallback port; the readiness check accepts only the forked server and the window secret is never sent to another process; see FR-10, FR-11, FR-22.

- OQ-2 (resolved, Task 7 stop): dev desktop app follows the constant; plain `pnpm dev` and `pnpm start` stay on 3000; no dev port; see FR-12, FR-16, FR-24.

- OQ-3 (resolved): hosted-auth fallbacks stay at `http://localhost:3000`; those files and their two tests are unchanged; see FR-6, FR-13, FR-24.

- OQ-4 (resolved, Task 7 stop): `device-credentials.json` left alone, no migration code, one documentation line; see FR-14, FR-15, FR-30.

- OQ-5 (resolved, Task 7 stop): one documentation line, no listener on 3000, no panel text; see FR-16, FR-25.

- OQ-6 (resolved): the convention is recorded as a new ADR plus a line in `CLAUDE.md`; see FR-25, FR-26.

- OQ-7 (resolved): the port is a fixed constant; see FR-1, FR-2, FR-3.

- OQ-8 (resolved): the `paired-device-limits` scripts are left as they are; see FR-8.

- OQ-9 (resolved): the AppImage smoke workflow keeps probing 3000, with a comment only; see FR-7, FR-24.

## Resolved questions (Gate 3, 2026-10-10)

Format follows `specs/features/paired-device-limits.md`. OQ-3, OQ-7, OQ-8 and OQ-9 were "resolved from evidence" at triage and confirmed by the owner (Owner decision, Gate 3, 2026-10-10). OQ-1 and OQ-6 were decided by the owner (Owner decision, Gate 3, 2026-10-10).

- OQ-1 (resolved): What should happen when the port is already in use at launch? Resolution: option (a). The app refuses to start the server and shows a plain message naming the port; there is no fallback port. Independently, the readiness check must accept only the server the app itself forked. Evidence (read, not run): `electron/src/sharing/server-readiness.ts` lines 49 to 53 resolve on any status below 500 and send the window secret header on every poll; `main.ts` raises "Server exited unexpectedly" only on a non-zero exit. Hypothesis, not yet measured: a foreign listener answering below 500 passes readiness and receives the header (FR-22 measures it, first on 3000 with a throwaway listener to establish the mechanism, then again on 7340 after the constant changes). The window secret must never be sent to a process the app did not start. The mechanism (for example a per-launch nonce the child echoes, or the child's exit or bind state) is a design choice for the task; the size of that work is to be confirmed by the FR-22 measurement. Impact: FR-10, FR-11, FR-22.
- OQ-3 (resolved): Do the hosted-auth fallbacks stay at 3000? Resolution: yes (option a). `auth-server.ts`, `better-auth.config.ts`, `with-storage-context.ts` and their two tests are unchanged. Impact: FR-6, FR-13, FR-24.
- OQ-6 (resolved): Where is the block-of-ten convention recorded? Resolution: option (b), a new ADR in `docs/architecture/ADRs/` (next number after adr-022, existing ADR format) plus a line in `CLAUDE.md`. A copy in a shared cross-repo location is the owner's own step, outside this run. Impact: FR-25, FR-26.
- OQ-7 (resolved): Fixed constant or configurable? Resolution: option (a), a fixed constant. Impact: FR-1, FR-2, FR-3.
- OQ-8 (resolved): Are the `specs/features/paired-device-limits/scripts/` files left alone? Resolution: option (a). They are left as they are, and the new experiments file states they are not valid against the new port. Impact: FR-8.
- OQ-9 (resolved): Does the AppImage smoke workflow change? Resolution: it keeps probing 3000 because it tests the published 1.8.0 and 2.0.0 releases; a comment near its "nothing may answer on :3000" check says a future matrix entry for a 7340 build needs its own probe port. No other workflow change. Impact: FR-7, FR-24.

## Resolved questions (Task 7 stop, 2026-10-10)

Owner decisions at the Task 7 stop (the owner's answer to the lead's recommendation was "your recs"), recorded in `specs/features/desktop-server-port/experiments.md`, section "Owner decisions at the Task 7 stop". Format follows the Gate 3 list above.

- OQ-2 (resolved): Does development mode move to 7340, stay on 3000, or take its own port? Resolution: the dev desktop app (`pnpm electron:dev`) follows the constant to 7340, since it already passes `PORT` to its dev server; plain `pnpm dev` and `pnpm start` stay on 3000; no separate dev port (7341 is not built). Known cost, accepted: a dev desktop app and a packaged app both want 7340; whether the two can otherwise run together was not measured. Evidence: Task 4 (`experiments.md`, "Dev commands and coexistence"). Impact: FR-12, FR-16, FR-24.
- OQ-4 (resolved): What happens to already-paired devices and old credential records? Resolution: leave `device-credentials.json` alone; no migration code; one documentation line saying a paired device normally stays paired on the new port (measured in Chromium only, Task 5) and otherwise pairs again. Evidence: Task 5 measured a host-only cookie accepted on a second port against the same store. Impact: FR-14, FR-15, FR-30.
- OQ-5 (resolved): What should a device that still opens `:3000` see? Resolution: one documentation line only; no listener or redirector on 3000; no text in the sharing panel. Evidence: Task 6 (connection refused in Chromium 148 with nothing on 3000). Impact: FR-16, FR-25.

## Out of scope (deferred)

- The Android app as a client of the desktop server (standing decision: later).
- A review of the working-copy strings of the sharing features (one later copy pass).
- Per-device or remote management of limits, TLS, headless delivery, and the two-device last-save-wins measurement and statement (Features 78 and 79).
- The `next dev` server listening beyond loopback with sharing off, found during Feature 76 and tracked separately; FR-16 only records whether it matters to the old address.
- Assigning ports to other Saboteur apps, beyond recording the rule.
