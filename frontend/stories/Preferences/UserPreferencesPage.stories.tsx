import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import UserPreferencesPage from "../../components/preferences/UserPreferencesPage";

const meta: Meta<typeof UserPreferencesPage> = {
    title: "Preferences/UserPreferencesPage",
    component: UserPreferencesPage,
};

export default meta;

type Story = StoryObj<typeof UserPreferencesPage>;

export const ModalMode: Story = {
    args: {
        renderInModal: true,
        onClose: () => console.log("close"),
    },
};