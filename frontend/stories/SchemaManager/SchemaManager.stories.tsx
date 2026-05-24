import React, { useState } from "react";
import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import SchemaManager from "../../components/SchemaManager/SchemaManager";
import type { SchemaManagerPrefill } from "../../components/SchemaManager/SchemaManager";
import { Dialog } from "../../components/common/UI/Dialog/Dialog";
import projectReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import type { StoredProject } from "../../src/store/projectsSlice";
import type { MetadataSchema } from "../../src/lib/models/types";

const meta: Meta<typeof SchemaManager> = {
  title: "SchemaManager/SchemaManager",
  component: SchemaManager,
  decorators: [
    (Story: React.ComponentType) => (
      <Dialog open onOpenChange={() => undefined}>
        <Story />
      </Dialog>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SchemaManager>;

function makeStore(schema?: MetadataSchema) {
  return configureStore({
    reducer: {
      projects: projectReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
    },
    preloadedState: {
      projects: {
        selectedProjectId: "story-proj",
        projects: {
          "story-proj": {
            id: "story-proj",
            name: "Story Project",
            rootPath: "/story",
            folders: [],
            resources: [],
            metadataSchema: schema ?? DEFAULT_METADATA_SCHEMA,
          } as StoredProject,
        },
      },
      resources: { selectedResourceId: null, resources: [], folders: [] },
      revisions: {
        resourceId: null,
        requestedResourceId: null,
        currentRevisionId: null,
        currentRevisionContent: null,
        revisions: [],
        isLoading: false,
        isSaving: false,
        fetchingRevisionId: null,
        deletingRevisionId: null,
        errorMessage: "",
      },
      editorConfig: { headings: {} },
    },
  });
}

export const DefaultSchema: Story = {
  render: () => (
    <Provider store={makeStore()}>
      <div className="max-w-2xl">
        <SchemaManager onClose={() => {}} />
      </div>
    </Provider>
  ),
};

export const WithCustomFields: Story = {
  render: () => {
    const customSchema: MetadataSchema = {
      groups: [
        ...DEFAULT_METADATA_SCHEMA.groups,
        {
          id: "custom-group",
          label: "Custom Group",
          fields: [
            {
              key: "genre",
              label: "Genre",
              type: "select",
              options: ["Fantasy", "Sci-Fi", "Romance"],
            },
            {
              key: "word-count-goal",
              label: "Word Count Goal",
              type: "number",
            },
            { key: "published", label: "Published", type: "boolean" },
          ],
        },
      ],
    };
    return (
      <Provider store={makeStore(customSchema)}>
        <div className="max-w-2xl">
          <SchemaManager onClose={() => {}} />
        </div>
      </Provider>
    );
  },
};

export const EmptySchema: Story = {
  render: () => (
    <Provider store={makeStore({ groups: [] })}>
      <div className="max-w-2xl">
        <SchemaManager onClose={() => {}} />
      </div>
    </Provider>
  ),
};

/**
 * Chip UI "Add a new field" path: SchemaManager opens with name + label
 * prefilled from the typed search string. The user can adjust and click
 * "Create field"; onCreated fires with the new key.
 */
export const WithPrefill: Story = {
  render: () => {
    const [lastCreated, setLastCreated] = useState<string | null>(null);
    const prefill: SchemaManagerPrefill = {
      name: "tension",
      label: "Tension",
      preferredGroupId: "custom-group",
    };
    const customSchema = {
      groups: [
        ...DEFAULT_METADATA_SCHEMA.groups,
        {
          id: "custom-group",
          label: "Plot",
          fields: [
            {
              key: "genre",
              label: "Genre",
              type: "select" as const,
              options: ["Fantasy", "Sci-Fi"],
            },
          ],
        },
      ],
    };
    return (
      <Provider store={makeStore(customSchema)}>
        <div className="max-w-2xl">
          <SchemaManager
            onClose={() => {}}
            prefill={prefill}
            onCreated={(key) => setLastCreated(key)}
          />
          {lastCreated && (
            <p className="mt-4 font-mono text-[11px] text-gw-secondary">
              onCreated called with: &quot;{lastCreated}&quot;
            </p>
          )}
        </div>
      </Provider>
    );
  },
};
