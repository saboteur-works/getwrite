# Task 14: lineage-state resolver (pure, FR-15)

Commands ran from `frontend/` unless stated; paths are repository-relative.

## Files

- `frontend/src/lib/models/split-lineage-resolver.ts` (new)
- `frontend/tests/unit/split-lineage-resolver.test.ts` (new): 10 tests
- `specs/features/split-at-cursor/experiments/task-14.md` (this file)

## Types defined in this task's own file

`split-types.ts` is Task 9's only. The resolver's input types are defined in `split-lineage-resolver.ts`: `SplitLineageProbe` (`present`, `absent`, or `failed` with a `cause`) and `SplitLineageResolverInput` (the record plus four probes: live sidecar, live snapshot revision, trashed sidecar, trashed revisions). The result type is `SplitLineageStateResult` from `split-types.ts`, unchanged.

## Fixtures

The test models a project directory as a set of stored paths in the layout `experiments/task-3.md` recorded: live sidecar `meta/resource-<id>.meta.json`, live revision folder `revisions/<id>/v-<N>`, trashed sidecar `.trash/meta/resource-<id>.meta.json`, trashed revisions `.trash/revisions/<id>`. A test helper turns a set (plus a set of paths whose read fails) into the probes. The resolver itself receives only probes and does no I/O. These fixtures are in-memory path sets; no real project directory was written or read.

## Tests first: failing run

Command: `pnpm exec vitest run tests/unit/split-lineage-resolver.test.ts`, before the resolver file existed.
Observed: 1 test file failed, "no tests" (the import of the missing module did not resolve).

## Green run

Command: `pnpm exec vitest run tests/unit/split-lineage-resolver.test.ts tests/unit/split-core-import-graph.test.ts`
Observed: 2 files passed, 15 tests passed (10 resolver, 5 import-graph; the import-graph test now also walks the new `split-*.ts` file).

## Resolution rules as implemented

1. Live sidecar read failed: could not be checked.
2. Live sidecar present: snapshot revision read failed gives could not be checked; present gives available; absent gives revision no longer kept.
3. Live sidecar absent: either trash probe present gives document in Trash; otherwise a failed trash probe gives could not be checked; otherwise document permanently removed.

A test asserts a failed read and an empty read return different states, and that the five fixtures cover exactly the five states of `SPLIT_LINEAGE_STATES`.

## Checks

| Check | Command | Result |
|---|---|---|
| frontend typecheck | `pnpm typecheck` | run, exit 0 |
| frontend lint | `pnpm lint` | run, exit 0; 0 errors, 459 warnings (same count as the Task 9 record) |
| electron typecheck (both passes) | `pnpm --filter getwrite-electron typecheck` | run, exit 0 |
| cli typecheck | `pnpm --filter getwrite-cli typecheck` | run, exit 0 |

## Not established

- Behaviour of the read side that fills the probes (Task 29). Whether a trashed sidecar with no trashed revisions, or the reverse, can occur on disk was not measured here; both count as in Trash.
- A snapshot revision found only under `.trash/revisions` while the live sidecar is present is not examined (the resolver does not read it).
