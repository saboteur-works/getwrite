import * as React from "react";
import { Maximize2, Target } from "lucide-react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type {
  EntityGraphEdge,
  EntityGraphNode,
} from "./EntityRelationshipGraphView";
import {
  describeAuthoredEdge,
  describeBacklinkEdge,
  describeCooccurrenceEdge,
  describeProximityMentionEdge,
  describeSharedMetadataEdge,
} from "./edgeDescriptions";
import { chooseTooltipPlacement } from "./edgeTooltipPlacement";
import { computeHopDistances } from "./entityGraphHopDistance";
import Button from "../../../common/UI/Button";
import EntityGraphSettingsPanel from "./EntityGraphSettingsPanel";
import type { EntityGraphSettings } from "../../../../src/lib/api/entity-graph-settings";
import {
  getEntityGraphPositions,
  saveEntityGraphPosition,
} from "../../../../src/lib/api/entity-graph-positions";
import { isPositionInvalidated } from "../../../../src/lib/models/entity-graph-position-invalidation";
import type { EntityGraphKindStyleRecord } from "../../../../src/lib/api/entity-graph-kind-styles";
import { getEntityKindShapeGeometry } from "./entityKindShapes";
import { getEntityKindFallbackStyle } from "../../../../src/lib/models/entity-kind-fallback-style";
import "./entityGraphTooltipOverlay.css";

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 560;
const NODE_RADIUS = 22;

/**
 * Default focal hop radius (Feature 68, Task 16), used only when the caller
 * omits the `focalHopRadius` prop entirely. Mirrors
 * `entity-graph-settings-core.ts`'s own `DEFAULT_ENTITY_GRAPH_FOCAL_HOP_RADIUS`
 * value (`1`) without importing that server-only module into this client
 * component — `EntityRelationshipGraphView.tsx` is expected to pass the
 * project's actual configured value down once it has fetched it (it already
 * fetches the rest of this project's entity-graph settings in the same
 * effect), so this constant is only ever the pre-fetch/no-project fallback.
 */
const DEFAULT_FOCAL_HOP_RADIUS = 1;

/**
 * Opacity applied to a node or edge that falls outside the focal point's
 * configured hop radius (Feature 68, Task 16). Dimming — not hiding — is the
 * deliberate choice here: an SVG element's `opacity` does not affect pointer
 * events or keyboard focusability, so a dimmed node stays exactly as
 * selectable/activatable/draggable as before, and a dimmed edge's hit-target
 * still shows its tooltip on hover/tap. That matters for two reasons this
 * task's own spec calls out: (1) it keeps the accessible list's reachability
 * fully independent of canvas visual state (FR-20/Task 17 — hop-filter
 * suppression must be canvas-only) without this component needing to do
 * anything special to achieve that, since nothing here touches DOM presence,
 * and (2) hiding would have to also strip interactivity (or leave a
 * confusingly half-interactive "invisible but clickable" element behind),
 * which dimming avoids entirely. Not `0` — a radius-excluded node/edge is
 * still present, just de-emphasized, so a writer can still see roughly how
 * large/connected the rest of the graph is.
 */
const FOCAL_HOP_DIM_OPACITY = 0.15;

/**
 * Fixed number of synchronous `simulation.tick()` calls run before the
 * simulation is read back for rendering. `d3-force`'s own docs describe this
 * as the standard pattern for a static, non-interactive layout: stop the
 * simulation's own timer immediately, then advance it a bounded number of
 * ticks by hand so the settled result is deterministic and does not depend
 * on wall-clock timing (important for tests, and for FR-13's "recomputed
 * from scratch, never persisted" requirement — there is nothing here that
 * could be resumed or cached across renders even if we wanted to).
 */
const SIMULATION_TICKS = 300;

interface SimNode extends EntityGraphNode, SimulationNodeDatum {}

interface SimLink extends SimulationLinkDatum<SimNode> {
  edge: EntityGraphEdge;
  key: string;
}

/** One entity node, positioned by a settled `d3-force` simulation. */
export interface PositionedNode extends EntityGraphNode {
  x: number;
  y: number;
}

/** One edge, positioned by resolving both endpoints' settled coordinates. */
export interface PositionedEdge {
  key: string;
  edge: EntityGraphEdge;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface EntityGraphLayout {
  positionedNodes: PositionedNode[];
  positionedEdges: PositionedEdge[];
}

export interface EntityGraphCanvasProps {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
  /** SVG viewport width in user units. Defaults to 800. */
  width?: number;
  /** SVG viewport height in user units. Defaults to 560. */
  height?: number;
  /** Optional className for the outer `<svg>`. */
  className?: string;
  /**
   * Invoked when a node is activated — pointer click, or Enter/Space while
   * that node's `<g>` has keyboard focus (FR-9). Called with that node's
   * `entityId`. Activation and selection coexist: the same gesture both
   * toggles the node's selection ring and fires this callback, mirroring how
   * a roster row's click both is the row and its only interaction.
   */
  onNodeActivated?: (entityId: string) => void;
  /**
   * Server-validated id of the active project (directory basename). Used to
   * render the connection-type/hop-radius settings panel (Feature 68, Task
   * 10) and, as of Task 13, to read/write Task 12's persisted node-position
   * transport — never passed on to `computeGraphLayout` itself. When
   * omitted, no settings toggle is rendered and no position fetch/save is
   * ever attempted (e.g. in a test or Storybook context with no real
   * project) — the component behaves exactly as it did before Task 13. As of
   * Task 13, `EntityRelationshipGraphView.tsx` passes this prop down (it
   * previously did not — see that task's handback report for the gap this
   * closed).
   */
  projectId?: string;
  /**
   * The project's currently active entity-graph connection-type list,
   * filtered to known keys (Feature 68, Task 13, FR-9/FR-11). Used only to
   * (a) snapshot onto a newly drag-saved position record
   * (`connectionTypesSnapshot`) and (b) decide whether an already-persisted
   * position has been invalidated by a change to this list since it was
   * saved (`isPositionInvalidated`) — never consulted for edge filtering,
   * which is `EntityRelationshipGraphView.tsx`'s own concern. Defaults to an
   * empty list when omitted, matching "no connection types known" rather
   * than guessing a default. Compared by content (a joined-string key), not
   * array identity, so a caller that re-creates this array on every render
   * does not retrigger the position fetch below.
   */
  activeConnectionTypes?: string[];
  /**
   * The id of the entity currently acting as the graph's focal point
   * (Feature 68, Task 15/16/17, FR-15/FR-16/FR-18/FR-19), or `null` for "no
   * focal point set". This is a classic controlled/uncontrolled hybrid, the
   * same shape a controlled `<input>` uses: when this prop is provided
   * (including explicitly `null`), the canvas treats focal-point state as
   * owned by the caller — every focal-point gesture still fires
   * `onFocalEntityChange` exactly the same way, but the value rendered and
   * centered on is this prop, not an internal mirror. When the prop is
   * omitted entirely (`undefined`), the canvas manages `focalEntityId` as its
   * own internal state, mirroring how `selectedNodeId` already works. This
   * hybrid is what keeps Task 15 fully self-contained — `EntityGraphCanvas`
   * needs no caller to pass anything new to behave correctly — while still
   * giving Task 17's accessible-list "clear focal point" header control a
   * clean way to drive this component from outside: that control is expected
   * to lift this value into its own parent's state and pass `null` down
   * through this same prop to clear it, rather than reaching into the
   * canvas's internals.
   */
  focalEntityId?: string | null;
  /**
   * Invoked whenever the focal point changes — set by a shift-click (desktop)
   * or long-press (touch) gesture on a node (FR-15), reassigned to a
   * different node by the identical gesture with no separate clear step
   * required first (FR-18), or cleared back to `null` (FR-19, expected to be
   * driven by Task 17's accessible-list header control once it exists).
   * Called with the new `focalEntityId` (or `null`). In controlled mode (see
   * `focalEntityId` above) this is the caller's only signal that a gesture
   * happened — the canvas does not also mutate its own copy — so a
   * controlling parent MUST update its own state in response for the
   * displayed value to change.
   */
  onFocalEntityChange?: (focalEntityId: string | null) => void;
  /**
   * The project's configured focal hop radius (Feature 68, Task 10/16,
   * FR-17/FR-21) — how many hops from the focal point a node/edge must stay
   * within to render at full opacity. Defaults to `DEFAULT_FOCAL_HOP_RADIUS`
   * (`1`) when omitted, matching Task 10's own settings default. Has no
   * effect at all while no focal point is set (`resolvedFocalEntityId` is
   * `null`) — every node/edge renders exactly as it did before this task in
   * that case. Changing this value immediately changes which nodes/edges are
   * emphasized on the very next render, with no need to reselect the focal
   * point — it is read fresh on every render, not captured at
   * focal-point-selection time.
   */
  focalHopRadius?: number;
  /**
   * Invoked with the server's own saved settings every time Task 10's
   * settings panel (rendered inside this canvas) persists a connection-type
   * toggle or hop-radius change (Feature 68, Task 18 follow-up). Threaded
   * straight through to `EntityGraphSettingsPanel`'s identically-shaped
   * `onSettingsSaved` prop — see that prop's own doc comment for why this
   * exists: without it, `EntityRelationshipGraphView.tsx`'s own
   * `connectionTypes`/`focalHopRadius` state (which drives `graphData`'s
   * edge filtering and this canvas's hop-radius BFS) had no way to learn
   * that a setting saved here had changed, so a toggle only took visible
   * effect after a full remount/reload rather than live. Omitted when no
   * caller needs it (e.g. a story or a unit test rendering this canvas
   * standalone), in which case the settings panel's own persist-and-reflect-
   * locally behavior is unaffected.
   */
  onSettingsSaved?: (settings: EntityGraphSettings) => void;
  /**
   * The project's persisted entity-kind color/shape style mapping (Feature
   * 69, Task 8, FR-1/FR-4). Resolved to a `Map` keyed by `entityKind`
   * internally; passed as a plain array here so a caller (`EntityRelationship-
   * GraphView.tsx`) can fetch-and-pass it the same way it already threads
   * `activeConnectionTypes` down, with no new per-render allocation
   * requirement on the caller's part. Defaults to an empty array, matching
   * "no kind has a saved mapping yet" rather than guessing a default — every
   * node then renders via `getEntityKindFallbackStyle`'s deterministic
   * hash-assigned shape and neutral color (FR-5).
   *
   * Deliberately a plain prop, not cached/memoized inside this component
   * beyond a `useMemo` keyed on this same array: a parent that re-fetches
   * after a Task 6 modal save and passes a new array down causes this
   * component's node styling to update on its very next render, with no
   * reload required (FR-4) — this component never freezes a copy of the
   * mapping anywhere that would block that.
   */
  kindStyles?: EntityGraphKindStyleRecord[];
}

/**
 * Fixed stroke width for an authored edge (FR-12: thickness is reserved for
 * the co-occurrence count only, so an authored edge never varies its width).
 */
const AUTHORED_EDGE_STROKE_WIDTH = 1.5;

/**
 * Minimum stroke width for a co-occurrence edge, used even at a
 * `sharedResourceCount` of zero or one so the line never disappears.
 */
const COOCCURRENCE_MIN_STROKE_WIDTH = 1.5;

/**
 * Scale factor applied to the log of `sharedResourceCount` to spread the
 * range of rendered widths without letting a very high count blow out the
 * canvas. A log scale (rather than linear) keeps the growth monotonic while
 * flattening out for large counts (FR-12).
 */
const COOCCURRENCE_STROKE_WIDTH_SCALE = 1.4;

/** Dash pattern applied to every co-occurrence edge's line (FR-6). */
const COOCCURRENCE_DASH_ARRAY = "5 4";

/**
 * Fixed stroke width for a backlinks edge (Feature 68, Task 8). It carries no
 * weight to scale by — `getEntityBacklinkEdges` already collapses a
 * bidirectional backlink into one unordered pair with no count — so, like an
 * authored edge, its width never varies.
 */
const BACKLINKS_EDGE_STROKE_WIDTH = 1.5;

/**
 * Dash pattern for a backlinks edge: a long dash followed by a short dash
 * (dash-dot), deliberately distinct in silhouette from co-occurrence's even
 * "5 4" dashing, an authored edge's unbroken solid line, and the two dash
 * patterns below (Feature 68, Task 8, FR-6).
 */
const BACKLINKS_DASH_ARRAY = "10 4 2 4";

/**
 * Fixed stroke width for a shared-metadata edge (Feature 68, Task 8). Like
 * backlinks, it carries no numeric weight worth scaling by — the spec notes a
 * shared-tag/-field count *could* drive thickness but does not require it —
 * so this stays fixed.
 */
const SHARED_METADATA_EDGE_STROKE_WIDTH = 1.5;

/**
 * Dash pattern for a shared-metadata edge: short, evenly spaced dashes,
 * distinct from every other kind's pattern (Feature 68, Task 8, FR-6).
 */
const SHARED_METADATA_DASH_ARRAY = "3 3";

/**
 * Fixed stroke width for a proximity-mentions edge (Feature 68, Task 8,
 * FR-6/OQ-5). Its `weight` is deliberately encoded as opacity instead (see
 * `proximityMentionOpacity` below), specifically so this kind never looks
 * identical to co-occurrence's thickness-scaled edges when both are active at
 * once — the two are the only weighted kinds, and thickness is already
 * co-occurrence's signal.
 */
const PROXIMITY_MENTION_EDGE_STROKE_WIDTH = 1.5;

/**
 * Dash pattern for a proximity-mentions edge: fine, closely spaced dots,
 * distinct from every other kind's pattern (Feature 68, Task 8, FR-6).
 */
const PROXIMITY_MENTION_DASH_ARRAY = "1 3";

/** Opacity used for every edge kind except proximity-mentions. */
const FULL_EDGE_OPACITY = 1;

/**
 * The least-opaque a proximity-mentions edge is ever rendered, regardless of
 * how large its `weight` (raw average character-offset distance) is — a
 * floor so a very distant pair's edge stays faintly visible rather than
 * disappearing (Feature 68, Task 8, FR-6).
 */
const PROXIMITY_MENTION_MIN_OPACITY = 0.25;

/**
 * The `weight` value (and anything at or above it) at which a proximity-
 * mentions edge's opacity bottoms out at `PROXIMITY_MENTION_MIN_OPACITY`.
 * This is a starting value, not a measured one — proximity-mention weight is
 * a raw character-offset distance with no natural upper bound, so some
 * threshold has to be chosen to normalize it into an opacity range; tuning it
 * is a one-line change here, mirroring `DRAG_CLICK_THRESHOLD_PX`'s own
 * unmeasured-starting-value precedent in this file.
 */
const PROXIMITY_MENTION_WEIGHT_OPACITY_FLOOR = 2000;

/**
 * Computes a proximity-mentions edge's opacity from its `weight` (Feature 68,
 * Task 8, FR-6/OQ-5): monotonically *decreasing* in `weight` — a larger raw
 * average character-offset distance (a weaker, more distant connection) never
 * produces an equal-or-more-opaque line than a smaller one — clamped to
 * `[PROXIMITY_MENTION_MIN_OPACITY, FULL_EDGE_OPACITY]`. Deliberately opacity,
 * not stroke width: `cooccurrenceStrokeWidth` already owns thickness as a
 * weight signal for a different edge kind, and OQ-5 requires the two weighted
 * kinds to stay visually distinguishable even when both are active at once.
 */
function proximityMentionOpacity(weight: number): number {
  const clampedWeight = Math.min(
    Math.max(weight, 0),
    PROXIMITY_MENTION_WEIGHT_OPACITY_FLOOR,
  );
  const t = clampedWeight / PROXIMITY_MENTION_WEIGHT_OPACITY_FLOOR;
  return (
    FULL_EDGE_OPACITY - t * (FULL_EDGE_OPACITY - PROXIMITY_MENTION_MIN_OPACITY)
  );
}

/**
 * Stroke width of the invisible hit-target line rendered behind every edge
 * (Task 4 of entity-graph-edge-tooltips). Both an authored edge's fixed
 * 1.5px stroke and a co-occurrence edge's log-scaled stroke are too thin to
 * reliably hover (FR-3); this fixed width is Spike B's measured value — see
 * `specs/features/entity-graph-edge-tooltips/spike-b-hit-target-width.md` for
 * the derivation. It is used for every edge regardless of kind, independent
 * of that edge's own visible stroke width.
 */
const EDGE_HIT_TARGET_STROKE_WIDTH = 12;

/** Minimum zoom scale (Task 6): the canvas never shrinks past a quarter size. */
const MIN_SCALE = 0.25;

/** Maximum zoom scale (Task 6): the canvas never grows past 4x. */
const MAX_SCALE = 4;

/**
 * Multiplicative step applied per wheel tick (Task 6). A multiplicative
 * (rather than additive) step keeps zoom feeling proportional at both ends
 * of the `MIN_SCALE`/`MAX_SCALE` range.
 */
const ZOOM_STEP_FACTOR = 1.1;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/**
 * Maximum pointer movement, in client pixels, a node's pointerdown-to-pointerup
 * gesture may travel and still be treated as a click (rather than a drag) of
 * that node (entity-graph-node-dragging, FR-2/FR-7, OQ-1). This is a starting
 * value, not a measured one: chosen as a typical click/drag threshold, then
 * hand-checked during this feature's manual verification (2026-09-10) and
 * judged within tolerable bounds. That is a judgment from use, not a
 * measurement — see specs/features/entity-graph-node-dragging/
 * manual-verification.md. Tuning it is a one-line change here.
 */
const DRAG_CLICK_THRESHOLD_PX = 4;

/**
 * Minimum duration, in milliseconds, a pointer must stay down on a node —
 * without moving past `DRAG_CLICK_THRESHOLD_PX` — before that gesture is
 * reclassified as a long-press focal-point gesture rather than an ordinary
 * tap (Feature 68, Task 15, FR-15). This is a *duration* threshold, tracked
 * by a timer started at `pointerdown`, layered alongside — not replacing —
 * the existing *movement*-based `DRAG_CLICK_THRESHOLD_PX` distinction above:
 * a long-press is stationary (never exceeds the movement threshold) but held
 * for this long, whereas a drag moves past the movement threshold regardless
 * of how long it takes. Like `DRAG_CLICK_THRESHOLD_PX` itself, this is a
 * starting value, not a measured one — a typical long-press duration, not yet
 * hand-checked on a physical device (deferred to Task 18's end-to-end pass
 * per this feature's own task list). Tuning it is a one-line change here.
 */
const LONG_PRESS_DURATION_MS = 500;

/**
 * Computes a co-occurrence edge's `strokeWidth` from its `sharedResourceCount`
 * (FR-12). Monotonically increasing in `count` — a higher count never
 * produces an equal-or-thinner line than a lower one — via a log scale so the
 * line stays legible across a wide range of counts.
 */
function cooccurrenceStrokeWidth(count: number): number {
  return (
    COOCCURRENCE_MIN_STROKE_WIDTH +
    Math.log2(Math.max(count, 0) + 1) * COOCCURRENCE_STROKE_WIDTH_SCALE
  );
}

/**
 * Resolves an edge's rendered `strokeWidth` by kind (Feature 68, Task 8).
 * Co-occurrence is the only kind whose width varies (by shared-resource
 * count, via `cooccurrenceStrokeWidth`); every other kind — including
 * proximity-mentions, which encodes its own weight as opacity instead — has a
 * fixed width.
 */
function edgeStrokeWidth(edge: EntityGraphEdge): number {
  switch (edge.kind) {
    case "cooccurrence":
      return cooccurrenceStrokeWidth(edge.sharedResourceCount);
    case "authored":
      return AUTHORED_EDGE_STROKE_WIDTH;
    case "backlinks":
      return BACKLINKS_EDGE_STROKE_WIDTH;
    case "proximityMentions":
      return PROXIMITY_MENTION_EDGE_STROKE_WIDTH;
    case "sharedMetadata":
      return SHARED_METADATA_EDGE_STROKE_WIDTH;
  }
}

/**
 * Resolves an edge's rendered `strokeDasharray` by kind (Feature 68, Task 8,
 * FR-6): `undefined` (solid) for an authored edge, and a distinct dash
 * pattern for each of the four undirected kinds, so every pairwise
 * combination among all five kinds is distinguishable by dash pattern alone,
 * even before directedness or opacity/width are taken into account.
 */
function edgeDashArray(edge: EntityGraphEdge): string | undefined {
  switch (edge.kind) {
    case "authored":
      return undefined;
    case "cooccurrence":
      return COOCCURRENCE_DASH_ARRAY;
    case "backlinks":
      return BACKLINKS_DASH_ARRAY;
    case "proximityMentions":
      return PROXIMITY_MENTION_DASH_ARRAY;
    case "sharedMetadata":
      return SHARED_METADATA_DASH_ARRAY;
  }
}

/**
 * Resolves an edge's rendered `opacity` by kind (Feature 68, Task 8,
 * FR-6/OQ-5). Only a proximity-mentions edge varies, by its own `weight` via
 * `proximityMentionOpacity`; every other kind renders at full opacity.
 */
function edgeOpacity(edge: EntityGraphEdge): number {
  switch (edge.kind) {
    case "proximityMentions":
      return proximityMentionOpacity(edge.weight);
    case "authored":
    case "cooccurrence":
    case "backlinks":
    case "sharedMetadata":
      return FULL_EDGE_OPACITY;
  }
}

/**
 * Returns the two entity ids an edge connects, regardless of edge kind — a
 * co-occurrence edge's unordered pair, an authored edge's directed pair, a
 * backlink edge's `entityIds` tuple, or a proximity-mention/shared-metadata
 * edge's `entityIdA`/`entityIdB` pair (Feature 68, Task 7 minimal fix: this
 * `switch` must stay exhaustive — a non-exhaustive version here is exactly
 * what let a new-kind edge resolve to `undefined` endpoints and crash
 * `d3-force`'s link force with "node not found: undefined").
 */
function edgeEndpoints(edge: EntityGraphEdge): [string, string] {
  switch (edge.kind) {
    case "cooccurrence":
      return [edge.entityIdA, edge.entityIdB];
    case "authored":
      return [edge.sourceEntityId, edge.targetEntityId];
    case "backlinks":
      return edge.entityIds;
    case "proximityMentions":
    case "sharedMetadata":
      return [edge.entityIdA, edge.entityIdB];
  }
}

/**
 * A stable, unique key for an edge — used both as the React list key and as
 * the `forceLink` link's own identity. An authored edge already carries a
 * unique `id`; every other kind has none, so its key is derived from its
 * (already-canonicalized, per `EntityRelationshipGraphView`) unordered pair
 * — a proximity-mention edge's pair is additionally scoped by `resourceId`
 * since a pair sharing more than one resource produces one edge per
 * resource (Feature 68, Task 7).
 */
function edgeKey(edge: EntityGraphEdge): string {
  switch (edge.kind) {
    case "authored":
      return `authored:${edge.id}`;
    case "cooccurrence":
      return `cooccurrence:${edge.entityIdA}:${edge.entityIdB}`;
    case "backlinks":
      return `backlinks:${edge.entityIds[0]}:${edge.entityIds[1]}`;
    case "proximityMentions":
      return `proximityMentions:${edge.entityIdA}:${edge.entityIdB}:${edge.resourceId}`;
    case "sharedMetadata":
      return `sharedMetadata:${edge.entityIdA}:${edge.entityIdB}`;
  }
}

/**
 * Resolves a single entity's rendered position at render time
 * (entity-graph-node-dragging, FR-3): its live drag override if one exists,
 * else `computeGraphLayout`'s own settled `x`/`y` for that entity, unchanged.
 * This is the exact same override-or-layout precedence a node's own `<g>`
 * transform already applies (see the nodes render loop below) — this helper
 * lets an edge endpoint apply the identical rule without duplicating it.
 *
 * A no-override call is a pure pass-through of `layoutNode`'s coordinates:
 * it introduces no new computation in that case, which is what keeps a
 * dragless render's edge endpoints identical to `computeGraphLayout`'s own
 * fixed output.
 */
function resolveEntityPosition(
  entityId: string,
  layoutNode: { x: number; y: number } | undefined,
  overrides: Map<string, { x: number; y: number }>,
  fallbackX: number,
  fallbackY: number,
): { x: number; y: number } {
  const override = overrides.get(entityId);
  if (override) return override;
  if (layoutNode) return { x: layoutNode.x, y: layoutNode.y };
  return { x: fallbackX, y: fallbackY };
}

/**
 * Composes an edge's tooltip/accessible-list disclosure text (FR-1/FR-2) by
 * delegating to Task 1's shared, framework-free description functions —
 * `nameById` is always the first argument, per the spec's explicit
 * requirement, so this is the one place either function is called from this
 * component and both call sites read every other value (relationship type,
 * shared-resource count, entity ids) from the same `edge` object the canvas
 * already holds for rendering (FR-6: no new fetch).
 */
function describeEdge(
  edge: EntityGraphEdge,
  nameById: Map<string, string>,
): string {
  switch (edge.kind) {
    case "authored":
      return describeAuthoredEdge(
        nameById,
        edge.sourceEntityId,
        edge.targetEntityId,
        edge.relationshipType,
      );
    case "cooccurrence":
      return describeCooccurrenceEdge(
        nameById,
        edge.entityIdA,
        edge.entityIdB,
        edge.sharedResourceCount,
      );
    case "backlinks":
      return describeBacklinkEdge(
        nameById,
        edge.entityIds[0],
        edge.entityIds[1],
      );
    case "proximityMentions":
      return describeProximityMentionEdge(
        nameById,
        edge.entityIdA,
        edge.entityIdB,
        edge.weight,
      );
    case "sharedMetadata":
      // Task 7 minimal fix: passes raw tag ids/field keys rather than
      // resolving them to display labels first, unlike the doc comment on
      // `describeSharedMetadataEdge` (`edgeDescriptions.ts`) assumes a real
      // caller will do — full id-to-label resolution plus the rest of this
      // edge kind's visual treatment is explicitly Task 8/9's scope, not
      // this minimal typecheck/crash fix's. This still produces a safe,
      // non-"authored" string.
      return describeSharedMetadataEdge(
        nameById,
        edge.entityIdA,
        edge.entityIdB,
        edge.sharedTagIds,
        edge.sharedFieldKeys,
      );
  }
}

/**
 * How a currently-shown edge tooltip was triggered — a hover-sourced tooltip
 * dismisses on `onMouseLeave`; a tap-sourced one dismisses only on a second
 * tap of the same hit-target or a tap elsewhere (FR-5). Tracking the source
 * is what lets those two dismiss rules coexist without one gesture
 * accidentally clearing a tooltip the other gesture opened.
 */
type TooltipSource = "hover" | "tap";

/** The edge tooltip currently shown, and where to position its popover. */
interface ActiveEdgeTooltip {
  key: string;
  edge: EntityGraphEdge;
  source: TooltipSource;
  clientX: number;
  clientY: number;
}

/**
 * Seeds every node with a deterministic starting position (evenly spaced on
 * a circle) instead of leaving `x`/`y` undefined. `d3-force` only randomizes
 * a node's initial position when none is supplied, so this is what makes the
 * settled layout below reproducible across renders and in tests, rather
 * than depending on `Math.random`.
 */
function seedNodes(
  nodes: EntityGraphNode[],
  width: number,
  height: number,
): SimNode[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(Math.min(width, height) / 3, 1);
  const count = Math.max(nodes.length, 1);
  return nodes.map((node, index) => {
    const angle = (2 * Math.PI * index) / count;
    return {
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
}

function buildSimLinks(edges: EntityGraphEdge[]): SimLink[] {
  return edges.map((edge) => {
    const [source, target] = edgeEndpoints(edge);
    return { source, target, edge, key: edgeKey(edge) };
  });
}

/**
 * Computes each node's and edge's rendered position via a headless
 * `d3-force` simulation (FR-8: the library computes layout only, no
 * rendering). The simulation is stopped immediately after construction and
 * then advanced a fixed number of ticks synchronously — never left running
 * on `d3-force`'s own timer — so the result is settled and reproducible
 * before this function returns. Nothing computed here is persisted (FR-13):
 * this is a pure function of its inputs, called fresh on every render.
 */
export function computeGraphLayout(
  nodes: EntityGraphNode[],
  edges: EntityGraphEdge[],
  width: number = DEFAULT_WIDTH,
  height: number = DEFAULT_HEIGHT,
): EntityGraphLayout {
  const simNodes = seedNodes(nodes, width, height);
  const simLinks = buildSimLinks(edges);

  const simulation = forceSimulation<SimNode>(simNodes)
    .force("charge", forceManyBody().strength(-180))
    .force(
      "link",
      forceLink<SimNode, SimLink>(simLinks)
        .id((node) => node.entityId)
        .distance(120),
    )
    .force("center", forceCenter(width / 2, height / 2))
    .force("collide", forceCollide<SimNode>(NODE_RADIUS + 8))
    .stop();

  // `simulation.tick()` mutates `simNodes`' `x`/`y`/`vx`/`vy` in place; the
  // loop itself is the entire point, not a value we read from here.
  for (let tick = 0; tick < SIMULATION_TICKS; tick += 1) {
    simulation.tick();
  }

  const nodesById = new Map<string, SimNode>(
    simNodes.map((node) => [node.entityId, node]),
  );

  const positionedNodes: PositionedNode[] = simNodes.map((node) => ({
    entityId: node.entityId,
    name: node.name,
    entityKind: node.entityKind,
    x: node.x ?? width / 2,
    y: node.y ?? height / 2,
  }));

  const positionedEdges: PositionedEdge[] = simLinks.map((link) => {
    const [sourceId, targetId] = edgeEndpoints(link.edge);
    const sourceNode = nodesById.get(sourceId);
    const targetNode = nodesById.get(targetId);
    return {
      key: link.key,
      edge: link.edge,
      x1: sourceNode?.x ?? width / 2,
      y1: sourceNode?.y ?? height / 2,
      x2: targetNode?.x ?? width / 2,
      y2: targetNode?.y ?? height / 2,
    };
  });

  return { positionedNodes, positionedEdges };
}

/**
 * `EntityGraphCanvas` renders the assembled node/edge graph as hand-rolled
 * SVG (FR-8): `d3-force` (via `computeGraphLayout`) supplies positions only,
 * every visual element — the `<svg>`, one `<line>` per edge, one `<g>` (a
 * `<circle>` + `<text>` label) per node — is markup and styling this
 * component owns outright.
 *
 * Positions are recomputed from scratch on every render (FR-13, OQ-2) and
 * are never written to `localStorage`, a sidecar, or any API — there is no
 * persistence call anywhere in this component for position data, layout
 * data, or anything else.
 *
 * Edge-kind visual distinction (FR-5/FR-6/FR-7/FR-12, Task 5): a
 * co-occurrence edge renders dashed and undirected, with `strokeWidth`
 * scaling monotonically with its `sharedResourceCount` via
 * `cooccurrenceStrokeWidth`; an authored edge renders solid, at a fixed
 * `strokeWidth`, with a `marker-end` arrowhead (defined once in this
 * component's `<defs>`) whose orientation follows the line's own
 * source→target direction. Colour is never used to distinguish the two kinds
 * — both share the same `--color-gw-secondary` stroke token, never
 * `--color-gw-red`/`#D44040`. Pan, zoom, and click-selection are not wired
 * yet (Task 6's scope, landing on this same file next) — this task's
 * changes are confined to the edges `<g>` and the new `<defs>`/`<marker>`.
 *
 * Extended per-kind visual encoding for all five edge kinds (Feature 68,
 * Task 8, FR-6/OQ-5): `backlinks`, `proximityMentions`, and `sharedMetadata`
 * each render undirected (no arrowhead) with their own distinct dash pattern
 * — see `edgeDashArray` — so every pairwise combination among all five kinds
 * is distinguishable by dash pattern alone. `proximityMentions` additionally
 * varies its opacity (not width) with its own `weight`, via
 * `proximityMentionOpacity`, specifically so it never looks identical to
 * `cooccurrence`'s thickness-scaled edges when both are active at once — the
 * two are the only weighted kinds in this set. No new use of
 * `--color-gw-red` is introduced by any of this.
 *
 * Theming uses this repo's `--color-gw-*` CSS custom properties (brand
 * tokens), the same tokens `EntityRosterRow.tsx` uses inline for its own
 * "needs attention" styling. These tokens are reassigned for light mode by
 * `.appshell-shell` (`styles/getwrite-utilities.css`), so this component
 * needs no dark/light branching of its own — reading the same variable
 * picks up whichever mode is active in its ancestor tree. `--color-gw-red`
 * (`#D44040`, reserved for position/canonical-state indicators) is not used
 * anywhere in this file.
 *
 * Pan/zoom/selection (Task 6, FR-8): a click-and-drag on empty canvas space
 * (the background `<rect>`, never a node) translates a `pan` offset tracked
 * in state; a wheel event over the canvas scales a `scale` value clamped to
 * `[MIN_SCALE, MAX_SCALE]`, anchored on the pointer so the graph point under
 * the cursor stays under the cursor rather than the canvas origin drifting
 * away from it (see the wheel handler for the derivation). Both are applied
 * via a single wrapping
 * `<g transform="translate(...) scale(...)">` around the existing edges and
 * nodes groups, so neither Task 4's layout math nor Task 5's edge-kind
 * markup needed to change — only wrapping. Clicking a node toggles that
 * node's id as the sole `selectedNodeId`, rendered as an extra highlight
 * ring (a second `<circle>`) on that node only, using the existing
 * `--color-gw-primary` token — never the reserved red token.
 *
 * Node activation (Task 7, FR-9): the node's own click handler both toggles
 * selection and calls `onNodeActivated` — the two are not separate gestures.
 * Since an SVG `<g>` is not natively focusable or keyboard-operable, each
 * node `<g>` also gets `tabIndex={0}`, `role="button"`, and an `onKeyDown`
 * handler that treats Enter and Space identically to a click, calling the
 * same `handleNodeActivate` function (no divergent keyboard-only path). No
 * other keyboard-driven graph traversal (e.g. arrow-key movement between
 * nodes) is added here — out of scope per OQ-4.
 *
 * Edge tooltip (Task 5, entity-graph-edge-tooltips, FAIL-path fallback):
 * Task 2's spike concluded `react-tooltip`'s combined `float`/`openOnClick`
 * mechanism FAILs (touch tap-to-dismiss did not work, and combining the two
 * bare booleans on one anchor silently disabled hover), so this component
 * builds a bespoke, manually positioned popover following the
 * `RefHoverPreview.tsx` pattern instead of extending `HoverTip.tsx`. Each
 * edge's Task 4 hit-target line gets `onMouseEnter`/`onMouseMove`/
 * `onMouseLeave` (hover, desktop) and `onClick` (tap, touch — a tap fires a
 * `click` event same as a mouse click, and an edge has no other click
 * behavior to collide with, per the spec's OQ-3). A single `activeTooltip`
 * state value tracks which edge's tooltip is shown, its trigger source, and
 * the last known pointer position; a hover-sourced tooltip dismisses on
 * `onMouseLeave`, while a tap-sourced one dismisses only on a second tap of
 * the same hit-target (handled by the `onClick` toggle) or a tap elsewhere
 * (handled by the document-level click listener below) — never on
 * `onMouseLeave`, since touch input does not fire that event. The popover
 * itself renders outside the `<svg>`, position-fixed at the tracked pointer
 * coordinates (`entityGraphTooltipOverlay.css`). A node never gains any of
 * this wiring (FR-8), and no hit-target line gains `tabIndex` or a
 * focus-triggered tooltip (FR-9) — the accessible list remains the sole
 * keyboard/screen-reader surface for this same text. Every tooltip's text is
 * produced by `describeEdge`, which delegates to Task 1's shared
 * `describeCooccurrenceEdge`/`describeAuthoredEdge` — the same functions
 * `EntityGraphAccessibleList.tsx` calls for the identical edge — passing a
 * `nameById` map built from `positionedNodes` as their first argument, so no
 * new fetch or persisted data is introduced (FR-6).
 */
export default function EntityGraphCanvas({
  nodes,
  edges,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className = "",
  onNodeActivated,
  projectId,
  activeConnectionTypes = [],
  focalEntityId,
  onFocalEntityChange,
  focalHopRadius = DEFAULT_FOCAL_HOP_RADIUS,
  onSettingsSaved,
  kindStyles = [],
}: EntityGraphCanvasProps): JSX.Element {
  const { positionedNodes, positionedEdges } = React.useMemo(
    () => computeGraphLayout(nodes, edges, width, height),
    [nodes, edges, width, height],
  );

  // Entity kind -> persisted color-slot/shape style (Feature 69, Task 8,
  // FR-1/FR-4), keyed by `entityKind` for O(1) per-node lookup in the render
  // loop below. Recomputed whenever the caller passes a new `kindStyles`
  // array — e.g. after Task 6's customization modal saves a change — so a
  // save is reflected here on the very next render with no reload.
  const kindStyleByKind = React.useMemo(() => {
    const map = new Map<string, EntityGraphKindStyleRecord>();
    for (const record of kindStyles) {
      map.set(record.entityKind, record);
    }
    return map;
  }, [kindStyles]);

  // Entity id -> display name, built from the same positioned nodes the
  // canvas already renders (Task 5) — the sole lookup `describeEdge` needs,
  // passed as the first argument to both shared description functions.
  const nameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const node of positionedNodes) {
      map.set(node.entityId, node.name);
    }
    return map;
  }, [positionedNodes]);

  // Entity id -> `computeGraphLayout`'s own settled x/y (entity-graph-node-
  // dragging, FR-3). This is memoized off `positionedNodes` only — never off
  // `nodePositionOverrides` — since it exists purely to give
  // `resolveEntityPosition` the unchanged layout fallback; overrides are
  // applied by that function at render time, not baked into this map.
  const layoutPositionById = React.useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of positionedNodes) {
      map.set(node.entityId, { x: node.x, y: node.y });
    }
    return map;
  }, [positionedNodes]);

  const [activeTooltip, setActiveTooltip] =
    React.useState<ActiveEdgeTooltip | null>(null);

  // A stable-but-unique id for this canvas instance's arrowhead marker, so
  // multiple `EntityGraphCanvas` instances rendered on the same page never
  // collide on `<marker id>` (SVG ids are document-global).
  const arrowheadId = `entity-graph-arrowhead-${React.useId()}`;

  const svgRef = React.useRef<SVGSVGElement>(null);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [scale, setScale] = React.useState(1);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    null,
  );

  // Which node, if any, currently has pointer hover (Feature 68, Task 15,
  // OQ-9): drives the hint affordance's visibility — a small icon shown only
  // on hover to surface the shift-click/long-press modifier gesture, this
  // task's own first-pass resolution of OQ-9. Desktop-hover-only by design
  // (mouse `pointerenter`/`pointerleave`): a touch gesture has no hover
  // state to show a hint during, so the hint is simply never shown on touch —
  // a long-press is discoverable on touch some other way (out of this task's
  // scope), not through this affordance.
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);

  // Live, drag-authored node position overrides, keyed by `entityId`
  // (entity-graph-node-dragging, FR-2/FR-7, OQ-2). Mirrors the
  // `selectedNodeId`/`pan`/`scale` precedent exactly: plain component state,
  // held outside `computeGraphLayout`'s `useMemo` and its dependency array,
  // so a drag's override is never reset by that memo recomputing when
  // `nodes`/`edges`/`width`/`height` change.
  const [nodePositionOverrides, setNodePositionOverrides] = React.useState<
    Map<string, { x: number; y: number }>
  >(() => new Map());

  // Content-keyed, not identity-keyed (Task 13): a caller that re-derives
  // `activeConnectionTypes` as a brand-new array on every render (as
  // `EntityRelationshipGraphView.tsx` does via its own `useMemo`) must not
  // retrigger the position-seeding effect below on every one of those
  // renders — only when the actual set of active types changes. None of the
  // five known connection-type keys contains a comma, so this join is a safe,
  // lossless content key.
  const activeConnectionTypesKey = activeConnectionTypes.join(",");

  // Mirrors `scaleRef`/`panRef`'s precedent below: read by the long-lived
  // pointer-event effect (registered once, re-subscribed only on
  // `[width, height]`), which would otherwise see a stale closure over
  // `projectId`/`activeConnectionTypesKey`/`nodePositionOverrides` at the
  // moment a drag ends (Task 13, FR-13).
  const projectIdRef = React.useRef(projectId);
  projectIdRef.current = projectId;
  const activeConnectionTypesKeyRef = React.useRef(activeConnectionTypesKey);
  activeConnectionTypesKeyRef.current = activeConnectionTypesKey;
  const nodePositionOverridesRef = React.useRef(nodePositionOverrides);
  nodePositionOverridesRef.current = nodePositionOverrides;

  // Focal-point state (Feature 68, Task 15, FR-15/FR-16/FR-18/FR-19): a
  // controlled/uncontrolled hybrid identical in shape to a controlled
  // `<input>` — see `focalEntityId`'s own doc comment on the props interface
  // above for the full rationale. `internalFocalEntityId` is this
  // component's own state, used only when the caller has not supplied the
  // `focalEntityId` prop at all (`undefined`, not merely falsy — an explicit
  // `null` from a controlling parent is a real, meaningful "no focal point"
  // value in controlled mode, not a signal to fall back to internal state).
  const [internalFocalEntityId, setInternalFocalEntityId] = React.useState<
    string | null
  >(null);
  const isFocalEntityControlled = focalEntityId !== undefined;
  const resolvedFocalEntityId = isFocalEntityControlled
    ? (focalEntityId ?? null)
    : internalFocalEntityId;

  // Hop-radius BFS (Feature 68, Task 16, FR-17/OQ-2): a standard full-graph
  // BFS, recomputed only when `nodes`, `edges`, or the resolved focal entity
  // changes — never on a pan/zoom/drag re-render, since none of those three
  // dependencies change for those gestures. Empty (every lookup falls back to
  // `Infinity` below) whenever `resolvedFocalEntityId` is `null`, which is
  // exactly what keeps every node/edge at full, unemphasized opacity when no
  // focal point is set (see `isWithinFocalHopRadius` below).
  const hopDistances = React.useMemo(
    () => computeHopDistances(nodes, edges, resolvedFocalEntityId),
    [nodes, edges, resolvedFocalEntityId],
  );

  // Whether a given entity's node is within the configured hop radius of the
  // current focal point (Feature 68, Task 16, FR-17). A node absent from
  // `hopDistances` (unreachable from the focal point, or no focal point set
  // at all) is treated as `Infinity` hops away, per `computeHopDistances`'s
  // own documented convention. Read fresh on every render against the live
  // `focalHopRadius` prop, so changing the hop-radius setting re-emphasizes
  // the graph immediately without any focal-point reselection.
  const isWithinFocalHopRadius = React.useCallback(
    (entityId: string): boolean => {
      if (resolvedFocalEntityId === null) return true;
      const distance = hopDistances.get(entityId) ?? Infinity;
      return distance <= focalHopRadius;
    },
    [resolvedFocalEntityId, hopDistances, focalHopRadius],
  );

  // Resolves a node's current rendered position (live drag override, else
  // `computeGraphLayout`'s own settled x/y) and re-centers the camera on it
  // by solving the same `p = pan + g * scale` mapping the wheel-zoom handler
  // above derives, for `pan`, holding the canvas's own center point fixed as
  // `p` and the node's position fixed as `g` (FR-16). Deliberately leaves
  // `scale` untouched — FR-16 is pan-only, no implied zoom change. Reads
  // `nodePositionOverrides`/`scale` directly (not via a ref) since, unlike
  // the long-lived pointer-event effect below, this callback is a plain
  // `useCallback` recreated every render and so never sees a stale closure.
  const centerOnNode = React.useCallback(
    (entityId: string): void => {
      const layoutPosition = layoutPositionById.get(entityId);
      const override = nodePositionOverrides.get(entityId);
      const resolved = override ?? layoutPosition;
      if (!resolved) return;
      setPan({
        x: width / 2 - resolved.x * scale,
        y: height / 2 - resolved.y * scale,
      });
    },
    [layoutPositionById, nodePositionOverrides, scale, width, height],
  );

  // Updates focal-point state (internal, unless controlled — see
  // `isFocalEntityControlled` above) and always reports the change via
  // `onFocalEntityChange`, regardless of control mode, so a controlling
  // parent and an uncontrolled caller both learn about every change the same
  // way.
  const setFocalPoint = React.useCallback(
    (entityId: string | null): void => {
      if (!isFocalEntityControlled) {
        setInternalFocalEntityId(entityId);
      }
      onFocalEntityChange?.(entityId);
    },
    [isFocalEntityControlled, onFocalEntityChange],
  );

  // The single entry point for both focal-point gestures (shift-click and
  // long-press, FR-15): sets the new focal point, then centers the camera on
  // it. Reassigning to a different node goes through this exact same path
  // with no separate clear step (FR-18) — there is nothing here that
  // requires `resolvedFocalEntityId` to be `null` first.
  const handleFocalPointGesture = React.useCallback(
    (entityId: string): void => {
      setFocalPoint(entityId);
      centerOnNode(entityId);
    },
    [setFocalPoint, centerOnNode],
  );

  // Timer backing the long-press half of the focal-point gesture (FR-15,
  // touch): started at a node's `pointerdown`, cleared the moment that same
  // gesture's movement crosses `DRAG_CLICK_THRESHOLD_PX` (so a drag can never
  // also fire a long-press) or the pointer is released/cancelled before the
  // duration elapses. A ref, not state — this is a scheduling handle, not a
  // value the render output depends on.
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Seeds `nodePositionOverrides` from any persisted, non-invalidated
  // position record at mount (Task 13, FR-9/FR-11), instead of leaving every
  // session starting from an empty override map. Skipped entirely when
  // `projectId` is omitted — the exact backward-compatibility requirement
  // Task 10 already established for the settings panel. Never clobbers an
  // entityId that already has an override (a live or already-restored drag
  // position) — relevant because this effect can re-run later if
  // `activeConnectionTypesKey` changes (e.g. once `EntityRelationshipGraphView`'s
  // own asynchronous settings fetch resolves after an initial default-value
  // render), and a late reconciliation must not stomp on a position the
  // writer has since moved in this same session.
  React.useEffect(() => {
    if (!projectId) return;
    const activeTypes =
      activeConnectionTypesKey.length > 0
        ? activeConnectionTypesKey.split(",")
        : [];
    let isCancelled = false;
    void getEntityGraphPositions(projectId)
      .then((records) => {
        if (isCancelled) return;
        setNodePositionOverrides((prev) => {
          let hasSeededAny = false;
          const next = new Map(prev);
          for (const record of records) {
            if (next.has(record.entityId)) continue;
            if (isPositionInvalidated(record, activeTypes)) continue;
            next.set(record.entityId, { x: record.x, y: record.y });
            hasSeededAny = true;
          }
          return hasSeededAny ? next : prev;
        });
      })
      .catch((err: unknown) => {
        // Failure-visibility floor (docs/standards/failure-visibility.md): a
        // failed read must not silently render as "no positions saved yet"
        // — reported here, then falls back to the fresh `computeGraphLayout`
        // positions every node already renders at by default, rather than
        // blocking rendering.
        console.error(
          "Failed to load persisted entity graph node positions.",
          err,
        );
      });
    return () => {
      isCancelled = true;
    };
  }, [projectId, activeConnectionTypesKey]);

  // Drag state lives in a ref, not React state, since a move handler needs to
  // read it on every pointer move without forcing a re-render per pixel; the
  // only state updates that matter for rendering are the `pan` writes below.
  const dragOriginRef = React.useRef<{
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  // A node drag in progress, tracked separately from `dragOriginRef` (which
  // drives background panning) rather than overloading it — the two gestures
  // are mutually exclusive (a press lands on either the background
  // `<rect>` or a node's `<g>`, never both) but keeping their state distinct
  // avoids one handler needing to know about the other's shape.
  //
  // `exceededThreshold` (entity-graph-node-dragging, FR-6/FR-7) tracks
  // whether this gesture's RAW CLIENT-PIXEL movement — never the
  // viewBox-unit, scale-divided delta computed below for repositioning — has
  // crossed `DRAG_CLICK_THRESHOLD_PX` at any point since pointerdown. It only
  // ever flips false -> true during a gesture (never resets mid-gesture),
  // and is read once, at `pointerup`, to decide whether the upcoming native
  // `click` event should be allowed to activate the node.
  const nodeDragRef = React.useRef<{
    entityId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    exceededThreshold: boolean;
    // Set by the long-press timer (Feature 68, Task 15, FR-15) once it fires
    // for this gesture. Tracked on the gesture record itself, not written
    // straight to `justDraggedPastThresholdRef` below, because
    // `handlePointerEnd` unconditionally *recomputes* that ref from
    // `exceededThreshold` on every release — writing to it early would just
    // be overwritten back to `false` by that recomputation for a long-press,
    // whose movement never exceeded the drag threshold.
    longPressFired: boolean;
  } | null>(null);

  // Whether the gesture that most recently ended crossed the click/drag
  // threshold, kept in a ref distinct from `nodeDragRef` because it must
  // survive past `pointerup` (which clears `nodeDragRef.current`) into the
  // browser's native `click` event that fires immediately afterward on the
  // same element (entity-graph-node-dragging, FR-6). `handleNodeClick`
  // consults and resets it. With a mouse a click always follows the release,
  // so that alone would keep it from leaking — but a finger drag is NOT
  // followed by a click, so the flag would stay set and swallow the next tap.
  // Every node `pointerdown` therefore resets it too, and keyboard activation
  // never consults it (a key press never ends a drag).
  const justDraggedPastThresholdRef = React.useRef(false);

  const handleBackgroundMouseDown = React.useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      dragOriginRef.current = {
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
    },
    [pan.x, pan.y],
  );

  // Records a node drag gesture's start: the pointer's id and client
  // coordinates, and the node's current RESOLVED position — its live override
  // if one exists, else `computeGraphLayout`'s own settled `x`/`y` — so the
  // drag continues from wherever the node actually is, not from a stale
  // simulation position (entity-graph-node-dragging, FR-1). A pointer event,
  // not a mouse event, so a finger starts a drag the same way a mouse does.
  const handleNodePointerDown = React.useCallback(
    (
      event: React.PointerEvent<SVGGElement>,
      entityId: string,
      layoutX: number,
      layoutY: number,
    ) => {
      justDraggedPastThresholdRef.current = false;
      const override = nodePositionOverrides.get(entityId);
      nodeDragRef.current = {
        entityId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: override?.x ?? layoutX,
        startY: override?.y ?? layoutY,
        exceededThreshold: false,
        longPressFired: false,
      };

      // Starts (or restarts, superseding any still-pending timer from a
      // prior gesture on another node) the long-press duration timer
      // (FR-15). If this same pointer is still down on this same node, and
      // has not moved past the movement threshold, once the timer elapses —
      // see the movement-threshold cancellation in `handlePointerMove` and
      // the release/cancel cancellation in `handlePointerEnd` below — the
      // gesture is reclassified as a long-press: it fires the focal-point
      // gesture and marks the upcoming native `click` (if one follows) for
      // suppression via the same `justDraggedPastThresholdRef` flag a drag
      // past the threshold already uses, since the two cases need identical
      // handling at that point (don't let the next click also activate the
      // node).
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
      }
      const { pointerId } = event;
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        const drag = nodeDragRef.current;
        if (
          !drag ||
          drag.entityId !== entityId ||
          drag.pointerId !== pointerId ||
          drag.exceededThreshold
        ) {
          return;
        }
        drag.longPressFired = true;
        handleFocalPointGesture(entityId);
      }, LONG_PRESS_DURATION_MS);
    },
    [nodePositionOverrides, handleFocalPointGesture],
  );

  // The wheel handler needs both the current `scale` and the current `pan` to
  // anchor a zoom, but it is registered once (see the `[]` effect below) and
  // would otherwise close over their first values. Mirroring them into refs
  // keeps the listener registration stable while still reading live values.
  // The node-drag continuation below needs the same live `scale` reference.
  const scaleRef = React.useRef(scale);
  scaleRef.current = scale;
  const panRef = React.useRef(pan);
  panRef.current = pan;

  // Continuation and release are tracked on `window`, not the `<rect>` (or a
  // node's `<g>`) itself, so a gesture already in progress keeps updating even
  // once the pointer leaves the SVG's own bounds — the same reason a native
  // drag gesture is normally wired at the document level.
  //
  // The two gestures listen to different event families, deliberately:
  //
  // - A node drag uses Pointer Events, so a mouse, a pen, and a finger all
  //   drive it. A finger drag on Android delivers `touch*` events and no
  //   synthesized `mouse*` events at all — measured on a Pixel 7 Pro, see
  //   `specs/features/entity-graph-node-dragging/manual-verification.md` — so
  //   a mouse-only drag silently never starts on touch. A finger drag also has
  //   to be kept from turning into a scroll — see the `touchmove` effect below.
  // - A background pan stays on mouse events. On a phone, a finger swipe on
  //   empty canvas scrolls the work-area pane natively instead, which is how a
  //   narrow screen reaches the part of the fixed-width canvas past its right
  //   edge; converting the pan would take that away.
  //
  // With a mouse both families fire for one gesture, but a node drag starts
  // only on the node's `pointerdown` (it has no mousedown handler) and a pan
  // only on the background's `mousedown`, so neither is applied twice.
  // `dragOriginRef` and `nodeDragRef` are never both set at once.
  React.useEffect(() => {
    const handleMouseMove = (event: MouseEvent): void => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      setPan({
        x: origin.startPanX + (event.clientX - origin.startClientX),
        y: origin.startPanY + (event.clientY - origin.startClientY),
      });
    };
    const handleMouseUp = (): void => {
      dragOriginRef.current = null;
    };

    const handlePointerMove = (event: PointerEvent): void => {
      const nodeDrag = nodeDragRef.current;
      // Only the pointer that started the drag moves the node, so a second
      // finger landing mid-drag cannot take it over.
      if (!nodeDrag || event.pointerId !== nodeDrag.pointerId) return;

      // Click/drag discrimination (entity-graph-node-dragging, FR-6/FR-7):
      // a RAW client-pixel distance from the gesture's start point,
      // compared directly against `DRAG_CLICK_THRESHOLD_PX` with NO
      // viewBox conversion and NO division by `scale` — a deliberately
      // separate number from the reposition delta computed below, which
      // *is* converted and scale-divided. Once true, this never resets
      // until the next pointerdown starts a fresh gesture.
      if (!nodeDrag.exceededThreshold) {
        const rawDeltaX = event.clientX - nodeDrag.startClientX;
        const rawDeltaY = event.clientY - nodeDrag.startClientY;
        if (Math.hypot(rawDeltaX, rawDeltaY) > DRAG_CLICK_THRESHOLD_PX) {
          nodeDrag.exceededThreshold = true;
          // A gesture that becomes a drag can never also become a long-press
          // (FR-15's long-press is stationary by definition) — cancel the
          // pending timer the moment it's disqualified, rather than letting
          // it fire later and check `exceededThreshold` on its own.
          if (longPressTimerRef.current !== null) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }
      }

      // Same client-pixel -> viewBox-unit conversion the wheel handler
      // derives: `getBoundingClientRect()`, falling back to a 1:1 ratio
      // when the element is zero-sized (jsdom), then accounting for the
      // canvas's current `scale` (entity-graph-node-dragging, FR-7).
      const el = svgRef.current;
      const rect = el?.getBoundingClientRect() ?? null;
      const toViewBoxX = rect && rect.width > 0 ? width / rect.width : 1;
      const toViewBoxY = rect && rect.height > 0 ? height / rect.height : 1;
      const currentScale = scaleRef.current;
      const deltaX =
        ((event.clientX - nodeDrag.startClientX) * toViewBoxX) / currentScale;
      const deltaY =
        ((event.clientY - nodeDrag.startClientY) * toViewBoxY) / currentScale;
      const nextPosition = {
        x: nodeDrag.startX + deltaX,
        y: nodeDrag.startY + deltaY,
      };
      setNodePositionOverrides((prev) => {
        const next = new Map(prev);
        next.set(nodeDrag.entityId, nextPosition);
        return next;
      });
    };
    const handlePointerEnd = (event: PointerEvent): void => {
      const nodeDrag = nodeDragRef.current;
      if (!nodeDrag || event.pointerId !== nodeDrag.pointerId) return;
      // A release or cancel before the long-press timer elapses means the
      // gesture ended before it could ever qualify as a long-press — cancel
      // the timer so it never fires for a pointer that is no longer down.
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      // Stash the outcome before clearing `nodeDragRef` (entity-graph-node-
      // dragging, FR-6; extended by Feature 68, Task 15 for a completed
      // long-press): `pointerup` fires before the browser's native `click` on
      // the same element, so `handleNodeClick` needs a way to see "this
      // release just finished a drag or a long-press" after
      // `nodeDragRef.current` has already gone back to null. A
      // `pointercancel` is never followed by a click, so it records no
      // outcome for either case. A completed long-press (`longPressFired`)
      // suppresses the next click the same way a drag past the threshold
      // does, even though `exceededThreshold` is false for a long-press by
      // definition (it is stationary) — without this `||`, this
      // unconditional recomputation on every release would otherwise
      // overwrite back to `false` the flag the long-press timer itself
      // already set on the gesture record.
      justDraggedPastThresholdRef.current =
        event.type === "pointerup" &&
        (nodeDrag.exceededThreshold || nodeDrag.longPressFired);
      nodeDragRef.current = null;

      // Persists the released position once a real drag gesture (not a
      // plain click) ends (Task 13, FR-13), via Task 12's transport. Reads
      // `projectId`/`activeConnectionTypesKey`/the final resolved position
      // from refs rather than closed-over state/props, since this handler is
      // registered once inside a long-lived effect (deps: `[width, height]`)
      // and would otherwise see stale values from whatever render first
      // mounted it.
      const projectIdForSave = projectIdRef.current;
      if (
        event.type === "pointerup" &&
        nodeDrag.exceededThreshold &&
        projectIdForSave
      ) {
        const finalPosition = nodePositionOverridesRef.current.get(
          nodeDrag.entityId,
        );
        if (finalPosition) {
          const connectionTypesSnapshot =
            activeConnectionTypesKeyRef.current.length > 0
              ? activeConnectionTypesKeyRef.current.split(",")
              : [];
          void saveEntityGraphPosition(
            projectIdForSave,
            nodeDrag.entityId,
            finalPosition.x,
            finalPosition.y,
            connectionTypesSnapshot,
          ).catch((err: unknown) => {
            // Failure-visibility floor: a failed save must not pretend the
            // drag never happened (the live override already applied stays
            // in place — see no rollback below), but it must not block
            // rendering or throw out of this handler either.
            console.error(
              "Failed to save the entity graph node position.",
              err,
            );
          });
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      // Drops any still-pending long-press timer on unmount so it never
      // fires against a component instance that no longer exists.
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, [width, height]);

  // Keeps a finger drag on a node from turning into a page scroll. Measured on
  // a Pixel 7 Pro WebView: with only `touch-action: none` on the node's `<g>`
  // — which the node still sets, and which does compute to `none` — the
  // browser still claimed the gesture after four moves, scrolled the
  // work-area pane, and ended the drag with `pointercancel`, so the node moved
  // a few units and stopped. Calling `preventDefault()` on each cancelable
  // `touchmove` while a node drag is in progress stops the scroll before it
  // starts; on the same device that gave an uninterrupted drag ending in
  // `pointerup`, with the pane unscrolled. It has to be a native non-passive
  // listener for the same reason as the wheel handler below: React attaches
  // `onTouchMove` passively, which would silently drop the `preventDefault()`.
  // Only a drag already started by a node's `pointerdown` is ever prevented,
  // so a tap is unaffected and a swipe on empty canvas still scrolls the pane.
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handleTouchMove = (event: TouchEvent): void => {
      if (nodeDragRef.current && event.cancelable) event.preventDefault();
    };
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", handleTouchMove);
  }, []);

  // A non-passive native `wheel` listener, following this codebase's own
  // `Timeline.tsx` precedent for wheel-driven zoom: React's synthetic
  // `onWheel` is attached passively by default, which would silently drop
  // `preventDefault()` and let the page scroll along with the zoom.
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const previousScale = scaleRef.current;
      const factor = event.deltaY < 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;
      const nextScale = clampScale(previousScale * factor);
      // Already at a `clampScale` bound: scale cannot change, so neither may
      // `pan` — otherwise wheeling at the zoom limit would drift the graph
      // sideways with no visible zoom to justify it.
      if (nextScale === previousScale) return;

      // The zoom anchor: the graph point under the cursor must stay under the
      // cursor. With the `translate(pan) scale(scale)` transform applied in
      // that order, a viewBox point `p` maps from graph point `g` as
      // `p = pan + g * scale`, so holding `g` fixed across a scale change
      // gives `nextPan = p - (p - pan) * (nextScale / previousScale)`.
      //
      // `p` must be in viewBox units, not client pixels. The two coincide
      // only while the SVG renders at exactly its `width`/`height`; a CSS
      // rule that stretches it would otherwise skew the anchor, so the
      // client offset is scaled by the rendered-to-viewBox ratio. When the
      // element is unlaid-out (zero-sized, as in jsdom) the ratio is
      // meaningless, so the raw offset is used.
      const rect = el.getBoundingClientRect();
      const toViewBoxX = rect.width > 0 ? width / rect.width : 1;
      const toViewBoxY = rect.height > 0 ? height / rect.height : 1;
      const pointerX = (event.clientX - rect.left) * toViewBoxX;
      const pointerY = (event.clientY - rect.top) * toViewBoxY;

      const ratio = nextScale / previousScale;
      const previousPan = panRef.current;
      setScale(nextScale);
      setPan({
        x: pointerX - (pointerX - previousPan.x) * ratio,
        y: pointerY - (pointerY - previousPan.y) * ratio,
      });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [width, height]);

  // The single activation path for a node — toggles the selection ring and
  // fires `onNodeActivated` (Task 7, FR-9). Both a pointer click (via
  // `handleNodeClick`) and a keyboard Enter/Space on the node's `<g>` end
  // here, so there is no divergent second implementation of "what
  // activation means."
  const handleNodeActivate = React.useCallback(
    (entityId: string) => {
      setSelectedNodeId((current) => (current === entityId ? null : entityId));
      onNodeActivated?.(entityId);
    },
    [onNodeActivated],
  );

  // Resets pan/zoom back to the canvas's own default framing (Entity Graph
  // canvas-sizing polish, reset-view minifix). `computeGraphLayout` always
  // settles its simulation centered on `width/2, height/2` at an implicit
  // 1:1 scale, so pan `{0, 0}` and scale `1` is exactly that framing — no
  // separate "fit to bounds" computation is needed. Node drag overrides and
  // the current selection are left untouched: this resets the camera, not
  // the graph's own layout.
  const handleResetView = React.useCallback(() => {
    setPan({ x: 0, y: 0 });
    setScale(1);
  }, []);

  // A node's `click`: suppressed when it is the click that ends a gesture
  // just classified as a drag past the threshold (entity-graph-node-
  // dragging, FR-6) or a completed long-press (Feature 68, Task 15, FR-15),
  // otherwise an ordinary activation — UNLESS the click itself carries the
  // shift modifier, which is a wholly separate gesture: it sets the focal
  // point and returns, never calling `handleNodeActivate`, so a plain click's
  // existing select-and-navigate behavior (toggling `selectedNodeId`, calling
  // `onNodeActivated`) is completely unaffected by this branch. The
  // suppression flag is consumed so it applies to that one click only.
  const handleNodeClick = React.useCallback(
    (event: React.MouseEvent<SVGGElement>, entityId: string) => {
      if (justDraggedPastThresholdRef.current) {
        justDraggedPastThresholdRef.current = false;
        return;
      }
      if (event.shiftKey) {
        handleFocalPointGesture(entityId);
        return;
      }
      handleNodeActivate(entityId);
    },
    [handleNodeActivate, handleFocalPointGesture],
  );

  const handleNodeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<SVGGElement>, entityId: string) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      // Prevent the browser's default Space-triggered page scroll, matching
      // a native <button>'s own keydown handling for the same key.
      event.preventDefault();
      handleNodeActivate(entityId);
    },
    [handleNodeActivate],
  );

  // Hint-affordance hover tracking (Feature 68, Task 15, OQ-9): mouse-only
  // (`onMouseEnter`/`onMouseLeave`, not Pointer Events) since the hint is a
  // desktop-only discoverability aid for the shift-click modifier — it has no
  // analogous "show before you commit" moment on touch, where the gesture
  // (long-press) is discovered by holding, not hovering.
  const handleNodeMouseEnter = React.useCallback((entityId: string) => {
    setHoveredNodeId(entityId);
  }, []);
  const handleNodeMouseLeave = React.useCallback((entityId: string) => {
    setHoveredNodeId((current) => (current === entityId ? null : current));
  }, []);

  // Hover-in on an edge's hit-target (desktop pointer devices, FR-1): opens
  // that edge's tooltip, marked "hover"-sourced so only `onMouseLeave`
  // dismisses it.
  const handleEdgeMouseEnter = React.useCallback(
    (event: React.MouseEvent<SVGLineElement>, positioned: PositionedEdge) => {
      setActiveTooltip({
        key: positioned.key,
        edge: positioned.edge,
        source: "hover",
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [],
  );

  // Tracks the live pointer position while a hover-sourced tooltip for this
  // same edge is already open, so the popover follows the cursor rather than
  // staying pinned to where the hover began.
  const handleEdgeMouseMove = React.useCallback(
    (event: React.MouseEvent<SVGLineElement>, positioned: PositionedEdge) => {
      setActiveTooltip((current) => {
        if (
          !current ||
          current.key !== positioned.key ||
          current.source !== "hover"
        ) {
          return current;
        }
        return { ...current, clientX: event.clientX, clientY: event.clientY };
      });
    },
    [],
  );

  // Hover-out (FR-1): only dismisses a hover-sourced tooltip for this exact
  // edge — touch input never fires this event, so it never interferes with
  // a tap-sourced tooltip's own dismiss rules (FR-5).
  const handleEdgeMouseLeave = React.useCallback(
    (positioned: PositionedEdge) => {
      setActiveTooltip((current) =>
        current?.key === positioned.key && current.source === "hover"
          ? null
          : current,
      );
    },
    [],
  );

  // Tap (touch, FR-5): a tap fires as a `click` event same as a mouse click,
  // and an edge has no other click behavior to collide with (unlike a node,
  // which activates on click — this wiring never touches a node). A tap on
  // the same hit-target that already shows its own tap-sourced tooltip
  // dismisses it; any other tap (including on a different edge) opens that
  // edge's tooltip instead.
  const handleEdgeClick = React.useCallback(
    (event: React.MouseEvent<SVGLineElement>, positioned: PositionedEdge) => {
      setActiveTooltip((current) => {
        if (current?.key === positioned.key && current.source === "tap") {
          return null;
        }
        return {
          key: positioned.key,
          edge: positioned.edge,
          source: "tap",
          clientX: event.clientX,
          clientY: event.clientY,
        };
      });
    },
    [],
  );

  // Tap elsewhere (FR-5): dismisses a tap-sourced tooltip on any click whose
  // target is not itself an edge hit-target line — a click ON a hit-target
  // is already handled by `handleEdgeClick`'s own toggle above, so this
  // listener leaves that case alone (its own `current` check below would
  // otherwise re-close a tooltip `handleEdgeClick` just reopened for a
  // different edge, on the very same click).
  React.useEffect(() => {
    const handleDocumentClick = (event: MouseEvent): void => {
      const target = event.target as Element | null;
      const clickedHitTarget = target?.closest(
        '[data-testid="entity-graph-edge-hit-target"]',
      );
      if (clickedHitTarget) return;
      setActiveTooltip((current) =>
        current?.source === "tap" ? null : current,
      );
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  // Where the open tooltip is drawn (entity-graph-edge-tooltips, FR-10). It
  // depends on the tooltip's own measured size, so it is computed after the
  // tooltip renders. `key` ties a placement to the tooltip it was computed
  // for; until one exists, the tooltip renders hidden at the viewport origin,
  // where its width is not narrowed by being near the right edge, and is
  // measured there.
  const [tooltipPlacement, setTooltipPlacement] = React.useState<{
    key: string;
    left: number;
    top: number;
  } | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  // The measured size of the tooltip text last shown, reused while the
  // pointer moves along the same edge so a move re-places the tooltip
  // without re-measuring it.
  const tooltipSizeRef = React.useRef<{
    text: string;
    width: number;
    height: number;
  } | null>(null);

  // Places the open tooltip beside the pointer, fully on-screen, on whichever
  // side covers the least of the hovered edge's two endpoint nodes — the
  // nodes a reader inspecting that edge is looking at (FR-10). Measured with
  // the old fixed above-right offset, the tooltip covered one of them in 54%
  // of hovers. A layout effect, so the placement commits before paint and the
  // hidden measuring pass is never seen.
  React.useLayoutEffect(() => {
    if (!activeTooltip) {
      setTooltipPlacement(null);
      return;
    }
    const el = tooltipRef.current;
    const svg = svgRef.current;
    if (!el || !svg) return;

    const text = el.textContent ?? "";
    let size = tooltipSizeRef.current;
    if (!size || size.text !== text) {
      const measured = el.getBoundingClientRect();
      size = { text, width: measured.width, height: measured.height };
      tooltipSizeRef.current = size;
    }

    const endpointIds = new Set(edgeEndpoints(activeTooltip.edge));
    const avoid = Array.from(
      svg.querySelectorAll<SVGGElement>('[data-testid="entity-graph-node"]'),
    )
      .filter((node) =>
        endpointIds.has(node.getAttribute("data-entity-id") ?? ""),
      )
      .map((node) => node.getBoundingClientRect());

    // `clientWidth`/`clientHeight` exclude a scrollbar, which a fixed-position
    // tooltip cannot draw under; jsdom reports them as 0, hence the fallback.
    const viewport = document.documentElement;
    const next = chooseTooltipPlacement({
      pointerX: activeTooltip.clientX,
      pointerY: activeTooltip.clientY,
      width: size.width,
      height: size.height,
      viewportWidth: viewport.clientWidth || window.innerWidth,
      viewportHeight: viewport.clientHeight || window.innerHeight,
      avoid,
    });
    setTooltipPlacement((prev) =>
      prev &&
      prev.key === activeTooltip.key &&
      prev.left === next.left &&
      prev.top === next.top
        ? prev
        : { key: activeTooltip.key, ...next },
    );
  }, [activeTooltip]);

  const placedTooltip =
    activeTooltip && tooltipPlacement?.key === activeTooltip.key
      ? tooltipPlacement
      : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {projectId ? (
        <div style={{ position: "absolute", top: 8, right: 52, zIndex: 1 }}>
          <EntityGraphSettingsPanel
            projectId={projectId}
            onSettingsSaved={onSettingsSaved}
          />
        </div>
      ) : null}
      <Button
        type="button"
        variant="icon"
        aria-label="Reset view"
        title="Reset view"
        data-testid="entity-graph-reset-view"
        onClick={handleResetView}
        style={{ position: "absolute", top: 8, right: 8, zIndex: 1 }}
      >
        <Maximize2 size={14} />
      </Button>
      <svg
        ref={svgRef}
        /* Not `role="img"`. Every node `<g>` inside is `tabIndex={0}`
           `role="button"` (FR-9), and `img` declares the subtree a single
           graphic with no interactive parts — axe's `nested-interactive`.
           `group` keeps the label while admitting that the thing contains
           controls. */
        role="group"
        aria-label="Entity relationship graph canvas"
        className={className}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        data-testid="entity-graph-canvas"
        style={{ backgroundColor: "var(--color-gw-chrome)" }}
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          data-testid="entity-graph-canvas-background"
          onMouseDown={handleBackgroundMouseDown}
        />
        <defs>
          {/*
          Arrowhead for authored edges only (FR-7): `orient="auto"` rotates
          the marker to follow the `<line>`'s own direction from its start
          (x1/y1, the source) to its end (x2/y2, the target), so the
          arrowhead's point always faces the target regardless of the pair's
          screen position. A co-occurrence edge never references this marker,
          leaving it undirected per Feature 37's own unordered-pair guarantee.
        */}
          <marker
            id={arrowheadId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path
              d="M0,0 L10,5 L0,10 Z"
              style={{ fill: "var(--color-gw-secondary)" }}
            />
          </marker>
        </defs>
        <g
          data-testid="entity-graph-viewport"
          transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}
        >
          <g data-testid="entity-graph-edges">
            {positionedEdges.map((positioned) => {
              const { edge } = positioned;
              const isAuthored = edge.kind === "authored";
              // Per-kind visual encoding (Feature 68, Task 8, FR-6/OQ-5): see
              // `edgeStrokeWidth`/`edgeDashArray`/`edgeOpacity` above for the
              // full rationale per kind. In short — authored: solid, fixed
              // width, directed (arrowhead, below); cooccurrence: dashed
              // "5 4", undirected, width scales with sharedResourceCount;
              // backlinks: dash-dot "10 4 2 4", undirected, fixed width;
              // proximityMentions: fine dots "1 3", undirected, fixed width,
              // opacity scales (inversely) with weight — opacity rather than
              // width, so it never looks identical to cooccurrence's
              // thickness-scaled edges when both are active; sharedMetadata:
              // short even dashes "3 3", undirected, fixed width. Every
              // pairwise combination among the five kinds differs by dash
              // pattern alone, before directedness or opacity are even
              // considered.
              const strokeWidth = edgeStrokeWidth(edge);
              const dashArray = edgeDashArray(edge);
              // Resolve each endpoint from the live position override for
              // that entity, if one exists, else `computeGraphLayout`'s own
              // fixed x1/y1/x2/y2 (entity-graph-node-dragging, FR-3). This
              // happens fresh on every render, reading current
              // `nodePositionOverrides` state directly — it is not memoized
              // alongside `positionedEdges`, so a drag in progress on either
              // endpoint's entity is reflected immediately without waiting
              // on `computeGraphLayout` to rerun (which it never does for a
              // drag; FR-2).
              const [sourceEntityId, targetEntityId] = edgeEndpoints(edge);
              // Hop-radius dimming (Feature 68, Task 16, FR-17/FR-20): an
              // edge is within the focal radius only when BOTH its endpoints
              // are — a dangling edge reaching just outside the radius is
              // de-emphasized along with the node it reaches, rather than
              // rendered as if it stopped short. Multiplied onto the edge's
              // own per-kind opacity (`edgeOpacity`) rather than replacing it,
              // so a dimmed proximity-mentions edge's own weight-based
              // opacity is still visible, just scaled down further. A `1`
              // multiplier (no focal point set, or both endpoints in range)
              // leaves every edge's existing opacity completely unchanged.
              const isEdgeWithinFocalHopRadius =
                isWithinFocalHopRadius(sourceEntityId) &&
                isWithinFocalHopRadius(targetEntityId);
              const opacity =
                edgeOpacity(edge) *
                (isEdgeWithinFocalHopRadius ? 1 : FOCAL_HOP_DIM_OPACITY);
              const source = resolveEntityPosition(
                sourceEntityId,
                layoutPositionById.get(sourceEntityId),
                nodePositionOverrides,
                positioned.x1,
                positioned.y1,
              );
              const target = resolveEntityPosition(
                targetEntityId,
                layoutPositionById.get(targetEntityId),
                nodePositionOverrides,
                positioned.x2,
                positioned.y2,
              );
              return (
                <React.Fragment key={positioned.key}>
                  <line
                    data-testid="entity-graph-edge"
                    data-edge-kind={positioned.edge.kind}
                    data-focal-dimmed={
                      isEdgeWithinFocalHopRadius ? "false" : "true"
                    }
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dashArray}
                    opacity={opacity}
                    markerEnd={isAuthored ? `url(#${arrowheadId})` : undefined}
                    style={{ stroke: "var(--color-gw-secondary)" }}
                  />
                  {/*
                  Invisible wide hit-target line (Task 4): same endpoints as
                  the visible edge line above, but a fixed, much wider
                  `strokeWidth` and a fully transparent stroke, so it exists
                  purely to make the edge reliably hoverable/tappable without
                  changing anything a sighted user sees. Tooltip wiring on
                  top of this element is Task 5's job, not this one's.
                */}
                  <line
                    data-testid="entity-graph-edge-hit-target"
                    data-edge-kind={positioned.edge.kind}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    strokeWidth={EDGE_HIT_TARGET_STROKE_WIDTH}
                    stroke="transparent"
                    onMouseEnter={(event) =>
                      handleEdgeMouseEnter(event, positioned)
                    }
                    onMouseMove={(event) =>
                      handleEdgeMouseMove(event, positioned)
                    }
                    onMouseLeave={() => handleEdgeMouseLeave(positioned)}
                    onClick={(event) => handleEdgeClick(event, positioned)}
                    style={{ cursor: "pointer" }}
                  />
                </React.Fragment>
              );
            })}
          </g>
          <g data-testid="entity-graph-nodes">
            {positionedNodes.map((node) => {
              const isSelected = node.entityId === selectedNodeId;
              const isFocalPoint = node.entityId === resolvedFocalEntityId;
              const isHovered = node.entityId === hoveredNodeId;
              // Hop-radius dimming (Feature 68, Task 16, FR-17/FR-20): `true`
              // (full opacity) whenever no focal point is set at all, so a
              // dragless, focal-point-less render is pixel-for-pixel
              // unchanged from before this task.
              const isNodeWithinFocalHopRadius = isWithinFocalHopRadius(
                node.entityId,
              );
              // Resolved position (entity-graph-node-dragging, FR-2): a live
              // drag override for this node if one exists, else
              // `computeGraphLayout`'s own settled `x`/`y`.
              const override = nodePositionOverrides.get(node.entityId);
              const resolvedX = override?.x ?? node.x;
              const resolvedY = override?.y ?? node.y;
              // Per-kind color+shape resolution (Feature 69, Task 8,
              // FR-1/FR-4/FR-5): a persisted mapping for this node's
              // `entityKind`, if one exists, else Task 5's deterministic
              // hash-assigned fallback shape paired with the neutral default
              // color. Both are always resolved together from the same
              // source — there is no path here that applies one without the
              // other.
              const kindStyle =
                kindStyleByKind.get(node.entityKind) ??
                getEntityKindFallbackStyle(node.entityKind);
              const shapeGeometry = getEntityKindShapeGeometry(
                kindStyle.shape,
                NODE_RADIUS,
              );
              return (
                <g
                  key={node.entityId}
                  data-testid="entity-graph-node"
                  data-entity-id={node.entityId}
                  data-selected={isSelected ? "true" : "false"}
                  data-focal-point={isFocalPoint ? "true" : "false"}
                  // Hop-radius dim state (Feature 68, Task 16): set on the
                  // node's own `<g>` — rather than, say, a separate wrapping
                  // element — and implemented as the `opacity` style below
                  // rather than `display`/`visibility`, so every existing
                  // interaction (click/keyboard activation, drag, hover hint)
                  // keeps working completely unchanged on a dimmed node; only
                  // its rendered opacity differs (FR-20: canvas-only
                  // de-emphasis, never a change to what's selectable/focusable,
                  // and never anything the accessible list's own independent
                  // reachability has to account for).
                  data-focal-dimmed={
                    isNodeWithinFocalHopRadius ? "false" : "true"
                  }
                  transform={`translate(${resolvedX}, ${resolvedY})`}
                  opacity={
                    isNodeWithinFocalHopRadius ? 1 : FOCAL_HOP_DIM_OPACITY
                  }
                  onPointerDown={(event) =>
                    handleNodePointerDown(event, node.entityId, node.x, node.y)
                  }
                  onClick={(event) => handleNodeClick(event, node.entityId)}
                  onKeyDown={(event) => handleNodeKeyDown(event, node.entityId)}
                  onMouseEnter={() => handleNodeMouseEnter(node.entityId)}
                  onMouseLeave={() => handleNodeMouseLeave(node.entityId)}
                  tabIndex={0}
                  role="button"
                  aria-label={node.name}
                  style={{ cursor: "pointer", touchAction: "none" }}
                >
                  {isSelected ? (
                    <circle
                      r={NODE_RADIUS + 4}
                      fill="none"
                      strokeWidth={2}
                      data-testid="entity-graph-node-selection-ring"
                      style={{ stroke: "var(--color-gw-primary)" }}
                    />
                  ) : null}
                  {/*
                  Node shape+color (Feature 69, Task 8, FR-1/FR-4): drawn from
                  `shapeGeometry` (Task 1's fixed six-shape set, resolved
                  above via the persisted kind-style mapping or Task 5's
                  deterministic fallback) rather than always rendering a
                  circle. `kind-style`'s color is a token-slot reference
                  (e.g. `"entity-kind-0"`, or `"entity-kind-default"` for the
                  fallback) resolved to its CSS custom property name at render
                  time via inline `style={{ fill: ... }}` — mirroring every
                  other `--color-gw-*` fill/stroke usage in this file — never
                  a JS object/array mapping a slot index to a literal hex
                  value.
                */}
                  {shapeGeometry.kind === "circle" ? (
                    <circle
                      r={shapeGeometry.radius}
                      strokeWidth={1.5}
                      style={{
                        fill: `var(--${kindStyle.color})`,
                        stroke: "var(--color-gw-border-md)",
                      }}
                    />
                  ) : (
                    <path
                      d={shapeGeometry.d}
                      strokeWidth={1.5}
                      style={{
                        fill: `var(--${kindStyle.color})`,
                        stroke: "var(--color-gw-border-md)",
                      }}
                    />
                  )}
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    style={{ fill: "var(--color-gw-primary)" }}
                  >
                    {node.name}
                  </text>
                  {isHovered ? (
                    // Hint affordance (Feature 68, Task 15, OQ-9 first pass):
                    // a small icon shown only on hover, surfacing the
                    // shift-click/long-press modifier gesture non-color-only
                    // (docs/standards/accessibility.md) — an icon shape, not
                    // a color change. `aria-hidden` since it is a redundant,
                    // discoverability-only hint with no hover-equivalent
                    // keyboard path (mirroring the edge tooltip's own
                    // keyboard-inaccessibility, which the accessible list,
                    // not this hint, already covers); `<title>` still gives a
                    // native tooltip on a sighted mouse user's own hover.
                    <g
                      data-testid="entity-graph-node-focal-hint"
                      aria-hidden="true"
                      transform={`translate(${NODE_RADIUS - 6}, ${-(NODE_RADIUS - 6)})`}
                    >
                      <circle
                        r={9}
                        strokeWidth={1}
                        style={{
                          fill: "var(--color-gw-chrome)",
                          stroke: "var(--color-gw-border-md)",
                        }}
                      />
                      <Target
                        width={12}
                        height={12}
                        x={-6}
                        y={-6}
                        style={{ color: "var(--color-gw-primary)" }}
                      >
                        <title>
                          Shift-click or long-press to set this entity as the
                          graph&apos;s focal point
                        </title>
                      </Target>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      {activeTooltip && (
        <div
          ref={tooltipRef}
          className="entity-graph-edge-tooltip"
          data-testid="entity-graph-edge-tooltip"
          role="tooltip"
          style={
            placedTooltip
              ? {
                  position: "fixed",
                  left: placedTooltip.left,
                  top: placedTooltip.top,
                }
              : { position: "fixed", left: 0, top: 0, visibility: "hidden" }
          }
        >
          {describeEdge(activeTooltip.edge, nameById)}
        </div>
      )}
    </div>
  );
}
