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
    },
    render: (args) => {
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
                />
            );
        };

        return <Wrapper />;
    },
};