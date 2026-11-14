# Task 23: Accessibility and keyboard tests

Test: `frontend/tests/component/NarrativesViewA11y.test.tsx` (jsdom, `runAxe`, `userEvent`). No production code changed.

## Screen reader

Not verified. No screen-reader run (VoiceOver, TalkBack, NVDA) was made. The tests check roles, names and text only.

## Not covered by these tests

- axe `color-contrast` is off in jsdom (`runAxe`); contrast is for the lead's Chromium run.
- Scrolling a column with the keyboard (arrow keys on a focused body) is browser behaviour and is not exercised in jsdom; only that each body is focusable with a name is pinned.
