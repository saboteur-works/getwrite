import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CompilePreviewModal from "../components/common/CompilePreviewModal";
import type { AnyResource } from "../src/lib/models/types";

const sampleResources: AnyResource[] = [
    {
        id: "f1",
        slug: "chapter-1",
        name: "Chapter 1",
        type: "folder",
        createdAt: "",
        updatedAt: "",
        userMetadata: {},
        orderIndex: 0,
    },
    {
        id: "r1",
        slug: "scene-1",
        name: "Scene 1",
        type: "text",
        plainText: "",
        createdAt: "",
        updatedAt: "",
        userMetadata: {},
        folderId: "f1",
        orderIndex: 0,
    },
    {
        id: "r2",
        slug: "scene-2",
        name: "Scene 2",
        type: "text",
        plainText: "",
        createdAt: "",
        updatedAt: "",
        userMetadata: {},
        folderId: "f1",
        orderIndex: 1,
    },
    {
        id: "f2",
        slug: "chapter-2",
        name: "Chapter 2",
        type: "folder",
        createdAt: "",
        updatedAt: "",
        userMetadata: {},
        orderIndex: 1,
    },
    {
        id: "r3",
        slug: "scene-3",
        name: "Scene 3",
        type: "text",
        plainText: "",
        createdAt: "",
        updatedAt: "",
        userMetadata: {},
        folderId: "f2",
        orderIndex: 0,
    },
    {
        id: "r4",
        slug: "scene-4",
        name: "Scene 4",
        type: "text",
        plainText: "",
        createdAt: "",
        updatedAt: "",
        userMetadata: {},
        folderId: "f2",
        orderIndex: 1,
    },
    {
        id: "img1",
        slug: "cover-image",
        name: "Cover Image",
        type: "image",
        filePath: "",
        createdAt: "",
        updatedAt: "",
        userMetadata: {},
        orderIndex: 2,
    },
] as AnyResource[];

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
        onConfirmCompile: (ids: string[]) => console.log("compile", ids),
    },
};

export const ResourcePreview: Story = {
    render: (args: any) => (
        <div>
            <CompilePreviewModal {...args} />
            <div
                data-testid="preview-mode"
                aria-hidden
                style={{ display: "none" }}
            >
                resource
            </div>
        </div>
    ),
    args: {
        isOpen: true,
        projectId: "proj-1",
        resources: sampleResources,
        // pass `resource` to demonstrate legacy single-resource pre-selection
        resource: sampleResources[1],
    } as any,
};

export const Interactive: Story = {
    render: (args: any) => {
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
                    onConfirmCompile={(ids) => {
                        setLastAction("compile");
                        args.onConfirmCompile?.(ids);
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
