# Task 17: Card cap constant module

Results for this task only. No card-cap measurement was made here; the figure is Task 42's.

## What was added

- `frontend/components/WorkArea/Views/OrganizerView/organizerGridCap.ts`: `ORGANIZER_GRID_CARD_CAP` (`number | null`, set to `null`), `applyCardCap(cardCount, cap = ORGANIZER_GRID_CARD_CAP)` returning `{ shown, notShown }`, and `CardCapResult`. A comment beside the constant names `experiments/task-42.md` as the only source of the figure and states no number.
- `frontend/tests/organizerGridCap.test.ts`: 9 tests.

## Observed

- `cd frontend && npx vitest run tests/organizerGridCap.test.ts`: first run, before the module existed, 1 file failed with no tests collected (module missing). After the module was written: 1 file passed, 9 tests passed.
- `cd frontend && npx tsc --noEmit`: no output.
- `cd frontend && npx eslint` on the two new frontend files: no output.
- Behaviours covered: `null` cap shows every card with `notShown` 0; count under or equal to the cap shows all; count over the cap reports the difference as `notShown`; zero cards; default argument equals the module constant; a cap that is zero, negative, fractional or NaN throws `RangeError`; a card count that is negative or NaN throws `RangeError`.
- The tests take their counts from array lengths so no cap figure is written in them.

## No-figure grep

Command, from `frontend/`: `grep -nE '[1-9]' components/WorkArea/Views/OrganizerView/organizerGridCap.ts tests/organizerGridCap.test.ts`

Result: one line, `organizerGridCap.ts:12`, the file name `task-42.md` inside the comment that cites the record. No other digit 1 to 9 appears in either file. Only the literal `0` appears, as the zero count and the zero `notShown`.

## Not done here

- The figure itself (Task 42) and its citation check (Task 44).
- The "N not shown" message and use of `applyCardCap` in the grid (later tasks).
