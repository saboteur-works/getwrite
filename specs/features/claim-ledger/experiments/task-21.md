# Task 21 results: ClaimRow (presentational claim row and stories)

Environment: worktree `agent-a7a732592b6e18dcb`, 2026-11-11, vitest 4.1.6.

## Order

`frontend/tests/component/ClaimRow.test.tsx` written first. First run: the file failed at import (`ClaimRow` absent), 0 tests ran. After `frontend/components/Editor/Annotations/ClaimRow.tsx` was added: one test failed (my test passed no `onReattach`, so no Re-attach button was rendered; test corrected, not the component). Then 18 of 18 pass.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/component/ClaimRow.test.tsx` (frontend) | run, 18 passed |
| `pnpm exec vitest run tests/component/ClaimRow.test.tsx tests/component/annotationsPanel.test.tsx` | run, 46 passed (existing panel test unchanged and passing) |
| `pnpm typecheck` (frontend) | run, no errors (after two test-typing fixes) |
| `pnpm exec eslint` on the three new files | run, no output |
| `pnpm exec prettier --check` on the three new files | run, clean after `--write` |
| electron / cli typecheck | not run: no file under `frontend/src/lib/models/`, `core.ts`, `cli/` or `electron/` touched |

Not run: the full vitest suite, Storybook (stories only typechecked and linted), `next build`, `build:native`, e2e.

## What was built

- `ClaimRow` (props in, callbacks out; no store, no request). Props: `annotation`, `moduleEnabled`, `sourcesEnabled`, `isDetached`, optional `sourceFacts`, `hasSelection`, `isAtCaret`, `isBusy`, `deleteDisabledReason`, and callbacks `onStatusChange`, `onSaveStatement`, `onRelink`, `onReattach`, `onShow`, `onDelete`. It uses `deriveClaimDisplay` from `claim-display.ts` for every display decision.
- Observed through the tests: marker text "Claim"; statement and quote as text (a `<b>` and `<img>` string produce no element); status select with the four labels, controlled by the stored value (a change calls back and the select keeps the stored value); off-list status shown as an extra option "<value> (not a listed status)" plus a text line, with no callback; local date line "Status changed YYYY-MM-DD"; "Source: unsourced" in text (also for a Verified claim); "Source: <name>", "(removed)", "(permanently deleted)", "The Source could not be checked." with status unchanged; Re-attach (disabled with no selection, absent when attached or when no callback); Link Source / Change Source only with `sourcesEnabled`, with the removed-Source line still shown when it is false; statement edit form with a failure message that keeps the form and success that closes it, Save disabled for an empty statement even with a Source; Delete disabled with a visible reason.
- Module off: an ordinary note (body, "Edit note", "Save note"), no marker, status, date or Source line.
- axe (`runAxe`, jsdom, colour-contrast rule disabled by the helper) passed in the claim, detached, editing and module-off states. Contrast is not checked here.
- Stories (`frontend/stories/Editor/ClaimRow.stories.tsx`, title `Editor/ClaimRow`, `a11y: { test: "error" }`): Unsourced, SourcedVerified, VerifiedButUnsourced, Disputed, NeedsReview, OffListStatus, SourceRemoved, SourcePermanentlyDeleted, SourceCouldNotBeChecked, SourcesOffRemovedSource, Detached, DeleteLimited, ModuleOffOrdinaryNote. Written after reading `AnnotationsPanel.tsx` and `AnnotationsPanel.stories.tsx`.

## Decisions and assumptions

- The root is a `div`, not an `li`, so Task 24 can wrap it in the panel's `li`.
- `onSaveStatement` serves both the claim statement and the module-off note body (it returns `{ ok } | { ok: false, message }`); Task 24 maps it to the update-claim client or the existing note update.
- The unlink ("remove Source link") control is not rendered; only Link Source / Change Source, since the task names "a link or relink control". FR-11 allows removing a link, so the panel's picker (Task 24) can offer "no Source".
- The wording "(permanently deleted)" and the part-removed text are mine; the task fixes only the quoted phrases.
- No Source facts are fetched here; a missing `sourceFacts` on a claim with a target reads as "could not be checked", as `claim-display.ts` defines.

## Not verified

No Storybook run (axe in the story runner and colour contrast not checked), no real browser, no panel wiring (Task 24), no device. Focus return after closing the edit form is not implemented or tested here (the panel's Edit flow in `AnnotationsPanel.tsx` returns focus to the Edit button via `data-edit-for`; `ClaimRow` does not).
