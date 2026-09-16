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

**Update (2026-09-16) — the cause is now settled, by computation rather than
by the browser experiment proposed above.**

Alpha compositing is deterministic: an element with `opacity: a` over a
backdrop renders at `a x foreground + (1 - a) x backdrop` per channel. Feeding
each rule's own declared colour, its backdrop, and its own opacity through that
formula reproduces the exact byte values axe reported:

| Rule | Declared | Backdrop | Opacity | Predicted | axe reported |
|---|---|---|---|---|---|
| `.diff-pane-placeholder` | `#636160` | `#f5f4f0` | 0.6 | `#9d9c9a` | `#9d9c9a` |
| `.revision-control-badge` | `#d44040` | `#f5f4f0` | 0.8 | `#db6463` | `#db6463` |
| `.diff-removed` (background) | `rgba(80,130,180,0.18)` | `#f5f4f0` | 0.7 | `#e0e6e8` | `#e0e6e8` |

Three exact matches, and the derived contrast ratios agree with axe's to within
rounding (2.50 vs 2.49; 3.18 vs 3.17). This discriminates the opacity
hypothesis from the alternative that the token values themselves are at fault:
the measured colours are not the token values, they are the token values
composited by these rules' own `opacity`. No browser run was needed.

**What that implies for the fix — it is not uniform across the three:**

- `.diff-pane-placeholder` measures **5.60 without the opacity** and 2.50 with
  it. Dropping `opacity: 0.6` alone clears it, because FR-5/FR-6 already
  repointed its token at an AA-calibrated value.
- `.revision-control-badge` measures **4.14 without the opacity** and 3.18 with
  it. Dropping the opacity is *not sufficient* — 4.14 is the same figure
  `destructive-styling-a11y`'s own Gate 3 table recorded as failing for
  `#d44040` at small sizes. This one needs a decision, not just an opacity
  removal: the badge is red because it marks canonical/position state, which is
  the one use CLAUDE.md and STYLING.md reserve red for, so the options are to
  raise its 9px text size, darken the red, or accept the finding for a
  non-text-critical badge. That call is the owner's.
- `.diff-removed` declares no `color` of its own and inherits one; its
  *background* composite matched exactly, but neither `--color-gw-secondary`
  (predicts `#868788`) nor the editor ink `#1a1916` (predicts `#535554`)
  reproduces axe's reported `#8f8d8b`, so the inherited colour in that context
  has not yet been identified. The mechanism is established; the specific
  inherited value still needs to be read off the rendered tree.

SchemaManager's `.opacity-50` findings follow the same mechanism but were not
recomputed here, since the Tailwind utility's backdrop was not recorded at
measurement time.

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

**Update (2026-09-16) — 11 of the 13 residual findings fixed; 2 deferred by the
owner.**

Every fix removes the `opacity` and changes no colour, so each is verifiable
from the arithmetic above rather than needing a re-measurement to interpret:

- `.diff-pane-placeholder` (x5) — `opacity: 0.6` removed. It already declares
  `var(--color-gw-secondary)`, which undimmed measures 5.60 on light chrome
  (`#f5f4f0`) and 5.19 on dark (`#111110`).
- `.diff-removed` (x3) — `opacity: 0.7` removed, and deliberately **no** colour
  declared in its place. The span inherits its colour, and the identically
  coloured `.diff-unchanged` text beside it was never flagged, so undimming it
  makes it exactly as legible as its neighbour. This also sidesteps the
  unresolved question above of which inherited value axe was reporting: the
  answer stops mattering once the compositing is gone. Removal is still
  signalled by the line-through and the tinted background.
- SchemaManager `.opacity-50` (x3) — removed from the field-key span
  (`SchemaManager.tsx:906`). Arithmetic confirms the same mechanism here:
  0.5 x `#636160` + 0.5 x `#f5f4f0` = `#acaba8`, exactly the value axe reported
  at 2.08. The sibling key-edit-error span already used the token undimmed.

**Deferred (owner decision, 2026-09-16):** `.revision-control-badge` (x2).
Removing its `opacity: 0.8` leaves it at 4.14, which still fails AA at its 9px
size, so unlike the other three this needs a colour or type-size change to a
badge whose red is a sanctioned canonical-state marker. Not attempted.

**Outstanding:** none of these four rules has been looked at in the real app
since the change. Undimming is a visible change to the diff panes, the diff's
removed-text runs, and the schema field keys, and the contrast arithmetic says
nothing about whether the result still reads as de-emphasised.
