import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceTree from "../../components/ResourceTree/ResourceTree";

const meta = {
    title: "HeadlessTree/ResourceTree",
    component: ResourceTree,
} satisfies Meta<typeof ResourceTree>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        projectId: "test-proj-1",
        onSelect: (id: string) => console.log("selected", id),
    },
} satisfies Story;

export const Reorderable: Story = {
    args: {
        projectId: "test-proj-1",
        debug: true,
    },
};
