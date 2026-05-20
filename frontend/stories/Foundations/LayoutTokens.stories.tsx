import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

interface LayoutToken {
    token: string;
    px: string;
    role: string;
}

const WIDTH_TOKENS: LayoutToken[] = [
    { token: "--width-gw-resource-panel", px: "200px", role: "Resource tree panel width" },
    { token: "--width-gw-metadata-panel", px: "220px", role: "Metadata/properties panel width" },
];

const HEIGHT_TOKENS: LayoutToken[] = [
    { token: "--height-gw-titlebar", px: "44px", role: "Application title bar" },
    { token: "--height-gw-tab", px: "38px", role: "Editor tab bar" },
    { token: "--height-gw-tree-item", px: "32px", role: "Resource tree row height" },
];

const PADDING_TOKENS: LayoutToken[] = [
    { token: "--padding-gw-editor-x", px: "40px", role: "Editor horizontal padding" },
    { token: "--padding-gw-editor-y", px: "32px", role: "Editor top padding" },
];

const COMPONENT_TOKENS: LayoutToken[] = [
    { token: "--width-gw-active-indicator", px: "2px", role: "Left border on active resource tree item" },
    { token: "--height-gw-tab-underline", px: "1.5px", role: "Red underline on active editor tab" },
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

function TokenMeta({ token, px, role }: LayoutToken): JSX.Element {
    return (
        <div>
            <code style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-gw-secondary)", marginBottom: 4 }}>
                {token}
            </code>
            <div style={{ display: "flex", gap: 8 }}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-dim)" }}>{px}</code>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--color-gw-secondary)" }}>· {role}</span>
            </div>
        </div>
    );
}

function WidthRow({ token, px, role }: LayoutToken): JSX.Element {
    return (
        <div style={{ padding: "12px 0", borderBottom: "0.5px solid var(--color-gw-rule)" }}>
            <TokenMeta token={token} px={px} role={role} />
            <div style={{ marginTop: 10, height: 32, backgroundColor: "var(--color-gw-chrome2)", border: "0.5px solid var(--color-gw-border)", borderRadius: "var(--radius-sm)", width: `var(${token})` }} />
        </div>
    );
}

function HeightRow({ token, px, role }: LayoutToken): JSX.Element {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 24, alignItems: "center", padding: "12px 0", borderBottom: "0.5px solid var(--color-gw-rule)" }}>
            <TokenMeta token={token} px={px} role={role} />
            <div style={{ height: `var(${token})`, backgroundColor: "var(--color-gw-chrome2)", border: "0.5px solid var(--color-gw-border)", borderRadius: "var(--radius-sm)" }} />
        </div>
    );
}

function PaddingRow({ token, px, role }: LayoutToken): JSX.Element {
    return (
        <div style={{ padding: "12px 0", borderBottom: "0.5px solid var(--color-gw-rule)" }}>
            <TokenMeta token={token} px={px} role={role} />
            <div style={{ marginTop: 10, display: "inline-flex" }}>
                <div
                    style={{
                        padding: `var(${token})`,
                        backgroundColor: "var(--color-gw-chrome2)",
                        border: "0.5px dashed var(--color-gw-border)",
                        borderRadius: "var(--radius-sm)",
                    }}
                >
                    <div style={{ width: 48, height: 16, backgroundColor: "var(--color-gw-secondary)", borderRadius: 2 }} />
                </div>
            </div>
        </div>
    );
}

function ActiveIndicatorExample(): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "12px 0", borderBottom: "0.5px solid var(--color-gw-rule)" }}>
            <TokenMeta token="--width-gw-active-indicator" px="2px" role="Left border on active resource tree item" />
            <div
                style={{
                    height: 32,
                    width: 160,
                    backgroundColor: "var(--color-gw-chrome2)",
                    borderLeft: "var(--width-gw-active-indicator) solid var(--color-gw-red-border)",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 8,
                    flexShrink: 0,
                    borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                }}
            >
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-gw-primary)" }}>Chapter 01</span>
            </div>
        </div>
    );
}

function TabUnderlineExample(): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "12px 0", borderBottom: "0.5px solid var(--color-gw-rule)" }}>
            <TokenMeta token="--height-gw-tab-underline" px="1.5px" role="Red underline on active editor tab" />
            <div
                style={{
                    height: "var(--height-gw-tab)",
                    display: "inline-flex",
                    alignItems: "center",
                    paddingBottom: 1,
                    borderBottom: "var(--height-gw-tab-underline) solid var(--color-gw-red-border)",
                    flexShrink: 0,
                }}
            >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-gw-primary)" }}>
                    Chapter 01
                </span>
            </div>
        </div>
    );
}

function LayoutTokensShowcase(): JSX.Element {
    return (
        <div style={{ maxWidth: 760 }}>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader title="Panel Widths" description="Width tokens for the three-panel layout. Bars are rendered at the exact token value." />
                <div style={{ borderTop: "0.5px solid var(--color-gw-border)" }}>
                    {WIDTH_TOKENS.map((t) => <WidthRow key={t.token} {...t} />)}
                </div>
            </section>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader title="Heights" description="Height tokens for chrome bars. Boxes are rendered at the exact token height." />
                <div style={{ borderTop: "0.5px solid var(--color-gw-border)" }}>
                    {HEIGHT_TOKENS.map((t) => <HeightRow key={t.token} {...t} />)}
                </div>
            </section>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader title="Editor Padding" description="Padding applied around the writing surface. The dashed border shows the container; the filled block shows the content area." />
                <div style={{ borderTop: "0.5px solid var(--color-gw-border)" }}>
                    {PADDING_TOKENS.map((t) => <PaddingRow key={t.token} {...t} />)}
                </div>
            </section>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader title="Component Dimensions" description="Sub-pixel and small component tokens. Shown in context so their visual effect is legible." />
                <div style={{ borderTop: "0.5px solid var(--color-gw-border)" }}>
                    <ActiveIndicatorExample />
                    <TabUnderlineExample />
                </div>
            </section>
        </div>
    );
}

const meta: Meta<typeof LayoutTokensShowcase> = {
    title: "Foundations/Layout Tokens",
    component: LayoutTokensShowcase,
};

export default meta;

type Story = StoryObj<typeof LayoutTokensShowcase>;

export const Default: Story = {
    args: {},
};
