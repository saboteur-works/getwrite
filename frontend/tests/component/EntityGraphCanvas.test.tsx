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
});
