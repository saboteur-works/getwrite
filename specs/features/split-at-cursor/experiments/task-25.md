# Task 25: Split host (flush, request, reload, cursor at end)

Results of this task only. Feature 120, FR-7 client half, FR-12, FR-13 (host side), FR-14, FR-19.

## Files

- `frontend/components/Split/SplitHost.tsx` (new): the host.
- `frontend/components/Split/splitOpenRequest.ts` (new helper, named here as allowed): the one open-request function.
- `frontend/components/Split/splitOffset.ts` (new helper, named here as allowed): editor position to plain-text offset.
- `frontend/tests/component/SplitHost.test.tsx` (new): 20 tests.
- `frontend/components/Layout/AppShell.tsx`: mounts the host (7 added lines).
- `frontend/components/TipTapEditor.tsx`: 5 added lines (see "TipTapEditor edit").

## The open-request function

```ts
// frontend/components/Split/splitOpenRequest.ts
export type SplitOpenOutcome = "started" | "no-document" | "busy" | "no-host";
export function openSplitDialog(): SplitOpenOutcome;
```

It returns at once. `SplitHost` registers its opener while mounted (`setSplitOpener`) and clears it on unmount, so it returns `no-host` when no host is mounted (Android runtime, or before the shell mounts). It returns `no-document` when no editor shows a loaded document (`getActiveEditor()` and `getActiveEditorResourceId()` from `activeEditorRegistry.ts`, and an active project directory id) and sends nothing. Tasks 26 and 27 call it; nothing here binds a key, adds a menu item or a palette row.

## Order of work

1. The two small pure helpers (`splitOffset.ts`, `splitOpenRequest.ts`) were written before the tests; their tests are in `SplitHost.test.tsx` and passed on first run. Order inverted for these two because they are tiny leaf files with no behaviour of their own beyond what the host tests exercise.
2. `SplitHost.test.tsx` was written before `SplitHost.tsx` existed. Failing run:
   - Command: `npx vitest run tests/component/SplitHost.test.tsx` (in `frontend/`)
   - Result: `Test Files 1 failed (1)`, `Tests no tests`; the file failed to transform: import of `../../components/Split/SplitHost` could not be resolved.
3. After the host was written, the first run had 16 of 20 failing and 4 passing (the helper and the unmounted-host tests); the 16 failed because the test store's project had no `rootPath`, so `selectActiveProjectDirectoryId` returned null and the host answered `no-document`. That was a test setup error (fixed by giving the test project a `rootPath`); the next run had 2 failing, which looked for the wrong button names in the unlock prompt (fixed); then 20 of 20 passed.
4. Sensitivity check (a deliberate break, then restored): replacing the first `flushPendingSaves()` with a resolved promise and removing the editor-text comparison before the apply made 8 of the 20 tests fail. The file was restored afterwards.

## Offset

`plainTextOffsetAtPosition(doc, pos)` walks the editor's ProseMirror document. A text node adds the characters before `pos`; a paragraph or heading adds one once `pos` is at or past its end; the result is capped at `tiptapToPlainText(doc.toJSON()).length` (that text has trailing line breaks removed). This is the scheme of `tiptapToPlainText`, `split-cut.ts` and `split-eligibility.ts`.

Test: for two documents (heading and paragraphs; one with empty paragraphs at the start and end) and for every ProseMirror position `0..content.size`, the offset is within `0..plain.length`, and where `cutDocument(doc, offset)` cuts, `tiptapToPlainText(first)` equals `plain.slice(0, offset)` with trailing line breaks removed. Fixed cases: inside text, at a block end, after a line break. The schema used in the test has doc, paragraph, heading and text only; list, blockquote, table and code nodes were not exercised.

## Flow (what the code does)

1. `openSplitDialog()`: no editor, resource or project directory id: `no-document`; a split in progress: `busy`. Otherwise the editor is set non-editable (`setEditable(false, false)`) and the work starts.
2. `flushPendingSaves()`. `false` (a tracked save rejected): error toast, nothing requested, editor released.
3. Reads the canonical revision id and stored text (`fetchResourceContent`, `fetchRevisionContent`). A failed read: error toast, nothing requested.
4. If the plain text of the editor's document differs from the plain text of the stored document, the dialog opens with the `stale-cursor` refusal and nothing is requested (this also covers an older revision shown in the editor).
5. Offset from the editor selection head; `hashSplitContent` of the stored string; `requestSplitPreview`. Preview: dialog with data. Stale or refused: dialog with the refusal text of that reason (`SPLIT_REFUSAL_MESSAGES`). Failed: dialog with the failure message.
6. On Split: `flushPendingSaves()` again (`false`: failure in the dialog, no request); then the editor's JSON is compared with its JSON at the preview (and the editor must still be the same resource); a difference shows the stale refusal and sends nothing; then `requestSplit`.
7. `applied` or `index-failed`: notices as `toastService.info`; an index failure as `toastService.error` with the client's message; the tree is re-read (`openProject`, `loadResources`, `setFolders`, shared refresh token, as `useRefreshOpenProjectTree` does, with its own failure message because that hook's text says "capture"); the original's revision list is reloaded; the stored canonical text is read again and loaded into the open editor (`setContent` inside a transaction marked `addToHistory: false`, `emitUpdate: true`), the selection is set to the end of the document, the resource's word count in the store is updated, a success toast is shown, the dialog closes and the editor is made editable again. The original stays open (no resource is selected by the host).
8. `stale`, `refused`, `failed` after the request: shown in the dialog; the editor is released when the dialog closes.
9. A locked project (the locked-access error from either request) mounts `SplitUnlockPrompt`, which mirrors `CaptureBoxHost`: the limits are re-read, the prompt shows only when `isUnlockPromptAllowed`, and the request is retried once after an unlock. A declined prompt ends with a message and no change. The prompt component is mounted only while needed, so the host needs no sharing-limits context (the existing `AppShell` tests render without one).

## Autosave

The autosave request carries content and no hash (Task 2), so the host does not rely on the server for this. What it does:

- The editor is held read-only from the open request until the dialog closes or the stored text is shown, so no text can be typed in the meantime.
- Pending saves are sent before the preview and again before the apply; a failed save stops the split.
- The editor's JSON is compared with its JSON at the preview before the apply; so no autosave of text the server did not see can exist at that moment.
- After the apply the stored text is loaded with an update marked `addToHistory: false`; `EditView.handleChange` treats that as structural-only, keeps its own copy of the document in step and does not queue an autosave.

Test: "writes no autosave of the pre-split text after the apply" registers a flusher that holds a pre-split document as a pending save (real `pending-saves.ts`). The held save is written before the preview request; after the apply, no write occurs, and a later `flushPendingSaves()` writes nothing more. This shows the host sends the held save before the split and nothing sends it after. It does not run `useCanonicalAutosave` itself: the real debounced saver was not exercised (the editor is a stand-in object in these tests).

## TipTapEditor edit

In the existing content-sync effect (runs when `value` changes, i.e. a resource or revision switch), after the load: `editor.setEditable(!readonlyRef.current, false)`, with `readonlyRef` mirroring the `readonly` prop. Reason: when the host could not read the stored text back after a saved split, it leaves the editor read-only (otherwise the next edit would autosave the pre-split text over the truncated original); opening another document must release that. The existing `TipTapEditor`-related tests pass unmodified (see runs).

## Deviations and assumptions

- The Task 25 texts (save failed, read failed, unexpected failure, read-back failed, tree refresh failed, and the success toast) are constants in `SplitHost.tsx`, not in `split-messages.ts`, which only Tasks 10, 22 and 28 edit. Task 28's review can move them. The unlock-declined text reuses `SPLIT_REFUSAL_MESSAGES["locked-project"]`.
- The cursor is the selection head; a range selection splits at the head.
- Source (Markdown) mode: the active editor is the hidden rich editor. `flushPendingSaves` sends a pending source edit, but whether the hidden editor's selection matches what the writer sees in the source text was not measured. The plain-text comparison in step 4 refuses when the editor's text differs from the stored text; it does not detect source mode.
- The success feedback is a toast; the dialog's `status` prop is not used.
- The host reloads the stored text with `emitUpdate: true`. That path (editor `onUpdate` to `EditView.handleChange` with `isStructuralOnly`) is read from source, not run: no real editor is mounted in these tests.
- Not run here (lead's main checkout): `next build`, Storybook build, e2e, any browser or device run.

## Runs (in a worktree, command sandbox)

- `npx vitest run tests/component/SplitHost.test.tsx`: 1 file, 20 tests passed.
- Existing tests, unmodified: `tests/appShell*.test.tsx` (14 files), `tests/tiptapEditorSpellcheck.test.tsx`, `tests/editView.test.tsx`, `tests/page-*.test.tsx`, `tests/work-area-view-gating.test.tsx`, `tests/components/CaptureBoxHost.test.tsx`, `tests/components/ShareCaptureHost.test.tsx`, together with `SplitDialog.test.tsx` and `SplitA11y.test.tsx` and the new file: 26 files, 283 tests passed.
- `pnpm typecheck` (frontend): no errors.
- `pnpm lint` (frontend): 0 errors, 459 warnings (existing, none in the files of this task; `eslint` on the Task 25 files printed nothing).
- `pnpm --filter getwrite-frontend check:no-hex`: no violations.
- `pnpm --filter getwrite-electron typecheck` (both passes): no errors.
- `pnpm --filter getwrite-cli typecheck`: no errors.
