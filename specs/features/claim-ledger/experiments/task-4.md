# Task 4: Claims manifest entry, module id and ViewName

Date: 2026-11-11. Worktree base: feat/claim-ledger (Tasks 1-3, 6, 10, 13, 15-20 landed).

## Changes
- `frontend/src/lib/models/modules/manifest.ts`: added `claims` entry (view `{ id: "claims", label: "Claims" }`, `defaultEnabled: false`, `indexSteps: []`). Sources entry unchanged.
- `frontend/src/lib/models/types.ts`: `"claims"` added to `ViewName`.
- `frontend/tests/unit/claims-module-manifest.test.ts` (new).

## Tests first
Before the change, `claims-module-manifest.test.ts`: 3 failed, 3 passed (the passing ones were the Sources-unchanged case, the `ViewName` type-only case, which vitest does not check at runtime, and the `{}`-config Sources-on case). After the change all 6 pass.

## Commands and results (from the worktree)
- `pnpm exec vitest run` on claims-module-manifest, module-registry, module-ui-registry, work-area-view-gating, core-import-graph: 111 passed, 1 failed (see Finding).
- `pnpm typecheck` (frontend): RUN, exit 2. Errors observed only in `tests/unit/claims-route.test.ts` and `tests/unit/native-claims-backend.test.ts` (`ClaimListResult` / `ClaimListOutcome` missing `sidecarsRead`). None mention `ViewName`, the manifest or a non-exhaustive switch. No baseline run without this change, so that they pre-exist is a reading, not measured.
- `pnpm exec eslint` on the three touched code files: RUN, no output (clean).
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): RUN, passed.
- `pnpm --filter getwrite-cli typecheck`: RUN, passed.
- No next build / build:native run.

## Finding: existing test now fails
`frontend/tests/unit/module-registry.test.ts` ("accepts a test-only module with an index step", ~line 160) expects `registry.modules` ids `["sources", "test-indexed"]` and now receives `["sources", "claims", "test-indexed"]`. That file is not in Task 4's Files (Task 3's hot file), so it was NOT edited. Needed change: add `"claims"` to the expected list.

## AppShell / ViewName exhaustiveness
Typecheck reported no error in AppShell.tsx or in any ViewName switch. No AppShell change was made or is needed for typecheck. The hard-coded `view === "trash" || view === "sources"` spots are Task 25.

## Not verified
- Frontend typecheck is not green (errors in claims tests from other tasks; cause not established).
- Full vitest suite not run.
