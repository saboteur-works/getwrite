# Task 34: Merge host (flush, request, reload)

Results of this task only. Everything below was run in a worktree with Vitest (jsdom) over a fake editor; no browser, no Storybook, no packaged app.

## What was built

- `frontend/components/Merge/mergeOpenRequest.ts`: the one open-request slot, `openMergeDialog(documentIds)`, returning `started`, `too-few-documents`, `no-project`, `busy` or `no-host`. Ids are taken in selection order and never reordered; the first is the target.
- `frontend/components/Merge/MergeHost.tsx`: flush, read each stored canonical text (locked-aware read through `splitStoredDocument.ts`), request the preview with each document's canonical revision id and `hashSplitContent` of its stored text, show `MergeDialog`, apply, then show the stored text of the document the editor shows.
- `frontend/components/Layout/AppShell.tsx`: mounts `<MergeHost />`, not on the native runtime (inline `NEXT_PUBLIC_GETWRITE_RUNTIME !== "native"`).
- `frontend/tests/component/MergeHost.test.tsx`: 23 tests.

`frontend/components/TipTapEditor.tsx` was declared for this task and was not edited. The autosave path was read first: a stored text shown with `emitUpdate: true` under `addToHistory: false` reaches `EditView` as structural-only and is not autosaved, and `TipTapEditor` already re-enables a read-only editor on a document switch (Feature 120, Task 25). The pre-merge autosave is sent by `flushPendingSaves` before the apply, and the editor is read-only between that flush and the reload. If a run in a real editor shows otherwise, this is where to look; it was not measured outside the fake editor.

## Undeclared file touched

`frontend/components/Split/SplitHost.tsx`: one word, `export` added to `SplitUnlockPrompt`, so the merge host uses the same unlock prompt instead of a copy. No behaviour change; the Split tests pass unmodified.

## Tests first

Run before `MergeHost.tsx` existed: `npx vitest run tests/component/MergeHost.test.tsx` failed with 1 file failed, "no tests", at import resolution of `components/Merge/MergeHost` (module missing). After writing the host: 23 passed.

## What the tests show

- Flush before preview: a flusher registered at stage `queued` records `flush-save`; its index in the call log is below the stored read and below `preview`.
- The preview request carries, for the selection `[B, A, C]`, `{ resourceId, revisionId, contentHash }` per document in that order, the hash being `hashSplitContent(stored text)`.
- A pending save that does not land stops the merge with a toast and no preview request.
- An unreadable stored text stops with a toast and no preview request.
- Stale: a stale preview outcome, a stale apply outcome and an editor whose text differs from the stored text each show the stale message from `merge-messages.ts`, leave the Merge button disabled, send no merge and load nothing into the editor. Cancel releases the editor and a second request starts.
- After a successful merge with the target open: the editor was made read-only (one `setEditable(false)`), the pending autosave was written once and before `merge`, none after it (a further `flushPendingSaves` after the apply writes nothing), the editor shows the stored merged text through `setMeta("addToHistory", false)` and is released.
- With an absorbed document open: the editor shows that document's stored text after the merge (marks stripped in the fixture); the target's text is not loaded into it; the target's stored text was read once, before the merge.
- With a document outside the selection open: the editor is untouched (no load, `setEditable` never called). With no editor open the merge still runs.
- The merge request carries the same documents as the preview and the carry-over choice from the dialog.
- `index-failed` shows `result.message` as an error toast and the stored text is still shown; `failed` shows its message in the dialog, loads nothing and keeps the dialog open.
- Locked project: a locked stored read, a locked preview and a locked merge each open the unlock prompt and retry once; declining ends with the locked message from `merge-messages.ts` and no request.
- Mounting adds no `keydown` or `keyup` listener on `document` or `window`; a Mod+Shift+M keydown requests nothing.

## Checks run

- `pnpm typecheck` (frontend): clean. Electron `pnpm typecheck` (both passes) and CLI `pnpm typecheck`: clean.
- `pnpm lint` (frontend): 0 errors; 459 warnings, none new from the files of this task (ESLint run on `components/Merge`, `AppShell.tsx`, `SplitHost.tsx` and the new test printed nothing).
- Vitest: `MergeHost`, `SplitHost`, `MergeDialog`, every `tests/appShell*`, `tests/tiptapEditor*`, `tests/unit/split*`, `tests/component/Split*` and `core-import-graph`: 43 files, 720 tests passed, none modified.

## Decisions and wording-review items (Task 37)

The host's own texts are not in Task 16's constants, so they are drafted and exported from `MergeHost.tsx`: `MERGE_SAVE_FAILED_MESSAGE`, `MERGE_READ_FAILED_MESSAGE`, `MERGE_UNEXPECTED_FAILURE_MESSAGE`, `MERGE_RELOAD_FAILED_MESSAGE`, `MERGE_TREE_REFRESH_FAILED_MESSAGE`, `MERGE_SUCCESS_TITLE` and `describeMergeSuccess`. They follow the Split texts. If the owner wants them with the other merge texts, they move to `merge-messages.ts`.

An editor is held read-only only when it shows one of the selected documents; any other open document is left alone.

## Not verified

No real editor, browser, Storybook, Electron or hosted run; the fake editor stands in for TipTap, so "no autosave after the apply" is shown against the flush and the structural-only meta, not against `useCanonicalAutosave` itself. Screen-reader use not verified.
