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
 * `[MIN_SCALE, MAX_SCALE]`. Both are applied via a single wrapping
 * `<g transform="translate(...) scale(...)">` around the existing edges and
 * nodes groups, so neither Task 4's layout math nor Task 5's edge-kind
 * markup needed to change — only wrapping. Clicking a node toggles that
 * node's id as the sole `selectedNodeId`, rendered as an extra highlight
 * ring (a second `<circle>`) on that node only, using the existing
 * `--color-gw-primary` token — never the reserved red token. No keyboard-driven
 * graph traversal is added here (out of scope per OQ-4); node activation via
 * keyboard (FR-9) remains a separate, later concern.
 */
export default function EntityGraphCanvas({
  nodes,
  edges,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className = "",
}: EntityGraphCanvasProps): JSX.Element {
  const { positionedNodes, positionedEdges } = React.useMemo(
    () => computeGraphLayout(nodes, edges, width, height),
    [nodes, edges, width, height],
  );

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

  // Drag state lives in a ref, not React state, since a mousemove needs to
  // read it on every pointer move without forcing a re-render per pixel; the
  // only state updates that matter for rendering are the `pan` writes below.
  const dragOriginRef = React.useRef<{
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

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

  // Drag continuation and release are tracked on `window`, not the `<rect>`
  // itself, so a drag already in progress keeps updating even once the
  // pointer moves outside the SVG's own bounds — the same reason a native
  // drag gesture is normally wired at the document level.
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
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
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
      const factor = event.deltaY < 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;
      setScale((previous) => clampScale(previous * factor));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleNodeClick = React.useCallback((entityId: string) => {
    setSelectedNodeId((current) => (current === entityId ? null : entityId));
  }, []);

  return (
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
            return (
              <line
                key={positioned.key}
                data-testid="entity-graph-edge"
                data-edge-kind={positioned.edge.kind}
                x1={positioned.x1}
                y1={positioned.y1}
                x2={positioned.x2}
                y2={positioned.y2}
                strokeWidth={strokeWidth}
                strokeDasharray={
                  isAuthored ? undefined : COOCCURRENCE_DASH_ARRAY
                }
                markerEnd={isAuthored ? `url(#${arrowheadId})` : undefined}
                style={{ stroke: "var(--color-gw-secondary)" }}
              />
            );
          })}
        </g>
        <g data-testid="entity-graph-nodes">
          {positionedNodes.map((node) => {
            const isSelected = node.entityId === selectedNodeId;
            return (
              <g
                key={node.entityId}
                data-testid="entity-graph-node"
                data-entity-id={node.entityId}
                data-selected={isSelected ? "true" : "false"}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => handleNodeClick(node.entityId)}
                style={{ cursor: "pointer" }}
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
  );
}
