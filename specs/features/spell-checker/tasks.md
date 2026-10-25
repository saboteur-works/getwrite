# Tasks: A built-in spell checker in the editor (Feature 95)

Source spec: `specs/features/spell-checker.md` (FR-1..FR-45, US-1..US-6, AC-1..AC-20; Gate 3 approved 2026-10-25; OQ-1..OQ-13 all resolved and not reopened). Parent: `specs/product/getwrite.features.md` Feature 95; product requirement FR-78 / US-33 in `specs/product/getwrite.md`. Branch suggestion: `feat/spell-checker`, main checkout. Format precedent: `specs/features/stale-saves-and-index-races/tasks.md`. Granularity: story points (1/2/3/5/8).

Shape of the work:
- Tasks 1-2: `pnpm build:native` once in the main checkout; fix its failure first, in its own commit, only if it fails (OQ-9 a).
- Tasks 3-20: Part 0, the engine spike (FR-1..FR-10). Task 3 is an OWNER HALT for the package install. Task 16 is an OWNER HALT for the Android run. Task 18 is an OWNER HALT for the engine choice. Task 19 is an OWNER HALT for the package swap. No task after 20 starts before Task 18 is recorded (FR-9, AC-1).
- Tasks 21-27: storage and store (FR-11..FR-16, FR-19 read). Engine-independent.
- Tasks 28-36: the checker (FR-17..FR-26). Tasks 28, 29, 30 and 33 are engine-independent; Task 31 is the ONLY task whose content depends on the engine choice; Tasks 32 and 36 verify against it.
- Tasks 37-49: attributes, menu, switch, Spelling tab (FR-27..FR-41).
- Tasks 50-56: licence notice, offline checks, docs, final suites (FR-42..FR-45, AC-17..AC-20).

Engine-agnostic seam. Everything after Task 20 is written against one interface, defined in Task 30: a worker message protocol (`init`, `check { version, blocks }`, `suggest { word }`, replies carrying the request `version`, and an `error` reply) and an `SpellEngine` adapter type with `load(): Promise<void>`, `isCorrect(word): boolean` and `suggest(word, max): string[]`, plus a test double. Only Task 31 (the adapter, the worker's import of the chosen package, its dictionary or WebAssembly assets) and the text of the licence notice (Task 50) depend on whether `nspell` or `harper.js` is chosen. Where a task's content differs by choice, its Notes say so.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Work in the main checkout on branch `feat/spell-checker`. No worktrees; do not switch branches. Implementors do not commit and do not push; the orchestrator commits, naming the task ID only. Leave the pipeline's uncommitted edits to `specs/product/getwrite.features.md` and `specs/product/getwrite.md` alone.
- NEVER run `pnpm add`, `pnpm install`, `pnpm remove` or any command that changes `frontend/package.json` or `pnpm-lock.yaml`. Package changes are the owner's step; a task that needs one stops at its HALT and reports the exact command.
- Throwaway data only. Spike documents are generated (FR-5, FR-2); tests and experiments use temp directories under `$TMPDIR` or the scratchpad. NEVER read, list or write the repo's `projects/`, `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite` or `~/Library/Logs/*`.
- Builds (`next build`, `pnpm build:native`) run in the main checkout only; they fail in worktrees here.
- Before any task that runs `pnpm test:e2e`, run `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` and record it. `pnpm test:e2e` builds and serves Storybook itself on :6006: never start `pnpm storybook` first; if 6006 is held, stop and report. Never stop a process the task did not start; stop only started pids, by pid. `pnpm test:e2e`, `adb`, Storybook and `next dev` may need to run outside the sandbox; retry outside before filing a bug. `adb` and the Android run are OWNER steps.
- Measurement vocabulary: every entry in `experiments.md` is MEASURED (observed in a run, stated as values: runs, counts, command, date), READ, not run, or UNMEASURED (with the reason). A measurement states what was observed; no cause is written for any value (CLAUDE.md: a measurement is a fact, a cause is a hypothesis).
- TDD (`docs/standards/testing.md`): write the named test first and show it failing for the stated reason, then passing. Extend an existing test file before creating one. Never use a prop on an in-project component without opening its source and stories first. Code follows `docs/standards/typescript-implementation.md`, `failure-visibility.md`, `security.md`, `accessibility.md`, `storage-context.md`. Red is never used for the underline or any alert (STYLING.md).
- Verification vocabulary, from `frontend/` unless stated: `pnpm typecheck`; `pnpm lint`; `pnpm exec vitest run <file>`; `pnpm test:ci`; `pnpm test:e2e`; from the repo root `pnpm knip`.
- Halt rule: if a task cannot meet its done condition, leave it unticked, record why, and report; do not work around it. Open Questions OQ-1..OQ-13 are resolved and are not reopened.

FR/AC coverage: FR-1: 3, 4, 19. FR-2: 5, 7, 20. FR-3: 6, 7. FR-4: 7, 9, 10, 11, 12, 16. FR-5: 5. FR-6: 6, 10, 11, 12, 17. FR-7: 8, 13, 17. FR-8: 9, 15, 16, 18. FR-9: 18. FR-10: 19, 20. FR-11: 21. FR-12: 22. FR-13: 21, 22. FR-14: 23. FR-15: 24, 25. FR-16: 27. FR-17: 29. FR-18: 29. FR-19: 26, 33. FR-20: 28. FR-21: 30, 31, 36. FR-22: 36. FR-23: 30, 31, 33. FR-24: 1, 2, 31, 32, 36, 53, 54. FR-25: 35. FR-26: 33, 45. FR-27: 17, 37. FR-28: 17, 38, 39. FR-29: 40, 41. FR-30: 41. FR-31: 42. FR-32: 43. FR-33: 34. FR-34: 9, 14, 34, 54. FR-35: 35, 36, 45. FR-36: 45. FR-37: 48. FR-38: 47. FR-39: 47. FR-40: 46, 49. FR-41: 44, 46, 49. FR-42: 50. FR-43: 50, 52. FR-44: 51. FR-45: 55. AC-1: 18, 20. AC-2: 2, 20. AC-3: 10, 15, 17. AC-4: 13, 17. AC-5: 9, 16. AC-6: 21, 22, 23. AC-7: 24, 25. AC-8: 26, 27, 33. AC-9: 28, 29. AC-10: 30, 36. AC-11: 1, 32, 52, 53, 54. AC-12: 35. AC-13: 37, 38, 39. AC-14: 40, 41, 42, 43, 44. AC-15: 14, 34, 36, 45. AC-16: 47, 48. AC-17: 44, 46, 49, 56. AC-18: 51, 52. AC-19: 55, 56. AC-20: 56.

### Task 1: Run pnpm build:native once and start experiments.md
**What:** Run `pnpm build:native` once in the main checkout and create `experiments.md` with an environment record and a "Native build" entry holding the exit code and, on failure, the error text verbatim.
**Files:** Creates `specs/features/spell-checker/experiments.md`. No source change.
**Done when:** `experiments.md` exists with an environment record (date, `git` HEAD, Node version, OS) and a "Native build" entry labelled MEASURED with the command, exit code and (if non-zero) the first error lines verbatim and no stated cause; or UNMEASURED with the reason if it could not be run.
**Depends on:** none
**Estimate:** 1
**Notes:** Satisfies FR-24 (OQ-9 a), AC-11 (the one-time build result). The documented failure is at `stories/Start/CreateProjectModal.stories.tsx` (cause not established, `frontend/CLAUDE.md:26`); record what is observed, do not name a cause. Run from `frontend/` in the main checkout. This and Task 2 are separate commits from the Part 0 commit so AC-2 holds.

**Done:** [ ]

### Task 2: Fix the build:native failure (conditional, own commit)
**What:** If Task 1 recorded a failure, fix it with the smallest change that makes `pnpm build:native` exit 0; if Task 1 passed, record N/A.
**Files:** Whatever file the recorded error names (documented: `frontend/stories/Start/CreateProjectModal.stories.tsx`); `specs/features/spell-checker/experiments.md` (result line).
**Done when:** `pnpm build:native` exits 0 and `experiments.md` records the second run as MEASURED; or Task 1 passed and this task records "N/A, build passed" with no source change. If the fix is not small or not understood, the task stops and reports a blocker with the recorded error; the native-output checks (Tasks 52, 53) are then recorded UNMEASURED.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-24, AC-2 (this fix is its own commit, so the Part 0 commit lists only Part 0 files). Test-first where a test applies; otherwise the build exit code is the test. Cause is a hypothesis until an experiment discriminates it: the commit message states the observed error and the change, not an assumed cause.

**Done:** [ ]

### Task 3: HALT, owner installs the engine packages
**What:** Stop and hand the owner the exact install command; resume only when the packages are present.
**Files:** None edited by the agent. The owner changes `frontend/package.json` and `pnpm-lock.yaml`.
**Done when:** The owner has run `pnpm --filter getwrite-frontend add -D nspell dictionary-en harper.js` and `ls frontend/node_modules` shows `nspell`, `dictionary-en` and `harper.js`; the agent has not run any pnpm add/install/remove.
**Depends on:** 2
**Estimate:** 1
**Notes:** OWNER HALT. Satisfies FR-1. Report the command verbatim to the lead and stop. If a types package is needed (Task 4 will find out; for example `@types/nspell`, name not verified), Task 4 reports a further command for the owner and halts on it. Nothing may import these packages before this task is done.

**Done:** [x]

### Task 4: Record installed versions, types need, package files and licences
**What:** Read the installed packages and record versions, whether a types package is needed, how each loads its data in a browser, WebAssembly size, and each package's licence expression and licence file text.
**Files:** `specs/features/spell-checker/experiments.md` (a "Packages" section).
**Done when:** `experiments.md` has, for `nspell`, `dictionary-en` and `harper.js`: the version from `pnpm list`, the licence expression exactly as in the installed `package.json`, the first line and copyright line of the installed licence file, how the data is loaded in a browser (read, not run), the WebAssembly or dictionary file sizes on disk, and whether a types package is needed (typecheck of a one-line import in the spike scope, or a stated reading), each labelled MEASURED or READ, not run. Any further install is written as an exact command for the owner and the task halts on it.
**Depends on:** 3
**Estimate:** 2
**Notes:** Satisfies FR-1 (versions and types need), feeds FR-42 and FR-8 (package-selection justification). `dictionary-en` licence may differ from `nspell`'s; record each separately.

**Done:** [x]

### Task 5: Spike fixture generator
**What:** Write the deterministic fixture generator for the 5k, 50k and 200k word documents with planted misspellings and made-up names.
**Files:** Create `specs/features/spell-checker/scripts/fixtures.mjs` (and its parameters block); a Vitest or Node check beside it.
**Done when:** Running the generator twice with the same seed yields byte-identical output for each of 5,000, 50,000 and 200,000 words; paragraphs are 80 to 150 words; one word in 50 is a single-character-edit misspelling and one word in 200 a repeated made-up proper name; the planted counts are printed; words are sampled from `dictionary-en`; the script imports no application module and reads no project folder; `experiments.md` states the generator parameters and planted counts (not the text).
**Depends on:** 4
**Estimate:** 3
**Notes:** Satisfies FR-2, FR-5. Seeded mulberry32 as `tests/entityHighlightBenchmark.test.ts:24`. Generated text goes to a git-ignored or `$TMPDIR` folder, not the tracked tree. `knip.json` ignores `specs/**`.

**Done:** [x]

### Task 6: Spike workers and message protocol for both engines
**What:** Write one dedicated Web Worker per engine (`nspell` with `dictionary-en`; `harper.js`) exposing load, check, suggest and a ready message with identical operations.
**Files:** Create `specs/features/spell-checker/scripts/worker-nspell.mjs`, `worker-harper.mjs`, `protocol.mjs`.
**Done when:** Each worker, driven from a Node or browser test, posts `ready` after load, returns the unknown words for a given text, and returns suggestions for a given word, with the same message shapes for both; timing uses `performance.now()` inside the harness; no application module is imported.
**Depends on:** 4
**Estimate:** 5
**Notes:** Satisfies FR-3, FR-6 (instrumentation). This is spike code and is deliberately separate from the Task 31 adapter, which is written after the choice. Nothing here may be placed under `app/`, `components/` or `src/`.

**Done:** [x]

### Task 7: Spike driver page, bundler and result block
**What:** Write the driver page that runs the full FR-6 sequence against each worker and prints one JSON result block, plus the esbuild bundling script writing to a throwaway folder.
**Files:** Create `specs/features/spell-checker/scripts/driver.html`, `driver.mjs`, `build.mjs`, `serve.mjs`; update `.gitignore` entry only if the output folder would otherwise be tracked (inside `specs/`).
**Done when:** `node specs/features/spell-checker/scripts/build.mjs` produces the bundle in a folder outside the tracked tree (or git-ignored); opening the page in Chromium runs: load cold and warm, suggestion time for a fixed list of 200 misspellings (p50 and p95, 5 repetitions), bytes transferred and decoded, memory after load and after the 200k check, check time per fixture size from a cold worker, re-check time of one edited paragraph, planted-versus-flagged and unplanted-flagged counts, the lowest Chrome version run; and prints one JSON block with environment fields (browser version, OS, Node, package versions, HEAD).
**Depends on:** 5, 6
**Estimate:** 5
**Notes:** Satisfies FR-2, FR-3, FR-4, FR-6. Built with `esbuild` already in the workspace (`android/scripts/build-harness.mjs` is the precedent); do not add a dependency. The server must serve with compression so transferred and decoded sizes differ honestly.

**Done:** [x]

### Task 8: Native-underline observation page (FR-7)
**What:** Write the test page of `contenteditable`, `<textarea>` and `<input>` variants (no attribute, `spellcheck="false"`, inside a `spellcheck="false"` container) all holding "recieve teh wrold".
**Files:** Create `specs/features/spell-checker/scripts/underline-page.html`, included in the Task 7 bundle.
**Done when:** The page renders the eight elements described in FR-7 (three bare, three with `spellcheck="false"`, a `contenteditable` and a `<textarea>` inside a `spellcheck="false"` container), each labelled by visible text, and is served by the Task 7 server.
**Depends on:** 7
**Estimate:** 2
**Notes:** Satisfies FR-7. An underline is not observable from the DOM; observations are screenshots plus one-line statements recorded in Task 13 and Task 17.

**Done:** [x]

### Task 9: Check android/harness can host a Web Worker; write the Android runbook
**What:** Determine whether the existing `android/harness` setup can host a Web Worker, record the result, and write the "Owner step: Android" runbook in `experiments.md`.
**Files:** `specs/features/spell-checker/experiments.md`; reads `android/scripts/build-harness.mjs`, `android/harness/harness-entry.ts`; MAY edit files under `android/harness` and `android/scripts/build-harness.mjs` when the spike requires it, each edit recorded in `experiments.md` (FR-10).
**Done when:** `experiments.md` has a "Web Worker in android/harness" entry (READ, not run, or MEASURED if run on a desktop WebView stand-in) stating the result; the "Owner step: Android" section lists the exact commands in order (build the harness, put it in the app's WebView through `android/harness`, install on the Pixel, run, copy the JSON result block, paste it into "Android results (pasted)", take the FR-7 screenshots, record `adb shell dumpsys meminfo works.saboteur.getwrite` output, record the System WebView version and the keyboard app, a `localStorage` write/reload/relaunch check for the Capacitor origin) and can be followed from a clean checkout; if the harness cannot host a Worker, the task stops and reports a blocker, not another method.
**Depends on:** 7, 8
**Estimate:** 3
**Notes:** Satisfies FR-8, AC-5, FR-4 (c), FR-34 (Capacitor persistence check). Resolved (owner, Gate 4): FR-10 allows Part 0 to edit files under `android/harness` and `android/scripts/build-harness.mjs` when the spike requires it; such an edit is recorded in `experiments.md` (file, change, reason) and is neither a blocker nor a scope violation. Only a harness that cannot host a Worker at all stops the task. This task writes the runbook only; the owner runs it in Task 16.

**Done:** [x]

### Task 10: Web measurements, localhost production build
**What:** Run the harness in Chromium against the localhost production-style server and record every FR-6 metric for both engines.
**Files:** `specs/features/spell-checker/experiments.md` (a "Hosted web, localhost" table).
**Done when:** The table has, per engine, every FR-6 metric as median, minimum, maximum and run count (at least 5 cold and 20 warm loads), each labelled MEASURED, with the environment record (browser version, OS, Node, package versions, HEAD); any cell with no value says UNMEASURED and why.
**Depends on:** 7
**Estimate:** 3
**Notes:** Satisfies FR-4 (a), FR-6, AC-3. Run the browser outside the sandbox if it fails inside it. Cold means caches and site data cleared. No cause is written for any value.

**Done:** [x]

### Task 11: Web measurements under a throttled network
**What:** Repeat the web load and download measurements under a throttled network profile and record them separately.
**Files:** `specs/features/spell-checker/experiments.md` (a "Hosted web, throttled" table).
**Done when:** The table records the profile used (name and its latency and bandwidth values), and load cold/warm and bytes transferred for both engines, labelled MEASURED, in a section separate from Task 10's; the other FR-6 metrics that do not depend on the network are cross-referenced, not duplicated.
**Depends on:** 10
**Estimate:** 2
**Notes:** Satisfies FR-4 (a) as resolved at OQ-5 (c), FR-6. The throttling method (DevTools or a CDP `Network.emulateNetworkConditions` call) is recorded.

**Done:** [x]

### Task 12: Desktop (Electron) measurements
**What:** Run the harness in the shipped Electron with the app's `webPreferences` and record every FR-6 metric for both engines.
**Files:** Create `specs/features/spell-checker/scripts/electron-main.mjs`; `specs/features/spell-checker/experiments.md` (a "Desktop" table).
**Done when:** The Electron version from `electron/package.json` is recorded; the throwaway main script opens a `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false` (`electron/src/main.ts:736-740`) and a throwaway `userData`; the table has every FR-6 metric per engine as median, min, max and runs, labelled; memory by `app.getAppMetrics()`; the size added to the install is recorded; `electron/` is not modified.
**Depends on:** 7
**Estimate:** 5
**Notes:** Satisfies FR-4 (b), FR-6, AC-3. Use a temporary `userData` directory under `$TMPDIR`, never the real one. The Electron window may need to run outside the sandbox.

**Done:** [x]

### Task 13: Native-underline observations on web and desktop
**What:** Open the Task 8 page in Chromium and in the Electron window and record what each underlines, with screenshot references.
**Files:** `specs/features/spell-checker/experiments.md` (an "Underlines" section); screenshots under `specs/features/spell-checker/screenshots/`.
**Done when:** For web and desktop the section states, for `contenteditable`, `<textarea>` and `<input>`, whether `spellcheck="false"` suppressed the native underline and whether an ancestor's attribute was inherited, each as a one-line MEASURED statement with a screenshot reference; if the underline is not rendered in the automated window (so cannot be observed), the entry says UNMEASURED with the reason and the owner is asked to observe it in Task 16's runbook.
**Depends on:** 8, 10, 12
**Estimate:** 3
**Notes:** Satisfies FR-7, AC-4. Resolved (owner, Gate 4): native spell underlines may not render in an automated browser or Electron window; that is accepted. Such rows are recorded UNMEASURED with the reason and the owner checks them by eye. State what is seen, not why.

**Done:** [x]

### Task 14: Electron localStorage persistence check
**What:** Check that a `localStorage` value written for the fixed desktop origin persists across two launches.
**Files:** `specs/features/spell-checker/scripts/electron-storage.mjs`; `specs/features/spell-checker/experiments.md`.
**Done when:** `experiments.md` records, MEASURED, whether a key written on the first launch (throwaway `userData`, origin `http://localhost:7340` served by a throwaway static server) is readable on the second launch; or UNMEASURED with the reason.
**Depends on:** 12
**Estimate:** 2
**Notes:** Satisfies FR-34 (persistence recorded), AC-15 (Electron persistence MEASURED or UNMEASURED). Do not touch the real desktop `userData`. Capacitor persistence is recorded from the Android runbook in Task 17.

**Done:** [ ]

### Task 15: Write up web and desktop results; leave the Decision section
**What:** Consolidate the web and desktop tables, add a labelled author Recommendation with the numbers it rests on, and add the empty Decision section and the FR-10 removal instructions.
**Files:** `specs/features/spell-checker/experiments.md`.
**Done when:** `experiments.md` has the environment record, one table per platform (web localhost, web throttled, desktop, Android placeholder reading "pending owner run"), every entry labelled, no cause stated; a "Recommendation (author's)" section citing the numbers; a "Decision" section containing empty fields for: engine chosen, any performance limit and what it limits (or "none"), minimum WebView or browser version, the `package-selection.md` justification for each shipping package, owner name and date; a note that the harness stays as the record and is runnable only for the engine whose packages remain installed; and the owner commands `pnpm --filter getwrite-frontend remove harper.js` / `pnpm --filter getwrite-frontend remove nspell dictionary-en` and the move-to-`dependencies` commands.
**Depends on:** 9, 10, 11, 12, 13, 14
**Estimate:** 5
**Notes:** Satisfies FR-8, AC-3 (web and desktop parts). The Decision section is left blank for the owner (OQ-129: no performance limit chosen in advance).

**Done:** [ ]

### Task 16: HALT, owner runs the Android harness on the Pixel
**What:** Stop and report that the run is halted on the "Owner step: Android" section of `experiments.md`; resume when the owner has pasted the results.
**Files:** None edited by the agent. The owner edits `experiments.md` ("Android results (pasted)", screenshots, `dumpsys meminfo` output).
**Done when:** The lead's report names `specs/features/spell-checker/experiments.md` section "Owner step: Android" and says the run is halted on it; and the owner has pasted the harness JSON block, the System WebView version, the keyboard app, the FR-7 observations and the `dumpsys meminfo` output into the file.
**Depends on:** 15
**Estimate:** 1
**Notes:** OWNER HALT. Satisfies FR-8 (Android is an owner step; OQ-6 b), FR-4 (c), AC-5. The agent never runs `adb`.

**Done:** [ ]

### Task 17: Fold Android results in; finish the spike's tables and facts
**What:** Transcribe the pasted Android block into the Android table, complete the FR-7 and `localStorage` entries, and state the facts later tasks need.
**Files:** `specs/features/spell-checker/experiments.md`.
**Done when:** The Android table has every FR-6 metric as median, min, max and runs (or UNMEASURED with the reason); AC-4 holds for all three platforms (suppressed or not for each of the three elements, inheritance, screenshot references; Android names the keyboard and what it did); Capacitor `localStorage` persistence is MEASURED or UNMEASURED; the lowest browser version each engine ran on is stated against `Chrome >= 67`; a one-line fact states whether all three platforms honoured inheritance (the FR-28 body backstop decision input, OQ-11) and whether Android showed a keyboard-level underline despite `spellcheck="false"` (FR-27 known gap, OQ-12).
**Depends on:** 16
**Estimate:** 3
**Notes:** Satisfies FR-6, FR-7, AC-3, AC-4; feeds FR-27, FR-28. State observations as facts, never a cause.

**Done:** [ ]

### Task 18: HALT, owner chooses the engine
**What:** Stop for the owner to fill the Decision section naming `nspell` or `harper.js`.
**Files:** None edited by the agent. The owner edits the Decision section of `experiments.md`.
**Done when:** The Decision section names the engine in the owner's words, with any performance limit (or "none"), the minimum WebView or browser version, the package-selection justification, and owner name and date. Until then `git grep -l "nspell\|harper"` over `frontend/components`, `frontend/src` and `frontend/app` prints nothing.
**Depends on:** 17
**Estimate:** 1
**Notes:** OWNER HALT. Satisfies FR-9, AC-1. No later task starts before this is recorded.

**Done:** [ ]

### Task 19: HALT, owner removes the unchosen packages and moves the chosen to dependencies
**What:** Stop for the owner to run the package swap.
**Files:** None edited by the agent. The owner changes `frontend/package.json` and `pnpm-lock.yaml`.
**Done when:** The owner has run `pnpm --filter getwrite-frontend remove <unchosen>` and `pnpm --filter getwrite-frontend remove <chosen>` then `pnpm --filter getwrite-frontend add <chosen>`; the chosen packages are in `dependencies`; the unchosen packages' names appear in neither `frontend/package.json` nor `pnpm-lock.yaml`.
**Depends on:** 18
**Estimate:** 1
**Notes:** OWNER HALT. Satisfies FR-10, FR-1. Report the exact commands for the chosen engine. The agent never runs them.

**Done:** [ ]

### Task 20: Verify Part 0 scope and the no-engine-import rule
**What:** Check the Part 0 diff scope and the package state, and record both.
**Files:** `specs/features/spell-checker/experiments.md` (a "Part 0 verification" entry).
**Done when:** `git diff --stat` of the Part 0 commit lists only files under `specs/features/spell-checker/`, `frontend/package.json` and `pnpm-lock.yaml`, plus any `android/harness` or `android/scripts/build-harness.mjs` edit recorded in `experiments.md` (the Task 1-2 commit is separate); `grep -c` of the unchosen packages' names in `frontend/package.json` and `pnpm-lock.yaml` is 0; `git grep -l "nspell\|dictionary-en\|harper"` over `frontend/components`, `frontend/src` and `frontend/app` prints nothing; the entry states that the harness is runnable only for the remaining engine.
**Depends on:** 19
**Estimate:** 1
**Notes:** Satisfies FR-10, FR-2, AC-1, AC-2. A tracked change under `android/harness` or `android/scripts/build-harness.mjs` is allowed by FR-10 and is not a deviation; check that each one is recorded in `experiments.md` and list them here.

**Done:** [ ]

### Task 21: Config keys, constants and types
**What:** Add `spellingProjectWords` and `spellingIgnoredWords` to the config schema and type, with the two bounds as named constants.
**Files:** `frontend/src/lib/models/schemas.ts`, `frontend/src/lib/models/types.ts`, `frontend/src/lib/models/project-spelling-core.ts` (constants only, or a small constants module); an existing schema test file.
**Done when:** A test shows `ProjectConfigSchema` parses a config with both keys as string arrays and with both absent (read as `[]` by consumers); the keys survive a parse of `project.json`; `MAX_SPELLING_WORD_LENGTH = 100` and `MAX_SPELLING_LIST_SIZE = 5000` are exported named constants; `pnpm typecheck` passes.
**Depends on:** 20
**Estimate:** 2
**Notes:** Satisfies FR-11, FR-13 (constants), AC-6 (the bounds are named constants). Shape follows `customNoiseWords` (`z.array(z.string().trim().min(1)).optional()`). Engine-independent.

**Done:** [ ]

### Task 22: Spelling core
**What:** Write `project-spelling-core.ts` with read, add, remove, ignore, unignore under `withMetaLock` and `updateProjectJson`, with word validation and list bounds.
**Files:** Create `frontend/src/lib/models/project-spelling-core.ts`; test `frontend/tests/projectSpellingCore.test.ts`.
**Done when:** Table-driven tests pass: add, remove, ignore and unignore are idempotent (no-op, not error); both lists returned by every mutation; no other `config` key and no other part of `project.json` changes (byte comparison); a word is trimmed and NFC-normalised; empty, whitespace-containing, control-character, 101-unit and non-string words throw `InvalidSpellingWordError`; the 5,001st word is refused with the list unchanged; case-folded duplicates are a no-op keeping the stored spelling; a word added to one list is not removed from the other; locked-access errors are rethrown unchanged; two overlapping adds of different words keep both in 20 of 20 repetitions.
**Depends on:** 21
**Estimate:** 5
**Notes:** Satisfies FR-12, FR-13, AC-6. Mirror `project-noise-words-core.ts:115-134` (including the `durable` option). Locale-independent lower-casing for the fold. Fail closed (`docs/standards/security.md`).

**Done:** [ ]

### Task 23: Spelling route
**What:** Write `app/api/project/spelling/route.ts` with GET and POST handlers mirroring the noise-words route.
**Files:** Create `frontend/app/api/project/spelling/route.ts`; test `frontend/tests/projectSpellingRoute.test.ts`.
**Done when:** Tests pass: `GET ?projectId=` returns both lists; `POST { projectId, action, word }` handles `add-word`, `remove-word`, `ignore-word`, `unignore-word`; a missing or non-UUID `projectId` answers 400 via `respondInvalidProjectId`; invalid JSON, unknown action, non-string word and invalid word answer 400; the 5,001st word answers 400 with the list unchanged; a locked project answers 401/409 through `withStorageContext`; `dynamic = "force-dynamic"`; no client path is accepted.
**Depends on:** 22
**Estimate:** 3
**Notes:** Satisfies FR-14, AC-6. Pattern: `app/api/project/noise-words/route.ts`. The route has no paired-device branch (a word-list write is not one of the five limits).

**Done:** [ ]

### Task 24: HTTP transport and response schema
**What:** Write the client transport `project-spelling.ts` on `createTransport` with the HTTP implementation and a validated response schema.
**Files:** Create `frontend/src/lib/api/project-spelling.ts`; modify `frontend/src/lib/api/schemas.ts`; test `frontend/tests/projectSpellingTransport.test.ts`.
**Done when:** Tests show: every method rejects on a network error, a non-2xx status and a malformed body; a failed read never resolves to empty lists; a malformed body is reported through `reportTransportValidationFailure`; a good response returns both lists.
**Depends on:** 23
**Estimate:** 3
**Notes:** Satisfies FR-15, AC-7 (HTTP half). Failure-visibility standard: failed must not equal empty.

**Done:** [ ]

### Task 25: Native backend, web stub, alias and CLAUDE.md
**What:** Add the native backend running the same core, its web stub, the `turbopack.resolveAlias` entry, and the `frontend/CLAUDE.md` update.
**Files:** Create `frontend/src/store/transport/native-project-spelling-backend.ts` and `.web-stub.ts`; modify `frontend/src/lib/api/project-spelling.ts`, `frontend/next.config.mjs`, `frontend/CLAUDE.md`; test `frontend/tests/nativeProjectSpellingBackend.test.ts`.
**Done when:** The native backend test runs the Task 22/23 table through `createNativeRunner`; the web build contains no `node:*` module from the new backend (the web stub is substituted, checked as `native-entity-graph-settings-backend` is); the `resolveAlias` entry for the literal import specifier exists at the position beside `next.config.mjs:275-278`; `frontend/CLAUDE.md` lists the new pair beside the note that `project-noise-words` is HTTP-only.
**Depends on:** 24
**Estimate:** 3
**Notes:** Satisfies FR-15, AC-7. Pattern: `src/lib/api/entity-graph-settings.ts:112-125` and `native-entity-graph-settings-backend.ts`. Builds only in the main checkout.

**Done:** [ ]

### Task 26: Rejecting alias-table read
**What:** Add a rejecting alias-table read beside the degrading `getEntityAliasTable`, leaving the existing read unchanged.
**Files:** `frontend/src/lib/api/entity-alias-table.ts`; test in the existing alias-table test file (extend, else `frontend/tests/entityAliasTableOrThrow.test.ts`).
**Done when:** The new read rejects on a network error, a non-2xx status and a malformed body; on success with an empty table it resolves to the empty table; `getEntityAliasTable` behaves exactly as before (its existing tests pass unedited); entity highlighting tests pass unedited.
**Depends on:** 20
**Estimate:** 2
**Notes:** Satisfies FR-19, AC-8 (the read half). Precedent: `listEntityRelationshipsOrThrow` in `entity-relationships.ts`; `frontend/CLAUDE.md` "Reject vs degrade is per site".

**Done:** [ ]

### Task 27: Spelling Redux slice
**What:** Add a slice holding the active project's two lists with a `not loaded | loaded | failed` state, loaded on project load and replaced by every mutation's response.
**Files:** Create `frontend/src/store/spellingSlice.ts`, its transport-service and guards per the slice pattern; modify `frontend/src/store/index.ts` (or the root reducer) and the project-load hook point (`projectsSlice.ts`); test `frontend/tests/spellingSlice.test.ts`.
**Done when:** Tests show: the lists load when the project loads; a failed load sets `failed` and never `loaded` with empty lists; a mutation replaces both lists with the response and applies no optimistic update; a failed mutation leaves the lists unchanged and rejects; two consumers selecting the slice see the same change at once; the alias-table "failed" state is held for the spelling path (from Task 26's read), distinct from an empty table.
**Depends on:** 24, 26
**Estimate:** 3
**Notes:** Satisfies FR-16, AC-8. Use the `getwrite-redux-slice` skill for the transport/guards split.

**Done:** [ ]

### Task 28: Pure word extraction
**What:** Write the engine-independent function that turns a ProseMirror document into checkable words with positions.
**Files:** Create `frontend/src/lib/spelling/extract-words.ts`; test `frontend/tests/spellingExtractWords.test.ts`.
**Done when:** Tests pass: a word split by bold is one word; text either side of a hard break, image, math or mention node is two words; text with the `code` mark, math nodes, tokens with a digit or underscore, single-letter tokens, URLs and emails are skipped; apostrophes (`'`, `’`) normalise to `'` and hyphens inside a token are kept (a hyphenated token is a whole word and, if later unknown, its parts); ALL-CAPS tokens of two or more letters are extracted; positions map back to document positions exactly.
**Depends on:** 20
**Estimate:** 5
**Notes:** Satisfies FR-20, AC-9. Unlike `collectTextBlocks` (`entityHighlightDecoration.ts:275-297`), non-text inline nodes are boundaries. Engine-independent: it never calls the engine.

**Done:** [ ]

### Task 29: Known-word set
**What:** Write the pure function that decides whether a word is known from the engine result, the two lists and the entity alias table.
**Files:** Create `frontend/src/lib/spelling/known-words.ts`; test `frontend/tests/spellingKnownWords.test.ts`.
**Done when:** Tests pass: a word on either list is known ignoring case; entity names and aliases are known ignoring case; `Aria's` and `Arias` are known when `Aria` is an entity term (using `POSSESSIVE_OR_PLURAL_SUFFIX`); a multi-word name or alias makes each of its words (split by the Task 28 rule) known; entity terms count with the `entities` flag off; nothing is written to either list after a check (the lists are unchanged by reference and value).
**Depends on:** 26, 28
**Estimate:** 3
**Notes:** Satisfies FR-17, FR-18 (OQ-1 a), AC-9. Reuses the exported `ATTACHED_CHAR_CLASS` and `POSSESSIVE_OR_PLURAL_SUFFIX` from `src/lib/models/entity-detection.ts`. The dictionary half is the engine's own rule via the seam of Task 30.

**Done:** [ ]

### Task 30: Engine seam, worker protocol, version discard, test double
**What:** Define the `SpellEngine` adapter type, the worker message protocol with document versions, the main-thread client, and a test double.
**Files:** Create `frontend/src/lib/spelling/engine.ts`, `worker-protocol.ts`, `spell-client.ts`, `spell-client.test-double.ts`; test `frontend/tests/spellClient.test.tsx`.
**Done when:** With a deferred test-double worker, tests show: a result for a document version older than the current is discarded; a result for the current version is delivered; the main thread never calls the engine; an engine that throws on `load` or crashes produces an `unavailable` event with a reason, never an empty result; a failed `suggest` produces a distinct `suggestions unavailable` result, not an empty list.
**Depends on:** 28, 29
**Estimate:** 5
**Notes:** Satisfies FR-21, FR-23, AC-10 (the discard and failure halves). This is the engine-agnostic seam; it must not import `nspell`, `dictionary-en` or `harper.js`.

**Done:** [ ]

### Task 31: Chosen-engine adapter, worker entry and assets (engine-dependent)
**What:** Implement the `SpellEngine` adapter for the chosen engine, the worker entry that imports it, and the dictionary or WebAssembly assets served from the app's origin.
**Files:** Create `frontend/src/lib/spelling/engine-<chosen>.ts`, `frontend/src/lib/spelling/spell.worker.ts`, any asset copy step; modify `frontend/next.config.mjs` only if the worker needs it; test `frontend/tests/spellEngineAdapter.test.ts`.
**Done when:** A test (Node or jsdom with the real package) shows the adapter flags a planted misspelling, accepts a correct word, and returns up to 5 suggestions for a misspelling; the worker builds in `next build`; no runtime request goes to a third-party host (asserted by a test over the emitted asset URLs); an engine load failure surfaces through the Task 30 `unavailable` path.
**Depends on:** 19, 30
**Estimate:** 5
**Notes:** ENGINE-DEPENDENT: the content differs by the Decision in `experiments.md`. For `nspell` + `dictionary-en`: load the `.aff` and `.dic` data as same-origin assets, a worker-side `nspell` instance, possible types package. For `harper.js`: its WebAssembly binary as a same-origin asset and its linter's spell-check output mapped to the seam (a lint-based API may return ranges and suggestions together, so `isCorrect` and `suggest` map onto it). Satisfies FR-21, FR-23, FR-24. The debounce interval is set from the Part 0 numbers and recorded here. If the Decision sets a performance limit, implement it as set. Verification on all three build outputs is Task 32.

**Done:** [ ]

### Task 32: Worker and assets in the web build, standalone server and native export
**What:** Verify the worker and its assets build and load in the Next.js build, the standalone output used by Electron, and the `build:native` export, and record the result.
**Files:** `specs/features/spell-checker/experiments.md`; build config files only if a failure requires a change.
**Done when:** `experiments.md` records, MEASURED, for each of the three outputs: the build exit code and whether the worker script and each asset file are present in the output; a failure is fixed or reported as a blocker; a native-output check that cannot run because Task 2 left the build failing is recorded UNMEASURED with the build error, not claimed.
**Depends on:** 2, 31
**Estimate:** 5
**Notes:** Satisfies FR-24, AC-11 (the build half). The Part 0 harness does not prove this. Builds only in the main checkout.

**Done:** [ ]

### Task 33: Checker availability state and toasts
**What:** Add the state recording why the checker is unavailable (lists failed, alias table failed, worker or engine failed, unsupported browser version) with a one-time toast per reason.
**Files:** Create `frontend/src/store/spellingAvailabilitySlice.ts` (or extend the Task 27 slice); modify the consumers; test `frontend/tests/spellingAvailability.test.ts`.
**Done when:** Tests show: while the lists or the alias table are not loaded, or have failed, the checker produces no decorations (a paused state with a reason); a failed alias fetch pauses the checker and the state carries the reason; a successful fetch of an empty table yields underlines as normal; each unavailable reason raises exactly one `toastService` toast and persists as a status line value until cleared; an engine failure is never rendered as "no misspellings".
**Depends on:** 27, 30
**Estimate:** 3
**Notes:** Satisfies FR-19, FR-23, FR-26, AC-8. The status line is rendered in Task 45.

**Done:** [ ]

### Task 34: App-wide switch module and hook
**What:** Write the `localStorage`-backed switch module beside `user-preferences.ts`, with a window event, a `storage` listener and a React hook.
**Files:** Create `frontend/src/lib/spellcheck-preference.ts` and `frontend/src/hooks/useSpellcheckEnabled.ts` (or beside `user-preferences.ts`); test `frontend/tests/spellcheckPreference.test.ts`.
**Done when:** Tests show: with no stored value the setting is on and nothing is written on read (no migration); writing off then reading returns off; a change dispatches the window event; a `storage` event for the key from another tab updates the hook; a `localStorage` that throws on write leaves the toggle working for the session and shows a toast that it was not saved; the value is read in an effect, not during server render (no hydration mismatch); nothing is stored in `project.json`.
**Depends on:** 20
**Estimate:** 3
**Notes:** Satisfies FR-33, FR-34, AC-15. Pattern: `APPEARANCE_CHANGED_EVENT` in `src/lib/user-preferences.ts:44,271-277`; the `storage` listener is new (none exists today). The setting is per origin; stated in Task 55.

**Done:** [ ]

### Task 35: ProseMirror decoration plugin and underline style
**What:** Write the view-only ProseMirror plugin that draws the misspelling underline, and its style.
**Files:** Create `frontend/components/Editor/Extensions/SpellCheckDecorationExtension.ts`; modify the editor stylesheet; test `frontend/tests/spellCheckDecoration.test.ts`.
**Done when:** Tests show: a decoration class sets no red colour token; the decoration set is empty when the switch is off or the lists are not loaded; a transaction test shows the document JSON is identical before and after the decorations are applied and `onUpdate` did not fire; decorations map through an edit; the style is wavy or dotted (not colour alone), meets 3:1 non-text contrast in light and dark mode, and has a forced-colors rule; no sidecar, index or file is read or written.
**Depends on:** 30, 33, 34
**Estimate:** 5
**Notes:** Satisfies FR-25, FR-35 (no work when off), AC-12. Pattern: `EntityHighlightDecorationExtension.ts` (plugin state is a `DecorationSet`, meta flag). Distinct in shape from entity, dialogue and mention-jump highlights.

**Done:** [ ]

### Task 36: Editor wiring, scheduling, caret word, source mode, version gate
**What:** Wire the plugin and client into `TipTapEditor` with debounce, incremental checks, a full check on resource load, the caret-word rule, source-mode pause, the switch ref and meta flag, and the minimum-browser gate.
**Files:** `frontend/components/TipTapEditor.tsx`, `frontend/src/lib/spelling/scheduler.ts`; tests `frontend/tests/tiptapEditorSpellcheck.test.tsx` (extend the existing editor test file where one exists).
**Done when:** Component tests show: after an edit the check runs after the debounce and re-checks only changed textblocks; a full check runs when a resource loads; the word the caret is at the end of is not underlined while typing and is underlined once the caret leaves; no check is requested in Markdown source mode and the checker recomputes when rich mode returns; turning the switch off removes underlines at once, requests no further check, and turning it on underlines open documents without reopening and loads the engine lazily; with the engine mocked to throw, no underline appears and the unavailable state is shown; below the engine's minimum browser version (from the Decision) the checker is off and the status reason says so, without raising the `Chrome >= 67` floor.
**Depends on:** 28, 29, 32, 33, 34, 35
**Estimate:** 8
**Notes:** Satisfies FR-21, FR-22, FR-24 (OQ-8 c), FR-35, AC-10, AC-15 (same-session off/on). Pattern: ref-backed getters at `TipTapEditor.tsx:397-401` and the effect dispatching the meta flag at `:586-596`. The editor test environment renders an HTML mock at `:339` and `:735`; use the component test harness already in use for entity highlighting. The debounce interval is the value recorded in Task 31. Content of the minimum-version check depends on the engine choice.

**Done:** [ ]

### Task 37: spellcheck="false" on the editor body
**What:** Add `spellcheck: "false"` to `EDITOR_SURFACE_ATTRIBUTES` so the editor body never uses the native checker.
**Files:** `frontend/components/TipTapEditor.tsx`; test extended in the existing editor test file.
**Done when:** A test asserts `spellcheck: "false"` on the exported constant and on a mounted editor in both switch states and when read-only; `autocapitalize="off"` is not added.
**Depends on:** 20
**Estimate:** 1
**Notes:** Satisfies FR-27, AC-13. Any Android keyboard-level underline despite the attribute is recorded in Task 17 and listed as a known gap in Task 55; other input attributes are added only if they do not change typing behaviour.

**Done:** [ ]

### Task 38: Input and Textarea default spellCheck={false}
**What:** Make the shared `Input` and `Textarea` default `spellCheck={false}` before `{...props}`.
**Files:** `frontend/components/common/UI/Input/Input.tsx`, `frontend/components/common/UI/Textarea/Textarea.tsx`; tests extended in their existing test files.
**Done when:** Rendered tests assert `spellcheck="false"` on both by default and that a caller prop overrides it.
**Depends on:** 20
**Estimate:** 2
**Notes:** Satisfies FR-28, AC-13. Open the component source and stories before touching props.

**Done:** [ ]

### Task 39: Raw inputs, scan test and conditional body backstop
**What:** Set `spellCheck={false}` on every remaining text-like `<input>` and `<textarea>` outside the wrappers, add the scan test, and add the `<body>` backstop only if Task 17 recorded inheritance on all three platforms.
**Files:** Files under `frontend/components/` and `frontend/app/` found by the scan (about 40 files by the spec's grep); `frontend/app/layout.tsx` (conditional); test `frontend/tests/unit/spellcheck-attribute-scan.test.ts`.
**Done when:** The scan test fails when a text-like `<input>` or any `<textarea>` without `spellCheck` is added to a fixture and passes on the tree (checkbox, radio, range, file, color and button-like types exempt; stories excluded); `MarkdownSourceView` still sets `spellCheck={false}` and is not decorated; `<body>` carries `spellCheck={false}` if and only if Task 17 states all three platforms honoured inheritance, and the explicit attributes are kept either way.
**Depends on:** 17, 38
**Estimate:** 5
**Notes:** Satisfies FR-28, AC-13. Wide but mechanical; the scan test is written first and shown failing on the real tree.

**Done:** [ ]

### Task 40: Flagged word under the pointer or caret
**What:** Make `EditorContextMenu` find the flagged word from the event position or, for a keyboard-originated event, the caret, and freeze the range when the menu opens.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`; tests `frontend/tests/editorContextMenuSpelling.test.tsx` (new) leaving `editorContextMenu*.test.tsx` unedited.
**Done when:** Tests show: `handleContextMenu` receives the event; a pointer `contextmenu` resolves the flagged word under the pointer via `editor.view.posAtCoords`; a keyboard-originated `contextmenu` (no preceding `pointerdown` with button 2) resolves the flagged caret word; when `posAtCoords` finds no flagged word the caret word is used if flagged; the flagged range is frozen at open and later decorations do not retarget it; right-click elsewhere leaves exactly today's menu (the existing menu tests pass unedited). The pointer-versus-keyboard distinction is established by a test.
**Depends on:** 35
**Estimate:** 5
**Notes:** Satisfies FR-29, AC-14. The `pointerdown`-button-2 heuristic is unverified and the test must establish it (OQ-3). No new shortcut is added.

**Done:** [ ]

### Task 41: Suggestions request and the spelling group
**What:** Render the spelling group at the top of the menu for a flagged word: up to 5 suggestions under "Replace with", then Ignore and Add to project dictionary, a separator, then the existing items.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`; `frontend/stories/Editor/EditorContextMenu.stories.tsx`; test extended in `frontend/tests/editorContextMenuSpelling.test.tsx`.
**Done when:** Tests show: suggestions are requested from the worker for the one word under the click only, not for every flagged word; while pending a disabled "Loading suggestions" item shows; with none a disabled "No suggestions"; on failure a disabled "Suggestions unavailable" (distinct from "No suggestions"); at most 5 suggestions appear; the group is the first items and the existing items follow unchanged.
**Depends on:** 31, 40
**Estimate:** 3
**Notes:** Satisfies FR-29, FR-30, AC-14. Content of the suggestion call depends on the engine only through the Task 30 seam.

**Done:** [ ]

### Task 42: Replace with a suggestion
**What:** Apply "Replace with" as one ProseMirror transaction that preserves marks and the word's capitalisation.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`, `frontend/src/lib/spelling/apply-replacement.ts`; tests `frontend/tests/spellingApplyReplacement.test.ts`.
**Done when:** Tests show: one undo restores the original word; marks of the replaced text are kept; initial-capital and all-capital words carry that capitalisation to the suggestion; if the text at the frozen range no longer equals the flagged word the document is unchanged and a toast is shown; the item is disabled when the editor is read-only; focus returns to the editor without scrolling.
**Depends on:** 41
**Estimate:** 5
**Notes:** Satisfies FR-31, AC-14. Stale-offset precedent: Mention jump (`offset-resolver.ts`).

**Done:** [ ]

### Task 43: Ignore and Add to project dictionary
**What:** Wire Ignore and Add to the transport so the underline goes in every open editor at once, with no optimistic update.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`; tests extended in `frontend/tests/editorContextMenuSpelling.test.tsx`.
**Done when:** Tests show: Ignore and Add call the Task 24 transport with the word as the writer sees it; on success the slice updates and the word stops being underlined in every open editor of the project; on failure a toast shows the error and the word stays underlined; both are enabled in a read-only editor; no new paired-device limit exists.
**Depends on:** 27, 41
**Estimate:** 3
**Notes:** Satisfies FR-32, AC-14. On a paired device the project list is the only add target (OQ-128).

**Done:** [ ]

### Task 44: Context-menu a11y and the unedited-existing-tests check
**What:** Extend the context-menu a11y test with the spelling group and confirm the existing menu tests pass unedited.
**Files:** `frontend/tests/editorContextMenu.a11y.test.tsx` (extend); `frontend/stories/Editor/EditorContextMenu.stories.tsx` (spelling story opts into a11y).
**Done when:** The a11y test asserts the roles and names of the spelling items by role-and-name queries and runs `runAxe` clean in the flagged state; `git diff` shows the existing `editorContextMenu*.test.tsx` files unedited apart from the added a11y cases; the story passes at `parameters: { a11y: { test: "error" } }`.
**Depends on:** 42, 43
**Estimate:** 2
**Notes:** Satisfies FR-41 (menu part), AC-14, AC-17.

**Done:** [ ]

### Task 45: App Settings switch row with status line
**What:** Add the labelled spell-check switch row to `AppSettingsDialog`, shown on web, desktop and native, with the status line for unavailable states.
**Files:** Create `frontend/components/AppSettings/SpellcheckSetting.tsx`; modify `frontend/components/AppSettings/AppSettingsDialog.tsx`; test `frontend/tests/spellcheckSetting.test.tsx`.
**Done when:** Tests show: the row renders with the `Switch` component and a description that it applies to every project on this device; it is on by default; toggling off removes underlines in an open editor and toggling on restores them (through the Task 34 hook); an unavailable reason from Task 33 is shown as a status line with the reason; the row is shown regardless of platform (unlike `KeepRunningSetting`).
**Depends on:** 33, 34
**Estimate:** 3
**Notes:** Satisfies FR-36, FR-26 (status line), FR-35, AC-15. Open `KeepRunningSetting.tsx` and the `Switch` source and stories before using props.

**Done:** [ ]

### Task 46: Switch story and a11y test
**What:** Add the switch row's Storybook story and a11y test.
**Files:** Create `frontend/stories/AppSettings/SpellcheckSetting.stories.tsx`, `frontend/tests/a11y/spellcheckSetting.a11y.test.tsx`.
**Done when:** The story exercises on, off and unavailable states with an interaction test, opts into `parameters: { a11y: { test: "error" } }` and passes; the a11y test runs `runAxe` clean in the on, off and unavailable states and asserts the switch by role and name.
**Depends on:** 45
**Estimate:** 2
**Notes:** Satisfies FR-40, FR-41, AC-17.

**Done:** [ ]

### Task 47: Spelling tab component
**What:** Write `SpellingSettingsTab` showing the two lists with counts, sorted words, empty states, remove buttons and focus handling.
**Files:** Create `frontend/components/Layout/SpellingSettingsTab.tsx`; test `frontend/tests/spellingSettingsTab.test.tsx`.
**Done when:** Tests show: "Project dictionary" and "Ignored words" each show a count and words sorted ignoring case with an empty-state sentence; each remove button's accessible name contains the word and the list (for example "Remove teh from ignored words"); removing replaces the list from the response and un-ignores the word in an open editor at once; a failed load shows a load-failed message and not the empty-state sentence; a failed remove shows an inline `role="alert"` message and leaves the list unchanged; after removal focus moves to the next word's remove button, else the previous, else the list heading; all controls are keyboard operable.
**Depends on:** 27
**Estimate:** 5
**Notes:** Satisfies FR-38, FR-39, AC-16. Pattern: `NoiseWordsSettingsTab.tsx` (`Trash2`, per-word `aria-label` at `:180`). No "add a word" field (non-goal).

**Done:** [ ]

### Task 48: Register the Spelling tab
**What:** Add the "Spelling" tab to `ProjectSettingsDialog` after "Writing Goals" and before "Noise Words".
**Files:** `frontend/components/Layout/ProjectSettingsDialog.tsx`; `frontend/tests/projectSettingsDialogWritingGoalsTab.test.tsx` (edit the full-list assertion at `:92-102` only).
**Done when:** The tab appears after Writing Goals and before Noise Words; its panel is `forceMount` and renders only when `projectId` is set; the order assertion at `:206-214` passes unedited; the full-list assertion at `:92-102` is edited to include "Spelling" and that single edit is recorded in the commit message.
**Depends on:** 47
**Estimate:** 2
**Notes:** Satisfies FR-37, AC-16.

**Done:** [ ]

### Task 49: Spelling tab story and a11y test
**What:** Add stories and an a11y test for the Spelling tab in all four states.
**Files:** Create `frontend/stories/Layout/SpellingSettingsTab.stories.tsx`, `frontend/tests/a11y/spellingSettingsTab.a11y.test.tsx`.
**Done when:** The stories (empty, populated, load failed, remove failed, stubbing `globalThis.fetch` as `NoiseWordsSettingsTab.stories.tsx` does) have interaction tests and `parameters: { a11y: { test: "error" } }` and pass; the a11y test runs `runAxe` clean in the four states and asserts the tab, each remove button and the list headings by role and name.
**Depends on:** 47
**Estimate:** 3
**Notes:** Satisfies FR-40, FR-41, AC-17.

**Done:** [ ]

### Task 50: Licence notice file, public copy and Electron entry
**What:** Write `THIRD_PARTY_SPELLCHECK.txt` at the root, an identical copy under `frontend/public/`, and the `electron-builder.yml` `extraResources` entry.
**Files:** Create `THIRD_PARTY_SPELLCHECK.txt`, `frontend/public/THIRD_PARTY_SPELLCHECK.txt`; modify `electron/electron-builder.yml` after the fonts entry at `:24-25`.
**Done when:** The root and public files are identical; the file names each package that ships (the chosen engine and its dictionary or data) with its installed version, its licence expression exactly as in its installed `package.json`, its copyright line from its installed licence file, and each distinct licence text once; it names no package that does not ship; `electron-builder.yml` has `from: ../THIRD_PARTY_SPELLCHECK.txt` / `to: THIRD_PARTY_SPELLCHECK.txt` with a comment.
**Depends on:** 19
**Estimate:** 2
**Notes:** ENGINE-DEPENDENT: the notice text is written after the engine choice and depends on which packages remain in `dependencies` (Task 4 recorded their licences). Satisfies FR-42, FR-43. It is a second file, not the fonts file. `electron/` is edited here only for the one `extraResources` line (intended, owner decision at Gate 4; AC-20 allows exactly that one added line); the Electron suite stays unchanged.

**Done:** [ ]

### Task 51: Licence notice test
**What:** Write `third-party-spellcheck.test.ts` modelled on `third-party-fonts.test.ts`.
**Files:** Create `frontend/tests/unit/third-party-spellcheck.test.ts`.
**Done when:** The test passes and asserts: the file exists at the root and the public path; the two are identical; it names every shipped spell-check package in `frontend/package.json` `dependencies` with its installed version and the first line of its installed licence file; each distinct licence text appears once; it names no package absent from `dependencies`; `electron/electron-builder.yml` contains the `extraResources` entry. It fails if a listed package is removed from the file.
**Depends on:** 50
**Estimate:** 2
**Notes:** Satisfies FR-44, AC-18.

**Done:** [ ]

### Task 52: Licence file present in the four outputs
**What:** Check `THIRD_PARTY_SPELLCHECK.txt` is present in the web build output, `.next/standalone/frontend/public/`, the packaged Electron app's resources, and `frontend/out/`, and record each.
**Files:** `specs/features/spell-checker/experiments.md`.
**Done when:** `experiments.md` records, per output, the path checked and PRESENT (MEASURED) or UNMEASURED with the build error; a native-output check that cannot run is recorded UNMEASURED, not claimed.
**Depends on:** 2, 32, 51
**Estimate:** 3
**Notes:** Satisfies FR-43, AC-18, AC-11 (UNMEASURED recorded where applicable). Packaged Electron output uses `pnpm electron:package` per the font feature's precedent (`specs/features/font-picker-and-typography-inputs/experiments.md` Task 25); builds only in the main checkout.

**Done:** [ ]

### Task 53: Offline check on built web and packaged desktop
**What:** Verify the checker underlines a planted misspelling with the network off in a built web app and in the packaged desktop app.
**Files:** `specs/features/spell-checker/experiments.md`.
**Done when:** `experiments.md` records, MEASURED or UNMEASURED with the reason, for the built web app (after load, network off) and the packaged desktop app, that a planted misspelling is underlined and that no request went to a third-party host (network log); no project folder of the owner is touched (throwaway workspace).
**Depends on:** 36, 32
**Estimate:** 3
**Notes:** Satisfies FR-24, AC-11. Use a throwaway workspace and `userData`; never the real ones.

**Done:** [ ]

### Task 54: HALT, owner checks the phone offline
**What:** Stop for the owner to confirm on the Pixel, with the network off, that a planted misspelling is underlined, and to record Capacitor `localStorage` persistence of the switch key.
**Files:** None edited by the agent. The owner edits `experiments.md` (a short "Phone offline" entry).
**Done when:** `experiments.md` records the owner's observation for the phone as MEASURED or UNMEASURED with the reason, including whether the switch setting persisted across a relaunch.
**Depends on:** 53
**Estimate:** 1
**Notes:** OWNER HALT. Satisfies AC-11 (phone), FR-24, FR-34 (Capacitor persistence). The agent never runs `adb`; give the owner the exact steps.

**Done:** [ ]

### Task 55: User doc, CLAUDE.md, glossary and release-note text
**What:** Write `docs/features/spell-checker.md`, update the Code Map and glossary, and draft the release-note text.
**Files:** Create `docs/features/spell-checker.md`, `specs/features/spell-checker/release-note.md`; modify `frontend/CLAUDE.md` (Code Map), `CLAUDE.md` (glossary).
**Done when:** The doc describes the checker, the two lists, the entity rule (including the `entities`-flag-off staleness), the switch and its per-device scope (per origin; a paired device or second browser has its own setting; a cleared profile reverts to on), and the known gaps (no user list; lists not in export or compile; native-checker behaviour per platform as measured in Task 17, including any Android keyboard-level underline or suggestion; ALL-CAPS acronyms checked and cleared with one Ignore or Add); `frontend/CLAUDE.md` Code Map and root glossary list the new modules and terms; `release-note.md` states as known gaps that words cannot yet be kept across projects (Feature 96) and any Android keyboard gap, for use as the commit and PR text.
**Depends on:** 44, 46, 49, 52, 54
**Estimate:** 3
**Notes:** Satisfies FR-45, AC-19. Status of the release and merge belongs in `specs/product/getwrite.features.md`, not these files.

**Done:** [ ]

### Task 56: Final suites
**What:** Run every final suite from `frontend/` and record the results.
**Files:** `specs/features/spell-checker/experiments.md` (a "Final suites" entry).
**Done when:** `pnpm typecheck`, `pnpm lint`, `pnpm test:ci`, `pnpm test:e2e` (after the `lsof` check for 7340, 3000 and 6006), and from the repo root `pnpm knip` (new web-stub and spike packages accounted for) all exit 0, and the CLI and Electron suites are unchanged (the one `extraResources` line in `electron/electron-builder.yml` from Task 50 is the only permitted change under `electron/`, per AC-20); each result and exit code is recorded; the PR text names the missing user list as a known gap.
**Depends on:** 55
**Estimate:** 3
**Notes:** Satisfies AC-20, AC-17 (`pnpm test:e2e`), AC-19 (PR text). A new context requirement on a component needs a Storybook decorator (e2e). `pnpm test:e2e` runs outside the sandbox.

**Done:** [ ]

## Summary
- Total tasks: 56
- Total estimated effort: 173 story points
- Critical path: 1 → 2 → 3 → 4 → 6 → 7 → 12 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24 → 27 → 33 → 35 → 36 → 53 → 54 → 55 → 56
- Risks: Task 2 is conditional and its cause is not established (the documented failure's cause is unknown; if it is not small, Tasks 32 and 52 record UNMEASURED). Four owner HALTs (Tasks 3, 16, 18, 19) plus the phone check (Task 54) set the elapsed time more than any code task. Task 9 may need a tracked edit under `android/` that FR-10 forbids; Task 13 may be unable to observe native underlines in an automated window. Task 31 is engine-dependent and Task 36 (8 points) carries the most integration risk (debounce, incremental checks, caret word, source mode, version gate in one editor file). Task 39 is wide (about 40 files). Task 40's pointer-versus-keyboard `contextmenu` heuristic is unverified.

## Open Questions
- Task 9 (raised by this breakdown, not by the spec): FR-8 and OQ-6 b require the Android spike to use `android/harness` (`android/scripts/build-harness.mjs`, `android/harness/harness-entry.ts`), but FR-10 says Part 0 changes no file outside `specs/features/spell-checker/`, `frontend/package.json` and `pnpm-lock.yaml`. If hosting the spell harness needs a tracked edit under `android/`, which rule wins? **Resolved (Owner decision, Gate 4, 2026-10-25):** Part 0 MAY edit files under `android/harness` (and `android/scripts/build-harness.mjs` if needed) when the spike requires it; each edit is recorded in `experiments.md`. FR-10 and AC-2 amended in the spec; Tasks 9 and 20 updated, so this is neither a blocker nor a scope violation.
- Task 13 (raised by this breakdown): native spell underlines may not render in an automated browser or Electron window, so the web and desktop FR-7 rows may need to be owner observations. Task 13 records UNMEASURED with the reason rather than guessing. **Resolved (Owner decision, Gate 4, 2026-10-25):** Accepted. Task 13 records those rows as UNMEASURED with the reason, and the owner checks them by eye.
- Task 50 (raised by this breakdown): the spec says `electron/electron-builder.yml` gains an entry (FR-43), which edits a file under `electron/`; the final-suites requirement says the Electron suite stays unchanged. The task treats the one `extraResources` line as intended and the suite as unaffected. **Resolved (Owner decision, Gate 4, 2026-10-25):** FR-43's one `extraResources` line in `electron/electron-builder.yml` is intended. AC-20 reworded in the spec to allow exactly that one added line; Tasks 50 and 56 updated.
