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

export const InteractiveButton: Story = {
    args: {
        label: "Clickable",
        shape: "sharp",
        size: "md",
        onClick: () => console.log("chip clicked"),
    },
};
