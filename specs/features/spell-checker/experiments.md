# Spell checker experiments

Labels: MEASURED = observed by running the command; READ = taken from reading code or docs.

## Environment record

- Date: 2026-10-25
- `git rev-parse HEAD`: 89ac0f443d64cb1aa60c9620609bcf76528be7fa (branch feat/spell-checker)
- `node --version`: v24.15.0
- `uname -a`: Darwin Jedais-MacBook-Pro.local 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:15 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T6041 arm64
- `sw_vers`: macOS 26.5.1 (build 25F80)
- Run inside the Bash sandbox (not retried outside it).

## Summary comparison (Task 15)

Consolidation of the detailed sections below; the Android column was filled in Task 17 from the pasted JSON and the files in `screenshots/`. Every value is copied from the section named in its row and carries that section's label (MEASURED unless marked). Cells read `median (min to max), n`. No cause is stated for any value. The detailed sections remain the record.

| Metric | Engine | Web localhost (Chromium 148) | Web throttled (Fast 3G-like) | Desktop (Electron 34.5.8, Chromium 132) | Android (Pixel 7 Pro) |
| --- | --- | --- | --- | --- | --- |
| Cold load, ms | nspell | 48.6 (38.3 to 77.0), n=5 | 1,160.0 (1,154.7 to 1,171.0), n=4 | 51.4 (46.2 to 63.7), n=5 | 189.5, n=1 (first load of the run; `firstLoadWasCold` true; no network on Android) |
| Cold load, ms | harper.js | 430.4 (425.8 to 691.7), n=5 | 76,514.2 (76,438.7 to 76,653.4), n=4 | 458.8 (446.2 to 486.5), n=5 | 1,425.5, n=1 (same) |
| Warm load, ms | nspell | 45.8 (35.1 to 72.6), n=20 | 36.9 (33.4 to 66.7), n=8 | 47.6 (43.7 to 57.4), n=20 | 190.7 (154.7 to 274.9), n=20 |
| Warm load, ms | harper.js | 437.1 (422.8 to 842.3), n=20 | 76,447.5 (76,433.3 to 76,583.1), n=8 | 456.4 (437.8 to 489.4), n=20 | 1,412.4 (1,379.0 to 1,750.7), n=20 |
| Bytes transferred, cold | nspell | 200,562 (n=5) | 200,562 (n=4) | 200,562 (n=5) | UNMEASURED (`loads[].transferred` is 300 on every load; Capacitor asset loads, not network transfers; not meaningful) |
| Bytes transferred, cold | harper.js | 15,170,508 (n=5) | 15,170,508 (n=4) | 15,170,508 (n=5) | UNMEASURED (same) |
| Bytes transferred, warm | nspell | 0 (n=20) | 0 (n=8) | 0 (n=20) | UNMEASURED (same) |
| Bytes transferred, warm | harper.js | 15,146,600 (n=20) | 15,146,600 (n=8) | 15,146,600 (n=20) | UNMEASURED (same) |
| Bytes decoded, cold | nspell | 593,296 | UNMEASURED (not recorded under throttle) | 593,296 | UNMEASURED (`loads[].decoded` is 0 on every load; same reason) |
| Bytes decoded, cold | harper.js | 40,426,224 | UNMEASURED (not recorded under throttle) | 40,426,224 | UNMEASURED (same) |
| Suggestion p50, ms (200 calls) | nspell | 0.675 (0.580 to 1.140), n=25 | UNMEASURED (not run under throttle) | 0.730 (0.650 to 0.920), n=25 | 2.0 (1.9 to 2.6), n=5 repetitions of one run |
| Suggestion p50, ms (200 calls) | harper.js | 0.250 (0.165 to 1.670), n=25 | UNMEASURED (not run under throttle) | 0.190 (0.170 to 0.995), n=25 | 0.7 (0.7 to 3.5), n=5 repetitions of one run |
| Suggestion p95, ms | nspell | 1.080 (0.875 to 1.785), n=25 | UNMEASURED | 1.220 (1.005 to 1.940), n=25 | 3.0 (2.9 to 4.1), n=5 repetitions of one run |
| Suggestion p95, ms | harper.js | 0.285 (0.180 to 2.340), n=25 | UNMEASURED | 0.220 (0.195 to 1.945), n=25 | 0.8 (0.8 to 5.7), n=5 repetitions of one run |
| Check 5,000 words from cold worker, ms | nspell | 3 (2 to 5), n=5 | UNMEASURED | 2 (2 to 2), n=5 | 9.6, n=1 |
| Check 5,000 words from cold worker, ms | harper.js | 564 (554 to 1,144), n=5 | UNMEASURED | 646 (618 to 683), n=5 | 1,966, n=1 |
| Check 50,000 words, ms | nspell | 16 (15 to 27), n=5 | UNMEASURED | 14 (14 to 19), n=5 | 71, n=1 |
| Check 50,000 words, ms | harper.js | 8,965 (8,898 to 15,597), n=5 | UNMEASURED | 9,794 (9,549 to 10,039), n=5 | 28,972.9, n=1 |
| Check 200,000 words, ms | nspell | 67 (62 to 112), n=5 | UNMEASURED | 64 (58 to 97), n=5 | 224.8, n=1 |
| Check 200,000 words, ms | harper.js | 72,193 (71,234 to 128,024), n=5 | UNMEASURED | 74,933 (74,479 to 79,744), n=5 | 247,753.4, n=1 |
| Re-check one 136-word paragraph, ms | nspell | 0.05 (0.04 to 1.16), n=50 | UNMEASURED | 0.06 (0.04 to 0.15), n=50 | 0.7 (0.6 to 2.3), n=5 |
| Re-check one 136-word paragraph, ms | harper.js | 16.41 (13.04 to 27.89), n=50 | UNMEASURED | 18.41 (14.49 to 23.48), n=50 | 52.3 (45.3 to 55.1), n=5 |
| Memory after load, MB | nspell | 10.66 (10.66 to 10.69), n=5 (page, `measureUserAgentSpecificMemory`) | UNMEASURED | UNMEASURED (`measureUserAgentSpecificMemory` threw `SecurityError`) | UNMEASURED (`measureUserAgentSpecificMemory` was not run: `uasMemory` false, `uaSpecificBytes` null; see the PSS rows) |
| Memory after load, MB | harper.js | 165.59 (165.58 to 165.59), n=5 (page) | UNMEASURED | UNMEASURED (same) | UNMEASURED (same) |
| Memory after checking 200,000 words, MB | nspell | 12.38 (12.36 to 12.39), n=5 (page) | UNMEASURED | UNMEASURED (same) | UNMEASURED (same) |
| Memory after checking 200,000 words, MB | harper.js | 278.50 (278.50 to 278.52), n=5 (page) | UNMEASURED | UNMEASURED (same) | UNMEASURED (same) |
| Memory, peak minus blank page, all processes, MB (`app.getAppMetrics()`) | nspell | not applicable | not applicable | 96.9 (78.9 to 100.5), n=3 | not applicable |
| Memory, peak minus blank page, all processes, MB (`app.getAppMetrics()`) | harper.js | not applicable | not applicable | 466.0 (436.1 to 466.6), n=3 | not applicable |
| Worker JS heap | both | UNMEASURED (not available in the worker) | UNMEASURED | UNMEASURED (same) | UNMEASURED (worker `jsHeapUsed` null in the JSON) |
| Memory, app PSS (`dumpsys meminfo`), KB; covers both engines together, not separable | both | not applicable | not applicable | not applicable | menu page 179,664 (`meminfo-1-menu.txt`); highest of 72 successful 15 s samples during the run 227,438 (`meminfo-2-running.txt`); after the run 198,326 (`meminfo-3-after.txt`) |
| Planted misspellings flagged, 5,000 / 50,000 / 200,000 words (unpunctuated fixtures) | nspell | 100 of 100 / 992 of 1,000 / 3,974 of 4,000; 0 unplanted flagged | UNMEASURED | identical to web localhost | 100 of 100 / 992 of 1,000 / 3,974 of 4,000; 0 unplanted flagged |
| Planted misspellings flagged, 5,000 / 50,000 / 200,000 words (unpunctuated fixtures) | harper.js | 0 of 100 / 0 of 1,000 / 0 of 4,000; 0 unplanted flagged | UNMEASURED | identical to web localhost | 0 of 100 / 0 of 1,000 / 0 of 4,000; 0 unplanted flagged |
| Lowest browser or runtime version run | both | Chromium 148.0.7778.96 only | same browser as web localhost | Chromium 132.0.6834.210 (Electron 34.5.8) only | Android System WebView (Chrome) 155.0.8059.43 only |

Other measured facts, with their sections:

- Native underline (section "Underlines", MEASURED): on web (Chromium 148) and desktop (Electron 34.5.8), `spellcheck="false"` suppressed the native underline on `contenteditable`, `<textarea>` and `<input>`, and a `spellcheck="false"` ancestor was inherited by the `contenteditable` and the `<textarea>` inside it. The `<input>` without the attribute was underlined while focused and not after focus moved on. Android (Task 17, section "Android underlines"): no underline was visible under "recieve teh wrold" in any of the 8 cases, with or without the attribute, so suppression and inheritance are not observable by underline there; Gboard's suggestion strip showed "wrold | world" in all 8 cases; typing was not tested (UNMEASURED).
- harper.js sentence-length experiment (section "Supplementary experiment: sentence length only", n=1 per cell, 5,000 and 50,000 words): with no full stops 0 of 100 and 0 of 1,000 planted misspellings flagged; with a full stop every 40, 20 and 10 words, 99 of 100 and 987 to 989 of 1,000; with a full stop every 5 words, 20 of 100 and 225 of 1,000. Unplanted words flagged 7 to 70 for harper.js and 0 for nspell. Cause: not established.
- Electron `localStorage` persistence (section "Electron localStorage persistence"): fixed origin `http://localhost:7340` UNMEASURED; stand-in origin `http://localhost:64313` MEASURED, value written on launch 1 was read on launch 2 (one run). Capacitor persistence (section "Capacitor localStorage"): MEASURED in the spike app only, origin `https://localhost`; the value written survived a page reload and `am force-stop` plus `am start` (one run). This does not show what the real app's origin would do.
- Size added to the install (section "Desktop (Electron)", computed from files in `frontend/node_modules`): nspell and dictionary-en 593,296 bytes loaded (554,848 dictionary plus 38,448 built worker script); harper.js 40,426,224 bytes loaded (40,205,397 for the two `.wasm` files plus 220,827 built worker script). Packaged-app size: UNMEASURED. Android: the spike app's debug APK was 23,556,938 bytes when built in Task 9 (section "Amended build, run here"); that is the size of the spike APK as a whole (Capacitor shell plus both engines), not the size either engine adds to the install, and the size of the APK installed on the Pixel was not re-measured.
- Native build (sections "Native build" and "Native build, second run"): first run exit 1 at type check; after the import-path edits in five story files, exit 0. `pnpm typecheck` exit 0; `pnpm lint` exit 0 with 392 warnings.

## Native build

MEASURED.

- Command: `pnpm build:native` (cwd `frontend/`)
- Exit code: 1
- Stage reached: `Compiled successfully in 8.0s`, then `Running TypeScript ...`, then `Failed to type check.`
- First error lines, verbatim:

```
Failed to type check.

./stories/Start/CreateProjectModal.stories.tsx:6:8
Type error: Cannot find module '../../../frontend/components/Start/CreateProjectModal' or its corresponding type declarations.
```

- Final lines, verbatim:

```
Next.js build worker exited with code: 1 and signal: null
[build-native-static] ERROR: `next build` exited with status 1.
 ELIFECYCLE  Command failed with exit code 1.
```

- Also printed (not necessarily related): `WARN Issue while reading "/Users/jedaisaboteur/.npmrc". EPERM: operation not permitted` and a Turbopack "3 warnings" block about an unexpected file in the NFT list (`./frontend/.native-build/next.config.mjs`).
- Cause: not established.

## Native build, second run

MEASURED.

- Command: `pnpm build:native` (cwd `frontend/`), run inside the Bash sandbox.
- Change 1 (file `frontend/stories/Start/CreateProjectModal.stories.tsx`, line 6):
  - old: `} from "../../../frontend/components/Start/CreateProjectModal";`
  - new: `} from "../../components/Start/CreateProjectModal";`
- Exit code after change 1 alone: 1. First error lines, verbatim:

```
Failed to type check.

./stories/Start/ImportDocxDialog.stories.tsx:4:30
Type error: Cannot find module '../../../frontend/components/Start/ImportDocxDialog' or its corresponding type declarations.
```

- Change 2: the same import-path edit (`../../../frontend/components/` to `../../components/`) in `frontend/stories/Start/ManageProjectMenu.stories.tsx`, `ImportDocxDialog.stories.tsx`, `StartPage.stories.tsx`, `ImportScrivenerDialog.stories.tsx`. These were the only other files under `frontend/stories` containing `../../../frontend/`.
- Exit code after changes 1 and 2: 0 (`Native static export produced at .../frontend/out`).
- `pnpm typecheck` (cwd `frontend/`, re-run 2026-10-25 with the three engine packages installed): exit code 0.
- `pnpm lint` (cwd `frontend/`, same run): exit code 0; `392 problems (0 errors, 392 warnings)`.
- Cause: not established.

## Packages

Installed in `frontend` as devDependencies by the owner (Task 3). Date 2026-10-25.

### nspell

- Version: 2.1.5. MEASURED (`pnpm list nspell dictionary-en harper.js`, cwd `frontend/`).
- Licence expression in installed `package.json`: `"MIT"`. MEASURED.
- Licence file `license`: first line `(The MIT License)`; copyright line `Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com>`. MEASURED.
- Browser data loading: READ, not run. `NSpell(aff, dic)` in `lib/index.js` takes the affix and dictionary as strings or buffers (a `{aff, dic}` object also accepted) and builds the checker in memory; it does no file or network reads itself. Entry `main: lib/index.js`, CommonJS, dependency `is-buffer ^2.0.0`.
- Size on disk: no WebAssembly or data file; package directory holds `lib/` (12 entries), `license`, `readme.md`, `changelog.md`. MEASURED (`ls -la`).
- Types package needed: yes. MEASURED. A throwaway file `frontend/spikeTypesProbe.ts` containing `import nspell from "nspell";` (plus the two imports below) was typechecked with `pnpm typecheck`; exit code 2, error `spikeTypesProbe.ts(1,20): error TS7016: Could not find a declaration file for module 'nspell'`. The package `package.json` has no `types` or `typings` field. The throwaway file was deleted afterwards. Registry facts for `@types/nspell`: version 2.1.6, licence MIT, last modified 2026-10-04, only dependency `@types/node`. MEASURED (registry lookup made by the lead, not by the implementor, 2026-10-25).
- Installed `@types/nspell`: 2.1.6. MEASURED (`pnpm list @types/nspell nspell dictionary-en harper.js`, cwd `frontend/`, devDependencies, installed by the owner).
- Licence expression in installed `@types/nspell/package.json`: `"MIT"`. MEASURED.
- Re-run of the type probe with `@types/nspell` installed (2026-10-25): throwaway `frontend/spikeTypesProbe.ts` importing `nspell`, `dictionary-en` and `harper.js` (one import each, plus one export line using them); `pnpm typecheck` exit code 0, no TS7016 for `nspell` reported. MEASURED. The probe file was deleted and confirmed absent.

### dictionary-en

- Version: 4.0.0. MEASURED (`pnpm list`).
- Licence expression in installed `package.json`: `"(MIT AND BSD)"`. MEASURED.
- Licence file `license`: first line `en_US Hunspell Dictionary`; copyright line `The collective work is Copyright 2000-2018 by Kevin Atkinson as well` (line 97, continues `as any of the copyrights mentioned below:`). MEASURED.
- Browser data loading: READ, not run. `index.js` is an ES module (`"type": "module"`, `exports: ./index.js`) that does top-level `await fs.readFile(new URL('index.aff', import.meta.url))` and the same for `index.dic` from `node:fs/promises`, exporting `{aff, dic}` as `Uint8Array`. It imports a Node built-in, so the files `index.aff` and `index.dic` would have to be fetched or bundled as assets for a browser. The package exports only `./index.js`.
- Sizes on disk: `index.dic` 551,762 bytes; `index.aff` 3,086 bytes. MEASURED (`ls -l`).
- Types package needed: no. MEASURED. `import dictionary from "dictionary-en";` typechecked in the same probe with no error reported for it; the package ships `index.d.ts` (`Dictionary = {aff: Uint8Array; dic: Uint8Array}`).

### harper.js

- Version: 2.13.0. MEASURED (`pnpm list`).
- Licence expression in installed `package.json`: `"Apache-2.0"`. MEASURED.
- Licence file `LICENSE`: first line `                                 Apache License` (leading whitespace as in the file); copyright line `Copyright 2024 Automattic Inc.` (line 189, in the appendix template). MEASURED.
- Browser data loading: READ, not run. ES module package (`"type": "module"`), dependency `fflate ^0.8.2`. Exports `.`, `./binary`, `./slimBinary`, `./binaryInlined`, `./slimBinaryInlined`. `dist/binary.js` sets the binary URL as `new URL("harper_wasm_bg.wasm", import.meta.url).href` (a separate fetched file); the `*Inlined` entries embed the WebAssembly as a `data:application/wasm;base64,` URL inside the JavaScript file. `BinaryModule-S5UABkWQ.js` holds the module implementation.
- Sizes on disk: `dist/harper_wasm_bg.wasm` 20,252,229 bytes; `dist/harper_wasm_slim_bg.wasm` 19,953,168 bytes; `dist/binaryInlined.js` 27,003,210 bytes; `dist/slimBinaryInlined.js` 26,604,484 bytes; `dist/index.js` 152,598 bytes. MEASURED (`ls -l`).
- Types package needed: no. MEASURED. `import { WorkerLinter } from "harper.js";` typechecked in the same probe with no error reported for it; `package.json` `exports` carry `types` entries (`./dist/index.d.ts` etc.).

### Types need, summary

- The single probe run reported one error (nspell, TS7016). dictionary-en and harper.js imports reported none. MEASURED.
- `pnpm typecheck` with the probe removed (2026-10-25): exit code 0.
- `pnpm typecheck` with `@types/nspell` installed and the probe removed (2026-10-25): exit code 0. MEASURED.

## Fixture generator

MEASURED (2026-10-25, Node v24.15.0). Script: `scripts/fixtures.mjs`; check: `node scripts/fixtures.check.mjs` (5 tests, 5 pass; first run before the script existed failed with `ERR_MODULE_NOT_FOUND` for `fixtures.mjs`). Generated text is written to `$TMPDIR/spell-fixtures` by default (`--out DIR`), not the tracked tree. The text is not recorded here.

Parameters:

- PRNG: mulberry32, seeded with `seed + size`; seed 95.
- Words sampled uniformly from the stems of `dictionary-en` 4.0.0 `index.dic` (part before `/`) matching `^[a-z]{3,12}$`, sorted, de-duplicated: 35,965 words.
- Sizes: 5,000, 50,000, 200,000 words. Words are space-separated, paragraphs joined by a blank line, no punctuation or capitals.
- Paragraph length: 80 to 150 words each (checked for every paragraph of every size).
- Misspelling: word index `i` with `i % 50 == 25`, a sampled word with one character substituted, deleted or inserted, rejected if it is a dictionary-en stem in the list above.
- Made-up proper name: word index `i` with `i % 200 == 100`, one of 8 fixed names (Zorvath, Keldrin, Mirabeth, Quillon, Thessaly, Vornak, Ildreth, Brannoch), none a dictionary stem.

Planted counts (printed by the script):

| Words | Paragraphs | Misspellings | Names |
| --- | --- | --- | --- |
| 5,000 | 42 | 100 | 25 |
| 50,000 | 434 | 1,000 | 250 |
| 200,000 | 1,743 | 4,000 | 1,000 |

Determinism: two runs of the script with default seed wrote files with identical SHA-256 for all three sizes (first 16 hex: 5,000 `6fb863ca359548a5`, 50,000 `7ffbb90145defde9`, 200,000 `382a0ed507495172`).

Not established: whether the engines flag every planted misspelling (an edit can yield a valid inflected form not in the stem list).

## Hosted web, localhost

Task 10. FR-4 (a), FR-6, AC-3. All values below MEASURED unless marked UNMEASURED. Cells read `median / min / max (n = runs)`. No cause is stated for any value.

### Environment record

- Date: 2026-10-25 (server record `2026-10-25T18:01:48Z`).
- Git HEAD: `3a18b6381a3645572fce596cabc03570538f6f43`, branch `feat/spell-checker` (spike scripts as at HEAD plus one uncommitted edit to `scripts/driver.mjs`, the `punct` query parameter, used only by the supplementary experiment).
- Browser: Playwright 1.60.0, full Chromium (`channel: "chromium"`, not the headless shell), version 148.0.7778.96; user agent reports `HeadlessChrome/148.0.0.0`; page `crossOriginIsolated` true; `performance.memory` present.
- OS: macOS 26.5.1, `darwin 25.5.0 arm64`. Node v24.15.0.
- Packages: nspell 2.1.5, dictionary-en 4.0.0, harper.js 2.13.0.
- Server: `scripts/serve.mjs` on `127.0.0.1`, OS-assigned port, brotli responses (`Cache-Control: public, max-age=3600`, COOP `same-origin`, COEP `require-corp`). Bundle from `scripts/build.mjs`. Fixtures: the Task 5 generator, unchanged (5,000 / 50,000 / 200,000 words). Server pid started and stopped by this task; the browser, build and server ran outside the Bash sandbox, in one environment.
- Command (main run): `node scripts/run.mjs --url http://127.0.0.1:<port>/ --runs 5 --query "warm=4&sizes=5000,50000,200000&sizeRuns=1&recheckRuns=10&suggestReps=5"`. Each of the 5 runs is a fresh browser context (empty HTTP cache and site data); within a run each engine loads one cold load then 4 warm loads in a new worker each, then the other steps. Every cold load recorded `transferSize > 0` (`firstLoadWasCold` true in 5 of 5 runs, both engines). Every run reported `errors: []` for both engines and no `driverError`.
- Run counts actually used: cold load 5, warm load 20 (5 runs x 4), suggestion 5 repetitions x 5 runs = 25 repetitions of 200 words, check-from-cold-worker 5 per size (including harper.js at 200,000 words), re-check 10 per run x 5 runs = 50, memory 5 samples per phase, bytes 5 cold and 20 warm.
- Memory method: `performance.measureUserAgentSpecificMemory()` called on the page (bytes), sampled before any worker, after load, and after checking the 200,000-word document. The worker's own JS heap: UNMEASURED, `measureUserAgentSpecificMemory is not available in the worker` and `performance.memory` is absent in the worker (returned `null`). Page JS heap (`performance.memory.usedJSHeapSize`) is also recorded; it does not include the worker.

### FR-6 (a) Load time, worker creation to "ready" (ms)

| Engine | Cold | Warm |
| --- | --- | --- |
| nspell | 48.6 / 38.3 / 77.0 (n=5) | 45.8 / 35.1 / 72.6 (n=20) |
| harper.js | 430.4 / 425.8 / 691.7 (n=5) | 437.1 / 422.8 / 842.3 (n=20) |

### FR-6 (b) Suggestion time per call, 200 misspellings, 5 repetitions per run (ms)

Statistic is the per-repetition p50 and p95 over 200 calls; cells are over the 25 repetitions (5 runs x 5). Words with at least one suggestion in the first repetition: nspell 199 of 200, harper.js 199 of 200 (all 5 runs).

| Engine | p50 | p95 |
| --- | --- | --- |
| nspell | 0.675 / 0.580 / 1.140 (n=25) | 1.080 / 0.875 / 1.785 (n=25) |
| harper.js | 0.250 / 0.165 / 1.670 (n=25) | 0.285 / 0.180 / 2.340 (n=25) |

### FR-6 (c) Download size, bytes (Resource Timing)

Cold load (n=5; identical in all 5 runs, so min = max = median):

| Engine | Resource | Transferred | Encoded body | Decoded body |
| --- | --- | --- | --- | --- |
| nspell | worker script (`worker-nspell.js`) | 8,365 | 8,065 | 38,448 |
| nspell | dictionary (`index.aff` + `index.dic`) | 192,197 | 191,597 | 554,848 |
| nspell | total | 200,562 | 199,662 | 593,296 |
| harper.js | worker script (`worker-harper.js`) | 23,908 | 23,608 | 220,827 |
| harper.js | WebAssembly (`harper_wasm_slim_bg.wasm` 7,533,889 transferred, `harper_wasm_bg.wasm` 7,612,711 transferred) | 15,146,600 | 15,146,000 | 40,205,397 |
| harper.js | total | 15,170,508 | 15,169,608 | 40,426,224 |

Warm load, bytes transferred per load (n=20 for the total, n=5 for the second load in each run; the same value in every load):

| Engine | Worker script | Dictionary | WebAssembly | Total transferred |
| --- | --- | --- | --- | --- |
| nspell | 0 | 0 | not applicable (none) | 0 (n=20) |
| harper.js | 0 | not applicable (none) | 15,146,600 | 15,146,600 (n=20) |

For harper.js the warm-load Resource Timing entries for both `.wasm` files carried the same `transferSize` as on the cold load (7,533,889 and 7,612,711); encoded and decoded sizes are unchanged. For nspell all three entries carried `transferSize` 0 with the cold encoded and decoded sizes.

Size added to the install: not applicable on the hosted web platform (no install); the desktop and Android figures belong to Tasks 12 and 17.

### FR-6 (d) Memory, `measureUserAgentSpecificMemory` on the page (MB, 1 MB = 1,048,576 bytes)

| Engine | Before any worker | After load | After checking 200,000 words |
| --- | --- | --- | --- |
| nspell | 3.25 / 3.25 / 3.25 (n=5) | 10.66 / 10.66 / 10.69 (n=5) | 12.38 / 12.36 / 12.39 (n=5) |
| harper.js | 3.23 / 3.23 / 3.27 (n=5) | 165.59 / 165.58 / 165.59 (n=5) | 278.50 / 278.50 / 278.52 (n=5) |

Page JS heap used (`performance.memory`, MB, n=5): nspell 4.65 before, 3.48 after load, 3.98 after check; harper.js 4.21 before, 3.46 after load, 3.45 after check. Worker JS heap: UNMEASURED (see method above). Whether the page-level figure includes the dedicated worker's memory was not tested separately; the figures are reported as the call returned them.

### FR-6 (e) Time to check, from a cold worker (ms), and to re-check one edited paragraph

Check: a new worker is loaded, then one `check` of the whole fixture is timed (1 per run, 5 runs; load time excluded).

| Engine | 5,000 words | 50,000 words | 200,000 words |
| --- | --- | --- | --- |
| nspell | 3 / 2 / 5 (n=5) | 16 / 15 / 27 (n=5) | 67 / 62 / 112 (n=5) |
| harper.js | 564 / 554 / 1,144 (n=5) | 8,965 / 8,898 / 15,597 (n=5) | 72,193 / 71,234 / 128,024 (n=5) |

Re-check one edited paragraph (136 words, middle paragraph of the 200,000-word fixture with one suffixed word appended; 10 per run on a worker that had already checked the full document; 5 runs):

| Engine | Re-check (ms) |
| --- | --- |
| nspell | 0.05 / 0.04 / 1.16 (n=50) |
| harper.js | 16.41 / 13.04 / 27.89 (n=50) |

The "10 runs each" requirement for the cold-worker check is met only for the re-check; the cold-worker check per size has 5 runs (n=5), stated above. Reason for the lower count: harper.js at 200,000 words took between 71 s and 128 s per check.

### FR-6 (f) Correctness on the specified fixtures

Identical in all 5 runs. The planted counts are from the Task 5 generator (fixture section). "Names" are the planted made-up proper names; a name flagged counts as a correct flag, a name not flagged is not an error under this metric.

| Engine | Words | Planted misspellings flagged | Planted names flagged | Unplanted words flagged | Total flagged |
| --- | --- | --- | --- | --- | --- |
| nspell | 5,000 | 100 of 100 | 21 of 25 | 0 | 121 |
| nspell | 50,000 | 992 of 1,000 | 232 of 250 | 0 | 1,224 |
| nspell | 200,000 | 3,974 of 4,000 | 881 of 1,000 | 0 | 4,855 |
| harper.js | 5,000 | 0 of 100 | 0 of 25 | 0 | 0 |
| harper.js | 50,000 | 0 of 1,000 | 0 of 250 | 0 | 0 |
| harper.js | 200,000 | 0 of 4,000 | 0 of 1,000 | 0 | 0 |

harper.js flagged nothing on the specified (unpunctuated) fixtures. This is the result for those fixtures; it is not a statement about harper.js on ordinary prose. The re-check of the edited paragraph (appended `recieve` + `q`s) also flagged 0 words for harper.js and 4 for nspell in the first edited paragraph (all 5 runs).

### FR-6 (g) Lowest browser version run

Chromium 148.0.7778.96 only. Lower versions, including the `Chrome >= 67` floor: UNMEASURED, no older Chromium build is installed here and none was added. Both engines ran to completion on 148 (`errors: []`).

### Supplementary experiment: sentence length only (not an FR-6 fixture)

Purpose: the Task 7 smoke run observed harper.js flagging 3 words in "I recieve teh wrold." and 0 on the unpunctuated fixtures. This varies one thing, the sentence length of the same fixture text, in the harness only (`punct=N` query parameter in `scripts/driver.mjs`: a full stop is appended to every Nth whitespace-delimited word; word start offsets are unchanged; the Task 5 fixture files are not changed). `N=0` is the unmodified fixture. Sizes 5,000 and 50,000 words, one cold-worker check per cell (n=1 each, 1 run per N), same server, browser and day. Counts below are planted misspellings flagged / unplanted words flagged (total flagged):

| Full stop every N words | nspell 5,000 | harper.js 5,000 | nspell 50,000 | harper.js 50,000 |
| --- | --- | --- | --- | --- |
| 0 (none) | 100/100, 0 (121) | 0/100, 0 (0) | 992/1,000, 0 (1,224) | 0/1,000, 0 (0) |
| 40 | 100/100, 0 (121) | 99/100, 11 (131) | 992/1,000, 0 (1,224) | 987/1,000, 70 (1,289) |
| 20 | 100/100, 0 (121) | 99/100, 11 (131) | 992/1,000, 0 (1,224) | 987/1,000, 69 (1,288) |
| 10 | 100/100, 0 (121) | 99/100, 10 (130) | 992/1,000, 0 (1,224) | 989/1,000, 65 (1,286) |
| 5 | 100/100, 0 (121) | 20/100, 7 (48) | 992/1,000, 0 (1,224) | 225/1,000, 59 (516) |

Planted names flagged were 21 of 25 (5,000) and 232 of 250 (50,000) for harper.js at every N from 40 down to 5; 0 at N=0. nspell was identical in every row.

What this shows: for nspell the counts did not change with sentence length. For harper.js the counts changed with sentence length: 0 with no full stops, 99 to 989 per planted set with a stop every 10 to 40 words, and fewer (20 of 100, 225 of 1,000) with a stop every 5 words. The relation is not monotonic over the values tried (more flags at 40, 20 and 10 than at 5, and 0 at none), and the unplanted words flagged (7 to 70) are dictionary-stem words harper.js did not recognise (sample: dwelt, whizzing, whirring, cliche). Cause: not established. The experiment varies only sentence length and does not discriminate between any mechanism for the 0, the drop at N=5, or the unplanted flags. Experiments that would: harper.js output on the same text with other punctuation (commas, newlines per sentence), a different fixture of equal sentence length, and the harper.js lint list for single sentences of increasing length.

## Web Worker in android/harness

Removal note: the Android harness spike code (`android/harness/spell-spike-entry.ts`, `android/harness/spell-spike/`, and the `--spell-spike` branch of `android/scripts/build-harness.mjs`) was removed after the engine decision. The commits that added it are `3a18b638` and `478724d6`. The Android run in this document was made with that code and cannot be repeated from the current tree without restoring it from those commits. The harper.js parts of the scripts under `specs/features/spell-checker/scripts/` no longer run (harper.js is uninstalled); the nspell parts still do (see "Part 0 verification").

Task 9. Result: `android/harness` can host a Web Worker once the spike bundle is added to it (edits listed below). No blocker.

READ, not run (files read: `android/scripts/build-harness.mjs`, `android/harness/harness-entry.ts`, `android/capacitor.config.ts`, `android/CLAUDE.md`, `android/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java`, `CapConfig.java`):

- As found, the harness is one IIFE bundle (`www/harness.bundle.js`, entry `harness-entry.ts`) loaded by `www/index.html`. It creates no Worker and bundles no Worker script.
- As found, the harness page is not what the app loads: `android/capacitor.config.ts` sets `webDir: "../frontend/out"`, so `cap sync` copies the frontend static export, not `www/`.
- Capacitor Android serves `webDir` assets from the app's local server (`WebViewLocalServer`) inside the system WebView. The default scheme in `CapConfig.java` is `CAPACITOR_HTTPS_SCHEME` (the config sets no `server.androidScheme`). `getMimeType` returns `application/wasm` for a path ending `.wasm` (`WebViewLocalServer.java:558-559`).
- A same-origin Worker script served this way is an ordinary HTTPS URL for the WebView; the page, the worker scripts, the two `.wasm` files, the dictionary and the fixtures all sit in the same `webDir`.
- Not established by reading: that the Pixel's System WebView accepts a module worker (`worker-harper.js`, `type: "module"`) and `WebAssembly.instantiateStreaming` against the local server. That is what the owner run measures.

MEASURED on a desktop Chromium stand-in (not the Android WebView; 2026-10-25, run outside the Bash sandbox because Chromium would not start inside it):

- Build: `node android/scripts/build-harness.mjs --spell-spike` (cwd repo root), exit 0, output `android/build/spell-spike/`.
- Served the output with `node specs/features/spell-checker/scripts/serve.mjs --bundle android/build/spell-spike --fixtures $TMPDIR/sp-fx` and ran `node specs/features/spell-checker/scripts/run.mjs --url <served url>/ --query "warm=1&sizes=5000&sizeRuns=1&recheckRuns=2&suggestReps=1&uas=0"` (Playwright full Chromium, major version 148).
- Both workers were created and reported ready from the built output: nspell as a classic worker, harper.js as a module worker. `errors` was `[]` for both engines; no `driverError`. This is a smoke run (single warm load, 5,000 words); the numbers are not the measurements of record.
- The persist script (`persist.bundle.js`) loaded on that page without a page error.
- Not run: the Android WebView, `@capacitor/filesystem` on a device, the Capacitor local server.

Edits under `android/` (FR-10; owner decision, Gate 4; amended: the spike is a separate app). No edit was made to `android/capacitor.config.ts` or to `android/android/`; both were hashed before and after the amended build and were unchanged (see "Amended build, run here" below).

| File | Change | Reason |
| --- | --- | --- |
| `android/scripts/build-harness.mjs` | Added `execFileSync`, `existsSync`, `mkdirSync`, `copyFileSync`, `readFileSync`, `writeFileSync` imports and a `--spell-spike` branch before the existing build. With the flag it builds the Task 7 spike (`specs/features/spell-checker/scripts/build.mjs` `buildBundle`) into `android/build/spell-spike/`, writes fixtures and `env.json` there, bundles `spell-spike-entry.ts` to `persist.bundle.js`, copies the two pages below, and injects the persist script into `driver.html`. Amendment: it also writes `android/build/spell-spike-native/capacitor.config.json` (appId `works.saboteur.getwrite.spellspike`, appName `GetWrite Spell Spike`, webDir `../spell-spike`) and a `package.json` listing the three Capacitor packages, then runs the Capacitor CLI from that directory: `cap add android` (only if `android/build/spell-spike-native/android/` is absent) and `cap sync android`. Without the flag the file behaves as before. | The spike must run inside a Capacitor WebView through the harness build, as its own app so it cannot touch the real app's data. The CLI takes its config and platform directory from the working directory (`config.js`: `appRootDir = process.cwd()`), so running it in its own directory leaves `android/capacitor.config.ts` and `android/android/` unread and unwritten. `android/build/` is ignored by `android/.gitignore` (line `build/`), so nothing enters git; no `.gitignore` edit was needed. |
| `android/harness/spell-spike-entry.ts` | Comment only: the `run-as` example now names `works.saboteur.getwrite.spellspike`. | The file named the real app id. |
| `android/harness/spell-spike/index.html` (new) | Menu page with links to the driver, the underline page and the storage check; prints `location.origin`. | A WebView has no address bar; the pages need to be reachable by tapping. |
| `android/harness/spell-spike/storage-check.html` (new) | Writes, reads and reloads a `localStorage` key and prints the origin. | FR-34 Capacitor persistence check. |

Neither page names an application id. Outside `android/` but inside `specs/features/spell-checker/`: `scripts/serve.mjs` now exports `prepareFixtures` (one word, `export`), so the build can reuse the fixture generator.

READ, from `android/node_modules/@capacitor/cli/dist` (not guessed): `config.js` sets `appRootDir = process.cwd()` and loads `capacitor.config.ts|js|json` from it; `plugin.js` takes plugin names from the `package.json` found there and resolves them with `require.resolve(name, { paths: [rootDir] })`, which walks up to `android/node_modules`. This is why the spike directory needs its own `package.json` and why no `pnpm install` is needed. `android/capacitor.config.ts` sets only `appId`, `appName` and `webDir`; it sets no `androidScheme` or server option, so none is mirrored.

### Amended build, run here (2026-10-25, sandboxed Bash, no phone, no adb)

- `node android/scripts/build-harness.mjs --spell-spike`: ran the `cap add android` and `cap sync android` steps from `android/build/spell-spike-native/`. `cap add` printed "Error running gradle sync ... Unable to locate a Java Runtime" (no system Java on the PATH) and carried on; the project was created. No network was needed.
- Generated `app/build.gradle`: `namespace = "works.saboteur.getwrite.spellspike"`, `applicationId "works.saboteur.getwrite.spellspike"`. `strings.xml`: `app_name` = `GetWrite Spell Spike`, `package_name` = `works.saboteur.getwrite.spellspike`. Manifest launch activity `.MainActivity`.
- `./gradlew assembleDebug --offline` in `android/build/spell-spike-native/android/` with `JAVA_HOME` set to Android Studio's bundled JBR (`/Applications/Android Studio.app/Contents/jbr/Contents/Home`) and `ANDROID_HOME=~/Library/Android/sdk`. The first try failed in the Bash sandbox ("Unable to create debug keystore in ~/.android because it is not writable"); the second, with `ANDROID_USER_HOME` pointed at a throwaway directory, ended `BUILD SUCCESSFUL`. The daemon was stopped with `./gradlew --stop`. `installDebug` and `adb` were not run.
- `aapt dump badging app/build/outputs/apk/debug/app-debug.apk` (build-tools 36.0.0): `package: name='works.saboteur.getwrite.spellspike'`, `application-label:'GetWrite Spell Spike'`, `launchable-activity: name='works.saboteur.getwrite.spellspike.MainActivity'`. APK size 23,556,938 bytes (a debug APK built here; the owner's build may differ).
- `android/capacitor.config.ts` sha1 `f22dcd5608cdf3c6c3af66d0a2e2b5bfee2a3343` before and after; a hash of the mtimes of the files under `android/android/` (excluding `build/` and `.gradle/`) was the same before and after; `git status --short` listed only the two edited `android/` files plus the spec files.
- UNVERIFIED: that the APK installs and launches on the Pixel; that `run-as` works on it (a debug build is expected to be debuggable; not checked with `aapt`); the WebView origin.

## Owner step: Android

Removal note: the Android spike code this section drives was removed after the engine decision; it exists only in commits `3a18b638` and `478724d6` (details in "Web Worker in android/harness"). The steps below cannot be run from the current tree without restoring it.

Halts here. The run is the owner's (Task 16); nothing below was run on a phone. Items marked unverified were not established from the repository.

The spike is a separate app: application id `works.saboteur.getwrite.spellspike`, name "GetWrite Spell Spike". It installs beside the real GetWrite app and has its own app data and its own WebView storage. No step below builds, installs, starts, `run-as`'s or dumps the real app `works.saboteur.getwrite`. The real app's setup (`android/capacitor.config.ts`, `android/android/`) is not edited and nothing needs to be put back.

Warnings.

- Never run `adb shell pm clear` or `adb uninstall` on `works.saboteur.getwrite`: that would delete the projects on the phone. Every command below carries `.spellspike`; check that before pressing Enter.
- The spike page's origin is printed by the page (steps 12 and 14). Do not assume it equals the real app's origin; any statement that the two are the same origin is unverified.

Device facts established from the repository: launch activity `.MainActivity` (generated manifest, READ here); `minSdkVersion` 24, `targetSdkVersion` 36 (`variables.gradle` of the generated project); Capacitor Android 8.4.2; the capture route reads `files/<name>` with `run-as`, which needs a debuggable build (a debug build is expected to be; unverified for this device). The device is a Pixel 7 Pro (FR-4 c). Its System WebView version and keyboard app are not recorded anywhere in the repository; steps 11 and 12 record them.

Prerequisites on the owner's machine (unverified for the owner's shell): `pnpm install` already done (do not run it for this); a JDK for Gradle (Android Studio's bundled one works: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`); `export ANDROID_HOME=$HOME/Library/Android/sdk`.

Steps, from the repository root of a clean checkout of this branch:

1. Check the phone is visible and unlocked, with the screen timeout raised in the phone's settings (the run can take up to the driver's 20 minute limit): `adb devices`. Expect one device in state `device`.
2. Build the web assets and generate the spike's own native project: `node android/scripts/build-harness.mjs --spell-spike`. Expect exit 0 and a last line `[build-harness] wrote .../android/build/spell-spike (spell-spike) and the native project .../android/build/spell-spike-native/android.` A line "Error running gradle sync ... Unable to locate a Java Runtime" is harmless if `JAVA_HOME` is not set yet. Output is under `android/build/` (gitignored); the real app's `android/android/` is not touched.
3. Build the debug APK (no install): `cd android/build/spell-spike-native/android && ./gradlew assembleDebug`, then `./gradlew --stop`. Expect `BUILD SUCCESSFUL`. The APK is `android/build/spell-spike-native/android/app/build/outputs/apk/debug/app-debug.apk`. Record its size: `ls -l` on that path, next to the "size added to the install" row.
4. Verify the APK's package name BEFORE installing. `aapt` is under the SDK build-tools, for example `$ANDROID_HOME/build-tools/36.0.0/aapt` (use any version folder present: `ls $ANDROID_HOME/build-tools`). Run: `$ANDROID_HOME/build-tools/36.0.0/aapt dump badging android/build/spell-spike-native/android/app/build/outputs/apk/debug/app-debug.apk | grep package:`. Alternative: `$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer manifest application-id <apk>`. The output must be `works.saboteur.getwrite.spellspike`. STOP if it is anything else (in particular `works.saboteur.getwrite`); do not install.
5. Install exactly the verified file: `adb install -r android/build/spell-spike-native/android/app/build/outputs/apk/debug/app-debug.apk`. Expect `Success`. Then check both apps are present side by side: `adb shell pm list packages | grep works.saboteur.getwrite` should list `package:works.saboteur.getwrite.spellspike` (and `package:works.saboteur.getwrite` if the real app is installed).
6. Launch: `adb shell am start -n works.saboteur.getwrite.spellspike/.MainActivity`. The phone shows "Spell checker spike" with three links and the origin.
7. Record memory baseline (menu page, nothing running): `adb shell dumpsys meminfo works.saboteur.getwrite.spellspike > specs/features/spell-checker/screenshots/meminfo-1-menu.txt` (create the folder if absent).
8. Tap "Run the spike driver". It runs both engines (20 warm loads each, three document sizes, 5 re-check runs) and shows `running` until done. While it runs, take a second sample at least once, and again during the longest-running phase you can see in the on-page log: `adb shell dumpsys meminfo works.saboteur.getwrite.spellspike > specs/features/spell-checker/screenshots/meminfo-2-running.txt`. The workers are terminated by the driver at the end of each engine, so a sample after the run shows the page only; the "running" sample is the one that can include a worker.
9. When the page shows the result block and the line "result written to Directory.Data/spell-spike-result.json", take the third sample: `adb shell dumpsys meminfo works.saboteur.getwrite.spellspike > specs/features/spell-checker/screenshots/meminfo-3-after.txt`. If the line says "result NOT written", the error text is on the page; the JSON is still in the page's `<pre>` and in `console.log` as `SPELL_RESULT_JSON` (logcat route, unverified: `adb logcat -d | grep SPELL_RESULT_JSON`; long lines may be truncated).
10. Copy the JSON result block to the clipboard: `adb shell run-as works.saboteur.getwrite.spellspike cat files/spell-spike-result.json | pbcopy`. Open `specs/features/spell-checker/experiments.md`, go to the heading "Android results (pasted)", replace the line `pending owner run` with a fenced `json` block and paste. In the pasted block check `environment.browser.userAgent` (it names the WebView's Chrome version) and that `engines[].errors` is empty for both engines; a worker that failed to start shows `worker error` there. Optional repeat for FR-6 cold loads: `adb shell am force-stop works.saboteur.getwrite.spellspike`, relaunch (step 6), run again, paste each block under its own sub-heading; whether a relaunch counts as a cold load on this WebView is not established (a Capacitor asset load has no network transfer, so `transferSize` may be 0 on every load).
11. Record the System WebView version: `adb shell dumpsys webviewupdate` (shows the current WebView package and version; unverified output format), and `adb shell dumpsys package com.google.android.webview | grep versionName` (package name may differ on a Pixel, for example `com.android.webview`; unverified). Write both lines, and the Chrome version from the UserAgent in the pasted block, under "Android environment".
12. Record the keyboard app: `adb shell settings get secure default_input_method`. Write its output and the app's name as shown in the phone's Settings under "Languages & input". Also record Android version and device: `adb shell getprop ro.build.version.release`, `adb shell getprop ro.product.model`.
13. FR-7 screenshots. On the phone, go back to the menu (system Back) and tap "Native underline observation page (FR-7)". For each of the eight cases, tap into the field, wait 2 seconds, and capture: `adb exec-out screencap -p > specs/features/spell-checker/screenshots/android-underline-<N>.png` with N = 1 to 8. Case 7 and 8 are the two inside the container that carries `spellcheck="false"`. Beside each file, write one line under "Android underlines": the case number, whether the text `recieve teh wrold` showed a red or other underline, whether the keyboard's suggestion strip or a composing underline appeared (OQ-12), and the keyboard app name. State what is seen; write no cause. Only an observation that was made is labelled MEASURED; one that could not be made is labelled UNMEASURED with the reason.
14. FR-34 check, localStorage in the spike app's WebView. Go back to the menu and tap "localStorage persistence check". The page prints `location.origin` (copy it into the results; it is the spike app's own, not assumed equal to the real app's) and `value: (absent)` on first visit.
    1. Tap "Write a new value". The page shows `value: written <timestamp>`.
    2. Tap "Reload page". Expect the same timestamp.
    3. Force-stop and relaunch the spike only: `adb shell am force-stop works.saboteur.getwrite.spellspike`, then `adb shell am start -n works.saboteur.getwrite.spellspike/.MainActivity`, open the same page. Expect the same timestamp.
    4. Record each of the three outcomes (timestamp seen, or absent) under "Capacitor localStorage". Optionally also swipe the app away from recents and reopen it, and say which of the two was done. This shows persistence in the spike app only; it does not show what the real app's origin would do.
15. Tell the lead the headings are filled. The run is halted on this section until the Decision section names the engine (FR-9).
16. LAST step, after everything above is recorded: remove only the spike. `adb uninstall works.saboteur.getwrite.spellspike`. Expect `Success`. This does not touch the real app. `android/build/` can then be deleted.

### Android environment

All MEASURED unless marked. Android steps were driven by the lead through `adb` (including `adb input` for taps), with the owner's approval, not by the owner by hand. Date 2026-10-25.

- Device: Pixel 7 Pro, Android 17, build CP3A.260905.009 (from the pasted `userAgent`).
- System WebView: `dumpsys webviewupdate` current package `com.google.android.webview` 155.0.8059.43. `userAgent`: `Mozilla/5.0 (Linux; Android 17; Pixel 7 Pro Build/CP3A.260905.009; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.8059.43 Mobile Safari/537.36`; `chromeMajor` 155; `crossOriginIsolated` false; `hasPerformanceMemory` true.
- Keyboard: `com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME` (Gboard).
- Origin printed by the page: `https://localhost`.
- App: the spike, installed as `works.saboteur.getwrite.spellspike` after `aapt dump badging` showed that package name; uninstalled afterwards (`Success`). The real app `works.saboteur.getwrite` was not touched.
- Run notes: one of 73 meminfo polls returned "adb: no devices/emulators found" (a brief disconnect at 16:30:59), and an earlier install attempt failed while the device was briefly gone. Neither is explained here.
- The JSON `environment.server` block records the build machine (git HEAD `478724d6`), not the phone.

### Android underlines

Task 17. FR-7, AC-4. Page: the same `underline-page.html` (8 cases, each holding "recieve teh wrold"), opened in the spike app. Each field was tapped into without typing and a screenshot was taken 2 s later through `adb`. Keyboard: Gboard. All MEASURED by looking at the screenshots (checked again by the author of this section); no cause is stated.

- Case 1, contenteditable, no attribute: no underline visible under "recieve teh wrold"; the field was focused with the cursor at the end of the text; Gboard's suggestion strip showed "wrold | world" plus two globe emoji; no composing underline visible (`screenshots/android-underline-1.png`).
- Case 2, textarea, no attribute: no underline visible under "recieve teh wrold"; the field was focused with the cursor at the end of the text; Gboard's suggestion strip showed "wrold | world" plus two globe emoji; no composing underline visible (`screenshots/android-underline-2.png`).
- Case 3, input, no attribute: no underline visible under "recieve teh wrold"; the field was focused with the cursor at the end of the text; Gboard's suggestion strip showed "wrold | world" plus two globe emoji; no composing underline visible (`screenshots/android-underline-3.png`).
- Case 4, contenteditable, `spellcheck="false"`: no underline visible under "recieve teh wrold"; the field was focused with the cursor at the end of the text; Gboard's suggestion strip showed "wrold | world" plus two globe emoji; no composing underline visible (`screenshots/android-underline-4.png`).
- Case 5, textarea, `spellcheck="false"`: no underline visible under "recieve teh wrold"; the field was focused with the cursor at the end of the text; Gboard's suggestion strip showed "wrold | world" plus two globe emoji; no composing underline visible (`screenshots/android-underline-5.png`).
- Case 6, input, `spellcheck="false"`: no underline visible under "recieve teh wrold"; the field was focused with the cursor at the end of the text; Gboard's suggestion strip showed "wrold | world" plus two globe emoji; no composing underline visible (`screenshots/android-underline-6.png`).
- Case 7, contenteditable inside a `spellcheck="false"` container, no own attribute: no underline visible under "recieve teh wrold"; the field was focused with the cursor at the end of the text; Gboard's suggestion strip showed "wrold | world" plus two globe emoji; no composing underline visible (`screenshots/android-underline-7.png`).
- Case 8, textarea inside a `spellcheck="false"` container, no own attribute: no underline visible under "recieve teh wrold"; the field was focused with the cursor at the end of the text; Gboard's suggestion strip showed "wrold | world" plus two globe emoji; no composing underline visible (`screenshots/android-underline-8.png`).
- Not observed in any of the 8 cases: a red or other underline under "recieve" or "wrold", with or without the attribute (cases 1 to 3 have no attribute).
- Gboard's suggestion strip showed "wrold | world" in cases 4 to 8 (attribute `false` on the element or on the container), as in cases 1 to 3.
- UNMEASURED: whether an underline appears after the user types a word. No text was typed; only existing text was focused.
- UNMEASURED: the DOM-level `.spellcheck` property on Android (not recorded in the JSON).

### Capacitor localStorage

MEASURED in the spike app only (`works.saboteur.getwrite.spellspike`), origin printed by the page `https://localhost`; one run. This does not show what the real app's origin would do.

- First visit to the storage-check page: `value: (absent)`.
- After "Write a new value": `value: written 2026-10-25T22:47:47.532Z`.
- After "Reload page": the same value.
- After `am force-stop` then `am start` of the spike: the same value. (Swiping away from recents was not done.)

## Android results (pasted)

Pasted from `screenshots/android-result.json` (22,103 bytes, as written by the driver on the phone; run 2026-10-25, 15 s meminfo polling alongside).

```json
{
  "environment": {
    "server": {
      "date": "2026-10-25T22:00:01.551Z",
      "node": "v24.15.0",
      "os": "darwin 25.5.0 arm64",
      "gitHead": "478724d6a8b0c06f52671e3c34bec5c35505c6fd",
      "gitBranch": "feat/spell-checker",
      "packages": {
        "nspell": "2.1.5",
        "dictionary-en": "4.0.0",
        "harper.js": "2.13.0"
      }
    },
    "browser": {
      "userAgent": "Mozilla/5.0 (Linux; Android 17; Pixel 7 Pro Build/CP3A.260905.009; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.8059.43 Mobile Safari/537.36",
      "brands": [
        "Android WebView 155",
        "Chromium 155",
        "Not(A:Brand 24"
      ],
      "chromeMajor": 155,
      "platform": "Linux aarch64",
      "crossOriginIsolated": false,
      "hasPerformanceMemory": true
    },
    "config": {
      "engines": [
        "nspell",
        "harper"
      ],
      "warmLoads": 20,
      "sizes": [
        5000,
        50000,
        200000
      ],
      "sizeRuns": 1,
      "recheckRuns": 5,
      "suggestReps": 5,
      "suggestionWords": 200,
      "uasMemory": false,
      "punctuateEvery": 0,
      "loadOnly": false
    }
  },
  "lowestChromeVersionRun": {
    "chromeMajor": 155,
    "note": "single browser per run; the lowest across runs is taken by the caller"
  },
  "fixtureCounts": [
    {
      "words": 5000,
      "paragraphs": 42,
      "misspellings": 100,
      "names": 25
    },
    {
      "words": 50000,
      "paragraphs": 434,
      "misspellings": 1000,
      "names": 250
    },
    {
      "words": 200000,
      "paragraphs": 1743,
      "misspellings": 4000,
      "names": 1000
    }
  ],
  "suggestionList": {
    "source": "fixture-50000.txt",
    "count": 200,
    "first": [
      "shawper",
      "scofl",
      "dighearted",
      "clo",
      "holloo"
    ]
  },
  "engines": [
    {
      "engine": "nspell",
      "workerType": "classic",
      "errors": [],
      "load": {
        "firstLoad": {
          "ms": 189.5,
          "resources": [
            {
              "name": "/worker-nspell.js",
              "kind": "worker-script",
              "transferSize": 300,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            },
            {
              "name": "/assets/index.aff",
              "kind": "dictionary",
              "transferSize": 0,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            },
            {
              "name": "/assets/index.dic",
              "kind": "dictionary",
              "transferSize": 0,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            }
          ],
          "totals": {
            "transferred": 300,
            "encoded": 0,
            "decoded": 0,
            "byKind": {
              "worker-script": {
                "transferred": 300,
                "encoded": 0,
                "decoded": 0,
                "files": 1
              },
              "dictionary": {
                "transferred": 0,
                "encoded": 0,
                "decoded": 0,
                "files": 2
              }
            }
          }
        },
        "secondLoad": {
          "resources": [
            {
              "name": "/worker-nspell.js",
              "kind": "worker-script",
              "transferSize": 300,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            },
            {
              "name": "/assets/index.aff",
              "kind": "dictionary",
              "transferSize": 0,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            },
            {
              "name": "/assets/index.dic",
              "kind": "dictionary",
              "transferSize": 0,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            }
          ],
          "totals": {
            "transferred": 300,
            "encoded": 0,
            "decoded": 0,
            "byKind": {
              "worker-script": {
                "transferred": 300,
                "encoded": 0,
                "decoded": 0,
                "files": 1
              },
              "dictionary": {
                "transferred": 0,
                "encoded": 0,
                "decoded": 0,
                "files": 2
              }
            }
          }
        },
        "firstLoadWasCold": true,
        "loads": [
          {
            "index": 0,
            "ms": 189.5,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 1,
            "ms": 167.5,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 2,
            "ms": 210.40000000037253,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 3,
            "ms": 173.7000000011176,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 4,
            "ms": 216.40000000037253,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 5,
            "ms": 250.2000000011176,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 6,
            "ms": 243.80000000074506,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 7,
            "ms": 190.7000000011176,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 8,
            "ms": 155.09999999962747,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 9,
            "ms": 257.40000000037253,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 10,
            "ms": 182.2999999988824,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 11,
            "ms": 154.69999999925494,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 12,
            "ms": 265,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 13,
            "ms": 187.5,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 14,
            "ms": 245.30000000074506,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 15,
            "ms": 173.7999999988824,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 16,
            "ms": 162.5,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 17,
            "ms": 247.90000000037253,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 18,
            "ms": 201.19999999925494,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 19,
            "ms": 274.90000000037253,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 20,
            "ms": 177.59999999962747,
            "transferred": 300,
            "decoded": 0
          }
        ],
        "warmMs": {
          "n": 20,
          "median": 190.7000000011176,
          "min": 154.69999999925494,
          "max": 274.90000000037253
        }
      },
      "suggestion": {
        "words": 200,
        "wordsWithSuggestionsInFirstRepetition": 199,
        "repetitions": [
          {
            "p50": 2.599999999627471,
            "p95": 4.099999999627471,
            "max": 17.40000000037253
          },
          {
            "p50": 1.900000000372529,
            "p95": 2.900000000372529,
            "max": 5.099999999627471
          },
          {
            "p50": 1.900000000372529,
            "p95": 2.899999998509884,
            "max": 3.400000000372529
          },
          {
            "p50": 2,
            "p95": 3.099999999627471,
            "max": 5.400000000372529
          },
          {
            "p50": 2,
            "p95": 3,
            "max": 3.599999999627471
          }
        ],
        "p50": {
          "n": 5,
          "median": 2,
          "min": 1.900000000372529,
          "max": 2.599999999627471
        },
        "p95": {
          "n": 5,
          "median": 3,
          "min": 2.899999998509884,
          "max": 4.099999999627471
        }
      },
      "checkFromColdWorker": [
        {
          "words": 5000,
          "ms": {
            "n": 1,
            "median": 9.599999999627471,
            "min": 9.599999999627471,
            "max": 9.599999999627471
          },
          "runsMs": [
            9.599999999627471
          ],
          "correctness": {
            "plantedMisspellings": 100,
            "plantedMisspellingsFlagged": 100,
            "plantedNames": 25,
            "plantedNamesFlagged": 21,
            "unplantedFlagged": 0,
            "unplantedFlaggedSample": [],
            "totalFlagged": 121
          }
        },
        {
          "words": 50000,
          "ms": {
            "n": 1,
            "median": 71,
            "min": 71,
            "max": 71
          },
          "runsMs": [
            71
          ],
          "correctness": {
            "plantedMisspellings": 1000,
            "plantedMisspellingsFlagged": 992,
            "plantedNames": 250,
            "plantedNamesFlagged": 232,
            "unplantedFlagged": 0,
            "unplantedFlaggedSample": [],
            "totalFlagged": 1224
          }
        },
        {
          "words": 200000,
          "ms": {
            "n": 1,
            "median": 224.7999999988824,
            "min": 224.7999999988824,
            "max": 224.7999999988824
          },
          "runsMs": [
            224.7999999988824
          ],
          "correctness": {
            "plantedMisspellings": 4000,
            "plantedMisspellingsFlagged": 3974,
            "plantedNames": 1000,
            "plantedNamesFlagged": 881,
            "unplantedFlagged": 0,
            "unplantedFlaggedSample": [],
            "totalFlagged": 4855
          }
        }
      ],
      "memory": {
        "beforeWorker": {
          "worker": {},
          "page": {
            "jsHeapUsed": 10000000,
            "jsHeapTotal": 10000000
          },
          "pageUaSpecificBytes": null,
          "pageUaSpecificError": null
        },
        "afterLoad": {
          "worker": {
            "jsHeapUsed": null,
            "jsHeapTotal": null,
            "crossOriginIsolated": false,
            "uaSpecificBytes": null,
            "uaSpecificError": null
          },
          "page": {
            "jsHeapUsed": 10000000,
            "jsHeapTotal": 10000000
          },
          "pageUaSpecificBytes": null,
          "pageUaSpecificError": null
        },
        "afterCheck200k": {
          "worker": {
            "jsHeapUsed": null,
            "jsHeapTotal": null,
            "crossOriginIsolated": false,
            "uaSpecificBytes": null,
            "uaSpecificError": null
          },
          "page": {
            "jsHeapUsed": 10000000,
            "jsHeapTotal": 10000000
          },
          "pageUaSpecificBytes": null,
          "pageUaSpecificError": null
        }
      },
      "recheck": {
        "paragraphWords": 136,
        "ms": {
          "n": 5,
          "median": 0.6999999992549419,
          "min": 0.599999999627471,
          "max": 2.300000000745058
        },
        "runsMs": [
          0.900000000372529,
          0.599999999627471,
          0.6999999992549419,
          0.599999999627471,
          2.300000000745058
        ],
        "flaggedInFirstEditedParagraph": 4
      }
    },
    {
      "engine": "harper",
      "workerType": "module",
      "errors": [],
      "load": {
        "firstLoad": {
          "ms": 1425.5,
          "resources": [
            {
              "name": "/worker-harper.js",
              "kind": "worker-script",
              "transferSize": 300,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            },
            {
              "name": "/harper_wasm_slim_bg.wasm",
              "kind": "wasm",
              "transferSize": 0,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            },
            {
              "name": "/harper_wasm_bg.wasm",
              "kind": "wasm",
              "transferSize": 0,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            }
          ],
          "totals": {
            "transferred": 300,
            "encoded": 0,
            "decoded": 0,
            "byKind": {
              "worker-script": {
                "transferred": 300,
                "encoded": 0,
                "decoded": 0,
                "files": 1
              },
              "wasm": {
                "transferred": 0,
                "encoded": 0,
                "decoded": 0,
                "files": 2
              }
            }
          }
        },
        "secondLoad": {
          "resources": [
            {
              "name": "/worker-harper.js",
              "kind": "worker-script",
              "transferSize": 300,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            },
            {
              "name": "/harper_wasm_slim_bg.wasm",
              "kind": "wasm",
              "transferSize": 0,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            },
            {
              "name": "/harper_wasm_bg.wasm",
              "kind": "wasm",
              "transferSize": 0,
              "encodedBodySize": 0,
              "decodedBodySize": 0
            }
          ],
          "totals": {
            "transferred": 300,
            "encoded": 0,
            "decoded": 0,
            "byKind": {
              "worker-script": {
                "transferred": 300,
                "encoded": 0,
                "decoded": 0,
                "files": 1
              },
              "wasm": {
                "transferred": 0,
                "encoded": 0,
                "decoded": 0,
                "files": 2
              }
            }
          }
        },
        "firstLoadWasCold": true,
        "loads": [
          {
            "index": 0,
            "ms": 1425.5,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 1,
            "ms": 1412.4000000003725,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 2,
            "ms": 1392.699999999255,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 3,
            "ms": 1432.0999999996275,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 4,
            "ms": 1471.2000000011176,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 5,
            "ms": 1410.3999999985099,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 6,
            "ms": 1431.7000000011176,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 7,
            "ms": 1390.699999999255,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 8,
            "ms": 1428.300000000745,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 9,
            "ms": 1412,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 10,
            "ms": 1397.300000000745,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 11,
            "ms": 1430.5,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 12,
            "ms": 1443.3999999985099,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 13,
            "ms": 1379,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 14,
            "ms": 1388.8999999985099,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 15,
            "ms": 1433.5,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 16,
            "ms": 1411.2000000011176,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 17,
            "ms": 1421.4000000003725,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 18,
            "ms": 1398.800000000745,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 19,
            "ms": 1415.800000000745,
            "transferred": 300,
            "decoded": 0
          },
          {
            "index": 20,
            "ms": 1750.7000000011176,
            "transferred": 300,
            "decoded": 0
          }
        ],
        "warmMs": {
          "n": 20,
          "median": 1412.4000000003725,
          "min": 1379,
          "max": 1750.7000000011176
        }
      },
      "suggestion": {
        "words": 200,
        "wordsWithSuggestionsInFirstRepetition": 199,
        "repetitions": [
          {
            "p50": 3.5,
            "p95": 5.699999999254942,
            "max": 104.69999999925494
          },
          {
            "p50": 0.6999999992549419,
            "p95": 0.8000000007450581,
            "max": 3.200000001117587
          },
          {
            "p50": 0.6999999992549419,
            "p95": 0.7999999988824129,
            "max": 1
          },
          {
            "p50": 0.6999999992549419,
            "p95": 0.7999999988824129,
            "max": 1.599999999627471
          },
          {
            "p50": 0.6999999992549419,
            "p95": 0.7999999988824129,
            "max": 1.1000000014901161
          }
        ],
        "p50": {
          "n": 5,
          "median": 0.6999999992549419,
          "min": 0.6999999992549419,
          "max": 3.5
        },
        "p95": {
          "n": 5,
          "median": 0.7999999988824129,
          "min": 0.7999999988824129,
          "max": 5.699999999254942
        }
      },
      "checkFromColdWorker": [
        {
          "words": 5000,
          "ms": {
            "n": 1,
            "median": 1966,
            "min": 1966,
            "max": 1966
          },
          "runsMs": [
            1966
          ],
          "correctness": {
            "plantedMisspellings": 100,
            "plantedMisspellingsFlagged": 0,
            "plantedNames": 25,
            "plantedNamesFlagged": 0,
            "unplantedFlagged": 0,
            "unplantedFlaggedSample": [],
            "totalFlagged": 0
          }
        },
        {
          "words": 50000,
          "ms": {
            "n": 1,
            "median": 28972.900000000373,
            "min": 28972.900000000373,
            "max": 28972.900000000373
          },
          "runsMs": [
            28972.900000000373
          ],
          "correctness": {
            "plantedMisspellings": 1000,
            "plantedMisspellingsFlagged": 0,
            "plantedNames": 250,
            "plantedNamesFlagged": 0,
            "unplantedFlagged": 0,
            "unplantedFlaggedSample": [],
            "totalFlagged": 0
          }
        },
        {
          "words": 200000,
          "ms": {
            "n": 1,
            "median": 247753.3999999985,
            "min": 247753.3999999985,
            "max": 247753.3999999985
          },
          "runsMs": [
            247753.3999999985
          ],
          "correctness": {
            "plantedMisspellings": 4000,
            "plantedMisspellingsFlagged": 0,
            "plantedNames": 1000,
            "plantedNamesFlagged": 0,
            "unplantedFlagged": 0,
            "unplantedFlaggedSample": [],
            "totalFlagged": 0
          }
        }
      ],
      "memory": {
        "beforeWorker": {
          "worker": {},
          "page": {
            "jsHeapUsed": 10000000,
            "jsHeapTotal": 10000000
          },
          "pageUaSpecificBytes": null,
          "pageUaSpecificError": null
        },
        "afterLoad": {
          "worker": {
            "jsHeapUsed": null,
            "jsHeapTotal": null,
            "crossOriginIsolated": false,
            "uaSpecificBytes": null,
            "uaSpecificError": null
          },
          "page": {
            "jsHeapUsed": 10000000,
            "jsHeapTotal": 10000000
          },
          "pageUaSpecificBytes": null,
          "pageUaSpecificError": null
        },
        "afterCheck200k": {
          "worker": {
            "jsHeapUsed": null,
            "jsHeapTotal": null,
            "crossOriginIsolated": false,
            "uaSpecificBytes": null,
            "uaSpecificError": null
          },
          "page": {
            "jsHeapUsed": 10000000,
            "jsHeapTotal": 10000000
          },
          "pageUaSpecificBytes": null,
          "pageUaSpecificError": null
        }
      },
      "recheck": {
        "paragraphWords": 136,
        "ms": {
          "n": 5,
          "median": 52.30000000074506,
          "min": 45.30000000074506,
          "max": 55.099999997764826
        },
        "runsMs": [
          53.099999997764826,
          45.30000000074506,
          55.099999997764826,
          52,
          52.30000000074506
        ],
        "flaggedInFirstEditedParagraph": 0
      }
    }
  ]
}
```

### Android table (FR-6)

Source: the pasted JSON above (one run, `chromeMajor` 155) and `screenshots/meminfo-*.txt`. Cells read `median (min to max), n`. Both engines reported empty `errors`. No cause is stated for any value.

| FR-6 metric | nspell | harper.js |
| --- | --- | --- |
| (a) Load, first load of the run, ms | 189.5, n=1 | 1,425.5, n=1 |
| (a) Load, the 20 later loads, ms | 190.7 (154.7 to 274.9), n=20 | 1,412.4 (1,379.0 to 1,750.7), n=20 |
| (a) Load, all 21 loads, ms | 190.7 (154.7 to 274.9), n=21 | 1,415.8 (1,379.0 to 1,750.7), n=21 |
| (b) Suggestion p50 per repetition of 200 calls, ms | 2.0 (1.9 to 2.6), n=5 | 0.7 (0.7 to 3.5), n=5 |
| (b) Suggestion p95, ms | 3.0 (2.9 to 4.1), n=5 | 0.8 (0.8 to 5.7), n=5 |
| (b) Words with a suggestion, first repetition | 199 of 200 | 199 of 200 |
| (c) Download size | UNMEASURED: `loads[].transferred` is 300 and `loads[].decoded` is 0 on all 21 loads; Capacitor asset loads, so the figures are not meaningful | UNMEASURED (same) |
| (d) Memory, page `measureUserAgentSpecificMemory` | UNMEASURED: not run (`uasMemory` false; `uaSpecificBytes` null) | UNMEASURED (same) |
| (d) Memory, page `performance.memory` | `jsHeapUsed` and `jsHeapTotal` 10,000,000 before the worker, after load and after the 200,000-word check (the same value each time; reported as is) | same values |
| (d) Memory, worker JS heap | UNMEASURED (`jsHeapUsed` null) | UNMEASURED (same) |
| (d) Memory, app PSS (`dumpsys meminfo`) | covers both engines and the page together; cannot be split: menu page 179,664 KB, highest of 72 successful 15 s samples during the run 227,438 KB, after the run 198,326 KB | same figures (one app) |
| (e) Check from a cold worker, 5,000 words, ms | 9.6, n=1 | 1,966, n=1 |
| (e) Check, 50,000 words, ms | 71, n=1 | 28,972.9, n=1 |
| (e) Check, 200,000 words, ms | 224.8, n=1 | 247,753.4, n=1 |
| (e) Re-check one 136-word paragraph, ms | 0.7 (0.6 to 2.3), n=5; 4 flagged in the first edited paragraph | 52.3 (45.3 to 55.1), n=5; 0 flagged |
| (f) Planted misspellings flagged, 5,000 / 50,000 / 200,000 | 100 of 100 / 992 of 1,000 / 3,974 of 4,000 | 0 of 100 / 0 of 1,000 / 0 of 4,000 |
| (f) Planted names flagged (not specified in FR-6, from the JSON) | 21 of 25 / 232 of 250 / 881 of 1,000 | 0 / 0 / 0 |
| (f) Unplanted words flagged | 0 / 0 / 0 | 0 / 0 / 0 |
| (g) Lowest browser version run | Chrome 155.0.8059.43 (Android System WebView) | same |

Worker types: nspell classic, harper.js module; both started on the Pixel's WebView. The fixtures were unpunctuated (`punctuateEvery` 0), as for web and desktop.

The memory polls: 72 of 73 returned a sample; one returned "adb: no devices/emulators found". `meminfo-2-running.txt` is the highest of the 72 (the polls were every 15 s; the phase each fell in was not recorded).

## Hosted web, throttled

Task 11. FR-4 (a) as resolved at OQ-5 (c), FR-6. All values MEASURED unless marked UNMEASURED. Cells read `median / min / max (n = runs)`. No cause is stated for any value. Separate from "Hosted web, localhost" (Task 10), whose values are unthrottled.

### Environment and method

- Date: 2026-10-25. Git HEAD `d2bea337` (the Task 10 measurement commit), branch `feat/spell-checker`, plus uncommitted edits to `scripts/driver.mjs` (a `loadOnly=1` query parameter: each engine stops after its load sequence, no fixtures, suggestion, check or memory steps) and `scripts/run.mjs` (a `--throttle "latencyMs,downKbps,upKbps"` option).
- Browser, OS, Node, packages, server and bundle: as in the Task 10 environment record (Playwright 1.60.0, full Chromium 148.0.7778.96, macOS 26.5.1 arm64, Node v24.15.0, nspell 2.1.5, dictionary-en 4.0.0, harper.js 2.13.0; `scripts/serve.mjs` on `127.0.0.1`, brotli). Bundle rebuilt for this run by `scripts/build.mjs`. Server on an OS-assigned port (60180), started and stopped by this task by pid; browser, build and server ran outside the Bash sandbox in one environment.
- Profile name: "Fast 3G-like" (the values Chrome DevTools uses for its Fast 3G preset). Latency 150 ms; download 1.6 Mbit/s (1,600 kbit/s = 200,000 bytes/s); upload 750 kbit/s (93,750 bytes/s). These are the values passed to the CDP call (`latency: 150`, `downloadThroughput: 200000`, `uploadThroughput: 93750`, `offline: false`).
- Throttling method: CDP `Network.emulateNetworkConditions` through a Playwright CDP session on the page (`context.newCDPSession(page)`). A page-only call did not slow worker fetches (observed: nspell cold load 78.4 ms with the page-level call applied to the page only versus 75.9 ms unthrottled, a probe run of 1 cold load). The runner therefore also auto-attaches dedicated workers (`Target.setAutoAttach`, `waitForDebuggerOnStart: true`, `flatten: false`) and sends `Network.enable` and the same `Network.emulateNetworkConditions` to each worker through `Target.sendMessageToTarget` before resuming it (`Runtime.runIfWaitingForDebugger`). The runner reported 24 attached worker targets for 4 runs x 6 loads (2 engines x (1 cold + 2 warm) = 6 loads per run).
- Verification that the throttle took effect on the worker's fetches: nspell cold load 1,172 ms in a 1-run probe with the throttle versus 75.9 ms without (same bundle, server and browser); harper.js cold load 76,514 ms median below versus 430 ms in Task 10. 15,170,508 bytes at 200,000 bytes/s is 75.9 s.
- Command: `node scripts/run.mjs --url http://127.0.0.1:60180/ --runs 4 --query "loadOnly=1&warm=2" --throttle 150,1600,750`. Each run is a fresh browser context (empty HTTP cache and site data); within a run each engine loads one cold load and then 2 warm loads, each in a new worker. Every cold load recorded `transferSize > 0` (`firstLoadWasCold` true in 4 of 4 runs, both engines). `errors: []` for both engines in all runs.
- Run counts used: cold load 4; warm load 8 (4 runs x 2); bytes transferred 4 cold and 8 warm. Fewer warm loads per run than Task 10 (2 against 4) because each harper.js load took about 76 s under this profile.

### FR-6 (a) Load time, worker creation to "ready" (ms), throttled

| Engine | Cold | Warm |
| --- | --- | --- |
| nspell | 1,160.0 / 1,154.7 / 1,171.0 (n=4) | 36.9 / 33.4 / 66.7 (n=8) |
| harper.js | 76,514.2 / 76,438.7 / 76,653.4 (n=4) | 76,447.5 / 76,433.3 / 76,583.1 (n=8) |

For comparison, Task 10 unthrottled: nspell cold 48.6, warm 45.8; harper.js cold 430.4, warm 437.1 (medians, ms).

### FR-6 (c) Download size, bytes transferred (Resource Timing), throttled

Cold load (n=4; identical in all 4 runs): nspell 200,562 bytes (worker script 8,365; dictionary 192,197); harper.js 15,170,508 bytes (worker script 23,908; WebAssembly 15,146,600 = 7,533,889 + 7,612,711).

Warm load (n=8; the same value in every load): nspell 0 bytes; harper.js 15,146,600 bytes (worker script 0; both `.wasm` files with the same `transferSize` as cold). These equal Task 10's bytes exactly; the throttle changed the durations, not the byte counts.

### Other FR-6 metrics

Suggestion time (b), memory (d), time to check and re-check (e), correctness (f) and lowest browser version (g) are not measured here and are not repeated: see "Hosted web, localhost" (Task 10), FR-6 (b), (d), (e), (f), (g). They were not run under the throttled profile (UNMEASURED under throttle; the throttled runs used `loadOnly=1`).

## Desktop (Electron)

Task 12. FR-4 (b), FR-6, AC-3. All values MEASURED unless marked UNMEASURED. Cells read `median / min / max (n = runs)`. No cause is stated for any value. The web figures are in "Hosted web, localhost" (Task 10) and are not repeated here except where a row compares.

### Environment record

- Date: 2026-10-25. Git HEAD `a3c9fa6ec905958198392bc134dc8276b54ad245`, branch `feat/spell-checker`; the only uncommitted file used is `scripts/electron-main.mjs` (new). `scripts/driver.mjs`, `build.mjs`, `serve.mjs` unchanged from HEAD.
- Electron version in `electron/package.json`: `^34.5.8` (READ). Installed `electron/node_modules/electron/package.json`: 34.5.8. Runtime `process.versions` of the launched binary: electron 34.5.8, chrome 132.0.6834.210, node 20.19.1, v8 13.2.152.41-electron.0. User agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.210 Electron/34.5.8 Safari/537.36`. Page `crossOriginIsolated` true; `performance.memory` present; `performance.measureUserAgentSpecificMemory` is a function.
- OS: macOS 26.5.1, `darwin 25.5.0 arm64`. Node (server) v24.15.0. Packages: nspell 2.1.5, dictionary-en 4.0.0, harper.js 2.13.0.
- Window: `scripts/electron-main.mjs`, run unpackaged with the workspace binary `electron/node_modules/.bin/electron` (no install, no packaging). `BrowserWindow` `webPreferences`: `contextIsolation: true`, `nodeIntegration: false` (as `electron/src/main.ts:736-740`), plus `backgroundThrottling: false` and a per-run in-memory `partition` (empty HTTP cache for a cold first load). The app's `preload` is not used (the driver needs no bridge); the window is created with `show: false`. Throwaway `userData` under `$TMPDIR` (`app.setPath("userData", ...)` before `ready`; the script refuses any path outside the system temp directory). The real `userData`, `~/Library/Logs/*`, `~/Documents/GetWrite`, `projects/` and port 7340 were not used.
- Server: `scripts/serve.mjs` from the Task 7 bundle (`scripts/build.mjs`), `127.0.0.1:60939` (OS-assigned), brotli, COOP `same-origin`, COEP `require-corp`, same fixtures generator (5,000 / 50,000 / 200,000 words). The Electron window ran outside the Bash sandbox; the server ran inside it. Origin is `http://127.0.0.1:60939`, not the desktop origin `http://localhost:7340`; the page was loaded from the Task 7 server as in Task 10.
- Command (main pass): `electron scripts/electron-main.mjs --url http://127.0.0.1:60939/ --user-data <tmp> --runs 5 --query "warm=4&sizes=5000,50000,200000&sizeRuns=1&recheckRuns=10&suggestReps=5"`. Same driver query and counts as Task 10: each of 5 runs is a fresh window and session; per engine one cold load then 4 warm loads, 5 repetitions x 200 suggestions, one cold-worker check per size, 10 re-checks. Every cold load recorded `transferSize > 0` (5 of 5 runs, both engines). Every run reported `errors: []` for both engines and no `driverError`.
- Run counts actually used: cold load 5, warm load 20, suggestion 5 repetitions x 5 runs = 25, check-from-cold-worker 5 per size (harper.js at 200,000 words: 74.5 to 79.7 s per check; no reduced count was needed), re-check 10 x 5 = 50, bytes 5 cold and 20 warm. Memory by `app.getAppMetrics()` is a separate pass per engine (3 runs each, same query with `engines=<one>`), plus the whole-run figures from the main pass (5 runs).
- Script defects found and fixed while running, recorded for the record: (1) with no `window-all-closed` handler Electron quit when the first run's window was destroyed (the second window's first `loadURL` failed with `ERR_FAILED` and the process exited); the handler was added. (2) Four earlier launches of the main pass therefore stopped after run 0 or 1 (or failed on the first blank-page load) and produced no result file; they are not used. The values below come from the later complete launches only.

### FR-6 (a) Load time, worker creation to "ready" (ms)

| Engine | Cold | Warm |
| --- | --- | --- |
| nspell | 51.4 / 46.2 / 63.7 (n=5) | 47.6 / 43.7 / 57.4 (n=20) |
| harper.js | 458.8 / 446.2 / 486.5 (n=5) | 456.4 / 437.8 / 489.4 (n=20) |

### FR-6 (b) Suggestion time per call, 200 misspellings, 5 repetitions per run (ms)

Per-repetition p50 and p95 over 200 calls; cells are over the 25 repetitions (5 runs x 5). Words with at least one suggestion in the first repetition: nspell 199 of 200, harper.js 199 of 200 (all 5 runs).

| Engine | p50 | p95 |
| --- | --- | --- |
| nspell | 0.730 / 0.650 / 0.920 (n=25) | 1.220 / 1.005 / 1.940 (n=25) |
| harper.js | 0.190 / 0.170 / 0.995 (n=25) | 0.220 / 0.195 / 1.945 (n=25) |

### FR-6 (c) Download size, bytes (Resource Timing)

Cold load (n=5; identical in all 5 runs):

| Engine | Resource | Transferred | Encoded body | Decoded body |
| --- | --- | --- | --- | --- |
| nspell | worker script (`worker-nspell.js`) | 8,365 | 8,065 | 38,448 |
| nspell | dictionary (`index.aff` 1,211 + `index.dic` 190,986 transferred) | 192,197 | 191,597 | 554,848 |
| nspell | total | 200,562 | 199,662 | 593,296 |
| harper.js | worker script (`worker-harper.js`) | 23,908 | 23,608 | 220,827 |
| harper.js | WebAssembly (`harper_wasm_slim_bg.wasm` 7,533,889 + `harper_wasm_bg.wasm` 7,612,711 transferred) | 15,146,600 | 15,146,000 | 40,205,397 |
| harper.js | total | 15,170,508 | 15,169,608 | 40,426,224 |

Warm load, bytes transferred per load (n=20 for the total): nspell 0 (worker script 0, dictionary 0); harper.js 15,146,600 (worker script 0, both `.wasm` files with their cold `transferSize`). These equal the Task 10 values byte for byte. The bytes are from a localhost HTTP server, as in Task 10; the desktop app serves from its bundled local server, so these are not network-throttled figures.

### FR-6 (d) Memory, `app.getAppMetrics()`

Method: `electron-main.mjs` samples `app.getAppMetrics()` every 250 ms during a run and once on a blank `data:` page before the driver starts. Values are `memory.workingSetSize` (reported in KB; shown in MB, 1 MB = 1,024 KB) summed over all Electron processes (Browser, GPU, Utility, Tab), or by process type. "Peak" is the largest sampled value, so a peak between two samples is not seen. `memory.privateBytes` was reported as 0 on this platform for every process, so private memory: UNMEASURED. `performance.measureUserAgentSpecificMemory()` on the page was called (the page is cross-origin isolated) and threw `SecurityError: Failed to execute 'measureUserAgentSpecificMemory' on 'Performance': performance.measureUserAgentSpecificMemory is not available.` in all runs, so it is UNMEASURED in Electron (it returned values on Chromium 148 in Task 10). The worker JS heap is UNMEASURED (`performance.memory` absent in the worker; same as Task 10).

Per-engine passes (3 runs each, one engine per launch):

| Engine | Blank page, all processes | Peak, all processes | Peak minus blank page | Peak, Tab process type |
| --- | --- | --- | --- | --- |
| nspell | 307.5 / 294.8 / 330.2 (n=3) | 404.4 / 395.3 / 409.1 (n=3) | 96.9 / 78.9 / 100.5 (n=3) | 151.8 / 151.6 / 174.1 (n=3) |
| harper.js | 296.3 / 291.2 / 310.2 (n=3) | 757.9 / 746.2 / 762.3 (n=3) | 466.0 / 436.1 / 466.6 (n=3) | 537.7 / 492.4 / 539.4 (n=3) |

The Tab process working set on the blank page was 76.2 to 79.0 MB in the six runs. Peaks of the other process types in the same passes: Browser 120.1 to 135.0 MB, GPU 60.1 to 73.1 MB, Utility 38.9 to 61.2 MB (nspell and harper.js passes together).

Main pass (5 runs, both engines in sequence in one window, so the peak is the larger of the two engines' phases): blank page 292.2 / 290.6 / 307.3 MB (n=5); peak, all processes 705.2 / 698.5 / 786.2 MB (n=5); peak Tab 490.0 / 478.8 / 543.9 MB (n=5).

Page JS heap (`performance.memory.usedJSHeapSize`, MB, n=5, median / min / max; excludes the worker): nspell before any worker 5.32 / 5.24 / 5.32, after load 5.33 / 5.25 / 5.33, after checking 200,000 words 4.56 / 4.52 / 5.76; harper.js 4.26 / 3.61 / 4.30, 3.84 / 3.74 / 3.86, 3.92 / 3.82 / 3.94.

### FR-6 (e) Time to check, from a cold worker (ms), and to re-check one edited paragraph

Check: a new worker is loaded, then one `check` of the whole fixture is timed (1 per run, 5 runs; load time excluded).

| Engine | 5,000 words | 50,000 words | 200,000 words |
| --- | --- | --- | --- |
| nspell | 2 / 2 / 2 (n=5) | 14 / 14 / 19 (n=5) | 64 / 58 / 97 (n=5) |
| harper.js | 646 / 618 / 683 (n=5) | 9,794 / 9,549 / 10,039 (n=5) | 74,933 / 74,479 / 79,744 (n=5) |

Re-check one edited paragraph (136 words, middle paragraph of the 200,000-word fixture with one suffixed word appended; 10 per run on a worker that had already checked the full document; 5 runs):

| Engine | Re-check (ms) |
| --- | --- |
| nspell | 0.06 / 0.04 / 0.15 (n=50) |
| harper.js | 18.41 / 14.49 / 23.48 (n=50) |

The cold-worker check has 5 runs per size (the same as Task 10), not 10; the re-check has 50.

### FR-6 (f) Correctness on the specified fixtures

Identical in all 5 runs, and identical to the Task 10 counts. Fixtures are the unpunctuated Task 5 fixtures. See "Hosted web, localhost" FR-6 (f) for the column definitions.

| Engine | Words | Planted misspellings flagged | Planted names flagged | Unplanted words flagged | Total flagged |
| --- | --- | --- | --- | --- | --- |
| nspell | 5,000 | 100 of 100 | 21 of 25 | 0 | 121 |
| nspell | 50,000 | 992 of 1,000 | 232 of 250 | 0 | 1,224 |
| nspell | 200,000 | 3,974 of 4,000 | 881 of 1,000 | 0 | 4,855 |
| harper.js | 5,000 | 0 of 100 | 0 of 25 | 0 | 0 |
| harper.js | 50,000 | 0 of 1,000 | 0 of 250 | 0 | 0 |
| harper.js | 200,000 | 0 of 4,000 | 0 of 1,000 | 0 | 0 |

The re-check of the edited paragraph flagged 4 words for nspell and 0 for harper.js (all 5 runs). For harper.js with sentence-ending full stops added to the fixture, see "Supplementary experiment: sentence length only" under "Hosted web, localhost" (a cross-reference only; it was not run in Electron).

### FR-6 (g) Lowest runtime version run

Chromium 132.0.6834.210 in Electron 34.5.8 (the version in `electron/package.json`'s range); both engines ran to completion (`errors: []`). Other Electron versions: UNMEASURED, none installed here.

### Size added to the install

Computed by `stat` file sizes (bytes; `find -L ... -exec stat -f %z`) of the files in `frontend/node_modules` as installed, the assets the harness bundle loads at run time:

| Engine | Asset | Bytes |
| --- | --- | --- |
| nspell + dictionary-en | `dictionary-en/index.dic` + `index.aff` (551,762 + 3,086) | 554,848 |
| nspell + dictionary-en | `nspell/lib` (JS source, 12 files) | 26,733 |
| nspell + dictionary-en | `nspell` whole package dir | 42,413 |
| nspell + dictionary-en | `dictionary-en` whole package dir (includes `license` 15,731) | 575,389 |
| nspell + dictionary-en | `is-buffer` 2.0.5 (nspell dependency) | 4,587 |
| nspell + dictionary-en | bundled worker script as built by `build.mjs`, decoded (includes nspell and `is-buffer`) | 38,448 |
| harper.js | `dist/harper_wasm_bg.wasm` + `dist/harper_wasm_slim_bg.wasm` (20,252,229 + 19,953,168), both fetched in the cold load above | 40,205,397 |
| harper.js | `dist/harper_wasm_slim_bg.wasm` alone | 19,953,168 |
| harper.js | bundled worker script as built by `build.mjs`, decoded | 220,827 |
| harper.js | whole `dist/` directory (includes the two inlined variants, not loaded) | 94,092,822 |
| harper.js | `fflate` 0.8.3 (harper.js dependency) | 796,742 |

Sum of the loaded assets plus the built worker script: nspell + dictionary-en 593,296 bytes; harper.js 40,426,224 bytes (equal to the decoded totals in FR-6 (c)). A packaged-app size (`electron-builder`, asar, compression) was not built or measured: UNMEASURED, no packaged build was made. Whether a shipped harper.js would load only the slim `.wasm` was not tested; in this harness both files were fetched.

## Underlines

Task 13. FR-7, AC-4. Page: `scripts/underline-page.html` (8 labelled cases, each holding "recieve teh wrold"), served by `scripts/serve.mjs` from a bundle built by `scripts/build.mjs`, on `127.0.0.1` at an OS-assigned port (63577, server pid 29538, started and stopped by this task by pid). Date 2026-10-25, git HEAD `ed9c4885`. Screenshots are in `specs/features/spell-checker/screenshots/`. Each case was focused (click or `element.focus()`), the End key and one space character were sent, and a screenshot was taken 1.5 s later. Screenshots kept: case 1 and case 3 focused, and one taken after all eight fields had been visited ("all-fields-visited", focus on case 8). Cases 2 and 4 to 7 were each focused in the run; their result is read from the all-fields-visited screenshot. Native underlines are not in the DOM: each underline statement is what was seen in the screenshot; no cause is stated.

### DOM-level fact (MEASURED, both platforms identical)

`getAttribute("spellcheck")` and the `.spellcheck` property, per case, as the browser reported them:

| Case | Element | Attribute | `.spellcheck` |
| --- | --- | --- | --- |
| 1 | contenteditable div | none | true |
| 2 | textarea | none | true |
| 3 | input | none | true |
| 4 | contenteditable div | "false" | false |
| 5 | textarea | "false" | false |
| 6 | input | "false" | false |
| 7 | contenteditable div, in a `spellcheck="false"` container | none | false |
| 8 | textarea, in a `spellcheck="false"` container | none | false |

### Web (Playwright 1.60.0 full Chromium 148.0.7778.96, `channel: "chromium"`, headless, macOS, run outside the sandbox)

All MEASURED; the browser rendered red dotted underlines, so no row is UNMEASURED.

- Case 1, contenteditable, no attribute: "recieve" and "wrold" underlined (`web-chromium-case1-focused.png`).
- Case 2, textarea, no attribute: both words underlined (`web-chromium-all-fields-visited.png`).
- Case 3, input, no attribute: both words underlined while focused (`web-chromium-case3-focused.png`); not underlined after focus moved on (`web-chromium-all-fields-visited.png`).
- Case 4, contenteditable `spellcheck="false"`: no underline after focus (`web-chromium-all-fields-visited.png`). The attribute suppressed the underline.
- Case 5, textarea `spellcheck="false"`: no underline after focus (`web-chromium-all-fields-visited.png`). Suppressed.
- Case 6, input `spellcheck="false"`: no underline after focus (`web-chromium-all-fields-visited.png`). Suppressed.
- Case 7, contenteditable inside a `spellcheck="false"` container, no own attribute: no underline after focus (`web-chromium-all-fields-visited.png`). The ancestor's attribute was inherited (`.spellcheck` false, above).
- Case 8, textarea inside a `spellcheck="false"` container, no own attribute: no underline while focused (`web-chromium-all-fields-visited.png`). Inherited.

### Desktop (Electron 34.5.8, Chromium 132.0.6834.210, `BrowserWindow` shown, `capturePage`, throwaway `userData` under `$TMPDIR` and deleted afterwards, fresh session partition, contextIsolation true, nodeIntegration false; run outside the sandbox)

All MEASURED; red dotted underlines rendered in this window.

- Case 1, contenteditable, no attribute: "recieve" and "wrold" underlined (`desktop-electron-case1-focused.png`).
- Case 2, textarea, no attribute: both words underlined (`desktop-electron-case3-focused.png`, `desktop-electron-all-fields-visited.png`).
- Case 3, input, no attribute: both words underlined while focused (`desktop-electron-case3-focused.png`); not underlined after focus moved on (`desktop-electron-all-fields-visited.png`).
- Case 4, contenteditable `spellcheck="false"`: no underline (`desktop-electron-all-fields-visited.png`). Suppressed.
- Case 5, textarea `spellcheck="false"`: no underline (`desktop-electron-all-fields-visited.png`). Suppressed.
- Case 6, input `spellcheck="false"`: no underline (`desktop-electron-all-fields-visited.png`). Suppressed.
- Case 7, contenteditable inside a `spellcheck="false"` container: no underline (`desktop-electron-all-fields-visited.png`). Inherited.
- Case 8, textarea inside a `spellcheck="false"` container: no underline while focused (`desktop-electron-all-fields-visited.png`). Inherited.

The Electron window ran `scripts/underline-page.html` through a scratch main script (not committed; same safeguards as `scripts/electron-main.mjs`: userData under the system temp directory, reserved ports refused, `127.0.0.1` only).

### Android

The per-case lines are in "Android underlines" (Pixel 7 Pro, Android 17, WebView 155.0.8059.43, Gboard). Summary: no underline was visible in any of the 8 cases, with or without the attribute; the suggestion strip showed "wrold | world" in all 8; typing was not tested.

### AC-4 per platform (Task 17)

| Case | Web (Chromium 148) | Desktop (Electron 34.5.8, Chromium 132) | Android (WebView 155, Gboard) |
| --- | --- | --- | --- |
| contenteditable, no attribute | underlined (`web-chromium-case1-focused.png`) | underlined (`desktop-electron-case1-focused.png`) | not underlined; strip "wrold \| world" (`android-underline-1.png`) |
| textarea, no attribute | underlined (`web-chromium-all-fields-visited.png`) | underlined (`desktop-electron-case3-focused.png`, `desktop-electron-all-fields-visited.png`) | not underlined; strip shown (`android-underline-2.png`) |
| input, no attribute | underlined while focused (`web-chromium-case3-focused.png`) | underlined while focused (`desktop-electron-case3-focused.png`) | not underlined; strip shown (`android-underline-3.png`) |
| contenteditable, `spellcheck="false"` | suppressed | suppressed | not underlined; strip shown (`android-underline-4.png`) |
| textarea, `spellcheck="false"` | suppressed | suppressed | not underlined; strip shown (`android-underline-5.png`) |
| input, `spellcheck="false"` | suppressed | suppressed | not underlined; strip shown (`android-underline-6.png`) |
| contenteditable in a `spellcheck="false"` container | not underlined: inherited | not underlined: inherited | not underlined; strip shown (`android-underline-7.png`) |
| textarea in a `spellcheck="false"` container | not underlined: inherited | not underlined: inherited | not underlined; strip shown (`android-underline-8.png`) |

(Web and desktop screenshot references for cases 4 to 8 are the "all-fields-visited" images named in the two sections above.)

### Facts for later tasks (Task 17)

- Lowest browser version each engine ran on, against the floor `Chrome >= 67` (`frontend/.browserslistrc:11`): web Chromium 148.0.7778.96, desktop Chromium 132.0.6834.210 (Electron 34.5.8), Android System WebView 155.0.8059.43. Both nspell and harper.js ran on all three; nothing below Chromium 132 was run, so whether either engine runs on Chrome 67 to 131 is UNMEASURED.
- Inheritance (FR-28 body backstop input, OQ-11): web and desktop honoured inheritance (cases 7 and 8 not underlined, `.spellcheck` false). On Android no native underline was observed in any case, including cases 1 to 3 with no attribute, so inheritance is not observable there by underline and the `.spellcheck` property was not recorded on Android: all three platforms honouring inheritance is therefore NOT established; two of three are.
- Android keyboard-level underline despite `spellcheck="false"` (FR-27 known gap, OQ-12): no composing or spelling underline was visible in cases 4 to 8; Gboard's suggestion strip appeared ("wrold | world") in cases 4 to 8 as in cases 1 to 3; typing was not tested, so an underline after typing is UNMEASURED.

## Electron localStorage persistence

Date 2026-10-25. Command (repo root, outside the sandbox): `node specs/features/spell-checker/scripts/electron-storage.mjs`.

- `lsof -nP -iTCP:7340 -sTCP:LISTEN` before the run: nothing listening (MEASURED). The script never binds 7340, so the fixed desktop origin `http://localhost:7340` was not used.
- Fixed-origin check at `http://localhost:7340`: UNMEASURED. Reason: the script does not bind 7340, because the owner may start the desktop app on it.
- Stand-in, MEASURED, different origin: `http://localhost:64313` (port chosen by the OS, served by a throwaway Node static server that stayed up for both launches). Electron 34.5.8, Chromium 132.0.6834.210 (workspace `electron/node_modules/.bin/electron`), default session (no partition), `contextIsolation` true, `nodeIntegration` false, window not shown.
- Launch 1 wrote `localStorage["spell-spike-persistence-key"] = "written-1792959997954"` and read it back. The process then exited (graceful `app.quit()`).
- Launch 2, same throwaway `userData` directory (created under `$TMPDIR`, deleted afterwards), read `"written-1792959997954"` from the same origin. `persisted: true`, one run.
- The real desktop `userData`, `projects/` and port 7340 were not touched. Capacitor persistence is recorded from the Android runbook (Task 17).
- Observed while building the script: an ESM main script that awaited `app.whenReady()` at top level never reached ready (two launches killed after 60 s by pid); calling it without the top-level await worked.
- Amendment 2026-10-25 (fixed origin, MEASURED): the packaged probe app on `http://localhost:7340` with a fresh `--user-data-dir` wrote `localStorage["getwrite-spellcheck-enabled"] = "false"` when the App Settings switch was turned off, and after the process was stopped by pid and relaunched with the same `--user-data-dir` it read `"false"`, the switch was unchecked and no `.spell-error` was present. One run. Detail under "Amendment to Task 53" below.

## Recommendation (author's)

This section is the author's recommendation. It is a judgment, not a measurement, and it is not the Decision: the owner decides in the section below. Every number is cited from the sections above; the labels there apply. No cause is stated for any value.

What the recommendation rests on:

1. Correctness on the specified fixtures. harper.js flagged 0 of 100, 0 of 1,000 and 0 of 4,000 planted misspellings on the unpunctuated fixtures (web localhost and desktop, identical in all 5 runs each; Android the same, one run). nspell flagged 100 of 100, 992 of 1,000 and 3,974 of 4,000, with 0 unplanted words flagged. In the supplementary sentence-length experiment (n=1 per cell) harper.js flagged 99 of 100 and 987 to 989 of 1,000 with a full stop every 10 to 40 words, 20 of 100 and 225 of 1,000 with a full stop every 5 words, and 0 with none; the counts varied non-monotonically with sentence length over the values tried, and 7 to 70 unplanted dictionary-stem words were flagged. The cause of the 0, of the drop at every 5 words and of the unplanted flags is not established; the experiments that would discriminate are listed in that section. harper.js was not measured on ordinary prose.
2. Transfer. harper.js transferred 15,170,508 bytes on a cold load and 15,146,600 bytes on every warm load, including the loads after the cold one (the `.wasm` entries carried the same `transferSize` warm as cold, on localhost, throttled and desktop); decoded size is 40,426,224 bytes. nspell transferred 200,562 bytes cold and 0 warm; decoded 593,296 bytes. Under the Fast 3G-like profile (latency 150 ms, 1,600 kbit/s down) harper.js load took a median 76,514.2 ms cold and 76,447.5 ms warm; nspell took 1,160.0 ms cold and 36.9 ms warm.
3. Time to check. From a cold worker, harper.js took a median 72,193 ms (range 71,234 to 128,024) on web and 74,933 ms (74,479 to 79,744) on desktop for 200,000 words, against nspell 67 ms and 64 ms; for 50,000 words 8,965 ms and 9,794 ms against 16 ms and 14 ms. Re-checking one 136-word paragraph took a median 16.41 ms (web) and 18.41 ms (desktop) for harper.js and 0.05 ms and 0.06 ms for nspell.
4. Memory. On web the page-level figure after checking 200,000 words was 278.50 MB for harper.js and 12.38 MB for nspell. On desktop the all-process peak minus a blank page was 466.0 MB for harper.js and 96.9 MB for nspell (medians, n=3). The worker's own heap was not measured.
5. Suggestions and load. Suggestion time was under 3 ms at p95 for both engines on both platforms measured (harper.js p95 0.285 ms web, 0.220 ms desktop; nspell 1.080 ms and 1.220 ms); both returned a suggestion for 199 of 200 words. Unthrottled load was 48.6 ms (nspell) and 430.4 ms (harper.js) cold on web.
6. Android (Pixel 7 Pro, WebView 155.0.8059.43, one run) and what was not measured. harper.js flagged 0 of 100, 0 of 1,000 and 0 of 4,000 planted misspellings on Android too; nspell flagged 100 of 100, 992 of 1,000 and 3,974 of 4,000. Check of 200,000 words took 247,753.4 ms (harper.js) against 224.8 ms (nspell), n=1 each; load median 1,415.8 ms against 190.7 ms (n=21); re-check of one paragraph 52.3 ms against 0.7 ms (n=5). Suggestion p50 was 0.7 ms (harper.js) and 2.0 ms (nspell). Download size and per-engine memory on Android are UNMEASURED (the app PSS of 179,664 to 227,438 KB covers both engines together). The `Chrome >= 67` floor (`frontend/.browserslistrc:11`) was not run: the lowest versions run were Chromium 132.0.6834.210 (desktop), 148.0.7778.96 (web) and 155.0.8059.43 (Android), so whether either engine runs between 67 and 131 is UNMEASURED. Native underlines: `spellcheck="false"` suppressed them and inheritance held on web and desktop; on Android no underline was visible in any case and Gboard's suggestion strip appeared in all 8; typing was not tested. Throttled suggestion, check and memory figures were not taken.

Recommendation: on the figures above, nspell with dictionary-en is the engine the measurements support for adoption: it flagged the planted misspellings on the specified fixtures, transferred 0 bytes warm, and its measured load, whole-document check and re-check times and its memory are lower than harper.js's on every platform measured (suggestion time p50 was lower for harper.js on both platforms). harper.js is not recommended on this evidence because of the 0 flagged on the unpunctuated fixtures with unestablished cause, the non-monotonic dependence on sentence length, the 15 MB transfer on every load on web and desktop, and the 70 to 128 s whole-document check on web and desktop (247.8 s on Android, n=1). This does not show that harper.js is unsuitable on ordinary prose, and it does not show nspell is suitable below Chromium 132 (unmeasured); on the Pixel's WebView 155 the load, check, re-check and flagging figures above were measured once. The recommendation changes if a punctuation experiment shows otherwise.

## Decision

Recorded from the owner's choice at Gate 5, 2026-10-25 (Task 18). Every figure is cited from a section above and carries that section's label; no cause is stated for any value (FR-8, FR-9; OQ-129: no performance limit is chosen in advance).

- Engine chosen: nspell 2.1.5 + dictionary-en 4.0.0, in a classic Web Worker.
- Performance limit, and what it limits (or "none"): none. The 200,000-word check from a cold worker, load time excluded, measured for nspell: 67 ms median on web (Chromium 148.0.7778.96; range 62 to 112, n=5), 64 ms median in Electron 34.5.8 (Chromium 132; range 58 to 97, n=5), and 224.8 ms on Android (Pixel 7 Pro, Android System WebView 155.0.8059.43; n=1). Sources: the "Summary comparison (Task 15)" table, the desktop FR-6 (e) table and the "Android table (FR-6)".
- Minimum WebView or browser version: the existing floor `Chrome >= 67` (`.browserslistrc`, last line of the file) is kept and is not raised (OQ-8, option c). The lowest version run was Chromium 132.0.6834.210 (Electron 34.5.8); the others were Chromium 148.0.7778.96 (web) and WebView 155.0.8059.43 (Android). Chrome 67 to 131 is UNMEASURED for nspell. The FR-26 disable-below-minimum path therefore has no engine-specific cutoff above 67.
- `docs/standards/package-selection.md` justification for each package that will ship (sections 1, 2, 4, 6, 7 and 8 of the standard: the package exists, no existing dependency covers the need, purpose and necessity, registry-verified version, peer and TypeScript compatibility; `@types/nspell` is a devDependency and is not a shipping package):
  - Package 1: `nspell` 2.1.5.
    - Section 1 (exists): installed in `frontend` and run in the harness on all three platforms; licence `"MIT"` in the installed `package.json`, licence file `(The MIT License)`, `Copyright (c) 2016 Titus Wormer` (see "Packages").
    - Section 2 (existing dependencies first) and section 6 (purpose, necessity): the purpose is Hunspell-compatible word checking and suggestions in a worker (FR-1, FR-21). No dependency already in the repository was recorded as covering it (the Packages section records none). The only other engine measured, harper.js, is not chosen (reasons below).
    - Section 4 (minimal dependency): size loaded 593,296 bytes decoded for nspell plus dictionary-en together (554,848 dictionary plus 38,448 built worker script, which includes nspell and its dependency `is-buffer` 2.0.5), from the "Size added to the install" table. Transferred 200,562 bytes cold and 0 warm (web, throttled and desktop).
    - Section 7 (registry verification): version 2.1.5 is the version installed and measured by `pnpm list`. A registry lookup is recorded in "Packages" only for `@types/nspell`; a separate registry record for nspell itself is not recorded there. Maintenance status for nspell is not recorded in "Packages" (nothing is stated here beyond what that section holds).
    - Section 8 (peer and TypeScript): nspell has no `types` field; importing it failed `pnpm typecheck` with TS7016 (exit 2) and passed (exit 0) with `@types/nspell` 2.1.6 installed (MIT, a devDependency). Peer dependency compatibility with React, Next.js and Node is not recorded in "Packages"; the harness ran it in Chromium 132, 148 and 155 only. Its entry is CommonJS (`main: lib/index.js`).
  - Package 2: `dictionary-en` 4.0.0.
    - Section 1 (exists): installed and run in the harness on all three platforms; licence expression `"(MIT AND BSD)"`; licence file begins `en_US Hunspell Dictionary` (see "Packages").
    - Sections 2 and 6: the purpose is the English affix and dictionary data nspell reads. No dependency already in the repository was recorded as providing it. The package is an ES module that reads `index.aff` and `index.dic` through `node:fs/promises` (READ), so the two files are fetched or bundled as assets in the browser (FR-24).
    - Section 4: `index.dic` 551,762 bytes plus `index.aff` 3,086 bytes, 554,848 bytes, the dictionary share of the 593,296 bytes above.
    - Section 7: version 4.0.0 is the version installed and measured by `pnpm list`; no registry lookup for dictionary-en is recorded in "Packages". Maintenance status is not recorded in "Packages".
    - Section 8: bundled types (`index.d.ts`); `import dictionary from "dictionary-en"` typechecked with no error. No `@types` package is needed.
  - Package 3: none, harper.js not shipping. Why harper.js was not chosen, from measured facts only: it flagged 0 of 100, 0 of 1,000 and 0 of 4,000 planted misspellings on the unpunctuated fixtures (web, desktop and Android), and in the supplementary sentence-length experiment its flags varied with sentence spacing (cause not established); it transferred 15,170,508 bytes cold and 15,146,600 bytes on every warm load (web and desktop); the 200,000-word check from a cold worker took 71.2 to 128.0 s on web (median 72.2 s), 74.9 s on desktop (range 74.5 to 79.7 s) and 247.8 s on Android (n=1), a 72 to 248 s range; and the desktop working set was 466.0 MB above a blank page (median, n=3). harper.js was not measured on ordinary prose.
- Owner name: Jedai Saboteur
- Date: 2026-10-25

### Consequence for OQ-11 and FR-28 (Task 18)

Inheritance of `spellcheck="false"` from an ancestor was established on web (Chromium 148) and Electron (Chromium 132) only. On Android no native underline was visible in any of the 8 cases, so inheritance was not observable there (section "Underlines"). Under the OQ-11 rule, the backstop is added only if all three platforms honour inheritance; one platform did not show it, so the `<body spellCheck={false}>` backstop is NOT added. The explicit per-field attributes of FR-28 are unchanged.

Note for Task 39: do not add `spellCheck={false}` to `<body>` in `app/layout.tsx`; OQ-11 resolved against it on this evidence.

### Harness and package removal (FR-10)

The harness under `specs/features/spell-checker/scripts/` stays as the record. It is runnable only for the engine whose packages remain installed; after the owner removes the unchosen packages, the other engine's worker will not build.

These are owner commands, written here and not run by the author. Run from the repository root.

Remove the unchosen engine:

```
pnpm --filter getwrite-frontend remove harper.js
```

or

```
pnpm --filter getwrite-frontend remove nspell dictionary-en
```

Move the chosen engine's packages to `dependencies` (they are installed as `devDependencies`):

```
pnpm --filter getwrite-frontend remove nspell dictionary-en
pnpm --filter getwrite-frontend add nspell dictionary-en
```

or

```
pnpm --filter getwrite-frontend remove harper.js
pnpm --filter getwrite-frontend add harper.js
```

`@types/nspell` stays a `devDependency` if nspell is chosen. After removal the unchosen packages' names must appear in neither `frontend/package.json` nor `pnpm-lock.yaml` (AC-2).

Owner note (2026-10-25): the owner is removing harper.js and re-adding nspell and dictionary-en as dependencies (Task 19).

## Part 0 verification

Task 20 (FR-10, FR-2, AC-1, AC-2). MEASURED on 2026-10-25, main checkout, branch `feat/spell-checker`, HEAD `e16e37ea`, in the sandbox. No cause is written for any value.

### Part 0 diff scope

Part 0 commits are the 18 commits `faaf65ef..e16e37ea` (`git log --format='%h %s' faaf65ef..e16e37ea | wc -l` prints 18): `3fbc1582` (Task 3) through `e16e37ea` (Task 19), including the two Task 9 commits `3a18b638` and `478724d6`. `git diff --stat faaf65ef..e16e37ea` reports 41 files changed, 4493 insertions, 17 deletions. `git diff --name-only faaf65ef..e16e37ea | grep -v '^specs/features/spell-checker/'` prints exactly six paths:

| Path | Commits | Recorded in this file |
|---|---|---|
| `frontend/package.json` | `3fbc1582` (nspell, dictionary-en, harper.js as devDependencies), `a6b64026` (`@types/nspell`), `e16e37ea` (harper.js removed; nspell and dictionary-en to dependencies) | "Packages" (Task 3/4), "Harness and package removal (FR-10)" with the owner note of Task 19 |
| `pnpm-lock.yaml` | same three commits | same sections |
| `android/scripts/build-harness.mjs` | `3a18b638` (`--spell-spike` branch), `478724d6` (separate app id `works.saboteur.getwrite.spellspike`) | "Web Worker in android/harness" (edit table) and "Amended build, run here" |
| `android/harness/spell-spike-entry.ts` | `3a18b638` (new), `478724d6` (comment only) | "Web Worker in android/harness" (edit table) |
| `android/harness/spell-spike/index.html` | `3a18b638` (new) | "Web Worker in android/harness" (edit table) |
| `android/harness/spell-spike/storage-check.html` | `3a18b638` (new) | "Web Worker in android/harness" (edit table) |

Every other changed path is under `specs/features/spell-checker/` (this file, `tasks.md`, `scripts/`, `screenshots/`). Each of the five android and package paths above has a row or section here. No file under `frontend/components`, `frontend/src`, `frontend/app` or `frontend/stories` is in the Part 0 diff.

The Task 1-2 commits are separate and outside that range. `git show --stat 29e3747c` (Task 1) lists one file, `specs/features/spell-checker/experiments.md` (39 insertions). `git show --stat faaf65ef` (Task 2, the `pnpm build:native` fix) lists `experiments.md` and five story files: `frontend/stories/Start/{CreateProjectModal,ImportDocxDialog,ImportScrivenerDialog,ManageProjectMenu,StartPage}.stories.tsx`, one line changed each. The `frontend/stories` edits therefore belong to the separate Task 2 commit and are not Part 0.

### Package state

- `grep -c harper frontend/package.json` prints 0; `grep -c harper pnpm-lock.yaml` prints 0.
- `frontend/package.json` (lines in the file): `dictionary-en` `^4.0.0` at line 78 and `nspell` `^2.1.5` at line 92, both inside `dependencies` (lines 32 to 104); `@types/nspell` `^2.1.6` at line 123, inside `devDependencies` (from line 105).
- `git grep -l "nspell\|dictionary-en\|harper" -- frontend/components frontend/src frontend/app` prints nothing (exit 1).

### Typecheck and knip

- `pnpm typecheck` (from `frontend/`): exit 0.
- `pnpm knip` (repo root): exit 1. Findings by section: Unused files 50; Unused dependencies 3; Unused devDependencies 5; Unlisted dependencies 6; Unlisted binaries 4; Unused exports 160; Unused exported types 174; Duplicate exports 14 (sum 411; plus 6 configuration hints, not counted).
- Baseline: the latest recorded one found is in `specs/features/stale-saves-and-index-races/experiments.md` ("knip delta closed"): 49 / 1 / 4 / 6 / 4 / 160 / 174 / 14 = 412 in the section order above; it was taken on another branch and is not a Feature 95 baseline, so a Feature 95 baseline is unestablished. Compared with it, three sections differ: Unused files 50 (+1: `android/harness/spell-spike-entry.ts`, which is Task 9), Unused dependencies 3 (+2: `dictionary-en` `frontend/package.json:78`, `nspell` `frontend/package.json:92`; the third is `typedoc`), Unused devDependencies 5 (+1: `@types/nspell` `frontend/package.json:123`; the other four are `@capacitor/filesystem`, `@better-auth/cli`, `@eslint/eslintrc`, `next-devtools-mcp`). The three package findings are the packages nothing in the app imports yet; knip was not changed.

### Harness with harper.js uninstalled

Run from the repo root, harper.js absent from `frontend/node_modules`:

- `node specs/features/spell-checker/scripts/build.mjs --out $TMPDIR/t20bundle`: exit 1. `driver.bundle.js` (14.3 kb) and `worker-nspell.js` (37.5 kb) were written; the harper step failed with `Could not resolve "../../../../frontend/node_modules/harper.js/dist/index.js"` and `Could not resolve "../../../../frontend/node_modules/harper.js/dist/binary.js"` (both from `scripts/worker-harper.mjs`, lines 5 and 6). No `worker-harper.js` was produced.
- `node specs/features/spell-checker/scripts/worker.check.mjs`: exit 1; 7 tests, 4 passed, 3 failed. Passed: `nspell: ready after init, then check and suggest`; `nspell: malformed and early requests get an error reply, not silence`; `protocol exports its message types and tokenizer`; `workers import no application module and take no timings`. Failed: `harper: ready after init, then check and suggest` and `harper: malformed and early requests get an error reply, not silence`, each with `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../frontend/node_modules/harper.js/dist/index.js' imported from .../scripts/worker-harper.mjs`; and `both engines use identical message shapes` with an `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal`.
- `node specs/features/spell-checker/scripts/fixtures.check.mjs`: exit 0; 5 tests, 5 passed.
- READ, not run: `android/scripts/build-harness.mjs --spell-spike` (line 55) imports `buildBundle` from `scripts/build.mjs`, which is the build that exited 1 above; the Android `--spell-spike` branch was not run (no `cap`, no gradle), so whether it exits non-zero is UNMEASURED. The other scripts that name harper.js (`driver.mjs`, `driver.html`, `protocol.mjs`, `serve.mjs`) were not run here.

The harness is runnable only for the remaining engine, nspell. Fixture generation works for both. The harper.js worker, its bundle step and the three tests above fail; the scripts were left unchanged and stay as the experiment record (measurements above are not rewritten).

## Task 31: nspell adapter, worker entry and assets

Date 2026-10-25. Main checkout, branch `feat/spell-checker`, Next.js 16.2.6 (Turbopack), Node v24.15.0.

### How the worker and assets are emitted (MEASURED)

- Source: `frontend/src/lib/spelling/spell.worker.ts` (entry), `engine-nspell.ts` (adapter), `serialize-requests.ts`, `create-spell-worker.ts` (`new Worker(new URL("./spell.worker.ts", import.meta.url))`, no `type` option, so a classic worker). The two dictionary files are referenced as `new URL("../../../node_modules/dictionary-en/index.aff", import.meta.url)` and `.../index.dic`; nothing is copied into the tracked tree and no copy step exists. `next.config.mjs` is unchanged.
- A probe page (`frontend/app/spell-probe/page.tsx`, a client component that imported `createSpellWorker`, later also a client built on `createSpellClient`) was added temporarily so the worker was in the module graph, then deleted. `cd frontend && pnpm build`: exit 0 (with the probe, three runs; without it, exit 0). No consumer of `createSpellWorker` exists in the committed tree yet, so a `next build` of the committed tree does not emit the worker; the emitted-asset test in `frontend/tests/spellEngineAdapter.test.ts` skips itself when no built chunk references the `.aff` file.
- Web build with the probe, `frontend/.next/static`: `chunks/turbopack-worker-0sjn--fhq~1cg.js` (worker bootstrap), the engine chunk `chunks/0p.nylhdc.q9x.js` (13,012 bytes), `media/index.0_qr_d9pp33w1.aff` (3,086 bytes) and `media/index.10xdz.pv.cbcu.dic` (551,762 bytes), both byte sizes equal to the files in `node_modules/dictionary-en`. The engine chunk holds the paths `/_next/static/media/index.0_qr_d9pp33w1.aff` and `/_next/static/media/index.10xdz.pv.cbcu.dic`. The build also emitted a copy of the worker source as `media/spell.worker.10wj-~.dawa7n.ts` (1,281 bytes), which is not requested at run time.
- `pnpm build:native` with the probe: exit 0. `frontend/out/_next/static` holds the same worker bootstrap (818 bytes), engine chunk (13,675 bytes), `.aff`, `.dic` and a `spell.worker.*.ts` source copy (1,391 bytes). Task 32 still owns the recorded verification.
- Standalone output (`frontend/.next/standalone`) does not hold `.next/static`; `electron/electron-builder.yml` lines 14 and 15 copy `../frontend/.next/static` to `frontend/.next/standalone/frontend/.next/static`. READ, not run.
- A stale `frontend/out/` holding the emitted `spell.worker.*.ts` made the next `pnpm build` fail type checking (`Cannot find module './engine-nspell'` in `out/_next/static/media/spell.worker.*.ts`). `"out"` was added to `exclude` in `frontend/tsconfig.json`; with the stale `out/` present, `pnpm build` then exited 0.

### Run in a browser (MEASURED)

`pnpm exec next start -p 4311` of the probe build, Playwright Chromium (headless shell, run outside the sandbox), page checked `"I recieve teh letter, don’t worry."`: events `ready`, then `result` with unknown words `recieve` (offsets 2 to 9) and `teh` (10 to 13), and `suggest("recieve")` returned `["receive","relieve"]`. Requests made: the origin `http://localhost:4311` only, including the worker script and both dictionary files. Before `serialize-requests.ts` was added the same page reported `unavailable` with reason `the spelling engine is not isLoaded`: the client posts `init` and `check` back to back and the async handler ran the `check` before `init` finished. Second run after the change: as above.

### Third-party requests (MEASURED)

- The engine chunk and the worker bootstrap chunk contain no `http://` or `https://` string (`grep -o 'https\?://...'`: no output). The emitted-asset test asserts this on the `.aff`-referencing chunk when a build exists.
- The adapter's loader (`createFetchAssetLoader`) rejects a URL whose origin differs from `self.location.origin` before any request; unit-tested.

### is-buffer in the emitted worker bundle (MEASURED)

The engine chunk `0p.nylhdc.q9x.js` contains the function body `function(e){return null!=e&&null!=e.constructor&&"function"==typeof e.constructor.isBuffer&&e.constructor.isBuffer(e)}`, the body of `is-buffer` (nspell's dependency, MIT). The string `isBuffer` occurs twice in the chunk. The minified chunk carries no licence comment. The licence notice (`frontend/public/THIRD_PARTY_SPELLCHECK.txt`) was not changed in this task.

### Debounce interval

`SPELL_DEBOUNCE_MS = 300` (`engine-nspell.ts`). Part 0 figures for nspell used: 200,000-word check from a cold worker 67 ms (web), 64 ms (Electron), 224.8 ms (Android, n=1); about 3 ms per 5,000 words; re-check of one 136-word paragraph 0.05 ms (web) and 0.7 ms (Android). 300 ms is greater than the longest of those measured checks (224.8 ms). It is a chosen value, not a measured one. The Decision sets no performance limit, so none is implemented.

## Task 32: worker and assets in the web build, standalone server and native export

Date 2026-10-25. Main checkout, branch `feat/spell-checker`, Next.js 16.2.6 (Turbopack), Node v24.15.0. Port check before starting: `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` printed nothing.

### Probe (temporary)

No app module imports `createSpellWorker` yet, so a build of the committed tree does not emit the worker. A temporary probe page `frontend/app/spell-probe/page.tsx` (a client component that calls `createSpellClient({ createWorker: createSpellWorker })` and one `check`) was added for the three builds and then deleted; `git status --short` after deletion shows no probe file. This is a probe, not the real wiring: the real wiring (Task 36) is re-verified in Task 53. The first probe version used an `@/` import that does not resolve in this repo (`pnpm build` exit 1, module not found at `app/spell-probe/page.tsx`); it was changed to relative imports. No build config file was changed in this task.

### 1. Web build (MEASURED)

`cd frontend && pnpm build`: exit 0. In `frontend/.next/static`:

- Worker script chunk: `chunks/turbopack-worker-0sjn--fhq~1cg.js`, referenced from client chunk `chunks/14vs-ueic127f.js`.
- Engine chunk `chunks/0_xtchudgt-st.js` (holds the two `/_next/static/media/index.*` paths).
- `media/index.0_qr_d9pp33w1.aff` (3,086 bytes) and `media/index.10xdz.pv.cbcu.dic` (551,762 bytes); `cmp` against `node_modules/dictionary-en/index.aff` and `index.dic`: identical.
- A copy of the worker source `media/spell.worker.0sz-vkceg-mes.ts` (1,391 bytes), not requested at run time.

`pnpm exec vitest run tests/spellEngineAdapter.test.ts --reporter=verbose` with this build present: 14 passed, 0 skipped; the test "references both dictionary files by same-origin path and no third-party URL" ran and passed (it skips when no built chunk references the `.aff` file).

### 2. Standalone output used by Electron (MEASURED)

- `frontend/.next/standalone/frontend/server.js` exists; `frontend/.next/standalone/frontend/.next/static` does not exist. `electron/electron-builder.yml` copies `../frontend/.next/static` to `frontend/.next/standalone/frontend/.next/static` (extraResources, read, not run; electron-builder was not run).
- Replica: `.next/standalone` copied to a directory under `$TMPDIR`, `.next/static` copied to `<replica>/frontend/.next/static` (the electron-builder mapping), server started with `PORT=4322 HOSTNAME=127.0.0.1 GETWRITE_PROJECTS_DIR=<throwaway dir under $TMPDIR> node server.js`, then stopped by pid; the replica and throwaway dir were deleted. Responses:
  - `/_next/static/chunks/turbopack-worker-0sjn--fhq~1cg.js`: 200, 818 bytes, `application/javascript`
  - `/_next/static/chunks/0_xtchudgt-st.js` (engine): 200, 13,734 bytes
  - `/_next/static/media/index.0_qr_d9pp33w1.aff`: 200, 3,086 bytes, `application/octet-stream`
  - `/_next/static/media/index.10xdz.pv.cbcu.dic`: 200, 551,762 bytes, `text/x-c; charset=UTF-8`
  - `/spell-probe`: 200
- The run printed `Couldn't load fs` and `Couldn't load zlib` on start-up; not investigated.
- The standalone run did not execute the worker in a browser; the browser run of Task 31 was against `next start`.

### 3. Native export (MEASURED)

`cd frontend && pnpm build:native`: exit 0 ("Native static export produced at .../frontend/out (21 top-level entries)"). In `frontend/out/_next/static`:

- `chunks/turbopack-worker-0sjn--fhq~1cg.js` (818 bytes), engine chunk `chunks/10na21_gh7_zi.js` (13,675 bytes, holds both `/_next/static/media/index.*` paths), `media/index.0_qr_d9pp33w1.aff` (3,086 bytes), `media/index.10xdz.pv.cbcu.dic` (551,762 bytes), `media/spell.worker.0sz-vkceg-mes.ts` (1,391 bytes).
- `out/spell-probe.html` present. Served with `python3 -I -m http.server 4323 --bind 127.0.0.1` from `frontend/out` (stopped): worker chunk 200 (818), engine chunk 200 (13,675), `.aff` 200 (3,086), `.dic` 200 (551,762), `/spell-probe.html` 200.
- Not run: the worker executing inside the Capacitor WebView (Android); the static server was fetched with curl only.

## Task 52: THIRD_PARTY_SPELLCHECK.txt in the four outputs

Date 2026-10-25. Main checkout, branch `feat/spell-checker`, HEAD `108ef780`, tree clean before the run. Builds ran outside the command sandbox with `GETWRITE_PROJECTS_DIR` set to an empty `mktemp -d` folder. `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` before and after: empty. No consumer of `createSpellWorker` is needed for this check (the file is a `public/` asset), so no probe was used.

Commands: `cd frontend && pnpm build` (exit 0); `pnpm build:native` (exit 0, "Native static export produced at .../frontend/out (18 top-level entries)"); `cd electron && pnpm build && pnpm build:worker` (exit 0), then `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --config electron-builder.yml --dir --mac --arm64 -c.directories.output=<mktemp -d> -c.productName=GetWriteT52Probe -c.appId=works.saboteur.getwrite.t52probe` (exit 0; electron-builder 25.1.8, electron 34.5.8, signing skipped). The packaged app was a throwaway name and output folder under `$TMPDIR`, deleted afterwards; nothing under `~/Library/Application Support`, `~/Documents` or the repo `projects/` was read or written, and the packaged app was not launched. `cmp` compared each copy with the repo-root `THIRD_PARTY_SPELLCHECK.txt`.

| Output | Path checked | Result |
| --- | --- | --- |
| Web build output | `frontend/.next` (excluding `standalone`) | `find` returns no file. Next.js does not copy `public/` into `.next`; the only copies under `.next` are inside `standalone`. The source `frontend/public/THIRD_PARTY_SPELLCHECK.txt` is identical to the root file (`cmp`). The web build serves `public/` from `frontend/public`, which holds the file: PRESENT at the served path (MEASURED), ABSENT from `.next` itself (MEASURED). |
| Standalone server output | `frontend/.next/standalone/frontend/public/THIRD_PARTY_SPELLCHECK.txt` | PRESENT (MEASURED), `cmp` identical to the root file |
| Native export | `frontend/out/THIRD_PARTY_SPELLCHECK.txt` | PRESENT (MEASURED), `cmp` identical |
| Packaged Electron resources (mac arm64, unpacked `--dir`) | `GetWriteT52Probe.app/Contents/Resources/THIRD_PARTY_SPELLCHECK.txt` (the new `extraResources` entry) | PRESENT (MEASURED), `cmp` identical. Also present, identical, at `Contents/Resources/frontend/.next/standalone/frontend/public/THIRD_PARTY_SPELLCHECK.txt`. |

Not measured: the dmg, Windows and Linux packages (`--dir` mac arm64 only); the file inside a running app.

Observation: `frontend/.next/standalone/frontend/out/THIRD_PARTY_SPELLCHECK.txt` and the same path under the packaged `Resources/frontend/.next/standalone/frontend/out/` exist, i.e. the standalone output (and so the package) contains a copy of `frontend/out`, which was on disk from an earlier native build when `pnpm build` ran. Not investigated further.

### is-buffer (open item from Task 51)

`is-buffer` 2.0.5 (licence `MIT`, `Copyright (c) Feross Aboukhadijeh`, per its installed `package.json` and `LICENSE`) is a dependency of `nspell` 2.1.5 and its function body is in the emitted engine chunk (Task 31 section). `THIRD_PARTY_SPELLCHECK.txt` does not name it (grep for `is-buffer`: no match), and `frontend/package.json` `dependencies` does not list it (it is transitive). FR-42 requires naming each package that ships, and the MIT text requires its copyright notice to accompany copies of the code, so on this evidence the notice should name it. Recommendation (a decision for the owner, not made here): add a `Package: is-buffer@2.0.5` entry with its copyright line; the MIT text is already in the file once. FR-44 as written ("names no package absent from `dependencies`") would then need an exception for bundled transitive packages. The notice and `third-party-spellcheck.test.ts` are unchanged by this task.

## Task 53: offline check on built web and packaged desktop

Date 2026-10-25. Main checkout, branch `feat/spell-checker`, tree clean before the run (the new file is the screenshot). `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` before and after: empty. Real editor wiring in place (Task 36), so the worker is emitted by a normal build, no probe page.

### Built web app (MEASURED)

- Build: `cd frontend && GETWRITE_PROJECTS_DIR=<mktemp -d under $TMPDIR>/projects pnpm build` (outside the sandbox), exit 0. `.next/static/chunks/turbopack-worker-0sjn--fhq~1cg.js` and `.next/static/media/index.0_qr_d9pp33w1.aff` / `index.10xdz.pv.cbcu.dic` are present.
- Served with `pnpm exec next start -p 4391 -H 127.0.0.1` (node pid 64744, parent pnpm pid 64737; both stopped by pid, port 4391 clear afterwards), `GETWRITE_PROJECTS_DIR` the throwaway folder. Next printed the warning that `next start` does not work with `output: standalone`; the server ran and served the build.
- Throwaway project created through the app's own routes: `POST /api/projects` (`blank`), then `POST /api/resource` with the text `The quick brwon fox jumps over the lazy dog.` The throwaway folder was deleted afterwards. The repo `projects/`, `~/Library/Application Support/getwrite-electron` and `~/Documents/GetWrite` were not read or written.
- Driver (Playwright 1.60.0, full Chromium, `channel: "chromium"`, headless, outside the sandbox): open the project, open the resource, wait for `.spell-error`, then `context.setOffline(true)` after the page, worker and both dictionary files had loaded.

| Step | Observed |
| --- | --- |
| Online, after load | `.spell-error` spans: `brwon`. Worker created from `/_next/static/chunks/turbopack-worker-0sjn--fhq~1cg.js` |
| After `setOffline(true)` | `fetch("/api/projects")` from the page: `failed: Failed to fetch` (so the context was offline) |
| Offline, planted word | `.spell-error` spans: `brwon` |
| Offline, typed ` Anothr mispeling here.` at the end | `.spell-error` spans: `brwon`, `Anothr`, `mispeling` |

Network log (`page.on("request")`, whole run, 60 requests): distinct origins `["http://127.0.0.1:4391"]`; requests to any other host: none. Worker script, `.aff` and `.dic` were requested in the online phase only. The one request logged in the offline phase is the driver's own `/api/projects` probe `fetch`; no request from the page or the worker to a non-local origin. Screenshot: `specs/features/spell-checker/screenshots/offline-web-chromium.png`. Driver script: not kept in the repo (scratchpad).

Not measured: that the autosave of the typed words failed or queued while offline (not looked at; unrelated to FR-24).

### Packaged desktop app (UNMEASURED)

Reason: the packaged app cannot be launched without taking port 7340. `electron/src/server-config.ts` exports `PORT = 7340`; `electron/src/main.ts` passes it to the forked server (`PORT: serverPortEnv(PORT)`), the window URL, the readiness check and the navigation guard, and the electron guide says there is no override and no fallback. This task's limits forbid port 7340, so the packaged binary was not built or launched and no packaged-app observation is claimed. A throwaway `userData` and `workspace.json` would have kept the data out of the owner's folders, but the port is the blocker, not the workspace.

What does hold from earlier tasks, and is not an offline observation: the standalone output serves the worker and both dictionary files (Task 32, section 2), and the packaged resources hold the standalone output (Task 52). Settling the packaged case needs either a run on a machine where 7340 may be used (owner step: launch the packaged app with the network off, plant a misspelling, observe `.spell-error`, read the request log) or a port override in `server-config.ts`, which is a code change outside this task.

### Amendment to Task 53: packaged desktop app, one-time use of port 7340 (MEASURED)

Date 2026-10-25. The owner approved port 7340 for this one run and confirmed their app was not running. `lsof -nP -iTCP:7340 -sTCP:LISTEN` immediately before each launch: empty (exit 1). The statement above that the packaged app was not built or launched describes the earlier run; this amendment supersedes its UNMEASURED verdict for the items below.

Build (outside the sandbox): `cd frontend && GETWRITE_PROJECTS_DIR=<mktemp -d>/buildprojects pnpm build` (exit 0); `cd electron && pnpm build && pnpm build:worker` (exit 0); `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --config electron-builder.yml --dir --mac --arm64 -c.directories.output=<mktemp -d>/pkg -c.productName=GetWriteT53Probe -c.appId=works.saboteur.t53probe` (exit 0; electron-builder 25.1.8, Electron 34.5.8, Chromium 132.0.6834.210, unsigned). The standalone output again contained a copy of the stale `frontend/out` (as recorded under Task 52); not investigated.

Launch: `GetWriteT53Probe --user-data-dir=<tmp>/ud --remote-debugging-port=9333`, with `<tmp>/ud/workspace.json` = `{"projectsDir":"<tmp>/ws"}` written beforehand. The app log printed `projectsDir: <tmp>/ws`; afterwards `<tmp>/ws` held the two project folders created and `<tmp>/ud` held the Chromium profile files and `workspace.json` (inspected there, not in the real folders). Driver: Playwright 1.60.0 `chromium.connectOverCDP`, outside the sandbox. Launch 1: app pid 4737, forked server pid 4801. Launch 2: app pid 12818, server pid 12827. Both stopped with `kill <app pid>`; after each stop 7340 and 9333 showed no listener.

Project data: `POST /api/projects` and `POST /api/resource` from inside the page (so the window header applied) against `http://localhost:7340`. A first attempt passed the project `id` as `projectId` and got `Project not found` (the route wants the folder name under the projects dir); this left an extra empty project `T53 throwaway`. The resource `Offline note` (`The quick brwon fox jumps over the lazy dog.`) went into the second one.

| Step | Observed |
| --- | --- |
| Page origin | `http://localhost:7340` |
| Online, after load | `.spell-error`: `brwon`. Worker requested from `http://localhost:7340/_next/static/chunks/turbopack-worker-0sjn--fhq~1cg.js` |
| After CDP `Network.emulateNetworkConditions` offline on the page | `fetch("/api/projects")` from the page: `failed: Failed to fetch` |
| Offline, planted word | `.spell-error`: `brwon` |
| Offline, typed ` Anothr mispeling here.` | `.spell-error`: `brwon`, `Anothr`, `mispeling` |

Request log (Playwright context `request` events 118 and CDP `Network.requestWillBeSent` on the page 56, whole run): distinct origins `["http://localhost:7340"]`; requests to anything other than `localhost:7340`, `127.0.0.1:7340`, `data:` or `blob:`: none. The one request logged in the offline phase is the driver's own `/api/projects` probe. The `.aff` and `.dic` requests did not appear in the CDP page log (only the worker script did); I did not print the context-level log filtered for them, so their fetch by the worker is not shown by this run. Screenshot: `screenshots/offline-desktop-packaged.png`. Driver script not kept in the repo (scratchpad).

Switch persistence across a relaunch on `http://localhost:7340` (same `--user-data-dir`):

| Moment | UI switch `Check spelling while I write` | `localStorage["getwrite-spellcheck-enabled"]` | `.spell-error` count |
| --- | --- | --- | --- |
| Launch 1, before the click | checked | `null` (never written) | 1 or more (`brwon`) |
| Launch 1, after clicking the switch in App Settings | unchecked | `"false"` | 0 |
| Launch 2 (after process stop and relaunch), page load | not yet opened | `"false"` | 0 (4 s after opening the resource) |
| Launch 2, App Settings opened | unchecked | `"false"` | 0 |

Screenshot: `screenshots/desktop-packaged-switch-off-after-relaunch.png`. One run each, not repeated.

Not measured: that the same holds after a quit through the window close button (the process was ended with `kill`, SIGTERM); the dmg and other platforms; whether the app wrote to its log path (`app.getPath("logs")` is outside `--user-data-dir` and was not looked at, because that folder is outside the permitted ones, so a line appended there by the probe's launches is possible and unchecked).

Cleanup: `<tmp>` (build, packaged app, `ud`, `ws`) deleted; `ls` of it reports no such directory; 7340 and 9333 free; `pgrep` for the probe app: none.

## Final suites (Task 56, 2026-10-25)

Note: this section is the final-suites run done before the Stage 6.5 renumbering; it corresponds to what is now Task 62's earlier run.

Tree: branch `feat/spell-checker`, main checkout, HEAD `0ad1f835`. Raw outputs are in the session scratchpad, not the repo. Node and pnpm as installed; sandbox on except where stated.

### Suites

| Check | Where | Result |
| --- | --- | --- |
| `pnpm typecheck` | `frontend/` | exit 0 |
| `pnpm lint` | `frontend/` | exit 0; 392 problems, 0 errors, 392 warnings |
| `pnpm test:ci` | `frontend/` | exit 0; 699 files passed; 8678 passed, 7 expected fail, 1 skipped (8686) |
| `pnpm test:e2e` | `frontend/`, outside the sandbox | exit 0; 230 passed, 1 skipped, 0 failed (1.4m) |
| `pnpm knip` | repo root | exit 1; see below |
| `pnpm test` | `cli/` | exit 0; 23 files, 153 passed |
| `pnpm test` | `electron/` | exit 0; 34 files, 528 passed |
| `pnpm typecheck` | `electron/` | exit 0 |

`lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` before and after `test:e2e`: empty, exit 1 both times. No 6006 held.

The four-file un-export edit below was made after the e2e run; `test:ci` (same counts) and `typecheck` were re-run after it, `test:e2e` was not.

### Diff against main

`git diff main --stat -- cli electron android`: only `electron/electron-builder.yml`, 5 insertions (3 comment lines plus the `THIRD_PARTY_SPELLCHECK.txt` `from`/`to` pair). Nothing under `cli/` or `android/`.

### knip against main

Method: `git worktree add --detach <TMPDIR>/main-baseline main` (main at `49c4f879`), the five existing `node_modules` directories symlinked in, `pnpm knip` at its root. It ran (exit 1). Per category, main / this branch before the edit / this branch after:

| Category | main | branch before | branch after |
| --- | --- | --- | --- |
| Unused files | 49 | 49 | 49 |
| Unused dependencies | 1 | 1 | 1 |
| Unused devDependencies | 6 | 4 | 4 |
| Unlisted dependencies | 6 | 6 | 6 |
| Unlisted binaries | 4 | 4 | 4 |
| Unused exports | 160 | 162 | 160 |
| Unused exported types | 174 | 178 | 174 |
| Duplicate exports | 14 | 14 | 14 |
| Configuration hints | 6 | 6 | 6 |

Comparison by name and file basename (line numbers ignored). New on the branch before the edit (6): types `ExtractedWordPart` (`extract-words.ts`), `PausedKind`, `SpellingAvailabilityState`, `UnavailableKind` (`spellingAvailabilitySlice.ts`); exports `SPELLCHECK_NOT_SAVED_TOAST_ID` (`spellcheck-preference.ts`), `httpProjectSpellingTransport` (`project-spelling.ts`). Each had no other import in the repo (`git grep`); this feature added all six. They were un-exported (the `export` keyword removed, 6 lines in 4 files); after that the per-category counts equal main and a name comparison showed no finding that main lacks. `nspell`, `dictionary-en`, `@types/nspell` and `spell.worker.ts` are not flagged (`knip.json` has the one `frontend` entry for the worker, added earlier with a comment).

Gone on the branch (2): unused devDependencies `@capacitor/android` and `@capacitor/core` in `android/package.json`, flagged on main. `android/` is unchanged on the branch, so the cause of the difference is not established; one experiment would be to run knip on the branch with `knip.json` reverted to main's.

knip exits 1 on main as well (non-zero baseline), so "exit 0" in the task's done_when does not hold on main either; the result here is count parity with main.

### aria-hidden-focus, `EditorContextMenu` stories

Command `pnpm test-storybook EditorContextMenu` in `frontend/`, outside the sandbox.
- This branch: 2 failed, 6 passed (8). `Default` and `Empty Selection Disabled` failed with axe `aria-hidden-focus` ("ARIA hidden element must not be focusable or contain focusable elements"), on `div[data-aria-hidden="true"][aria-hidden="true"]`.
- main worktree: UNMEASURED. The run failed before any story ran: `Failed to import test file .../node_modules/.pnpm/@storybook+addon-vitest.../...` with `TypeError: Failed to fetch dynamically imported module: http://localhost:63315/Users/jedaisaboteur/Repositories/getwrite/node_modules/.pnpm/...` (the symlinked `node_modules` resolves to a path outside the worktree root). I did not edit the worktree's config to get around it, so whether the two stories fail on main is not established.

### Cleanup

Symlinks unlinked, worktree removed and pruned; `git worktree list` shows only the main worktree; no listener on 7340, 3000 or 6006. Whether the tool wrote caches through the symlinks into the shared `node_modules` was not checked.

### Not done

PR text naming the missing user list as a known gap is outside this task. Task 54 (phone check) not touched.

## Phone offline (Task 54, lead, 2026-10-25)

Screenshots are in the lead's scratchpad, not the repo. Each item below is MEASURED unless marked UNMEASURED.

### Device and build

- MEASURED: Pixel 7 Pro, Android 17, Android System WebView 155.0.8059.43, Gboard.
- MEASURED: debug APK of HEAD `e272b5fe` built by `pnpm build:native`, `pnpm run sync` and `assembleDebug`; 10,108,403 bytes; signer SHA-256 `72d9e5d4...b98818` equal to the installed app's. `adb install -r` returned Success; lastUpdateTime went from 2026-10-05 12:48:18 to 2026-10-25 19:38:18.
- MEASURED: owner data after the update: the start page showed 5 active projects, 12 writing assets, 38 folders, the same as before the install. Owner projects were not opened.

### Offline state

- MEASURED: `settings get global airplane_mode_on` = 1; `dumpsys connectivity` reported "Active default network: none"; `ping 8.8.8.8` from the device was unreachable. The owner toggled airplane mode.
- MEASURED: the app launched after force-stop while offline (twice more later) and the start page rendered.

### Stage 6.5 defect fact (new project versus Open project)

- MEASURED: throwaway project "Spellcheck Offline Test" created via Start a new project; "recieve teh wrold" typed in Scene 1: 0 `.spell-error` (CDP `Runtime.evaluate` over adb-forwarded `webview_devtools_remote`); `localStorage['getwrite-spellcheck-enabled']` was null; the `.ProseMirror` `spellcheck` attribute was `'false'`; resource timing (57 entries, buffer not full) had no `turbopack-worker-*.js` request. Recorded as the Stage 6.5 defect: FR-46, Task 56.
- MEASURED: after force-stop and relaunch (offline) and Open project on the same project, `.spell-error` marks were on recieve, teh and wrold (screenshot-checked).
- So a newly created project showed 0 marks while the same project opened via Open project showed 3. The re-check after the fix is Task 61.

### Long-press (touch)

- MEASURED: long-press (about 900 ms) on "wrold" selected the word and opened the app `EditorContextMenu` (Cut, Copy, Paste, Bold, Italic, Underline, Strikethrough, Inline Code, Select All) with no spelling group. This is the FR-47 defect; fixes are Tasks 57-61. Cause not established.

### Settings and switch persistence

- MEASURED: Project Settings, Spelling tab rendered offline, "Project dictionary (0)". App Settings, "Check spelling while I write" rendered, checked.
- MEASURED: switch turned off: underlines cleared immediately. After force-stop and relaunch (offline), reopening the project and Scene 1 showed no underlines, `localStorage` = `'false'`, switch unchecked, 0 marks.
- MEASURED: switch turned on: `localStorage` `'true'`, marks on recieve, teh, wrold.
- So the switch setting persisted across a relaunch on the phone (FR-34, FR-24).

### Side observations (not this feature)

- MEASURED: Create Project with "blank" typed in the type search showed "Blank" in the select but the helper text kept Novel's description, and the project was created as `novel` (POS task_2191963a).
- MEASURED (a build-artifact fact, not a defect claim): `out/_next/static/media/spell.worker.0sz-vkceg-mes.ts` is raw TS source shipped as a media asset (served as video/mp2ts). The app's worker is created from module 88073, which loads `turbopack-worker-0sjn--fhq~1cg.js`; the stray asset is referenced only by module 88872, which nothing was observed to use. It is present in `.next` too.

### Cleanup

Throwaway project deleted via its card menu; the start page was back to 5/12/38; the switch was left on; the devtools forward was removed.
