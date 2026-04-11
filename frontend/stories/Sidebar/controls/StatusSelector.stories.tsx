import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import StatusSelector from "../../../components/Sidebar/controls/StatusSelector";

const meta: Meta<typeof StatusSelector> = {
    title: "Sidebar/Controls/StatusSelector",
    component: StatusSelector,
};

export default meta;

type Story = StoryObj<typeof StatusSelector>;

export const Default: Story = {
    args: {
        value: "review",
        onChange: (value: string) => console.log("status", value),
    },
};
