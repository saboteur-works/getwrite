# Spell checker experiments

Labels: MEASURED = observed by running the command; READ = taken from reading code or docs.

## Environment record

- Date: 2026-10-25
- `git rev-parse HEAD`: 89ac0f443d64cb1aa60c9620609bcf76528be7fa (branch feat/spell-checker)
- `node --version`: v24.15.0
- `uname -a`: Darwin Jedais-MacBook-Pro.local 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:15 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T6041 arm64
- `sw_vers`: macOS 26.5.1 (build 25F80)
- Run inside the Bash sandbox (not retried outside it).

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

Edits under `android/` (FR-10; owner decision, Gate 4). No edit was made to `android/capacitor.config.ts`.

| File | Change | Reason |
| --- | --- | --- |
| `android/scripts/build-harness.mjs` | Added `copyFileSync, readFileSync, writeFileSync` import and a `--spell-spike` branch before the existing build. With the flag it builds the Task 7 spike (`specs/features/spell-checker/scripts/build.mjs` `buildBundle`) into `android/build/spell-spike/`, writes fixtures and `env.json` there, bundles `spell-spike-entry.ts` to `persist.bundle.js`, copies the two pages below, and injects the persist script into `driver.html`. Without the flag the file behaves as before. | The spike must run inside the app's WebView through the harness build. `android/build/` is already ignored by `android/.gitignore`, so the output does not enter git. |
| `android/harness/spell-spike-entry.ts` (new) | Polls `window.__spellResult` and writes it to `Directory.Data/spell-spike-result.json` with `@capacitor/filesystem`. Imports no application module. | Same host-side capture route as `harness-entry.ts` (`adb shell run-as ... cat files/...`), so the owner copies the JSON block off the phone without logcat scraping. |
| `android/harness/spell-spike/index.html` (new) | Menu page with links to the driver, the underline page and the storage check; prints `location.origin`. | A WebView has no address bar; the pages need to be reachable by tapping. |
| `android/harness/spell-spike/storage-check.html` (new) | Writes, reads and reloads a `localStorage` key and prints the origin. | FR-34 Capacitor persistence check. |

Outside `android/` but inside `specs/features/spell-checker/`: `scripts/serve.mjs` now exports `prepareFixtures` (one word, `export`), so the build can reuse the fixture generator.

## Owner step: Android

Halts here. The run is the owner's (Task 16); nothing below was run on a phone. Items marked unverified were not established from the repository.

Device facts established from the repository: app id `works.saboteur.getwrite` (`android/capacitor.config.ts`, `android/android/app/build.gradle`); launch activity `.MainActivity` (`AndroidManifest.xml`); `minSdkVersion` 24, `targetSdkVersion` 36 (`variables.gradle`); Capacitor Android 8.4.2; the harness's own capture route reads `files/<name>` with `run-as` (comment in `android/harness/harness-entry.ts`), which needs a debuggable build (unverified for this build). The device is a Pixel 7 Pro (FR-4 c). Its System WebView version and keyboard app are not recorded anywhere in the repository; steps 11 and 12 record them.

Warnings before starting.

- The spike app is built into the same app id as the real GetWrite app, so installing it over the real app replaces the app code but keeps app data (a debug install with `-r` is the normal behaviour; unverified for this device). Never run `adb shell pm clear works.saboteur.getwrite`: it would delete the projects on the phone.
- The spike page shares the origin `https://localhost` (default scheme, READ above; step 14 prints the real origin) with the real app. The storage check writes one key, `spell-spike-storage-check`, and nothing else in `localStorage`.
- Step 15 puts the real app back.

Steps, from the repository root of a clean checkout of this branch (`pnpm install` already done by the owner; do not run it for this):

1. Check the phone is visible and unlocked, with the screen timeout raised in the phone's settings (the run can take up to the driver's 20 minute limit): `adb devices`. Expect one device in state `device`.
2. Build the spike into the harness output: `node android/scripts/build-harness.mjs --spell-spike`. Expect the last line `[build-harness] wrote .../android/build/spell-spike (spell-spike)` and exit 0. Output: `android/build/spell-spike/` (about 40 MB, mostly the two harper `.wasm` files).
3. Point Capacitor's `webDir` at that folder for this run only: `sed -i '' 's#webDir: "../frontend/out"#webDir: "build/spell-spike"#' android/capacitor.config.ts` (macOS `sed`). Check with `git diff android/capacitor.config.ts`: one changed line. This file is reverted in step 15.
4. Create the native project only if `android/android/` does not exist (it is gitignored, so a clean checkout lacks it): `cd android && pnpm exec cap add android` (unverified command; `android/.gitignore` names `npx cap add android`). Then copy the web assets in: `cd android && pnpm run sync` (the `sync` script is `cap sync android`).
5. Build and install the debug app on the phone: `cd android/android && ./gradlew installDebug` (unverified; the Gradle wrapper is in `android/android/`, and the owner's earlier harness runs are recorded as using `installDebug`). Expect `BUILD SUCCESSFUL`. Record the APK size: `ls -l android/android/app/build/outputs/apk/debug/app-debug.apk` (standard Gradle output path, unverified) and write it next to the "size added to the install" row.
6. Launch: `adb shell am start -n works.saboteur.getwrite/.MainActivity`. The phone shows "Spell checker spike" with three links and the origin.
7. Record memory baseline (menu page, nothing running): `adb shell dumpsys meminfo works.saboteur.getwrite > specs/features/spell-checker/screenshots/meminfo-1-menu.txt`.
8. Tap "Run the spike driver". It runs both engines (20 warm loads each, three document sizes, 5 re-check runs) and shows `running` until done. While it runs, take a second sample at least once, and again during the longest-running phase you can see in the on-page log: `adb shell dumpsys meminfo works.saboteur.getwrite > specs/features/spell-checker/screenshots/meminfo-2-running.txt`. The workers are terminated by the driver at the end of each engine, so a sample after the run shows the page only; the "running" sample is the one that can include a worker.
9. When the page shows the result block and the line "result written to Directory.Data/spell-spike-result.json", take the third sample: `adb shell dumpsys meminfo works.saboteur.getwrite > specs/features/spell-checker/screenshots/meminfo-3-after.txt`. If the line says "result NOT written", the error text is on the page; the JSON is still in the page's `<pre>` and in `console.log` as `SPELL_RESULT_JSON` (logcat route, unverified: `adb logcat -d | grep SPELL_RESULT_JSON`; long lines may be truncated).
10. Copy the JSON result block to the clipboard: `adb shell run-as works.saboteur.getwrite cat files/spell-spike-result.json | pbcopy`. Open `specs/features/spell-checker/experiments.md`, go to the heading "Android results (pasted)" at the end of this file, replace the line `pending owner run` with a fenced `json` block and paste. In the pasted block check `environment.browser.userAgent` (it names the WebView's Chrome version) and that `engines[].errors` is empty for both engines; a worker that failed to start shows `worker error` there. Optional repeat for FR-6 cold loads: `adb shell am force-stop works.saboteur.getwrite`, relaunch (step 6), run again, paste each block under its own sub-heading; whether a relaunch counts as a cold load on this WebView is not established (a Capacitor asset load has no network transfer, so `transferSize` may be 0 on every load).
11. Record the System WebView version: `adb shell dumpsys webviewupdate` (shows the current WebView package and version; unverified output format), and `adb shell dumpsys package com.google.android.webview | grep versionName` (package name may differ on a Pixel, for example `com.android.webview`; unverified). Write both lines, and the Chrome version from the UserAgent in the pasted block, under "Android environment" at the end of this file.
12. Record the keyboard app: `adb shell settings get secure default_input_method`. Write its output and the app's name as shown in the phone's Settings under "Languages & input". Also record Android version and device: `adb shell getprop ro.build.version.release`, `adb shell getprop ro.product.model`.
13. FR-7 screenshots. On the phone, go back to the menu (system Back) and tap "Native underline observation page (FR-7)". For each of the eight cases, tap into the field, wait 2 seconds, and capture: `adb exec-out screencap -p > specs/features/spell-checker/screenshots/android-underline-<N>.png` with N = 1 to 8 (create the folder if absent). Case 7 and 8 are the two inside the container that carries `spellcheck="false"`. Beside each file, write one line under "Android underlines" at the end of this file: the case number, whether the text `recieve teh wrold` showed a red or other underline, whether the keyboard's suggestion strip or a composing underline appeared (OQ-12), and the keyboard app name. State what is seen; write no cause. Only an observation that was made is labelled MEASURED; one that could not be made is labelled UNMEASURED with the reason.
14. FR-34 check, Capacitor origin. Go back to the menu and tap "localStorage persistence check". The page prints `location.origin` (copy it into the results) and `value: (absent)` on first visit.
    1. Tap "Write a new value". The page shows `value: written <timestamp>`.
    2. Tap "Reload page". Expect the same timestamp.
    3. Force-stop and relaunch: `adb shell am force-stop works.saboteur.getwrite`, then `adb shell am start -n works.saboteur.getwrite/.MainActivity`, open the same page. Expect the same timestamp.
    4. Record each of the three outcomes (timestamp seen, or absent) under "Capacitor localStorage" at the end of this file. Optionally also swipe the app away from recents and reopen it, and say which of the two was done.
15. Put the real app back: `git checkout android/capacitor.config.ts` (it only reverts the one-line edit of step 3), then from `frontend/` `pnpm build:native`, then `cd android && pnpm run sync` and `cd android/android && ./gradlew installDebug`. Open the app and confirm the projects are listed (data was kept). `android/build/` can then be deleted.
16. Tell the lead the headings are filled. The run is halted on this section until the Decision section names the engine (FR-9).

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
