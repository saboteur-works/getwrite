# Feature: Project-level entity relationship graph view

## Overview

A novelist can already see one entity's mentions (Feature 33), one entity's
own co-occurrence list (Feature 37's "Also appears with" text), one entity's
authored relationships (Feature 38's sidebar list), and every declared entity
as a flat roster (Feature 36) — but nothing shows entities *and* their
connections to one another at once, as a single set. This feature adds that:
a seventh top-level work-area view rendering every declared entity as a node
and drawing an edge for every co-occurrence pair (Feature 37) and every
authored relationship (Feature 38), with the two edge kinds visually
distinguished wherever both appear on the same pair of nodes. It is the only
feature in the entity family that covers the parent product spec's FR-39 in
full — Features 37 and 38 are enabling slices that cover no requirement of
their own, existing only so this view has two edge sources to draw from. The
view is read-only: no edge is created, edited, or removed on this canvas,
that authoring already lives on Feature 38's sidebar surface.

This spec settles what the product spec and feature breakdown already
decided at their own gates (read-only, both edge sources drawn and
distinguished, ride the existing `entities` flag, activate-a-node-to-navigate,
no inference) and does not reopen them. A later gate (Gate 3) resolved five
of the seven questions the feature-breakdown entry left open — rendering
split (buy the layout algorithm, hand-roll the rendering), node-position
persistence (ephemeral), the accessibility mechanism (a synchronized
accessible list), edge-weight display (shown, via thickness), and native
completeness (already shipped by Features 37/38) — recorded below as
resolved Open Questions rather than folded silently into prose. Two
questions remain genuinely open and are not resolved by assertion: which
specific headless layout library to adopt (bound by
`docs/standards/package-selection.md`), and behavior at scale, which is
named as a measurement to run rather than a performance claim.

## Goals

- A novelist can see every declared entity in the project as a single
  node-and-edge graph, revealing entity-to-entity structure that neither the
  flat roster (Feature 36) nor a single entity's own thread (Feature 35) or
  own sidebar lists (Features 37, 38) can show together.
- A novelist can tell, for any pair of connected entities, whether the
  connection is something the system observed (a co-occurrence) or something
  the writer asserted (an authored relationship) — including when both exist
  for the same pair — without opening either entity's own sidebar view.
- A novelist can navigate from the graph directly to an entity's own resource
  by activating its node, consistent with the roster's existing
  activate-to-navigate convention.
- The view functions fully offline on desktop and, once its own data sources'
  native backends are complete (see the feature breakdown's Notes for
  Feature 39), on native Android — this spec records that dependency without
  asserting it is met on day one of this feature's implementation.

## Non-goals

- No edge authoring, editing, or deletion on this canvas — creating, editing,
  and removing an authored relationship remains Feature 38's sidebar surface
  only.
- No new per-project feature flag — the view rides the existing `entities`
  flag unchanged.
- No new entity-declaration mechanism, and no discovery or inference of an
  entity, a co-occurrence, or a relationship the writer never declared,
  detected, or authored — the view draws only what Feature 37's and
  Feature 38's existing reads already provide.
- No decision, in this document, on which specific headless layout library
  to adopt, or how the view behaves at a large entity/edge count — both
  remain Open Questions (OQ-1's library selection, OQ-3's scale question),
  the latter following the precedent Feature 36 set by deferring its
  virtualization question to a measured task rather than an asserted design
  decision. The rendering-approach split itself (buy the layout algorithm,
  hand-roll the rendering) and whether node positions persist (they do not)
  are resolved — see Open Questions OQ-1/OQ-2.
- No filtering, ranking, or thresholding of edges by strength, recency, or
  any other derived signal beyond what Feature 37's count and Feature 38's
  type already carry. Displaying Feature 37's existing co-occurrence count
  as a visual weight (edge thickness, OQ-5) is in scope and is not an
  exception to this: showing a number the read already returns is not
  ranking, filtering, or deriving a new signal.
- No change to Feature 37's or Feature 38's own read/write surfaces; this
  feature is a pure consumer of both.

## User stories

- US-1: As a novelist, I want to see all my declared entities and how they
  connect to one another in one view, so that I can notice structure a flat
  roster or one entity's own view can't surface.
- US-2: As a novelist, I want to tell at a glance whether a connection between
  two entities is something the system observed from shared prose or
  something I explicitly asserted, so that I don't mistake a co-occurrence
  for a relationship I never actually recorded.
- US-3: As a novelist, I want to click an entity's node and land on its own
  resource, so that reviewing the graph and acting on what I see is a single
  step.

## Functional requirements

FR-1: The work area MUST provide a seventh top-level view, the entity relationship graph, selectable from `ViewSwitcher.tsx` alongside Edit, Organizer, Data, Diff, Timeline, and Feature 36's entity roster, requiring `ViewName` (`frontend/src/lib/models/types.ts`) and `VIEW_OPTIONS` to gain a seventh entry and `AppShell.tsx`'s view-dispatch to gain a corresponding case. This view is project-wide, cross-resource data with no resource-tree selection dependency, the same category the roster (`entityRoster`) and `data` already occupy in `AppShell.tsx`'s dispatch — its case MUST be reachable the same way theirs are: `AppShell.tsx:1382-1415` currently branches `entityRoster` and `data` out *before* the `!selectedResource` early-return guard specifically because both read project-wide state independent of any selected resource, while the `switch (view)` block reached after that guard is for resource-scoped views only. This feature's view MUST be hoisted alongside `entityRoster`/`data` in that same pre-guard branch, not placed inside the post-guard `switch`, so it does not reintroduce the defect PR #186 fixed for the roster (unreachable with no resource selected) or repeat the still-open Timeline instance of the same defect (POS `task_a7d8581a`). [US-1]

FR-2: The graph tab MUST be disabled, with a hover/`title` explanation consistent with the existing `disabledViews`/`disabledReasons` mechanism `ViewSwitcher.tsx` already exposes (the pattern `timeline` and `entityRoster` both use), whenever the project's `entities` feature flag is off. The view MUST introduce no feature flag of its own. [US-1]

FR-3: Every declared entity in the project's `EntityAliasTable` (`entity-alias-table.ts`'s `buildEntityAliasTable`, read via the existing `entityAliasTableSlice` cache) MUST be rendered as a node, labelled with its name, regardless of whether that entity has any co-occurrence or authored-relationship edge — an entity with no connections MUST still appear as a node, not be omitted, so a writer can see an isolated entity as isolated rather than have it silently vanish from the view. [US-1]

FR-4: The graph MUST draw an edge between two entity nodes for every pair returned by Feature 37's co-occurrence read (`getEntityCooccurrence`, `lib/api/entity-cooccurrence.ts`) and MUST draw an edge for every authored relationship returned by Feature 38's list read (`listEntityRelationships`, `lib/api/entity-relationships.ts`). The view MUST introduce no third edge source and MUST NOT derive, infer, or synthesize any edge of its own. [US-1]

FR-5: Where a co-occurrence edge and one or more authored-relationship edges exist for the same pair of entities, the graph MUST render both as visually distinct, separately identifiable edges rather than merging them into one — mirroring the existing product-wide discipline (`mentions-core.ts`'s merge-only-for-display floor) that a detected fact (here, co-occurrence) and an asserted fact (here, an authored relationship) are never conflated into a single representation, even when they exist between the same two entities. [US-1][US-2]

FR-6: Every co-occurrence edge (a detected, derived fact) MUST be visually distinguishable from every authored-relationship edge (an asserted fact) wherever either appears on the graph, not only where both coexist on the same pair — a reader MUST be able to tell which kind of edge they are looking at anywhere in the view, not only when comparing two edges side by side. This distinction MUST be conveyed by more than colour alone (line style, a label, an icon, or an equivalent non-colour cue), consistent with `docs/standards/accessibility.md` §4, and MUST NOT use the reserved position/canonical-state colour token (`#D44040` / `red`) for either edge kind, consistent with entity highlighting's and the roster's existing styling constraint. [US-2]

FR-7: An authored relationship edge MUST be directed (reflecting Feature 38's `sourceEntityId`/`targetEntityId`) and MUST visually convey its direction (e.g. an arrowhead or an equivalent directional cue); a co-occurrence edge MUST be rendered as undirected, consistent with Feature 37's own FR-3 guarantee that co-occurrence pairs are unordered. [US-1][US-2]

FR-8: The canvas MUST support pan, zoom, and node selection as baseline interactions. Node layout (positions and edge routing) MUST be computed by a headless layout library — one that provides layout algorithms and hit-testing without prescribing rendering, markup, or a visual language of its own — following this codebase's own established precedent of pairing a headless algorithm library with fully hand-rolled rendering: `@headless-tree/core`/`@headless-tree/react` (`frontend/package.json:32-33`) already drive the resource tree's drag-and-reorder interaction while its DOM and styling remain entirely custom. Rendering, theming (brand tokens, dark/light modes), and the accessibility affordances FR-10/FR-11 require MUST be hand-rolled SVG/DOM, not delegated to the layout library or to any library that itself renders. Selecting and vetting a specific headless layout library — checking it against `docs/standards/package-selection.md` (registry/version verification, React 19 peer compatibility, justification, no existing dependency already covering the need) and confirming it is layout-only, not rendering — is a task-breakdown step, not decided by this spec; see Open Questions (OQ-1). [US-1]

FR-9: Activating an entity's node (by pointer click, and by keyboard when the node has focus and Enter/Space is pressed) MUST navigate to that entity's resource (`setSelectedResourceId`, `resourcesSlice.ts`), following the same read-only, activate-to-navigate convention the entity roster (Feature 36, FR-10) established. The graph itself MUST NOT expose any control that edits an entity's declaration, a co-occurrence value (which cannot be edited, being derived), or an authored relationship — all such editing remains on the resource's own sidebar (declarations) or Feature 38's sidebar surface (relationships). [US-3]

FR-10: The view MUST meet the project's WCAG 2.1 AA target (`docs/standards/accessibility.md`), including that every node and every edge's existence and kind (co-occurrence vs. authored, and an authored edge's direction, type, and — for a co-occurrence edge — its shared-resource count) MUST be reachable and legible without relying on pointer-driven spatial reading of the canvas alone — a freely-positioned node-and-edge layout is not, by itself, navigable by tab order or a screen reader's normal reading order. This MUST be satisfied by the synchronized accessible list specified in FR-11, not by keyboard-driven traversal of the canvas itself, which is rejected as this feature's primary accessibility mechanism (see Open Questions, OQ-4, for why). [US-1][US-2][US-3]

FR-11: The graph view MUST render, alongside the canvas, a synchronized semantic list giving every node and every edge a reachable accessible role and name — a `<ul>` of `<li>`-wrapped native `<button type="button">` per entity node, mirroring the existing pattern `EntityRosterRow.tsx:70-136` already uses for the roster, plus an equivalent semantic list of edges. Non-colour disclosure of an edge's kind (co-occurrence vs. authored, an authored edge's type and direction, and a co-occurrence edge's shared-resource count per FR-12) MUST be folded into that list's text or accessible names — using visually-hidden (`sr-only`) text where needed, following the same convention `EntityRosterRow.tsx:132-134` already uses for the roster's own warning disclosure — rather than exposed only as a visual-only cue on the canvas. [US-1][US-2][US-3]

FR-12: A co-occurrence edge's shared-resource count MUST be shown, since it is substantive content — an edge between two entities sharing many resources reads differently from one sharing a single resource. It MUST be encoded on the canvas as edge thickness (a non-colour encoding, consistent with `docs/standards/accessibility.md` §4 and the reserved-red rule) and MUST additionally be given as literal text within FR-11's accessible list, since thickness alone is not perceivable through a screen reader. Thickness MUST be reserved for the co-occurrence count only and MUST NOT be reused as a channel for distinguishing co-occurrence edges from authored edges (FR-5/FR-6), which remain carried by separate non-colour cues. [US-2]

FR-13: Node positions MUST be ephemeral — recomputed by the FR-8 layout library on each load — and MUST NOT be persisted anywhere. A writer's manual rearrangement of nodes, if the chosen layout library supports one, does not survive a reload; this is a deliberate limitation, consistent with every entity feature except Feature 38, which took on new persisted state for its own relationship-edge schema and justified that exception in its own spec — an exception this feature does not extend to node positions. [US-1]

FR-14: When the project's `entities` feature flag is on but the project has no declared entities, the view MUST render a non-error empty state explaining that no entities have been declared yet, consistent with the roster's FR-11 precedent, rather than an empty canvas. [US-1]

FR-15: The view MUST introduce no new persisted data, no new entity-declaration mechanism, and no model-backed or NER inference of any kind — consistent with the product spec's FR-39 constraints, it reads only Feature 33's existing entity declarations and Feature 37's and Feature 38's existing reads, unchanged. [US-1]

FR-16: The view's own seventh-view plumbing (`ViewName`/`VIEW_OPTIONS`/`AppShell` dispatch) needs no ADR-021-specific handling, following Feature 36's precedent — work-area views are not routes, so native's static-export build script needs no change to accommodate a seventh one. This view MUST consume Feature 37's and Feature 38's data exclusively through their existing client transport modules (`lib/api/entity-cooccurrence.ts`, `lib/api/entity-relationships.ts`), which already resolve HTTP vs. native per ADR-021's `createTransport` collapse, so this feature adds no transport code of its own for either data source. Both data sources' native parity already exists — `native-entity-cooccurrence-backend.ts` and `native-entity-relationships-backend.ts` (each with its own `.web-stub.ts`) are shipped, both have a `turbopack.resolveAlias` entry in `frontend/next.config.mjs:224-231`, and both have parity and web-exclusion tests — so this feature has no outstanding native-backend dependency to wait on. [US-1]

## Open questions

- OQ-1 (resolved): a headless layout library plus hand-rolled rendering. Buy
  the layout algorithm and hit-testing; render, theme, and make accessible
  ourselves. No graph or layout library is installed today —
  `frontend/package.json` was checked directly and declares none (verified
  by grep for `react-flow`, `d3`, `cytoscape`, `sigma`, and `vis-network`;
  none present) — but this codebase already has the decisive local
  precedent for this exact split: `@headless-tree/core`/`@headless-tree/react`
  (`frontend/package.json:32-33`) already drive the resource tree's drag and
  reorder interaction while its DOM and styling remain fully custom. This is
  this codebase's established answer to "buy the algorithm, keep the
  pixels," and it applies directly here. The two alternatives were rejected
  on their own terms: hand-rolling the layout as well was rejected because,
  while `Timeline.tsx:13-126` does hand-roll wheel pan/zoom, adaptive tick
  generation, and scroll-anchor maths with no dependency, that is a 1D
  surface — a 2D layout with free node positions, edge routing, and
  hit-testing is materially harder than anything currently hand-rolled in
  this repo. A full rendering-plus-layout library was rejected because most
  such libraries render to a bare `<canvas>` or raw SVG with no
  accessibility tree of their own, so buying rendering does not buy
  accessibility — FR-10's burden lands on this feature under every option,
  which removes the main argument for the heaviest one — and it would also
  ship its own visual language needing a de-branding pass against
  `STYLING.md`. No specific package is named or chosen here: selecting and
  vetting a candidate headless layout library — registry and version
  verification, React 19 peer-compatibility checking, and confirming it is
  layout-only and does not itself render — is a task-breakdown step bound by
  `docs/standards/package-selection.md`. — Impact: FR-8, FR-10, FR-11.
- OQ-2 (resolved): node positions are ephemeral. Recomputed on each load;
  nothing is persisted. This is consistent with every entity feature except
  Feature 38, which took on new persisted state for its own relationship
  schema and justified that exception in its own spec — an exception not
  extended here. The accepted limitation, stated plainly: a writer's manual
  rearrangement of nodes does not survive a reload. — Impact: FR-8, FR-13.
- OQ-3 (resolved as a process decision, not a performance verdict): behavior
  at scale is deferred, with its cost model corrected first. The
  spec-drafting framing of this question was wrong: `getEntityCooccurrence`
  (`frontend/src/lib/models/mentions-core.ts`) keys its pair map by the
  `(entityId, entityId)` pair and unions resource ids into a `Set` per pair —
  verified directly in the function body, which builds a `pairs` map via an
  `addPair(a, b, resourceId)` helper that adds to an existing `Set` when the
  pair recurs in another resource, rather than creating a new entry per
  resource. Pairs therefore collapse across resources rather than
  accumulating one entry per resource: the co-occurrence edge count is
  bounded by `C(n,2)` on the total declared-entity count, independent of
  resource count — not by `C(k,2)` summed across resources, which bounds
  only each resource's own contribution before pairs are merged. Authored
  edges add at most one per authored `(source, target, type)` triple (FR-17
  of `entity-relationships.md`) and are bounded by writer effort, not by any
  derivation. With the model corrected, the question itself is resolved the
  same way `specs/features/entity-roster.md` resolved its own virtualization
  question before it was measured: deferred, explicitly not a performance
  claim. No claim is made here about render cost, layout cost, or
  interaction responsiveness at any node or edge count. The node population
  this view draws is the same one
  `specs/features/entity-roster/virtualization-benchmark-notes.md` already
  measured at 100/500/1,000 entities, but those numbers do not transfer to
  this feature: that benchmark measured a linear, virtualizable list, not a
  2D layout with edge routing, and the two have materially different cost
  shapes. The measurement that would settle this feature's own question:
  once a layout library is chosen (OQ-1), time first paint, layout settle,
  and pan/zoom frame interval at increasing node and edge counts, and decide
  whether any level-of-detail, clustering, or filtering treatment is needed
  only once that measurement exists. This sits on top of, and does not
  duplicate, the co-occurrence derivation's own separately unmeasured cost,
  already deferred as POS `task_f6153d5a` (`entity-cooccurrence.md`'s
  OQ-3). — Impact: FR-8, FR-10.
- OQ-4 (resolved): a synchronized accessible list alongside the canvas. The
  canvas is the visual surface; a semantic list rendered alongside it (FR-11)
  is the accessible surface, giving every node and edge a reachable role and
  name. This generalizes a pattern already shipped, not a new one: the
  roster is accessible because `EntityRosterRow.tsx:70-136` is a semantic
  `<ul>` of `<li>`-wrapped native `<button>`s, with non-colour disclosure
  folded into the accessible name via `sr-only` text
  (`EntityRosterRow.tsx:132-134`). Stated honestly: the roster is not a
  direct precedent for *this* problem, because it was never spatial and so
  never had to solve "a canvas exists and must also be accessible" — this
  feature extends the roster's accessible-row pattern to a case where a
  visual canvas exists alongside it, rather than reusing a case that already
  solved the same problem. Keyboard-driven graph traversal (e.g., arrow keys
  moving focus along edges from a focused node) is rejected as the primary
  mechanism: it is a novel interaction pattern in this codebase, and with
  `@storybook/addon-a11y` unavailable (see below) it would carry real
  undertesting risk as a first-of-its-kind pattern. It may be added later as
  a secondary affordance (see Out of scope), not as what FR-10 relies on.
  This resolution also corrects the spec's own earlier verification claim:
  `pnpm build-storybook` does currently fail on `main` on an unrelated
  `node:async_hooks` import (POS `task_417d4451`), but that only blocks the
  `@storybook/addon-a11y` sweep. `frontend/tests/a11y/` already contains 14
  component-level a11y tests using jsdom plus Testing Library
  `getByRole`/accessible-name assertions — the convention
  `docs/standards/accessibility.md` §2 itself names — and none of them
  depend on a Storybook build. That path exercises roles, accessible names,
  and keyboard operability, which is the core of FR-10 and FR-11, but not an
  axe-style automated contrast or structure sweep, which stays unavailable
  until `task_417d4451` is fixed. Both facts are recorded so this spec does
  not overstate what is blocked. — Impact: FR-10, FR-11.
- OQ-5 (resolved): co-occurrence edge weight is shown. The shared-resource
  count is the substantive content of a co-occurrence edge — "these two
  share many resources" is a materially different claim from "these two
  share one" — so it is encoded as edge thickness on the canvas, with the
  count also given as literal text in the FR-11 accessible list (thickness
  alone is not perceivable through a screen reader). Thickness is a
  non-colour encoding, so it satisfies `docs/standards/accessibility.md` §4
  and does not touch the reserved-red rule. — Impact: FR-12.
- OQ-6 (resolved: closed, already done by prior work). This is not an open
  question — both dependent features shipped native-complete already.
  `native-entity-cooccurrence-backend.ts` and
  `native-entity-relationships-backend.ts` (each with its own
  `.web-stub.ts`) exist, both have a `turbopack.resolveAlias` entry at
  `frontend/next.config.mjs:224-231`, and both have parity and
  web-exclusion tests — verified directly in the tree. Per Feature 36's
  precedent, this view's own seventh-view plumbing needs no ADR-021-specific
  handling of its own (work-area views are not routes, so native's
  static-export script needs no change), and this view consumes both data
  sources exclusively through their existing `createTransport`-collapsed
  client modules, adding no transport code of its own — this is FR-16 as
  written. A finding worth recording rather than acting on: both native
  backend files' own doc comments still say a "later task remains
  responsible" for the `resolveAlias` wiring and parity test — verified at
  `native-entity-cooccurrence-backend.ts:22` and
  `native-entity-relationships-backend.ts:24` — which is stale, since that
  work is done. This is noted here so it is not mistaken for an outstanding
  dependency of this feature; the source files themselves are not edited by
  this spec. — Impact: FR-16.
- OQ-7 (resolved): downstream of OQ-2 and OQ-4, and now answered.
  Alphabetical-by-name ordering, consistent with the roster's own default
  ordering, applies to the FR-11 accessible list, which is where an ordering
  is meaningful. The canvas itself has no alphabetical axis under a
  computed layout (OQ-1/OQ-2), so no ordering claim is made about node
  placement on the canvas. — Impact: FR-11.

## Out of scope (deferred)

- Any edge authoring, editing, or removal from this view — that is Feature
  38's sidebar surface, unchanged by this feature.
- Any new per-project feature flag; the view rides the existing `entities`
  flag (FR-2).
- Any new persisted data, entity-declaration mechanism, or model-backed
  inference (FR-15).
- Selecting and vetting a specific headless layout library, bound by
  `docs/standards/package-selection.md` — the buy-layout/hand-render split
  itself is decided (OQ-1); which library, and which of its layout algorithm
  variants (force-directed, hierarchical, radial, or other) to use, is not,
  and belongs to this feature's task breakdown.
- Persisting node positions in any form — resolved against, not merely
  deferred: positions are ephemeral (OQ-2, FR-13).
- Asserting any performance characteristic at scale before it is measured —
  resolved as a deliberate non-claim (OQ-3): the measurement that would
  settle it is named, but not run, by this spec.
- Keyboard-driven graph traversal as a primary or secondary accessibility
  mechanism at this feature's initial ship — rejected as the primary
  mechanism (OQ-4) in favour of the synchronized accessible list (FR-11); it
  remains a candidate later addition on top of that list, not a commitment
  of this spec.
- Filtering, search, or grouping controls over the graph (e.g. by
  `entityKind`, by minimum co-occurrence count, or by relationship type) —
  a candidate future refinement, not part of this slice, mirroring the
  roster's equivalent deferral.
- Exporting or printing the graph as an image or document — the existing
  compile pipeline (Feature 12) and entity-scoped compile (Feature 35) remain
  the only export paths for entity-related content.
