import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import OrganizerView from "../../components/WorkArea/Views/OrganizerView/OrganizerView";
import projectsReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import type { AnyResource, Folder } from "../../src/lib/models/types";

const meta: Meta<typeof OrganizerView> = {
  title: "WorkArea/OrganizerView",
  component: OrganizerView,
};

export default meta;
type Story = StoryObj<typeof OrganizerView>;

// A folder with three child resources, selected so OrganizerView renders cards
// rather than its "select a folder" empty state. Backed by a story-scoped store
// so it doesn't depend on (or mutate) the global preview store's null selection.
const now = new Date().toISOString();

const selectedFolder: Folder = {
  id: "org-folder",
  slug: "org-folder",
  name: "Chapter One",
  orderIndex: 0,
  type: "folder",
  createdAt: now,
  parentId: null,
};

const childResources: AnyResource[] = [0, 1, 2].map((i) => ({
  id: `org-res-${i}`,
  slug: `org-res-${i}`,
  name: `Scene ${i + 1}`,
  orderIndex: i,
  type: "text",
  folderId: "org-folder",
  createdAt: now,
}));

const selectedFolderStore = configureStore({
  reducer: { projects: projectsReducer, resources: resourcesReducer },
  preloadedState: {
    resources: {
      selectedResourceId: "org-folder",
      resources: childResources,
      folders: [selectedFolder],
    },
  },
});

export const Default: Story = {
  render: () => (
    <div>
      <OrganizerView showBody={true} />
    </div>
  ),
};

export const WithSelectedFolder: Story = {
  render: () => (
    <Provider store={selectedFolderStore}>
      <OrganizerView showBody={true} />
    </Provider>
  ),
};

export const Interactive: Story = {
  render: () => {
    const [show, setShow] = React.useState(true);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    return (
      <div>
        <OrganizerView showBody={show} onToggleBody={(s) => setShow(s)} />
        <div data-testid="show-body" aria-hidden style={{ display: "none" }}>
          {String(show)}
        </div>
        <div
          data-testid="selected-resource-id"
          aria-hidden
          style={{ display: "none" }}
        >
          {selectedId}
        </div>
      </div>
    );
  },
};
