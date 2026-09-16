Follow-ups raised against `destructive-styling-a11y` after its own gates closed.

### FU-1: Residual strict-axe `color-contrast` findings on elements carrying a CSS `opacity`

**What:** A lead strict-axe sweep on 2026-09-15 (Chromium, `frontend/.storybook/preview.tsx`'s global `a11y.test` temporarily flipped from `"todo"` to `"error"` — that flip was reverted afterwards and is NOT part of this branch) measured the following facts.

An A/B on `stories/WorkArea/DiffView.stories.tsx`, this branch's CSS vs. `main`'s (reverting `frontend/styles/{getwrite-theme,saboteur-base,getwrite-utilities}.css` to `main`, measuring, then restoring):

- **main: 53 `color-contrast` findings.** Breakdown: `#7a7870` on `#f5f4f0` at ratio 4.01 (×38, across 9px/10px/13px text), `#abaaa3` on `#f5f4f0` at 2.11 (×6), `#7a7870` on `#d7e5d7` at 3.38 (×3), `#9f9d96` on `#e0e6e8` at 2.15 (×3), `#db6463` on `#f5f4f0` at 3.17 (×3).
- **this branch: 10 findings.** The entire `#7a7870`-on-`#f5f4f0` family (38 of the 53) is gone. Remaining: `#9d9c9a` on `#f5f4f0` at 2.49 (×5, `.diff-pane-placeholder`), `#8f8d8b` on `#e0e6e8` at 2.62 (×3, `.diff-removed`), `#db6463` on `#f5f4f0` at 3.17 (×2, `.revision-control-badge`).

Across the whole story suite under strict axe, of the 17 files in `specs/features/destructive-styling-a11y/consumer-list-stories.txt`, 12 are clean and 5 have findings: `AppShell` (`heading-order`), `ProjectSettingsDialog` (`landmark-no-duplicate-banner`), `SchemaManager` (`color-contrast` ×3), `AddFieldForm` (`aria-allowed-attr`), `ResourceTree` (`aria-required-children`). Every `Foundations/*` story file, including `Button.stories.tsx`, is clean. Only the `SchemaManager` entry is in scope for this follow-up; the other four are separately pre-existing findings and out of scope here.

`SchemaManager`'s 3 findings are `#acaba8` on `#f5f4f0` at 2.08, on elements matching `.opacity-50`.

Every one of these 13 residual findings (DiffView's 10 + SchemaManager's 3) sits on an element carrying a CSS `opacity`: `.diff-pane-placeholder` `opacity: 0.6`, `.diff-removed` `opacity: 0.7`, `.revision-control-badge` `opacity: 0.8` (all three in `frontend/styles/getwrite-utilities.css`), and SchemaManager's Tailwind `.opacity-50`. `.diff-pane-placeholder`'s own declared colour is `var(--color-gw-secondary)`, which this branch repointed to `var(--color-fg-tertiary)` = `#888680`; axe reports the composited `#9d9c9a`, not `#888680`.

The correlation between "carries an opacity" and "still fails" is exact across all 13 residual findings — a measured fact, not yet a settled cause. This suggests, as an unsettled hypothesis, that the opacity compositing is what drops the ratio below 4.5:1 rather than the token values themselves. That hypothesis has NOT been discriminated by any experiment. **Experiment that would settle it:** remove or raise the `opacity` on one rule (e.g. `.diff-pane-placeholder`) in isolation, re-run the strict-axe sweep over `stories/WorkArea/DiffView`, and check whether that rule's findings clear while the others are unchanged.

**Why deferred:** fixing it means changing `opacity` values across DiffView, the revision badge, and SchemaManager — outside this feature's FRs, and a visual-design change rather than a token change. This feature's scope was the destructive-button styling and the calibrated text tokens.

**Context:** `frontend/styles/getwrite-utilities.css` (the three `.diff-*` / `.revision-control-badge` rules), the SchemaManager component's `opacity-50` usages, and `frontend/.storybook/preview.tsx:207` (the global `a11y.test` setting, still `"todo"` — only `frontend/stories/WorkArea/TrashView.stories.tsx` opts into `"error"`, per this feature's FR-18/OQ-4).

**Relates to:** destructive-styling-a11y FR-5/FR-6 (token repoint), FR-9 / Task 9; trash-ui FU-9.
**Raised:** 2026-09-15
**Resolved:** [ ]

### FU-2: `var(--color-gw-mid)` was referenced by three declarations and defined nowhere

**What:** `--color-gw-mid` had no definition anywhere in `frontend/styles/` or
`frontend/app/` — `grep -rn -- "--color-gw-mid\s*:"` returned nothing — while
three declarations referenced it, so all three were dropped by the CSS parser
and had no effect:

- `frontend/styles/editor.css:200` — `.column-resize-handle`'s
  `background-color`. This is a live selector: TipTap's column-resize plugin
  adds the class itself and `components/Editor/editorExtensions.ts:70`
  configures `TableKit` with `table: { resizable: true }`, so the handle was
  rendering with no background at all.
- `frontend/styles/getwrite-utilities.css:1013` —
  `.entity-compile-list-name-excluded`'s `color`.
- `frontend/styles/getwrite-utilities.css:1022` —
  `.entity-compile-list-excluded-label`'s `color`.
  Both are used by `components/common/EntityCompileResourceList.tsx` and were
  inheriting their colour instead.

**Why deferred:** `destructive-styling-a11y.md` FR-17 and its Non-goals put
this explicitly out of that feature's scope and required it be recorded as a
separate follow-up. That record was never actually written at the time; this
entry is it, written retroactively alongside the fix.

**Relates to:** destructive-styling-a11y FR-17
**Raised:** 2026-09-15
**Resolved:** [x]
**Resolved on:** 2026-09-16

**Resolution:** Fixed by removing the undefined token rather than defining it;
no `--color-gw-mid` reference remains outside explanatory comments.

The two text uses were **not** repointed at the brand mid grey. `--color-brand-mid`
(`saboteur-base.css:18`) carries the comment "Structural grey. Swatches,
dividers, decorative. NEVER text — use fg-* below", and its value `#6a6864` is
the same one `destructive-styling-a11y` FR-5 measured at 3.56/3.40/3.26 against
the three dark chrome surfaces — failing AA. Defining `--color-gw-mid` and
leaving those two declarations pointed at it would therefore have shipped both
a documented styling-rule violation and a known contrast failure. They now use
`var(--color-gw-secondary)`, the calibrated de-emphasis text token FR-5/FR-6
repointed at `var(--color-fg-tertiary)` / `var(--color-fg-inv-tertiary)`.

`.column-resize-handle` now uses `var(--color-gw-border-md)`, an existing
hover/emphasis divider token with light and dark reassignments already in all
four theme blocks and an existing `background-color` precedent at
`getwrite-utilities.css:2083`.

`node frontend/scripts/check-no-hardcoded-hex.mjs` reports no violations after
the change. The rendered appearance of the now-visible resize handle and the
two excluded-item text styles has not been checked in the real app; that check
is outstanding.
