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
