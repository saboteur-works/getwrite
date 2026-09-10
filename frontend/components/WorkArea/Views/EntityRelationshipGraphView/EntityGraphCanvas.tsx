import * as React from "react";
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
  describeCooccurrenceEdge,
} from "./edgeDescriptions";
import { chooseTooltipPlacement } from "./edgeTooltipPlacement";
import "./entityGraphTooltipOverlay.css";

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 560;
const NODE_RADIUS = 22;

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
 * Returns the two entity ids an edge connects, regardless of edge kind — a
 * co-occurrence edge's unordered pair or an authored edge's directed pair.
 */
function edgeEndpoints(edge: EntityGraphEdge): [string, string] {
  return edge.kind === "cooccurrence"
    ? [edge.entityIdA, edge.entityIdB]
    : [edge.sourceEntityId, edge.targetEntityId];
}

/**
 * A stable, unique key for an edge — used both as the React list key and as
 * the `forceLink` link's own identity. An authored edge already carries a
 * unique `id`; a co-occurrence edge has none, so its key is derived from its
 * (already-canonicalized, per `EntityRelationshipGraphView`) unordered pair.
 */
function edgeKey(edge: EntityGraphEdge): string {
  return edge.kind === "authored"
    ? `authored:${edge.id}`
    : `cooccurrence:${edge.entityIdA}:${edge.entityIdB}`;
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
  return edge.kind === "authored"
    ? describeAuthoredEdge(
        nameById,
        edge.sourceEntityId,
        edge.targetEntityId,
        edge.relationshipType,
      )
    : describeCooccurrenceEdge(
        nameById,
        edge.entityIdA,
        edge.entityIdB,
        edge.sharedResourceCount,
      );
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
}: EntityGraphCanvasProps): JSX.Element {
  const { positionedNodes, positionedEdges } = React.useMemo(
    () => computeGraphLayout(nodes, edges, width, height),
    [nodes, edges, width, height],
  );

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

  // Live, drag-authored node position overrides, keyed by `entityId`
  // (entity-graph-node-dragging, FR-2/FR-7, OQ-2). Mirrors the
  // `selectedNodeId`/`pan`/`scale` precedent exactly: plain component state,
  // held outside `computeGraphLayout`'s `useMemo` and its dependency array,
  // so a drag's override is never reset by that memo recomputing when
  // `nodes`/`edges`/`width`/`height` change.
  const [nodePositionOverrides, setNodePositionOverrides] = React.useState<
    Map<string, { x: number; y: number }>
  >(() => new Map());

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
      };
    },
    [nodePositionOverrides],
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
      // Stash the outcome before clearing `nodeDragRef` (entity-graph-node-
      // dragging, FR-6): `pointerup` fires before the browser's native
      // `click` on the same element, so `handleNodeClick` needs a way to see
      // "this release just finished a drag" after `nodeDragRef.current` has
      // already gone back to null. A `pointercancel` is never followed by a
      // click, so it records no drag outcome.
      justDraggedPastThresholdRef.current =
        event.type === "pointerup" && nodeDrag.exceededThreshold;
      nodeDragRef.current = null;
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

  // A node's `click`: suppressed when it is the click that ends a gesture
  // just classified as a drag past the threshold (entity-graph-node-
  // dragging, FR-6), otherwise an ordinary activation. The flag is consumed
  // so it applies to that one click only.
  const handleNodeClick = React.useCallback(
    (entityId: string) => {
      if (justDraggedPastThresholdRef.current) {
        justDraggedPastThresholdRef.current = false;
        return;
      }
      handleNodeActivate(entityId);
    },
    [handleNodeActivate],
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
    <>
      <svg
        ref={svgRef}
        role="img"
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
              const strokeWidth =
                edge.kind === "authored"
                  ? AUTHORED_EDGE_STROKE_WIDTH
                  : cooccurrenceStrokeWidth(edge.sharedResourceCount);
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
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    strokeWidth={strokeWidth}
                    strokeDasharray={
                      isAuthored ? undefined : COOCCURRENCE_DASH_ARRAY
                    }
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
              // Resolved position (entity-graph-node-dragging, FR-2): a live
              // drag override for this node if one exists, else
              // `computeGraphLayout`'s own settled `x`/`y`.
              const override = nodePositionOverrides.get(node.entityId);
              const resolvedX = override?.x ?? node.x;
              const resolvedY = override?.y ?? node.y;
              return (
                <g
                  key={node.entityId}
                  data-testid="entity-graph-node"
                  data-entity-id={node.entityId}
                  data-selected={isSelected ? "true" : "false"}
                  transform={`translate(${resolvedX}, ${resolvedY})`}
                  onPointerDown={(event) =>
                    handleNodePointerDown(event, node.entityId, node.x, node.y)
                  }
                  onClick={() => handleNodeClick(node.entityId)}
                  onKeyDown={(event) => handleNodeKeyDown(event, node.entityId)}
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
                  <circle
                    r={NODE_RADIUS}
                    strokeWidth={1.5}
                    style={{
                      fill: "var(--color-gw-chrome2)",
                      stroke: "var(--color-gw-border-md)",
                    }}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    style={{ fill: "var(--color-gw-primary)" }}
                  >
                    {node.name}
                  </text>
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
    </>
  );
}
