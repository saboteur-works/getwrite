# Task 19: Mark as claim control and story

Satisfies FR-14 (control only; gating and wiring are Task 25).

## Observed

- Before the component existed, `tests/component/MarkClaimControl.test.tsx` failed at import resolution (the module was absent). Red for the intended reason.
- After `MarkClaimControl.tsx` was added, a first run gave 10 of 11 passing. The failure was in the test: `runAxe` in `tests/a11y/helpers/axe.ts` returns `void` and throws on a violation, so reading `.violations` was wrong. The test was corrected to `await runAxe(container)`.
- `pnpm exec vitest run tests/component/MarkClaimControl.test.tsx` (from `frontend/`): 1 file, 11 tests passed.
- `pnpm typecheck`: passed after one fix (an implicit-any `Story` parameter in the story decorator, typed as `React.ComponentType`).
- `pnpm exec eslint` on the three touched files: no output (clean). `prettier --check`: clean.

## Design facts

- Props: `selectionText: string` and `onMarkClaim: OnMarkClaim`. `OnMarkClaim` from Task 2 is `(statement: string) => Promise<void>`; it takes the statement only. The task text says "with the selection and statement". The selection is therefore supplied by the host through `selectionText` (shown, and gating the button), and the host closes over the editor range when it builds the callback in Task 25. If Task 25 needs the control to pass the range, the Task 2 type must change.
- Statement is entered in a labelled textarea ("Claim statement"). It is checked as non-blank and at most 5000 UTF-16 code units before the callback is called; it is never truncated. The core re-validates (Task 11).
- Unavailable state uses `aria-disabled` (not `disabled`), so the button stays focusable and the visible reason is linked by `aria-describedby`. Activation while unavailable is a no-op.
- Status region (`role="status"`) text: "Saving the claim.", "Marked as a claim.", "The claim could not be saved. <reason>", plus the validation messages. A failure keeps the draft; success clears it.
- No Source props or store reads, so it renders the same with Sources off. No red class (a test checks the rendered HTML for "red"); no state is conveyed by colour alone.
- The story file has Idle, EmptySelection, Working, Failed and Succeeded, each with a play function.

## Not verified

- Stories were not run (no Storybook in worktrees); only typechecked and linted. The Storybook strict-axe run (including colour contrast, which the jsdom axe helper disables) is not run.
- Touch operation was not tested on a device; the control is a native `button`, and the test checks focus and click only.
- Not wired into `CitationControlSlot` or the editor (Task 25); the read-only editor, non-text resource and module-off gating are not exercised here.
- `frontend/src/lib/models/` was not touched, so electron and cli typecheck were not run.
