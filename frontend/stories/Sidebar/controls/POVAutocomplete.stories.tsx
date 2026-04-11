import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import POVAutocomplete from "../../../components/Sidebar/controls/POVAutocomplete";

const meta: Meta<typeof POVAutocomplete> = {
    title: "Sidebar/Controls/POVAutocomplete",
    component: POVAutocomplete,
};

export default meta;

type Story = StoryObj<typeof POVAutocomplete>;

export const Default: Story = {
    args: {
        options: ["Alice", "Bob", "Narrator"],
        value: "Alice",
        onChange: (value: string) => console.log("pov", value),
    },
};
