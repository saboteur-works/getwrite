import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import BooleanToggle from "../../../components/Sidebar/controls/BooleanToggle";

const meta: Meta<typeof BooleanToggle> = {
    title: "Sidebar/Controls/BooleanToggle",
    component: BooleanToggle,
};

export default meta;

type Story = StoryObj<typeof BooleanToggle>;

export const Unchecked: Story = {
    args: {
        label: "Published",
        value: false,
        onChange: (value: boolean) => console.log("published", value),
    },
};

export const Checked: Story = {
    args: {
        label: "Published",
        value: true,
        onChange: (value: boolean) => console.log("published", value),
    },
};

export const Undefined: Story = {
    args: {
        label: "Published",
        value: undefined,
        onChange: (value: boolean) => console.log("published", value),
    },
};
