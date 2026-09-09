# Feature: Entity graph node dragging

## Overview

Feature 39 shipped the entity relationship graph, whose node positions are
computed once per render by `computeGraphLayout`'s fixed-tick `d3-force`
simulation and cannot be adjusted by the writer looking at them. A novelist
who finds two nodes overlapping, or wants to pull a node toward the part of
the canvas they are focused on, is stuck with whatever position the
simulation happened to settle on. This feature adds a pointer-drag gesture
on a node in `EntityGraphCanvas.tsx` that repositions only that node,
resolving its (and its touching edges') coordinates from a live position
override at render time rather than from the simulation's fixed output. It
is a presentational refinement on top of Feature 39's shipped graph, not a
new data source or a change to what the graph reads: no entity data,
co-occurrence value, or authored relationship is read or written by a drag.

## Goals

- A novelist can press on a node in the entity relationship graph, drag the
  pointer, and see that node — and every edge attached to it — follow the
  pointer in real time, up to the moment the pointer is released.
- A drag that starts and ends on the same node without crossing the
  click/drag threshold still activates that node exactly as a plain click
  does today (toggling its selection ring and calling `onNodeActivated`).
- A drag that moves the pointer past the click/drag threshold and releases
  on or off a node does NOT call `onNodeActivated` and does NOT navigate the
  writer away from the graph.
- Dragging introduces no persisted state, no new fetch, transport, or
  feature flag, and does not change `computeGraphLayout`'s existing pure,
  deterministic, fixed-300-tick contract.

## Non-goals

- No live force simulation during or after a drag — neighbouring nodes do
  not respond, and edges stretch rather than the layout relaxing around the
  new position (settled, not reopened here; see product spec OQ-4).
- No persistence of a dragged position anywhere — not `localStorage`, a
  sidecar, project config, or any API — and no survival across a reload or
  a view switch (settled, not reopened here; see product spec OQ-5).
- No bounds constraint on a drag — a node may be dragged outside the
  visible viewBox, and nothing clamps it back in (settled, not reopened
  here; see resolved OQ-3). It is not lost: the accessible list still
  lists it and the canvas's existing pan still reaches it.
- No keyboard-operable equivalent for dragging at this ship (see Out of
  scope).
- No change to `computeGraphLayout`'s existing seeding, simulation, or tick
  count, and no new dependency — `d3-force` is already installed and its
  role (computing the initial static layout) is unchanged by this feature.
- No change to any entity data, co-occurrence value, or authored
  relationship — this feature is view-layer only, exactly as Feature 39's
  own read-only guarantee already requires.
- No new per-project feature flag — this feature rides the existing
  `entities` flag Feature 39 already rides.

## User stories

- US-1: As a novelist, I want to drag a node on the entity relationship
  graph to a clearer spot on the canvas, so that I can see overlapping or
  crowded entities apart from one another without losing anything else the
  graph shows me.

## Functional requirements

FR-1: A pointer-down on a node's `<g>` in `EntityGraphCanvas.tsx`, followed by pointer movement past the click/drag threshold (see OQ-1) and a pointer-up, MUST reposition that node to follow the pointer for the duration of the gesture. [US-1]

FR-2: A dragged node's new position MUST be tracked in a live position override, read at render time, rather than written into `computeGraphLayout`'s memoized `PositionedNode`/`PositionedEdge` output; `computeGraphLayout` itself MUST remain unchanged — the same pure function, over the same fixed-300-tick, stopped-simulation contract it has today. [US-1]

FR-3: Every edge whose `PositionedEdge` touches a dragged node (as `edgeEndpoints` already identifies for that node) MUST resolve that endpoint's coordinates from the live position override at render time, so the edge visibly follows the dragged node; an edge's other endpoint, if not itself dragged, MUST continue to resolve from `computeGraphLayout`'s fixed output unchanged. [US-1]

FR-4: A drag gesture MUST NOT drive `d3-force`'s simulation, and MUST NOT cause any node other than the one being dragged to move; edges attached to the dragged node MUST stretch to follow it rather than the layout relaxing around the new position. [US-1]

FR-5: A pointer gesture on a node that begins and ends without pointer movement exceeding the click/drag threshold MUST behave exactly as today's plain click does — toggling that node's `selectedNodeId` and calling `onNodeActivated` — and MUST NOT be treated as a drag. [US-1]

FR-6: A pointer gesture on a node whose movement exceeds the click/drag threshold before release MUST be treated as a drag: releasing the pointer, whether on or off that node, MUST NOT toggle `selectedNodeId` and MUST NOT call `onNodeActivated`, so a drag never also fires the navigation a plain click on that node fires today. [US-1]

FR-7: The click/drag threshold (see resolved OQ-1) MUST be defined as a single named constant, not inlined at its use site, so tuning it is a one-line change; its initial value MUST be recorded as an unverified starting point, not asserted as correct. This threshold MUST be compared against pointer movement measured in client pixels — before any conversion to viewBox units — because the gesture it discriminates is physical hand movement, which is screen-space: a viewBox-unit threshold would change how far the writer must physically move the pointer depending on the canvas's current `scale`, requiring less movement zoomed in and more zoomed out, so the same hand gesture would be classified differently at different zoom levels. Separately, drag coordinate math — converting a client-pixel pointer delta into a viewBox-unit position delta once a drag is underway — MUST follow the same conversion the existing wheel/zoom handler in `EntityGraphCanvas.tsx` already derives: reading `svgRef.current.getBoundingClientRect()`, falling back to a 1:1 ratio when the element is zero-sized (the case jsdom produces), and accounting for the canvas's current `scale` value so a client-pixel delta maps to the correct viewBox-unit delta at any zoom level. [US-1]

FR-8: This feature MUST introduce no new persisted data: a dragged node's position MUST NOT be written to `localStorage`, a sidecar, project config, or any API, and MUST NOT survive a reload or a view switch. [US-1]

FR-9: This feature MUST introduce no new per-project feature flag; dragging rides the existing `entities` flag Feature 39 already rides. [US-1]

FR-10: This feature MUST NOT read or write any entity data, co-occurrence value, or authored relationship — a drag mutates only ephemeral view-layer position state, consistent with Feature 39's existing read-only guarantee. [US-1]

## Open questions

- OQ-1 (resolved): a single named constant, its starting value unverified, tuned during manual verification. No in-repo or citable library precedent exists for a pointer-distance click/drag threshold: the resource tree's drag-and-drop uses native HTML5 `dragstart`/`drop` events, whose activation distance is a browser/OS-level detail rather than a configurable constant, so a search of this codebase and its dependencies found nothing to inherit — this is a fresh choice. The threshold MUST live in a single named constant, not inlined at its use site, so tuning it is a one-line change; its initial value is recorded as an unverified starting point, not asserted as correct. It is also settled that the threshold is measured in client pixels, before the client-pixel → viewBox-unit conversion FR-7 describes, not in viewBox units: the gesture it discriminates is physical hand movement, which is screen-space, and a viewBox-unit threshold would change how far the writer must physically move the pointer depending on the current zoom `scale` — requiring less movement zoomed in and more zoomed out — so the same hand gesture would be classified differently at different zoom levels. No specific threshold value is claimed correct here; only measurement during manual verification would establish that. — Impact: FR-1, FR-5, FR-6, FR-7.
- OQ-2 (resolved): a stale override for a deleted entity is left un-synced and inert; no explicit purge. Rendering iterates the current `positionedNodes` (derived from the `nodes` prop) and looks up the override per rendered node, never the reverse — so an entry whose entity is gone is simply never looked up again. It cannot render, cannot crash, and cannot be observed. This matches the component's own existing precedent exactly: `selectedNodeId`, `pan`, and `scale` are all plain state that is never reset or revalidated when `nodes` changes (`EntityGraphCanvas.tsx` — `selectedNodeId` is checked per-node in the render loop the same way, and a selection ring for a removed entity simply stops rendering with no cleanup code anywhere). Overrides also survive a re-render caused by changed `nodes`/`edges`, because nothing resets non-memoized state when the layout `useMemo`'s dependencies change. The accepted consequence, stated plainly: the override map can accumulate entries across a long session of drag-then-delete cycles; this is memory hygiene, not correctness, and was judged not worth the extra code. — Impact: FR-2, FR-3.
- OQ-3 (resolved): no bounds constraint. A drag may place a node outside the visible viewBox. `computeGraphLayout` already does not clamp simulated positions to the viewBox — its forces (`forceManyBody`, `forceLink`, `forceCenter`, `forceCollide`) include no rectangular clamp — so unconstrained positions are already the status quo before dragging exists. A node outside the visible area is not lost: `EntityGraphAccessibleList` renders every node and edge from the `nodes`/`edges` props with no coordinate dependency, so it stays listed, activatable, and navigable, and the canvas's existing pan brings it back into view. The obvious alternative — constraining to the static viewBox rectangle — was rejected because that boundary diverges from what the writer can actually see once zoomed or panned, restricting a gesture against a limit the writer cannot see. — Impact: FR-1, FR-7.

## Out of scope (deferred)

- A keyboard-operable equivalent for dragging a node — a deliberate
  exclusion, not an oversight. `docs/standards/accessibility.md` states
  WCAG 2.1 AA as this project's working target; drag-movement keyboard
  alternatives are WCAG 2.2 SC 2.5.7, which is absent from that standards
  file. Feature 39's own graph spec already rejected novel canvas keyboard
  affordances (arrow-key traversal, etc.) as its accessibility mechanism in
  favour of the `sr-only` synchronized accessible list
  (`EntityGraphAccessibleList.tsx`, that spec's own resolved OQ-4), and this
  feature does not reopen that choice. Consequence, stated plainly: a
  keyboard-only writer cannot reposition a node. Their read access to every
  node and edge through the accessible list is unchanged, and no data the
  graph presents is affected by this gap.
- Live force-simulation repositioning, where dragging one node causes
  neighbouring nodes to respond — costed, not dismissed (the installed
  `d3-force@3.0.0` supports `fx`/`fy` position pinning plus
  `restart()`/`alphaTarget()`, and 3 of the 34 tests in
  `frontend/tests/component/EntityGraphCanvas.test.tsx` read rendered
  coordinates), but not adopted for this feature. No claim is made that
  either the static or the live approach looks, feels, or performs better
  than the other — no comparison has been measured.
- Persisting a dragged position in any form — resolved against, not merely
  deferred: positions remain ephemeral, consistent with Feature 39's FR-13
  and its resolved OQ-2.
- Any change to `computeGraphLayout`'s seeding, simulation forces, or tick
  count — this feature adds a position override layer on top of its
  existing output and does not alter the function itself.
- Any change to entity declaration, co-occurrence computation, or authored
  relationship authoring — those remain on their existing surfaces,
  unchanged by this feature.
