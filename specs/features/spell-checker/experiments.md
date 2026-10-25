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

Consolidation of the detailed sections below; no new measurement. Every value is copied from the section named in its row and carries that section's label (MEASURED unless marked). Cells read `median (min to max), n`. No cause is stated for any value. The detailed sections remain the record.

| Metric | Engine | Web localhost (Chromium 148) | Web throttled (Fast 3G-like) | Desktop (Electron 34.5.8, Chromium 132) | Android (Pixel 7 Pro) |
| --- | --- | --- | --- | --- | --- |
| Cold load, ms | nspell | 48.6 (38.3 to 77.0), n=5 | 1,160.0 (1,154.7 to 1,171.0), n=4 | 51.4 (46.2 to 63.7), n=5 | pending owner run |
| Cold load, ms | harper.js | 430.4 (425.8 to 691.7), n=5 | 76,514.2 (76,438.7 to 76,653.4), n=4 | 458.8 (446.2 to 486.5), n=5 | pending owner run |
| Warm load, ms | nspell | 45.8 (35.1 to 72.6), n=20 | 36.9 (33.4 to 66.7), n=8 | 47.6 (43.7 to 57.4), n=20 | pending owner run |
| Warm load, ms | harper.js | 437.1 (422.8 to 842.3), n=20 | 76,447.5 (76,433.3 to 76,583.1), n=8 | 456.4 (437.8 to 489.4), n=20 | pending owner run |
| Bytes transferred, cold | nspell | 200,562 (n=5) | 200,562 (n=4) | 200,562 (n=5) | pending owner run |
| Bytes transferred, cold | harper.js | 15,170,508 (n=5) | 15,170,508 (n=4) | 15,170,508 (n=5) | pending owner run |
| Bytes transferred, warm | nspell | 0 (n=20) | 0 (n=8) | 0 (n=20) | pending owner run |
| Bytes transferred, warm | harper.js | 15,146,600 (n=20) | 15,146,600 (n=8) | 15,146,600 (n=20) | pending owner run |
| Bytes decoded, cold | nspell | 593,296 | UNMEASURED (not recorded under throttle) | 593,296 | pending owner run |
| Bytes decoded, cold | harper.js | 40,426,224 | UNMEASURED (not recorded under throttle) | 40,426,224 | pending owner run |
| Suggestion p50, ms (200 calls) | nspell | 0.675 (0.580 to 1.140), n=25 | UNMEASURED (not run under throttle) | 0.730 (0.650 to 0.920), n=25 | pending owner run |
| Suggestion p50, ms (200 calls) | harper.js | 0.250 (0.165 to 1.670), n=25 | UNMEASURED (not run under throttle) | 0.190 (0.170 to 0.995), n=25 | pending owner run |
| Suggestion p95, ms | nspell | 1.080 (0.875 to 1.785), n=25 | UNMEASURED | 1.220 (1.005 to 1.940), n=25 | pending owner run |
| Suggestion p95, ms | harper.js | 0.285 (0.180 to 2.340), n=25 | UNMEASURED | 0.220 (0.195 to 1.945), n=25 | pending owner run |
| Check 5,000 words from cold worker, ms | nspell | 3 (2 to 5), n=5 | UNMEASURED | 2 (2 to 2), n=5 | pending owner run |
| Check 5,000 words from cold worker, ms | harper.js | 564 (554 to 1,144), n=5 | UNMEASURED | 646 (618 to 683), n=5 | pending owner run |
| Check 50,000 words, ms | nspell | 16 (15 to 27), n=5 | UNMEASURED | 14 (14 to 19), n=5 | pending owner run |
| Check 50,000 words, ms | harper.js | 8,965 (8,898 to 15,597), n=5 | UNMEASURED | 9,794 (9,549 to 10,039), n=5 | pending owner run |
| Check 200,000 words, ms | nspell | 67 (62 to 112), n=5 | UNMEASURED | 64 (58 to 97), n=5 | pending owner run |
| Check 200,000 words, ms | harper.js | 72,193 (71,234 to 128,024), n=5 | UNMEASURED | 74,933 (74,479 to 79,744), n=5 | pending owner run |
| Re-check one 136-word paragraph, ms | nspell | 0.05 (0.04 to 1.16), n=50 | UNMEASURED | 0.06 (0.04 to 0.15), n=50 | pending owner run |
| Re-check one 136-word paragraph, ms | harper.js | 16.41 (13.04 to 27.89), n=50 | UNMEASURED | 18.41 (14.49 to 23.48), n=50 | pending owner run |
| Memory after load, MB | nspell | 10.66 (10.66 to 10.69), n=5 (page, `measureUserAgentSpecificMemory`) | UNMEASURED | UNMEASURED (`measureUserAgentSpecificMemory` threw `SecurityError`) | pending owner run |
| Memory after load, MB | harper.js | 165.59 (165.58 to 165.59), n=5 (page) | UNMEASURED | UNMEASURED (same) | pending owner run |
| Memory after checking 200,000 words, MB | nspell | 12.38 (12.36 to 12.39), n=5 (page) | UNMEASURED | UNMEASURED (same) | pending owner run |
| Memory after checking 200,000 words, MB | harper.js | 278.50 (278.50 to 278.52), n=5 (page) | UNMEASURED | UNMEASURED (same) | pending owner run |
| Memory, peak minus blank page, all processes, MB (`app.getAppMetrics()`) | nspell | not applicable | not applicable | 96.9 (78.9 to 100.5), n=3 | pending owner run |
| Memory, peak minus blank page, all processes, MB (`app.getAppMetrics()`) | harper.js | not applicable | not applicable | 466.0 (436.1 to 466.6), n=3 | pending owner run |
| Worker JS heap | both | UNMEASURED (not available in the worker) | UNMEASURED | UNMEASURED (same) | pending owner run |
| Planted misspellings flagged, 5,000 / 50,000 / 200,000 words (unpunctuated fixtures) | nspell | 100 of 100 / 992 of 1,000 / 3,974 of 4,000; 0 unplanted flagged | UNMEASURED | identical to web localhost | pending owner run |
| Planted misspellings flagged, 5,000 / 50,000 / 200,000 words (unpunctuated fixtures) | harper.js | 0 of 100 / 0 of 1,000 / 0 of 4,000; 0 unplanted flagged | UNMEASURED | identical to web localhost | pending owner run |
| Lowest browser or runtime version run | both | Chromium 148.0.7778.96 only | same browser as web localhost | Chromium 132.0.6834.210 (Electron 34.5.8) only | pending owner run |

Other measured facts, with their sections:

- Native underline (section "Underlines", MEASURED): on web (Chromium 148) and desktop (Electron 34.5.8), `spellcheck="false"` suppressed the native underline on `contenteditable`, `<textarea>` and `<input>`, and a `spellcheck="false"` ancestor was inherited by the `contenteditable` and the `<textarea>` inside it. The `<input>` without the attribute was underlined while focused and not after focus moved on. Android: not run (UNMEASURED until the owner's run).
- harper.js sentence-length experiment (section "Supplementary experiment: sentence length only", n=1 per cell, 5,000 and 50,000 words): with no full stops 0 of 100 and 0 of 1,000 planted misspellings flagged; with a full stop every 40, 20 and 10 words, 99 of 100 and 987 to 989 of 1,000; with a full stop every 5 words, 20 of 100 and 225 of 1,000. Unplanted words flagged 7 to 70 for harper.js and 0 for nspell. Cause: not established.
- Electron `localStorage` persistence (section "Electron localStorage persistence"): fixed origin `http://localhost:7340` UNMEASURED; stand-in origin `http://localhost:64313` MEASURED, value written on launch 1 was read on launch 2 (one run). Capacitor persistence: pending owner run.
- Size added to the install (section "Desktop (Electron)", computed from files in `frontend/node_modules`): nspell and dictionary-en 593,296 bytes loaded (554,848 dictionary plus 38,448 built worker script); harper.js 40,426,224 bytes loaded (40,205,397 for the two `.wasm` files plus 220,827 built worker script). Packaged-app size: UNMEASURED. Android APK size: pending owner run.
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

pending owner run

### Android underlines

pending owner run

### Capacitor localStorage

pending owner run

## Android results (pasted)

pending owner run

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

Not run here. The owner records the Android rows in "Android underlines" through the Task 16 runbook (UNMEASURED until then).

## Electron localStorage persistence

Date 2026-10-25. Command (repo root, outside the sandbox): `node specs/features/spell-checker/scripts/electron-storage.mjs`.

- `lsof -nP -iTCP:7340 -sTCP:LISTEN` before the run: nothing listening (MEASURED). The script never binds 7340, so the fixed desktop origin `http://localhost:7340` was not used.
- Fixed-origin check at `http://localhost:7340`: UNMEASURED. Reason: the script does not bind 7340, because the owner may start the desktop app on it.
- Stand-in, MEASURED, different origin: `http://localhost:64313` (port chosen by the OS, served by a throwaway Node static server that stayed up for both launches). Electron 34.5.8, Chromium 132.0.6834.210 (workspace `electron/node_modules/.bin/electron`), default session (no partition), `contextIsolation` true, `nodeIntegration` false, window not shown.
- Launch 1 wrote `localStorage["spell-spike-persistence-key"] = "written-1792959997954"` and read it back. The process then exited (graceful `app.quit()`).
- Launch 2, same throwaway `userData` directory (created under `$TMPDIR`, deleted afterwards), read `"written-1792959997954"` from the same origin. `persisted: true`, one run.
- The real desktop `userData`, `projects/` and port 7340 were not touched. Capacitor persistence is recorded from the Android runbook (Task 17).
- Observed while building the script: an ESM main script that awaited `app.whenReady()` at top level never reached ready (two launches killed after 60 s by pid); calling it without the top-level await worked.

## Recommendation (author's)

This section is the author's recommendation. It is a judgment, not a measurement, and it is not the Decision: the owner decides in the section below. Every number is cited from the sections above; the labels there apply. No cause is stated for any value.

What the recommendation rests on:

1. Correctness on the specified fixtures. harper.js flagged 0 of 100, 0 of 1,000 and 0 of 4,000 planted misspellings on the unpunctuated fixtures (web localhost and desktop, identical in all 5 runs each). nspell flagged 100 of 100, 992 of 1,000 and 3,974 of 4,000, with 0 unplanted words flagged. In the supplementary sentence-length experiment (n=1 per cell) harper.js flagged 99 of 100 and 987 to 989 of 1,000 with a full stop every 10 to 40 words, 20 of 100 and 225 of 1,000 with a full stop every 5 words, and 0 with none; the counts varied non-monotonically with sentence length over the values tried, and 7 to 70 unplanted dictionary-stem words were flagged. The cause of the 0, of the drop at every 5 words and of the unplanted flags is not established; the experiments that would discriminate are listed in that section. harper.js was not measured on ordinary prose.
2. Transfer. harper.js transferred 15,170,508 bytes on a cold load and 15,146,600 bytes on every warm load, including the loads after the cold one (the `.wasm` entries carried the same `transferSize` warm as cold, on localhost, throttled and desktop); decoded size is 40,426,224 bytes. nspell transferred 200,562 bytes cold and 0 warm; decoded 593,296 bytes. Under the Fast 3G-like profile (latency 150 ms, 1,600 kbit/s down) harper.js load took a median 76,514.2 ms cold and 76,447.5 ms warm; nspell took 1,160.0 ms cold and 36.9 ms warm.
3. Time to check. From a cold worker, harper.js took a median 72,193 ms (range 71,234 to 128,024) on web and 74,933 ms (74,479 to 79,744) on desktop for 200,000 words, against nspell 67 ms and 64 ms; for 50,000 words 8,965 ms and 9,794 ms against 16 ms and 14 ms. Re-checking one 136-word paragraph took a median 16.41 ms (web) and 18.41 ms (desktop) for harper.js and 0.05 ms and 0.06 ms for nspell.
4. Memory. On web the page-level figure after checking 200,000 words was 278.50 MB for harper.js and 12.38 MB for nspell. On desktop the all-process peak minus a blank page was 466.0 MB for harper.js and 96.9 MB for nspell (medians, n=3). The worker's own heap was not measured.
5. Suggestions and load. Suggestion time was under 3 ms at p95 for both engines on both platforms measured (harper.js p95 0.285 ms web, 0.220 ms desktop; nspell 1.080 ms and 1.220 ms); both returned a suggestion for 199 of 200 words. Unthrottled load was 48.6 ms (nspell) and 430.4 ms (harper.js) cold on web.
6. Not measured. Android has no figures (pending owner run), so no claim about the Pixel's WebView is made. The `Chrome >= 67` floor (`frontend/.browserslistrc:11`) was not run: the lowest browser version run was Chromium 132.0.6834.210 (desktop) and 148.0.7778.96 (web), so whether either engine runs between 67 and 131 is UNMEASURED. Native underlines: `spellcheck="false"` suppressed them and inheritance held on web and desktop; Android is unmeasured. Throttled suggestion, check and memory figures were not taken.

Recommendation: on the figures above, nspell with dictionary-en is the engine the measurements support for adoption: it flagged the planted misspellings on the specified fixtures, transferred 0 bytes warm, and its measured load, whole-document check and re-check times and its memory are lower than harper.js's on every platform measured (suggestion time p50 was lower for harper.js on both platforms). harper.js is not recommended on this evidence because of the 0 flagged on the unpunctuated fixtures with unestablished cause, the non-monotonic dependence on sentence length, the 15 MB transfer on every load, and the 70 to 128 s whole-document check. This does not show that harper.js is unsuitable on ordinary prose, and it does not show nspell is suitable on the Pixel's WebView or below Chromium 132; those are unmeasured. The recommendation changes if the Android run or a punctuation experiment shows otherwise.

## Decision

To be filled in by the owner. The author has not filled any field below (FR-8, FR-9; OQ-129: no performance limit is chosen in advance).

- Engine chosen:
- Performance limit, and what it limits (or "none"):
- Minimum WebView or browser version:
- `docs/standards/package-selection.md` justification for each package that will ship (sections 1, 2, 4, 6, 7 and 8 of the standard: the package exists, no existing dependency covers the need, purpose and necessity, registry-verified version, peer and TypeScript compatibility; `@types/nspell` is a devDependency and is not a shipping package):
  - Package 1:
  - Package 2:
  - Package 3:
- Owner name:
- Date:

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
