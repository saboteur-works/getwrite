import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Chip from "../../components/common/UI/Chip/Chip";

const meta: Meta<typeof Chip> = {
    title: "Common/Chip",
    component: Chip,
};

export default meta;

type Story = StoryObj<typeof Chip>;

export const Default: Story = {
    args: {
        label: "Draft",
        shape: "sharp",
        size: "md",
    },
};

export const WithColor: Story = {
    args: {
        label: "Fiction",
        shape: "sharp",
        size: "md",
        color: "#6b8cae",
    },
};

export const SharpVsRounded: Story = {
    args: {
        label: "Sharp",
        shape: "sharp",
        size: "md",
    },
    render: (args) => (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Chip {...args} label="Sharp" shape="sharp" />
            <Chip {...args} label="Rounded" shape="rounded" />
        </div>
    ),
};

export const AllSizes: Story = {
    args: {
        label: "Label",
        shape: "sharp",
    },
    render: (args) => (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Chip {...args} label="Small" size="sm" />
            <Chip {...args} label="Medium" size="md" />
            <Chip {...args} label="Large" size="lg" />
        </div>
    ),
};

export const WithDismiss: Story = {
    args: {
        label: "Draft",
        shape: "sharp",
        size: "md",
        onDismiss: () => console.log("dismissed"),
    },
};

export const WithTooltip: Story = {
    args: {
        label: "POV",
        shape: "sharp",
        size: "md",
        tooltip: "Point of view character for this scene",
        tooltipId: "chip-story-tooltip",
    },
    parameters: {
        docs: {
            description: {
                story: "Hover the chip to see the tooltip. Both `tooltip` and `tooltipId` must be provided — omitting either suppresses the tooltip.",
            },
        },
    },
};

export const InteractiveButton: Story = {
    args: {
        label: "Clickable",
        shape: "sharp",
        size: "md",
        onClick: () => console.log("chip clicked"),
    },
};

export const Active: Story = {
    args: {
        label: "Draft",
        shape: "rounded",
        size: "md",
        active: true,
        onClick: () => console.log("chip clicked"),
    },
    render: (args) => (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Chip {...args} active={false} label="Inactive" />
            <Chip {...args} active={true} label="Active" />
        </div>
    ),
};

export const ActiveWithColor: Story = {
    args: {
        label: "Fiction",
        shape: "sharp",
        size: "sm",
        color: "#6b8cae",
        onClick: () => console.log("chip clicked"),
    },
    render: (args) => (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Chip {...args} active={false} label="Unassigned" />
            <Chip {...args} active={true} label="Assigned" />
        </div>
    ),
};
