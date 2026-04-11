import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ExportPreviewModal from "../../components/common/ExportPreviewModal";

const meta: Meta<typeof ExportPreviewModal> = {
    title: "Common/ExportPreviewModal",
    component: ExportPreviewModal,
};

export default meta;

type Story = StoryObj<typeof ExportPreviewModal>;

export const Open: Story = {
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
        preview:
            "Chapter 01\n\nThe rain started just as the train crossed the valley.",
        onClose: () => console.log("close"),
        onConfirmExport: () => console.log("export"),
        onShowCompile: () => console.log("show compile"),
    },
};

export const WithoutCompileShortcut: Story = {
    args: {
        isOpen: true,
        resourceTitle: "Workspace",
        preview: "Compiled manuscript preview will appear here.",
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
        resourceTitle: "Chapter 01",
        preview:
            "Chapter 01\n\nThe rain started just as the train crossed the valley.",
        onClose: () => console.log("close"),
        onConfirmExport: () => console.log("export"),
        onShowCompile: () => console.log("show compile"),
    },
};
