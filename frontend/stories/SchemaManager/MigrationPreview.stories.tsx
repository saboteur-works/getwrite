import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import MigrationPreview from "../../components/SchemaManager/MigrationPreview";

const meta: Meta<typeof MigrationPreview> = {
    title: "SchemaManager/MigrationPreview",
    component: MigrationPreview,
    parameters: {
        layout: "fullscreen",
    },
};

export default meta;

type Story = StoryObj<typeof MigrationPreview>;

export const Default: Story = {
    args: {
        fieldKey: "status",
        fieldLabel: "Status",
        oldType: "text",
        newType: "select",
        projectPath: "/mock/project",
        projectId: "proj-1",
        groupId: "group-1",
        onCancel: () => {},
        onApplied: () => {},
    },
};

export const TextToNumber: Story = {
    args: {
        fieldKey: "word-count",
        fieldLabel: "Word Count",
        oldType: "text",
        newType: "number",
        projectPath: "/mock/project",
        projectId: "proj-1",
        groupId: "group-1",
        onCancel: () => {},
        onApplied: () => {},
    },
};

export const SelectToMultiselect: Story = {
    args: {
        fieldKey: "genre",
        fieldLabel: "Genre",
        oldType: "select",
        newType: "multiselect",
        projectPath: "/mock/project",
        projectId: "proj-1",
        groupId: "group-1",
        onCancel: () => {},
        onApplied: () => {},
    },
};
