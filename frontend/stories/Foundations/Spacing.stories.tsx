import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

interface SpacingToken {
    token: string;
    px: string;
}

const SPACING_TOKENS: SpacingToken[] = [
    { token: "--spacing-1", px: "4px" },
    { token: "--spacing-2", px: "8px" },
    { token: "--spacing-3", px: "12px" },
    { token: "--spacing-4", px: "16px" },
    { token: "--spacing-5", px: "20px" },
    { token: "--spacing-6", px: "24px" },
    { token: "--spacing-8", px: "32px" },
    { token: "--spacing-10", px: "40px" },
    { token: "--spacing-12", px: "48px" },
    { token: "--spacing-16", px: "64px" },
    { token: "--spacing-20", px: "80px" },
];

function SpacingRow({ token, px }: SpacingToken): JSX.Element {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr",
                gap: 24,
                alignItems: "center",
                padding: "8px 0",
                borderBottom: "0.5px solid var(--color-gw-rule)",
            }}
        >
            <div>
                <code style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-secondary)" }}>
                    {token}
                </code>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-dim)" }}>{px}</code>
            </div>
            <div style={{ display: "flex", alignItems: "center", height: 24 }}>
                <div
                    style={{
                        width: `var(${token})`,
                        height: 24,
                        backgroundColor: "var(--color-gw-secondary)",
                        borderRadius: 3,
                    }}
                />
            </div>
        </div>
    );
}

function SpacingShowcase(): JSX.Element {
    return (
        <div style={{ maxWidth: 640 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--color-gw-secondary)", margin: "0 0 4px" }}>
                Spacing Scale
            </p>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-gw-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
                All steps are multiples of a 4px base unit, defined in saboteur-base.css. Bar width equals the spacing value exactly.
            </p>
            <div style={{ borderTop: "0.5px solid var(--color-gw-border)" }}>
                {SPACING_TOKENS.map((t) => (
                    <SpacingRow key={t.token} {...t} />
                ))}
            </div>
        </div>
    );
}

const meta: Meta<typeof SpacingShowcase> = {
    title: "Foundations/Spacing",
    component: SpacingShowcase,
};

export default meta;

type Story = StoryObj<typeof SpacingShowcase>;

export const Default: Story = {
    args: {},
};
