import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import HelpSectionCard from "../../components/help/HelpSectionCard";

const meta: Meta<typeof HelpSectionCard> = {
    title: "Help/HelpSectionCard",
    component: HelpSectionCard,
};

export default meta;

type Story = StoryObj<typeof HelpSectionCard>;

export const Default: Story = {
    args: {
        title: "Quick workflow",
        items: [
            [
                "Open ",
                { kind: "strong", text: "Start Page" },
                " to create or open a project.",
            ],
            [
                "Use ",
                { kind: "kbd", text: "Esc" },
                " to close menus and dialogs.",
            ],
            [
                "Switch views between ",
                { kind: "em", text: "Edit" },
                " and Organizer from the view switcher.",
            ],
        ],
    },
};