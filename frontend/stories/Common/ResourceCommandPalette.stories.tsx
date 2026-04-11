import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceCommandPalette from "../../components/common/ResourceCommandPalette";
import type { AnyResource } from "../../src/lib/models/types";

const sampleResources: AnyResource[] = [
    {
        id: "folder-1",
        slug: "workspace",
        name: "Workspace",
        type: "folder",
        orderIndex: 0,
        createdAt: new Date().toISOString(),
        parentId: null,
    },
    {
        id: "res-1",
        slug: "chapter-01",
        name: "Chapter 01",
        type: "text",
        folderId: "folder-1",
        orderIndex: 0,
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-2",
        slug: "cover-image",
        name: "Cover Image",
        type: "image",
        folderId: null,
        orderIndex: 1,
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-3",
        slug: "ambient-loop",
        name: "Ambient Loop",
        type: "audio",
        folderId: null,
        orderIndex: 2,
        createdAt: new Date().toISOString(),
    },
];

const meta: Meta<typeof ResourceCommandPalette> = {
    title: "Common/ResourceCommandPalette",
    component: ResourceCommandPalette,
};

export default meta;

type Story = StoryObj<typeof ResourceCommandPalette>;

export const Open: Story = {
    args: {
        isOpen: true,
        resources: sampleResources,
        onClose: () => console.log("close"),
        onSelectResource: (resourceId: string) =>
            console.log("selected", resourceId),
    },
};

export const EmptyResults: Story = {
    args: {
        isOpen: true,
        resources: [sampleResources[0]],
        onClose: () => console.log("close"),
        onSelectResource: (resourceId: string) =>
            console.log("selected", resourceId),
    },
};