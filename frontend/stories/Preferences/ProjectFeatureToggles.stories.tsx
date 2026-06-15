import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import ProjectFeatureToggles from "../../components/preferences/ProjectFeatureToggles";
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

const meta: Meta<typeof ProjectFeatureToggles> = {
  title: "Preferences/ProjectFeatureToggles",
  component: ProjectFeatureToggles,
  parameters: { layout: "centered" },
};

export default meta;

type Story = StoryObj<typeof ProjectFeatureToggles>;

/** All four features disabled (the default for a newly created project). */
export const AllOff: Story = {
  render: () => (
    <Provider store={makeProjectStore({})}>
      <div className="w-[28rem]">
        <ProjectFeatureToggles />
      </div>
    </Provider>
  ),
};

/** All four features enabled. */
export const AllOn: Story = {
  render: () => (
    <Provider
      store={makeProjectStore({
        timeline: true,
        pov: true,
        synopsis: true,
        notes: true,
      })}
    >
      <div className="w-[28rem]">
        <ProjectFeatureToggles />
      </div>
    </Provider>
  ),
};

/** A representative mixed state (Timeline + Notes on). */
export const Mixed: Story = {
  render: () => (
    <Provider store={makeProjectStore({ timeline: true, notes: true })}>
      <div className="w-[28rem]">
        <ProjectFeatureToggles />
      </div>
    </Provider>
  ),
};
