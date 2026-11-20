# Task 12: sample project README and whole-project check

Test tooling only (POS `task_23e9c7df`). Files: `scripts/sample-project/README.md` (new) and this file. No TypeScript changed, so `pnpm typecheck` and `pnpm lint` were not run. All generated projects went to directories made with `mktemp -d` under `$TMPDIR`; no real project and no `projects/` path was used. The passphrase for the encrypted run was a throwaway value in a temp file.

## Whole-project check (run in the command sandbox)

Command: `pnpm --filter getwrite-frontend exec vitest run tests/unit/sample-project-generator.test.ts tests/unit/sample-project-encrypted.test.ts`

Observed: `Test Files 2 passed (2)`, `Tests 45 passed (45)` (36 + 9), duration 23.98 s.

## Generated project (default seed, scratch directory)

Command: `node scripts/sample-project/generate.mjs --out <scratch>/p --seed 121`. Path: `<scratch>/p/0fc44049-123b-41af-97f3-63075a68c38d` (scratch is a `mktemp -d` directory under `$TMPDIR`). Printed `counts`: `{"folders":16,"resources":72,"source":1,"text":69,"image":1,"audio":1,"annotations":9}`. The line also held the `merge` object. stderr: `ignored a file-watch error: EMFILE` (as in Tasks 9 to 11).

With `--encrypted <passphrase-file>` (second run, seed default): JSON keys `path, projectId, seed, counts, merge, encrypted`; same counts and same project id (`0fc44049-...`); `<scratch>/p-encrypted/` held `.getwrite-keyring.json`, `.getwrite-names` and the project directory.

## Done-when clauses

| Clause | Verification |
|---|---|
| README states command and every option | `--out`, `--seed`, `--encrypted` described; compared against the wrapper's header comment and the runs above |
| Contents: general coverage, merge table, hand-written mark | README sections "What it contains" and "The merged mark is hand-written"; table keys match the `merge` object printed by the run; document names taken from `driver.ts` |
| Synthetic and deterministic | stated; determinism is that of Tasks 9 and 11 (ids and text from the seed, timestamps from the clock) |
| Desktop and hosted loading, encrypted copy, no real projects | README "Loading it" |
| Test run green | above |
| Printed path and counts | above |
| Loads into desktop or hosted app | **Not run.** The README says so and names Tasks 44 and 45 |
| No unobserved result stated in the README | The desktop and hosted load steps are instructions, marked as not run. The marked-document paragraph restates the driver's code (mark written with the target's existing revision id); its pointer to a real mark names later tasks and states no result |

## Not established

- Loading the project (plain or encrypted) into the desktop or hosted app, and the exact projects-directory location inside the desktop userData folder on a machine other than the author's.
- The README's "Run `pnpm install` first" is a precondition read from the wrapper (it uses `cli/node_modules/.bin/esbuild`), not tested without it.
- The image and audio resource names ("Sample figure", "Sample recording") were read from `driver.ts`, not from a loaded project.
