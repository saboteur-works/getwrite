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
