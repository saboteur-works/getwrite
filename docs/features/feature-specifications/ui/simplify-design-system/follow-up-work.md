# Follow-up Work

## Task 9 — Active tag color (default, no custom color)

**Completed:** 2026-05-19

**What changed:** Migrating `TagsSection` to `<Chip>` dropped the red (`gw-red`) fill for default-color active tags. Previously, `metadata-sidebar-tag--active` used `background-color: var(--color-gw-red)`. The canonical `chip--active` state uses `gw-chrome3` (neutral highlight), consistent with the SearchFilterPanel chips.

**Why deferred:** The `chip--active` CSS rule defines a single active style. Adding a separate "canonical indicator" active variant to the generic Chip primitive would tie the primitive too tightly to one domain concept. The audit note says red fill was likely a design-system inconsistency (the theme comment says canonical indicators use red *border/text*, never fill).

**Recommendation:** If UX review decides active (assigned) tags should be visually distinct from filter-active chips, introduce a `variant: "tag"` prop to Chip with a dedicated `chip--tag-active` CSS class (using `border-gw-red-border` + `text-gw-red` rather than filled red, to align with the theme's canonical-state pattern). This is a narrow, reversible change that doesn't require touching the call sites again — just the CSS and Chip prop.
