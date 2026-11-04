# Editor position memory: return to where you were in a document

Source: owner request, 2026-11-03 ("when a user changes text resources, the cursor is reset to the first character of the text"). Owner decisions taken before this spec: the position lasts for one session only, and both the cursor and the scroll position are kept. POS task: `task_28f1c81c`. Rungs 2 and 3 of the ladder were skipped: this is a small change to existing editor behavior, with no product-level scope to check.

Status of the evidence. Nothing in this spec was run by its author. Every code statement is a reading on 2026-11-03 at the file and line given, and is labelled READ.

- READ: choosing another document starts a new read in `useRevisionContent.ts`. While it runs, `loadState` is `"loading"`, and `EditView.tsx:381` renders "Loading this document…" in place of `TipTapEditor`. So the editor is removed and created again for each document. **Corrected during implementation (2026-11-03):** that happens only when there's nothing to show meanwhile (`useRevisionContent.ts:275`). Otherwise the editor stays mounted and the new document arrives through the content-sync effect (`TipTapEditor.tsx`, `loadDocumentIntoEditor`). In the running-app check (`experiments.md` E-1) the editor was recreated on both switches; the stays-mounted path wasn't observed there.
- READ: a new editor's `onCreate` (`TipTapEditor.tsx:532`) calls `settleCreatedEditor` (`Editor/loadDocumentIntoEditor.ts:115`), which runs `setTextSelection(0)` outside undo history. Nothing records or restores a cursor or scroll position.
- READ (OQ-1): in rich mode, the element that scrolls is the `EditorContent` wrapper, class `tiptap tiptap-editor-content` (`TipTapEditor.tsx:819-823`). The rule is `.tiptap-editor-content { overflow-y: auto }` (`styles/getwrite-utilities.css:2374-2379`) inside the column `.tiptap-editor-shell` (`:2367-2372`). `editview-scroll-region` (`EditView.tsx:368`) has no CSS rule and doesn't scroll. In Markdown source mode the scroller is the `<textarea>` (`Editor/MarkdownSourceView.tsx:66`). Not yet confirmed in the running app; FR-11 covers it.
- READ (OQ-2): `setTextSelection` doesn't scroll (`@tiptap/core` `commands/setTextSelection.ts`). prosemirror-view scrolls to the selection only after `tr.scrollIntoView()`. Nothing in `onCreate` or the content-sync effect scrolls or moves focus.
- Amended during implementation (owner accepted, 2026-11-03): FR-1, FR-3, FR-7 and FR-10 below were changed to match the code. A restore also runs after a content-sync load, and records go to the document that is in the editor. The key is passed unless an older revision is shown. Recording is continuous. Returning to the current revision restores the position. See `docs/features/editor/position-memory.md`.
- Not established: whether a revision switch (`loadDocumentIntoEditor`, without a remount) moves the cursor. This spec leaves revision switches as they are.

## Overview

When a writer switches to another document and then comes back, the editor puts the cursor at the first character and the view at the top. On a long chapter, the writer has to find their place again every time. This feature remembers, for each document, where the cursor was and how far the editor was scrolled, and restores both when the document is shown again in the same session. The positions are held in memory only. Reloading the page or restarting the app forgets them, and nothing is written to the project or to browser storage.

## Goals

- Coming back to a document in the same session puts the cursor where it was, with the same text selected if there was a selection.
- Coming back to a document in the same session shows the same part of the text as when the writer left it.
- A document opened for the first time in a session behaves as it does today: cursor at the start, view at the top.
- Restoring a position never changes the document, never adds an undo step, and never causes a save.

## Non-goals

- Keeping positions across a page reload, an app restart, or another device. They are held for one session only (owner decision).
- Storing positions in the project (sidecar, `project.json`, `meta/`) or in `localStorage`.
- Changing what happens on a revision switch inside the same document, or when viewing a non-canonical revision.
- Changing where a mention jump puts the cursor.
- Moving keyboard focus into the editor when a document opens. Focus behaves as it does today.

## User stories

- US-1: As a novelist working across several chapters, I want to switch to another chapter and back so that I land on the sentence I was writing, not on the first line.
- US-2: As a writer revising a long document, I want to come back to the same scrolled place so that I don't have to scroll to find my place.
- US-3: As a writer, I want to return to a document without changing anything in it so that opening a document never creates an edit, an undo step or a save.

## Functional requirements

1. FR-1: While a text document's canonical revision is shown in the editor, the app MUST record that document's selection (ProseMirror `anchor` and `head`) and the editor's scroll offset, keyed by project ID and document ID. It MUST record them when the writer changes the selection (it MAY throttle this) and when the writer scrolls, so the record is current when the editor is removed. Records MUST go to the document that is in the editor: the key is taken when a document is loaded, not from a newer prop that arrives before the next document does. Loads and restores (`addToHistory: false` transactions) MUST NOT be recorded. [US-1] [US-2]
2. FR-2: The record MUST be held in memory only, in a module-scoped store like `components/Editor/activeEditorRegistry.ts`. It MUST NOT be written to the project, to `localStorage`, to `sessionStorage` or to IndexedDB. A page reload or app restart MUST start with no records. [US-1]
3. FR-3: When a document enters the editor, either in `onCreate` or after a content-sync load into the mounted editor, and it has a record, the editor MUST put the selection at the recorded `anchor` and `head` in place of `setTextSelection(0)`, with the transaction kept out of undo history and emitting no update. Each position MUST be clamped to the document's current size, because the text may have changed since it was recorded. With no record, the selection MUST go to position 0, as today. [US-1] [US-3]
4. FR-4: After the selection is restored, the editor MUST set the recorded scroll offset directly as `scrollTop` on the rich editor's scrolling element, `.tiptap-editor-content` (OQ-1). It MUST NOT depend on `scrollIntoView` (OQ-2). If the document is now shorter, the browser's own clamp of `scrollTop` is enough. With no record, the view MUST start at the top, as today. [US-2]
5. FR-5: Restoring MUST NOT change the document, MUST NOT add an undo step, MUST NOT call `onChange`, and MUST NOT trigger the canonical autosave. A test MUST show that opening a document with a record and then pressing undo once does not change its content. [US-3]
6. FR-6: A mention jump that opens a document MUST end with the cursor at the mention, not at the restored position. A test MUST cover the order: restore first, then the jump. [US-1]
7. FR-7: The app MUST NOT record a position while a non-canonical revision is shown, and MUST NOT restore one into a non-canonical revision. `EditView` passes no key while one is shown, and passes the key otherwise, including before the document's revisions have loaded. Returning to the current revision restores its record. [US-1]
8. FR-8: Only the rich editor MUST be recorded and restored. The app MUST NOT record the Markdown source box's cursor or scroll offset. A document left in source mode comes back in the rich editor, as today, at its last recorded rich-editor position, clamped by FR-3 (OQ-3). [US-1]
9. FR-9: `TipTapEditor` MUST learn which document it shows through a new optional prop (for example `positionKey`), passed by `EditView`. Without the prop, the editor MUST behave as today. [US-1]
10. FR-10: Choosing where to put the selection (clamp, record or no record) MUST be a pure function with unit tests. Where a test needs an editor, it uses a real headless one, as `tests/unit/editor-document-load-history.test.ts` already does (`TipTapEditor` itself renders a mock under Vitest). [US-1] [US-3]
11. FR-11: The behavior MUST be checked in the running app, web build, with a document longer than one screen: place the cursor and scroll partway, switch to another document and back, then switch to another tab and back. Both times the cursor and the scroll position MUST be restored. The check MUST also confirm that `scrollTop` changes on `.tiptap-editor-content` when the writer scrolls (OQ-1). [US-1] [US-2]

## Open questions

- OQ-1: Which element scrolls the editor? FR-4 needs it. **Resolved from the code, 2026-11-03, accepted by the owner:** in rich mode, the `EditorContent` wrapper `.tiptap-editor-content` (`TipTapEditor.tsx:819-823`, `getwrite-utilities.css:2374-2379`), not `editview-scroll-region`, which has no CSS rule. FR-11 confirms it in the running app.
- OQ-2: Does the restored cursor need to be scrolled into view? **Resolved from the code, 2026-11-03, accepted by the owner:** no. `setTextSelection` doesn't scroll, and nothing in the creation path scrolls or moves focus. FR-4 sets `scrollTop` directly. The mention jump (`EntityMentionsSection.tsx:477-500`) has a note saying ProseMirror's own scroll doesn't follow in this layout. That note wasn't checked, but it agrees.
- OQ-3: What is remembered for a document left in Markdown source mode, which has its own scroller and cursor (`MarkdownSourceView.tsx:66`)? Options: (a) only the rich editor is recorded and restored; (b) also record and restore source mode; (c) clear the record on leaving source mode. **Resolved (owner decision, 2026-11-03):** (a). See FR-8.

## Out of scope (deferred)

- Keeping positions across restarts or devices (`localStorage` or project files). This would need its own decision about devices that share a project.
- Restoring a position after switching to an older revision. (Returning to the current revision restores, per FR-7.)
- Remembering the Markdown source box's cursor and scroll position (OQ-3, option b).
