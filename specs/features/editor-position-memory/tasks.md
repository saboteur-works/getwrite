# Editor position memory: task list

Source spec: `specs/features/editor-position-memory.md` (OQ-1 to OQ-3 resolved). Estimates are story points (1/2/3/5/8). All test commands run from `frontend/`.

FR coverage: FR-1 (Tasks 1, 3), FR-2 (Task 1), FR-3 (Task 2), FR-4 (Task 3), FR-5 (Tasks 2, 4), FR-6 (Task 4), FR-7 (Task 3), FR-8 (Task 3), FR-9 (Task 3), FR-10 (Task 1), FR-11 (Task 5).

### Task 1: Position resolver and in-memory position store

**What:** Add a pure function that chooses the selection to restore (clamp to document size, or position 0 when there is no record) and a module-scoped in-memory store of `{ anchor, head, scrollTop }` keyed by project ID and document ID.
**Files:** create `frontend/components/Editor/editorPositionMemory.ts` and `frontend/tests/unit/editorPositionMemory.test.ts` (no existing test file covers this new module; `tests/unit/loadDocumentIntoEditor.test.ts` is for Task 2)
**Done when:** unit tests pass and show: no record returns `{ anchor: 0, head: 0 }`; a record inside the document is returned unchanged; anchor and head beyond the document size are each clamped to the size; a collapsed and a ranged selection both round-trip; get/set/clear work per key and two keys do not collide; the module imports no `localStorage`, `sessionStorage` or IndexedDB (FR-2), and a fresh module import starts with no records.
**Depends on:** none
**Estimate:** 2
**Notes:** Follows the shape of `components/Editor/activeEditorRegistry.ts`. Key is built from project ID and document ID (for example `${projectId}:${documentId}`), exposed as a helper so `EditView` and the editor agree. Test: `pnpm exec vitest run tests/unit/editorPositionMemory.test.ts`; also `pnpm typecheck`.
**Done:** [x]

### Task 2: Restore the selection in settleCreatedEditor without history, update or save

**What:** Change `settleCreatedEditor` in `loadDocumentIntoEditor.ts` to take an optional recorded position, use the Task 1 resolver, and set the selection outside undo history with no update emitted.
**Files:** `frontend/components/Editor/loadDocumentIntoEditor.ts`, `frontend/tests/unit/loadDocumentIntoEditor.test.ts` (extend)
**Done when:** tests pass and show: called with no position it still runs `setTextSelection(0)` with `addToHistory: false` (today's behavior); called with a position it sets the clamped `anchor`/`head` with `addToHistory: false`; a position beyond the document is clamped; the call does not change the document and does not invoke an update handler (asserted on the chain or transaction meta, since jsdom tests never mount a real TipTap editor). The pure choice of position is covered by Task 1's tests (FR-10).
**Depends on:** 1
**Estimate:** 2
**Notes:** Check how the existing tests in `loadDocumentIntoEditor.test.ts` fake the editor and keep that approach. The undo check across a real editor is Task 4 (stated limit) and Task 5 (running app).
Test: `pnpm exec vitest run tests/unit/loadDocumentIntoEditor.test.ts`; also `pnpm typecheck`.
**Done:** [x]

### Task 3: Record and restore in TipTapEditor, with positionKey from EditView

**What:** Add the optional `positionKey` prop to `TipTapEditor`; record selection (throttled) and `.tiptap-editor-content` `scrollTop` while in rich mode, and again on unmount; in `onCreate` pass the record to `settleCreatedEditor`, then set `scrollTop` directly. `EditView` passes the key only while the canonical revision is shown.
**Files:** `frontend/components/TipTapEditor.tsx` (onCreate ~532, `onSelectionUpdate` ~521, `EditorContent` wrapper ~819), `frontend/components/WorkArea/EditView.tsx` (~427 where `TipTapEditor` is rendered; `isEditingCanonicalRevision` already exists), tests in `frontend/tests/editView.test.tsx` and `frontend/tests/tiptapEditorSpellcheck.test.tsx` (extend; use whichever already mocks the editor)
**Done when:** tests pass and show: `TipTapEditor` without `positionKey` records nothing and restores nothing (FR-9); with a key and canonical revision a selection change writes to the store and unmount writes to the store (FR-1); a non-canonical revision shown in `EditView` passes no key, so nothing is recorded or restored (FR-7); while `mode` is not rich, nothing is recorded, and the source box's cursor and scroll are never read (FR-8); `onCreate` calls `settleCreatedEditor` with the stored position and sets `scrollTop` on the element with class `tiptap-editor-content` (FR-4), and does not call `scrollIntoView`; no key means `scrollTop` is untouched. `pnpm typecheck` and `pnpm lint` pass. A quick check in the running web build: with a document longer than one screen, scroll partway, switch to another document and back, and the scroll position comes back. If it doesn't, the timing is fixed in this task, not deferred to Task 5. Record what was observed in `specs/features/editor-position-memory/experiments.md`.
**Depends on:** 1, 2
**Estimate:** 5
**Notes:** Only the rich editor is recorded (OQ-3 option a). Read `scrollTop` from the wrapper element, not `editview-scroll-region`. Whether a revision switch without a remount moves the cursor is not established and is left as is; do not add restore on revision switch. A scroll offset is recorded on selection change and on unmount, so a scroll with no selection change is picked up at unmount. Check that the unmount record runs before the DOM element is detached. Restoring must not call `onChange`. Test: `pnpm exec vitest run tests/editView.test.tsx tests/tiptapEditorSpellcheck.test.tsx`, then `pnpm typecheck`, `pnpm lint`.
**Done:** [x]

### Task 4: Mention-jump order and undo/no-autosave tests

**What:** Add tests that a mention jump after a restore ends at the mention, and that restoring adds no undo step and causes no autosave.
**Files:** `frontend/tests/component/EntityMentionsSection.test.tsx` (extend; the mention-jump tests for `components/Sidebar/EntityMentionsSection.tsx`), `frontend/tests/integration/editViewAutosave.test.tsx` (extend), `frontend/tests/unit/loadDocumentIntoEditor.test.ts` (extend if the undo check fits there)
**Done when:** tests pass and show: restore first, then the mention jump, leaves the selection at the mention position and not at the restored one (FR-6); opening a document with a record does not call `onChange` and starts no canonical autosave (FR-5); a transaction-level test shows the restoring transaction is excluded from history (`addToHistory: false`), so one undo does not change content (FR-5). `pnpm typecheck` and `pnpm lint` pass.
**Depends on:** 3
**Estimate:** 2
**Notes:** jsdom tests never mount a real editor (frontend/CLAUDE.md, `docs/standards/testing.md`), so FR-5's "press undo once" is covered at the transaction/meta level here and by the running app in Task 5. If the test can use a headless ProseMirror state (no DOM view) to apply the restore transaction and call undo, prefer that; say in the test which one was done. No change to where the mention jump puts the cursor (non-goal). Test: `pnpm exec vitest run <the files above>`, then `pnpm test:ci`.
**Outcome (owner accepted, 2026-11-03):** covered by tests written in Tasks 2 and 3, so no further files were changed. FR-6: `tests/unit/useEditorPositionMemory.test.tsx`, "lets a selection change during a pending scroll restore win, as a mention jump does". FR-5: `tests/unit/editor-document-load-history.test.ts`, "changes nothing in the document, emits no update and leaves nothing to undo" (a real headless editor, not only transaction metadata), and no save request in `experiments.md` E-1. `EntityMentionsSection.test.tsx` and `editViewAutosave.test.tsx` mock `TipTapEditor`, so they can't observe a restore.
**Done:** [x]

### Task 5: Real-app check and a short feature doc

**What:** Check the behavior in the running web build and record what was observed, then add a short doc under `docs/features/editor/`.
**Files:** create `docs/features/editor/position-memory.md`; append the observed results to `specs/features/editor-position-memory/experiments.md` (create). Do not edit `docs/user/handbook/` or the feature spec.
**Done when:** with a document longer than one screen in the web build (`pnpm dev` from `frontend/`, outside the sandbox if it needs to run), the recorded result states, as observed: `scrollTop` changes on `.tiptap-editor-content` when scrolling (OQ-1); cursor and scroll are restored after switching to another document and back, and after switching to another tab and back (FR-11); one undo after restoring does not change the content and no save is made (FR-5); a first-time document opens at the start; a page reload starts with no records (FR-2). Anything not run is labelled not run. The doc describes the in-memory, session-only behavior and names `editorPositionMemory.ts`. `pnpm typecheck`, `pnpm lint`, `pnpm test:ci` and `pnpm test:e2e` all pass.
**Depends on:** 3, 4
**Estimate:** 3
**Notes:** Report measurements as facts and do not name a cause for a failure until an experiment separates the alternatives. `pnpm test:e2e` needs `pnpm storybook` stopped. If `TipTapEditor` gained a prop that a story must supply, check the stories (a Storybook decorator is only needed for a new context requirement; a new optional prop needs none). Release and merge status belongs in `specs/product/getwrite.features.md`, not here.
**Done:** [x]

## Summary

- Total tasks: 5
- Total estimated effort: 14 points
- Critical path: 1 → 2 → 3 → 4 → 5
- Risks: Task 3 carries the uncertainty. The scroll element (`.tiptap-editor-content`) is read from the code and not yet confirmed in the running app; the editor may not be laid out when `onCreate` runs, so setting `scrollTop` may need to wait a frame (to be found in Task 5, not assumed). Whether a revision switch without a remount interacts with the record is not established. The undo check (FR-5) cannot use a real editor in jsdom, so Task 5's running-app check is the only full proof.

## Open Questions

None.
