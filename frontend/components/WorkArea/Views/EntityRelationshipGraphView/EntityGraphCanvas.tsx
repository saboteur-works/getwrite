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
 * Edge-kind visual distinction (dashed vs. solid, arrowheads, thickness) is
 * deliberately out of scope here — every edge renders as a plain, uniform
 * line for now (Task 5's scope) — and pan, zoom, and click-selection are not
 * wired yet (Task 6's scope). This task's positioning and hit-testing are
 * limited to placing nodes/edges at their settled coordinates.
 *
 * Theming uses this repo's `--color-gw-*` CSS custom properties (brand
 * tokens), the same tokens `EntityRosterRow.tsx` uses inline for its own
 * "needs attention" styling. These tokens are reassigned for light mode by
 * `.appshell-shell` (`styles/getwrite-utilities.css`), so this component
 * needs no dark/light branching of its own — reading the same variable
 * picks up whichever mode is active in its ancestor tree. `--color-gw-red`
 * (`#D44040`, reserved for position/canonical-state indicators) is not used
 * anywhere in this file.
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

  return (
    <svg
      role="img"
      aria-label="Entity relationship graph canvas"
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="entity-graph-canvas"
      style={{ backgroundColor: "var(--color-gw-chrome)" }}
    >
      <g data-testid="entity-graph-edges">
        {positionedEdges.map((positioned) => (
          <line
            key={positioned.key}
            data-testid="entity-graph-edge"
            data-edge-kind={positioned.edge.kind}
            x1={positioned.x1}
            y1={positioned.y1}
            x2={positioned.x2}
            y2={positioned.y2}
            strokeWidth={1.5}
            style={{ stroke: "var(--color-gw-secondary)" }}
          />
        ))}
      </g>
      <g data-testid="entity-graph-nodes">
        {positionedNodes.map((node) => (
          <g
            key={node.entityId}
            data-testid="entity-graph-node"
            data-entity-id={node.entityId}
            transform={`translate(${node.x}, ${node.y})`}
          >
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
        ))}
      </g>
    </svg>
  );
}
