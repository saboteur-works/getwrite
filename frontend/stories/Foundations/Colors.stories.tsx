import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RectangleHorizontal } from "lucide-react";
interface ColorShowcaseProps {}

function ColorSwatch({ token }: { token: string }): JSX.Element {
    return (
        <div className="flex items-center gap-1">
            <div
                className="h-4 w-4 rounded shrink-0 "
                style={{ backgroundColor: `var(${token})` }}
            />

            <code className="text-xs text-gw-secondary">{token}</code>
        </div>
    );
}

function ColorShowcase({}: ColorShowcaseProps): JSX.Element {
    return (
        <div className="">
            <p>Chrome Editor Surface Tokens</p>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ColorSwatch token="--color-gw-bg" />
                <ColorSwatch token="--color-gw-chrome" />
                <ColorSwatch token="--color-gw-chrome2" />
                <ColorSwatch token="--color-gw-chrome3" />
                <ColorSwatch token="--color-gw-primary" />
                <ColorSwatch token="--color-gw-secondary" />
                <ColorSwatch token="--color-gw-border" />
                <ColorSwatch token="--color-gw-border-md" />
                <ColorSwatch token="--color-gw-rule" />
                <ColorSwatch token="--color-gw-editor" />
                <ColorSwatch token="--color-gw-diff-added" />
                <ColorSwatch token="--color-gw-diff-removed" />
            </section>
            <p>Chrome Editor Surface Tokens</p>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ColorSwatch token="--color-gw-editor" />
                <ColorSwatch token="--color-gw-paper" />
                <ColorSwatch token="--color-gw-ink" />
            </section>
            <p>Functional Colors</p>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ColorSwatch token="--color-gw-saved" />
                <ColorSwatch token="--color-gw-saving" />
            </section>
            <p>Timeline</p>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ColorSwatch token="--timeline-bg" />
                <ColorSwatch token="--timeline-track-bg" />
                <ColorSwatch token="--timeline-axis-color" />
                <ColorSwatch token="--timeline-axis-label-color" />
                <ColorSwatch token="--timeline-item-bg" />
                <ColorSwatch token="--timeline-item-color" />
                <ColorSwatch token="--timeline-group-label-color" />
                <ColorSwatch token="--timeline-row-separator" />
                <ColorSwatch token="--timeline-rule-color" />
            </section>
        </div>
    );
}

const meta: Meta<typeof ColorShowcase> = {
    title: "Foundations/Colors",
    component: ColorShowcase,
};

export default meta;

type Story = StoryObj<typeof ColorShowcase>;

export const Default: Story = {
    args: {},
};
