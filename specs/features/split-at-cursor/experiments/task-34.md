# Task 34: build check (LEAD-RUN)

Run on 2026-11-17 by the lead, from the main checkout and outside the command sandbox, at commit `3d17d8f9` (Task 28 tick). Platform: macOS 26.5.1, arm64. The commands ran one after another from 18:14:37 to 18:17:46 UTC. Load averages were 10.35, 12.86 and 16.02 at the start and 17.53, 17.07 and 17.29 at the end.

| Command | Directory | Time | Result |
|---|---|---|---|
| `pnpm typecheck` | `frontend/` | 3 s | exit 0 |
| `pnpm lint` | `frontend/` | 21 s | exit 0: 0 errors, 459 warnings |
| `pnpm test:ci` | `frontend/` | 96 s | exit 0: 1019 of 1019 files passed; 14392 tests passed, 8 expected fail, 1 skipped (14401) |
| `pnpm exec vitest run tests/unit/core-import-graph.test.ts tests/unit/split-core-import-graph.test.ts` | `frontend/` | under 1 s | exit 0: 2 files, 18 tests passed |
| `pnpm build` (`.next/standalone` and `out` cleared first) | `frontend/` | 25 s | exit 0 (see below) |
| `pnpm build:native` | `frontend/` | 19 s | exit 0 (see below) |
| `pnpm build-storybook` | `frontend/` | 21 s | exit 0: "Storybook build completed successfully" |
| `pnpm --filter getwrite-electron typecheck` (both passes: `tsc --noEmit` and `--project tsconfig.worker.json`) | repo root | 1 s | exit 0 |
| `pnpm --filter getwrite-cli typecheck` | repo root | 2 s | exit 0 |

## `pnpm build`

- The route list includes the four new routes, each as a dynamic (`ƒ`) route:
  - `/api/project/split`
  - `/api/project/split/latest`
  - `/api/project/split/preview`
  - `/api/project/split/undo`
- It printed two Turbopack warnings, the same two that Feature 116's Task 51 recorded:
  - the file pattern at `src/lib/citations/style-loader.ts:72`;
  - "Encountered unexpected file in NFT list".
  Neither warning names a Feature 120 file.

## `pnpm build:native`

- It printed "Native static export produced at …/frontend/out (19 top-level entries)".
- The routes were `/`, `/_not-found` and `/preferences`. No `app/api/**` route is in the native build.
- `frontend/CLAUDE.md` records a known type error in `stories/Start/CreateProjectModal.stories.tsx`. It did not appear in this run.

## Failures

None.

## Not run here

These are left to Task 37 (CI):

- `pnpm test:e2e`;
- `pnpm test:sharing-smoke`, which needs the standalone server started.
