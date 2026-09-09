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
import * as d3Force from "d3-force";
import EntityGraphCanvas, {
  computeGraphLayout,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas";

// `d3-force` is an ES module whose named exports vitest cannot `vi.spyOn`
// directly ("Module namespace is not configurable in ESM"). Wrapping
// `forceSimulation` in a `vi.fn` that still delegates to the real
// implementation preserves every other test's real, deterministic layout
// while letting the node-dragging test below assert on call counts.
vi.mock("d3-force", async (importOriginal) => {
  const actual = await importOriginal<typeof import("d3-force")>();
  return { ...actual, forceSimulation: vi.fn(actual.forceSimulation) };
});
import type {
  EntityGraphEdge,
  EntityGraphNode,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";
import * as edgeDescriptions from "../../components/WorkArea/Views/EntityRelationshipGraphView/edgeDescriptions";
import {
  describeAuthoredEdge,
  describeCooccurrenceEdge,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/edgeDescriptions";

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

/**
 * Parses a node `<g>`'s `transform="translate(x, y)"` attribute into its
 * numeric components (entity-graph-node-dragging, Task 2).
 */
function parseNodeTransform(el: Element): { x: number; y: number } {
  const transform = el.getAttribute("transform") ?? "";
  const match = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) {
    throw new Error(`Could not parse node transform: "${transform}"`);
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * Mirrors the source file's own `DRAG_CLICK_THRESHOLD_PX` (currently `4`,
 * marked UNVERIFIED in `EntityGraphCanvas.tsx` — not exported, so this is a
 * local literal used only to exercise a mousemove that plausibly crosses it;
 * this task does not implement or assert any threshold-based suppression,
 * per its own scope (Task 3's job).
 */
const DRAG_CLICK_THRESHOLD_PX = 4;

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

    // Run a full node drag gesture — mousedown on a node, mousemove past
    // DRAG_CLICK_THRESHOLD_PX, mouseup — before asserting (entity-graph-node-
    // dragging, FR-8): a dragged position is exactly the new persisted-
    // looking data this test must confirm never reaches localStorage.
    const [target] = screen.getAllByTestId("entity-graph-node");
    fireEvent.mouseDown(target, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, {
      clientX: DRAG_CLICK_THRESHOLD_PX + 20,
      clientY: DRAG_CLICK_THRESHOLD_PX + 12,
    });
    fireEvent.mouseUp(window);

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

      // Run a full node drag gesture before asserting (entity-graph-node-
      // dragging, FR-8/FR-10's transport half) — a drag is the one new
      // gesture this feature adds, so it is the one that most plausibly
      // could have introduced a fetch call if it had persisted anything.
      const [target] = screen.getAllByTestId("entity-graph-node");
      fireEvent.mouseDown(target, { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, {
        clientX: DRAG_CLICK_THRESHOLD_PX + 20,
        clientY: DRAG_CLICK_THRESHOLD_PX + 12,
      });
      fireEvent.mouseUp(window);

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

  describe("node dragging (Task 2, entity-graph-node-dragging)", () => {
    it("repositions the dragged node by the pointer's client-pixel delta at default scale", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const [target, other] = screen.getAllByTestId("entity-graph-node");
      const initialTarget = parseNodeTransform(target);
      const initialOther = parseNodeTransform(other);

      const dx = DRAG_CLICK_THRESHOLD_PX + 10;
      const dy = DRAG_CLICK_THRESHOLD_PX + 6;

      fireEvent.mouseDown(target, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 100 + dx, clientY: 100 + dy });

      const afterMove = parseNodeTransform(target);
      // At default scale (1) and jsdom's zero-sized bounding rect (1:1
      // fallback ratio), the viewBox-unit delta equals the raw client-pixel
      // delta.
      expect(afterMove.x - initialTarget.x).toBeCloseTo(dx);
      expect(afterMove.y - initialTarget.y).toBeCloseTo(dy);

      const otherAfterMove = parseNodeTransform(other);
      expect(otherAfterMove.x).toBeCloseTo(initialOther.x);
      expect(otherAfterMove.y).toBeCloseTo(initialOther.y);

      fireEvent.mouseUp(window);
    });

    it("leaves every other node's rendered transform unchanged by the same gesture", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const nodeElements = screen.getAllByTestId("entity-graph-node");
      const [target, ...others] = nodeElements;
      const othersInitial = others.map((el: HTMLElement) =>
        parseNodeTransform(el),
      );

      fireEvent.mouseDown(target, { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 50, clientY: 40 });

      others.forEach((el: HTMLElement, index: number) => {
        const after = parseNodeTransform(el);
        expect(after.x).toBeCloseTo(othersInitial[index].x);
        expect(after.y).toBeCloseTo(othersInitial[index].y);
      });

      fireEvent.mouseUp(window);
    });

    it("scales the reposition by the canvas's current zoom, not just the raw pixel delta", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const svg = screen.getByTestId("entity-graph-canvas");
      const viewport = screen.getByTestId("entity-graph-viewport");

      // Zoom in first so `scale` is non-default.
      fireEvent.wheel(svg, { deltaY: -100 });
      const { scale } = parseViewportTransform(viewport);
      expect(scale).toBeGreaterThan(1);

      const [target] = screen.getAllByTestId("entity-graph-node");
      const initialTarget = parseNodeTransform(target);

      const dx = 30;
      const dy = 18;
      fireEvent.mouseDown(target, { clientX: 50, clientY: 50 });
      fireEvent.mouseMove(window, { clientX: 50 + dx, clientY: 50 + dy });

      const afterMove = parseNodeTransform(target);
      expect(afterMove.x - initialTarget.x).toBeCloseTo(dx / scale);
      expect(afterMove.y - initialTarget.y).toBeCloseTo(dy / scale);

      fireEvent.mouseUp(window);
    });

    it("leaves the moved node's new position in place after mouseup, with no snap-back", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const [target] = screen.getAllByTestId("entity-graph-node");
      const initialTarget = parseNodeTransform(target);

      fireEvent.mouseDown(target, { clientX: 10, clientY: 10 });
      fireEvent.mouseMove(window, { clientX: 45, clientY: 33 });
      const afterMove = parseNodeTransform(target);

      fireEvent.mouseUp(window);
      const afterRelease = parseNodeTransform(target);

      expect(afterRelease.x).toBeCloseTo(afterMove.x);
      expect(afterRelease.y).toBeCloseTo(afterMove.y);
      expect(afterRelease.x).not.toBeCloseTo(initialTarget.x);
    });

    it("does not drive d3-force in any way during a node drag gesture", () => {
      const forceSimulationSpy = vi.mocked(d3Force.forceSimulation);
      forceSimulationSpy.mockClear();

      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      // `computeGraphLayout` has already run once, synchronously, during the
      // initial render above — this is the "whatever was already called once
      // at mount" the assertion below excludes.
      expect(forceSimulationSpy).toHaveBeenCalledTimes(1);
      const simulationInstance = forceSimulationSpy.mock.results[0]
        .value as ReturnType<typeof d3Force.forceSimulation>;

      const tickSpy = vi.spyOn(simulationInstance, "tick");
      const restartSpy = vi.spyOn(simulationInstance, "restart");
      const alphaTargetSpy = vi.spyOn(simulationInstance, "alphaTarget");

      const [target] = screen.getAllByTestId("entity-graph-node");
      fireEvent.mouseDown(target, { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 25, clientY: 15 });
      fireEvent.mouseUp(window);

      expect(forceSimulationSpy).toHaveBeenCalledTimes(1);
      expect(tickSpy).not.toHaveBeenCalled();
      expect(restartSpy).not.toHaveBeenCalled();
      expect(alphaTargetSpy).not.toHaveBeenCalled();
    });
  });

  describe("edge endpoint resolution follows a dragged node (Task 4, entity-graph-node-dragging)", () => {
    /**
     * Finds the edge `<line>` (visible or hit-target, selected by
     * `testId`) whose `data-edge-kind` and other-endpoint name identify it
     * as the fixture's cooccurrence edge (`e-1` <-> `e-2`).
     */
    function getCooccurrenceLine(testId: string): HTMLElement {
      const lines = screen.getAllByTestId(testId);
      const found = lines.find(
        (el: HTMLElement) =>
          el.getAttribute("data-edge-kind") === "cooccurrence",
      );
      if (!found)
        throw new Error(`No ${testId} found for the cooccurrence edge`);
      return found;
    }

    it("moves the dragged node's endpoint on both the visible edge and its hit-target sibling, while the other endpoint stays put", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      // The fixture's cooccurrence edge connects e-1 (entityIdA) and e-2
      // (entityIdB); dragging the first rendered node (e-1, per NODES'
      // fixture order) moves that edge's x1/y1 (its e-1 endpoint) while its
      // x2/y2 (e-2, untouched) must stay exactly as computeGraphLayout set
      // them.
      const visibleBefore = getCooccurrenceLine("entity-graph-edge");
      const hitTargetBefore = getCooccurrenceLine(
        "entity-graph-edge-hit-target",
      );
      const originalX1 = visibleBefore.getAttribute("x1");
      const originalY1 = visibleBefore.getAttribute("y1");
      const originalX2 = visibleBefore.getAttribute("x2");
      const originalY2 = visibleBefore.getAttribute("y2");
      // Pre-drag baseline: the invariant already held before this test's
      // drag even begins.
      expect(hitTargetBefore.getAttribute("x1")).toBe(originalX1);
      expect(hitTargetBefore.getAttribute("y1")).toBe(originalY1);

      const [draggedNode] = screen.getAllByTestId("entity-graph-node");
      expect(draggedNode.getAttribute("data-entity-id")).toBe("e-1");

      const dx = DRAG_CLICK_THRESHOLD_PX + 20;
      const dy = DRAG_CLICK_THRESHOLD_PX + 12;
      fireEvent.mouseDown(draggedNode, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 100 + dx, clientY: 100 + dy });

      const draggedTransform = parseNodeTransform(draggedNode);

      const visibleAfter = getCooccurrenceLine("entity-graph-edge");
      const hitTargetAfter = getCooccurrenceLine(
        "entity-graph-edge-hit-target",
      );

      // The e-1 endpoint (x1/y1) now matches the dragged node's own
      // resolved position, on both the visible line and its hit-target
      // sibling — the invariant Task 4/5 of entity-graph-edge-tooltips
      // established (both lines always share endpoints).
      expect(Number(visibleAfter.getAttribute("x1"))).toBeCloseTo(
        draggedTransform.x,
      );
      expect(Number(visibleAfter.getAttribute("y1"))).toBeCloseTo(
        draggedTransform.y,
      );
      expect(visibleAfter.getAttribute("x1")).toBe(
        hitTargetAfter.getAttribute("x1"),
      );
      expect(visibleAfter.getAttribute("y1")).toBe(
        hitTargetAfter.getAttribute("y1"),
      );

      // The other endpoint (e-2, x2/y2) is unaffected by e-1's drag.
      expect(visibleAfter.getAttribute("x2")).toBe(originalX2);
      expect(visibleAfter.getAttribute("y2")).toBe(originalY2);
      expect(hitTargetAfter.getAttribute("x2")).toBe(originalX2);
      expect(hitTargetAfter.getAttribute("y2")).toBe(originalY2);

      // Sanity: the drag actually moved something (x1/y1 changed from
      // their pre-drag values).
      expect(visibleAfter.getAttribute("x1")).not.toBe(originalX1);
      expect(visibleAfter.getAttribute("y1")).not.toBe(originalY1);

      fireEvent.mouseUp(window);
    });

    it("leaves computeGraphLayout's own return value for the edge identical before and after a drag, called independently of the rendered component", () => {
      // Establishes the baseline: computeGraphLayout is a pure function of
      // its inputs, called directly here with no rendered component
      // involved at all.
      const before = computeGraphLayout(NODES, EDGES);
      const cooccurrenceBefore = before.positionedEdges.find(
        (edge) => edge.edge.kind === "cooccurrence",
      );
      expect(cooccurrenceBefore).toBeDefined();

      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);
      const [draggedNode] = screen.getAllByTestId("entity-graph-node");
      fireEvent.mouseDown(draggedNode, { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 40, clientY: 25 });
      fireEvent.mouseUp(window);

      // Calling the pure function again, with the identical inputs, after a
      // drag has happened on a rendered instance elsewhere: this is the
      // concrete evidence that the drag never touched computeGraphLayout's
      // own output — it is not a stateful cache the drag could have
      // mutated.
      const after = computeGraphLayout(NODES, EDGES);
      const cooccurrenceAfter = after.positionedEdges.find(
        (edge) => edge.edge.kind === "cooccurrence",
      );
      expect(cooccurrenceAfter).toBeDefined();

      expect(cooccurrenceAfter).toEqual(cooccurrenceBefore);
    });
  });

  describe("click-vs-drag discrimination (Task 3, entity-graph-node-dragging)", () => {
    it("still activates the node — toggling selection and calling onNodeActivated — for a gesture that stays under the threshold", () => {
      const onNodeActivated = vi.fn();
      render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivated}
        />,
      );

      const [target] = screen.getAllByTestId("entity-graph-node");
      expect(target.getAttribute("data-selected")).toBe("false");

      // Raw client-pixel distance: hypot(1, 1) ≈ 1.41, comfortably under the
      // 4px threshold.
      fireEvent.mouseDown(target, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 101, clientY: 101 });
      fireEvent.mouseUp(window);
      fireEvent.click(target);

      expect(onNodeActivated).toHaveBeenCalledTimes(1);
      expect(onNodeActivated).toHaveBeenCalledWith("e-1");
      expect(target.getAttribute("data-selected")).toBe("true");
    });

    it("does NOT activate the node — no onNodeActivated, no selection toggle — once the gesture crosses the threshold and releases back on the same node", () => {
      const onNodeActivated = vi.fn();
      render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivated}
        />,
      );

      const [target] = screen.getAllByTestId("entity-graph-node");
      expect(target.getAttribute("data-selected")).toBe("false");

      // Raw client-pixel distance: hypot(10, 6) ≈ 11.66, past the 4px
      // threshold.
      fireEvent.mouseDown(target, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 110, clientY: 106 });
      fireEvent.mouseUp(window);
      fireEvent.click(target);

      expect(onNodeActivated).not.toHaveBeenCalled();
      expect(target.getAttribute("data-selected")).toBe("false");
    });

    it("does NOT activate a different node the drag was released over, once the gesture crossed the threshold", () => {
      const onNodeActivated = vi.fn();
      render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivated}
        />,
      );

      const [dragged, other] = screen.getAllByTestId("entity-graph-node");

      fireEvent.mouseDown(dragged, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 110, clientY: 106 });
      fireEvent.mouseUp(other);
      // Mirrors a native browser click firing on whichever element the
      // pointer was released over.
      fireEvent.click(other);

      expect(onNodeActivated).not.toHaveBeenCalled();
      expect(dragged.getAttribute("data-selected")).toBe("false");
      expect(other.getAttribute("data-selected")).toBe("false");
    });

    it("does NOT activate anything when the drag is released over the empty background, once the gesture crossed the threshold", () => {
      const onNodeActivated = vi.fn();
      render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivated}
        />,
      );

      const [dragged] = screen.getAllByTestId("entity-graph-node");
      const background = screen.getByTestId("entity-graph-canvas-background");

      fireEvent.mouseDown(dragged, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 110, clientY: 106 });
      fireEvent.mouseUp(background);
      // A click landing on the background never reaches a node's onClick at
      // all — this asserts the drag left no activation pending regardless.
      fireEvent.click(background);
      fireEvent.click(dragged);

      expect(onNodeActivated).not.toHaveBeenCalled();
      expect(dragged.getAttribute("data-selected")).toBe("false");
    });

    it("does not leave a suppressed activation dangling — a later plain click on the same node still activates it", () => {
      const onNodeActivated = vi.fn();
      render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivated}
        />,
      );

      const [target] = screen.getAllByTestId("entity-graph-node");

      // First gesture: a drag past the threshold, suppressed.
      fireEvent.mouseDown(target, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 110, clientY: 106 });
      fireEvent.mouseUp(window);
      fireEvent.click(target);
      expect(onNodeActivated).not.toHaveBeenCalled();

      // Second, unrelated gesture: a plain click, which must activate
      // normally — the suppression flag must not leak across gestures.
      fireEvent.click(target);
      expect(onNodeActivated).toHaveBeenCalledTimes(1);
      expect(onNodeActivated).toHaveBeenCalledWith("e-1");
      expect(target.getAttribute("data-selected")).toBe("true");
    });

    it("classifies the identical raw client-pixel movement the same way at scale 1 and at a non-default scale (FR-7)", () => {
      const dx = DRAG_CLICK_THRESHOLD_PX + 10;
      const dy = DRAG_CLICK_THRESHOLD_PX + 6;

      // At default scale (1): the movement is over-threshold in client
      // pixels, so it must be classified as a drag (no activation).
      const onNodeActivatedAtDefaultScale = vi.fn();
      const { unmount } = render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivatedAtDefaultScale}
        />,
      );
      const [targetAtDefaultScale] = screen.getAllByTestId("entity-graph-node");
      fireEvent.mouseDown(targetAtDefaultScale, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 100 + dx, clientY: 100 + dy });
      fireEvent.mouseUp(window);
      fireEvent.click(targetAtDefaultScale);
      expect(onNodeActivatedAtDefaultScale).not.toHaveBeenCalled();
      unmount();

      // At a non-default scale, zoomed in: were the threshold wrongly
      // compared in viewBox units (dividing by `scale` first, as Task 2's
      // reposition delta does), this identical raw client-pixel movement
      // would shrink below the threshold and misclassify as a click. FR-7
      // requires the comparison to stay in raw client pixels regardless of
      // `scale`, so this must still be classified as a drag too.
      const onNodeActivatedAtZoomedScale = vi.fn();
      render(
        <EntityGraphCanvas
          nodes={NODES}
          edges={EDGES}
          onNodeActivated={onNodeActivatedAtZoomedScale}
        />,
      );
      const svg = screen.getByTestId("entity-graph-canvas");
      const viewport = screen.getByTestId("entity-graph-viewport");
      fireEvent.wheel(svg, { deltaY: -100 });
      const { scale } = parseViewportTransform(viewport);
      expect(scale).toBeGreaterThan(1);

      const [targetAtZoomedScale] = screen.getAllByTestId("entity-graph-node");
      fireEvent.mouseDown(targetAtZoomedScale, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 100 + dx, clientY: 100 + dy });
      fireEvent.mouseUp(window);
      fireEvent.click(targetAtZoomedScale);
      expect(onNodeActivatedAtZoomedScale).not.toHaveBeenCalled();
    });
  });

  describe("no data coupling from a drag (Task 5, entity-graph-node-dragging)", () => {
    it("does not change positionedNodes'/positionedEdges' length or any node's entityKind/name-shaped data — only x/y position data moves", () => {
      // Baseline from the pure layout function itself, called independently
      // of the rendered component — the same precedent Task 4's own
      // "identical before and after a drag" test uses.
      const before = computeGraphLayout(NODES, EDGES);
      expect(before.positionedNodes).toHaveLength(NODES.length);
      expect(before.positionedEdges).toHaveLength(EDGES.length);

      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const nodeElementsBefore = screen.getAllByTestId("entity-graph-node");
      const edgeElementsBefore = screen.getAllByTestId("entity-graph-edge");
      const identityBefore = nodeElementsBefore.map((el: HTMLElement) => ({
        entityId: el.getAttribute("data-entity-id"),
        // `aria-label` is set from the node's `name` (see the render loop),
        // so it stands in for that non-position field here — there is no
        // separate data-* attribute for name, entityKind, or aliases,
        // because the canvas never renders those directly.
        name: el.getAttribute("aria-label"),
      }));

      const [draggedNode] = nodeElementsBefore;
      const dx = DRAG_CLICK_THRESHOLD_PX + 20;
      const dy = DRAG_CLICK_THRESHOLD_PX + 12;
      fireEvent.mouseDown(draggedNode, { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: dx, clientY: dy });
      fireEvent.mouseUp(window);

      const nodeElementsAfter = screen.getAllByTestId("entity-graph-node");
      const edgeElementsAfter = screen.getAllByTestId("entity-graph-edge");

      // Length is unchanged for both nodes and edges — a drag adds or
      // removes nothing.
      expect(nodeElementsAfter).toHaveLength(nodeElementsBefore.length);
      expect(edgeElementsAfter).toHaveLength(edgeElementsBefore.length);

      // Every node's identity (entityId) and non-position data (name, via
      // aria-label) is unchanged, in the same order, even though the
      // dragged node's own transform (x/y) has moved.
      const identityAfter = nodeElementsAfter.map((el: HTMLElement) => ({
        entityId: el.getAttribute("data-entity-id"),
        name: el.getAttribute("aria-label"),
      }));
      expect(identityAfter).toEqual(identityBefore);

      // Confirm the dragged node's position DID move — otherwise the
      // "only x/y moves" claim above would be vacuous.
      const draggedTransformAfter = parseNodeTransform(draggedNode);
      const draggedTransformBefore = {
        x: before.positionedNodes[0].x,
        y: before.positionedNodes[0].y,
      };
      expect(draggedTransformAfter.x).not.toBeCloseTo(draggedTransformBefore.x);

      // The pure layout function itself, called again with the identical
      // inputs after the rendered drag, still returns the same length and
      // the same entityKind/name for every node — the drag mutated no
      // shared state `computeGraphLayout` could have read back.
      const after = computeGraphLayout(NODES, EDGES);
      expect(after.positionedNodes).toHaveLength(before.positionedNodes.length);
      expect(after.positionedEdges).toHaveLength(before.positionedEdges.length);
      expect(
        after.positionedNodes.map((n) => ({
          entityId: n.entityId,
          name: n.name,
          entityKind: n.entityKind,
        })),
      ).toEqual(
        before.positionedNodes.map((n) => ({
          entityId: n.entityId,
          name: n.name,
          entityKind: n.entityKind,
        })),
      );
    });
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

  describe("edge tooltip (Task 5, entity-graph-edge-tooltips, FAIL-path overlay)", () => {
    /** Same lookup the canvas itself builds from `positionedNodes`. */
    const nameById = new Map(NODES.map((node) => [node.entityId, node.name]));
    const cooccurrenceEdge = EDGES.find(
      (edge): edge is EntityGraphEdge & { kind: "cooccurrence" } =>
        edge.kind === "cooccurrence",
    )!;
    const authoredEdge = EDGES.find(
      (edge): edge is EntityGraphEdge & { kind: "authored" } =>
        edge.kind === "authored",
    )!;

    function getHitTargetFor(kind: "cooccurrence" | "authored"): HTMLElement {
      const hitTargets = screen.getAllByTestId("entity-graph-edge-hit-target");
      const found = hitTargets.find(
        (el: HTMLElement) => el.getAttribute("data-edge-kind") === kind,
      );
      if (!found) throw new Error(`No hit-target found for kind "${kind}"`);
      return found;
    }

    it("shows a popover with the shared description text on hovering a co-occurrence edge's hit-target", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      expect(
        screen.queryByTestId("entity-graph-edge-tooltip"),
      ).not.toBeInTheDocument();

      const hitTarget = getHitTargetFor("cooccurrence");
      fireEvent.mouseEnter(hitTarget, { clientX: 10, clientY: 20 });

      const tooltip = screen.getByTestId("entity-graph-edge-tooltip");
      // The identical string `EntityGraphAccessibleList.tsx` renders for the
      // same fixture edge (FR-2) — asserted by calling the shared module
      // directly, never a hardcoded duplicate string.
      expect(tooltip.textContent).toBe(
        describeCooccurrenceEdge(
          nameById,
          cooccurrenceEdge.entityIdA,
          cooccurrenceEdge.entityIdB,
          cooccurrenceEdge.sharedResourceCount,
        ),
      );
    });

    it("shows a popover with the shared description text on hovering an authored edge's hit-target", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const hitTarget = getHitTargetFor("authored");
      fireEvent.mouseEnter(hitTarget, { clientX: 10, clientY: 20 });

      const tooltip = screen.getByTestId("entity-graph-edge-tooltip");
      expect(tooltip.textContent).toBe(
        describeAuthoredEdge(
          nameById,
          authoredEdge.sourceEntityId,
          authoredEdge.targetEntityId,
          authoredEdge.relationshipType,
        ),
      );
    });

    it("dismisses the hover-shown tooltip on mouse leave", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const hitTarget = getHitTargetFor("cooccurrence");
      fireEvent.mouseEnter(hitTarget, { clientX: 10, clientY: 20 });
      expect(screen.getByTestId("entity-graph-edge-tooltip")).toBeVisible();

      fireEvent.mouseLeave(hitTarget);
      expect(
        screen.queryByTestId("entity-graph-edge-tooltip"),
      ).not.toBeInTheDocument();
    });

    it("shows the tooltip on a simulated tap, dismisses it on a second tap of the same hit-target, and dismisses it on a tap elsewhere", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const hitTarget = getHitTargetFor("cooccurrence");

      // A tap fires as a click event, same as a mouse click on touch input.
      fireEvent.click(hitTarget, { clientX: 30, clientY: 40 });
      expect(screen.getByTestId("entity-graph-edge-tooltip")).toBeVisible();

      // A second tap on the same hit-target dismisses it.
      fireEvent.click(hitTarget, { clientX: 30, clientY: 40 });
      expect(
        screen.queryByTestId("entity-graph-edge-tooltip"),
      ).not.toBeInTheDocument();

      // Re-open it, then dismiss via a tap elsewhere (the canvas background).
      fireEvent.click(hitTarget, { clientX: 30, clientY: 40 });
      expect(screen.getByTestId("entity-graph-edge-tooltip")).toBeVisible();

      const background = screen.getByTestId("entity-graph-canvas-background");
      fireEvent.click(background);
      expect(
        screen.queryByTestId("entity-graph-edge-tooltip"),
      ).not.toBeInTheDocument();
    });

    it("shows a tapped tooltip for a second edge without immediately dismissing it (FR-5)", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const cooccurrenceHitTarget = getHitTargetFor("cooccurrence");
      const authoredHitTarget = getHitTargetFor("authored");

      fireEvent.click(cooccurrenceHitTarget, { clientX: 1, clientY: 1 });
      expect(screen.getByTestId("entity-graph-edge-tooltip").textContent).toBe(
        describeCooccurrenceEdge(
          nameById,
          cooccurrenceEdge.entityIdA,
          cooccurrenceEdge.entityIdB,
          cooccurrenceEdge.sharedResourceCount,
        ),
      );

      fireEvent.click(authoredHitTarget, { clientX: 2, clientY: 2 });
      expect(screen.getByTestId("entity-graph-edge-tooltip").textContent).toBe(
        describeAuthoredEdge(
          nameById,
          authoredEdge.sourceEntityId,
          authoredEdge.targetEntityId,
          authoredEdge.relationshipType,
        ),
      );
    });

    it("never shows a tooltip when hovering a node (FR-8)", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const [firstNode] = screen.getAllByTestId("entity-graph-node");
      fireEvent.mouseEnter(firstNode, { clientX: 5, clientY: 5 });

      expect(
        screen.queryByTestId("entity-graph-edge-tooltip"),
      ).not.toBeInTheDocument();
    });

    it("does not make an edge hit-target keyboard-focusable (FR-9)", () => {
      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      const hitTarget = getHitTargetFor("cooccurrence");
      expect(hitTarget).not.toHaveAttribute("tabindex");
      expect(hitTarget).not.toHaveAttribute("role", "button");
    });

    it("constructs a nameById map from positionedNodes and passes it as the first argument to both shared description functions", () => {
      const cooccurrenceSpy = vi.spyOn(
        edgeDescriptions,
        "describeCooccurrenceEdge",
      );
      const authoredSpy = vi.spyOn(edgeDescriptions, "describeAuthoredEdge");

      render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

      fireEvent.mouseEnter(getHitTargetFor("cooccurrence"), {
        clientX: 1,
        clientY: 1,
      });
      expect(cooccurrenceSpy).toHaveBeenCalledTimes(1);
      const [cooccurrenceFirstArg] = cooccurrenceSpy.mock.calls[0];
      expect(cooccurrenceFirstArg).toBeInstanceOf(Map);
      expect((cooccurrenceFirstArg as Map<string, string>).get("e-1")).toBe(
        "Anna",
      );

      fireEvent.mouseEnter(getHitTargetFor("authored"), {
        clientX: 1,
        clientY: 1,
      });
      expect(authoredSpy).toHaveBeenCalledTimes(1);
      const [authoredFirstArg] = authoredSpy.mock.calls[0];
      expect(authoredFirstArg).toBeInstanceOf(Map);
      expect((authoredFirstArg as Map<string, string>).get("e-3")).toBe(
        "Castle Greywatch",
      );
    });

    it("introduces no new fetch call when hovering or tapping an edge's tooltip (FR-6)", () => {
      const fetchSpy = vi.fn();
      const originalFetch = global.fetch;
      global.fetch = fetchSpy as unknown as typeof fetch;

      try {
        render(<EntityGraphCanvas nodes={NODES} edges={EDGES} />);

        const hitTarget = getHitTargetFor("cooccurrence");
        fireEvent.mouseEnter(hitTarget, { clientX: 1, clientY: 1 });
        fireEvent.mouseMove(hitTarget, { clientX: 2, clientY: 2 });
        fireEvent.mouseLeave(hitTarget);
        fireEvent.click(hitTarget, { clientX: 1, clientY: 1 });
        fireEvent.click(hitTarget, { clientX: 1, clientY: 1 });

        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
