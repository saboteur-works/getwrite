import React from "react";
import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider, useSelector } from "react-redux";
import MetadataSidebar from "../../components/Sidebar/MetadataSidebar";
import { selectResource } from "../../src/store/resourcesSlice";
import projectReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import {
  createTextResource,
  createImageResource,
  createAudioResource,
} from "../../src/lib/models";
import type { StoredProject } from "../../src/store/projectsSlice";
import type { AnyResource } from "../../src/lib/models/types";

const meta: Meta<typeof MetadataSidebar> = {
  title: "Sidebar/MetadataSidebar",
  component: MetadataSidebar,
};

export default meta;

type Story = StoryObj<typeof MetadataSidebar>;

export const Default: Story = {
  render: (args: React.ComponentProps<typeof MetadataSidebar>) => (
    <div>
      <MetadataSidebar {...args} />
      <div data-testid="resource-name" aria-hidden style={{ display: "none" }}>
        {(args as any).resource?.name}
      </div>
    </div>
  ),
  args: {
    resource: createTextResource({ name: "Example Text Resource" }),
  } as any,
};

export const Interactive: Story = {
  render: () => {
    const resource = createTextResource({ name: "Example Text Resource" });

    const store = configureStore({
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
              resources: [{ id: resource.id, name: resource.name }],
            } as StoredProject,
          },
        },
        resources: {
          selectedResourceId: resource.id,
          resources: [resource],
          folders: [],
        },
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

    const Wrapper = () => {
      const selectedResource = useSelector((state: any) =>
        selectResource(state.resources),
      );
      const [lastChange, setLastChange] = React.useState<string | null>(null);
      const markChanged = (value: string) => setLastChange(value);

      return (
        <div>
          <MetadataSidebar
            onChangeField={(_key, value) =>
              markChanged(
                value === null
                  ? "(cleared)"
                  : typeof value === "object"
                    ? "name" in value
                      ? String(value.name)
                      : String(value)
                    : String(value),
              )
            }
          />
          <div
            data-testid="current-resource-name"
            aria-hidden
            style={{ display: "none" }}
          >
            {selectedResource?.name ?? ""}
          </div>
          <div
            data-testid="last-change"
            aria-hidden
            style={{ display: "none" }}
          >
            {lastChange ?? ""}
          </div>
        </div>
      );
    };

    return (
      <Provider store={store}>
        <Wrapper />
      </Provider>
    );
  },
};

function makeStoreWithResource(resource: AnyResource) {
  const store = configureStore({
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
            resources: [{ id: resource.id, name: resource.name }],
          } as StoredProject,
        },
      },
      resources: {
        selectedResourceId: resource.id,
        resources: [resource],
        folders: [],
      },
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
  return store;
}

export const WithSynopsis: Story = {
  render: () => {
    const resource = createTextResource({
      name: "Chapter One",
      plainText: "",
      userMetadata: { synopsis: "A duel at dawn resolves the tension." },
    });
    return (
      <Provider store={makeStoreWithResource(resource)}>
        <MetadataSidebar />
      </Provider>
    );
  },
};

export const WithEndDate: Story = {
  render: () => {
    const resource = createTextResource({
      name: "Chapter One",
      plainText: "",
      userMetadata: { storyDate: "2024-06-01", storyDuration: 120 },
    });
    return (
      <Provider store={makeStoreWithResource(resource)}>
        <MetadataSidebar />
      </Provider>
    );
  },
};

export const WithEndDateOverride: Story = {
  render: () => {
    const resource = createTextResource({
      name: "Chapter Two",
      plainText: "",
      userMetadata: {
        storyDate: "2024-06-01",
        storyDuration: 120,
        storyEndDate: "2024-06-01T06:00",
      },
    });
    return (
      <Provider store={makeStoreWithResource(resource)}>
        <MetadataSidebar />
      </Provider>
    );
  },
};

export const AllExpanded: Story = {
  render: () => {
    const resource = createTextResource({
      name: "Chapter One",
      plainText: "",
      userMetadata: {
        synopsis: "A duel at dawn resolves the tension.",
        notes: "Research fencing terminology.",
        status: "draft",
        storyDate: "2024-06-01",
        storyDuration: 120,
      },
    });
    return (
      <Provider store={makeStoreWithResource(resource)}>
        <MetadataSidebar />
      </Provider>
    );
  },
  args: {},
};

export const AllCollapsed: Story = {
  render: () => {
    const resource = createTextResource({
      name: "Chapter One",
      plainText: "",
      userMetadata: {
        synopsis: "A duel at dawn.",
        notes: "Check the pacing.",
        status: "draft",
        storyDate: "2024-06-01",
        storyDuration: 60,
      },
    });
    return (
      <Provider store={makeStoreWithResource(resource)}>
        <div data-testid="sidebar-wrapper">
          <MetadataSidebar />
        </div>
      </Provider>
    );
  },
  args: {},
};

export const InteractiveCollapse: Story = {
  render: () => {
    const resource = createTextResource({
      name: "Chapter One",
      plainText: "",
      userMetadata: {
        synopsis: "A duel at dawn.",
        notes: "Check the pacing.",
        status: "draft",
        storyDate: "2024-06-01",
        storyDuration: 120,
      },
    });

    const store = makeStoreWithResource(resource);

    return (
      <Provider store={store}>
        <MetadataSidebar onChangeField={() => {}} />
      </Provider>
    );
  },
  args: {},
};

export const WithImageResource: Story = {
  render: () => {
    const resource = createImageResource({
      name: "Cover Photo",
      file: "original.jpg",
      width: 1920,
      height: 1080,
      exif: { Make: "Canon", Model: "EOS R5", DateTime: "2024:06:01 12:34:56" },
    });
    return (
      <Provider store={makeStoreWithResource(resource)}>
        <MetadataSidebar />
      </Provider>
    );
  },
};

export const WithAudioResource: Story = {
  render: () => {
    const resource = createAudioResource({
      name: "Intro Music",
      file: "original.mp3",
      durationSeconds: 203,
      format: "mp3",
    });
    return (
      <Provider store={makeStoreWithResource(resource)}>
        <MetadataSidebar />
      </Provider>
    );
  },
};
