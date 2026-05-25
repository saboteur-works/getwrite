import React, { useState } from "react";
import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import AddFieldForm from "../../components/Sidebar/AddFieldForm";
import projectReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import type { StoredProject } from "../../src/store/projectsSlice";
import type { MetadataSchema } from "../../src/lib/models/types";

const meta: Meta<typeof AddFieldForm> = {
  title: "Sidebar/AddFieldForm",
  component: AddFieldForm,
};

export default meta;

type Story = StoryObj<typeof AddFieldForm>;

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

const CUSTOM_SCHEMA: MetadataSchema = {
  groups: [
    ...DEFAULT_METADATA_SCHEMA.groups,
    {
      id: "custom-plot",
      label: "Plot",
      fields: [
        { key: "tone", label: "Tone", type: "text" },
        { key: "word-count", label: "Word Count", type: "number" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: ["draft", "done"],
        },
      ],
    },
    {
      id: "custom-scenes",
      label: "Scenes",
      folderId: "folder-scenes",
      fields: [{ key: "pov", label: "POV", type: "resource-ref" }],
    },
  ],
};

export const Default: Story = {
  render: () => {
    const [result, setResult] = useState<string | null>(null);
    return (
      <Provider store={makeStore(CUSTOM_SCHEMA)}>
        <div className="max-w-xs p-4">
          <AddFieldForm
            schema={CUSTOM_SCHEMA}
            selectedProjectId="story-proj"
            onCancel={() => setResult("cancelled")}
            onFieldFocused={(key) => setResult(`focused: ${key}`)}
            onCreated={(key) => setResult(`created: ${key}`)}
          />
          {result && (
            <p className="mt-4 text-[10px] font-mono text-gw-secondary">
              {result}
            </p>
          )}
        </div>
      </Provider>
    );
  },
  args: {},
};

/** When the resource is in a folder-scoped folder, the Group defaults to the matching group. */
export const WithFolderContext: Story = {
  render: () => {
    const [result, setResult] = useState<string | null>(null);
    return (
      <Provider store={makeStore(CUSTOM_SCHEMA)}>
        <div className="max-w-xs p-4">
          <AddFieldForm
            schema={CUSTOM_SCHEMA}
            selectedProjectId="story-proj"
            currentFolderId="folder-scenes"
            onCancel={() => setResult("cancelled")}
            onFieldFocused={(key) => setResult(`focused: ${key}`)}
            onCreated={(key) => setResult(`created: ${key}`)}
          />
          {result && (
            <p className="mt-4 text-[10px] font-mono text-gw-secondary">
              {result}
            </p>
          )}
        </div>
      </Provider>
    );
  },
  args: {},
};

/** Empty schema — only builtin groups available. */
export const BuiltinGroupsOnly: Story = {
  render: () => (
    <Provider store={makeStore()}>
      <div className="max-w-xs p-4">
        <AddFieldForm
          schema={DEFAULT_METADATA_SCHEMA}
          selectedProjectId="story-proj"
          onCancel={() => {}}
          onFieldFocused={() => {}}
          onCreated={() => {}}
        />
      </div>
    </Provider>
  ),
  args: {},
};
