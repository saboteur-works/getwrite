# Simplify Design System

## Overview

GetWrite's UI has accumulated ~82 component files across feature-organized folders, with recurring visual primitives (buttons, chips, dialogs, modals, inputs, menus, panels) re-implemented inline in JSX or duplicated across feature directories. This feature audits the existing components, identifies the highest-duplication primitives, and replaces them with a small, consistent set of shadcn-based primitives styled with Tailwind and GetWrite brand tokens. The result is fewer components, less per-feature styling logic, and a single source of truth for shared visual elements.

## Goals

- Produce an auditable inventory of the top reused/duplicated UI primitives in `frontend/components/`, ranked by occurrence count.
- Reduce the count of distinct component implementations doing similar visual work by at least 30% in targeted categories (buttons, chips, dialogs/modals, inputs, menu items).
- Establish a single canonical primitive (shadcn base + Tailwind + brand tokens) for each high-duplication category.
- Preserve all existing visual and interaction behavior, including brand rules (red reserved for canonical state, IBM Plex fonts, dark/light tokens).
- Maintain or improve Storybook coverage and a11y test pass rates after migration.

## Non-goals

- Redesigning UX, layout, or visual language of any feature.
- Migrating the TipTap editor surface or its menu bar in this phase.
- Replacing Redux, state, or data-layer code.
- Introducing a CSS-in-JS or non-Tailwind styling solution.
- Auto-migrating every component; only those flagged by the audit are in scope.

## User stories

- As a GetWrite contributor, I want one canonical primitive per visual concept so that I do not re-implement the same button/chip/dialog in each feature folder.
- As a GetWrite maintainer, I want a documented audit of duplicated UI so that I can justify and track the consolidation work.
- As a GetWrite user, I want the app's look and feel to remain unchanged across the migration so that nothing visibly regresses.

## Functional requirements

1. The audit **must** be produced as a markdown artifact listing each duplicated primitive, file paths where it occurs, and occurrence counts.
2. The audit **must** rank categories by impact (occurrence count × estimated LOC saved) and select the top categories for phase-one replacement.
3. Each canonical primitive **must** be built on a shadcn base component, styled with Tailwind utilities, and consume existing brand tokens (`black`, `white`, `red`, `mid`, `surface`).
4. Each canonical primitive **must** ship with a Storybook story covering variants and an a11y test, per `docs/standards/storybook-implementation.md`.
5. Replaced call sites **must** import the canonical primitive; the prior local implementation **must** be deleted (no parallel coexistence).
6. The red brand token **must not** be used for actions or alerts in any new primitive.
7. Type checking, lint, unit tests, and E2E tests **must** pass after each category migration.
8. The Tailwind config and brand token sources **should** remain the single source of styling truth; primitives **must not** introduce hardcoded hex values.

## Open questions

- Which shadcn distribution path (CLI-generated `components/ui/` vs. hand-ported) fits the existing `frontend/components/` layout best?
- Should canonical primitives live under `components/common/UI/` (current `Chip` pattern) or a new `components/ui/` root?
- What is the threshold (occurrence count) below which a primitive is left alone for now?

## Out of scope (deferred)

- Migration of TipTap editor toolbar and inline-menu surfaces.
- Replacement of the headless-tree-based `ResourceTree`.
- Theming additions (e.g., user-customizable accent colors).
- Visual redesign of the Start screen or project-types selection.
- Codemods for automated call-site rewrites.
