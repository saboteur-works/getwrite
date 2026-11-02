import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import StatusesSettings from "../../components/preferences/StatusesSettings";
import projectsReducer from "../../src/store/projectsSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";

/** Story args: the project's status list (undefined = never set). */
interface StoryArgs {
  statuses?: string[];
}

/** Builds a store with a single selected project carrying the given list. */
function makeProjectStore(statuses?: string[]) {
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
            features: {},
            statuses,
          },
        },
      },
    },
  });
}

const meta: Meta<StoryArgs> = {
  title: "Preferences/StatusesSettings",
  parameters: { layout: "centered" },
  render: (args: StoryArgs) => (
    <Provider store={makeProjectStore(args.statuses)}>
      <div className="w-[28rem]">
        <StatusesSettings />
      </div>
    </Provider>
  ),
};

export default meta;

type Story = StoryObj<StoryArgs>;

/** No statuses defined: the empty-state message and add control show. */
export const Empty: Story = { args: { statuses: [] } };

/** A populated, ordered status list. */
export const Populated: Story = {
  args: { statuses: ["Outline", "Draft", "Final"] },
};

/**
 * Failed save: fetch answers 500 for the story, so adding, removing or moving
 * a status shows the inline error and leaves the list unchanged. Type a name
 * and press Add to see it.
 */
export const FailedSave: Story = {
  args: { statuses: ["Outline", "Draft"] },
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Server unavailable" }), {
        status: 500,
      });
    return () => {
      globalThis.fetch = original;
    };
  },
};
