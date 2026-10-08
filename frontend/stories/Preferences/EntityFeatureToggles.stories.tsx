import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import EntityFeatureToggles from "../../components/preferences/EntityFeatureToggles";
import projectsReducer from "../../src/store/projectsSlice";
import type { ProjectFeatureFlags } from "../../src/lib/models/types";

/**
 * Builds a store with a single selected project carrying the given feature
 * flags, so the toggles render in a known state.
 */
function makeProjectStore(features: ProjectFeatureFlags) {
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
            features,
          },
        },
      },
    },
  });
}

const meta: Meta<typeof EntityFeatureToggles> = {
  title: "Preferences/EntityFeatureToggles",
  component: EntityFeatureToggles,
  parameters: { layout: "centered" },
};

export default meta;

type Story = StoryObj<typeof EntityFeatureToggles>;

/** Entities off — the default for a newly created project. */
export const Off: Story = {
  render: () => (
    <Provider store={makeProjectStore({})}>
      <div className="w-[28rem]">
        <EntityFeatureToggles />
      </div>
    </Provider>
  ),
};

/** Entities on, exposing the dependent highlighting toggle. */
export const On: Story = {
  render: () => (
    <Provider store={makeProjectStore({ entities: true })}>
      <div className="w-[28rem]">
        <EntityFeatureToggles />
      </div>
    </Provider>
  ),
};

/** Entities and highlighting both on. */
export const HighlightingOn: Story = {
  render: () => (
    <Provider
      store={makeProjectStore({ entities: true, entityHighlighting: true })}
    >
      <div className="w-[28rem]">
        <EntityFeatureToggles />
      </div>
    </Provider>
  ),
};
