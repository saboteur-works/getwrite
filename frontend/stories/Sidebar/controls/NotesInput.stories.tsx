import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import NotesInput from "../../../components/Sidebar/controls/NotesInput";

const meta: Meta<typeof NotesInput> = {
    title: "Sidebar/Controls/NotesInput",
    component: NotesInput,
};

export default meta;

type Story = StoryObj<typeof NotesInput>;

export const Default: Story = {
    args: {
        value: "Remember to resolve chapter ending.",
        placeholder: "Notes...",
        onChange: (value: string) => console.log("notes", value),
    },
};
