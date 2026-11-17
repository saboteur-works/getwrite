# Task 19: preview and staleness core (FR-7 server half, FR-12 data)

Files: `frontend/src/lib/models/split-preview-core.ts`, `frontend/tests/unit/split-preview-core.test.ts`, this record. Node v24.15.0.

## Failing run (tests first)

Command (from `frontend/`): `pnpm exec vitest run tests/unit/split-preview-core.test.ts`, with the test file written and `split-preview-core.ts` set aside. Output summary: 1 file failed, "no tests"; the import of `../../src/lib/models/split-preview-core` did not resolve. (The implementation had been drafted before this run and was moved aside for it; the failure shown is the missing module, not a behavioural assertion.)

## Green run

`pnpm exec vitest run tests/unit/split-preview-core.test.ts tests/unit/split-core-import-graph.test.ts`: 2 files, 41 tests passed (36 + 5). No assertion failed on the first green run.

## Design as built (facts about the code)

- `hashSplitContent(content)`: SHA-256 hex over the UTF-8 bytes, plain TypeScript, synchronous (`crypto.subtle` is unavailable over plain HTTP, the reason `generateUUID` has a fallback). Tests compare it with `node:crypto` SHA-256 for 11 inputs, including lengths 55, 56, 63, 64, 119, 120, non-ASCII and a TipTap document.
- `evaluateSplitRequest(projectRoot, request)`: takes no lock, writes nothing. Order: resource id valid, sidecar read, kind refusal (Task 11 function with `document: null`, so a Source or image is refused without a revision), canonical revision found, request revision id equals it (else `stale-cursor`), stored text read, hash equals (else `stale-cursor`), JSON parsed as a document (else `failed`), Task 11 eligibility, `cutDocument`. Returns `ready` with revision, raw content, document, sidecar and the cut.
- `previewSplit(projectId, request)`: `resolveResourceProjectRootOrThrow`, then `acquireLock` on the revision-content key around `evaluateSplitRequest` only (released before the annotation and field work), then word counts (`countWords(tiptapToPlainText(half))`), `partitionAnnotations` with no chosen ids (groups the `after` ids by kind and lists the `spanning` ones), and the field list.
- Annotation kind: a `claim` marker makes a claim; otherwise a `target` makes a citation; otherwise a note.
- Field list: fields of the stored `config.metadataSchema` (read from `project.json` without `getSchema`, which can write a migration), then the built-in fields of `DEFAULT_METADATA_SCHEMA` not already listed (status, point of view, synopsis, notes, timeline), then any `userMetadata` key the schema does not list (label = key), then `wordCountGoal` when the sidecar has one. `hasValue` says whether the original holds a value.
- Failures: unreadable sidecar, revisions, content or `project.json`, content that is not a document, no canonical revision and a missing sidecar are `failed` with a cause string; a locked-access error is rethrown. A failed outcome has none of the preview's fields (asserted).

## Lock key (deviation to note)

`revision-core.ts` builds the key inline as `revision-content:${path.resolve(projectRoot)}:${id}` and only Task 16 may edit that file; split files may not import `node:path`. `revisionContentLockKey` therefore rebuilds the key. For an absolute normalised root (what `resolveProjectRoot` returns) `path.resolve` is the identity, so the keys are equal; a test compares the two. A root that is not absolute throws `SplitLockKeyError` rather than guessing (a wrong key would not exclude a concurrent autosave). Not covered: a relative `GETWRITE_PROJECTS_DIR` (would make `previewSplit` and the later apply throw). Exporting the key builder from `revision-core.ts` would remove the duplicate; not done here (outside this task's Files).

## Note for Task 23 and later

`hashSplitContent` is exported from `split-preview-core.ts`, which imports server-only model code. A browser bundle that imports it from there pulls that code in; moving the function to its own small file would fix that and is outside this task's Files.

## Checks

- `pnpm typecheck` (frontend): exit 0.
- `pnpm lint` (frontend): first run 1 error (naming convention, boolean `ok`), fixed; second run 0 errors, 459 warnings.
- `pnpm --filter getwrite-electron typecheck` (both passes): exit 0. `pnpm --filter getwrite-cli typecheck`: exit 0.
- Regression: `pnpm exec vitest run` over `tests/unit/revision*`, `meta-locks`, `lock*`, `resource-crud*`, `trash*`, `split-preview-core`, `split-core-import-graph`: 41 files, 436 tests passed; and `tests/unit/lock*`, `project-json-lock*`, `file-lock`: 6 files, 105 tests passed.
- Not run: the full frontend suite, builds, e2e, any device.
