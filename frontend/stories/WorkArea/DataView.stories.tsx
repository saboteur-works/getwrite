import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import DataView, { DataViewProps } from "../../components/WorkArea/DataView";
import { AnyResource, Project } from "../../src/lib/models";

const meta: Meta<typeof DataView> = {
    title: "WorkArea/DataView",
    component: DataView,
};

export default meta;
type Story = StoryObj<typeof DataView>;

const project: Project = {
    id: "abcd-1234-proj",
    name: "Example Project",
    createdAt: new Date().toISOString(),
};

export const Default: Story = {
    args: {
        project,
    },
};

const resources: AnyResource[] = [
    {
        id: "res-1",
        name: "Resource 1",
        type: "text",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-2",
        name: "Resource 2",
        type: "image",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-3",
        name: "Resource 3",
        type: "audio",
        createdAt: new Date().toISOString(),
    },
];

export const WithResources: Story = {
    render: (args: DataViewProps) => <DataView {...args} />,
    args: {
        project,
        resources: resources,
    },
};
