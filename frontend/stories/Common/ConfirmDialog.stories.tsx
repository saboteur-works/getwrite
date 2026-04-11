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