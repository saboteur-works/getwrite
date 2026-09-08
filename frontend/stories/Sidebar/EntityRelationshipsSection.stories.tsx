import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import EntityRelationshipsSection from "../../components/Sidebar/EntityRelationshipsSection";
import projectsReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import searchReducer from "../../src/store/searchSlice";
import queryReducer from "../../src/store/querySlice";
import cryptoReducer from "../../src/store/cryptoSlice";
import entityAliasTableReducer from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";
import type { EntityRelationshipEdge } from "../../src/lib/api/entity-relationships";
import type { AnyResource } from "../../src/lib/models/types";

const PROJECT_ID = "entity-relationships-story-project";
const SELECTED_ENTITY_ID = "entity-aria";

/**
 * Mocks Task 4's transport (`lib/api/entity-relationships.ts`) at the `fetch`
 * boundary it itself calls, rather than mocking the module — this component
 * has no test-only Vitest module mock available to a Storybook story, and
 * this codebase's own precedent for mocking a `lib/api/*` transport inside a
 * story is exactly this: a single `fetch` spy keyed by URL/method, mirroring
 * `stories/Sidebar/EntityMentionsSection.stories.tsx`'s `mockMentionsFetch`
 * and `stories/WorkArea/EntityRosterView.stories.tsx`'s
 * `mockMentionCountsFetch`. GET against the list route returns the fixture
 * edges; any POST (create/remove) resolves an inert success response, since
 * no story here exercises the Add/Remove buttons.
 */
function mockRelationshipsFetch(edges: EntityRelationshipEdge[]) {
  const original = globalThis.fetch;
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/entity-relationships/remove")) {
      return { ok: true, json: async () => ({ removed: true }) } as Response;
    }
    if (url.includes("/entity-relationships") && method === "GET") {
      return { ok: true, json: async () => edges } as Response;
    }
    if (url.includes("/entity-relationships") && method === "POST") {
      return { ok: true, json: async () => edges[0] ?? null } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  };
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * Builds a story-scoped store with the selected entity resource, the given
 * project `relationshipTypes` list, and the given `EntityAliasTable`
 * pre-cached in `entityAliasTableSlice` (bypassing the
 * `fetchEntityAliasTable` thunk), mirroring
 * `stories/Sidebar/EntityMentionsSection.stories.tsx`'s `buildStore`.
 */
function buildStore(aliasTable: EntityAliasTable, relationshipTypes: string[]) {
  const selectedEntity: AnyResource = {
    id: SELECTED_ENTITY_ID,
    slug: "aria",
    name: "Aria",
    orderIndex: 0,
    type: "text",
    folderId: null,
    createdAt: new Date().toISOString(),
    entityKind: "character",
  } as AnyResource;

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
            name: "Entity Relationships Story Project",
            rootPath: `/tmp/${PROJECT_ID}`,
            folders: [],
            resources: [selectedEntity],
            relationshipTypes,
          },
        },
      },
      resources: {
        selectedResourceId: SELECTED_ENTITY_ID,
        resources: [selectedEntity],
        folders: [],
      },
      entityAliasTable: {
        projectId: PROJECT_ID,
        table: aliasTable,
        status: "succeeded",
      },
    } as never,
  });
}

const ALIAS_TABLE: EntityAliasTable = {
  entities: {
    "entity-aria": {
      entityId: "entity-aria",
      entityKind: "character",
      name: "Aria",
      aliases: [],
      terms: ["Aria"],
    },
    "entity-priya": {
      entityId: "entity-priya",
      entityKind: "character",
      name: "Priya",
      aliases: [],
      terms: ["Priya"],
    },
    "entity-marcus": {
      entityId: "entity-marcus",
      entityKind: "character",
      name: "Marcus",
      aliases: [],
      terms: ["Marcus"],
    },
  },
  claimedBy: {},
};

const RELATIONSHIP_TYPES = ["ally of", "rival of"];

const BOTH_DIRECTIONS_EDGES: EntityRelationshipEdge[] = [
  {
    id: "edge-source",
    sourceEntityId: "entity-aria",
    targetEntityId: "entity-priya",
    relationshipType: "ally of",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "edge-target",
    sourceEntityId: "entity-marcus",
    targetEntityId: "entity-aria",
    relationshipType: "rival of",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

const DANGLING_EDGE: EntityRelationshipEdge[] = [
  {
    id: "edge-dangling",
    sourceEntityId: "entity-aria",
    targetEntityId: "entity-deleted",
    relationshipType: "ally of",
    createdAt: "2026-01-03T00:00:00.000Z",
  },
];

const meta = {
  title: "Sidebar/EntityRelationshipsSection",
  component: EntityRelationshipsSection,
} satisfies Meta<typeof EntityRelationshipsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * No relationships recorded yet. The create control is still usable — the
 * target `<select>` lists the project's other declared entities and the
 * type `<select>` lists its configured relationship types.
 */
export const NoRelationshipsYet: Story = {
  beforeEach: () => mockRelationshipsFetch([]),
  render: () => (
    <Provider store={buildStore(ALIAS_TABLE, RELATIONSHIP_TYPES)}>
      <EntityRelationshipsSection />
    </Provider>
  ),
};

/**
 * Several relationships in both directions: a source-role edge (Aria is an
 * ally of Priya) and a target-role edge (Marcus is a rival of Aria), visibly
 * distinguished (FR-3, FR-5).
 */
export const RelationshipsInBothDirections: Story = {
  beforeEach: () => mockRelationshipsFetch(BOTH_DIRECTIONS_EDGES),
  render: () => (
    <Provider store={buildStore(ALIAS_TABLE, RELATIONSHIP_TYPES)}>
      <EntityRelationshipsSection />
    </Provider>
  ),
};

/**
 * The project has no configured relationship types (FR-15): the create
 * control's type `<select>` is disabled with its explanatory message.
 */
export const NoRelationshipTypesConfigured: Story = {
  beforeEach: () => mockRelationshipsFetch([]),
  render: () => (
    <Provider store={buildStore(ALIAS_TABLE, [])}>
      <EntityRelationshipsSection />
    </Provider>
  ),
};

/**
 * An edge names an entity id no longer present in the alias table (soft-
 * deleted after the edge was created). The row renders the FR-11 placeholder
 * rather than being hidden, filtered, or crashing the section.
 */
export const DanglingEdgePlaceholder: Story = {
  beforeEach: () => mockRelationshipsFetch(DANGLING_EDGE),
  render: () => (
    <Provider store={buildStore(ALIAS_TABLE, RELATIONSHIP_TYPES)}>
      <EntityRelationshipsSection />
    </Provider>
  ),
};
