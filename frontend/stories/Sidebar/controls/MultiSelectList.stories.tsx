import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import MultiSelectList from "../../../components/Sidebar/controls/MultiSelectList";

const meta: Meta<typeof MultiSelectList> = {
    title: "Sidebar/Controls/MultiSelectList",
    component: MultiSelectList,
};

export default meta;

type Story = StoryObj<typeof MultiSelectList>;

export const Default: Story = {
    args: {
        label: "Characters",
        items: ["Alice", "Bob", "Eve"],
        selected: ["Alice"],
        onChange: (selected: string[]) => console.log("selected", selected),
    },
};

export const Empty: Story = {
    args: {
        label: "Items",
        items: [],
        selected: [],
        onChange: (selected: string[]) => console.log("selected", selected),
    },
};
