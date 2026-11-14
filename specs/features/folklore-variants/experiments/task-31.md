# Task 31: CI commands at close-out

Run by the lead on 2026-11-14 (13:40 to 13:48 local), from the main checkout, outside the command sandbox. The tree was commit `36a8bea7` plus the uncommitted close-out edits: the Stage 6 doc updates, comment-only changes in `ComparisonView.tsx` and `ComparisonView.stories.tsx`, `experiments.md`, and `experiments/task-30.md`.

The command list was taken at run time with `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u`, and each command ran in its workflow's `working-directory`.

## Run

| Workflow | Command | Directory | Result |
|---|---|---|---|
| frontend-checks | `pnpm run check:no-hex` | `frontend` | exit 0, "No hardcoded hex violations found." |
| frontend-checks | `pnpm run format:check` | root | exit 0, "All matched files use Prettier code style!" |
| frontend-checks | `pnpm typecheck` | `frontend` | exit 0 |
| frontend-checks | `pnpm lint` | `frontend` | exit 0, 0 errors, 459 warnings |
| frontend-checks | `pnpm build` | `frontend` | exit 0 |
| frontend-checks | `pnpm test:ci` | `frontend` | exit 0: 956 files; 13043 passed, 8 expected fail, 1 skipped |
| cli-smoke-tests | `pnpm --filter getwrite-cli typecheck` | root | exit 0 |
| cli-smoke-tests | `pnpm --filter getwrite-cli build` | root | exit 0 (2 esbuild warnings, bundle 2.3 MB) |
| cli-smoke-tests | `pnpm --filter getwrite-cli test` | root | exit 0: 23 files, 164 passed |
| cli-smoke-tests | `node cli/dist/bin/getwrite-cli.cjs --help \| head -n 20` (also `doctor --help`, `prune --help`) | root | each exit 0, usage printed |
| electron-checks | `pnpm --filter getwrite-electron typecheck` (includes `tsconfig.worker.json`) | root | exit 0 |
| electron-checks | `pnpm --filter getwrite-electron build` | root | exit 0 |
| electron-checks | `pnpm --filter getwrite-electron test` | root | exit 0: 37 files, 565 passed |
| build-android | `pnpm --filter getwrite-android build` | root | exit 0 (placeholder script) |
| build-electron | `pnpm --filter getwrite-frontend build` | root | exit 0 |
| e2e-tests | `pnpm test:e2e` | `frontend` | exit 0: 270 passed, 1 skipped (includes `e2e/narratives-view.e2e.spec.ts`, Task 24) |

A bare `pnpm build` was also run from the repo root by mistake and exited 254 ("Command "build" not found"). CI runs `pnpm build` only from `frontend/` (frontend-checks, "Build (production)"), and that run is in the table above.

## Not run

- `pnpm install --frozen-lockfile`: blocked by the repo hook `guard-pm-install.py` during a live pipeline run. The existing install was used.
- `pnpm exec playwright install --with-deps chromium`: CI runner setup; the local Playwright Chromium was used.
- Release and packaging steps: `electron-builder` packaging and signing, the signature and notarization check, `gh release upload`, `gh workflow run build-electron.yml` (release-please), and the Linux AppImage smoke steps (`apt-get`, download, launch, project-location check). These act on a published release and are outside a feature branch.
