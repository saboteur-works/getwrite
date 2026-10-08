import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import SubtypesSettings from "../../components/preferences/SubtypesSettings";
import projectsReducer from "../../src/store/projectsSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";

/** Story args: the project's subtype list (undefined = never set). */
interface StoryArgs {
  subtypes?: string[];
}

/**
 * Builds a store with a single selected project carrying the given subtype
 * list. No `entities` flag is set: the editor is always on (FR-25).
 */
function makeProjectStore(subtypes?: string[]) {
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
            subtypes,
          },
        },
      },
    },
  });
}

const meta: Meta<StoryArgs> = {
  title: "Preferences/SubtypesSettings",
  parameters: { layout: "centered" },
  render: (args: StoryArgs) => (
    <Provider store={makeProjectStore(args.subtypes)}>
      <div className="w-[28rem]">
        <SubtypesSettings />
      </div>
    </Provider>
  ),
};

export default meta;

type Story = StoryObj<StoryArgs>;

/** No subtypes defined — the empty-state message and add control show. */
export const Empty: Story = { args: { subtypes: [] } };

/** A populated, ordered subtype list. */
export const Populated: Story = {
  args: { subtypes: ["Scene", "Chapter", "Act"] },
};
