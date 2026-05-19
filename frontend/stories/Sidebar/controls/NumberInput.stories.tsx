import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import NumberInput from "../../../components/Sidebar/controls/NumberInput";

const meta: Meta<typeof NumberInput> = {
    title: "Sidebar/Controls/NumberInput",
    component: NumberInput,
};

export default meta;

type Story = StoryObj<typeof NumberInput>;

export const Default: Story = {
    args: {
        label: "Word Count",
        value: 5000,
        onChange: (value: number) => console.log("word count", value),
    },
};

export const Empty: Story = {
    args: {
        label: "Word Count",
        value: undefined,
        onChange: (value: number) => console.log("word count", value),
    },
};

export const WithZero: Story = {
    args: {
        label: "Word Count",
        value: 0,
        onChange: (value: number) => console.log("word count", value),
    },
};
