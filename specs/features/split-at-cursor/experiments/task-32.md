# Task 32: Undo split action in the palette and the editor menu (FR-18, FR-19)

Results of this task only. Every wording in this record and in the code is a DRAFT for owner review (Task 28).

## Files

- `frontend/components/common/ResourceCommandPalette.tsx` (edited, patch-style): an "Undo split" row after the Split row; the palette asks the host to read the latest operation each time it opens.
- `frontend/components/Editor/EditorContextMenu.tsx` (edited, patch-style): renders `SplitUndoMenuItem` and asks the host to read the latest operation when the menu opens (3 added lines plus two imports).
- `frontend/components/Layout/AppShell.tsx` (edited, patch-style): mounts `SplitUndoHost` next to `SplitHost`, not on the native runtime (inline comparison).
- `frontend/tests/component/SplitUndoAction.test.tsx` (new): 33 tests.
- `frontend/stories/Split/SplitUndoAction.stories.tsx` (new): 6 stories (typecheck and lint only; no Storybook build here).

Additional files, not in the declared list, all new, all under `frontend/components/Split/`:

- `splitUndoMessages.ts`: the DRAFT texts as named constants and small describe functions, so Task 28 can review and move them. Needed because `split-messages.ts` is not in this task's Files and has no Undo texts for these cases (recorded in tasks 29, 30, 31).
- `splitUndoRequest.ts`: the module slot between the host and the two surfaces (the availability read from the record, the refresh and undo requests), the same pattern as `splitOpenRequest.ts`.
- `SplitUndoHost.tsx`: the host (reads the record, runs Undo, reports, settles the editor) and `SplitUndoRegions` (the `role="status"` and `role="alert"` regions, exported for the story).
- `SplitUndoMenuItem.tsx`: the menu item, kept out of `EditorContextMenu.tsx` to keep that edit minimal.
- `splitUndoName.ts`: resolves the split-off document's name from the project tree.
- `splitStoredDocument.ts`: reads the stored canonical text and shows it in the editor. `SplitHost.tsx` (Task 25) has the same three helpers but does not export them and is not in this task's Files, so they are copies; merging them into one module is a later change.

Not edited: `ShellModalCoordinator.tsx`, `SplitHost.tsx`, `split-messages.ts`, any model file, `package.json`, any lockfile. The palette needed no new prop: it reads the shared availability and its own `resources` prop.

## How it works (what the code does)

- The host does not read on mount. The palette (when `isOpen` becomes true) and the editor menu (in its `contextmenu` handler) call `requestSplitUndoRefresh()`. The host resets the availability to `unknown`, then reads `requestLatestSplitOperation(projectId)` for the active project. So the action comes from the stored record and survives a reload, and a cleared record removes it at the next open.
- Result mapping: record with `kind: "split"` -> offered, naming the record's `newDocumentId`; `none` or a record of another kind (`merge`) -> nothing offered; a failed read, or a thrown locked-access error, -> a disabled entry carrying its own message (`read-failed`), never the same state as none.
- Offered in any open document and with none open: the palette row does not depend on `openResourceId`; the menu item does not depend on the selected resource.
- Native runtime: the host is not mounted by `AppShell`, the palette row and the menu item are not rendered, and the host's refresh returns before any request, all by the inline `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` comparison.
- Name: from the project tree held in the store (menu) or the palette's `resources` prop. When no document in the tree has the id (a document already in the Trash is not in the tree), the text says "the new document made by the split (its name could not be found in the project)" and still states the Trash and the kept edits.
- Undo run: pending saves are sent first (`flushPendingSaves`; a failure shows an alert and sends nothing); the active editor is set read-only; `requestUndoSplit(projectId)`. A locked project is reported in the alert region and is not unlocked from here (the split host's unlock prompt is not reused).
- After a committed result (`applied`, `index-failed`): availability becomes `none`; the tree is re-read (`openProject`, `loadResources`, `setFolders`, the shared refresh token) and the revision list of the open document is reloaded; if the open editor shows the document that was split, its stored canonical text is read again and shown (`setContent` in a transaction marked `addToHistory: false`, cursor at the end) and its word count in the store is updated; an editor on an unrelated document is left as it is (its stored text is not changed by Undo); an editor on the split-off document (now in the Trash) stays read-only with a sentence saying so. Status text goes to the `role="status"` region; `index-failed` adds an alert naming what was not brought up to date.
- Not committed: `refused` shows the Task 10 text (`SPLIT_UNDO_REFUSAL_MESSAGES`); `nothing-to-undo`, `unsupported-operation`, `could-not-be-checked` each have a text that says nothing was changed; `failed` shows where it stopped (`failedStep`) and the state that remains (`remainingState`, 8 texts), and for a failure that leaves the state not as it was (anything but `split-restored`, and not an invalid request) the editor stays read-only until another document is opened. A transport failure (`cause: transport-failed`) says it is not known whether Undo ran and never reads as `split-restored`.
- The two regions are in the page from the start and empty until there is a message; Dismiss clears both.

## Draft texts (DRAFT, owner review)

All in `splitUndoMessages.ts`. In summary:

- Action: "Undo split"; description "Moves “<name>” to the Trash and puts the document that was split back as it was before the split. Edits made since the split are kept in saved revisions."
- Read failed: "Whether a split can be undone could not be checked. This does not mean there is nothing to undo. Nothing was changed." (and a locked variant).
- Success: "Split undone. “<name>” is now in the Trash." (or already in the Trash / already permanently removed), the count of notes put back when above 0, "Edits made since the split are kept in saved revisions."
- The 8 remaining-state texts, a step label per Undo step, the index-failure text (names the failed steps; says `reindex` repairs the search index, the notes search index, links and mentions and does not rebuild prose diagnostics, which follows the glossary entry for the shared rebuild), and the texts for save failed, locked, invalid request, transport failure, unexpected failure, read-back failed, tree refresh failed, editor held.
- "Nothing was changed" appears only where the code returns before any write: refusal texts are Task 10's; `nothing-to-undo`, `unsupported-operation`, `could-not-be-checked` (read from `split-undo-core.ts`, where each returns before the first step), a save failure before the request, a read failure, a locked read, an invalid request that was never sent. The locked-on-Undo text also says nothing was changed; that sentence rests on the project being refused before the core runs, which was not measured here.
- Claims the texts make that were read, not run: that a failed Undo with `split-off-in-trash` keeps the notes on the original, and that `original-not-restored` keeps the text from before Undo in a saved revision (both from the header comment of `split-undo-core.ts`).

## Order of work and failing run

1. The texts, the module slot, the host, the menu item, the name helper and the stored-document helpers were written first (inverted order, said here): they are leaf files nothing imports until the three edited files are wired, and the test file needs their names.
2. `SplitUndoAction.test.tsx` was then written and run before the three existing files were edited.
   - Command (in `frontend/`): `npx vitest run tests/component/SplitUndoAction.test.tsx`
   - Result: `Tests 29 failed | 4 passed (33)`, 1 file failed. The 4 passes were the two native cases (assert no read and no row or item, true without the wiring) and the two texts tests (pure functions); the cases that wait for a read to be made failed. The 29 failures: the palette and menu never asked the host to read, so no row or item appeared (`findByRole` timed out) and no Undo ran.
3. After wiring: 13 failed. Causes found, all in the tests: the store of the test had no `resources` slice content, so a name could not be resolved (fixed with `setResources`); the palette stayed open with a mock `onClose`, so Radix's hide-others marked the host's regions `aria-hidden` and `getByRole("alert")` found none (fixed with a harness that closes the palette as the shell does); and the menu's axe run needed the `region` rule disabled as `EditorContextMenuSplit.test.tsx` already does for a portal menu. Then 33 of 33 passed.
4. Two type errors after that (`ProjectLockedError` takes a project id; story decorator parameter type) were fixed; typecheck then passed.

## Test coverage (33 tests)

- Palette: absent for none; absent for a `merge` record; present for a split with an unrelated document open, with the new document's name, "Trash" and "Edits made since the split are kept" in its text; present with no document open; present after a fresh mount from the stored record; removed at the next open once the record is none; name-not-found phrase; failed read shows a disabled row with its message and a click sends nothing; locked read message; keyboard (search box, Enter) closes the palette and sends Undo for the project; native: no read and no row; axe.
- Report and editor: success in the status region with the alert region empty, open original reloaded from the stored text once, editor read-only then released, tree re-read; failed save sends nothing; unrelated document untouched; split-off document held read-only; failed read-back alerts and holds; `index-failed`; refusal text; nothing-to-undo; could-not-be-checked; failed with step and remaining state; transport failure; locked project; axe with a status and an alert shown.
- Texts: 8 distinct remaining-state texts carried by the failure text; 3 split-off states.
- Menu (real TipTap editor): item present for a split with no document selected, names the new document, `aria-describedby` set; absent for none; disabled with its message on a failed read; keyboard Enter sends Undo and the status region reports it; native: absent and no read; axe.

## Not verified

- Screen-reader use (no screen reader was run; live-region behaviour is read from the markup and the tests, not heard).
- A real browser, the packaged desktop app, Android (not offered there by the native check; the build was not run), a paired device, the hosted web build. No `next build`, Storybook build, e2e or device run here.
- The stories were typechecked and linted only; they were not rendered.
- The real autosave path (`useCanonicalAutosave`) and a real editor mounted by `EditView` were not exercised for the reload; the host tests use a stand-in editor, as Task 25 did.
- Whether the editor on the split-off document, left read-only, is released by a document switch was read from Task 25's record (`TipTapEditor` content-sync effect), not run here.
- Visual placement of the status and alert box (a fixed box at the bottom left) was not seen.
- Unlocking from Undo split: not offered; a locked project is reported.
- A palette row for a failed read is visible in AppShell tests that stub every request as `{}`; the existing tests pass unmodified, but this means the row appears whenever the read fails.

## Runs (worktree, command sandbox)

- `npx vitest run tests/component/SplitUndoAction.test.tsx`: 1 file, 33 tests passed.
- With the existing tests, unmodified (`tests/component/ResourceCommandPalette.test.tsx`, `tests/editorContextMenu*`, `tests/appShell*`, `tests/component/SplitEntryPoints.test.tsx`, `EditorContextMenuSplit.test.tsx`, `SplitHost.test.tsx`, `SplitDialog.test.tsx`, `SplitA11y.test.tsx`, `tests/shellModalCoordinator.test.tsx`, `tests/captureBox.test.tsx`, `tests/components/CaptureBoxHost.test.tsx`): 29 files, 396 tests passed.
- `pnpm typecheck` (frontend): no errors.
- `pnpm lint` (frontend): 0 errors, 459 warnings (the count before this task; none in the files of this task).
- `pnpm --filter getwrite-frontend check:no-hex`: no violations.
- `pnpm --filter getwrite-electron typecheck` (both passes): no errors. `pnpm --filter getwrite-cli typecheck`: no errors. No model or CLI file was touched.
- Not run: `pnpm test:ci` (full suite), `next build`, Storybook build, e2e.
