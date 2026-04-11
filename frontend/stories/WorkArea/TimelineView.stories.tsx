import React from "react";
import { Meta, StoryObj } from "@storybook/react";
import TimelineView from "../../components/WorkArea/TimelineView";
import { AnyResource, Folder, Project } from "../../src/lib/models";

const meta: Meta<typeof TimelineView> = {
    title: "WorkArea/TimelineView",
    component: TimelineView,
};

export default meta;

type Story = StoryObj<typeof TimelineView>;

const project: Project = {
    id: "abcd-1234-proj",
    name: "Example Project",
    createdAt: new Date().toISOString(),
};

const folders: Folder[] = [
    {
        id: "folder-1",
        slug: "folder-1",
        name: "Folder 1",
        orderIndex: 0,
        type: "folder",
        createdAt: new Date().toISOString(),
        parentId: null,
    },
];

const resources: AnyResource[] = [
    {
        id: "res-1",
        slug: "resource-1",
        name: "Resource 1",
        type: "text",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-2",
        slug: "resource-2",
        name: "Resource 2",
        type: "image",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-3",
        slug: "resource-3",
        name: "Resource 3",
        type: "audio",
        createdAt: new Date().toISOString(),
    },
];

export const Default: Story = {
    args: {
        project: project,
        folders: folders,
        resources: resources,
    },
};

export const SingleProject: Story = {
    args: {
        project: project,
    },
};

export const Interactive: Story = {
    render: (args) => {
        const [selectedResourceId, setSelectedResourceId] =
            React.useState<string | null>(null);
        return (
            <div>
                <TimelineView
                    {...args}
                    onSelectResource={(id) => setSelectedResourceId(id)}
                />
                <div
                    data-testid="selected-resource-id"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {selectedResourceId}
                </div>
            </div>
        );
    },
    args: {
        project: project,
        folders: folders,
        resources: resources,
    },
};
