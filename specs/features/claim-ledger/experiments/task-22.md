# Task 22 results: ClaimsView presentation, filters and stories

Environment: worktree `agent-a2838d1591a7f100e`, 2026-11-11, vitest 4.1.6.

## Order

`frontend/tests/component/ClaimsView.test.tsx` written first. First run: failed at import (`components/Claims/ClaimsView` absent), 0 tests ran. After `ClaimsView.tsx` and `ClaimsFilters.tsx` were added: first run 15 of 17 passed; the two failures were test queries (`getByText(/Unverified/)` and `queryByText(/unsourced/i)`) that also matched the filter `<option>` elements. The tests were scoped to the claims list, not the component changed. Then 17 of 17.

## Commands

| Command (frontend) | Result |
| --- | --- |
| `pnpm exec vitest run tests/component/ClaimsView.test.tsx` | run, 17 passed |
| `pnpm typecheck` | run; first run 3 implicit-any errors in the test (`.map` callbacks), annotated; second run no errors |
| `pnpm exec eslint components/Claims stories/Claims tests/component/ClaimsView.test.tsx` | run, no output |
| `pnpm exec prettier --check` on the same paths | run; flagged two files, `--write` applied |

Not run: Storybook (stories are only typechecked and linted), the electron and cli typechecks (nothing under `frontend/src/lib/models/` was touched), the full vitest suite, `next build`, `build:native`, e2e.

## What the view does (observed through the tests)

- States: loading (`role="status"`), failed with "Try again" (a locked failure says the project is locked), ready-empty ("There are no claims."), ready with a list.
- Unread resources: a `role="alert"` block above the list names each as "<name>: not read" with a "Try again" button; claims that were read are still listed. With failures and no claims it says "No claims were read.", never "There are no claims."
- Each claim row: statement, "Passage: <quote>", resource name, "Status: <label>, <date>" (marked "(not a listed status)" for an off-list value), "Unsourced" or "Source: <name>" with "(in Trash)", "(permanently deleted)" or "(could not be checked)", an attachment-or-excerpt-removed note, and a detached sentence.
- Filters: Status (All plus the four) and Source (All, Sourced, Unsourced) as native selects, combined through `applyClaimFilters`; "Showing: <active filters>" in text; an empty filtered result uses `describeEmptyClaimResult`.
- Open: one "Open claim: <statement>" button per claim calling `onOpenClaim(item)`, also for a detached claim. No write control (no textbox, no delete, re-attach, link or edit button).
- axe (`runAxe`, `region` rule disabled for isolated mounting, `color-contrast` disabled by the helper) passes for list-with-failures, failed and empty states. Keyboard: Tab order is Status, Source, Open; Enter opens.

## Decisions and assumptions

- Props: `state` (`loading` | `failed` | `ready` with `ClaimViewItem[]` and `ClaimReadFailure[]`), `onRetry`, `onOpenClaim`. `ClaimViewItem` carries `resourceId`, `resourceName`, `annotationId`, a `ClaimDisplayModel` and `isDetached`; Task 23 builds these (source facts and detached derivation are its job).
- Filter state is held inside the view (`useState`), not in the hook; Task 23's note "filter state uses `claim-display.ts`" is met by the view calling its functions.
- Wording of the Source line and detached sentence is chosen here (the Task 20 record left it to Tasks 21 and 22). Task 21's panel row may use different wording; not reconciled.
- The Select primitive (`components/common/UI/Select/Select.tsx`, a thin `<select>`) and `Button` (variant `secondary`, size `xs`) were read before use.
- Stories (`stories/Claims/ClaimsView.stories.tsx`): Loading, Failed, Locked, Empty, List, FilteredToNothing, NotRead, StatusNotOnList, each with `a11y: { test: "error" }`.

## Not verified

- Stories were not run in Storybook; their play functions and the strict-axe colour-contrast result are unchecked.
- Colour contrast in a real browser (jsdom cannot compute it).
- No registry wiring, no hook, no transport: nothing here ran against stored data, a build or a device.
