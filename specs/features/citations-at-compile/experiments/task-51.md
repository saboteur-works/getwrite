# Task 51: build and inlining check, FR-3 (g) (LEAD-RUN)

Run by the lead on 2026-11-15 from the main checkout, outside the command sandbox, at commit `9db33300`. The build started at 19:56:58 UTC and finished at 19:57:43 UTC. Output folders were cleared first (`rm -rf .next/standalone out`).

## Commands and results

| Command (from `frontend/`) | Exit | Time |
|---|---|---|
| `pnpm build` (`output: "standalone"`) | 0 | 26.1 s |
| `pnpm build:native` (static export to `out/`) | 0 | 18.3 s |

Routes listed by `pnpm build` include `ƒ /api/citations/check` and `ƒ /api/citations/fields`.

### Warnings printed (copied from the build output)

`pnpm build` printed 2 Turbopack warnings; `pnpm build:native` printed 3, which name the same file `[Client Component SSR]`.

1. `./frontend/src/lib/citations/style-loader.ts:72:29`: "The file pattern (`'/ROOT/frontend/src/lib/citations/assets/' <dynamic> | …`) matches 12547 files in [project]/frontend". Line 72 is the `readFile(path.resolve(process.cwd(), dir, fileName), "utf8")` call in `readAsset`, which loops over `ASSET_DIR_CANDIDATES`. Import trace: `style-loader.ts` ← `compile-core.ts` ← `app/api/compile/text/route.ts`.
2. "Encountered unexpected file in NFT list. A file was traced that indicates that the whole project was traced unintentionally". Import trace: `next.config.mjs` ← `src/lib/projectTypes.ts` ← `app/api/project-types/route.ts`. None of these three files differs from `main` (`git diff --stat main`).

## Inlining check (FR-3 (g))

- Files under `frontend/out/_next/static` containing `NEXT_PUBLIC_GETWRITE_RUNTIME`: **0**. Expected 0, as Features 105 and 107 recorded.

## Assets in the build outputs

| Asset | `frontend/out` (native export) | `.next/standalone/frontend` (server) |
|---|---|---|
| `licences/citations-licences.txt` | present (`out/licences/citations-licences.txt`) | present (`public/licences/citations-licences.txt`) |
| `chicago-notes-bibliography.csl` | absent | present (`src/lib/citations/assets/`) |
| `locales-en-US.xml` | absent | present (`src/lib/citations/assets/`) |
| engine `.wasm` | 1 copy (`_next/static/media/hayagriva_wasm_bg.0wajl2kr.0jpm.wasm`) | 2 copies (`.next/server/assets/hayagriva_wasm_bg.0wajl2kr.0jpm.wasm`, and the source `src/lib/citations/engine/hayagriva_wasm_bg.wasm`) |

- In the native export, the style and locale are absent. The export has no server routes, and Android citations are Feature 118, outside this feature.
- In the server output, the style and locale are present because the file tracer copied the frontend source tree into the standalone folder, not because a targeted trace or copy put them there.

## Standalone folder contents (observed, not compared with a `main` build)

- `.next/standalone` is 162,632 KiB before `.next/static` and `public` are copied in. For comparison, `.next/static` is 8,088 KiB, `public` 48 KiB and `out` 16,232 KiB.
- `.next/standalone/frontend/` contains, besides `server.js` and `node_modules`, development-only folders and files: `tests`, `stories`, `storybook-static`, `e2e`, `playwright-report`, `debug-storybook.log` and `test_output.log`. `src/` holds 526 files (7.4 MB).
- Not established here: whether a build of `main` traces the same folders. Warning 2's import trace runs through files `main` also has, but no `main` build was made in this task. A clean `main` build, measured the same way, would settle it.

## Not run or not checked

- Packaged Electron output (`electron-builder`): Task 52.
- Whether the server finds the style and locale at runtime from the standalone folder's working directory, and whether it loads the `.wasm`: Task 52 (desktop) and Task 53 (hosted).
- The bundle size, compared with `experiments/task-7.md`'s baseline. The folders above have not been measured the same way as that baseline.
