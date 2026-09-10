import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fireEvent, userEvent, within, expect, waitFor } from "storybook/test";
import EntityGraphCanvas from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas";
import type {
  EntityGraphEdge,
  EntityGraphNode,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";
import {
  describeAuthoredEdge,
  describeCooccurrenceEdge,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/edgeDescriptions";

const nodes: EntityGraphNode[] = [
  { entityId: "e-anna", name: "Anna", entityKind: "character" },
  { entityId: "e-castle", name: "Castle Greywatch", entityKind: "place" },
  { entityId: "e-dana", name: "Dana", entityKind: "character" },
  // Zero-edge node (FR-3): must render visibly with no connecting line.
  { entityId: "e-bram", name: "Bram (isolated)", entityKind: "character" },
];

/**
 * Anna and Castle Greywatch carry BOTH a co-occurrence edge and an authored
 * edge on the identical pair — FR-5's non-conflation requirement: the two
 * must render as two visually distinct lines, never merged into one.
 */
const edges: EntityGraphEdge[] = [
  {
    kind: "cooccurrence",
    entityIdA: "e-anna",
    entityIdB: "e-castle",
    sharedResourceCount: 3,
  },
  {
    kind: "authored",
    id: "rel-1",
    sourceEntityId: "e-anna",
    targetEntityId: "e-castle",
    relationshipType: "visited",
  },
  {
    kind: "authored",
    id: "rel-2",
    sourceEntityId: "e-castle",
    targetEntityId: "e-dana",
    relationshipType: "rival",
  },
];

/**
 * Parses a node `<g>`'s `transform="translate(x, y)"` attribute into its
 * numeric components — mirrors `EntityGraphCanvas.test.tsx`'s own
 * `parseNodeTransform` helper, used the same way here to compare a dragged
 * node's rendered position before and after the gesture.
 */
function parseNodeTransform(el: Element): { x: number; y: number } {
  const transform = el.getAttribute("transform") ?? "";
  const match = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) {
    throw new Error(`Could not parse node transform: "${transform}"`);
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

const meta = {
  title: "WorkArea/EntityGraphCanvas",
  component: EntityGraphCanvas,
} satisfies Meta<typeof EntityGraphCanvas>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: { nodes, edges, onNodeActivated: () => {} },
};

export const IsolatedEntity: Story = {
  args: {
    nodes: [
      { entityId: "e-solo", name: "Solo Entity", entityKind: "character" },
    ],
    edges: [],
    onNodeActivated: () => {},
  },
};

export const Empty: Story = {
  args: { nodes: [], edges: [], onNodeActivated: () => {} },
};

/**
 * Exercises the edge tooltip (entity-graph-edge-tooltips, Task 5) on both
 * edge kinds sharing the `Populated` fixture above. Hovering each edge's
 * transparent hit-target line (`entity-graph-edge-hit-target`) must show the
 * `entity-graph-edge-tooltip` popover with the identical text
 * `describeCooccurrenceEdge`/`describeAuthoredEdge` (`edgeDescriptions.ts`)
 * produce for that same fixture data — asserted here by calling those
 * shared functions directly rather than hardcoding the expected string, so
 * this story cannot drift from the module it is meant to exercise.
 *
 * Expected text for a reviewer checking by eye, using the fixture above:
 * - Co-occurrence (Anna <-> Castle Greywatch, 3 shared resources):
 *   "Anna and Castle Greywatch share 3 resources"
 * - Authored (Anna -> Castle Greywatch, "visited", the first authored edge
 *   in fixture order and so the first the hit-target lookup below finds):
 *   "Anna → Castle Greywatch (visited)"
 */
export const EdgeTooltips: Story = {
  args: { nodes, edges, onNodeActivated: () => {} },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nameById = new Map(nodes.map((node) => [node.entityId, node.name]));

    const cooccurrenceEdge = edges.find(
      (edge): edge is EntityGraphEdge & { kind: "cooccurrence" } =>
        edge.kind === "cooccurrence",
    );
    const authoredEdge = edges.find(
      (edge): edge is EntityGraphEdge & { kind: "authored" } =>
        edge.kind === "authored",
    );
    if (!cooccurrenceEdge || !authoredEdge) {
      throw new Error(
        "Fixture must contain both a cooccurrence and an authored edge",
      );
    }

    const hitTargets = canvas.getAllByTestId("entity-graph-edge-hit-target");
    const cooccurrenceHitTarget = hitTargets.find(
      (el) => el.getAttribute("data-edge-kind") === "cooccurrence",
    );
    const authoredHitTarget = hitTargets.find(
      (el) => el.getAttribute("data-edge-kind") === "authored",
    );
    if (!cooccurrenceHitTarget || !authoredHitTarget) {
      throw new Error("Expected hit-target lines for both edge kinds");
    }

    // Hovering the co-occurrence edge shows its shared-resource-count text.
    await userEvent.hover(cooccurrenceHitTarget);
    const cooccurrenceTooltip = await canvas.findByTestId(
      "entity-graph-edge-tooltip",
    );
    expect(cooccurrenceTooltip.textContent).toBe(
      describeCooccurrenceEdge(
        nameById,
        cooccurrenceEdge.entityIdA,
        cooccurrenceEdge.entityIdB,
        cooccurrenceEdge.sharedResourceCount,
      ),
    );

    await userEvent.unhover(cooccurrenceHitTarget);
    await waitFor(() =>
      expect(
        canvas.queryByTestId("entity-graph-edge-tooltip"),
      ).not.toBeInTheDocument(),
    );

    // Hovering the authored edge shows its direction-and-type text.
    await userEvent.hover(authoredHitTarget);
    const authoredTooltip = await canvas.findByTestId(
      "entity-graph-edge-tooltip",
    );
    expect(authoredTooltip.textContent).toBe(
      describeAuthoredEdge(
        nameById,
        authoredEdge.sourceEntityId,
        authoredEdge.targetEntityId,
        authoredEdge.relationshipType,
      ),
    );
  },
};

/**
 * Exercises the node drag gesture (entity-graph-node-dragging, Tasks 1-4) on
 * the same `Populated` fixture above. Anna carries both a co-occurrence edge
 * and an authored edge (to Castle Greywatch), so dragging her node visibly
 * demonstrates Task 4's edge-follows-node behavior for both edge kinds in
 * the same gesture. Dana carries no edge to Anna and is used as the control:
 * her rendered position must stay put across the same gesture.
 *
 * The component listens for `pointermove`/`pointerup` at the WINDOW level
 * (see `EntityGraphCanvas.tsx`'s drag-continuation effect), not on the node
 * itself — mirroring `EntityGraphCanvas.test.tsx`'s own drag simulation, this
 * play function fires `pointerdown` on the node's `<g>` and then
 * `pointermove`/`pointerup` on `window` rather than on the node. Pointer
 * events rather than mouse events, because the drag has to work for touch.
 */
export const NodeDragging: Story = {
  args: { nodes, edges, onNodeActivated: () => {} },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const nodeElements = canvas.getAllByTestId("entity-graph-node");
    const draggedNode = nodeElements.find(
      (el) => el.getAttribute("data-entity-id") === "e-anna",
    );
    const controlNode = nodeElements.find(
      (el) => el.getAttribute("data-entity-id") === "e-dana",
    );
    if (!draggedNode || !controlNode) {
      throw new Error("Fixture must contain both Anna's and Dana's nodes");
    }

    const initialDraggedPosition = parseNodeTransform(draggedNode);
    const initialControlPosition = parseNodeTransform(controlNode);

    // A full drag gesture, well past `DRAG_CLICK_THRESHOLD_PX` (4px at time
    // of writing) so it is unambiguously classified as a drag rather than a
    // click, and moved a visible distance on the canvas.
    fireEvent.pointerDown(draggedNode, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 180, clientY: 160 });
    fireEvent.pointerUp(window);

    const draggedPositionAfter = parseNodeTransform(draggedNode);
    expect(draggedPositionAfter.x).not.toBeCloseTo(initialDraggedPosition.x);
    expect(draggedPositionAfter.y).not.toBeCloseTo(initialDraggedPosition.y);

    const controlPositionAfter = parseNodeTransform(controlNode);
    expect(controlPositionAfter.x).toBeCloseTo(initialControlPosition.x);
    expect(controlPositionAfter.y).toBeCloseTo(initialControlPosition.y);
  },
};
