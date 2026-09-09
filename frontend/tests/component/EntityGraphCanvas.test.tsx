/**
 * Component tests for `EntityGraphCanvas` (entity-relationship-graph Task 4)
 * — the hand-rolled SVG rendering surface: one visual element per node and
 * per edge, positions computed by `d3-force` and never persisted anywhere
 * (FR-13), and no use of the reserved red/`#D44040` token for either edge
 * kind (FR-6's colour constraint, this task's own no-conflict scope).
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import EntityGraphCanvas from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas";
import type {
  EntityGraphEdge,
  EntityGraphNode,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";

const NODES: EntityGraphNode[] = [
  { entityId: "e-1", name: "Anna", entityKind: "character" },
  { entityId: "e-2", name: "Ben", entityKind: "character" },
  { entityId: "e-3", name: "Castle Greywatch", entityKind: "place" },
];

const EDGES: EntityGraphEdge[] = [
  {
    kind: "cooccurrence",
    entityIdA: "e-1",
    entityIdB: "e-2",
    sharedResourceCount: 3,
  },
  {
    kind: "authored",
    id: "rel-1",
    sourceEntityId: "e-2",
    targetEntityId: "e-3",
    relationshipType: "lives in",
  },
];

const RESERVED_RED_HEX = "#d44040";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EntityGraphCanvas", () => {
  it("renders one visual node element per fixture node and one visual edge element per fixture edge", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const svg = screen.getByTestId("entity-graph-canvas");
    expect(svg.tagName.toLowerCase()).toBe("svg");

    const nodeElements = screen.getAllByTestId("entity-graph-node");
    expect(nodeElements).toHaveLength(NODES.length);
    expect(
      nodeElements
        .map((el: HTMLElement) => el.getAttribute("data-entity-id"))
        .sort(),
    ).toEqual(NODES.map((n) => n.entityId).sort());

    const edgeElements = screen.getAllByTestId("entity-graph-edge");
    expect(edgeElements).toHaveLength(EDGES.length);
  });

  it("gives every node a positioned coordinate rather than leaving it at the origin", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const nodeElements = screen.getAllByTestId("entity-graph-node");
    for (const el of nodeElements) {
      const transform = el.getAttribute("transform") ?? "";
      expect(transform).toMatch(/^translate\(-?[\d.]+, -?[\d.]+\)$/);
    }
  });

  it("renders zero nodes and zero edges for empty fixture data, not an error", () => {
    render(<EntityGraphCanvas nodes={[]} edges={[]} />);

    expect(screen.queryAllByTestId("entity-graph-node")).toHaveLength(0);
    expect(screen.queryAllByTestId("entity-graph-edge")).toHaveLength(0);
  });

  it("never reads from or writes to localStorage for position data", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const { rerender } = render(
      <EntityGraphCanvas nodes={NODES} edges={EDGES} />,
    );
    // Re-render with the identical input data, exactly the case FR-13 rules
    // out ever persisting or resuming from.
    rerender(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("never calls fetch for position data", () => {
    const fetchSpy = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;

    try {
      const { rerender } = render(
        <EntityGraphCanvas nodes={NODES} edges={EDGES} />,
      );
      rerender(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("uses no reserved red (#D44040) fill or stroke for any node or edge", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const allStyledElements = [
      ...screen.getAllByTestId("entity-graph-node"),
      ...screen.getAllByTestId("entity-graph-edge"),
      ...document.querySelectorAll(
        '[data-testid="entity-graph-node"] circle, [data-testid="entity-graph-node"] text',
      ),
    ];

    for (const el of allStyledElements) {
      const style = el.getAttribute("style") ?? "";
      const fill = (el as HTMLElement).style?.fill ?? "";
      const stroke = (el as HTMLElement).style?.stroke ?? "";
      expect(style.toLowerCase()).not.toContain(RESERVED_RED_HEX);
      expect(style.toLowerCase()).not.toContain("--color-gw-red");
      expect(fill.toLowerCase()).not.toBe(RESERVED_RED_HEX);
      expect(stroke.toLowerCase()).not.toBe(RESERVED_RED_HEX);
    }
  });

  it("distinguishes a co-occurrence edge from an authored edge by a non-colour cue (dash pattern)", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const edgeElements = screen.getAllByTestId("entity-graph-edge");
    const cooccurrenceEdge = edgeElements.find(
      (el: HTMLElement) => el.getAttribute("data-edge-kind") === "cooccurrence",
    );
    const authoredEdge = edgeElements.find(
      (el: HTMLElement) => el.getAttribute("data-edge-kind") === "authored",
    );
    expect(cooccurrenceEdge).toBeDefined();
    expect(authoredEdge).toBeDefined();

    const cooccurrenceDash = cooccurrenceEdge!.getAttribute("stroke-dasharray");
    const authoredDash = authoredEdge!.getAttribute("stroke-dasharray");
    expect(cooccurrenceDash).not.toBeNull();
    expect(cooccurrenceDash).not.toBe(authoredDash);
  });

  it("gives an authored edge a direction-conveying arrowhead marker and a co-occurrence edge none", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const edgeElements = screen.getAllByTestId("entity-graph-edge");
    const cooccurrenceEdge = edgeElements.find(
      (el: HTMLElement) => el.getAttribute("data-edge-kind") === "cooccurrence",
    );
    const authoredEdge = edgeElements.find(
      (el: HTMLElement) => el.getAttribute("data-edge-kind") === "authored",
    );
    expect(cooccurrenceEdge).toBeDefined();
    expect(authoredEdge).toBeDefined();

    const authoredMarkerEnd = authoredEdge!.getAttribute("marker-end");
    expect(authoredMarkerEnd).toBeTruthy();
    expect(authoredMarkerEnd).toMatch(/^url\(#.+\)$/);

    // The referenced marker exists and rotates with the line's own
    // direction, which — since the authored edge's x1/y1 (its source, `e-2`)
    // and x2/y2 (its target, `e-3`) are already resolved to those entities'
    // own settled positions — is what conveys the authored edge's
    // sourceEntityId->targetEntityId direction.
    const markerId = authoredMarkerEnd!.slice(5, -1);
    const markerEl = document.getElementById(markerId);
    expect(markerEl).not.toBeNull();
    expect(markerEl?.tagName.toLowerCase()).toBe("marker");
    expect(markerEl?.getAttribute("orient")).toBe("auto");

    expect(cooccurrenceEdge!.getAttribute("marker-end")).toBeNull();
  });

  it("scales a co-occurrence edge's stroke width monotonically with its shared-resource count", () => {
    const twoCooccurrenceEdges: EntityGraphEdge[] = [
      {
        kind: "cooccurrence",
        entityIdA: "e-1",
        entityIdB: "e-2",
        sharedResourceCount: 1,
      },
      {
        kind: "cooccurrence",
        entityIdA: "e-1",
        entityIdB: "e-3",
        sharedResourceCount: 5,
      },
    ];

    render(<EntityGraphCanvas nodes={NODES} edges={twoCooccurrenceEdges} />);

    const edgeElements = screen.getAllByTestId("entity-graph-edge");
    expect(edgeElements).toHaveLength(2);

    const widths = edgeElements.map((el: HTMLElement) =>
      Number(el.getAttribute("stroke-width")),
    );
    const [countOneWidth, countFiveWidth] = widths;
    expect(Number.isNaN(countOneWidth)).toBe(false);
    expect(Number.isNaN(countFiveWidth)).toBe(false);
    expect(countFiveWidth).toBeGreaterThan(countOneWidth);
  });

  it("keeps an authored edge's stroke width fixed, not varying with anything", () => {
    const authoredEdges: EntityGraphEdge[] = [
      {
        kind: "authored",
        id: "rel-a",
        sourceEntityId: "e-1",
        targetEntityId: "e-2",
        relationshipType: "allies with",
      },
      {
        kind: "authored",
        id: "rel-b",
        sourceEntityId: "e-2",
        targetEntityId: "e-3",
        relationshipType: "lives in",
      },
    ];

    render(<EntityGraphCanvas nodes={NODES} edges={authoredEdges} />);

    const edgeElements = screen.getAllByTestId("entity-graph-edge");
    const widths = edgeElements.map((el: HTMLElement) =>
      el.getAttribute("stroke-width"),
    );
    expect(widths[0]).toBe(widths[1]);
  });
});
