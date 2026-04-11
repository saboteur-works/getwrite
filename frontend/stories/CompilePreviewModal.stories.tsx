import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CompilePreviewModal from "../components/common/CompilePreviewModal";
import adapter from "../src/lib/adapters/placeholderAdapter";
import type { AnyResource } from "../src/lib/models/types";

const legacyResources = [
    {
        id: "f1",
        projectId: "proj-1",
        title: "Folder A",
        type: "folder",
        createdAt: "",
        updatedAt: "",
        userMetadata: {},
    },
    {
        id: "r1",
        projectId: "proj-1",
        title: "Test Doc",
        type: "document",
        parentId: "f1",
        createdAt: "",
        updatedAt: "",
        userMetadata: {},
    },
    {
        id: "r2",
        projectId: "proj-1",
        title: "Another Doc",
        type: "document",
        parentId: "f1",
        createdAt: "",
        updatedAt: "",
        userMetadata: {},
    },
];

const sampleResources: AnyResource[] = legacyResources.map((r) =>
    adapter.migrateResource(r),
);

const meta: Meta<typeof CompilePreviewModal> = {
    title: "Common/CompilePreviewModal",
    component: CompilePreviewModal,
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof CompilePreviewModal>;

export const ProjectPreview: Story = {
    args: {
        isOpen: true,
        projectId: "proj-1",
        resources: sampleResources,
    },
};

export const ResourcePreview: Story = {
    args: {
        isOpen: true,
        projectId: "proj-1",
        resources: sampleResources,
        // pass `resource` to demonstrate legacy single-resource flow
        resource: sampleResources[1],
    } as any,
};

export const Interactive: Story = {
    render: (args) => {
        const [isOpen, setIsOpen] = React.useState(true);
        const [lastAction, setLastAction] = React.useState<string | null>(null);
        return (
            <div>
                <CompilePreviewModal
                    {...args}
                    isOpen={isOpen}
                    onClose={() => {
                        setIsOpen(false);
                        setLastAction("close");
                        args.onClose?.();
                    }}
                    onExport={() => {
                        setLastAction("export");
                        args.onExport?.();
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
        projectId: "proj-1",
        resources: sampleResources,
    },
};
