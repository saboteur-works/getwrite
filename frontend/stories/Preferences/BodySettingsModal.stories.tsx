import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import BodySettingsModal from "../../components/preferences/BodySettingsModal";
import type { EditorBodyConfig } from "../../src/lib/editor-body-settings";

const meta = {
    title: "Preferences/BodySettingsModal",
    component: BodySettingsModal,
} satisfies Meta<typeof BodySettingsModal>;

export default meta;

type Story = StoryObj<typeof meta>;

const fullConfig: EditorBodyConfig = {
    fontFamily: "IBM Plex Serif",
    fontSize: "18px",
    lineHeight: "1.8",
    paragraphSpacing: "1em",
};

export const Default: Story = {
    args: {
        onClose: () => console.log("close"),
        onSave: async (body: EditorBodyConfig) => {
            console.log("save", body);
        },
    },
};

export const WithValues: Story = {
    args: {
        initialBody: fullConfig,
        onClose: () => console.log("close"),
        onSave: async (body: EditorBodyConfig) => {
            console.log("save", body);
        },
    },
};

export const WithValidationError: Story = {
    render: () => {
        return (
            <BodySettingsModal
                initialBody={fullConfig}
                onClose={() => console.log("close")}
                onSave={async () => {
                    throw new Error("Failed to save: project is read-only.");
                }}
            />
        );
    },
};

export const PartialValues: Story = {
    args: {
        initialBody: {
            fontFamily: "Georgia",
            fontSize: "16px",
        },
        onClose: () => console.log("close"),
        onSave: async (body: EditorBodyConfig) => {
            console.log("save", body);
        },
    },
};
