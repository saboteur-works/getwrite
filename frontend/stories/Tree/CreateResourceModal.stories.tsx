import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CreateResourceModal from "../../components/ResourceTree/CreateResourceModal";
import type { CreateResourcePayload } from "../../components/ResourceTree/CreateResourceModal";
import type { Folder } from "../../src/lib/models/types";

const parentFolders: Folder[] = [
    {
        id: "folder-workspace",
        slug: "workspace",
        name: "Workspace",
        type: "folder",
        orderIndex: 0,
        createdAt: new Date().toISOString(),
        parentId: null,
    },
    {
        id: "folder-characters",
        slug: "characters",
        name: "Characters",
        type: "folder",
        orderIndex: 1,
        createdAt: new Date().toISOString(),
        parentId: null,
    },
];

const meta: Meta<typeof CreateResourceModal> = {
    title: "Tree/CreateResourceModal",
    component: CreateResourceModal,
};

export default meta;

type Story = StoryObj<typeof CreateResourceModal>;

export const Open: Story = {
    args: {
        isOpen: true,
        initialTitle: "New Scene",
        initialType: "text",
        parents: parentFolders,
        onClose: () => console.log("close create resource"),
        onCreate: (payload: CreateResourcePayload) =>
            console.log("create resource", payload),
    },
};
