import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EditorMenuColorSubmenu from "../../../components/Editor/MenuBar/EditorMenuColorSubmenu";
import { action } from "storybook/actions";

const meta = {
    title: "Editor/MenuBar/EditorMenuColorSubmenu",
    component: EditorMenuColorSubmenu,
} satisfies Meta<typeof EditorMenuColorSubmenu>;

export default meta;

type Story = StoryObj<typeof meta>;

const PALETTE = [
    "#000000",
    "#374151",
    "#6B7280",
    "#9CA3AF",
    "#D44040",
    "#B91C1C",
    "#1D4ED8",
    "#0369A1",
    "#065F46",
    "#92400E",
    "#6D28D9",
    "#DB2777",
];

export const FontColor: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome flex items-center gap-2 min-h-[120px]">
            <EditorMenuColorSubmenu
                iconName="fontColor"
                colors={PALETTE}
                onSelectColor={action("color-selected")}
                tooltipContent="Text color"
            />
        </div>
    ),
};

export const Highlighter: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome flex items-center gap-2 min-h-[120px]">
            <EditorMenuColorSubmenu
                iconName="highlight"
                colors={PALETTE}
                onSelectColor={action("color-selected")}
                tooltipContent="Highlight color"
            />
        </div>
    ),
};

export const WithActiveColor: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome flex items-center gap-2 min-h-[120px]">
            <EditorMenuColorSubmenu
                iconName="fontColor"
                colors={PALETTE}
                activeColor="#D44040"
                onSelectColor={action("color-selected")}
                tooltipContent="Text color"
            />
        </div>
    ),
};

export const Disabled: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome flex items-center gap-2 min-h-[120px]">
            <EditorMenuColorSubmenu
                iconName="fontColor"
                colors={PALETTE}
                disabled={true}
                onSelectColor={action("color-selected")}
                tooltipContent="Text color (disabled)"
            />
        </div>
    ),
};
