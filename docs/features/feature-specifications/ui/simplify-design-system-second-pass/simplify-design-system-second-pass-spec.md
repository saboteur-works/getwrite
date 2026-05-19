# Simplify Design System — Second Pass

## Overview

Phase one landed canonical `Button`, `Dialog`, `Card`, `Input`/`Textarea`/`Select`/`Checkbox`, `CollapsibleSection`, and extended-`Chip` primitives (~816 LOC removed). It deferred items that were behavioral not visual (menu containers), visually unique (Timeline, specialized inputs), or single-call-site (`ViewSwitcher`). This pass picks those up and closes the loop on brand-token regression. Inputs: [`../simplify-design-system/tasks.md`](../simplify-design-system/tasks.md) "Deferred" and [`../simplify-design-system/follow-up-work.md`](../simplify-design-system/follow-up-work.md).

## Goals

- Replace duplicated menu-container behavior (outside-click, arrow-key, escape) with one shared hook adopted by all three containers.
- Migrate `ViewSwitcher` onto a canonical `Tabs` primitive.
- Consolidate the four autocomplete surfaces onto canonical `Input` plus a shared dropdown/listbox primitive.
- Lock in the no-hardcoded-hex invariant via CI check.
- Migrate Timeline visuals onto canonical variants where the contract matches.

## Non-goals

- Redesigning Timeline, Search, or command-palette UX.
- Migrating the TipTap editor surface or its menu bar.
- New state-management or data-fetching layer for autocompletes.
- New themes or user-customizable accent colors.
- Codemod-based auto-migration.

## User stories

- As a contributor, I want one hook for menu dismissal/keyboard behavior so I do not re-implement it per menu.
- As a contributor, I want a canonical `Tabs` primitive so the next tablist is a one-line adoption.
- As a maintainer, I want CI to fail on new hardcoded hex values so brand-token discipline does not drift.
- As a user, I want Timeline, Search, and command-palette interactions to behave identically post-migration.

## Functional requirements

1. A shared `useDismissableMenu` hook **must** encapsulate outside-click, escape, and roving-focus arrow-key behavior, and **must** be adopted by `ResourceContextMenu`, `ShellSettingsMenu`, and `ManageProjectMenu`; prior implementations **must** be deleted.
2. A canonical `Tabs` primitive **must** be built on shadcn's Tabs base with brand-token styling, ship with a Storybook story and a11y test, and replace `ViewSwitcher`.
3. `SearchBar`, `ResourceCommandPalette`, `POVAutocomplete`, and `MultiResourceRefInput` **must** consume the canonical `Input`, and **must** share one `Listbox` primitive built on Radix Popover for their result lists. Filtering/fetching stays in the call site (no `cmdk` adoption).
4. Timeline visuals **must** migrate onto canonical `Chip` / `Button` / `Card` variants where the visual contract matches; anything kept Timeline-specific **must** be noted in a follow-up.
5. A `scripts/check-no-hardcoded-hex.mjs` script **must** run in CI and fail on new hardcoded hex outside an inline exemption list (CSS-var fallbacks, color-picker `#000000` placeholders, Chip's `#fff` user-color contrast); each exemption **must** carry a structured comment explaining its rationale.
6. The red brand token **must not** appear in any new or migrated primitive except canonical/position-state indicators. The canonical `Chip` **must** gain a `tag-active` variant using red border/text (not fill), and `TagsSection` **must** adopt it to restore the assigned-tag distinction lost in phase one.
7. `pnpm typecheck`, `pnpm lint`, `pnpm test:ci`, `pnpm build`, `pnpm build-storybook`, and `pnpm test:e2e` **must** pass after each task.

## Open questions

None identified.

## Out of scope (deferred)

- TipTap editor toolbar and inline-menu migration.
- Headless-tree-based `ResourceTree` replacement.
- User-customizable theme accent colors.
- Visual redesign of Start screen, project-types selection, or Timeline.
- Automated codemods for remaining call-site rewrites.
