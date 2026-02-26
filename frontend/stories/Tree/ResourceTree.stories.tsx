import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceTree from "../../components/Tree/ResourceTree";

const meta = {
    title: "Tree/ResourceTree",
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
        reorderable: true,
        onReorder: (ids: string[]) => console.log("reordered", ids),
    },
};
