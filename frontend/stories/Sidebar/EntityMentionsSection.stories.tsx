import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import EntityMentionsSection from "../../components/Sidebar/EntityMentionsSection";
import EntityMentionsProvider from "../../components/Sidebar/EntityMentionsContext";
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
import type { AnyResource } from "../../src/lib/models/types";

const PROJECT_ID = "entity-mentions-story-project";
const SELECTED_ENTITY_ID = "entity-aria";

/**
 * Mocks the component's two independent data fetches (Task 6 doc comment
 * in `EntityMentionsSection.tsx`) — `getEntityMentionedIn` (via the
 * `/mentioned-in` route) and `getEntityCooccurrence` (via the
 * `/entity-cooccurrence` route) — behind a single `fetch` spy keyed by URL,
 * mirroring `stories/WorkArea/EntityRosterView.stories.tsx`'s
 * `mockMentionCountsFetch` pattern and
 * `frontend/tests/component/EntityMentionsSection.test.tsx`'s
 * `mockMentionedInAndCooccurrence` helper. Any other request falls through
 * to an empty-ok response.
 */
function mockMentionsFetch(
  cooccurrence: Record<string, EntityCooccurrenceEntry[]>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = input.toString();
    if (url.includes("/mentioned-in")) {
      return { ok: true, json: async () => ({ mentionedIn: [] }) } as Response;
    }
    if (url.includes("/entity-cooccurrence")) {
      return { ok: true, json: async () => cooccurrence } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  };
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * Builds a story-scoped store with the selected entity resource, and the
 * given `EntityAliasTable` pre-cached in `entityAliasTableSlice` (bypassing
 * the `fetchEntityAliasTable` thunk — the same `preloadedState` pattern
 * `stories/WorkArea/EntityRosterView.stories.tsx` uses), so
 * `resolveCooccurringEntityName` can resolve real names without a live
 * transport.
 */
function buildStore(aliasTable: EntityAliasTable) {
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
            name: "Entity Mentions Story Project",
            rootPath: `/tmp/${PROJECT_ID}`,
            folders: [],
            resources: [selectedEntity],
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

/**
 * Fixture demonstrating FR-6's ordering rule: count-descending, with ties
 * broken alphabetically (case-insensitive) by resolved name. "bob" and
 * "Priya" both co-occur in 3 resources — a genuine tie — and "bob" (lower
 * case) must still sort before "Priya" case-insensitively; "Marcus" trails
 * with a lower count.
 */
const tieBreakAliasTable: EntityAliasTable = {
  entities: {
    "entity-priya": {
      entityId: "entity-priya",
      entityKind: "character",
      name: "Priya",
      aliases: [],
      terms: ["Priya"],
    },
    "entity-bob": {
      entityId: "entity-bob",
      entityKind: "character",
      name: "bob",
      aliases: [],
      terms: ["bob"],
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

const tieBreakCooccurrence: Record<string, EntityCooccurrenceEntry[]> = {
  [SELECTED_ENTITY_ID]: [
    { entityId: "entity-priya", count: 3, resourceIds: ["r1", "r2", "r3"] },
    { entityId: "entity-marcus", count: 1, resourceIds: ["r1"] },
    { entityId: "entity-bob", count: 3, resourceIds: ["r1", "r2", "r3"] },
  ],
};

const singleAliasTable: EntityAliasTable = {
  entities: {
    "entity-priya": {
      entityId: "entity-priya",
      entityKind: "character",
      name: "Priya",
      aliases: [],
      terms: ["Priya"],
    },
  },
  claimedBy: {},
};

const singleCooccurrence: Record<string, EntityCooccurrenceEntry[]> = {
  [SELECTED_ENTITY_ID]: [
    { entityId: "entity-priya", count: 2, resourceIds: ["r1", "r2"] },
  ],
};

const meta = {
  title: "Sidebar/EntityMentionsSection",
  component: EntityMentionsSection,
} satisfies Meta<typeof EntityMentionsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Multiple co-occurring entities, including a genuine count tie —
 * demonstrates FR-6's count-descending / alphabetical-tie-break ordering.
 */
export const MultipleCooccurringEntities: Story = {
  beforeEach: () => mockMentionsFetch(tieBreakCooccurrence),
  render: () => (
    <Provider store={buildStore(tieBreakAliasTable)}>
      <EntityMentionsProvider>
        <EntityMentionsSection />
      </EntityMentionsProvider>
    </Provider>
  ),
};

/** Exactly one co-occurring entity. */
export const SingleCooccurringEntity: Story = {
  beforeEach: () => mockMentionsFetch(singleCooccurrence),
  render: () => (
    <Provider store={buildStore(singleAliasTable)}>
      <EntityMentionsProvider>
        <EntityMentionsSection />
      </EntityMentionsProvider>
    </Provider>
  ),
};

/**
 * No co-occurring entity (FR-4/FR-7): the "Also appears with" list must
 * not render at all — no heading, line, or empty-state text.
 */
export const NoCooccurringEntities: Story = {
  beforeEach: () => mockMentionsFetch({}),
  render: () => (
    <Provider store={buildStore({ entities: {}, claimedBy: {} })}>
      <EntityMentionsProvider>
        <EntityMentionsSection />
      </EntityMentionsProvider>
    </Provider>
  ),
};
