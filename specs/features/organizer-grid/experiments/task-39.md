# Task 39: Browser test of the phone layout at 360px and 767px

Results for this task only.

## Added

- `frontend/e2e/organizer-grid-phone.e2e.spec.ts`, five tests:
  - phone groups at 360px and at 767px (story `workarea-organizergrid--phone-groups`): the five group headings (Draft (2), Revising (1), Final (1), Other values (1), None (1)) are visible; zero `role="grid"`; each of the six story cards has a visible title button and a visible `Open <title>` button inside the viewport width; `documentElement.scrollWidth <= clientWidth`.
  - matrix at 768px (story `workarea-organizergrid--two-axis-grid`): `role="grid"` visible, rowheaders "Other values" and "None" visible.
  - first paint at 360px (phone story) and at 768px (matrix story): records, as a test annotation `first-paint` and a screenshot attachment, whether the other layout is in the DOM at `domcontentloaded`, then asserts the settled layout.

## Measured

- `npx tsc --noEmit` in `frontend/`: no output (clean).
- `npx eslint e2e/organizer-grid-phone.e2e.spec.ts`: exit 0 (after renaming one variable to satisfy the boolean-prefix naming rule).
- `npx prettier --write` on the spec: applied.
- `npx playwright test --list e2e/organizer-grid-phone.e2e.spec.ts`: `Total: 5 tests in 1 file`, all discovered under project chromium.

## Not run

- The spec was written, not run. No built Storybook was started and no `pnpm test:e2e` was attempted (it builds Storybook and serves port 6006; per the task the lead runs it outside the sandbox in Task 41 and 44). Nothing here shows the assertions pass.
- Story id `workarea-organizergrid--two-axis-grid` and `--phone-groups` are derived by Storybook's naming rule (Task 37 record), not read from a built index. Heading texts, button names and counts were read from the story source and `OrganizerPhoneGroups.tsx`, not observed in a render.

## First paint: not observed

- Not observed, because not run. The test records the observation when run (annotation `first-paint`, wording "observed" or "not observed").
- Limit of the test, read from source: the two stories render `OrganizerPhoneGroups` and `OrganizerGrid` directly and do not use `useViewportTier`, so the "other layout at first paint" caveat of that hook (it starts at `"desktop"` and corrects in an effect; OQ-1) is not exercised by these stories. A flash through `OrganizerView` is not covered by this spec.
- Story content is client-rendered, so at `domcontentloaded` neither layout may be present; an "not observed" result from this test would not by itself show the real view has no flash.

## Deviations

- The "768px matrix" check loads the two-axis grid story, because the phone story always renders groups regardless of width.
