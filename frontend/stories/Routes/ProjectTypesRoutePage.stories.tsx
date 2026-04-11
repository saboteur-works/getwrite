import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ProjectTypesManagerPage from "../../components/project-types/ProjectTypesManagerPage";
import type { ProjectTypeTemplateFile } from "../../src/types/project-types";

const initialTemplates: ProjectTypeTemplateFile[] = [
    {
        fileName: "novel.json",
        definition: {
            id: "novel",
            name: "Novel",
            description: "Long-form fiction project type",
            folders: [
                { name: "Workspace", special: true },
                { name: "Characters", special: true },
                { name: "Locations", special: true },
            ],
        },
    },
    {
        fileName: "script.json",
        definition: {
            id: "script",
            name: "Script",
            description: "Screenplay-focused layout",
            folders: [
                { name: "Workspace", special: true },
                { name: "Scenes" },
            ],
        },
    },
];

const meta: Meta<typeof ProjectTypesManagerPage> = {
    title: "Routes/ProjectTypes",
    component: ProjectTypesManagerPage,
};

export default meta;

type Story = StoryObj<typeof ProjectTypesManagerPage>;

export const Screen: Story = {
    args: {
        initialTemplates,
        renderInModal: false,
        onClose: () => console.log("close"),
    },
};