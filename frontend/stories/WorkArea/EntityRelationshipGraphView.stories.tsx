import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import EntityRelationshipGraphView from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";
import projectsReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import searchReducer from "../../src/store/searchSlice";
import queryReducer from "../../src/store/querySlice";
import cryptoReducer from "../../src/store/cryptoSlice";
import entityAliasTableReducer from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";
import type { EntityCooccurrenceEntry } from "../../src/lib/api/entity-cooccurrence";
import type { EntityRelationshipEdge } from "../../src/lib/api/entity-relationships";

const PROJECT_ID = "entity-graph-story-project";

/**
 * Mocks the co-occurrence and relationships HTTP routes
 * (`GET /api/project/<id>/entity-cooccurrence`,
 * `GET /api/project/<id>/entity-relationships`) so the populated story can
 * render both edge kinds without a live server, adapting
 * `EntityRosterView.stories.tsx`'s `mockMentionCountsFetch` pattern to this
 * view's two reads. Any other request falls through to an empty-ok response.
 */
function mockGraphFetch(
  cooccurrence: Record<string, EntityCooccurrenceEntry[]>,
  relationships: EntityRelationshipEdge[],
) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = input.toString();
    if (url.includes("/entity-cooccurrence")) {
      return { ok: true, json: async () => cooccurrence } as Response;
    }
    if (url.includes("/entity-relationships")) {
      return { ok: true, json: async () => relationships } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  };
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * Builds a story-scoped store with the given entity alias table pre-cached
 * (bypassing the `fetchEntityAliasTable` thunk) and the `entities` feature
 * flag set for the active project — the exact structural precedent from
 * `EntityRosterView.stories.tsx`'s `buildStore`.
 */
function buildStore(aliasTable: EntityAliasTable, entitiesEnabled: boolean) {
  return configureStore({
    reducer: {
      projects: projectsReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
      search: searchReducer,
      queries: queryReducer,
      crypto: cryptoReducer,
      entityAliasTable: entityAliasTableReducer,
    },
    preloadedState: {
      projects: {
        selectedProjectId: PROJECT_ID,
        projects: {
          [PROJECT_ID]: {
            id: PROJECT_ID,
            name: "Entity Graph Story Project",
            rootPath: `/tmp/${PROJECT_ID}`,
            folders: [],
            resources: [],
            features: { entities: entitiesEnabled },
          },
        },
      },
      entityAliasTable: {
        projectId: PROJECT_ID,
        table: aliasTable,
        status: "succeeded",
      },
    } as never,
  });
}

const populatedTable: EntityAliasTable = {
  entities: {
    "e-anna": {
      entityId: "e-anna",
      entityKind: "character",
      name: "Anna",
      aliases: ["Annie"],
      terms: ["Anna", "Annie"],
    },
    "e-castle": {
      entityId: "e-castle",
      entityKind: "place",
      name: "Castle Greywatch",
      aliases: [],
      terms: ["Castle Greywatch"],
    },
    "e-dana": {
      entityId: "e-dana",
      entityKind: "character",
      name: "Dana",
      aliases: [],
      terms: ["Dana"],
    },
    // Zero-edge entity (FR-3): appears as a node with no connecting edge.
    "e-bram": {
      entityId: "e-bram",
      entityKind: "character",
      name: "Bram (isolated)",
      aliases: [],
      terms: ["Bram (isolated)"],
    },
  },
  claimedBy: {},
};

/**
 * Both directions of the anna/castle co-occurrence pair, mirroring how
 * `getEntityCooccurrence`'s real map is shaped (`mentions-core.ts`) — the
 * view's own `buildCooccurrenceEdges` collapses this to one undirected edge.
 */
const populatedCooccurrence: Record<string, EntityCooccurrenceEntry[]> = {
  "e-anna": [{ entityId: "e-castle", count: 3, resourceIds: ["r-1", "r-2"] }],
  "e-castle": [{ entityId: "e-anna", count: 3, resourceIds: ["r-1", "r-2"] }],
};

/**
 * Anna and Castle Greywatch also carry an authored edge on the identical
 * pair the co-occurrence map already connects — FR-5's non-conflation
 * requirement: the two must render as two visually distinct lines/entries,
 * not one. A second authored edge (Castle -> Dana) has no co-occurrence
 * counterpart at all.
 */
const populatedRelationships: EntityRelationshipEdge[] = [
  {
    id: "rel-1",
    sourceEntityId: "e-anna",
    targetEntityId: "e-castle",
    relationshipType: "visited",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rel-2",
    sourceEntityId: "e-castle",
    targetEntityId: "e-dana",
    relationshipType: "rival",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const meta = {
  title: "WorkArea/EntityRelationshipGraphView",
  component: EntityRelationshipGraphView,
} satisfies Meta<typeof EntityRelationshipGraphView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  beforeEach: () =>
    mockGraphFetch(populatedCooccurrence, populatedRelationships),
  render: () => (
    <Provider store={buildStore(populatedTable, true)}>
      <EntityRelationshipGraphView onEntityActivated={() => {}} />
    </Provider>
  ),
};

export const EmptyState: Story = {
  beforeEach: () => mockGraphFetch({}, []),
  render: () => (
    <Provider store={buildStore({ entities: {}, claimedBy: {} }, true)}>
      <EntityRelationshipGraphView onEntityActivated={() => {}} />
    </Provider>
  ),
};
