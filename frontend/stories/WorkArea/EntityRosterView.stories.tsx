import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import EntityRosterView from "../../components/WorkArea/Views/EntityRosterView/EntityRosterView";
import projectsReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import searchReducer from "../../src/store/searchSlice";
import queryReducer from "../../src/store/querySlice";
import cryptoReducer from "../../src/store/cryptoSlice";
import entityAliasTableReducer from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";

const PROJECT_ID = "entity-roster-story-project";

/**
 * Mocks the FR-6 mention-counts fetch (`GET
 * /api/project/<id>/entity-mention-counts`) so the populated story can show
 * nonzero counts without a live server, mirroring the established pattern in
 * `stories/Common/TagsManagerModal.stories.tsx`. Any other request falls
 * through to an empty-ok response.
 */
function mockMentionCountsFetch(counts: Record<string, number>) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = input.toString();
    if (url.includes("/entity-mention-counts")) {
      return { ok: true, json: async () => counts } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  };
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * Builds a story-scoped store with the given entity alias table pre-cached
 * (bypassing the `fetchEntityAliasTable` thunk, matching the preloadedState
 * pattern `stories/WorkArea/OrganizerView.stories.tsx` uses for
 * `resourcesSlice`) and the `entities` feature flag set for the active
 * project.
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
            name: "Entity Roster Story Project",
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
    "e-absent": {
      entityId: "e-absent",
      entityKind: "character",
      name: "Bram (unmentioned)",
      aliases: [],
      terms: ["Bram (unmentioned)"],
    },
    "e-ambiguous": {
      entityId: "e-ambiguous",
      entityKind: "place",
      name: "Ambiguous Harbor",
      aliases: [],
      terms: ["Ambiguous Harbor"],
    },
    "e-noisy": {
      entityId: "e-noisy",
      entityKind: "character",
      name: "Noisy Two",
      // "May" is on the fixed common-word list in entity-alias-warnings.ts.
      aliases: ["May"],
      terms: ["Noisy Two", "May"],
    },
  },
  claimedBy: { "ambiguous harbor": ["e-ambiguous", "some-other-entity"] },
};

const populatedCounts: Record<string, number> = {
  "e-anna": 12,
  "e-ambiguous": 4,
  "e-noisy": 1,
  // "e-absent" intentionally omitted -> zero-mention distinction (FR-5).
};

const meta = {
  title: "WorkArea/EntityRosterView",
  component: EntityRosterView,
} satisfies Meta<typeof EntityRosterView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  beforeEach: () => mockMentionCountsFetch(populatedCounts),
  render: () => (
    <Provider store={buildStore(populatedTable, true)}>
      <EntityRosterView />
    </Provider>
  ),
};

export const EmptyRoster: Story = {
  beforeEach: () => mockMentionCountsFetch({}),
  render: () => (
    <Provider store={buildStore({ entities: {}, claimedBy: {} }, true)}>
      <EntityRosterView />
    </Provider>
  ),
};
