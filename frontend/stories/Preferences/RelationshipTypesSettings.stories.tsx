import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import RelationshipTypesSettings from "../../components/preferences/RelationshipTypesSettings";
import projectsReducer from "../../src/store/projectsSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import type { ProjectFeatureFlags } from "../../src/lib/models/types";

/**
 * Builds a store with a single selected project carrying the given
 * relationship-types list and feature flags, so the editor renders in a
 * known state.
 */
function makeProjectStore(options: {
  relationshipTypes?: string[];
  features?: ProjectFeatureFlags;
}) {
  return configureStore({
    reducer: { projects: projectsReducer },
    preloadedState: {
      projects: {
        selectedProjectId: "story-proj",
        projects: {
          "story-proj": {
            id: "story-proj",
            name: "Story Project",
            rootPath: "/story",
            metadataSchema: DEFAULT_METADATA_SCHEMA,
            features: options.features ?? { entities: true },
            relationshipTypes: options.relationshipTypes,
          },
        },
      },
    },
  });
}

const meta: Meta<typeof RelationshipTypesSettings> = {
  title: "Preferences/RelationshipTypesSettings",
  component: RelationshipTypesSettings,
  parameters: { layout: "centered" },
};

export default meta;

type Story = StoryObj<typeof RelationshipTypesSettings>;

/** No list persisted — falls back to the default relationship-type vocabulary. */
export const DefaultVocabulary: Story = {
  render: () => (
    <Provider store={makeProjectStore({})}>
      <div className="w-[28rem]">
        <RelationshipTypesSettings />
      </div>
    </Provider>
  ),
};

/** A project with a custom, persisted relationship-type list. */
export const CustomList: Story = {
  render: () => (
    <Provider
      store={makeProjectStore({
        relationshipTypes: ["Mentor", "Rival", "Ally"],
      })}
    >
      <div className="w-[28rem]">
        <RelationshipTypesSettings />
      </div>
    </Provider>
  ),
};

/** Every type removed — the empty-state message and add control remain. */
export const EmptyList: Story = {
  render: () => (
    <Provider store={makeProjectStore({ relationshipTypes: [] })}>
      <div className="w-[28rem]">
        <RelationshipTypesSettings />
      </div>
    </Provider>
  ),
};
