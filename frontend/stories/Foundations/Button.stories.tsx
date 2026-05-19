import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Settings, X, PanelLeftClose } from "lucide-react";
import Button from "../../components/common/UI/Button/Button";

const meta: Meta<typeof Button> = {
    title: "Foundations/Button",
    component: Button,
    argTypes: {
        variant: {
            control: "select",
            options: ["outline", "secondary", "default", "destructive", "ghost", "icon"],
        },
        size: {
            control: "select",
            options: ["xs", "sm", "md"],
        },
    },
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Outline: Story = {
    args: {
        variant: "outline",
        size: "md",
        children: "Confirm",
    },
};

export const Secondary: Story = {
    args: {
        variant: "secondary",
        size: "sm",
        children: "Cancel",
    },
};

export const Default: Story = {
    args: {
        variant: "default",
        size: "sm",
        children: "Save Changes",
    },
};

export const Destructive: Story = {
    args: {
        variant: "destructive",
        size: "md",
        children: "Delete",
    },
};

export const Ghost: Story = {
    args: {
        variant: "ghost",
        "aria-label": "Close",
        children: <X size={16} aria-hidden="true" />,
    },
};

export const Icon: Story = {
    args: {
        variant: "icon",
        "aria-label": "Open settings",
        children: <Settings size={18} aria-hidden="true" />,
    },
};

export const ActionXs: Story = {
    args: {
        variant: "secondary",
        size: "xs",
        children: "Add Field",
    },
};

export const Disabled: Story = {
    args: {
        variant: "outline",
        size: "md",
        disabled: true,
        children: "Disabled",
    },
};

export const AllVariants: Story = {
    render: () => (
        <div className="flex flex-col gap-6 p-6 bg-gw-chrome min-h-screen">
            <div>
                <p className="font-mono text-[9px] uppercase tracking-label text-gw-secondary mb-3">
                    Modal footer buttons
                </p>
                <div className="flex items-center gap-3">
                    <Button variant="secondary" size="sm">Cancel</Button>
                    <Button variant="outline" size="md">Confirm</Button>
                    <Button variant="default" size="sm">Save Changes</Button>
                    <Button variant="destructive" size="md">Delete</Button>
                </div>
            </div>

            <div>
                <p className="font-mono text-[9px] uppercase tracking-label text-gw-secondary mb-3">
                    Toolbar action buttons (xs)
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="xs">Add Status</Button>
                    <Button variant="secondary" size="xs">Add Folder</Button>
                    <Button variant="secondary" size="xs">Remove</Button>
                </div>
            </div>

            <div>
                <p className="font-mono text-[9px] uppercase tracking-label text-gw-secondary mb-3">
                    Icon buttons (topbar / sidebar)
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="icon" aria-label="Open settings">
                        <Settings size={18} aria-hidden="true" />
                    </Button>
                    <Button variant="icon" className="w-10 h-10" aria-label="Close sidebar">
                        <PanelLeftClose size={16} aria-hidden="true" />
                    </Button>
                </div>
            </div>

            <div>
                <p className="font-mono text-[9px] uppercase tracking-label text-gw-secondary mb-3">
                    Ghost close button
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" aria-label="Close">
                        <X size={16} aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </div>
    ),
    args: {},
};
