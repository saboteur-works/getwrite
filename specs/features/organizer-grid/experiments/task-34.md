# Task 34: Module seam, optional arrangements on ModuleManifestEntry

Results only. Date: 2026-11-11.

## Red run (tests first)
`pnpm exec vitest run tests/unit/module-registry.test.ts` (in `frontend/`) before the change:
4 failed, 25 passed. The failures were `registry.arrangements is not a function` in the four new
lookup cases. The fifth new case (no real manifest entry carries the field, no slot kind added,
`uiRegistry.ts` has no "arrangement") passed before the change, as it asserts an absence.

## Green run
- `vitest run tests/unit/module-registry.test.ts tests/unit/core-import-graph.test.ts`: 2 files, 42 tests passed.
- `vitest run -t "module"` (all files, name filter): 80 files passed, 316 tests passed, 0 failed. Not a full-suite run.
- `pnpm typecheck` (frontend): clean. `prettier --check` on the three files: clean.
- `eslint` on the three files: 0 errors, 1 warning (`ModuleSlotKind` unused, registry.ts line 24; the same declaration exists at HEAD, not introduced here).
- `pnpm --filter getwrite-electron typecheck` (both tsc passes, incl. `tsconfig.worker.json`): run, exit 0 (run after the registry.ts edit; the only later change was a test-file fixture fix, which neither graph includes).
- `pnpm --filter getwrite-cli typecheck`: run, exit 0.

## What was added
- `registry.ts`: `ModuleArrangementSeed` (name, folder source by `folderName` and scope, rows, columns; no smart-folder variant), optional `arrangements?: readonly ModuleArrangementSeed[]` on `ModuleManifestEntry`, and `ModuleRegistry.arrangements(config)` returning the seeds of enabled modules (same `enabled()` filter as `indexSteps`, so `moduleDefaultEnabled` and explicit `config.modules` apply). Type-only import from `../organizer-grid-types`.
- `module-registry.test.ts`: cases for enabled by default, explicit off, `defaultEnabled: false` with and without an explicit entry, a module without the field, no real `MODULE_MANIFEST` entry carrying the key, `MODULE_SLOT_KINDS` still `["view"]`, `uiRegistry.ts` text without "arrangement".
- `core-import-graph.test.ts`: registry.ts takes the types by `import type` only and its walk has no offenders.

## Notes
- The seed shape (`folderName`) is this task's choice; the spec fixes only "plain data, optional `arrangements`". Task 33/35 should align the project-type key's element type with it or map between them.
- `uiRegistry.ts` unchanged; no slot kind added.

## Not verified
Full-suite vitest was not run.
