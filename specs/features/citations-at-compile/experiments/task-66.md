# Task 66: citation fields editor saves as you type

Results as observed. Commands run from `frontend/`.

## Decisions

- Debounce: 800 ms (`CITATION_FIELDS_SAVE_DEBOUNCE_MS`, exported). Chosen, not measured.
- Not-saved wording: "Your changes to the citation fields were not saved because a field is not valid." (invalid on leaving) and "... because the save failed." (flush on leaving failed). While a change waits for a correction the status region reads "Not saved yet: fix the field marked above."
- Leaving = the editor unmounts (it is keyed by Source, so a Source switch is an unmount). The unmount cleanup calls the write synchronously, so the write for the first Source is made before the second Source is read (asserted by call order in a test).
- The editor cannot show text once unmounted, so it reports through a new optional prop `onUnsavedOnLeave(message)`; `CitationFieldsSection` (stays mounted across a Source switch) shows it as `role="alert"` prefixed with the left Source's name, with a Dismiss button. Limit: when the whole section unmounts (module switched off, sidebar closed, resource deselected) there is no mounted place to show it, so the message is not visible there. Not tested beyond the editor-level callback.
- An invalid stored value left unedited blocks any save but gives no not-saved message on leaving, since there was no change to lose.
- A write in flight when the debounce fires defers the next write by one debounce interval. A flush on unmount while a write is in flight is issued anyway (not chained); not exercised by a test.
- A flush made on leaving that fails is reported through the same callback; a successful flush shows nothing.

## Failing first (against the Save-button editor)

`pnpm exec vitest run tests/component/CitationFieldsEditor.test.tsx tests/component/CitationsA11y.test.tsx tests/component/citations-sources-off.test.tsx tests/metadataSidebarSource.test.tsx`: 21 failed, 64 passed (85).

## Green

- Same command after the code: 4 files, 85 passed (after two test-harness fixes: fake timers must be installed before the change, and user-event cannot run under fake timers here, so the keyboard test checks the write via the flush on leaving).
- `pnpm typecheck`: clean (stories and tests are covered by the tsconfig include `**/*.ts(x)`).
- `pnpm lint`: 0 errors, 459 warnings (same count as before this task).
- `pnpm test:ci`: 993 files passed, 13789 tests passed, 8 expected fail, 3 skipped. No flaky reruns. A first full run had 2 failures in `tests/component/CitationFieldsSection.test.tsx` (a file outside this task's list): its write mock returns undefined and a typed change is now written on unmount. The flush wrapper was changed to catch any failure of the call (thrown or returned), after which the file passed unchanged.
- Stories: updated (Saved, SaveFails) and added (InvalidField, NotSavedOnLeaving). Typechecked only. Storybook was not built or run in this worktree, so "the stories build" and the play functions are not confirmed.
