import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EditorMenuIcon from "../../../components/Editor/MenuBar/EditorMenuIcon";
import { action } from "storybook/actions";

const meta = {
    title: "Editor/MenuBar/EditorMenuIcon",
    component: EditorMenuIcon,
} satisfies Meta<typeof EditorMenuIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        Icon: "bold",
        iconSize: 24,
        disabled: false,
        active: false,
        onClick: action("icon-clicked"),
    },
};
