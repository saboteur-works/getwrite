# Feature 101 experiments

Measurements are recorded as observed values with the command or test that produced them. A cause is written only where an experiment separated it from the alternatives; anything else is labelled HYPOTHESIS. Each part appends to its own section.

## Environment record

Date: 2026-11-04. Tree: branch `feat/compile-defaults-annotations-native-pdf`, isolated worktree, base `cfb18b51` plus the Task 1 files. Node v24.15.0, pnpm 10.28.0, Vitest v4.1.6, `pdfjs-dist` 6.5.438 (`frontend/node_modules/pdfjs-dist/package.json`). Everything ran inside the command sandbox; `pnpm` printed a `~/.npmrc` EPERM warning on each call (a sandbox denial, not a result). `next build`, `pnpm build:native`, Storybook and Playwright were not run.

### PDF text tool (Task 1, FR-8, FR-26, FR-35)

| Item | Test or command (cwd) | Observed |
| --- | --- | --- |
| `pdfjs-dist` runs in the node Vitest project | `pnpm exec vitest run tests/unit/pdf-text-helper.test.ts` (`frontend/`) | 1 file, 6 tests passed; the project label in a failing first run was `\|node\|`; import is `pdfjs-dist/legacy/build/pdf.mjs` |
| Extraction of a `compilePdfCore` PDF | same file, first test | extracted page texts contain the header `Chapter One` and body `The quick brown fox` |
| Control: one changed letter | same file, second test | pages extracted from "fox" and "fax" inputs are not equal |
| Validity check | same file | a `compilePdfCore` PDF reports `{ valid: true }`; a buffer without `%PDF-` is invalid; a PDF with its last 2048 bytes removed is invalid; a body with header and `%%EOF` but no PDF structure makes extraction throw |
| First run before a fix | same command | 3 tests failed with `doc.destroy is not a function` (in pdfjs-dist 6.5.438 `destroy` is on the loading task, not the document); helper changed to call `task.destroy()`; then 6 passed |
| typecheck | `pnpm typecheck` (`frontend/`) | exit 0 after removing an `isEvalSupported` option the 6.5.438 types do not declare (first run: TS2353) |
| eslint, prettier | `pnpm exec eslint` and `prettier --check` on the two new files | no output from eslint; prettier clean |
| knip | `pnpm knip` (repo root) | exit 1 (pre-existing findings); no line mentions `pdfjs` or `pdf-text` |

The FR-8 fallback (compare react-pdf's element tree) was not needed and not implemented: `pdfjs-dist` ran in the node project.

Not measured: extraction on multi-page output or with bold, italic or non-Latin runs; whether extraction order matches reading order for those; the `font-fallback` document (`CompilePDFFallbackDocument`); the native path of `compilePdfCore` (FR-26); the text-item join (newline on `hasEOL`) is the helper's own choice, and its stability across `pdfjs-dist` versions was not checked.

## Part 1: compile and export defaults

### Start Page list entry `config` (Task 2, OQ-5) - a reading, not a run

Read: `frontend/src/lib/models/project-crud-core.ts` `listProjectsCore` (157-236, `listEncryptedProject` 279-321), `frontend/src/lib/api/schemas.ts` (`ProjectListEntrySchema` and its three members, `ProjectSchema`, `ApiProjectConfigSchema`), `frontend/src/lib/api/projects.ts:116-130` (`httpProjectsTransport.list`).

Observed, by entry shape:

| List entry shape | Carries `project.config`? | Where |
| --- | --- | --- |
| Normal (unencrypted, usable) | Yes. `listProjectsCore` returns `{ project: manifest, resources, folders }` with the parsed `project.json` verbatim; `config` is whatever the manifest holds | `project-crud-core.ts:232` |
| Encrypted, unlocked | No. `project` is built as `{ id, name, createdAt, rootPath }` | `project-crud-core.ts:299-319` |
| Encrypted, locked | No. `project` is `{ id, createdAt }` | `project-crud-core.ts:290-297`; `LockedProjectListEntrySchema` |
| Unusable | No. `project` is a strict `{ id }` | `UnusableProjectListEntrySchema` |

On the client, `httpProjectsTransport.list` parses with `z.array(ProjectListEntrySchema)` and returns the parsed data, so any `config` key not declared in `ApiProjectConfigSchema` is dropped. Before this task `compileDefaults` and `exportDefaults` were not declared there; the new test "keeps compileDefaults and exportDefaults through the client list parse" failed first (keys absent from the result) and passes now that they are declared.

Reading consequence for Task 8 (OQ-5): a normal Start Page entry carries `config` and so can carry saved defaults. Encrypted entries (unlocked or locked) and unusable entries do not carry `config`, so no saved defaults are available from the list for them. The native list path (`native-projects-backend`) was not read, so whether it returns the same shape was not checked; `listProjectsCore` is the shared core for it per its header comment, but that was not verified here.

Tests added in this task (frontend node project, `pnpm exec vitest run` on the three files, 89 passed): `tests/unit/project-config.test.ts` (schema parse, absence, extra field rejected, bad shape rejected), `tests/unit/projects-api-validation.test.ts` (client list parse keeps both keys, neither key absent, extra field rejects the list), `tests/unit/project-crud-core-listing.test.ts` (a normal entry carries the manifest's `config`).

## Part 2: annotations

(No measurements yet.)

## Part 3: Android PDF

(No measurements yet.)
