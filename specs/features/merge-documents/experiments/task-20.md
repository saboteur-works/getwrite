# Task 20: metadata carry (pure, FR-10)

`frontend/src/lib/models/merge-metadata.ts`, tests in `frontend/tests/unit/merge-metadata.test.ts`.

## Shape

- `defaultMergeMetadataChoice()` returns `{ fields: [], unitedMultiselectFields: [] }`, a fresh object each call.
- `offerMergeMetadataFields(absorbed)` returns the fields holding a value in some absorbed document (absent, null, blank text and an empty list are not a value), in order of first appearance, each with the values of the documents that hold one.
- `applyMergeMetadataCarry(targetUserMetadata, absorbed, choice)` returns `{ ok: true, userMetadata }` or `{ ok: false, reason, field }` with reason `repeated-field` (two sources for a field that is not united), `unknown-source` (not an absorbed document) or `not-a-list` (a united field whose value is not a list).
- The result carries only the target's `userMetadata`. Name, resource subtype, `wordCountGoal`, compile exclusion, folder and position are not in it, so a merge cannot change them through this function. The result is built key by key from the target's keys, then the chosen fields; no sidecar is spread over another.
- Choices made here: a chosen source that holds no value for the field leaves the field as the target holds it; a united field with several entries in `fields` unites those sources' lists with the target's own, target values first.

## Failing run (tests first)

`pnpm exec vitest run tests/unit/merge-metadata.test.ts` before the module existed: suite failed to load (module `merge-metadata` not found), no tests ran.

## Green run

`pnpm exec vitest run tests/unit/merge-metadata.test.ts tests/unit/split-core-import-graph.test.ts tests/unit/merge-types.test.ts`: 3 files, 41 tests passed. The import-graph test walks every `merge-*.ts` file, so `merge-metadata.ts` is covered.

## Done-when clauses, each pinned by a test

- No choice leaves the target's metadata equal; the result has only `userMetadata` (so name, subtype, goal, compile exclusion, folder, position are outside it); no status invented for a target without one.
- Only fields holding a value are offered, with each source's value.
- A chosen field takes its value from none or exactly one source; two sources for a non-united field is refused.
- Multiselect values from the chosen sources are united without duplicates and keep the target's own.
- A value not carried is unchanged or absent; the source's missing value is not invented.
- Absorbed documents and target are not modified, and the result shares no array with them (mutation test).
- Default choice is unticked.
- No I/O: the module has no runtime imports (checked by a test reading the source).

## Checks

- `pnpm typecheck` (frontend): clean.
- `pnpm lint` (frontend): 0 errors, 459 warnings (existing; none from the new files).
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): clean.
- `pnpm --filter getwrite-cli typecheck`: clean.

## Not run

Full `test:ci` suite, Storybook, e2e and builds.
