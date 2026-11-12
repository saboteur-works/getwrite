# Task 25: Arrangements core (results)

Measurements only. Worktree branch `worktree-agent-ace62f0ae48ea879a`, Waves 1 and 2 landed.

## Red run (tests first, against the Task 2 stub)

`pnpm exec vitest run tests/unit/organizer-arrangements-core.test.ts tests/unit/organizer-arrangements-import-graph.test.ts`
before the implementation: 2 files failed, 24 failed, 5 passed (29 tests). The
five that passed are the walker self-tests and two validation-order cases that
the stub already satisfied.

## Green run (after the implementation)

Same command: 2 files passed, 29 passed.

Related suites, same run as the stub-test update:
`organizer-grid-types`, `organizer-arrangements-core`,
`organizer-arrangements-import-graph`, `project-json-lock-scan`,
`core-import-graph`, `organizer-arrangements-route`: 6 files, 71 tests passed.

## Observed

- Add stores `{ id, name, source, rows, columns }`, the id from
  `generateUUID` (`src/lib/models/uuid.ts`: imports only a type, no `node:*`,
  so it is core-safe), and returns it. The name is stored trimmed.
- Refusals covered by test: blank, over 100, duplicate under trim and
  case-fold, 51st (project.json byte-equal afterwards), unknown key, malformed
  source, malformed axis, non-UUID id; rename and delete of an unknown id
  (`not-found`) and of a non-UUID id (`invalid-id`). No refusal text contained
  the probe string the test sent.
- `order` on Rows is refused (`invalid-axis`) and accepted on Columns. This
  closes the Task 24 gap: the Zod schema still accepts `order` on Rows (one
  shared axis type); only the core refuses it.
- Validation runs before any lock: the write probe's lock-key count did not
  change on a refused add.
- Two interleaved adds, an interleaved add/rename/delete, and 20 concurrent
  adds all persisted. Every write held the project.json lock (probe).
- Only `config.organizerArrangements` changed; other config keys compared
  equal after add, rename and delete.
- A locked project: add, rename and delete each rejected with a locked-access
  error (`isLockedAccessError` true).
- A stored list that does not parse (`"corrupt"`) makes the operation throw and
  leaves project.json byte-equal. The core never reads it as empty.
- A source or field key that names nothing in the project is stored as written
  (availability is Task 29).
- `project-json-lock-scan` still passes: the core writes only through
  `updateProjectJson`.
- Import graph: no React, JSX, JSON or UI-registry file is reachable from the
  core, and the core file itself imports no `node:*` or `fs`. The walker
  self-tests can fail. `node:*` is present in modules the core reaches
  (`project-json-write.ts` imports `node:path`, the storage adapter), which is
  the allowed place; the test does not follow it as an offender.

## Typecheck and lint

- `pnpm --filter getwrite-electron typecheck` (both tsc passes): run, passed.
- `pnpm --filter getwrite-cli typecheck`: run, passed.
- `pnpm typecheck` (frontend): run, 1 error,
  `src/lib/api/organizer-arrangements.ts(171,12): TS2307` cannot find
  `native-organizer-arrangements-backend`. That file is Task 28's and is not in
  this worktree. The error is in a file this task does not touch; whether it
  was already present before my edits was not separately measured by a run on
  the pre-edit tree, but my files are not named in it.
- ESLint on the four touched/new files: no output. Prettier `--write` applied
  to the core and its test.

## Stub test updated

`tests/unit/organizer-grid-types.test.ts` had a case asserting the arrangement
stubs reject with `not implemented`. Replaced by a case asserting the four
functions are exported (behaviour lives in the new core test). Nothing else in
that file changed.

## Not verified

- The route and client against the real core (the route test uses a fake core).
- No build, no device. No `next build` or `build:native` run.
