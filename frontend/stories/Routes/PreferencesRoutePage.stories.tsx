import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import UserPreferencesPage from "../../components/preferences/UserPreferencesPage";

const meta: Meta<typeof UserPreferencesPage> = {
    title: "Routes/Preferences",
    component: UserPreferencesPage,
};

export default meta;

type Story = StoryObj<typeof UserPreferencesPage>;

export const Screen: Story = {
    args: {
        renderInModal: false,
        onClose: () => console.log("close"),
    },
};
