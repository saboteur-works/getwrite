# Task 11: Folder metadata clearFieldKeys

Results only. Record written after the fact on 2026-11-11 from commit `f1f93f15` (the task's own record file was not created at the time).

## What was added (read from `git show f1f93f15`)
- `folder-metadata-core.ts`: an optional `clearFieldKeys` write key, accepted beside `FOLDER_METADATA_WRITABLE_KEYS`, which is unchanged. Validation (`validateClearFieldKeys`): a list of non-blank strings; not `notes` or `__proto__` (the reserved field keys); no duplicates; at most 50 entries (`MAX_CLEAR_FIELD_KEYS`; the 50 is an implementor assumption, the spec gives no figure); must not overlap the keys of `fieldValues` in the same write. No refusal message carries any part of the input. `buildStored` deletes the named keys from the merged `fieldValues`.
- `app/api/project/folder-metadata/route.ts` and `src/lib/api/folder-metadata.ts`: doc comments only; no code change (route, client and native backend pass `metadata` to the same core).
- Tests added: `tests/unit/folder-metadata-core.test.ts`, `folder-metadata-route.test.ts`, `folder-metadata-transport.test.ts`.

## Observed (re-run on 2026-11-11)
- `cd frontend && npx vitest run tests/unit/folder-metadata tests/unit/native-folder`: 4 files, 55 tests passed.

## Reported by the original implementor, not re-run here
- Frontend typecheck, Electron typecheck and CLI typecheck: reported clean.
- The 55-tests-across-4-files figure of the original run matches the re-run above.

## Not verified
- Red-first order for this task was not recorded.
