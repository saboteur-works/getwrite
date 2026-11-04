# Editor Position Memory (developer reference)

When a writer comes back to a text document in the same session, the editor puts the cursor (or selection) back where it was and scrolls to the same place. A document opened for the first time in the session starts at the top, as before. Spec: `specs/features/editor-position-memory.md`. Running-app record: `specs/features/editor-position-memory/experiments.md`.

## What is kept, and where

- One record per document: the ProseMirror selection `anchor` and `head`, and `scrollTop` of the rich editor's scrolling element, `.tiptap-editor-content` (`EditorContent`'s wrapper; rule in `styles/getwrite-utilities.css`).
- Keyed by project directory id and document id (`editorPositionKey`).
- In memory only, in a module-scoped `Map` in `components/Editor/editorPositionMemory.ts`. Nothing is written to the project, `localStorage`, `sessionStorage` or IndexedDB. A page reload or an app restart starts with no records, and each device or browser has its own.

## Files

- `components/Editor/editorPositionMemory.ts`: the store (`recordEditorPosition`, `getEditorPosition`), `editorPositionKey`, and the pure `resolveRestoredSelection` (no record gives position 0; each end is clamped to `0..doc.content.size`).
- `components/Editor/loadDocumentIntoEditor.ts`: `settleCreatedEditor(editor, recorded?)`. With no record it runs `setTextSelection(0)`, as before. With a record it sets `TextSelection.between` at the clamped ends, which keeps the selection's direction. Both run in an `addToHistory: false` transaction that changes only the selection, so there's no update, no undo step and no save.
- `components/Editor/useEditorPositionMemory.ts`: the hook `TipTapEditor` uses, `{ beginLoad, restore, recordSelection }`.
- `components/TipTapEditor.tsx`: optional `positionKey` prop. `onCreate` calls `restore`, falling back to `settleCreatedEditor`. The content-sync effect calls `beginLoad` before `loadDocumentIntoEditor` and `restore` after it. `onSelectionUpdate` calls `recordSelection`.
- `components/WorkArea/EditView.tsx`: passes `positionKey` for the selected document unless an older (non-canonical) revision is shown.

## How it behaves

- **Two load paths.** A document reaches the editor either through a new editor (`onCreate`), when `EditView` shows "Loading this document…" because there's nothing to show meanwhile, or through the content-sync effect into the mounted editor (`useRevisionContent.ts` `loadState`). Both restore. A second-stage load of the same document (its own file first, then the canonical revision) restores again from the same record.
- **The key belongs to the loaded document.** On a switch, `positionKey` can change a render before the new document arrives. The hook takes the key at each load, and records go to that key until the next load. So the old document's position is never filed under the new document.
- **What is recorded.** Every selection change made by the writer, and every scroll of `.tiptap-editor-content`. Transactions marked `addToHistory: false` (loads, restores, structural normalisation) are not recorded, so a load can't overwrite the record it's about to restore.
- **Scroll restore** sets `scrollTop` directly in the next animation frame, retrying for up to 10 frames until it reaches the target. It doesn't use `scrollIntoView`: a selection change alone doesn't scroll, and nothing on creation focuses the editor.
- **Mention jumps win.** Any recorded selection change while a scroll restore is pending cancels it, so a mention jump's cursor and scroll stand.
- **Not recorded:** Markdown source mode (its textarea has its own cursor and scroll), and older revisions (no `positionKey`). Leaving source mode returns to the rich editor at its last recorded rich-editor position.

## Known limits

- When the writer leaves a document while viewing an older revision, the next document can get no key until its revisions load, so it opens at the start, as before this feature.
- A document whose text changed elsewhere since the record (another device, a revision restore) gets the clamped position, which may not be the same sentence.

## Tests

- `tests/unit/editorPositionMemory.test.ts`: resolver and store.
- `tests/unit/editor-document-load-history.test.ts`, `settleCreatedEditor`: a real headless editor. Checks the restored cursor and selection, clamping, and no document change, update or undo step.
- `tests/unit/useEditorPositionMemory.test.tsx`: the hook with a real headless editor. Checks record and restore across editors, the mounted-editor load path, key ownership, no key, source mode, and the mention-jump order.
- `tests/editView.test.tsx`: the key `EditView` passes, with the canonical and an older revision.
