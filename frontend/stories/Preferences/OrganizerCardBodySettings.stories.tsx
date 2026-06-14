import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import OrganizerCardBodySettings from "../../components/preferences/OrganizerCardBodySettings";
import projectsReducer from "../../src/store/projectsSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import type {
  OrganizerCardBodyConfig,
  ProjectFeatureFlags,
} from "../../src/lib/models/types";

/**
 * Builds a store with a single selected project carrying the given card-body
 * config and feature flags, so the controls render in a known state.
 */
function makeProjectStore(options: {
  organizerCardBody?: OrganizerCardBodyConfig;
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
            features: options.features ?? {},
            organizerCardBody: options.organizerCardBody,
          },
        },
      },
    },
  });
}

const meta: Meta<typeof OrganizerCardBodySettings> = {
  title: "Preferences/OrganizerCardBodySettings",
  component: OrganizerCardBodySettings,
  parameters: { layout: "centered" },
};

export default meta;

type Story = StoryObj<typeof OrganizerCardBodySettings>;

/** No config set, Notes enabled — the back-compat default (Notes field). */
export const DefaultNotes: Story = {
  render: () => (
    <Provider store={makeProjectStore({ features: { notes: true } })}>
      <div className="w-[28rem]">
        <OrganizerCardBodySettings />
      </div>
    </Provider>
  ),
};

/** Card body disabled (None). */
export const None: Story = {
  render: () => (
    <Provider
      store={makeProjectStore({ organizerCardBody: { source: "none" } })}
    >
      <div className="w-[28rem]">
        <OrganizerCardBodySettings />
      </div>
    </Provider>
  ),
};

/** Text-excerpt mode with the length-cap input revealed. */
export const TextExcerpt: Story = {
  render: () => (
    <Provider
      store={makeProjectStore({
        organizerCardBody: { source: "text-excerpt", excerptLength: 200 },
      })}
    >
      <div className="w-[28rem]">
        <OrganizerCardBodySettings />
      </div>
    </Provider>
  ),
};

/** A specific metadata field (Synopsis) selected as the card body. */
export const FieldSource: Story = {
  render: () => (
    <Provider
      store={makeProjectStore({
        organizerCardBody: { source: "field", fieldKey: "synopsis" },
      })}
    >
      <div className="w-[28rem]">
        <OrganizerCardBodySettings />
      </div>
    </Provider>
  ),
};
