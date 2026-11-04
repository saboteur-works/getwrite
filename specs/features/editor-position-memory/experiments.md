# Editor position memory: experiments

## E-1. Running-app check (Task 3 / FR-11), 2026-11-03

**Method.** I built the web app from `feat/editor-position-memory` with the Task 1 to 3 changes (`pnpm build`, standalone server, static assets copied). The handbook harness (`specs/features/user-handbook/scripts/task3-lib.mjs` `withWeb`) ran it on a free port with a throwaway projects folder. Chromium, viewport 1400×900. Script: `scripts/check-position.mjs`. Log: `logs/check-position.txt`.

Setup: a Blank project with two text documents. "Long" holds one paragraph of 18,460 characters, which is 5,162 px tall in a 625 px scroller. "Short" is empty. The script read the cursor from the live editor (`.ProseMirror`'s `editor.state.selection`) and the scroll offset from the editor's scroller.

The owner's GetWrite was open on port 7340 throughout. The run used its own port and didn't touch it. The repo's `projects/` was empty before and after.

**Results (measured):**

| Step                                                                           | Cursor (anchor/head) | `scrollTop` | Same editor element |
| ------------------------------------------------------------------------------ | -------------------- | ----------- | ------------------- |
| Long, cursor placed by a click, then 5× ArrowRight, after a mouse-wheel scroll | 3842 / 3842          | 900         | n/a                 |
| Short, first open this session                                                 | 1 / 1                | 0           | n/a                 |
| Long, back after switching documents                                           | 3842 / 3842          | 900         | no (recreated)      |
| Long, back after the Data tab and Edit again                                   | 3842 / 3842          | 900         | no (recreated)      |
| Long, after a page reload                                                      | 1 / 1                | 0           | n/a                 |

- **OQ-1, which element scrolls:** a mouse-wheel scroll of 900 over the editor changed `scrollTop` on `div.tiptap.tiptap-editor-content` from 0 to 900. It is the only element of the edit area that both scrolls and is taller than its box. (A second scroller, `div.flex-1.min-h-0.overflow-y-auto`, 821 / 734 px, is outside the editor.)
- **Saves:** with no edit made, no non-GET request to `/api/resource` or `/api/revision` happened in the 4 s after returning to Long.
- **Undo:** one `undo` after the restore left the text length at 18,460. In this run the editor had just been recreated, so its undo history was empty. That makes this check weak. The test that carries FR-5 is the history test in `frontend/tests/unit/editor-document-load-history.test.ts` (`settleCreatedEditor` leaves nothing to undo).

**Not observed in the running app.** In both switches the editor was recreated (the marker on the old `.ProseMirror` element was gone). The other path, where the editor stays mounted and the new document comes through the content-sync effect (`useRevisionContent.ts:275`, when there's something to show meanwhile), didn't happen in this run. It is covered only by `frontend/tests/unit/useEditorPositionMemory.test.tsx` ("puts the position back after a load into the same, still-mounted editor"). This run doesn't show when that path occurs.

**Not run:** a mention jump in the running app, Markdown source mode, an older revision, and the desktop app.
