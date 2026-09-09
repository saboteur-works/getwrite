/**
 * Component tests for `EntityGraphAccessibleList` (entity-relationship-graph
 * Task 8) — the FR-11 synchronized accessible list: a semantic, alphabetized
 * (OQ-7) node list of native buttons, and a semantic, non-interactive edge
 * list disclosing each edge's kind, direction/type, and (for co-occurrence)
 * its shared-resource count as literal text (FR-12).
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import EntityGraphAccessibleList from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphAccessibleList";
import type {
  EntityGraphAuthoredEdge,
  EntityGraphCooccurrenceEdge,
  EntityGraphNode,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";

const nodes: EntityGraphNode[] = [
  { entityId: "e-carl", name: "Carl", entityKind: "character" },
  { entityId: "e-anna", name: "Anna", entityKind: "character" },
  { entityId: "e-bob", name: "Bob", entityKind: "character" },
];

const cooccurrenceEdge: EntityGraphCooccurrenceEdge = {
  kind: "cooccurrence",
  entityIdA: "e-anna",
  entityIdB: "e-bob",
  sharedResourceCount: 3,
};

const authoredEdge: EntityGraphAuthoredEdge = {
  kind: "authored",
  id: "rel-1",
  sourceEntityId: "e-anna",
  targetEntityId: "e-bob",
  relationshipType: "ally",
};

describe("EntityGraphAccessibleList", () => {
  it("renders one node button per entity, alphabetically ordered regardless of input order (OQ-7)", () => {
    render(<EntityGraphAccessibleList nodes={nodes} edges={[]} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b: HTMLElement) => b.textContent)).toEqual([
      "Anna",
      "Bob",
      "Carl",
    ]);
  });

  it("calls onNodeActivated with the entityId when a node button is clicked", () => {
    const onNodeActivated = vi.fn();
    render(
      <EntityGraphAccessibleList
        nodes={nodes}
        edges={[]}
        onNodeActivated={onNodeActivated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Anna" }));

    expect(onNodeActivated).toHaveBeenCalledTimes(1);
    expect(onNodeActivated).toHaveBeenCalledWith("e-anna");
  });

  it("calls onNodeActivated on native button Enter/Space keyboard activation", () => {
    const onNodeActivated = vi.fn();
    render(
      <EntityGraphAccessibleList
        nodes={nodes}
        edges={[]}
        onNodeActivated={onNodeActivated}
      />,
    );

    const button = screen.getByRole("button", { name: "Bob" });
    button.focus();
    // Native <button> elements dispatch a click on Enter/Space keyup; jsdom
    // does not synthesize this automatically, so fire the resulting click
    // directly, matching how `EntityRosterRow.test.tsx` verifies activation
    // through the button's role rather than hand-rolled key handling.
    fireEvent.keyDown(button, { key: "Enter", code: "Enter" });
    fireEvent.click(button);

    expect(onNodeActivated).toHaveBeenCalledWith("e-bob");
  });

  it("renders a co-occurrence edge entry with both entity names and the literal shared-resource count", () => {
    render(
      <EntityGraphAccessibleList nodes={nodes} edges={[cooccurrenceEdge]} />,
    );

    const list = screen.getByTestId("entity-graph-edge-list");
    expect(list.textContent).toContain("Anna");
    expect(list.textContent).toContain("Bob");
    expect(list.textContent).toContain("3");
  });

  it("renders an authored edge entry with both names, a direction indicator, and the relationship type", () => {
    render(<EntityGraphAccessibleList nodes={nodes} edges={[authoredEdge]} />);

    const list = screen.getByTestId("entity-graph-edge-list");
    expect(list.textContent).toContain("Anna");
    expect(list.textContent).toContain("Bob");
    expect(list.textContent).toContain("→");
    expect(list.textContent).toContain("ally");
  });

  it("gives an edge-list entry no interactive role", () => {
    render(
      <EntityGraphAccessibleList
        nodes={nodes}
        edges={[cooccurrenceEdge, authoredEdge]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /share 3 resources/ }),
    ).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();

    const edgeItems = screen.getAllByTestId("entity-graph-edge-item");
    expect(edgeItems).toHaveLength(2);
    for (const item of edgeItems) {
      expect(item.querySelector("button")).toBeNull();
      expect(item.querySelector("a")).toBeNull();
    }
  });

  it("falls back to the 'Unknown entity' label for a dangling edge reference", () => {
    const danglingEdge: EntityGraphCooccurrenceEdge = {
      kind: "cooccurrence",
      entityIdA: "e-anna",
      entityIdB: "e-ghost",
      sharedResourceCount: 1,
    };
    render(<EntityGraphAccessibleList nodes={nodes} edges={[danglingEdge]} />);

    const list = screen.getByTestId("entity-graph-edge-list");
    expect(list.textContent).toContain("Unknown entity");
  });

  it("is visually hidden without leaving the accessibility tree", () => {
    render(
      <EntityGraphAccessibleList
        nodes={nodes}
        edges={[cooccurrenceEdge, authoredEdge]}
      />,
    );

    // Visually hidden: the canvas beside this list carries the visual
    // reading, and this list shipped unstyled, painting every node name and
    // edge description as raw text under the graph.
    const container = screen.getByTestId("entity-graph-accessible-list");
    expect(container.className.split(/\s+/)).toContain("sr-only");

    // ...but still exposed. `sr-only` clips; `hidden`/`display: none` would
    // look like the same change while deleting the graph's only
    // screen-reader surface (FR-10 designates this list as the mechanism).
    expect(container).not.toHaveAttribute("hidden");
    expect(screen.getByRole("list", { name: "Entity nodes" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Entity edges" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anna" })).toBeTruthy();
  });
});
