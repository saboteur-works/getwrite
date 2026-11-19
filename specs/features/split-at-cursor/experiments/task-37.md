# Task 37: CI commands, documents and close-out (LEAD-RUN)

Run on 2026-11-19 by the lead, from the main checkout and outside the command sandbox, at commit `ceca6f04` (Task 36 tick). Platform: macOS 26.5.1, arm64. The commands ran one after another from 04:06:00 to 04:10:17 UTC.

## Command list

Taken at the time of the run with:

```
grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u
```

The multi-line `run: |` steps were read in their workflow files.

## Run

| Command | Workflow | Directory | Result |
|---|---|---|---|
| `pnpm run format:check` | frontend-checks | repo root | exit 0 |
| `pnpm run check:no-hex` | frontend-checks | `frontend/` | exit 0 |
| `pnpm typecheck` | frontend-checks | `frontend/` | exit 0 |
| `pnpm lint` | frontend-checks | `frontend/` | exit 0: 0 errors, 459 warnings |
| `pnpm build` (`.next/standalone` cleared first) | frontend-checks | `frontend/` | exit 0 |
| `pnpm test:ci` | frontend-checks | `frontend/` | first run exit 1: 1 file failed of 1022, 1 test failed, 14414 passed, 8 expected fail, 1 skipped (14424); rerun (04:11:04 to 04:12:38) exit 0: 1022 of 1022 files, 14415 passed, 8 expected fail, 1 skipped (see below) |
| `pnpm test:e2e` | e2e-tests | `frontend/` | exit 0: 270 passed, 1 skipped |
| `pnpm --filter getwrite-android build` | build-android | repo root | exit 0 |
| `pnpm --filter getwrite-cli typecheck` | cli-smoke-tests | repo root | exit 0 |
| `pnpm --filter getwrite-cli test` | cli-smoke-tests | repo root | exit 0: 23 files, 164 tests passed |
| `pnpm --filter getwrite-cli build` | cli-smoke-tests | repo root | exit 0 |
| `node cli/dist/bin/getwrite-cli.cjs --help \| head -n 20` | cli-smoke-tests | repo root | exit 0 |
| `node cli/dist/bin/getwrite-cli.cjs prune --help \| head -n 20` | cli-smoke-tests | repo root | exit 0 |
| `node cli/dist/bin/getwrite-cli.cjs doctor --help \| head -n 20` | cli-smoke-tests | repo root | exit 0 |
| `pnpm --filter getwrite-electron typecheck` | electron-checks | repo root | exit 0 |
| `pnpm --filter getwrite-electron test` | electron-checks | repo root | exit 0: 37 files, 565 tests passed |
| `pnpm --filter getwrite-electron build` | electron-checks, build-electron | repo root | exit 0 |
| `pnpm --filter getwrite-frontend build` | build-electron | repo root | exit 0 |

### The `test:ci` failure

- The first run failed one test: `tests/component/EntityGraphSettingsPanel.test.tsx > EntityGraphSettingsPanel > persists a changed hop radius` (`expected "vi.fn()" to be called with arguments: [ 'p1', …(2) ]`).
- Run alone three times, that file passed 10 of 10 each time. The full suite then passed on a rerun.
- No commit on this branch touches `EntityGraphSettings*`.
- During Task 35's first repair, the implementing agent reported two failures in `tests/unit/indexer-queue.test.ts` on two full runs. That file passed alone and on the lead's full run.
- Both files fail only sometimes in a full run. The cause was not established.

## Not in any workflow, run here

| Command | Directory | Result |
|---|---|---|
| `pnpm test:sharing-smoke` (after copying `.next/static` into `.next/standalone/frontend/.next/static`) | `frontend/` | exit 0 (04:10:48 to 04:10:49) |

Its output:

- "enumerated entries: 132; exceptions: 4 (3 enumerated + /_next/static/; 1 store-independent); checks: 36; failures: 0".
- "sharing refusal smoke: all checks passed".

The script checks that the four split routes are among the enumerated entries (`SPLIT_ROUTE_LABELS`: `POST /api/project/split/preview`, `POST /api/project/split`, `POST /api/project/split/undo`, `GET /api/project/split/latest`). It also checks that the count is at least its floor, 132, and requests every entry unconfirmed. It prints counts, not route names.

## Not run

| Command | Workflow | Reason |
|---|---|---|
| `pnpm install --frozen-lockfile` | every workflow | Installing dependencies is the owner's to run; the installed tree was used as it was |
| `pnpm exec playwright install --with-deps chromium` | e2e-tests | Chromium builds were already in the local Playwright cache |
| Notarization key write, signed and notarized packaging, signature and notarization check, unsigned packaging (`run: \|` steps) | build-electron | Release-only; needs the CI signing secrets. An unsigned local package was built in Task 35 |
| `gh release upload …` | build-electron | Release-only |
| Install FUSE, download, launch, observe and judge the published AppImage (`run: \|` steps) | linux-appimage-smoke | Needs Linux and a published AppImage |
| Trigger electron build (`run: \|`) | release-please | Release-only |
