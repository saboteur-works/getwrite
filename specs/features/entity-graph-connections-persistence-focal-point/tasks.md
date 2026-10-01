# Tasks: Relationship-driven entity graph — customizable connections, position persistence, and focal-point selection

Source spec: `specs/features/entity-graph-connections-persistence-focal-point.md`
(Feature 68; schema `sab.feature-spec/1`, all 22 FRs resolved).

Granularity: story points (1/2/3/5/8).

## Task-level judgment calls (flagged for Gate 4)

- **Hop-radius persistence.** FR-21 only requires the hop radius be "a
  numeric settings field, writer-adjustable, in the same settings surface as
  the connection-type toggles" — it does not explicitly say whether that
  value is persisted per project or kept as local-only UI state. Task 1
  treats it as persisted (`config.entityGraphFocalHopRadius`, same file/shape
  pattern as `entityGraphConnectionTypes`), on the reasoning that a value
  reset every session would contradict the feature's own "keep the graph
  arranged the way they left it" framing. This is a judgment call, not a
  spec requirement — worth confirming before implementation starts.
- **Default hop count (OQ-1):** Task 1 sets the default to `1`. Per the
  spec's own resolution text, this is a starting value to adjust based on how
  it reads once built, not a hard product requirement.
- **Modifier-gesture hint affordance (OQ-9):** Task 15 implements a small
  icon that appears on node hover near the node circle as the first-pass
  discoverability treatment. This is an implementation choice, explicitly
  not a final design decision — the spec notes a separately-pipelined
  "Graph visual system" feature may revisit the graph's visual treatment
  broadly, including this.

## Tasks

### Task 1: Project config schema — connection-type list and hop-radius field
**What:** Adds `entityGraphConnectionTypes: string[]` (optional, default
`["authored", "cooccurrence"]` when absent) and `entityGraphFocalHopRadius:
number` (optional, default `1`, see judgment call above) to
`ProjectConfigSchema`, plus a small shared module exporting the five valid
connection-type keys (`authored`, `cooccurrence`, `backlinks`,
`proximityMentions`, `sharedMetadata`), the default list constant, and a
`filterToKnownConnectionTypes()` helper that drops any unrecognized key
rather than erroring (FR-2).
**Files:** `frontend/src/lib/models/schemas.ts`, new
`frontend/src/lib/models/entity-graph-connection-types.ts` (constants +
helper, mirroring `default-relationship-types.ts`'s shape).
**Done when:** `ProjectConfigSchema` accepts both new optional fields; a
project with neither field set behaves exactly as Feature 39 shipped it
(default list resolves to `["authored", "cooccurrence"]`); a unit test
confirms `filterToKnownConnectionTypes` drops an unrecognized key without
throwing.
**Depends on:** none
**Estimate:** 2
**Done:** [x]

### Task 2: Backlink edge derivation
**What:** Adds `getEntityBacklinkEdges` to `backlinks.ts` — for every
explicit backlink between a resource associated with one declared entity and
a resource associated with another, produces one edge between those two
entities (FR-3).
**Files:** `frontend/src/lib/models/backlinks.ts`, its test file.
**Done when:** `getEntityBacklinkEdges` is exported from `backlinks.ts` (no
new module), reads from the existing `backlinks.json` data only, and a unit
test covers: two entities whose resources backlink to each other produce one
edge; entities with no backlinked resource produce none; a backlink between
two resources neither of which belongs to a declared entity is ignored.
**Depends on:** none
**Estimate:** 3
**Done:** [x]

### Task 3: Proximity-mentions edge derivation
**What:** Adds a new exported function to `mentions-core.ts` (alongside
`getEntityCooccurrence`) that produces a weighted edge between two entities
for every resource where both are mentioned, weighted by the average
character-offset distance across all mention pairs for that entity-pair in
that resource — not nearest-pair-only (FR-4, OQ-5).
**Files:** `frontend/src/lib/models/mentions-core.ts`, its test file.
**Done when:** the function reads the mention index's stored per-mention
offsets (`mention-index.ts`), computes the averaged-distance weight exactly
as FR-4/OQ-5 describe, and a unit test covers: two mentions close together
producing a stronger (numerically distinguishable) weight than two mentions
far apart; multiple mention pairs in one resource averaged rather than only
the nearest pair used; two entities not mentioned in any common resource
produce no edge.
**Depends on:** none
**Estimate:** 5
**Done:** [x]

### Task 4: Shared-metadata edge derivation
**What:** New module `entity-shared-metadata.ts` that reads both `tags.ts`
and `metadata-schema.ts` and produces an edge between two entities sharing
at least one tag or one identical value of the same custom metadata field,
with no minimum-overlap threshold (FR-5, OQ-6).
**Files:** new `frontend/src/lib/models/entity-shared-metadata.ts`, its test
file.
**Done when:** the module exports a function (e.g.
`getEntitySharedMetadataEdges`) producing exactly one edge per entity pair
sharing a tag or a custom-field value (no dedup threshold), with unit tests
covering: a single shared tag produces an edge; a single shared custom-field
value produces an edge; entities sharing nothing produce no edge; neither
`tags.ts` nor `metadata-schema.ts` is modified to know about the other's
domain.
**Depends on:** none
**Estimate:** 5
**Done:** [x]

### Task 5: Edge description functions for the three new edge kinds
**What:** Adds `describeBacklinkEdge`, `describeProximityMentionEdge`, and
`describeSharedMetadataEdge` to `edgeDescriptions.ts`, following the same
pattern `describeCooccurrenceEdge`/`describeAuthoredEdge` already establish
— `nameById` always the first argument — so the canvas tooltip and the
accessible list read from the identical source for the new kinds too
(FR-6).
**Files:**
`frontend/components/WorkArea/Views/EntityRelationshipGraphView/edgeDescriptions.ts`,
its test file.
**Done when:** all three new description functions exist, are covered by
unit tests, and produce distinct, legible text for each new edge kind
(including the proximity weight and the shared tag/field in their
descriptions).
**Depends on:** Tasks 2, 3, 4 (needs each new edge's data shape to describe)
**Estimate:** 3
**Done:** [x]

### Task 6: Entity-graph settings transport (connection types + hop radius)
**What:** A new `createTransport`-backed module exposing read/write for a
project's `entityGraphConnectionTypes` and `entityGraphFocalHopRadius`
(FR-7, FR-8, FR-21), with its own native backend, web-stub, HTTP route, and
HTTP response schema validation, mirroring the `word-count-goal-core.ts` /
`setWordCountGoalCore` read-modify-write pattern and the
`createTransport`/native-backend/web-stub triad every other new transport in
this codebase follows.
**Files:** new `frontend/src/lib/models/entity-graph-settings-core.ts`
(transport-agnostic core), new
`frontend/app/api/project/entity-graph-settings/route.ts` (GET/PUT), new
`frontend/src/lib/api/entity-graph-settings.ts` (`createTransport`-collapsed
client module), new
`frontend/src/store/transport/native-entity-graph-settings-backend.ts` +
`.web-stub.ts`, new response schema in `frontend/src/lib/api/schemas.ts`.
**Done when:** a project's connection-type list and hop radius can be read
and written through the new module on both HTTP and native paths; the HTTP
transport's response body is validated via
`reportTransportValidationFailure` per `docs/standards/security.md`; the
native backend is covered by a native/web parity test mirroring
`entity-relationships-native-web-parity.test.ts`; writing an unrecognized
connection-type key is rejected or filtered consistently with Task 1's
`filterToKnownConnectionTypes`.
**Depends on:** Task 1
**Estimate:** 5
**Done:** [x]

### Task 7: Graph data assembly — wire in the new edge kinds
**What:** Extends `EntityRelationshipGraphView.tsx`'s `EntityGraphEdge`
union with the three new edge kinds, fetches the project's active
connection-type list via Task 6's transport, and calls each of Task 2/3/4's
derivation functions only when its corresponding type is active —
unrecognized keys already filtered per Task 1 — so `graphData.edges` always
reflects exactly the active set (FR-1, FR-2).
**Files:**
`frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView.tsx`,
its test file.
**Done when:** `graphData.edges` includes backlink/proximity-mention/shared-
metadata edges only when each respective type is in the active list; toggling
a type off and re-rendering drops that edge kind from `graphData` without a
new fetch of unrelated data; a project with no explicit
`entityGraphConnectionTypes` still renders exactly `authored` +
`cooccurrence` edges, matching Feature 39's prior behavior.
**Depends on:** Tasks 1, 2, 3, 4, 6
**Estimate:** 5
**Done:** [x]

### Task 8: Canvas visual encoding for up to five simultaneous edge kinds
**What:** Extends `EntityGraphCanvas.tsx`'s edge rendering so each of the
five possible active kinds stays visually distinguishable by more than
colour alone — extending the existing dashed/undirected vs.
solid/directed distinction — with `proximityMentions`'s weighted edges
using opacity or saturation (not `cooccurrenceStrokeWidth`'s thickness
scale) so the two weighted kinds never look identical (FR-6, OQ-5).
**Files:** `frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx`, its test file.
**Done when:** each of the five edge kinds renders with a distinct
combination of dash pattern, directedness/arrowhead, and
opacity/width/saturation; a test (or documented manual check, per this
component's existing `data-edge-kind` attribute convention) confirms
`proximityMentions` and `cooccurrence` are visually distinguishable at a
glance even when both are active simultaneously; no new use of
`--color-gw-red` is introduced (reserved-red constraint).
**Depends on:** Task 7
**Estimate:** 5
**Done:** [x]

### Task 9: Accessible-list rendering for the three new edge kinds
**What:** Extends `EntityGraphAccessibleList.tsx`'s edge `<ul>` to render an
`<li>` per backlink/proximity-mention/shared-metadata edge using Task 5's
new description functions, so the canvas tooltip and the accessible list
never drift apart for the new kinds either (FR-6).
**Files:**
`frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphAccessibleList.tsx`,
its test file.
**Done when:** every edge in `graphData.edges`, regardless of kind, produces
exactly one accessible-list `<li>` whose text matches the corresponding
Task 5 description function's output; existing authored/cooccurrence
rendering is unchanged.
**Depends on:** Tasks 5, 7
**Estimate:** 3
**Done:** [x]

### Task 10: Connection-type and hop-radius settings panel
**What:** A new panel, reachable from the graph view itself near the
existing reset-view button (not a Project Settings tab, per OQ-3), with a
toggle per connection type (five total) and a numeric field for the
focal-point hop radius (FR-7, FR-21), reading/writing through Task 6's
transport.
**Files:** new
`frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphSettingsPanel.tsx`
+ Storybook story, wired into `EntityRelationshipGraphView.tsx` or
`EntityGraphCanvas.tsx` (whichever already owns the reset-view button's
positioning — confirm against current `EntityGraphCanvas.tsx` button
placement before choosing).
**Done when:** the panel renders all five connection-type toggles plus the
hop-radius numeric field; toggling a type or changing the hop radius persists
via Task 6's transport and is reflected in `graphData` (Task 7) without a
page reload; the panel is keyboard-operable and passes the repo's existing
a11y test conventions.
**Depends on:** Task 6
**Estimate:** 5
**Done:** [x]

### Task 11: Position persistence model
**What:** New model module persisting drag-authored node positions to
`meta/entity-graph-positions.json`, mirroring `entity-relationships.ts`'s
whole-file-load/persist shape (`withMetaLock`-guarded read-modify-write),
holding an array of `{ entityId, x, y, connectionTypesSnapshot, savedAt }`
records keyed by `entityId` (FR-9, FR-10, OQ-7). Includes the FR-11
invalidation check — comparing a record's `connectionTypesSnapshot` to the
project's current active connection-type list as a set (order-insensitive)
— exposed as a pure, independently-testable function.
**Files:** new `frontend/src/lib/models/entity-graph-positions.ts`, its test
file.
**Done when:** `loadEntityGraphPositions`/`saveEntityGraphPosition` (or
equivalent) exist, follow the `withMetaLock` read-modify-write pattern,
validate via a Zod schema at both read and write (boundary-validation
floor); a pure `isPositionInvalidated(record, activeTypes)` function returns
`false` for a mere reordering of the same active types and `true` only when
the active set has actually changed (added or removed a type), covered by
unit tests for both cases; a missing file returns `[]` rather than throwing
(ENOENT tolerance, matching `loadEntityRelationships`).
**Depends on:** Task 1
**Estimate:** 5
**Done:** [x]

### Task 12: Position persistence transport
**What:** `createTransport`-backed read/write for
`meta/entity-graph-positions.json`, with its own native backend, web-stub,
HTTP route, and HTTP response schema validation (FR-14).
**Files:** new
`frontend/app/api/project/entity-graph-positions/route.ts` (GET for load,
PUT/POST for a single position write), new
`frontend/src/lib/api/entity-graph-positions.ts`
(`createTransport`-collapsed client module), new
`frontend/src/store/transport/native-entity-graph-positions-backend.ts` +
`.web-stub.ts`, new response schema in `frontend/src/lib/api/schemas.ts`.
**Done when:** a position record can be read and written through the new
module on both HTTP and native paths; the HTTP transport's response body is
validated via `reportTransportValidationFailure`; native/web parity is
covered by a test mirroring the existing
`*-native-web-parity.test.ts` precedent.
**Depends on:** Task 11
**Estimate:** 5
**Done:** [x]

### Task 13: Canvas wiring — read persisted position at mount, write on drag end
**What:** `EntityGraphCanvas.tsx` seeds `nodePositionOverrides` at mount from
any persisted, non-invalidated position record (via Task 12's transport and
Task 11's invalidation check against the currently active connection-type
list from Task 7), instead of starting every session with an empty override
map; a drag continues to update the live override during the gesture
unchanged (Feature 41), and additionally persists the released position once
the drag ends (FR-13).
**Files:**
`frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx`,
`EntityRelationshipGraphView.tsx` (passes the active connection-type list and
persisted positions down), their test files.
**Done when:** on mount, a node with a valid persisted position renders at
that position rather than at `computeGraphLayout`'s fresh simulation result;
a node with an invalidated position (active connection-type set changed
since it was saved) renders at a freshly computed position instead; ending a
drag gesture writes exactly one position record for that node via Task 12's
transport; a reload (simulated in tests by remounting with the same
persisted data) reproduces the dragged position.
**Depends on:** Tasks 12, 7
**Estimate:** 5
**Done:** [x]

### Task 14: Drop position record on entity removal
**What:** When an entity is deleted or un-declared (Feature 42's
`RemoveEntityControl.tsx` flow / `removeEntityRelationshipsForEntity`
precedent), its position record is silently dropped from
`meta/entity-graph-positions.json`, with no new confirmation step added to
the existing `ConfirmDialog` removal flow (FR-12).
**Files:** `frontend/components/Sidebar/RemoveEntityControl.tsx` (or the
server-side sidecar-clear path it calls through), new
`removeEntityGraphPositionForEntity` export on
`frontend/src/lib/models/entity-graph-positions.ts` (Task 11).
**Done when:** removing an entity's declaration also removes any position
record naming that `entityId` from `meta/entity-graph-positions.json`, with
no new dialog step, no new confirmation checkbox, and no change to
`RemoveEntityControl.tsx`'s existing relationship-edge-removal opt-in
checkbox behavior; covered by a test that an entity with a saved position,
once removed, has no surviving position record.
**Depends on:** Task 11
**Estimate:** 2
**Done:** [x]

### Task 15: Focal-point state, selection gesture, and hint affordance
**What:** Adds focal-point selection as component state in
`EntityGraphCanvas.tsx`, distinct from `selectedNodeId` — a modifier gesture
(shift-click on desktop, long-press on touch) sets the focal point, a plain
click continues to select-and-navigate exactly as today (FR-15); setting a
new focal point centers/pans the camera on it via the existing `pan`/`scale`
state with no separate camera-only mode (FR-16); reassigning the focal point
to a different node works without first clearing the previous one (FR-18);
a dedicated action clears the focal point entirely (FR-19). Also adds a
visible hint affordance for the modifier gesture — a small icon on node
hover, per this task's own first-pass choice (OQ-9; see judgment call note
above).
**Files:**
`frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx`,
its test file.
**Done when:** a shift-click (desktop) or long-press (touch, using the
existing Pointer Events wiring) sets `focalEntityId` without altering
`selectedNodeId`'s existing plain-click behavior; setting a focal point
updates `pan`/`scale` to center that node; a second focal-point gesture on a
different node reassigns without requiring a clear step first; a clear
action (exposed for Task 17's accessible-list header control to call)
resets `focalEntityId` to `null`; a hover-visible hint icon appears near a
node on pointer hover, confirmed by a test asserting its presence/absence on
hover state change.
**Depends on:** Task 7
**Estimate:** 5
**Done:** [x]

### Task 16: Hop-radius BFS computation and dim/hide rendering
**What:** Given an active `focalEntityId` and the hop-radius value from Task
10's settings panel (default `1`, per the judgment call above), computes
each node's shortest-path hop distance via standard full-graph BFS over
whichever connection types are currently active (no special-casing for
nodes beyond the radius — FR-17, OQ-2), and dims or hides every node/edge
outside that radius on the canvas only.
**Files:**
`frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx`
(or a new pure helper module, e.g. `entityGraphHopDistance.ts`, for the BFS
itself so it's independently unit-testable), test file(s).
**Done when:** a pure BFS helper function returns correct hop distances for
a graph fixture, including nodes unreachable from the focal point (treated
as outside any finite radius); the canvas visually de-emphasizes (dims or
hides — implementer's choice, documented in the component) every
node/edge whose hop distance exceeds the configured radius, while a node
within radius renders at full opacity; clearing the focal point (Task 15)
restores full, unemphasized rendering; changing the hop-radius setting
(Task 10) immediately changes which nodes are emphasized without requiring
a focal-point reselection.
**Depends on:** Tasks 15, 10
**Estimate:** 5
**Done:** [x]

### Task 17: Accessible-list focal-point controls and hop-radius disclosure
**What:** Adds a "Set as focal point" control per node (alongside its
existing activation control) and a "Clear focal point" control in the
accessible list's own header (FR-22, OQ-11); reflects which node currently
holds the focal-point role and which nodes/edges are within versus outside
the active hop radius in a screen-reader-perceivable form (FR-20); a
hop-hidden node on the canvas remains fully reachable and activatable via
the accessible list regardless of its canvas visual state (FR-20, OQ-10).
**Files:**
`frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphAccessibleList.tsx`,
its test file.
**Done when:** every node `<li>` gains a second button, "Set as focal
point", that calls a handler distinct from the existing activation handler;
a header-level "Clear focal point" button exists and is disabled or absent
when no focal point is set (implementer's choice, documented); the current
focal point and each node's inside/outside-radius status are disclosed as
text (e.g. an `aria-label` suffix or adjacent text, not conveyed by styling
alone); a test confirms a node marked hop-hidden on the canvas still fires
`onNodeActivated` when its accessible-list activation button is used.
**Depends on:** Tasks 15, 16
**Estimate:** 5
**Done:** [x]

### Task 18: End-to-end verification pass
**What:** A manual (or Playwright E2E, following this repo's existing
`e2e/` Storybook-driven convention) verification pass exercising all three
sub-features together on one project: toggling connection types changes
drawn edges live; a dragged position survives a simulated reload and resets
only when the active type set changes; selecting, reassigning, and clearing
a focal point behaves per FR-15–FR-22 on both canvas and accessible list.
**Files:** new or extended `frontend/e2e/` spec, or a documented manual
verification note under
`specs/features/entity-graph-connections-persistence-focal-point/` (mirroring
`entity-graph-node-dragging/manual-verification.md`'s precedent) if E2E
coverage proves impractical for drag/long-press gestures.
**Done when:** all three sub-features are confirmed working together in one
pass, not just individually; any gesture that could not be driven
automatically (e.g. a true touch long-press) is explicitly called out with
the manual check performed in its place, following the
`entity-graph-node-dragging` feature's own documented precedent.
**Depends on:** Tasks 8, 9, 10, 13, 14, 17
**Estimate:** 3
**Done:** [x]

## Summary

- Total tasks: 18
- Total estimated effort: 76 points
- Critical path: Task 1 → Task 2 (or 3/4, run in parallel) → Task 5 → Task 7
  → Task 15 → Task 16 → Task 17 → Task 18. (Tasks 6/10, 11/12/13/14, and
  2/3/4 each form their own shorter branches that merge back into Task 7 or
  Task 18 — the chain above is the longest, not the only, path.)
- Risks:
  - Task 3 (proximity-mentions weighting) and Task 4 (shared-metadata, new
    module spanning two existing domains) carry the most derivation-logic
    uncertainty of the five connection types — budgeted at 5 points each,
    but the averaged-distance formula (Task 3) and the no-threshold shared-
    metadata join (Task 4) are both new computations with no existing
    precedent in this codebase to copy.
  - Tasks 15–17 (focal point) depend on a touch long-press gesture that, per
    this codebase's own `entity-graph-node-dragging` precedent, has shown
    device-specific behavior differences (Pixel 7 Pro touch handling needed
    a non-passive `touchmove` listener the desktop-only testing missed) —
    manual device verification is likely necessary beyond what Task 18's
    automated pass can cover.
  - Task 10's exact placement relative to the existing reset-view button is
    left for implementation to confirm against the current
    `EntityGraphCanvas.tsx` layout; this is a small risk, not a blocker.
  - The hop-radius persistence judgment call (see note above) should be
    confirmed before Task 1/6/10 are implemented, since reversing it later
    would touch the schema, the settings transport, and the settings panel
    all three.
