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

export const Interactive: Story = {
    render: (args) => {
        const [open, setOpen] = React.useState(true);
        const [lastRename, setLastRename] = React.useState<string | null>(null);
        return (
            <div>
                <RenameProjectModal
                    {...args}
                    isOpen={open}
                    onClose={() => setOpen(false)}
                    onConfirm={(name: string) => {
                        setLastRename(name);
                        args.onConfirm?.(name);
                    }}
                />
                <div
                    data-testid="last-rename"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {lastRename}
                </div>
                <div
                    data-testid="is-open"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {String(open)}
                </div>
            </div>
        );
    },
    args: {
        isOpen: true,
        initialName: "Draft Project",
        onClose: () => console.log("close"),
        onConfirm: (newName: string) => console.log("rename", newName),
    },
};