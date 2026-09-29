import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import OrganizerView from "../../components/WorkArea/Views/OrganizerView/OrganizerView";
import projectsReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import type { StoredProject } from "../../src/store/projectsSlice";
import type {
  AnyResource,
  Folder,
  MetadataSchema,
  TextResource,
} from "../../src/lib/models/types";

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

// A folder whose children vary in status, word count, and a resource-ref
// metadata field, backed by a story-scoped store carrying a project config
// with a non-empty `statuses` list and a `resource-ref` metadata field
// (FR-1..FR-6), so the filter bar's Status control, word-count range inputs,
// and per-field ref dropdown each have a real, demonstrable effect.
const filtersFolder: Folder = {
  id: "filters-folder",
  slug: "filters-folder",
  name: "Chapter Two",
  orderIndex: 0,
  type: "folder",
  createdAt: now,
  parentId: null,
};

const povCharacterRef = (name: string) => ({ id: `char-${name}`, name });

const filtersMetadataSchema: MetadataSchema = {
  groups: [
    {
      id: "core",
      label: "Core",
      fields: [
        { key: "pov-character", label: "POV Character", type: "resource-ref" },
      ],
    },
  ],
};

const filtersChildResources: TextResource[] = [
  {
    id: "filters-res-0",
    slug: "filters-res-0",
    name: "Opening Scene",
    orderIndex: 0,
    type: "text",
    folderId: "filters-folder",
    createdAt: now,
    wordCount: 450,
    userMetadata: { status: "Draft", "pov-character": povCharacterRef("Rin") },
  },
  {
    id: "filters-res-1",
    slug: "filters-res-1",
    name: "Midpoint Reveal",
    orderIndex: 1,
    type: "text",
    folderId: "filters-folder",
    createdAt: now,
    wordCount: 1800,
    userMetadata: {
      status: "Revised",
      "pov-character": povCharacterRef("Kestrel"),
    },
  },
  {
    id: "filters-res-2",
    slug: "filters-res-2",
    name: "Untouched Draft",
    orderIndex: 2,
    type: "text",
    folderId: "filters-folder",
    createdAt: now,
    wordCount: 90,
    userMetadata: {
      // No status set — exercises the Status control's "No status" option.
      "pov-character": povCharacterRef("Rin"),
    },
  },
  {
    id: "filters-res-3",
    slug: "filters-res-3",
    name: "Final Pass",
    orderIndex: 3,
    type: "text",
    folderId: "filters-folder",
    createdAt: now,
    wordCount: 3200,
    userMetadata: {
      status: "Final",
      // No resource-ref value set — exercises the ref filter's "no value" case.
    },
  },
];

const filtersStore = configureStore({
  reducer: { projects: projectsReducer, resources: resourcesReducer },
  preloadedState: {
    projects: {
      selectedProjectId: "filters-proj",
      projects: {
        "filters-proj": {
          id: "filters-proj",
          name: "Filters Demo Project",
          rootPath: "/story/filters-proj",
          statuses: ["Draft", "Revised", "Final"],
          metadataSchema: filtersMetadataSchema,
        } as StoredProject,
      },
    },
    resources: {
      selectedResourceId: "filters-folder",
      resources: filtersChildResources as AnyResource[],
      folders: [filtersFolder],
    },
  },
});

export const WithFilters: Story = {
  render: () => (
    <Provider store={filtersStore}>
      <OrganizerView showBody={true} />
    </Provider>
  ),
};

export const Interactive: Story = {
  render: () => {
    const [shouldShow, setShow] = React.useState(true);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    return (
      <div>
        <OrganizerView showBody={shouldShow} onToggleBody={(s) => setShow(s)} />
        <div data-testid="show-body" aria-hidden style={{ display: "none" }}>
          {String(shouldShow)}
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
