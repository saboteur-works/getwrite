import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ProjectModalFrame from "../../components/common/ProjectModalFrame";

const meta: Meta<typeof ProjectModalFrame> = {
    title: "Common/ProjectModalFrame",
    component: ProjectModalFrame,
};

export default meta;

type Story = StoryObj<typeof ProjectModalFrame>;

export const Default: Story = {
    args: {
        onClose: () => console.log("close project modal"),
        ariaLabelledBy: "project-modal-title",
        children: (
            <div className="project-modal-panel">
                <h3 id="project-modal-title" className="project-modal-title">
                    Project Modal
                </h3>
                <p className="text-sm text-gw-secondary mt-2">
                    Shared frame used by project-scoped modals.
                </p>
            </div>
        ),
    },
};
