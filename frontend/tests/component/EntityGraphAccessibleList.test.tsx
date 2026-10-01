/**
 * Component tests for `EntityGraphAccessibleList` (entity-relationship-graph
 * Task 8, extended by Task 9) — the FR-11 synchronized accessible list: a
 * semantic, alphabetized (OQ-7) node list of native buttons, and a semantic,
 * non-interactive edge list disclosing each edge's kind, direction/type, and
 * (for co-occurrence) its shared-resource count as literal text (FR-12).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import EntityGraphAccessibleList from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphAccessibleList";
import type {
  EntityGraphAuthoredEdge,
  EntityGraphBacklinkGraphEdge,
  EntityGraphCooccurrenceEdge,
  EntityGraphNode,
  EntityGraphProximityMentionGraphEdge,
  EntityGraphSharedMetadataGraphEdge,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import type { MetadataSchema } from "../../src/lib/models/types";

vi.mock("../../src/lib/api/tags", () => ({ listTags: vi.fn() }));

import { listTags } from "../../src/lib/api/tags";

const mockedListTags = vi.mocked(listTags);

const PROJECT_ID = "proj-entity-graph-accessible-list";

/**
 * Builds a store with the given project set active, mirroring
 * `EntityRelationshipGraphView.test.tsx`'s `setupStore` helper — this
 * component reads the active project's directory id and metadata schema
 * directly (Task 9) rather than taking them as props.
 */
function setupStore(metadataSchema?: MetadataSchema) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Entity Graph Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      folders: [],
      resources: [],
      metadataSchema,
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  return store;
}

/** Renders the component wrapped in a Redux `Provider`, as it is in production. */
function renderWithStore(
  ui: React.ReactElement,
  metadataSchema?: MetadataSchema,
) {
  const store = setupStore(metadataSchema);
  return render(<Provider store={store}>{ui}</Provider>);
}

beforeEach(() => {
  mockedListTags.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
  it("renders one activation button per entity, alphabetically ordered regardless of input order (OQ-7)", () => {
    renderWithStore(<EntityGraphAccessibleList nodes={nodes} edges={[]} />);

    const buttons = screen.getAllByTestId("entity-graph-node-activate-button");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b: HTMLElement) => b.textContent)).toEqual([
      "Anna",
      "Bob",
      "Carl",
    ]);
  });

  it("calls onNodeActivated with the entityId when a node button is clicked", () => {
    const onNodeActivated = vi.fn();
    renderWithStore(
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
    renderWithStore(
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
    renderWithStore(
      <EntityGraphAccessibleList nodes={nodes} edges={[cooccurrenceEdge]} />,
    );

    const list = screen.getByTestId("entity-graph-edge-list");
    expect(list.textContent).toContain("Anna");
    expect(list.textContent).toContain("Bob");
    expect(list.textContent).toContain("3");
  });

  it("renders an authored edge entry with both names, a direction indicator, and the relationship type", () => {
    renderWithStore(
      <EntityGraphAccessibleList nodes={nodes} edges={[authoredEdge]} />,
    );

    const list = screen.getByTestId("entity-graph-edge-list");
    expect(list.textContent).toContain("Anna");
    expect(list.textContent).toContain("Bob");
    expect(list.textContent).toContain("→");
    expect(list.textContent).toContain("ally");
  });

  it("gives an edge-list entry no interactive role", () => {
    renderWithStore(
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
    renderWithStore(
      <EntityGraphAccessibleList nodes={nodes} edges={[danglingEdge]} />,
    );

    const list = screen.getByTestId("entity-graph-edge-list");
    expect(list.textContent).toContain("Unknown entity");
  });

  it("is visually hidden without leaving the accessibility tree", () => {
    renderWithStore(
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

describe("EntityGraphAccessibleList — focal-point controls and hop-radius disclosure (Feature 68 Task 17)", () => {
  // A 3-hop chain: e-anna (0) - e-bob (1) - e-carl (2), via cooccurrence
  // edges, so a hop radius of 1 puts e-carl outside the radius from e-anna.
  const chainEdges: EntityGraphCooccurrenceEdge[] = [
    {
      kind: "cooccurrence",
      entityIdA: "e-anna",
      entityIdB: "e-bob",
      sharedResourceCount: 1,
    },
    {
      kind: "cooccurrence",
      entityIdA: "e-bob",
      entityIdB: "e-carl",
      sharedResourceCount: 1,
    },
  ];

  it("renders a 'Set as focal point' button per node, distinct from the activation button", () => {
    renderWithStore(<EntityGraphAccessibleList nodes={nodes} edges={[]} />);

    const setFocalButtons = screen.getAllByTestId(
      "entity-graph-node-set-focal-button",
    );
    expect(setFocalButtons).toHaveLength(3);
  });

  it("calls onSetFocalPoint (not onNodeActivated) when a node's 'Set as focal point' button is clicked", () => {
    const onNodeActivated = vi.fn();
    const onSetFocalPoint = vi.fn();
    renderWithStore(
      <EntityGraphAccessibleList
        nodes={nodes}
        edges={[]}
        onNodeActivated={onNodeActivated}
        onSetFocalPoint={onSetFocalPoint}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Set Anna as focal point" }),
    );

    expect(onSetFocalPoint).toHaveBeenCalledTimes(1);
    expect(onSetFocalPoint).toHaveBeenCalledWith("e-anna");
    expect(onNodeActivated).not.toHaveBeenCalled();
  });

  it("renders a header 'Clear focal point' button, disabled when no focal point is set", () => {
    renderWithStore(
      <EntityGraphAccessibleList
        nodes={nodes}
        edges={[]}
        focalEntityId={null}
      />,
    );

    const clearButton = screen.getByTestId(
      "entity-graph-clear-focal-point-button",
    );
    expect(clearButton).toBeDisabled();
    expect(
      screen.getByTestId("entity-graph-focal-point-status").textContent,
    ).toBe("No focal point set.");
  });

  it("enables the header 'Clear focal point' button and discloses the current focal point's name when one is set", () => {
    const onClearFocalPoint = vi.fn();
    renderWithStore(
      <EntityGraphAccessibleList
        nodes={nodes}
        edges={[]}
        focalEntityId="e-anna"
        onClearFocalPoint={onClearFocalPoint}
      />,
    );

    const clearButton = screen.getByTestId(
      "entity-graph-clear-focal-point-button",
    );
    expect(clearButton).not.toBeDisabled();
    expect(
      screen.getByTestId("entity-graph-focal-point-status").textContent,
    ).toContain("Anna");

    fireEvent.click(clearButton);
    expect(onClearFocalPoint).toHaveBeenCalledTimes(1);
  });

  it("discloses each node's inside/outside hop-radius status as text when a focal point is set", () => {
    renderWithStore(
      <EntityGraphAccessibleList
        nodes={nodes}
        edges={chainEdges}
        focalEntityId="e-anna"
        focalHopRadius={1}
      />,
    );

    const items = screen.getAllByTestId("entity-graph-node-item");
    const statusFor = (name: string): string | undefined =>
      items
        .find((item: HTMLElement) => item.textContent?.includes(name))
        ?.querySelector('[data-testid="entity-graph-node-focal-status"]')
        ?.textContent ?? undefined;

    expect(statusFor("Anna")).toContain("focal point");
    expect(statusFor("Bob")).toContain("within focal radius");
    expect(statusFor("Carl")).toContain("outside focal radius");
  });

  it("renders no hop-status disclosure at all when no focal point is set", () => {
    renderWithStore(
      <EntityGraphAccessibleList nodes={nodes} edges={chainEdges} />,
    );

    expect(screen.queryByTestId("entity-graph-node-focal-status")).toBeNull();
  });

  it("still fires onNodeActivated for a node outside the active hop radius — accessible-list reachability is independent of canvas dimming (FR-20/OQ-10)", () => {
    const onNodeActivated = vi.fn();
    renderWithStore(
      <EntityGraphAccessibleList
        nodes={nodes}
        edges={chainEdges}
        onNodeActivated={onNodeActivated}
        focalEntityId="e-anna"
        focalHopRadius={1}
      />,
    );

    // e-carl is 2 hops from the focal point e-anna, outside a radius of 1 —
    // on the canvas this node would render dimmed (`EntityGraphCanvas.tsx`'s
    // `FOCAL_HOP_DIM_OPACITY`). This component never reads that visual
    // state, so its own activation button for the same node must still work
    // exactly as it would for any in-radius node.
    fireEvent.click(screen.getByRole("button", { name: "Carl" }));

    expect(onNodeActivated).toHaveBeenCalledTimes(1);
    expect(onNodeActivated).toHaveBeenCalledWith("e-carl");
  });
});

describe("EntityGraphAccessibleList — new edge kinds (Feature 68 Task 7 minimal fix)", () => {
  const backlinkEdge: EntityGraphBacklinkGraphEdge = {
    kind: "backlinks",
    entityIds: ["e-anna", "e-bob"],
  };
  const proximityMentionEdge: EntityGraphProximityMentionGraphEdge = {
    kind: "proximityMentions",
    entityIdA: "e-anna",
    entityIdB: "e-carl",
    resourceId: "res-1",
    weight: 17,
  };
  const sharedMetadataEdge: EntityGraphSharedMetadataGraphEdge = {
    kind: "sharedMetadata",
    entityIdA: "e-bob",
    entityIdB: "e-carl",
    sharedTagIds: ["tag-1"],
    sharedFieldKeys: ["role"],
  };

  it("renders exactly one <li> per new-kind edge, without throwing", () => {
    expect(() =>
      renderWithStore(
        <EntityGraphAccessibleList
          nodes={nodes}
          edges={[backlinkEdge, proximityMentionEdge, sharedMetadataEdge]}
        />,
      ),
    ).not.toThrow();

    const items = screen.getAllByTestId("entity-graph-edge-item");
    expect(items).toHaveLength(3);
  });

  it("never mis-describes a new-kind edge as an authored relationship", () => {
    renderWithStore(
      <EntityGraphAccessibleList
        nodes={nodes}
        edges={[backlinkEdge, proximityMentionEdge, sharedMetadataEdge]}
      />,
    );

    const list = screen.getByTestId("entity-graph-edge-list");
    // `describeAuthoredEdge` renders a "→" direction indicator; no new-kind
    // edge's description includes one.
    expect(list.textContent).not.toMatch(/→/);
    expect(list.textContent).toContain("linked by a backlink");
    expect(list.textContent).toContain("mentioned close together");
    expect(list.textContent).toContain("share");
  });
});

describe("EntityGraphAccessibleList — shared-metadata label resolution (Task 9)", () => {
  const sharedMetadataEdge: EntityGraphSharedMetadataGraphEdge = {
    kind: "sharedMetadata",
    entityIdA: "e-bob",
    entityIdB: "e-carl",
    sharedTagIds: ["tag-1"],
    sharedFieldKeys: ["role"],
  };

  const metadataSchema: MetadataSchema = {
    groups: [
      {
        id: "group-1",
        label: "Details",
        fields: [
          { key: "role", label: "Role", type: "text" },
          { key: "other-field", label: "Other Field", type: "text" },
        ],
      },
    ],
  };

  it("resolves sharedTagIds/sharedFieldKeys to display labels, never raw ids, once tags/schema are available", async () => {
    mockedListTags.mockResolvedValue([
      { id: "tag-1", name: "Antagonist" },
      { id: "tag-2", name: "Minor" },
    ]);

    renderWithStore(
      <EntityGraphAccessibleList nodes={nodes} edges={[sharedMetadataEdge]} />,
      metadataSchema,
    );

    await waitFor(() => {
      const list = screen.getByTestId("entity-graph-edge-list");
      expect(list.textContent).toContain("Antagonist");
      expect(list.textContent).toContain("Role");
    });

    const list = screen.getByTestId("entity-graph-edge-list");
    expect(list.textContent).not.toContain("tag-1");
    expect(list.textContent).not.toContain("role");
  });

  it("falls back to the raw id/key when a tag or field can't be resolved, without throwing", async () => {
    mockedListTags.mockResolvedValue([]); // tag-1 not found

    renderWithStore(
      <EntityGraphAccessibleList nodes={nodes} edges={[sharedMetadataEdge]} />,
      // No metadata schema fields supplied either, so "role" can't resolve.
      { groups: [] },
    );

    await waitFor(() => {
      expect(mockedListTags).toHaveBeenCalledWith(PROJECT_ID);
    });

    const list = screen.getByTestId("entity-graph-edge-list");
    expect(list.textContent).toContain("tag-1");
    expect(list.textContent).toContain("role");
  });
});
