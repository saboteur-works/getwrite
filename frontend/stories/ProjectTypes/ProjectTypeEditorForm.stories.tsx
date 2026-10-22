import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ProjectTypeEditorForm from "../../components/project-types/ProjectTypeEditorForm";
import type { ProjectTypeDefinition } from "../../src/types/project-types";

const baseDefinition: ProjectTypeDefinition = {
  id: "novel",
  name: "Novel",
  description: "Long-form fiction",
  folders: [
    { name: "Workspace", special: true },
    { name: "Characters", special: true },
  ],
  defaultResources: [
    {
      folder: "Workspace",
      name: "Chapter 01",
      type: "text",
      template: "Start writing...",
    },
  ],
};

const meta: Meta<typeof ProjectTypeEditorForm> = {
  title: "ProjectTypes/ProjectTypeEditorForm",
  component: ProjectTypeEditorForm,
};

export default meta;

type Story = StoryObj<typeof ProjectTypeEditorForm>;

export const Interactive: Story = {
  args: {
    definition: baseDefinition,
    onChange: () => undefined,
    onAddFolder: () => undefined,
    onRemoveFolder: () => undefined,
    onAddResource: () => undefined,
    onRemoveResource: () => undefined,
    onWordCountGoalChange: () => undefined,
    onAddStatus: () => undefined,
    onRemoveStatus: () => undefined,
    onUpdateStatus: () => undefined,
    onAddDefaultFolder: () => undefined,
    onRemoveDefaultFolder: () => undefined,
  },
  render: (args: React.ComponentProps<typeof ProjectTypeEditorForm>) => {
    const Wrapper = () => {
      const [definition, setDefinition] = React.useState<ProjectTypeDefinition>(
        args.definition,
      );

      return (
        <ProjectTypeEditorForm
          definition={definition}
          onChange={setDefinition}
          onAddFolder={() => {
            setDefinition((prev) => ({
              ...prev,
              folders: [...prev.folders, { name: "", special: false }],
            }));
          }}
          onRemoveFolder={(index: number) => {
            setDefinition((prev) => ({
              ...prev,
              folders: prev.folders.filter((_, i) => i !== index),
            }));
          }}
          onAddResource={() => {
            setDefinition((prev) => ({
              ...prev,
              defaultResources: [
                ...(prev.defaultResources ?? []),
                { folder: "Workspace", name: "", type: "text" },
              ],
            }));
          }}
          onRemoveResource={(index: number) => {
            setDefinition((prev) => ({
              ...prev,
              defaultResources: (prev.defaultResources ?? []).filter(
                (_, i) => i !== index,
              ),
            }));
          }}
          onWordCountGoalChange={() => undefined}
          onAddStatus={() => undefined}
          onRemoveStatus={() => undefined}
          onUpdateStatus={() => undefined}
          onAddDefaultFolder={() => undefined}
          onRemoveDefaultFolder={() => undefined}
        />
      );
    };

    return <Wrapper />;
  },
};

export const LineHeightBelowFloor: Story = {
  render: Interactive.render,
  args: {
    ...Interactive.args,
    definition: {
      ...baseDefinition,
      editorConfig: { body: { lineHeight: "1.7" } },
    },
  },
};

/**
 * Stored values the shared typography fields show without rewriting them: a
 * keyword weight ("bold" shows as 700), the Plex Serif 500 weight, and a font
 * name that is not in the list ("Garamond" shows under "Other...").
 */
export const StoredTypographyValues: Story = {
  render: Interactive.render,
  args: {
    ...Interactive.args,
    definition: {
      ...baseDefinition,
      editorConfig: {
        headings: {
          h1: { fontFamily: "IBM Plex Serif", fontWeight: "bold" },
          h2: { fontFamily: "IBM Plex Serif", fontWeight: "500" },
          h3: { fontFamily: "Garamond", fontSize: "24px" },
        },
        body: { fontFamily: "IBM Plex Serif", lineHeight: "1.8" },
      },
    },
  },
  parameters: { a11y: { test: "error" } },
};

export const SavedIdReadOnlyWithRefusals: Story = {
  args: {
    ...Interactive.args,
    definition: baseDefinition,
    idReadOnly: true,
    idError: "Novel (built-in) already uses this id.",
    nameError: "Novel (built-in) already uses this name.",
  },
};

/**
 * A refused draft (Feature 90, FR-28 f): each schema refusal sits beside the
 * input that caused it, as an alert linked to the input. The existing stories
 * cannot show this, because the refusals arrive through `fieldErrors`.
 */
export const RefusedDraftFieldErrors: Story = {
  args: {
    ...Interactive.args,
    definition: {
      ...baseDefinition,
      name: "",
      statuses: ["", "Draft", "draft"],
      folders: [{ name: "Workspace" }, { name: "Workspace!" }],
      defaultFolders: [
        { folder: "", name: "" },
        { folder: "Workspace", name: "Chapter 1" },
      ],
      defaultResources: [{ folder: "", name: "", type: "text" }],
    },
    fieldErrors: {
      name: "Name must not be blank.",
      "statuses.0": "Status label must not be blank.",
      "statuses.2": "Duplicate status label.",
      "folders.1.name":
        "Folder name “Workspace!” is too similar to “Workspace”.",
      "defaultFolders.0.name": "Subfolder name must not be blank.",
      "defaultFolders.0.folder": "Parent folder must not be blank.",
      "defaultResources.0.name": "Starter document name must not be blank.",
    },
  },
  parameters: { a11y: { test: "error" } },
};
