# Slice 11 — Timeline · change deltas

> **Backfilled from git.** Size deltas reconstructed from the commit diff; the
> per-change narrative was not captured for this slice.

Commit: `f72d73c`.

| File | Lines before → after | Added / Removed | Net |
|---|---|---|---|
| `components/Timeline/Timeline.tsx` | 439 → 436 | +49 / −52 | −3 |
| `components/Timeline/TimelineRow.tsx` | 292 → 293 | +57 / −56 | +1 |
| `components/Timeline/TimelineTooltip.tsx` | 176 → 184 | +15 / −7 | +8 |
| `components/preferences/TimelineViewToggle.tsx` | 106 → 107 | +9 / −8 | +1 |

**Cross-file:** `TimelineTooltip` now parses dates via the shared
`parseDateString` helper instead of bare `Date.parse`.

**Also:** cleared pre-existing lint in touched files (`showLegend` →
`shouldShowLegend`, removed unused `dateToPercent` import, predicate-form
renames in the toggle).

**Net:** +7 lines — extraction/naming for clarity outweighed the small
removals, which is an acceptable outcome for a clarity pass.
