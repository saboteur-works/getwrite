# Follow-up Work — Simplify Design System Second Pass

## Timeline holdouts (deferred from Task 11)

**Date deferred:** 2026-05-19

### What was migrated in Task 11

- `timeline.css` hardcoded hex tokens replaced with CSS custom properties:
  - `--timeline-track-bg` → `var(--color-gw-chrome)` (background track)
  - `--timeline-active-color` → `var(--color-gw-red-border)` (POV pill active state, injected via AppShell scope)
  - `--timeline-focus-ring` → `var(--color-gw-surface)` (chip focus-visible ring)
- These changes allow theme-layer overrides without touching Timeline component code.

### What stayed bespoke — and why

**`TimelineChip` (`frontend/components/Timeline/TimelineChip.tsx`)**

TimelineChip uses `timeline-chip` CSS classes and bespoke sizing/padding tuned for the dense row layout. The canonical `Chip` API (`shape`, `size`, `color`, `active`) doesn't model the Timeline's inline revision-label chip. Migrating would require either a new `size` variant or custom className override, both of which dilute the canonical primitive's value. Kept bespoke; documented here for the next design-system pass.

**Timeline zoom controls (`frontend/components/Timeline/TimelineAxis.tsx`)**

Zoom-in/zoom-out buttons use `timeline-zoom-btn` classes and icon-only sizing (`px-1 py-0.5`) that falls between canonical Button sizes. The canonical `Button` has `sm`/`md`/`lg` but not a `xs` or icon-only variant. Migrating would require adding an `xs` size or an `iconOnly` flag. Deferred; revisit if a compact icon-button variant is added to the canonical Button.

**POV pill active state (`timeline-pov-pill.active`)**

The POV pill's red active ring is the one legitimate use of the red canonical-state token in Timeline. Already migrated to `var(--timeline-active-color)` CSS variable (resolved to `var(--color-gw-red-border)` at the AppShell scope). The pill itself renders in `timeline.css` and has no canonical Chip mapping — its shape and placement are entirely bespoke. Kept as-is; the token migration in Task 11 is sufficient to keep it theme-coherent.

### Recommended next steps

1. Add an `xs` / `icon-only` Button variant to the canonical Button when the design calls for it, then migrate timeline zoom buttons.
2. If a `compact` or `inline` Chip variant is added, revisit TimelineChip migration.
3. Consider extracting the `--timeline-*` custom properties into a dedicated timeline theme section in `getwrite-utilities.css` so they are visible as first-class tokens rather than inline style injections.
