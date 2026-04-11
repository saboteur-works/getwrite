import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import HeadingStyleField from "../../components/preferences/HeadingStyleField";

const meta: Meta<typeof HeadingStyleField> = {
    title: "Preferences/HeadingStyleField",
    component: HeadingStyleField,
};

export default meta;

type Story = StoryObj<typeof HeadingStyleField>;

export const WithTextInput: Story = {
    args: {
        id: "h1-font-family",
        label: "Font Family",
        children: (
            <input
                id="h1-font-family"
                defaultValue="IBM Plex Sans"
                className="rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary"
            />
        ),
    },
};
