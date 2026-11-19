# Task 36: Merged mark in the tree and the notice line

Results of this task only. All runs are Vitest (jsdom). The reads are mocked at the transport (`fetchSplitResourceContent`, `listTrash`); the editor in the test environment is `TipTapEditor`'s own mock branch, not a live ProseMirror editor. No Storybook, no browser, no screen reader.

## What was built

- `frontend/components/Merge/useMergedMarkState.ts`: `useMergedMarkViews(entries)`, the read side. For each marked document it parses the mark (`parseMergedMark`), and for each distinct target and snapshot gathers the observations and resolves them through `resolveMergedMarkState` (Task 21). A target the tree holds is live; its snapshot is looked for among its revisions (`fetchSplitResourceContent`, the locked-aware read). Any other target is looked for in the Trash listing (`listTrash`, on its own or among a trashed folder's descendants); one found nowhere is permanently removed. The label text is `describeMergedMarkLabel` (Task 16), with the target's name taken from the store by id at render, so a rename shows.
- `frontend/components/Merge/MergedMarkLabel.tsx`: the row label, a visible text span plus a visually hidden one-line rule (`MERGED_TREE_LABEL_RULE`).
- `frontend/components/Merge/MergedNoticeLine.tsx`: presentational notice (`role="note"`, a tab stop, the state label and `MERGED_NOTICE_LINE`), and `MergedNoticeForResource`, which reads the document's mark from the store.
- `frontend/components/ResourceTree/ResourceTree.tsx`: gathers the marked rows, calls the hook once for the tree, renders the label in each marked row and names the hidden rule with the row's `aria-describedby`.
- `frontend/components/TipTapEditor.tsx`: renders `MergedNoticeForResource` at the top of the editor shell (real branch, both modes) and in the test-environment mock branch, only when `annotationResourceId` is given. Nothing was changed about `editable`.
- Tests `tests/component/MergedMark.test.tsx` (26) and `MergedMarkA11y.test.tsx` (15); stories `stories/Merge/MergedMark.stories.tsx` (six notice states, six label states).

## Order of work (inverted for the units, as the skill asks to be said)

The hook, label and notice components were written before their tests; the tests of the tree and editor wiring were written before the wiring. Run after the components existed and before `ResourceTree.tsx` and `TipTapEditor.tsx` were wired: `MergedMark.test.tsx` 24 failed, 1 passed (no label in any row, no note above the editor). A second run after wiring but with the fixture project having no on-disk directory: 19 failed, all stuck in the `checking` label. That showed that a project with no directory to read from left every mark at "checking" forever; the hook now states could-not-be-checked in that case, and a test covers it. Final: 41 of 41 pass across the two files.

## Done-when clauses

| Clause | How verified |
|---|---|
| Tree row shows "Merged into" and the target's name from the id, visible text, no colour alone, no red, exposed to assistive technology | MEASURED (jsdom): label text `Merged into “Target”`; the row's text content holds it; `aria-describedby` names the rule text; no `red` in the label's class or style; a rename of the target shows. Whether the label reads as intended in a screen reader was not run |
| Survives a reload | MEASURED as a fresh mount over the same stored data (the mark is read from the stored resource). A browser reload of a running app was not run |
| Open merged document shows a notice at the top with the rule, keyboard reachable, not hover alone, editor stays editable | MEASURED: the note is the first child of the editor shell; `tabIndex` 0, focus lands on it, userEvent Tab reaches it after a preceding button; no `title`; no button inside. "Editor stays editable" is by construction (the component takes and sets no `readonly`/`editable`) plus the test-environment mock; it was not measured on a live editor |
| A distinct stated state for revision no longer kept, target in Trash, target permanently removed, could not be checked, through the Task 21 resolver; a failed read never blank or live | MEASURED: one test per state in the tree and in the notice; could-not-be-checked is reached by a null revision list, a thrown (locked) read, a response with no revision list, a failed Trash listing, a malformed stored mark and a missing project directory; each is asserted not to match the live label |
| Rule text remains while the target is in Trash or removed; no control clears the mark | MEASURED: notice text holds `MERGED_NOTICE_LINE` in the in-Trash, removed, revision-gone and could-not-be-checked states; zero buttons inside the label or the note |
| axe passes | MEASURED: each of the six states for the notice and for the label, and the real tree with a resolved marked row (`color-contrast` off by the helper, `region` off by argument) |
| Stories per state typecheck and lint | `pnpm typecheck` and ESLint clean; the stories were not rendered (no Storybook run) |
| Existing `TipTapEditor` and `ResourceTree` tests unmodified and green | MEASURED: whole frontend suite, 1050 files passed, 14973 tests passed, 8 expected fail and 3 skipped (existing) |

## Checks run

- `pnpm typecheck` (frontend): clean. Electron `pnpm typecheck` (both passes) and CLI `pnpm typecheck`: clean.
- ESLint on `components/Merge`, `ResourceTree.tsx`, `TipTapEditor.tsx`, `stories/Merge` and both new tests: 0 errors; the three warnings printed (`debug` unused, two `useEffect` dependencies on `tree`) were there before.
- `pnpm test:ci`: 1050 files, 14973 passed, 8 expected fail, 3 skipped.
- Not run: Storybook, e2e, sharing smoke, any build.

## Decisions and items for wording review (Task 37)

- The pending text is new: `MERGED_MARK_CHECKING_LABEL`, "Merged into another document (checking)", exported from `useMergedMarkState.ts`. It names no target and does not read as the live label. All other texts are Task 16's.
- The notice reads: the state label (for example `Merged into “Chapter 3”`) as a line, then `MERGED_NOTICE_LINE`. The label and the rule's first sentence both say it was merged; the owner may want the label dropped from the notice when the target is named.
- The notice's accessible name, "This document was merged", is a literal in `MergedNoticeLine.tsx`.
- The notice is a tab stop on non-interactive text on purpose, to meet "reachable by keyboard" literally. ESLint's `jsx-a11y/no-noninteractive-tabindex` did not flag `role="note"`. The owner may prefer no tab stop (text is always visible and a screen reader reads it in browse mode).
- One read per distinct target and snapshot; every absorbed document of one merge shares them, so a merge of 25 documents makes one revision-list read (or one Trash listing). A result is kept for the life of the mounted tree: a snapshot pruned later shows only after a reload. This was not measured against a pruning run.
- "Live" means the target is in the client store. A target trashed in this session is removed from the store and shows through the Trash listing; a store that is stale relative to the disk is not detected. Revision-list reads for a target that is live in the store but 404 on the server (for example Trashed elsewhere) resolve to could-not-be-checked.

## Not verified

A screen-reader run (labels, description and note were not heard); a browser or the packaged app; contrast of `text-fg-tertiary` on the row (jsdom has no layout; the lead's Storybook run); Storybook rendering of the twelve stories; the tree label with a long target name at phone width (truncated by CSS, with the full text in `title`); a merge of 25 documents against a real project; Android (the merged mark can only arise where a merge was done, which the Android build does not offer; a project merged on desktop and opened on Android was not run).
