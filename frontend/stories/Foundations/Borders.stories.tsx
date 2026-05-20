import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

interface RadiusToken {
    token: string;
    px: string;
    use: string;
}

interface BorderWidthToken {
    token: string;
    px: string;
    use: string;
}

const RADIUS_TOKENS: RadiusToken[] = [
    { token: "--radius-sm", px: "3px", use: "Tags, chips, badges" },
    { token: "--radius-md", px: "5px", use: "Buttons, inputs" },
    { token: "--radius-lg", px: "8px", use: "Cards" },
    { token: "--radius-xl", px: "12px", use: "Modals, large containers" },
];

const BORDER_WIDTH_TOKENS: BorderWidthToken[] = [
    { token: "--border-width-hairline", px: "0.5px", use: "Default UI borders" },
    { token: "--border-width-thin", px: "1px", use: "Emphasized borders" },
    { token: "--border-width-bar", px: "3px", use: "Sub-brand left bars" },
    { token: "--border-width-mark", px: "4px", use: "Primary mark left bar" },
];

function SectionHeader({ title, description }: { title: string; description: string }): JSX.Element {
    return (
        <div style={{ marginBottom: 16 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--color-gw-secondary)", margin: "0 0 4px" }}>
                {title}
            </p>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-gw-secondary)", margin: 0, lineHeight: 1.5 }}>
                {description}
            </p>
        </div>
    );
}

function RadiusRow({ token, px, use }: RadiusToken): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "12px 0", borderBottom: "0.5px solid var(--color-gw-rule)" }}>
            <div
                style={{
                    width: 80,
                    height: 80,
                    backgroundColor: "var(--color-gw-chrome2)",
                    border: "0.5px solid var(--color-gw-border)",
                    borderRadius: `var(${token})`,
                    flexShrink: 0,
                }}
            />
            <div>
                <code style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-gw-secondary)", marginBottom: 4 }}>
                    {token}
                </code>
                <div style={{ display: "flex", gap: 8 }}>
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-dim)" }}>{px}</code>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--color-gw-secondary)" }}>· {use}</span>
                </div>
            </div>
        </div>
    );
}

function BorderWidthRow({ token, px, use }: BorderWidthToken): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "12px 0", borderBottom: "0.5px solid var(--color-gw-rule)" }}>
            <div
                style={{
                    width: 120,
                    height: 40,
                    border: `var(${token}) solid var(--color-gw-primary)`,
                    borderRadius: "var(--radius-md)",
                    flexShrink: 0,
                }}
            />
            <div>
                <code style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-gw-secondary)", marginBottom: 4 }}>
                    {token}
                </code>
                <div style={{ display: "flex", gap: 8 }}>
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-dim)" }}>{px}</code>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--color-gw-secondary)" }}>· {use}</span>
                </div>
            </div>
        </div>
    );
}

function CompositionExample(): JSX.Element {
    return (
        <div
            style={{
                padding: 20,
                backgroundColor: "var(--color-gw-chrome2)",
                border: "var(--border-width-hairline) solid var(--color-gw-border)",
                borderRadius: "var(--radius-lg)",
                maxWidth: 320,
            }}
        >
            <div style={{ marginBottom: 12, borderBottom: "var(--border-width-hairline) solid var(--color-gw-rule)", paddingBottom: 12 }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "var(--color-gw-primary)" }}>
                    Chapter Overview
                </span>
            </div>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-gw-secondary)", margin: 0, lineHeight: 1.6 }}>
                Scene structure, character arcs, and pacing notes for Part II.
            </p>
        </div>
    );
}

function BordersShowcase(): JSX.Element {
    return (
        <div style={{ maxWidth: 640 }}>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader
                    title="Border Radius"
                    description="Radius tokens from saboteur-base.css, shown on 80×80px squares. The curvature step from sm to xl is subtle — this is intentional."
                />
                <div style={{ borderTop: "0.5px solid var(--color-gw-border)" }}>
                    {RADIUS_TOKENS.map((t) => (
                        <RadiusRow key={t.token} {...t} />
                    ))}
                </div>
            </section>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader
                    title="Border Widths"
                    description="Width tokens from saboteur-base.css, shown as bordered boxes using --color-gw-primary for contrast. Hairline (0.5px) is the default for all UI borders."
                />
                <div style={{ borderTop: "0.5px solid var(--color-gw-border)" }}>
                    {BORDER_WIDTH_TOKENS.map((t) => (
                        <BorderWidthRow key={t.token} {...t} />
                    ))}
                </div>
            </section>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader
                    title="Composition"
                    description="A typical card: --radius-lg corners + --border-width-hairline (0.5px) border in --color-gw-border on a --color-gw-chrome2 surface. This is the standard card pattern throughout the app."
                />
                <div style={{ borderTop: "0.5px solid var(--color-gw-border)", paddingTop: 20 }}>
                    <CompositionExample />
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-secondary)", margin: "14px 0 0", letterSpacing: "0.06em" }}>
                        --radius-lg · --border-width-hairline · --color-gw-border · --color-gw-chrome2
                    </p>
                </div>
            </section>
        </div>
    );
}

const meta: Meta<typeof BordersShowcase> = {
    title: "Foundations/Borders",
    component: BordersShowcase,
};

export default meta;

type Story = StoryObj<typeof BordersShowcase>;

export const Default: Story = {
    args: {},
};
