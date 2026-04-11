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

export const WithResources: Story = {
    render: (args: DataViewProps) => (
        <div>
            <DataView {...args} />
            <div
                data-testid="resource-count"
                aria-hidden
                style={{ display: "none" }}
            >
                {String(args.resources?.length ?? 0)}
            </div>
        </div>
    ),
    args: {
        project,
        resources: resources,
    },
};

export const Interactive: Story = {
    render: (args: DataViewProps) => {
        const [selectedId, setSelectedId] = React.useState<string | null>(null);
        return (
            <div>
                <DataView
                    {...args}
                    onSelectResource={(id) => setSelectedId(id)}
                />
                <div
                    data-testid="selected-resource-id"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {selectedId}
                </div>
                <div
                    data-testid="resource-count"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {args.resources?.length ?? 0}
                </div>
            </div>
        );
    },
    args: {
        project,
        resources: resources,
    },
};
