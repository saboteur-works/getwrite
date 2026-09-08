import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import EntityCompileSection from "../../components/Sidebar/EntityCompileSection";
import EntityMentionsProvider from "../../components/Sidebar/EntityMentionsContext";
import projectsReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import searchReducer from "../../src/store/searchSlice";
import queryReducer from "../../src/store/querySlice";
import cryptoReducer from "../../src/store/cryptoSlice";
import entityAliasTableReducer from "../../src/store/entityAliasTableSlice";
import type { EntityMentionedIn } from "../../src/lib/models/mentions-core";
import type { AnyResource } from "../../src/lib/models/types";

const PROJECT_ID = "entity-compile-story-project";
const SELECTED_ENTITY_ID = "entity-aria";

/**
 * Mocks the `getEntityMentionedIn` fetch that `EntityMentionsProvider` makes
 * — the one this component reads its rows from — behind a `fetch` spy keyed
 * by URL, following the same pattern as
 * `stories/Sidebar/EntityMentionsSection.stories.tsx`.
 */
function mockMentionedInFetch(mentionedIn: EntityMentionedIn[]) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = input.toString();
    if (url.includes("/mentioned-in")) {
      return { ok: true, json: async () => ({ mentionedIn }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  };
  return () => {
    globalThis.fetch = original;
  };
}

function makeResource(id: string, name: string): AnyResource {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    orderIndex: 0,
    type: "text",
    folderId: null,
    createdAt: new Date().toISOString(),
  } as AnyResource;
}

function buildStore(associated: AnyResource[]) {
  const selectedEntity = {
    ...makeResource(SELECTED_ENTITY_ID, "Aria"),
    entityKind: "character",
  } as AnyResource;
  const resources = [selectedEntity, ...associated];

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
            name: "Entity Compile Story Project",
            rootPath: `/tmp/${PROJECT_ID}`,
            folders: [],
            resources,
          },
        },
      },
      resources: {
        selectedResourceId: SELECTED_ENTITY_ID,
        resources,
        folders: [],
      },
    } as never,
  });
}

const sceneOne = makeResource("scene-1", "Chapter One");
const sceneTwo = makeResource("scene-2", "Chapter Two");

const associatedRows: EntityMentionedIn[] = [
  {
    resourceId: "scene-1",
    name: "Chapter One",
    isLinked: false,
    isMentioned: true,
    snippets: ["Aria crossed the bridge."],
    ambiguousWith: [[]],
  },
  {
    resourceId: "scene-2",
    name: "Chapter Two",
    isLinked: true,
    isMentioned: false,
    snippets: [],
    ambiguousWith: [],
  },
];

const meta = {
  title: "Sidebar/EntityCompileSection",
  component: EntityCompileSection,
} satisfies Meta<typeof EntityCompileSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The entity has associated resources, so the compile trigger is enabled.
 * The merged set is deliberately mixed — one mentioned-only row and one
 * linked-only row — since FR-2's set is both, exactly as returned.
 */
export const Enabled: Story = {
  beforeEach: () => mockMentionedInFetch(associatedRows),
  render: () => (
    <Provider store={buildStore([sceneOne, sceneTwo])}>
      <EntityMentionsProvider>
        <EntityCompileSection />
      </EntityMentionsProvider>
    </Provider>
  ),
};

/**
 * The entity has no associated resources: the trigger is disabled and the
 * reason is stated rather than left to be inferred from the disabled state.
 */
export const NoAssociatedResources: Story = {
  beforeEach: () => mockMentionedInFetch([]),
  render: () => (
    <Provider store={buildStore([])}>
      <EntityMentionsProvider>
        <EntityCompileSection />
      </EntityMentionsProvider>
    </Provider>
  ),
};
