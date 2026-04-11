import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ConfirmDialog from "../../components/common/ConfirmDialog";

const meta: Meta<typeof ConfirmDialog> = {
    title: "Common/ConfirmDialog",
    component: ConfirmDialog,
};

export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

export const Open: Story = {
    args: {
        isOpen: true,
        title: "Delete resource",
        description:
            "This action cannot be undone. The selected resource will be removed.",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        onConfirm: () => console.log("confirmed"),
        onCancel: () => console.log("canceled"),
    },
};

export const WithoutDescription: Story = {
    args: {
        isOpen: true,
        title: "Confirm action",
        confirmLabel: "Confirm",
        cancelLabel: "Cancel",
        onConfirm: () => console.log("confirmed"),
        onCancel: () => console.log("canceled"),
    },
};

export const Interactive: Story = {
    render: (args) => {
        const [isOpen, setIsOpen] = React.useState(true);
        const [lastAction, setLastAction] = React.useState<string | null>(null);
        return (
            <div>
                <ConfirmDialog
                    {...args}
                    isOpen={isOpen}
                    onConfirm={() => {
                        setLastAction("confirmed");
                        setIsOpen(false);
                        args.onConfirm?.();
                    }}
                    onCancel={() => {
                        setLastAction("canceled");
                        setIsOpen(false);
                        args.onCancel?.();
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
        title: "Delete resource",
        description:
            "This action cannot be undone. The selected resource will be removed.",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        onConfirm: () => console.log("confirmed"),
        onCancel: () => console.log("canceled"),
    },
};