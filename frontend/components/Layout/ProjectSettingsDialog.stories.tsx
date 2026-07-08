import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import ProjectSettingsDialog from "./ProjectSettingsDialog";
import type { ProjectSettingsDialogProps } from "./ProjectSettingsDialog";
import projectReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import type { StoredProject } from "../../src/store/projectsSlice";

// SchemaManager (the "Metadata" tab) reads from Redux and is mounted
// immediately because every TabsContent panel uses forceMount — so every
// story needs a real store, even ones that never switch to that tab.
function makeStore() {
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
            metadataSchema: DEFAULT_METADATA_SCHEMA,
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

const meta: Meta<typeof ProjectSettingsDialog> = {
  title: "Layout/ProjectSettingsDialog",
  component: ProjectSettingsDialog,
  decorators: [
    (Story: React.ComponentType) => (
      <Provider store={makeStore()}>
        <Story />
      </Provider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ProjectSettingsDialog>;

const baseArgs: ProjectSettingsDialogProps = {
  open: true,
  onOpenChange: () => {},
  initialHeadings: {},
  onSaveHeadingSettings: async () => {},
  initialBodySettings: {},
  onSaveBodySettings: async () => {},
  initialDefaultRevisionName: "Initial Draft",
  onSaveDefaultRevisionName: async () => {},
  projectPath: "/story",
};

/** All five tabs available; defaults to the "Heading Styles" section. */
export const Default: Story = { args: baseArgs };

/**
 * Without a project path, the Tags tab is disabled and its panel renders
 * nothing (FR11) — mirrors the guard the caller previously applied around
 * TagsManagerModal directly.
 */
export const NoProjectPath: Story = {
  args: { ...baseArgs, projectPath: undefined },
};

/**
 * Demonstrates the core FR7 payoff: typing a draft value into the Heading
 * Styles tab, switching to another tab, and switching back preserves the
 * typed value because every panel stays mounted via `forceMount`.
 */
function DraftPreservedDemo(args: ProjectSettingsDialogProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div>
      <ProjectSettingsDialog {...args} open={isOpen} onOpenChange={setIsOpen} />
      {!isOpen ? (
        <p className="p-4 font-mono text-[11px] text-gw-secondary">
          Dialog closed. Reload the story to reopen.
        </p>
      ) : null}
    </div>
  );
}

export const DraftPreservedAcrossTabSwitch: Story = {
  render: (args: ProjectSettingsDialogProps) => (
    <DraftPreservedDemo {...args} />
  ),
  args: baseArgs,
};
