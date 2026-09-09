/**
 * Component tests for `EntityGraphCanvas` (entity-relationship-graph Task 4)
 * — the hand-rolled SVG rendering surface: one visual element per node and
 * per edge, positions computed by `d3-force` and never persisted anywhere
 * (FR-13), and no use of the reserved red/`#D44040` token for either edge
 * kind (FR-6's colour constraint, this task's own no-conflict scope).
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

/**
 * Parses the wrapping viewport `<g>`'s `transform="translate(x, y) scale(s)"`
 * attribute (Task 6) into its numeric components, so pan/zoom assertions can
 * compare values rather than raw strings.
 */
function parseViewportTransform(el: Element): {
  x: number;
  y: number;
  scale: number;
} {
  const transform = el.getAttribute("transform") ?? "";
  const match = transform.match(
    /translate\(([-\d.]+),\s*([-\d.]+)\)\s*scale\(([-\d.]+)\)/,
  );
  if (!match) {
    throw new Error(`Could not parse viewport transform: "${transform}"`);
  }
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

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

  it("translates the rendered viewport when a drag gesture runs on empty canvas space", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const background = screen.getByTestId("entity-graph-canvas-background");
    const viewport = screen.getByTestId("entity-graph-viewport");
    const initial = parseViewportTransform(viewport);

    fireEvent.mouseDown(background, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 130 });
    fireEvent.mouseUp(window);

    const afterDrag = parseViewportTransform(viewport);
    expect(afterDrag.x).not.toBe(initial.x);
    expect(afterDrag.y).not.toBe(initial.y);
    expect(afterDrag.x - initial.x).toBeCloseTo(40);
    expect(afterDrag.y - initial.y).toBeCloseTo(30);
  });

  it("stops updating the viewport once the drag gesture has ended", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const background = screen.getByTestId("entity-graph-canvas-background");
    const viewport = screen.getByTestId("entity-graph-viewport");

    fireEvent.mouseDown(background, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(window);
    const afterFirstDrag = parseViewportTransform(viewport);

    // A mousemove with no preceding mousedown (drag already released) must
    // not move the viewport any further.
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
    const afterStrayMove = parseViewportTransform(viewport);

    expect(afterStrayMove.x).toBe(afterFirstDrag.x);
    expect(afterStrayMove.y).toBe(afterFirstDrag.y);
  });

  it("changes the rendered zoom scale on a wheel event, clamped within configured bounds", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const svg = screen.getByTestId("entity-graph-canvas");
    const viewport = screen.getByTestId("entity-graph-viewport");
    const initial = parseViewportTransform(viewport);
    expect(initial.scale).toBe(1);

    fireEvent.wheel(svg, { deltaY: -100 });
    const afterOneZoomIn = parseViewportTransform(viewport);
    expect(afterOneZoomIn.scale).toBeGreaterThan(initial.scale);

    // Many zoom-in ticks in a row must not exceed the configured max.
    for (let i = 0; i < 100; i += 1) {
      fireEvent.wheel(svg, { deltaY: -100 });
    }
    const afterManyZoomIn = parseViewportTransform(viewport);
    expect(afterManyZoomIn.scale).toBeLessThanOrEqual(4);

    // Many zoom-out ticks in a row must not go below the configured min.
    for (let i = 0; i < 200; i += 1) {
      fireEvent.wheel(svg, { deltaY: 100 });
    }
    const afterManyZoomOut = parseViewportTransform(viewport);
    expect(afterManyZoomOut.scale).toBeGreaterThanOrEqual(0.25);
  });

  it("anchors a wheel zoom on the pointer, keeping the graph point under the cursor fixed", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const svg = screen.getByTestId("entity-graph-canvas");
    const viewport = screen.getByTestId("entity-graph-viewport");

    // The viewBox point the cursor sits over. jsdom reports a zero-sized
    // bounding rect, which the handler treats as an unlaid-out element and
    // falls back to using the client offset directly — so these are also the
    // viewBox coordinates here.
    const pointerX = 200;
    const pointerY = 100;

    const before = parseViewportTransform(viewport);
    // The graph-space point currently rendered under the cursor, from the
    // `p = pan + g * scale` mapping the viewport transform applies.
    const graphPointBefore = {
      x: (pointerX - before.x) / before.scale,
      y: (pointerY - before.y) / before.scale,
    };

    fireEvent.wheel(svg, {
      deltaY: -100,
      clientX: pointerX,
      clientY: pointerY,
    });

    const after = parseViewportTransform(viewport);
    expect(after.scale).toBeGreaterThan(before.scale);

    const graphPointAfter = {
      x: (pointerX - after.x) / after.scale,
      y: (pointerY - after.y) / after.scale,
    };

    // The whole point of anchoring: the same graph coordinate is still under
    // the cursor. Zooming about the canvas origin instead would leave `pan`
    // untouched and slide this point away by the zoom factor.
    expect(graphPointAfter.x).toBeCloseTo(graphPointBefore.x, 6);
    expect(graphPointAfter.y).toBeCloseTo(graphPointBefore.y, 6);
    expect(after.x).not.toBe(before.x);
  });

  it("does not pan when a wheel event cannot change the scale, at a clamp bound", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const svg = screen.getByTestId("entity-graph-canvas");
    const viewport = screen.getByTestId("entity-graph-viewport");

    // Drive the scale hard against MAX_SCALE first.
    for (let i = 0; i < 100; i += 1) {
      fireEvent.wheel(svg, { deltaY: -100, clientX: 200, clientY: 100 });
    }
    const atMax = parseViewportTransform(viewport);

    // A further zoom-in tick at the bound changes nothing, including pan —
    // otherwise the graph would drift sideways with no zoom to justify it.
    fireEvent.wheel(svg, { deltaY: -100, clientX: 200, clientY: 100 });
    const afterExtraTick = parseViewportTransform(viewport);

    expect(afterExtraTick.scale).toBe(atMax.scale);
    expect(afterExtraTick.x).toBe(atMax.x);
    expect(afterExtraTick.y).toBe(atMax.y);
  });

  it("toggles a selected-state visual attribute on exactly the clicked node, not on others", () => {
    render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

    const nodeElements = screen.getAllByTestId("entity-graph-node");
    expect(nodeElements.length).toBeGreaterThanOrEqual(3);

    const [first, second, third] = nodeElements;
    expect(first.getAttribute("data-selected")).toBe("false");
    expect(second.getAttribute("data-selected")).toBe("false");
    expect(third.getAttribute("data-selected")).toBe("false");

    fireEvent.click(first);

    expect(first.getAttribute("data-selected")).toBe("true");
    expect(second.getAttribute("data-selected")).toBe("false");
    expect(third.getAttribute("data-selected")).toBe("false");
    expect(
      first.querySelector('[data-testid="entity-graph-node-selection-ring"]'),
    ).not.toBeNull();
    expect(
      second.querySelector('[data-testid="entity-graph-node-selection-ring"]'),
    ).toBeNull();

    // Clicking the same node again toggles the selection back off.
    fireEvent.click(first);
    expect(first.getAttribute("data-selected")).toBe("false");
  });

  describe("edge hit-target line (Task 4, entity-graph-edge-tooltips)", () => {
    it("renders exactly one hit-target line per fixture edge, for every edge kind", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const hitTargets = screen.getAllByTestId("entity-graph-edge-hit-target");
      expect(hitTargets).toHaveLength(EDGES.length);
      expect(
        hitTargets
          .map((el: HTMLElement) => el.getAttribute("data-edge-kind"))
          .sort(),
      ).toEqual(EDGES.map((edge) => edge.kind).sort());
    });

    it("shares its visible sibling line's x1/y1/x2/y2 endpoints", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const visibleEdges = screen.getAllByTestId("entity-graph-edge");
      const hitTargets = screen.getAllByTestId("entity-graph-edge-hit-target");
      expect(hitTargets).toHaveLength(visibleEdges.length);

      for (let i = 0; i < visibleEdges.length; i += 1) {
        const visible = visibleEdges[i];
        const hitTarget = hitTargets[i];
        expect(hitTarget.getAttribute("x1")).toBe(visible.getAttribute("x1"));
        expect(hitTarget.getAttribute("y1")).toBe(visible.getAttribute("y1"));
        expect(hitTarget.getAttribute("x2")).toBe(visible.getAttribute("x2"));
        expect(hitTarget.getAttribute("y2")).toBe(visible.getAttribute("y2"));
        expect(hitTarget.getAttribute("data-edge-kind")).toBe(
          visible.getAttribute("data-edge-kind"),
        );
      }
    });

    it("uses the Spike B-measured 12px stroke width, regardless of the visible edge's own width", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const hitTargets = screen.getAllByTestId("entity-graph-edge-hit-target");
      for (const hitTarget of hitTargets) {
        expect(hitTarget.getAttribute("stroke-width")).toBe("12");
      }
    });

    it("carries no visible stroke color, introducing no rendering change to sighted users", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const hitTargets = screen.getAllByTestId("entity-graph-edge-hit-target");
      for (const hitTarget of hitTargets) {
        expect(hitTarget.getAttribute("stroke")).toBe("transparent");
      }
    });
  });

  describe("node activation (Task 7, FR-9)", () => {
    it("calls onNodeActivated with the clicked node's entityId, alongside toggling selection", () => {
      const onNodeActivated = vi.fn();
      render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivated}
        />,
      );

      const [first] = screen.getAllByTestId("entity-graph-node");
      fireEvent.click(first);

      expect(onNodeActivated).toHaveBeenCalledTimes(1);
      expect(onNodeActivated).toHaveBeenCalledWith("e-1");
      expect(first.getAttribute("data-selected")).toBe("true");
    });

    it("calls onNodeActivated on Enter when the node's <g> has keyboard focus", () => {
      const onNodeActivated = vi.fn();
      render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivated}
        />,
      );

      const [first] = screen.getAllByTestId("entity-graph-node");
      expect(first.getAttribute("tabindex")).toBe("0");
      expect(first.getAttribute("role")).toBe("button");

      fireEvent.keyDown(first, { key: "Enter" });

      expect(onNodeActivated).toHaveBeenCalledTimes(1);
      expect(onNodeActivated).toHaveBeenCalledWith("e-1");
      expect(first.getAttribute("data-selected")).toBe("true");
    });

    it("calls onNodeActivated on Space when the node's <g> has keyboard focus", () => {
      const onNodeActivated = vi.fn();
      render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivated}
        />,
      );

      const [first] = screen.getAllByTestId("entity-graph-node");

      fireEvent.keyDown(first, { key: " " });

      expect(onNodeActivated).toHaveBeenCalledTimes(1);
      expect(onNodeActivated).toHaveBeenCalledWith("e-1");
      expect(first.getAttribute("data-selected")).toBe("true");
    });

    it("does not call onNodeActivated for an unrelated key", () => {
      const onNodeActivated = vi.fn();
      render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivated}
        />,
      );

      const [first] = screen.getAllByTestId("entity-graph-node");
      fireEvent.keyDown(first, { key: "Tab" });

      expect(onNodeActivated).not.toHaveBeenCalled();
    });

    it("does not throw and still toggles selection when onNodeActivated is not provided", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const [first] = screen.getAllByTestId("entity-graph-node");
      expect(() => fireEvent.click(first)).not.toThrow();
      expect(first.getAttribute("data-selected")).toBe("true");
    });
  });
});
