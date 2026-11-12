# Task 37: Storybook stories for the grid, phone groups, toolbar and arrangement controls

Results for this task only.

## Added

- `frontend/stories/WorkArea/OrganizerGrid.stories.tsx` (title `WorkArea/OrganizerGrid`, layout fullscreen). Presentational components only: `OrganizerGrid`, `OrganizerPhoneGroups`, `OrganizerGridToolbar`, `OrganizerArrangementControls`, with the pure `buildOrganizerGridModel` / `buildOrganizerPhoneGroups` producing the data. `OrganizerView` is not imported.

## Stories and the done-when clause each covers

| Export | Story id | Clause |
| --- | --- | --- |
| `TwoAxisGrid` | `workarea-organizergrid--two-axis-grid` | two-axis grid with Other values (status "Parked"), None (a card with no status and no act) and a duplicate (a card with both acts) |
| `EmptyGrid` | `workarea-organizergrid--empty-grid` | empty grid |
| `FailedSourceWithRetry` | `workarea-organizergrid--failed-source-with-retry` | failed source with retry |
| `DeletedSource` | `workarea-organizergrid--deleted-source` | deleted source |
| `NoMatchForFilters` | `workarea-organizergrid--no-match-for-filters` | no-match-for-filters |
| `NotShownMessage` | `workarea-organizergrid--not-shown-message` | `N not shown` with injected cap 4 over 6 cards (text reads "2 not shown") |
| `PhoneGroups` | `workarea-organizergrid--phone-groups` | phone groups |
| `Toolbar` | `workarea-organizergrid--toolbar` | toolbar |
| `ArrangementControls` | `workarea-organizergrid--arrangement-controls` | arrangement controls with one unavailable arrangement (smart folder missing) |

## Phone story id for Task 39

`workarea-organizergrid--phone-groups` (derived from title and export name by Storybook's id rule; documented in the file's header comment). Data: 6 cards, status rows Draft, Revising, Final, Other values, None; the duplicate card appears in two groups. Layout is fullscreen with a `p-2` wrapper so the page itself adds no horizontal width. The story id was derived by rule, not read from a running Storybook.

## Deviations to note

- The messages for failed source, deleted source, no match and `N not shown` are not rendered by any presentational component; they live inside `OrganizerView`, which this task may not use. The stories therefore render a story-local `StateNote` (and a Retry button) with wording written for the story. The wording is not asserted to match `OrganizerView`'s text or Task 23's. The `N` in `NotShownMessage` comes from the real model's `notShownCount`.
- Cap injection goes through `buildOrganizerGridModel({ cap: 4 })`; `ORGANIZER_GRID_CARD_CAP` is untouched.
- Components read for their props before use: `OrganizerGrid.tsx`, `OrganizerGridToolbar.tsx`, `OrganizerPhoneGroups.tsx`, `OrganizerArrangementControls.tsx`, `organizerGridModel.ts`, `organizer-grid-types.ts`, and the task-18/19/21/31 records. `OrganizerCard` is used only through `OrganizerGrid`'s default card.
- Colours: brand token classes only (`text-gw-secondary`, `border-gw-border`, `bg-gw-chrome`, `text-gw-primary`); no hex, no red.
- Play functions were added to several stories (grid role and headings, Retry click, `2 not shown`, no `grid` role and Open buttons in the phone story, toolbar labels). They were not run.

## Measured

- `npx tsc --noEmit` in `frontend/`: no output (clean) after fixing two kinds of error on the first run (an optional `plainText` and untyped `canvasElement` in play functions).
- `npx eslint stories/WorkArea/OrganizerGrid.stories.tsx`: exit 0, no output.
- `npx prettier --write` applied to the story file.

## Not run

- Storybook dev server and build, `pnpm test:e2e`, and `pnpm test-storybook` (`vitest run --config=vitest.storybook.config.ts`, a browser-based runner). Not attempted here per the task. No story was rendered, so nothing is verified about how it looks, its play functions passing, or the 360px layout.
- No a11y addon or axe run on the stories; the stories are not reported a11y-clean.
- The story ids above are by Storybook's naming rule, not observed in a built index.
