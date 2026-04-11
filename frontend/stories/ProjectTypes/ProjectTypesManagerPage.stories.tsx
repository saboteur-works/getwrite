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
            ],
        },
    },
    {
        fileName: "short-story.json",
        definition: {
            id: "short-story",
            name: "Short Story",
            description: "Compact story drafting",
            folders: [{ name: "Workspace", special: true }],
        },
    },
];

const meta: Meta<typeof ProjectTypesManagerPage> = {
    title: "ProjectTypes/ProjectTypesManagerPage",
    component: ProjectTypesManagerPage,
};

export default meta;

type Story = StoryObj<typeof ProjectTypesManagerPage>;

export const ModalMode: Story = {
    args: {
        initialTemplates,
        renderInModal: true,
        onClose: () => console.log("close"),
    },
};