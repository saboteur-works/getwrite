# Task 3 record: per-module default (FR-2)

## What changed
- `frontend/src/lib/models/modules/registry.ts`: `ModuleManifestEntry.defaultEnabled?: boolean`; one lookup `moduleDefaultEnabled(id, manifest)` (entry's `defaultEnabled !== false`, so unknown ids and entries that omit it are on); `isModuleEnabled(config, id, manifest = MODULE_MANIFEST)` uses it when there is no own entry; `createModuleRegistry` passes its own `modules` list to `isModuleEnabled`, so `enabledViews` and `indexSteps` use the same lookup.
- `registry.ts` now has a runtime import `import { MODULE_MANIFEST } from "./manifest"`. `manifest.ts` is unchanged and keeps `import type` from `./registry`. `module-defaults.ts` was NOT created.
- Tests: `tests/unit/module-registry.test.ts` (new describe "per-module default", fake manifest with `defaultEnabled: false`), `tests/unit/core-import-graph.test.ts` (one test: `walk(registry).visited` contains `manifest.ts`, `walk(manifest).visited` does not contain `registry.ts`).

## Observed
- Tests first: after adding the new tests and before the source edit, `module-registry.test.ts` showed 2 failed, 22 passed (the off-by-default cases; the typecheck-level `defaultEnabled` field did not exist yet).
- After the edit: `pnpm exec vitest run --project node tests/unit/module-registry.test.ts tests/unit/core-import-graph.test.ts`: 2 files, 36 tests passed. All pre-existing cases in `module-registry.test.ts` pass unedited.
- Import cycle (answers task-1 (b) caveat on the real files): the new core-import-graph test shows the walker, which follows value imports only, reaches `manifest.ts` from `registry.ts` and does not reach `registry.ts` from `manifest.ts`. The existing `core-import-graph` cases (core.ts and the named entries reach no react, JSX, JSON, UI-registry) pass with the new edge. Scope of that evidence: the walker ignores `import type`, so it says nothing about type-level cycles, which the compiler permits.

## Commands run
- `pnpm exec vitest run` on the seven files that reference `isModuleEnabled`, `modules/registry`, `MODULE_MANIFEST` or `useModuleEnabled` (citationControl, work-area-view-gating, module-ui-registry, core-import-graph, import-rebuild-preserves-writing-log, indexer-queue, module-registry): 7 files, 181 tests passed.
- `pnpm typecheck` (frontend): run, no errors.
- `pnpm exec eslint` on the three touched source/test files: 0 errors, 1 warning (`ModuleSlotKind` unused at registry.ts:19, present before this task and not touched).
- `pnpm --filter getwrite-electron typecheck` (both tsc passes including `tsconfig.worker.json`): run, no errors.
- `pnpm --filter getwrite-cli typecheck`: run, no errors.

## Not verified
- `pnpm test:ci` full suite: not run. `next build`, `build:native`, device behaviour: not run (out of scope for worktrees).
- No claims manifest entry exists yet (Task 4), so the claims id is tested only through a fake manifest.
