# Task 26: Editor context menu Split item (FR-13, FR-2)

Results of this task only.

## Files

- `frontend/components/Editor/EditorContextMenu.tsx` (edited, patch-style): Split item, `SplitMenuItem`, `readSplitItemState`.
- `frontend/tests/component/EditorContextMenuSplit.test.tsx` (new): 11 tests.
- `ResourceContextMenu.tsx` not edited.

## Failing run (tests first)

Command: `npx vitest run tests/component/EditorContextMenuSplit.test.tsx` (in `frontend/`), test file written, component unchanged.
Result: 1 file failed; 7 failed, 4 passed (11). The 7 failures (enabled item, keyboard, five disabled reasons) are `getByRole("menuitem", { name: "Split" })` finding no element. The 4 passing tests were the native case, the no-store case and the two axe tests; they pass before the change because they assert absence or scan a menu without the item (the axe tests then also pass with the item, see below).

## How the menu learns the document

The menu has only the `editor` prop. It reads the Redux store through `ReactReduxContext` (as the spelling items already do), at the moment the menu opens (in the `contextmenu` handler, so keyboard-opened menus are covered too): `selectResource(state.resources)` gives the selected resource, and `splitEligibility({ document: null, sidecar: { ...resource }, offset: 0 })` (Task 11, no I/O) is used for the kind refusals only. A result that is one of media, folder, source, entity, merged disables the item with `SPLIT_REFUSAL_MESSAGES[reason]`; every other result (including the cursor-dependent ones and `stale-cursor` caused by the null document) leaves it enabled. No prop was added.

- No store mounted, a store without a `resources` slice, or no selected resource: no item. This keeps the existing menu tests (which render with no Provider, or with partial stores, and count the items) unchanged.
- `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`: no item, no request.

## Disabled item

`aria-label="Split"` (name stays "Split"), `aria-disabled`/`data-disabled` from Radix, and `aria-describedby` pointing at visible secondary text inside the item holding the reason. Radix skips disabled items in arrow-key navigation (measured in an existing test), so the reason is reached through the item's description by screen-reader browsing, and it is also visible text.

## Open point (stated, not decided here)

No `mergedMark` field is declared on the resource types or read anywhere in `src/` or `components/` outside the split modules. The merged case is detected from the resource object in the store through `isMergedDocument` (key `MERGED_MARK_SIDECAR_KEY`). Whether the store's resource objects carry that key once Feature 121 writes it was not measured; the test sets it on the store object. If the project load strips it, the item would stay enabled for a merged document and the dialog or server refusal (FR-2 server enforcement) is the backstop.

## Green run

`npx vitest run tests/editorContextMenu tests/component/EditorContextMenuSplit.test.tsx tests/component/SplitHost.test.tsx tests/component/SplitDialog.test.tsx tests/resourceContextMenu`: 9 files passed, 153 tests passed (existing `editorContextMenu*.test.tsx` and `resourceContextMenu.test.tsx` unmodified).

A first green attempt had 14 failures in `editorContextMenuSpelling.test.tsx`: its store has no `resources` slice and `state.resources` was read unguarded in the `contextmenu` handler. Fixed with the guard above; the next run passed.

## Checks

| Check | Result |
|---|---|
| `pnpm typecheck` (frontend) | no errors |
| `pnpm lint` (frontend) | 0 errors, 459 warnings, none in the two files of this task |
| `pnpm --filter getwrite-frontend check:no-hex` | no violations |
| `pnpm --filter getwrite-electron typecheck` | no errors |
| `pnpm --filter getwrite-cli typecheck` | no errors |

Axe: two tests (enabled item, disabled item with reason) run `runAxe` with the menu open; both pass. No builds, e2e or browser runs.
