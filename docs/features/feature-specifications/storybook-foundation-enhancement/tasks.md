# Tasks: Storybook Foundation Enhancement

### Task 1: Rework Colors story

**What:** Replace the existing Colors story with a redesigned version that fixes the duplicate section label, shows dark and light hex values side by side in 40×40px+ swatches, and covers all token categories from `getwrite-theme.css`.
**Files:** `frontend/stories/Foundations/Colors.stories.tsx`
**Done when:** The story renders six labelled sections (Chrome Surfaces, Editor Surfaces, Text, Borders, Functional, Toast & Diff); every swatch is at least 40×40px; each row shows the CSS variable name, a dark-mode hex, and a light-mode hex hardcoded from `getwrite-utilities.css`; no section label is duplicated; diff and toast tokens are present.
**Depends on:** none
**Estimate:** 3
**Notes:** Light-mode hex values for overridden tokens live in the `.appshell-shell` block in `getwrite-utilities.css` — cross-reference that file for each token. Tokens that are not overridden in light mode (e.g. toast tokens, brand signal colors) show the same hex in both columns. Static tokens (e.g. `--color-gw-red`, `--color-gw-saved`) have no light-mode override and should say so explicitly rather than repeating the value.
**Done:** [x]

---

### Task 2: Create Typography story

**What:** A new story that renders the full type scale (hero → nano), all four font families with use cases, the complete tracking scale, and the complete leading scale as labeled specimen rows.
**Files:** `frontend/stories/Foundations/Typography.stories.tsx` (new)
**Done when:** The story contains four sections — Type Scale, Font Families, Tracking Scale, Leading Scale; each `--font-size-gw-*` level renders at the correct size using its matching font family/weight/tracking per `getwrite-theme.css`; the hero specimen uses the raw `clamp(60px, 9vw, 88px)` token with a `min · preferred · max` annotation beneath it; all four font families are shown with a one-line use-case description; all `--tracking-*` and `--leading-*` tokens appear as labeled rows with a short text specimen.
**Depends on:** none
**Estimate:** 5
**Notes:** The font family / size / tracking pairings for each scale level are documented in the comment block at the bottom of `getwrite-theme.css` (the "UTILITY NOTES" section). The `hero` level should render via `style={{ fontSize: 'var(--font-size-gw-hero)' }}` — do not hardcode a px value. `font-serif` (IBM Plex Serif) is editor-only; note that in its family row.
**Done:** [x]

---

### Task 3: Create Spacing story

**What:** A new story that renders each `--spacing-*` step from `saboteur-base.css` as a proportional filled bar with its token name and pixel value labeled.
**Files:** `frontend/stories/Foundations/Spacing.stories.tsx` (new)
**Done when:** All ten spacing steps (`--spacing-1` through `--spacing-20`) appear as horizontal filled bars; each bar's width matches its spacing value exactly (rendered via inline style); each row is labeled with the CSS variable name and its resolved px value; bars are visually distinguishable at a glance.
**Depends on:** none
**Estimate:** 2
**Notes:** Use `style={{ width: 'var(--spacing-N)' }}` so the bars reflect the live token rather than hardcoded widths. Include a fixed-height container so smaller steps (4px) remain visible.
**Done:** [x]

---

### Task 4: Create Borders story

**What:** A new story that shows all `--radius-*` and `--border-width-*` tokens as labeled visual examples.
**Files:** `frontend/stories/Foundations/Borders.stories.tsx` (new)
**Done when:** All four `--radius-*` tokens (sm, md, lg, xl) are shown as filled squares with the corresponding border-radius applied; all four `--border-width-*` tokens (hairline, thin, bar, mark) are shown as bordered boxes with the corresponding width applied; every example is labeled with its token name and px value.
**Depends on:** none
**Estimate:** 2
**Notes:** Radius examples should use a fixed-size box (e.g. 80×80px) so the corner curvature is legible. Border-width examples should use a contrasting border color (e.g. `--color-gw-primary`) so all widths including hairline (0.5px) are visible.
**Done:** [x]

---

### Task 5: Create Layout Tokens story

**What:** A new story that lists all `--width-gw-*`, `--height-gw-*`, and `--padding-gw-*` layout tokens with their values and described roles.
**Files:** `frontend/stories/Foundations/LayoutTokens.stories.tsx` (new)
**Done when:** The story renders three sections (Widths, Heights, Padding); every token from `getwrite-theme.css` in those categories appears with its CSS variable name, resolved px value, and a one-line description of where it is used in the app; at least one visual indicator (e.g. a scaled bar or annotated bracket) accompanies each token so the value is not purely textual.
**Depends on:** none
**Estimate:** 2
**Notes:** Tokens to cover: `--width-gw-resource-panel` (200px), `--width-gw-metadata-panel` (220px), `--height-gw-titlebar` (44px), `--height-gw-tree-item` (32px), `--height-gw-tab` (38px), `--width-gw-active-indicator` (2px), `--height-gw-tab-underline` (1.5px), `--padding-gw-editor-x` (40px), `--padding-gw-editor-y` (32px). The component tokens (`active-indicator`, `tab-underline`) can be grouped in a fourth "Component" section if it aids clarity.
**Done:** [x]

---

### Task 6: Create Motion story

**What:** A new story that demonstrates each `--transition-*` token as a live hover interaction so the easing and duration are observable in Storybook.
**Files:** `frontend/stories/Foundations/Motion.stories.tsx` (new)
**Done when:** Both `--transition-fast` (150ms ease) and `--transition-normal` (200ms ease) are represented; each token has an interactive element that applies the transition on hover (e.g. background-color or opacity change); each example is labeled with the CSS variable name, duration, and easing; the transitions fire correctly in the Storybook canvas without any JavaScript animation libraries.
**Depends on:** none
**Estimate:** 2
**Notes:** Use CSS `transition` applied via inline style referencing the token (e.g. `style={{ transition: 'background-color var(--transition-fast)' }}`). A simple color-shift on a labeled button-like block is sufficient — no need for transform animations.
**Done:** [x]

---

## Summary

- Total tasks: 6
- Total estimated effort: 16 story points
- Critical path: All tasks are independent — no task depends on another. Any single task is its own critical path. The Typography story (Task 2, 5 SP) is the largest single unit of work and determines the longest individual session.
- Risks: Task 2 (Typography) carries the most judgment — matching each scale level to its correct font family, weight, and tracking requires careful cross-referencing of `getwrite-theme.css`. Task 1 (Colors) requires sourcing light-mode hex values from a separate file (`getwrite-utilities.css`) and deciding how to present tokens with no light-mode override; the convention for those should be settled before starting.
