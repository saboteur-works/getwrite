import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EntityGraphAccessibleList from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphAccessibleList";
import type {
  EntityGraphEdge,
  EntityGraphNode,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";

const nodes: EntityGraphNode[] = [
  { entityId: "e-anna", name: "Anna", entityKind: "character" },
  { entityId: "e-castle", name: "Castle Greywatch", entityKind: "place" },
  { entityId: "e-dana", name: "Dana", entityKind: "character" },
  // Zero-edge node (FR-3): appears in the node list with no matching edge.
  { entityId: "e-bram", name: "Bram (isolated)", entityKind: "character" },
];

/**
 * Anna and Castle Greywatch carry BOTH a co-occurrence edge and an authored
 * edge on the identical pair — FR-5's non-conflation requirement: the two
 * must appear as two distinct `<li>` entries in the edge list, never merged.
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

const meta = {
  title: "WorkArea/EntityGraphAccessibleList",
  component: EntityGraphAccessibleList,
} satisfies Meta<typeof EntityGraphAccessibleList>;

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
