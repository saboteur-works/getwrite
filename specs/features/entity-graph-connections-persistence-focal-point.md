# Feature 68: Relationship-driven entity graph — customizable connections, position persistence, and focal-point selection

Note: this spec exceeds the usual word budget. It groups three amendments the
owner explicitly decided to build together (product spec FR-39, FR-40, FR-51;
`specs/product/getwrite.features.md` Feature 68), each touching the same
canvas component and interacting with the other two (switching the
connection model affects what a persisted position must invalidate against;
resolving the connection model unblocked focal-point selection). Splitting
this into three shorter specs would duplicate the same data-layer and
canvas-state context three times and obscure the interaction the grouping
decision exists to capture.

## Overview

The entity relationship graph (Feature 39) today draws exactly two edge
kinds — authored relationships and derived co-occurrence — as permanent,
non-customizable sources, and every node's layout position is recomputed
from scratch on every load (Feature 41's drag is purely ephemeral). This
feature makes the graph's connections customizable (a five-type peer list a
writer can turn on and off per project), makes a dragged node's position
survive a reload instead of resetting every time, and adds a focal-point
selection mode that centers the camera on one entity and visually narrows
the graph to that entity's own neighborhood. Together these turn the graph
from a fixed, always-reset snapshot into a view a writer can tune to their
project's signal and keep arranged the way they left it.

## Goals

- A writer can turn on, per project, any combination of five connection
  types — authored relationships, co-occurrence, backlinks between declared
  entities' resources, proximity-weighted mentions, and shared-tag/metadata
  edges — with authored relationships and co-occurrence on by default and
  the other three off, and every active type stays visually distinguishable
  from every other active type wherever more than one appears on the graph.
- A node a writer has dragged to a new position stays there across a reload
  or a view switch, unless the project's active connection-type list has
  changed since that position was saved, in which case it resets silently to
  a freshly computed position.
- A writer can select one entity node as a focal point and easily reassign
  that role to a different node; doing so centers/pans the camera on it and
  visually emphasizes its neighborhood within a configurable number of
  relationship-hops, dimming or hiding nodes outside that radius.
- A position for an entity later deleted or un-declared (Feature 42) is
  dropped silently, with no new confirmation step added to Feature 42's
  existing removal dialog.

## Non-goals

- Entity-kind-driven color/shape styling or any broader visual-system
  overhaul of the graph — explicitly deferred by the owner to a separate,
  later pipeline round and out of scope here.
- Any change to Feature 38's authored-relationship CRUD surface
  (`EntityRelationshipsSection.tsx`, `entity-relationships.ts`) — this
  feature only reads that data, as the graph always has.
- Any change to the co-occurrence derivation itself
  (`getEntityCooccurrence`, `mentions-core.ts`) beyond gating whether its
  result is drawn — the derivation's own cost model and pair-collapsing
  behavior (Feature 39's OQ-3) are unchanged.
- A keyboard-operable equivalent for dragging a node — unchanged from
  Feature 41's own resolved exclusion; this feature does not reopen it.
- A new per-project feature flag — every piece of this feature rides the
  existing `entities` flag, per FR-39/FR-40/FR-51's explicit text.
- Filtering, search, or grouping controls over the graph beyond the
  connection-type list and focal-point hop filter themselves (e.g. by
  `entityKind` or by minimum co-occurrence count) — remains a deferred
  future refinement per Feature 39's own Out of scope.

## User stories

- US-1: As a novelist, I want to turn on backlink-derived or proximity-based
  connections between my entities, so that the graph reflects signals richer
  than co-occurrence alone when I want them.
- US-2: As a novelist, I want to turn off a connection type I find too
  noisy, so that the graph stays legible for my project.
- US-3: As a novelist, I want to have a node I dragged into a clearer spot
  stay there the next time I open the graph, so that I don't have to
  rearrange it every session.
- US-4: As a novelist, I want to select one character as a focal point and
  see just their immediate connections, so that I can read one character's
  network without the rest of the cast crowding the view.
- US-5: As a novelist, I want to switch the focal point to a different
  character easily, so that I can walk through several characters' networks
  in one sitting without losing my place.

## Functional requirements

### Connection-type list (FR-39 amendment)

FR-1: The product MUST persist one per-project customizable connection-type list governing which edge kinds the graph draws, shaped after `ProjectConfigSchema.relationshipTypes: string[]` (an array of active connection-type keys) rather than a boolean-per-type flag shape — e.g. a new `ProjectConfigSchema.entityGraphConnectionTypes: string[]` field, optional, defaulting to `["authored", "cooccurrence"]` when absent so an existing project with no explicit list behaves exactly as Feature 39 shipped it. [US-1][US-2]

FR-2: The five valid connection-type keys MUST be: `authored` (Feature 38's edges), `cooccurrence` (Feature 37's derivation), `backlinks` (new — see the FR-3 entry below), `proximityMentions` (new — see the FR-4 entry below), and `sharedMetadata` (new — see the FR-5 entry below). An unrecognized key in a persisted list MUST be ignored when building the graph rather than erroring the whole view. [US-1][US-2]

FR-3: When `backlinks` is active, the graph MUST draw an edge between two declared entities' nodes for every explicit backlink (`backlinks.json`, `backlinks.ts`) that exists between a resource associated with one entity and a resource associated with the other, implemented as a new exported function on `backlinks.ts` directly (e.g. `getEntityBacklinkEdges`) rather than a new module — reusing, not duplicating, the existing backlink data; this feature introduces no new backlink-authoring mechanism. [US-1]

FR-4: When `proximityMentions` is active, the graph MUST draw a weighted edge between two entities for every resource in which both are mentioned, implemented as a new exported function on `mentions-core.ts` directly (alongside its existing `getEntityCooccurrence`) rather than a new module, using the mention index's stored per-mention character offsets (`mention-index.ts`) to weight the connection by the averaged character distance across all mention pairs for that entity-pair in the resource (not nearest-pair-only) — closer average mentions producing a stronger connection than mentions far apart on average in the same resource, distinguishing this from `cooccurrence`'s whole-resource granularity, per the product spec's own FR-39 text; its visual encoding is specified by FR-6. [US-1]

FR-5: When `sharedMetadata` is active, the graph MUST draw an edge between two entities that share at least one tag or one identical value of the same custom metadata field, with no minimum-overlap threshold for v1 — any single shared tag or field value suffices to draw an edge, since this type is expected to be the noisiest of the five and ships off by default, and a threshold should be set later from real usage rather than guessed now with nothing to calibrate against — implemented in a new dedicated module (e.g. `entity-shared-metadata.ts`) that reads from both `tags.ts` and `metadata-schema.ts`, since neither existing file should need to know about the other's domain, with no new persisted field. [US-1]

FR-6: Whichever connection types are active at a given moment MUST remain visually distinguishable from one another wherever more than one appears — extending Feature 39's FR-6/FR-7 two-kind distinction (dashed/undirected vs. solid/directed) to as many as five simultaneously active kinds, each distinguished by more than colour alone, consistent with `docs/standards/accessibility.md` §4 and the reserved-red constraint; `proximityMentions`'s weighted edges (FR-4) MUST use a visual encoding dimension distinct from `cooccurrenceStrokeWidth`'s thickness scale (e.g. opacity or saturation), so the two weighted edge kinds never look the same at a glance. The synchronized accessible list (`EntityGraphAccessibleList.tsx`, `edgeDescriptions.ts`) MUST gain a description function for each of the three new edge kinds, following the same pattern `describeCooccurrenceEdge`/`describeAuthoredEdge` already establish, so the canvas tooltip (Feature 40) and the accessible list never drift apart for the new kinds either. [US-1][US-2]

FR-7: The product MUST provide a settings surface where a writer can turn each of the five connection types on or off for the active project, as a panel reachable from the graph view itself, near the existing reset-view button — not a new Project Settings tab. The exact UI treatment of that panel is left to this feature's own task breakdown. [US-1][US-2]

FR-8: Every new connection-type derivation (the FR-3, FR-4, and FR-5 entries above) and the settings read/write (FR-7) MUST be resolved through `createTransport` (ADR-021), each with its own native backend and web-stub, and MUST validate its HTTP response body per the transport-boundary constraint (`docs/standards/security.md`, the FR-50 precedent this product already applies to every new transport). [US-1][US-2]

### Position persistence (FR-40 amendment)

FR-9: A node's drag-authored position (Feature 41) MUST persist to a new sibling file under `meta/`, `meta/entity-graph-positions.json`, mirroring `relationships.json`'s whole-file-load/persist shape (`withMetaLock`-guarded read-modify-write), holding an array of records shaped `{ entityId: string, x: number, y: number, connectionTypesSnapshot: string[], savedAt: string }`, keyed by `entityId`, independent of which connection types happen to be active or visible at the moment it was saved. [US-3]

FR-10: A persisted position record in `meta/entity-graph-positions.json` MUST be pinned by default — exempt from `computeGraphLayout`'s recompute on a later load — except as the FR-11 entry below describes. [US-3]

FR-11: A persisted position record in `meta/entity-graph-positions.json` MUST be invalidated (silently discarded, letting `computeGraphLayout` compute a fresh position for that entity) specifically when the project's active connection-type list (FR-1) has changed since that position was last saved, compared as a SET against that record's own `connectionTypesSnapshot` — order-insensitive, so a mere reordering of the same active types with none added or removed does NOT count as a change and does NOT invalidate the position — and MUST NOT be invalidated for any other reason (e.g. a different entity's position changing, or an edge's weight changing without the active-type set itself changing). [US-3]

FR-12: A persisted position record for an entity later deleted or un-declared (Feature 42, FR-41) MUST be dropped silently from `meta/entity-graph-positions.json` as part of that removal, with no new confirmation step added to Feature 42's existing `ConfirmDialog` removal flow. [US-3]

FR-13: `EntityGraphCanvas.tsx` MUST read a persisted position record from `meta/entity-graph-positions.json`, when one exists and is not invalidated per FR-11, as that node's starting `nodePositionOverrides` entry at mount, rather than starting every session with an empty override map as Feature 41 shipped it; a drag MUST continue to update the live override during the gesture (Feature 41, unchanged) and MUST additionally write the released position, as a record shaped per FR-9, to `meta/entity-graph-positions.json` once the drag ends. [US-3]

FR-14: Position persistence (read and write) against `meta/entity-graph-positions.json` MUST be resolved through `createTransport`, with a native backend and web-stub, and MUST validate its HTTP response body, per the same FR-8/FR-50 constraint. [US-3]

### Focal-point selection (new, FR-51)

FR-15: A writer MUST be able to select a declared entity's node, on either the canvas or the accessible list, as the graph's focal point — a distinct role from, and a materially distinct gesture from, Feature 39's existing `selectedNodeId` click-to-select/navigate: on the canvas, a modifier gesture (shift-click on desktop, long-press on touch) sets the focal point, while a plain click continues to select-and-navigate exactly as it does today, and this modifier gesture MUST be accompanied by a visible hint affordance communicating its existence (e.g. a small icon or indicator on node hover, or a persistent subtle affordance), the exact visual treatment left to this feature's own task breakdown; on the accessible list, FR-22 provides the equivalent control. [US-4]

FR-16: Selecting a focal point MUST center/pan the camera (the existing `pan`/`scale` state) on that node, without a separate camera-only mode a writer must invoke — the camera move is implied by the selection itself, per the product spec's resolved OQ-52. [US-4]

FR-17: Selecting a focal point MUST visually emphasize that node's neighborhood within a configurable number of relationship-hops, that hop distance computed as standard full-graph BFS shortest-path over whichever connection types are currently active (FR-1) with no special-casing for nodes themselves beyond the radius — a node's hop distance is always its true shortest-path distance over the active edge graph — and MUST dim or hide every node and edge outside that hop radius on the canvas only; per FR-20, hop-filter suppression is a canvas-only visual effect and never suppresses accessible-list reachability or activation. [US-4]

FR-18: A writer MUST be able to change which node holds the focal-point role easily — selecting a different entity re-centers the camera and recalculates the hop-radius emphasis for the newly selected entity, without requiring the writer to first explicitly clear the previous focal point. [US-5]

FR-19: A writer MUST be able to clear the focal point entirely, returning the graph to its unemphasized, full-neighborhood display. [US-4][US-5]

FR-20: The accessible list (`EntityGraphAccessibleList.tsx`) MUST reflect the active focal point and its hop-radius emphasis in a form a screen-reader user can perceive — at minimum, which node currently holds the focal-point role and which nodes/edges are within versus outside the active hop radius — consistent with Feature 39's FR-10/FR-11 accessibility floor; a hop-hidden (dimmed/hidden on the canvas) node MUST remain fully reachable and activatable via the accessible list regardless of its visual state on the canvas. The exact list-text treatment is left to this feature's own task breakdown. [US-4][US-5]

FR-21: The focal-point hop radius MUST be exposed as a numeric settings field, writer-adjustable, in the same settings surface as the connection-type toggles (FR-7's panel on the graph view itself, near the reset-view button); the exact default value is left to this feature's own task breakdown, with a recommendation to keep it small (e.g. 1 or 2) since a larger default would show most of the graph and defeat the purpose of focal-point filtering. [US-4][US-5]

FR-22: The accessible list (`EntityGraphAccessibleList.tsx`) MUST provide a dedicated "Set as focal point" control per node, alongside that node's existing activation control, plus a "Clear focal point" control in the accessible list's own header, so a keyboard/screen-reader user can set or clear the focal point independent of whichever gesture FR-15 resolved on for the canvas, with no requirement that the canvas gesture be replicated via keyboard. [US-4][US-5]

## Open questions

- OQ-1 (resolved): What is the default hop count for the focal-point ego-graph filter, and how (if at all) does a writer adjust it — a numeric settings field, a canvas control (e.g. a stepper near the reset-view button), or a fixed, non-adjustable constant? **Resolution:** a numeric settings field in the same settings surface as the connection-type toggles (see OQ-3's resolution), writer-adjustable. **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-17, FR-21 — the exact default value is left to this feature's own task breakdown, with a recommendation to keep it small (e.g. 1 or 2) since a larger default would show most of the graph and defeat the purpose of focal-point filtering; no specific default number is hardcoded in this spec.
- OQ-2 (resolved): When the hop filter hides a node (outside the active radius), does that hidden node's own persisted-but-not-drawn position and edges still count toward another visible node's hop distance, or is hop distance computed only over currently-visible nodes? **Resolution:** hop distance is computed as standard full-graph BFS shortest-path over whichever connection types are currently active (FR-1), with no special-casing for nodes that are themselves beyond the radius — a node's hop distance is its true shortest-path distance over the active edge graph, computed the ordinary way. **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-17.
- OQ-3 (resolved): Where does the FR-7 connection-type settings surface live relative to existing per-project config UI — a new tab in Project Settings alongside "Writing Goals," a panel reachable from the graph view itself (e.g. near the existing reset-view button), or something else? **Resolution:** a panel reachable from the graph view itself, near the existing reset-view button — not a new Project Settings tab. **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-7.
- OQ-4 (resolved): Which module owns each of the three new edge derivations — `backlinks` extending `backlinks.ts` directly, `proximityMentions` extending `mentions-core.ts` (which already reads the mention index's offsets) or living in a new module, and `sharedMetadata` living in a new module versus extending `tags.ts`/`metadata-schema.ts`? **Resolution:** `backlinks` extends `backlinks.ts` directly with a new exported function (e.g. `getEntityBacklinkEdges`); `proximityMentions` extends `mentions-core.ts` directly (alongside its existing `getEntityCooccurrence`); `sharedMetadata` lives in a new dedicated module (e.g. `entity-shared-metadata.ts`) that reads from both `tags.ts` and `metadata-schema.ts`, since neither existing file should need to know about the other's domain. **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-3, FR-4, FR-5, FR-8.
- OQ-5 (resolved): What is `proximityMentions`'s exact weighting formula (e.g. nearest-mention-pair character distance, averaged distance across all mention pairs, or a decay function) and how is that weight encoded visually — reusing `cooccurrenceStrokeWidth`'s log-scaled thickness pattern, or a distinct encoding? **Resolution:** the weighting formula is averaged distance across all mention pairs for that entity-pair in the resource (not nearest-pair-only) — more representative, and the extra computation is trivial at this data scale; the visual encoding is a dimension distinct from `cooccurrenceStrokeWidth`'s thickness scale (e.g. opacity or saturation), specifically because FR-6 requires every active type to remain visually distinguishable from every other active type, and reusing thickness for two different edge kinds risks them looking the same at a glance. **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-4, FR-6.
- OQ-6 (resolved): Does `sharedMetadata` need a minimum-overlap threshold (e.g. at least one shared tag, or at least N shared field values) before an edge is drawn, given the product spec's own characterization of it as "a weaker-tie type possibly opt-in only" — or does any single shared tag or field value suffice? **Resolution:** no minimum-overlap threshold for v1 — any single shared tag or field value suffices to draw an edge; this is expected to be the noisiest of the five connection types, ships off by default, and the threshold should be revisited based on real usage rather than guessing a number now with nothing to calibrate against. **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-5.
- OQ-7 (resolved): Where and in what shape are persisted node positions stored — a new per-project file under `meta/` (mirroring `relationships.json`'s load/persist-whole-file shape), a new field on each entity's own sidecar, or something else — and what exact data (beyond `x`/`y` and the connection-type-list snapshot FR-11's invalidation check needs) does each stored record carry? **Resolution:** a new sibling file under `meta/`, `meta/entity-graph-positions.json`, mirroring `relationships.json`'s whole-file-load/persist shape (`withMetaLock`-guarded read-modify-write), holding an array of records shaped `{ entityId: string, x: number, y: number, connectionTypesSnapshot: string[], savedAt: string }`. **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-9, FR-10, FR-11, FR-13, FR-14.
- OQ-8 (resolved): How is FR-11's "active connection-type list has changed" comparison implemented — a stored snapshot of the list compared value-by-value, a hash/version stamp written alongside each position, or something else — and is a mere reordering of the same active types (no type added or removed) treated as "changed" or not? **Resolution:** a snapshot comparison treating the list as a set (order-insensitive) — the `connectionTypesSnapshot` stored with a position (per OQ-7) is compared to the project's current active connection-type list as sets; a mere reordering of the same active types, with none added or removed, does NOT count as a change and does NOT invalidate the position. **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-11.
- OQ-9 (resolved): Does selecting a focal point reuse Feature 39's existing `selectedNodeId`/click-to-navigate gesture (so clicking a node now both selects-and-navigates and sets the focal point in one action), or is focal-point selection a materially distinct gesture (e.g. a dedicated control) so a writer can still navigate to a node without changing the focal point? **Resolution:** focal-point selection is a materially distinct gesture from the existing click-to-select/navigate — specifically a modifier gesture (shift-click on desktop, long-press on touch) sets the focal point, while a plain click continues to select-and-navigate exactly as it does today, so a writer can still navigate to a node without changing the focal point; this modifier gesture must be accompanied by a visible hint affordance communicating its existence (e.g. a small icon or indicator that appears on node hover, or a persistent subtle affordance) — the exact visual treatment of this hint is left to this feature's own task breakdown, but the requirement that some discoverability hint exists is not optional, given that a modifier gesture with zero visual cue is a known discoverability risk this codebase has no existing precedent for. **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-15, FR-16, FR-18.
- OQ-10 (resolved): Does the dimmed/hidden state the hop filter applies to an out-of-radius node also suppress that node's pointer and keyboard activation (navigate-to-resource), or does a dimmed/hidden node remain separately reachable and activatable via the accessible list even while visually de-emphasized or hidden on the canvas? **Resolution:** a hop-hidden (dimmed/hidden) node remains fully reachable and activatable via the accessible list regardless of its visual state on the canvas — hop-filter suppression is a canvas-only visual effect and never suppresses accessible-list reachability or activation. **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-17, FR-20.
- OQ-11 (resolved): Is there a keyboard-operable way to set or clear the focal point (e.g. a dedicated control with its own accessible name), or does focal-point selection depend entirely on whichever gesture OQ-9 resolves on, with no separate keyboard affordance of its own? **Resolution:** keyboard/screen-reader users get a dedicated "Set as focal point" control per node in the accessible list (`EntityGraphAccessibleList.tsx`), alongside that node's existing activation control, plus a "Clear focal point" control in the accessible list's own header — independent of whichever gesture OQ-9 resolved on for the canvas (i.e. this does NOT depend on replicating the shift-click/long-press gesture via keyboard). **Evidence:** owner decision, Gate 3 triage, 2026-10-01. **Impact:** FR-15, FR-18, FR-19, FR-22.

## Out of scope (deferred)

- Entity-kind-driven color/shape styling or any other part of the separately
  deferred "Graph visual system" work — explicitly out of scope per the
  owner's own scoping decision, not folded into this feature.
- Any change to Feature 38's authored-relationship authoring surface, or to
  the co-occurrence derivation's own cost model (Feature 39's OQ-3).
- A keyboard-operable equivalent for node dragging (Feature 41's own
  resolved exclusion, unchanged here).
- A new per-project feature flag of any kind — every surface in this feature
  rides the existing `entities` flag.
- Filtering, search, or grouping by `entityKind` or by edge strength beyond
  the connection-type list and the focal-point hop filter themselves.
- Live force-simulation repositioning in response to a drag or a focal-point
  change — `computeGraphLayout` remains the same pure, fixed-300-tick,
  stopped-simulation function; only which positions it is allowed to
  override (FR-10/FR-11) changes.
