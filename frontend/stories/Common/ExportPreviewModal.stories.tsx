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