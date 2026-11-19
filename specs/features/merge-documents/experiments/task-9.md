# Task 9: sample project generator, general coverage

Test tooling only (POS `task_23e9c7df`, note `note_eaac570d`). Every value below was observed by running the command beside it from the worktree. Generated projects were written under the OS temp directory only; no real project and no `projects/` path was used; `package.json` and the lockfiles are untouched (`git status --short` lists only the new files below).

## What was built

- `scripts/sample-project/generate.mjs` (wrapper): `--out <dir> [--seed <int>]`. It bundles `driver.ts` with the declared `cli` esbuild (`cli/node_modules/.bin/esbuild`, flags as in `cli`'s `build` script, `server-only` aliased to an empty module) into an OS temp directory, runs the bundle with plain `node`, prints the driver's one JSON line, and removes the temp directory.
- `scripts/sample-project/driver.ts`: the TypeScript driver. The task's Files name no place for it, so it sits beside the wrapper inside `scripts/sample-project/`. It is outside `frontend/tsconfig.json`'s `include`, so `pnpm typecheck` does not see it; it was checked once with `tsc --noEmit` using the frontend compiler options and printed no error.
- `frontend/tests/unit/sample-project-generator.test.ts`: runs the script as a child process into a temp directory and reads the output through `loadProjectCore` and from disk. It uses relative imports because the `@` alias in `vitest.config.ts` points at a path that does not exist (`frontend/@`).

## Approach (from `experiments/task-8.md`)

The driver imports the real core functions: `createProjectFromType` (inline spec object, with `modules` set so sources, claims, citations and folklore are on from creation), `createResourceCore` (folders, text, source), `uploadMediaResourceCore` (image resource), `updateSidecarCore` (subtype, entity kind, aliases), `addField` (metadata schema: a select and a multiselect), `addAttachmentCore`, `addAnnotationCore`, `addClaimCore`, `captureToInboxCore`, `dispatchSavedQueryAction`, `shutdownIndexer`, `rebuildDerivedIndexes`, `loadProjectCore`.

Points from the Task 8 record, and what was done:

- Directory basename as `projectId`: the driver names `<out>/<projectId>` itself and passes that id to every core.
- `EMFILE` watch error: an `uncaughtException` handler ignores only errors whose `syscall` is `watch` and writes one line to stderr. The error appeared in the sandbox on every run here (`ignored a file-watch error: EMFILE`). What starts the watcher was not established; whether it appears outside the sandbox was not run.
- Seed determinism: `crypto.randomUUID` on `globalThis.crypto` is replaced by a seeded generator, so every id the cores draw follows the seed (`generateUUID` calls it). `createResourceCore` ids are therefore seeded without being passed in. Timestamps still come from the clock.
- Audio bytes: an `ID3` header plus an MP3 frame header passed the magic-byte check.
- Not probed in Task 8, now exercised: citation and excerpt annotations (`target`), an image resource shown in text, a text excerpt mark in a Source body.

One run-order observation: with the process ended right after the last core call, the first determinism comparison found a leftover `meta/backlinks.json.<id>.tmp` in one of two runs and differing index files. After adding `await shutdownIndexer()` (drains queued index tasks) before `rebuildDerivedIndexes`, two runs of the same seed had the same file set, no `.tmp` file, and identical contents once ISO timestamps and the root path were normalised (checked by a script in `$TMPDIR`, and by the test). The cause of the earlier difference (queued index writes still running at exit) is a hypothesis consistent with the fix; it was not isolated by a separate experiment.

## Content written

One run with the default seed printed: `{"path":"<out>/<projectId>","projectId":...,"seed":121,"counts":{"folders":7,"resources":8,"text":6,"image":1,"source":1,"annotations":6}}`.

Folders `Manuscript > Part One > Chapter One > Scenes` (depth 4), `Story Elements`, `Research`, and the Inbox. Six text documents with status, subtype (Scene, Character) and custom fields `genre` (select) and `themes` (multiselect); a Source "Field notes" (subtype Reference) with a PNG and an MP3 attachment; an image resource shown in a document; an entity "Mara Venn" with aliases "Mara" and "the cartographer"; annotations: one note, one text excerpt (target on the Source itself), one attachment excerpt (locator, no mark), one citation (target on the Source, in a different resource), two claims (one with a Source link, one without); a table and a code block in one document; one Inbox item; one smart folder ("Drafts", `status eq Draft`).

## Done-when clauses and how each was verified

| Clause | Verification |
|---|---|
| Tests first, shown failing, then green | First run of the new test file with no script present: `6 failed | 20 skipped` (Node `Cannot find module .../generate.mjs`; an earlier run failed on the `@` import path). After the script was written: `26 passed (26)`, final run `Tests 26 passed (26)` |
| Writes one project to `<dir>/<projectId>/`, prints one JSON line | test "writes one project to <out>/<projectId>/ and prints one JSON line" |
| Deterministic from the seed; default seed fixed and documented | test "gives the same ids and text for the same seed" (seed 7 twice, file set and normalised contents equal) and "gives different ids for a different seed"; default 121 (the feature number) in the script header and asserted in the first test |
| Synthetic text only | words come from a fixed list in `driver.ts`; no file is read |
| Refuses a non-empty target directory | test "refuses a non-empty target project directory and writes nothing" (second run into the same `--out` and seed exits non-zero with `non-empty`, file list unchanged). The refused directory is `<out>/<projectId>`, the convention of `scripts/organizer-grid-fixture/generate.mjs`, so one `--out` can hold several projects of different seeds |
| Sets `rootPath` in `project.json` | test "sets rootPath in project.json to the project directory" (also `ProjectSchema.safeParse`) |
| Builds through the Task 8 approach, schema-valid | esbuild bundle of the real cores; test "the project loads through loadProjectCore" (resource and folder counts equal the printed counts) |
| Nested folders, depth at least 3 | test "has nested folders at depth 3 or more" |
| Several text documents with status, subtype, custom fields incl. a multiselect | tests "has several text documents with status, subtype and custom fields" and "has a multiselect custom field with values on a document" |
| Source with image and audio attachment | test "has a Source with an image attachment and an audio attachment" (also checks the files exist) |
| Entity with aliases | test "has an entity with aliases" |
| Annotations of each kind | tests "has a note annotation", "has an excerpt annotation", "has a citation annotation", "has a claim annotation", and "marks every text-annotation in the document body of its resource" |
| Table, code block, image in text | tests "has a table in a document", "has a code block in a document", "has an image in text, pointing at an image resource" |
| Inbox with an item | test "has the Inbox with an item in it" |
| Smart folder | test "has a smart folder (saved query)" |
| Modules on | test "has the sources, claims, citations and folklore modules on" |
| Writes under no `projects/` path unless `--out` points there | test "writes nothing under the repository's projects/ directory" (listing before and after; no `projects/` exists in the worktree); the driver sets `GETWRITE_PROJECTS_DIR` to `--out` before any core runs, because unset it falls back to `../projects` of the working directory |
| `pnpm typecheck` and `pnpm lint` | `pnpm typecheck`: no error. `pnpm lint`: 0 errors (459 warnings repo-wide; the new test file has none after the fix) |
| `package.json` and lockfiles unchanged | `git status --short` lists only `frontend/tests/unit/sample-project-generator.test.ts`, `scripts/sample-project/`, and this file; `git diff --stat` prints nothing |

## Not done or not established

- The `folklore` module is switched on but no Narrative folder or Variant Source is written; the task list's folklore item is "modules on". Task 10 (merge-specific coverage) or a later task may add them.
- No writing-log entries beyond what the Inbox capture adds, and no encrypted copy (Task 11).
- Whether the `EMFILE` watch error appears outside the command sandbox, and which code starts the watcher, were not established.
- The generator takes about 2 to 3 s per run here (esbuild bundle plus the cores); not timed more carefully.
