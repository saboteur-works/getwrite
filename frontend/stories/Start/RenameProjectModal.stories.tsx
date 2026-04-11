import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import RenameProjectModal from "../../components/Start/RenameProjectModal";

const meta: Meta<typeof RenameProjectModal> = {
    title: "Start/RenameProjectModal",
    component: RenameProjectModal,
};

export default meta;

type Story = StoryObj<typeof RenameProjectModal>;

export const Open: Story = {
    args: {
        isOpen: true,
        initialName: "Draft Project",
        onClose: () => console.log("close"),
        onConfirm: (newName: string) => console.log("rename", newName),
    },
};