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

export const Interactive: Story = {
    render: (args) => {
        const [open, setOpen] = React.useState(true);
        const [created, setCreated] = React.useState<CreateResourcePayload | null>(
            null,
        );
        return (
            <div>
                <CreateResourceModal
                    {...args}
                    isOpen={open}
                    onClose={() => setOpen(false)}
                    onCreate={(payload: CreateResourcePayload) => {
                        setCreated(payload);
                        args.onCreate?.(payload);
                    }}
                />
                <div
                    data-testid="is-open"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {String(open)}
                </div>
                <div
                    data-testid="created-resource"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {created ? JSON.stringify(created) : ""}
                </div>
            </div>
        );
    },
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
