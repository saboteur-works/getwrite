# Feature: Entity graph edge tooltips

## Overview

Feature 39 shipped a project-wide entity relationship graph whose canvas
draws every co-occurrence and authored-relationship edge, but the only place
that spells an edge out in words today is the synchronized accessible list
rendered alongside the canvas (`EntityGraphAccessibleList.tsx`) — a novelist
looking at the canvas itself cannot tell what a given edge represents (a
shared-resource count or a relationship type) without looking away to that
list. This feature adds a hover tooltip on each edge, surfacing the same
text the accessible list already renders for that edge, so the canvas
becomes self-explanatory without leaving it. It is a presentational
refinement on top of Feature 39's shipped graph, not a new data source: no
edge authoring, no new feature flag, and no new persisted data. The tooltip
is triggered by hover on pointer-primary devices and by tap on touch
devices (including native Android, where the graph view is already
reachable per Feature 39); the wiring for both is a single spike (see Open
Questions).

## Goals

- A novelist hovering an edge on the graph canvas, or tapping it on a
  touchscreen, can read what that edge represents — a co-occurrence's
  shared-resource count or an authored relationship's direction and type —
  without switching to the accessible list.
- The tooltip's text and the accessible list's text for the same edge are
  produced by one shared description function, so the two surfaces cannot
  independently drift apart over time.
- Every edge, however thin its visible stroke (a fixed 1.5px for an authored
  edge, a log-scaled width for a co-occurrence edge), has a wider hoverable
  hit area, so hovering near the line — not only its exact rendered pixel —
  triggers the tooltip.
- The feature adds no new persisted data, fetch, transport, core-lift, or
  feature flag beyond what Feature 39 already ships.

## Non-goals

- No edge authoring, editing, or deletion from the tooltip or the canvas —
  that remains Feature 38's `EntityRelationshipsSection.tsx` sidebar surface,
  unchanged.
- No hover tooltip on a node in this slice — a node's name is already
  disclosed via its visible SVG `<text>` label.
- No keyboard-driven disclosure of a tooltip on edge focus — edges do not
  become focusable as part of this feature.
- No claim, in this document, that `HoverTip.tsx`'s `react-tooltip`
  `float` mode — the mechanism decided to try first (OQ-1, resolved) —
  actually positions acceptably against a long diagonal hit-target line, or
  that its `openOnClick` option actually works acceptably on touch (OQ-3,
  resolved); both are named as a spike to run, with a bespoke positioned
  overlay following the `RefHoverPreview.tsx` pattern as the named fallback
  if the spike fails. The attempt order is decided; the outcome is not (see
  Open questions).

## User stories

- US-1: As a novelist, I want to hover an edge in the entity relationship
  graph — or tap it on a touchscreen — and see what it represents (a
  co-occurrence's shared-resource count, or an authored relationship's
  direction and type) so that I can understand the graph without switching
  to the accessible list.

## Functional requirements

FR-1: Hovering the pointer over an edge on `EntityGraphCanvas.tsx` MUST show a tooltip disclosing that edge's kind and content — a co-occurrence edge's shared-resource count text, an authored edge's direction-and-type text. [US-1]

FR-2: The description text an edge's tooltip shows and the description text `EntityGraphAccessibleList.tsx` renders for that same edge (today produced by `describeCooccurrenceEdge` and `describeAuthoredEdge`, both currently defined only in that file) MUST come from one shared module imported by both the accessible list and the canvas's tooltip wiring, so the two texts MUST NOT be authored or maintained as two separate strings that could diverge. [US-1]

FR-3: Since an authored edge's `<line>` renders at a fixed 1.5px stroke and a co-occurrence edge's at a log-scaled width via `cooccurrenceStrokeWidth` (`EntityGraphCanvas.tsx`), both too thin to reliably hover, the canvas MUST add a wider, transparent hit-target line per edge that triggers the same tooltip as the visible line it overlays, regardless of which tooltip rendering mechanism is ultimately chosen (see OQ-1). [US-1]

FR-4: The tooltip mechanism MUST reuse this codebase's existing tooltip tooling — `react-tooltip` via `HoverTip.tsx`'s `hoverTipProps`/`HoverTipSurface`, already used by `WorkArea/ViewSwitcher.tsx`, `preferences/TimelineViewToggle.tsx`, and `preferences/ProjectFeatureToggles.tsx` — specifically its `float` mode (anchoring the tooltip to the live pointer position rather than the anchor element's bounding box), rather than a native SVG `<title>` element or a new tooltip dependency, unless OQ-1 concludes that mechanism cannot position acceptably against an edge's hit-target line. [US-1]

FR-5: On a touch input device (including native Android, per ADR-021, and a touch-primary desktop browser), tapping an edge's hit-target MUST show that edge's tooltip, and a second tap on the same hit-target or a tap elsewhere MUST dismiss it. This applies only to an edge's hit-target: it introduces no tap behavior of its own on a node, which keeps its existing activate-to-navigate tap behavior unchanged. The candidate mechanism is `react-tooltip`'s `openOnClick` option, tried in the same spike as FR-4's `float` mode (see OQ-3); if that spike concludes the mechanism does not work acceptably on touch, the same bespoke fallback FR-4 names applies here too. [US-1]

FR-6: This feature MUST introduce no new fetch, transport, core-lift, or persisted data of its own — every edge's tooltip content MUST be read from the same `positioned.edge` object (`relationshipType` for an authored edge, `sharedResourceCount` for a co-occurrence edge) the canvas already holds for rendering that edge. [US-1]

FR-7: This feature MUST introduce no new per-project feature flag; the tooltip rides the existing `entities` flag Feature 39 already rides. [US-1]

FR-8: A node MUST NOT gain a hover tooltip as part of this feature — a node's name remains disclosed only via its existing visible SVG `<text>` label, unchanged by this spec. [US-1]

FR-9: An edge MUST NOT become keyboard-focusable, and MUST NOT show a tooltip on keyboard focus, as part of this feature. The synchronized accessible list (`EntityGraphAccessibleList.tsx`) remains the sole keyboard and screen-reader surface for the same edge text this tooltip discloses on hover or tap, per Feature 39's own OQ-4 rejection of keyboard graph traversal. [US-1]

FR-10: The tooltip MUST be drawn beside the pointer, fully inside the viewport, at whichever of the four diagonal positions around the pointer covers the least area of the hovered edge's own two endpoint nodes, preferring above-right — the original placement — when positions tie. It MUST wrap to the same width bound as the app's shared tooltip, `min(260px, calc(100vw - 24px))`, rather than extending on one line. Other nodes are not avoided: at the densities measured, most placements cover some node, and the endpoints are the nodes a reader inspecting the edge is looking at (see OQ-4). [US-1]

## Open questions

- OQ-1 (resolved: attempt order, not outcome). `react-tooltip`'s `float`
  mode — which anchors the tooltip to the live pointer position rather than
  the anchor element's bounding box — is the mechanism to try FIRST. It is
  available in the pinned version already in the tree, verified at
  `frontend/node_modules/react-tooltip/dist/react-tooltip.d.ts:133`
  (`float?: boolean`) and `:204` (`data-tooltip-float?: boolean`), so it
  requires no new dependency and stays within `HoverTip.tsx`'s existing
  tooling, though `hoverTipProps`/`HoverTipSurface` will need extending to
  pass it. The reason `float` is tried first, source-verified rather than
  asserted: `react-tooltip`'s default (non-float) placement is computed by
  `@floating-ui/dom` from the anchor DOM node's own
  `getBoundingClientRect()`, and for an SVG `<line>` that rect is the
  axis-aligned box spanning both endpoints — for a long diagonal edge, a box
  largely empty relative to the line's actual pixels. That is the mechanism,
  not a claim that default mode looks unacceptable; whether it actually does
  is exactly what the spike measures. A bespoke positioned overlay following
  the `RefHoverPreview.tsx` pattern is the FALLBACK, used only if `float`
  mode fails the spike. Trying both, and touch's `openOnClick` (OQ-3), is one
  spike, not run by this spec. — Impact: FR-3, FR-4, FR-5.
- OQ-2 (resolved: a fixed hit-target stroke width, chosen by measurement).
  Not a runtime-adaptive width — a single fixed number, but one chosen by
  measurement rather than assertion. The measurement that picks it: run
  `computeGraphLayout` at several representative densities (sparse, ~5
  nodes/5 edges; medium, ~15 nodes/20 edges; and an adversarial case with
  several nodes sharing multiple co-occurrence and authored edges), compute
  the minimum distance between distinct edges' line segments at each
  settled layout, and choose a fixed width that stays comfortably under half
  the smallest measured gap across all tested densities. This spec records
  the method, not a number — no measurement has been run yet. — Impact:
  FR-3.
- OQ-3 (resolved: touch is in scope). A tap on an edge's hit-target shows
  the tooltip; a second tap, or a tap elsewhere, dismisses it (FR-5).
  Rationale: an edge currently has no click behavior of its own — only
  nodes are clickable, via `EntityGraphCanvas.tsx`'s node activation — so a
  tap on an edge is unambiguous and does not collide with the node
  click-to-select gesture. `react-tooltip`'s `openOnClick` option is the
  candidate mechanism, tried in the same spike as OQ-1 since it is the same
  wiring; whether it works acceptably on touch is untested and belongs to
  that spike, not asserted here. This decision matters because the graph
  view is already reachable on native Android today:
  `frontend/scripts/build-native-static.mjs:71-74` excludes only `api`,
  `login`, `reset-password`, and `verify-email` from the native export — no
  Work Area view is excluded. — Impact: FR-1, FR-4, FR-5.

- OQ-4 (resolved 2026-09-10, post-ship amendment: tooltip placement). The
  shipped tooltip sat at a fixed offset above-right of the pointer, on one
  line, with no bound to the viewport. Measured in a browser — 37 hovers
  across 10 of the 11 edges of a six-entity project, at five points along
  each edge — it covered one of the hovered edge's own two endpoint nodes in
  54% of hovers and some node in 84%. Those figures were identical at
  1280×800 and 411×850, because placement is relative to the pointer and so
  does not depend on screen size. It ran off the right edge in none of the
  desktop hovers and all of the phone hovers, being 291–357px wide. The
  first spike's pass criterion, "without covering the inspected node", had
  been applied to `react-tooltip`'s `float` mode but never to the bespoke
  overlay that shipped. Decided: avoid only the hovered edge's endpoint
  nodes, not every node; when no position avoids them, take the least
  overlap; and wrap to the shared tooltip's width cap at every screen size,
  so desktop tooltips that previously ran up to 357px on one line now wrap
  at 260px. Returning to the shared `react-tooltip` was considered and
  rejected for this problem: its placement flips away from viewport edges
  only and has no notion of nodes, so it would fix the clipping but not the
  covering. — Impact: FR-10.

## Out of scope (deferred)

- Any edge authoring, editing, or removal — stays Feature 38's sidebar
  surface, unchanged by this feature.
- A hover tooltip on a node — a deliberate exclusion of this slice; a node's
  name is already visible as SVG `<text>` and is not part of this
  feature's scope.
- Keyboard-driven tooltip disclosure on edge focus, and making an edge
  focusable at all — a deliberately unmet keyboard-parity affordance,
  recorded per `docs/standards/accessibility.md` §7 rather than silently
  skipped. The parity story: nothing this tooltip discloses on hover is
  unavailable to keyboard or screen-reader use — the synchronized accessible
  list (`EntityGraphAccessibleList.tsx`) already carries the identical edge
  text — but it is available through that separate, already-shipped surface,
  not through this tooltip itself.
- A new per-project feature flag — this feature rides the existing
  `entities` flag Feature 39 already rides.
- Any new persisted data, fetch, transport, or core-lift — this feature is a
  pure presentational read of data the canvas already holds.
- Asserting the outcome of the OQ-1 spike (whether `float` mode actually
  positions acceptably against a hit-target line, or whether the
  `RefHoverPreview.tsx` fallback is needed) or the OQ-2 hit-target width
  measurement before either is run — the attempt order and the measurement
  method are decided (FR-4, FR-5); their results are not, and belong to the
  task breakdown.
