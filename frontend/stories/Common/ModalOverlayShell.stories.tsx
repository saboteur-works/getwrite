import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ModalOverlayShell from "../../components/common/ModalOverlayShell";

const meta: Meta<typeof ModalOverlayShell> = {
    title: "Common/ModalOverlayShell",
    component: ModalOverlayShell,
};

export default meta;

type Story = StoryObj<typeof ModalOverlayShell>;

export const Open: Story = {
    args: {
        isOpen: true,
        onClose: () => console.log("close overlay"),
        panelClassName: "appshell-modal-panel",
        children: (
            <div className="p-4">
                <h3 className="text-gw-primary text-lg">Overlay Content</h3>
                <p className="text-gw-secondary text-sm mt-2">
                    Shared modal shell wrapper for appshell overlays.
                </p>
            </div>
        ),
    },
};
