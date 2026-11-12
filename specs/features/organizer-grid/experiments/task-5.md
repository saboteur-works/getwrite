# Task 5: Pure source model (tree order and source resolution)

Results only. OBSERVED = printed by a command run in this worktree (command sandbox, Vitest, node); READ = read in source.

## What was added

- `frontend/components/WorkArea/Views/OrganizerView/organizerSource.ts`: `listChildrenSource`, `listDescendantsSource`, `resolveSmartFolderSource`, `resolveOrganizerSource`. Imports only types from `src/lib/models/types` and `organizer-grid-types` (type imports).
- `frontend/tests/organizerSource.test.ts`: 18 tests.

## Inputs read

- Task 1 (a), OBSERVED there: Organizer order `Folder1, Folder2, DocA, DocB, DocC`; tree order `DocA, Folder1, DocB, Folder2, DocC` for one parent. The children source reproduces the first; the descendants source follows the second rule.
- `buildResourceTree.ts` (READ): a parent that is not a folder in the project re-parents the item to root; a folder's parent is `parentId ?? folderId`; children are pushed in input order and `ResourceTree.getChildren` sorts them by `orderIndex` (stable). The module follows the same rules, so an `orderIndex` tie is broken by input order.
- Task 3 (c): the smart-folder read yields an id list; this module takes that list.

## Test-first order

The test file was written first and run before the module existed: `Cannot find module .../organizerSource`, 0 tests (OBSERVED). The module was then written.

## Commands and results (all from `frontend/`)

- `pnpm exec vitest run tests/organizerSource.test.ts`: 1 file passed, 18 tests passed.
- `pnpm typecheck`: no errors printed.
- `pnpm exec eslint components/WorkArea/Views/OrganizerView/organizerSource.ts tests/organizerSource.test.ts`: no output.
- `pnpm exec prettier --write` on both files: unchanged.

## Done-when clauses against tests

- Descendants depth-first, children by `orderIndex`, interleaved: test "is depth-first, interleaved as the tree does", result `DocA, DocX, DocY, DocZ, DocB, DocW, DocC`.
- Compared with `buildResourceTree` output: tests "matches the order buildResourceTree produces" and the tie test walk `buildResourceTree`'s result (children sorted by `orderIndex` as `getChildren` does) and compare to the module.
- Children keep folders first: `Folder1, Folder2, DocA, DocB, DocC`.
- Documents only (descendants and smart folder): asserted; a folder id in a smart-folder list is returned in `skippedFolderIds`.
- Smart-folder ids returned in tree order whatever the id order; an id missing from the project is in `missingIds` and the rest is still returned.
- No React, Redux or `@dnd-kit` import and no `randomUUID`: asserted by a test that reads the module's import lines.

## Choices made (assumptions, not owner decisions)

- Result shape `{ cards, missingIds, skippedFolderIds }`; the dispatcher adds `unresolved` for a smart-folder source whose id list has not arrived (never an empty list).
- A folder source whose folder id is absent, or names a document, reports that id in `missingIds`.
- Duplicate ids in a smart-folder list yield one card.
- Items left out of the walk by a folder cycle are appended after the walk in input order for the smart-folder source; descendants of a cycle return no cards (tested for termination).

## Not verified

- Behaviour against a real project of the sizes Task 4 generates (no timing taken).
- Wiring into `OrganizerView.tsx`; not part of this task.
- The full `pnpm test:ci` and `pnpm lint` over the repo were not run, only the files above.
