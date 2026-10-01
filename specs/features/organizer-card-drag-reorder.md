# Feature Spec: Organizer View — Drag-and-Drop Card Reordering

## Overview

The Organizer view (`OrganizerView.tsx`) renders a flat grid of cards
(`OrganizerCard.tsx`) for a folder's direct children, with filtering
(Feature 24) and click-to-open (Feature 65) already shipped. There is
currently no way to change the order of cards within that grid short of
leaving the view and reordering in the sidebar resource tree. This feature
adds direct drag-and-drop reordering of cards inside the Organizer grid,
built on `@dnd-kit` (chosen this session over `react-beautiful-dnd`/
`@hello-pangea/dnd`, `react-dnd`, Pragmatic drag-and-drop, and
`react-sortablejs` for React 19 compatibility, headless behavior that
won't fight `Card.tsx`'s Tailwind cascade-layer setup the way Feature 65
was bitten, and a built-in keyboard sensor), including a keyboard-operable
path so the interaction meets this repo's WCAG 2.1 AA target — unlike the
entity-relationship-graph's node-dragging feature (`EntityGraphCanvas.tsx`),
which is pointer/touch-only by deliberate design, this feature's bar is
different and must support keyboard reordering.

## Goals

- A writer can reorder cards in the Organizer grid by dragging one card to
  a new position among its siblings.
- The same reorder is achievable via keyboard alone (dnd-kit's keyboard
  sensor), satisfying WCAG 2.1 AA.
- The resulting order persists to disk and survives a project reload.
- Reordering does not regress existing Organizer filtering (Feature 24) or
  click-to-open (Feature 65) behavior.

## Non-goals

- Dragging a card into a different folder (re-parenting) — this feature
  only reorders siblings within the currently browsed folder.
- Reordering in any view other than Organizer (sidebar resource tree
  drag-reorder already exists and is unchanged by this feature).
- Any new sort/auto-order mode (e.g. sort by date, alphabetical) — this is
  purely manual drag-to-position.
- Touch-gesture-specific tuning beyond what `@dnd-kit`'s default pointer
  sensor provides out of the box.

## User stories

- US-1: As a writer browsing a folder in the Organizer view, I want to drag
  a card to a new position so that the grid reflects the order I want
  without switching to the sidebar tree.
- US-2: As a keyboard-only or screen-reader-using writer, I want to reorder
  Organizer cards without a mouse so that I have the same capability as a
  pointer user.
- US-3: As a writer who has narrowed the grid with a filter (Feature 24), I
  want to reorder cards predictably with respect to the filtered-out
  siblings so that reordering doesn't silently scramble items I can't
  currently see.

## Functional requirements

1. FR-1: Users MUST be able to drag an `OrganizerCard` via a dedicated drag
   handle (a small grip-icon affordance in the card, distinct from the
   existing title-select button and Open button) to a new position within
   the visible grid and have the grid visually reflect the new order
   immediately. [US-1]
2. FR-2: Users MUST be able to perform the equivalent reorder using the
   keyboard alone, via that same drag handle as the keyboard-sensor's
   interaction target (dnd-kit's keyboard sensor: focus the handle, select
   the card, move it earlier or later among its siblings, confirm), with
   visible focus indication throughout. [US-2]
3. FR-3: The reordered position MUST persist such that reloading the
   project or navigating away from and back to the folder shows the same
   order. [US-1]
4. FR-4: Reordering MUST NOT change which cards are visible under the
   active filter state (Feature 24) — a drag operation only changes
   order, never visibility. [US-3]
5. FR-5: Reordering MUST be disabled whenever any Organizer filter is
   active (the same active-filter condition `OrganizerView.tsx` already
   uses), with a visible reason shown to the user (e.g. a disabled drag
   handle plus a hint string explaining why); reordering is only available
   against the full, unfiltered sibling order. [US-3]
6. FR-6: The feature MUST reuse the existing `@dnd-kit` library with its
   keyboard sensor enabled alongside the pointer sensor; no alternate
   library MAY be introduced. [US-1]
7. FR-7: Reordering MUST NOT regress existing Organizer card click-to-open
   (Feature 65) or filter-bar (Feature 24) behavior — both MUST continue
   to function identically after this feature ships. [US-1]
8. FR-8: A completed keyboard reorder MUST be announced to assistive
   technology via a programmatic, non-visual status message (dnd-kit's
   `announcements` callback wired to its keyboard sensor), since a position
   change that occurs without a focus change is not otherwise conveyed to a
   screen-reader user — required to meet WCAG 2.1 AA Success Criterion
   4.1.3 ("Status Messages"), this repo's accessibility target
   (`docs/standards/accessibility.md`). [US-2]

## Open questions

OQ-1: Where does reordering write, and how does it interact with the
filtered subset? Evidence gathered this session: resources and folders
already carry a persisted `orderIndex` (`schemas.ts`), read by
`OrganizerView.tsx` today (`.sort((a, b) => a.orderIndex - b.orderIndex)`)
and by other consumers (e.g. `compileSelection.ts`'s "siblings by
orderIndex", Trash's folder-manifest ordering). A full reorder
transport already exists and is reused across the app: `POST
/api/projects/[projectId]/reorder` → `reorderResourcesCore`
(`resource-crud-core.ts`) → writes `orderIndex`/`folderId` onto folder
descriptors and resource sidecars; client-side it is
`reorderResources`/`persistReorder` (`lib/api/resources.ts`,
`resourcesSlice.ts`), already `createTransport`-collapsed with a native
(Android) backend (`native-resource-backend.ts`'s `reorder`). It is
currently driven only by the sidebar tree's `useResourceReorder.ts`, which
recomputes a dense `orderIndex` (0, 1, 2, …) for every child of the
affected parent(s) on each drop. Reusing this same mechanism from Organizer
would make Organizer order and sidebar tree order the same single order —
consistent with every other `orderIndex` consumer, but it also means a
drag performed while a filter narrows the visible set must decide what
happens to the `orderIndex` of the filtered-out siblings that weren't
touched: do they keep their existing values (leaving gaps/non-density) or
get renumbered around the moved/visible set? — Impact: FR-3, FR-4, FR-5.

**Resolved (mooted by OQ-2):** Since OQ-2 resolved reordering to be
disabled whenever any filter is active, there is no "filtered reorder"
case left to resolve — reordering always operates on the full, unfiltered
sibling order. The existing reorder transport
(`reorderResourcesCore`/`reorderResources`/`persistReorder`, evidenced
above) can therefore be reused as-is: a dense `orderIndex` recompute over
every child of the affected parent, with no filtered-subset special-casing
needed.

OQ-2: Should Organizer reordering be disabled/hidden entirely while any
filter is active (avoiding OQ-1's ambiguity outright), or always available
regardless of filter state? — Impact: FR-5.

**Resolved (owner decision):** Disabled. Reordering is turned off whenever
any Organizer filter is active (the same active-filter condition
`OrganizerView.tsx` already uses), with a visible reason shown to the user
(e.g. a disabled drag handle plus an explanatory hint string). This avoids
the ambiguity of reordering a filtered subset entirely, rather than
choosing between "always allow" alternatives that would leave the
filtered-out siblings' `orderIndex` handling unresolved. See FR-5.

OQ-3: Does reordering need its own drag handle on `OrganizerCard`, or is
the whole card (excluding its title-select button and Open button, both of
which have their own click behavior per Feature 65) the drag surface? A
poorly scoped drag surface could conflict with the existing `onSelect`
title button and `onOpen` button hit areas. — Impact: FR-1, FR-7.

**Resolved (owner decision):** Dedicated drag handle. A small grip-icon
affordance on `OrganizerCard` (e.g. in the card header) is the sole
drag-initiation target, for both pointer and keyboard, distinct from the
existing title-select button and Open button. See FR-1, FR-2.

OQ-4: Is there an existing or needed screen-reader-facing live
announcement for a completed keyboard reorder (dnd-kit supports
`announcements` callbacks), or does visible focus plus the persisted order
change satisfy this repo's accessibility bar on its own? — Impact: FR-2.

**Resolved (from evidence, high confidence):** Yes, a screen-reader live
announcement is needed — wire dnd-kit's `announcements` callback. WCAG 2.1
AA Success Criterion 4.1.3 ("Status Messages") requires a programmatic
announcement for a position change that occurs without a focus change;
visible focus alone does not satisfy it, and this repo targets WCAG 2.1 AA
(`docs/standards/accessibility.md`). See FR-8 (new).

## Out of scope (deferred)

- Re-parenting cards across folders via drag (moving a card to a different
  folder from within the Organizer grid).
- Any sort-by mode (date, name, word count) as an alternative to manual
  drag order.
- Multi-card drag (selecting several cards and moving them together).
- Any change to the sidebar resource tree's own drag-reorder behavior.
