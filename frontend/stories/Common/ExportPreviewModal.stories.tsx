import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ExportPreviewModal from "../../components/common/ExportPreviewModal";

const meta: Meta<typeof ExportPreviewModal> = {
    title: "Common/ExportPreviewModal",
    component: ExportPreviewModal,
};

export default meta;

type Story = StoryObj<typeof ExportPreviewModal>;

export const SingleResourceExport: Story = {
    render: (args) => (
        <div>
            <ExportPreviewModal {...args} />
            <div
                data-testid="resource-title"
                aria-hidden
                style={{ display: "none" }}
            >
                {args.resourceTitle}
            </div>
        </div>
    ),
    args: {
        isOpen: true,
        resourceTitle: "Chapter 01",
        resourceIds: ["res-1"],
        allResources: [{ id: "res-1", name: "Chapter 01" }],
        onClose: () => console.log("close"),
        onConfirmExport: () => console.log("export"),
        onShowCompile: () => console.log("show compile"),
    },
};

export const FolderExport: Story = {
    args: {
        isOpen: true,
        resourceTitle: "Act One",
        resourceIds: ["res-1", "res-2", "res-3"],
        allResources: [
            { id: "res-1", name: "Chapter 01" },
            { id: "res-2", name: "Chapter 02" },
            { id: "res-3", name: "Chapter 03" },
        ],
        onClose: () => console.log("close"),
        onConfirmExport: () => console.log("export"),
    },
};

export const EmptyFolder: Story = {
    args: {
        isOpen: true,
        resourceTitle: "Empty Folder",
        resourceIds: [],
        allResources: [],
        onClose: () => console.log("close"),
        onConfirmExport: () => console.log("export"),
    },
};

export const Interactive: Story = {
    render: (args) => {
        const [isOpen, setIsOpen] = React.useState(true);
        const [lastAction, setLastAction] = React.useState<string | null>(null);
        return (
            <div>
                <ExportPreviewModal
                    {...args}
                    isOpen={isOpen}
                    onClose={() => {
                        setIsOpen(false);
                        setLastAction("close");
                        args.onClose?.();
                    }}
                    onConfirmExport={() => {
                        setLastAction("export");
                        args.onConfirmExport?.();
                    }}
                    onShowCompile={() => {
                        setLastAction("compile");
                        args.onShowCompile?.();
                    }}
                />
                <div
                    data-testid="is-open"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {String(isOpen)}
                </div>
                <div
                    data-testid="last-action"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {lastAction}
                </div>
            </div>
        );
    },
    args: {
        isOpen: true,
        resourceTitle: "Act One",
        resourceIds: ["res-1", "res-2"],
        allResources: [
            { id: "res-1", name: "Chapter 01" },
            { id: "res-2", name: "Chapter 02" },
        ],
        onClose: () => console.log("close"),
        onConfirmExport: () => console.log("export"),
        onShowCompile: () => console.log("show compile"),
    },
};
