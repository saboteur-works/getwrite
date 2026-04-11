import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import AppearanceRuntime from "../../components/preferences/AppearanceRuntime";
import {
    APPEARANCE_CHANGED_EVENT,
    saveGlobalAppearancePreferences,
} from "../../src/lib/user-preferences";

const meta: Meta<typeof AppearanceRuntime> = {
    title: "Preferences/AppearanceRuntime",
    component: AppearanceRuntime,
};

export default meta;

type Story = StoryObj<typeof AppearanceRuntime>;

export const Interactive: Story = {
    args: {},
    render: () => {
        const updateAppearance = (
            mode: "light" | "dark" | "system",
            density: "compact" | "comfortable",
            reducedMotion: boolean,
        ) => {
            saveGlobalAppearancePreferences({
                colorModePreference: mode,
                density,
                reducedMotion,
            });
            window.dispatchEvent(new Event(APPEARANCE_CHANGED_EVENT));
        };

        return (
            <div style={{ display: "grid", gap: 8 }}>
                <p>Applies classes to document root based on saved appearance.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                        type="button"
                        onClick={() =>
                            updateAppearance("light", "comfortable", false)
                        }
                    >
                        Light Comfortable
                    </button>
                    <button
                        type="button"
                        onClick={() => updateAppearance("dark", "compact", false)}
                    >
                        Dark Compact
                    </button>
                    <button
                        type="button"
                        onClick={() => updateAppearance("system", "compact", true)}
                    >
                        System Compact Reduced Motion
                    </button>
                </div>
                <AppearanceRuntime />
            </div>
        );
    },
};