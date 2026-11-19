# Task 35: Tree selection and context-menu Merge

Results of this task only. All runs are Vitest (jsdom) with real `fireEvent` clicks on the real `ResourceTree` over a real store. No real browser, no touch, no keyboard range selection (Shift+Arrow, Space), no Electron.

## What changed

- `frontend/components/ResourceTree/ResourceTree.tsx`
  - Ctrl/Cmd click no longer runs the library's own `onClick` after the local handler (see "Why the selection collapsed" below).
  - `handleClick` keeps the selection the click produced (ids, not item objects), no longer calls `selectUpTo` a second time, and dispatches the clicked row as the opened document only when the click left it selected.
  - The `selectedResourceId` effect leaves a selection that already holds the opened document alone; any other change still replaces the selection with it.
  - New state `selectionOrder`: the selected rows in the order they were selected (the explicit first-selected id `experiments/task-2.md` asked for), reconciled with the tree's own selection at render.
  - Each selected row's menu gets a `merge` item state; eligibility is `mergeEligibility` over what the client holds per row (`type`, `entityKind`, `mergedMark`).
- `frontend/components/ResourceTree/ResourceContextMenu.tsx`: optional `merge` prop; `MergeMenuItem` after Duplicate, rendered only when `merge` is given and `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME !== "native"` (inline comparison). Disabled shows the reason as visible text named by `aria-describedby`, as Split does; accessible name stays "Merge".
- `frontend/tests/component/ResourceContextMenuMerge.test.tsx`: 24 tests.

## Undeclared file touched (and why)

`frontend/src/lib/models/schemas.ts`: `ResourceBaseSchema` gains `mergedMark: z.unknown().optional()`. Measured before the edit (a throwaway probe test, deleted): `AnyResourceSchema.safeParse` of a text resource carrying `mergedMark` and an unrelated key `zz` returned an object with neither key. `AnyResourceSchema` is what the project-open response schemas use (`lib/api/schemas.ts`), so a marked document reaches the client store without its mark. The test "is kept when a resource is parsed at the response boundary" is red before the edit and green after. The value is left `unknown` so that a malformed stored value cannot make a whole project list fail to parse; its shape is checked where it is read (`merge-mark-core.ts`, and Task 36's hook).

### Finding for the lead (not fixed beyond the schema)

Readers written in Tasks 28 to 31 and the Feature 120 editor-menu check read `mergedMark` from client resources (`DataView.tsx`, `status-rollup.ts`, `compileSelection.ts`, `EditorContextMenu.tsx`). Their tests build the store directly with the key present. Until this edit, a project loaded through the response parse would not have had the key, so those readers would not have seen a mark in the running app. This was MEASURED at the schema only (the probe above); no running app, project load or those readers were exercised with the key after the edit. The lead's packaged run (Task 44) should check a marked document's tree label, the Data view total and Compile in a real load.

## Why the selection collapsed (measured here, adds to `task-2.md`)

`task-2.md` left open why `getSelectedItems()` held one id for a Ctrl/Cmd click at the `handleClick` single-item branch. The failing run showed Ctrl-click A2 then A4 then A1 collapsing to the last row. With the library's own handler no longer run after the local toggle, Ctrl/Cmd selections survive, which is consistent with the library's handler toggling the same row a second time. That reading is supported by the green runs below; the library source was not re-read here.

## Rules chosen (owner may overrule)

- First selected row = the row clicked first (the anchor of a plain click), not the topmost row. A Shift range upward from A3 to A1 sends `[A3, A1, A2]`. The merge appends the others in tree order itself (FR-3), so only the first matters. This matches the refusal text "The first document you selected".
- Ctrl/Cmd adds a row after the earlier ones, in click order. Ctrl+Shift adds the new rows of the library's range after the earlier ones. The library extends from its own anchor, the last plain click, not the last Ctrl-click (test comment records it).
- A right-click on a row outside the selection offers no Merge item (a single row is not a selection of two); on a row inside it, Merge acts on the whole selection.
- A selection made by keyboard (Shift+Arrow) is not tracked by `selectionOrder`; the reconcile step gives tree order for such rows, so the first is the topmost. Not exercised.
- The maximum number of documents is not checked in the menu; the preview refuses with the cap text in the dialog (Task 34 shows a refusal inline). A cap check in the menu would be a further reason text and test.

## Tests first

Run before the production edits: 17 of 24 failed (the Ctrl, Cmd, Shift, Ctrl+Shift selections collapsing to the last clicked row; no Merge item for any reason, including the five reasons; the schema stripping the mark; the tree not calling the host; axe case with the item disabled because the item did not exist). 7 passed before the edits because they pin behaviour that must stay (single row offers no Merge, existing items list, Android renders none, replace-on-plain-click, source scans). After the edits: 24 of 24.

## Done-when clauses

| Clause | How verified |
|---|---|
| Offered on two or more rows only; first selected row is the target, without reordering | MEASURED (jsdom): tests for Ctrl, Cmd, Shift down, Shift up, Ctrl+Shift; single row and outside-selection right-click show no item |
| Acts on the whole selection when the right-clicked row is in it | MEASURED: `openMergeDialog` called with every selected id |
| Selection reaches the menu and survives the `selectedResourceId` effect | MEASURED: `aria-selected` rows after Ctrl and Cmd clicks; the effect change is in `ResourceTree.tsx` |
| Disabled with the Task 16 reason, a test per reason, not hidden | MEASURED: folder, Source, entity document, media, marked as first (`merged-target`), marked not first (`merged-absorbed`); `aria-disabled`, visible text, `aria-describedby` target text equal to the constant; a click calls nothing |
| Native runtime: not rendered, no request | MEASURED with `vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native")`; the bundler's replacement of the inline comparison was not run (no build in a worktree) |
| No palette row, editor menu item, picker or shortcut | READ by test: source scan of `ResourceCommandPalette.tsx`, `EditorContextMenu.tsx`, `AppShell.tsx`, `SplitShortcutExtension.ts` for `openMergeDialog`, and for "Merge" in the first two; the existing tests of each pass unmodified |
| Keyboard operable, accessible name | MEASURED: Enter on the focused menu item calls the host; name "Merge" |
| axe passes | MEASURED: `document.body` with the menu open, item enabled and item disabled with a reason (`color-contrast`, `aria-hidden-focus` off by the helper's default, `region` off by argument as in other menu tests) |
| Existing `ResourceTree` and `ResourceContextMenu` tests unmodified and green | MEASURED: `tests/resourceTree*`, `resourceContextMenu`, `flows`, `smartFolders`, both a11y tree tests, `appShellOrganizerTitleClickViewSuppression` |

## Checks run

- `pnpm typecheck` (frontend): clean. Electron `pnpm typecheck` (both passes) and CLI `pnpm typecheck`: clean.
- ESLint on `components/ResourceTree`, `components/Merge`, the new test and `schemas.ts`: 0 errors; the five warnings printed (`debug` unused, two `useEffect` dependencies on `tree`, one in `CreateResourceModal`, one `alt-text`) are in code that was there before.
- `pnpm test:ci` (whole frontend suite): 1048 files passed, 14932 tests passed, 8 expected fail, 3 skipped. The 8 expected fails and 3 skips are existing.
- Not run: Storybook, e2e, sharing smoke, any build.

## Not verified

A real browser's event order for Ctrl/Cmd and Shift clicks (jsdom events are synthetic), touch selection, keyboard range selection, the Android build's removal of the item (only the inline comparison under a stubbed env), screen-reader use.
