import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import projectReducer from "../../src/store/projectsSlice";
import type { StoredProject } from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import ResourceTree from "../../components/ResourceTree/ResourceTree";
import type { ResourceContextAction } from "../../components/ResourceTree/ResourceContextMenu";
import {
  ChevronDown,
  ChevronRight,
  FileTextIcon,
  ImageIcon,
  AudioIcon,
  FolderIcon,
} from "../../components/ResourceTree/ResourceTreeIcons";

const meta = {
  title: "Tree/ResourceTree",
  component: ResourceTree,
} satisfies Meta<typeof ResourceTree>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onResourceAction: (action: ResourceContextAction, resourceId?: string) =>
      console.log("action", action, resourceId),
  },
} satisfies Story;

export const Reorderable: Story = {
  render: (args: React.ComponentProps<typeof ResourceTree>) => {
    const Wrapper = () => {
      const simulateReorder = () => {
        const nav = document.querySelector('[aria-label="Resource tree"]');
        if (!nav) return;
        const items = Array.from(
          nav.querySelectorAll(".resource-tree-item"),
        ) as HTMLElement[];
        const ids = items
          .map(
            (it) =>
              it
                .querySelector('[role="treeitem"].resource-tree-button')
                ?.textContent?.trim() || "",
          )
          .filter(Boolean);
        if (ids.length >= 2) {
          const next = [...ids];
          const first = next.shift();
          if (first) next.splice(1, 0, first);
          const probe = document.querySelector('[data-testid="reorder-probe"]');
          if (probe) probe.textContent = next.join(",");
        }
      };

      // expose simulate for e2e tests. No suppression needed: the `as any`
      // already silences the assignment, so the `@ts-ignore` that sat here
      // was doing nothing — which is exactly what `@ts-expect-error` reports.
      (window as any).__simulateReorder = simulateReorder;

      return (
        <div>
          <ResourceTree {...args} />
          <button
            data-testid="reorder-simulate"
            onClick={simulateReorder}
            style={{ display: "none" }}
          >
            simulate
          </button>
          <div data-testid="reorder-probe" style={{ display: "none" }} />
        </div>
      );
    };

    return <Wrapper />;
  },
  args: {
    onResourceAction: (action: ResourceContextAction, resourceId?: string) =>
      console.log("action", action, resourceId),
  },
};

/** A store whose project names an Inbox folder, with `itemCount` captured notes. */
function makeInboxStore(itemCount: number) {
  const now = new Date().toISOString();
  const folders = [
    {
      id: "inbox-folder",
      slug: "inbox",
      name: "Inbox",
      orderIndex: 0,
      type: "folder" as const,
      createdAt: now,
      parentId: null,
    },
    {
      id: "other-folder",
      slug: "drafts",
      name: "Drafts",
      orderIndex: 1,
      type: "folder" as const,
      createdAt: now,
      parentId: null,
    },
  ];
  const resources = Array.from({ length: itemCount }, (_, i) => ({
    id: `note-${i}`,
    slug: `note-${i}`,
    name: `Captured note ${i + 1}`,
    orderIndex: i,
    type: "text" as const,
    folderId: "inbox-folder",
    createdAt: now,
  }));
  return configureStore({
    reducer: { projects: projectReducer, resources: resourcesReducer },
    preloadedState: {
      projects: {
        selectedProjectId: "inbox-proj",
        projects: {
          "inbox-proj": {
            id: "inbox-proj",
            name: "Inbox Project",
            rootPath: "/inbox-project",
            folders: [],
            resources: [],
            inboxFolderId: "inbox-folder",
          } as StoredProject,
        },
      },
      resources: {
        selectedResourceId: null,
        resources,
        folders,
        suppressNextViewAutoSwitch: false,
      },
    } as unknown as Parameters<typeof configureStore>[0]["preloadedState"],
  });
}

export const InboxWithCount: Story = {
  render: (args: React.ComponentProps<typeof ResourceTree>) => (
    <Provider store={makeInboxStore(3)}>
      <ResourceTree {...args} />
    </Provider>
  ),
  args: { onResourceAction: () => {} },
  parameters: { a11y: { test: "error" } },
};

export const InboxEmpty: Story = {
  render: (args: React.ComponentProps<typeof ResourceTree>) => (
    <Provider store={makeInboxStore(0)}>
      <ResourceTree {...args} />
    </Provider>
  ),
  args: { onResourceAction: () => {} },
  parameters: { a11y: { test: "error" } },
};

export const Icons: Story = {
  render: () => (
    <div className="p-6 bg-gw-chrome">
      <p className="text-xs text-gw-secondary font-mono mb-4 uppercase tracking-widest">
        ResourceTreeIcons
      </p>
      <div className="flex flex-col gap-3">
        {(
          [
            ["ChevronDown", <ChevronDown key="cd" />],
            ["ChevronRight", <ChevronRight key="cr" />],
            ["FileTextIcon", <FileTextIcon key="ft" />],
            ["ImageIcon", <ImageIcon key="img" />],
            ["AudioIcon", <AudioIcon key="audio" />],
            ["FolderIcon", <FolderIcon key="folder" />],
          ] as [string, React.ReactNode][]
        ).map(([name, icon]) => (
          <div key={name} className="flex items-center gap-3">
            <span className="text-gw-primary">{icon}</span>
            <span className="font-mono text-xs text-gw-secondary">{name}</span>
          </div>
        ))}
      </div>
    </div>
  ),
  args: { onResourceAction: () => {} },
};
