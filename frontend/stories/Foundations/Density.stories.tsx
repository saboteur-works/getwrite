import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

function MockChrome({ compact }: { compact: boolean }): JSX.Element {
    const containerClass = compact ? "gw-density-compact" : undefined;

    return (
        <div
            className={containerClass}
            style={{
                width: 320,
                border: "0.5px solid var(--color-gw-border)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                backgroundColor: "var(--color-gw-chrome)",
            }}
        >
            <div
                className="appshell-topbar"
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "0.5px solid var(--color-gw-border)",
                    backgroundColor: "var(--color-gw-chrome)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 400, letterSpacing: "var(--tracking-wordmark)", color: "var(--color-gw-primary)" }}>Get</span>
                    <div style={{ width: 3, height: "0.75em", backgroundColor: "var(--color-gw-red)", flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, letterSpacing: "var(--tracking-wordmark)", color: "var(--color-gw-primary)" }}>Write</span>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-gw-secondary)" }}>
                    Example Project
                </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr" }}>
                <div
                    style={{
                        borderRight: "0.5px solid var(--color-gw-border)",
                    }}
                >
                    <div
                        className="appshell-sidebar-header"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            borderBottom: "0.5px solid var(--color-gw-border)",
                            backgroundColor: "var(--color-gw-chrome)",
                        }}
                    >
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--color-gw-secondary)" }}>
                            Resources
                        </span>
                    </div>
                    <div style={{ padding: "8px 0" }}>
                        {["Chapter 01", "Chapter 02", "Chapter 03"].map((name, i) => (
                            <div
                                key={name}
                                style={{
                                    height: "var(--height-gw-tree-item)",
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "0 12px",
                                    backgroundColor: i === 0 ? "var(--color-gw-chrome2)" : undefined,
                                    borderLeft: i === 0 ? "var(--width-gw-active-indicator) solid var(--color-gw-red-border)" : undefined,
                                }}
                            >
                                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: i === 0 ? "var(--color-gw-primary)" : "var(--color-gw-secondary)" }}>
                                    {name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ padding: "16px 12px", backgroundColor: "var(--color-gw-editor)" }}>
                    <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, lineHeight: 1.8, color: "var(--color-gw-ink)", margin: 0 }}>
                        The room is quiet except for the hinge-click of the desk lamp.
                    </p>
                </div>
            </div>
        </div>
    );
}

function DensityRow({ compact }: { compact: boolean }): JSX.Element {
    return (
        <div style={{ padding: "24px 0", borderBottom: "0.5px solid var(--color-gw-rule)" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--color-gw-secondary)", margin: "0 0 4px" }}>
                {compact ? "Compact" : "Comfortable (default)"}
            </p>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--color-gw-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
                {compact
                    ? "Class: .gw-density-compact · Topbar 48px → 3rem (48px set, padding reduced) · Sidebar header 2.5rem"
                    : "No density class applied · Topbar height: 44px (--height-gw-titlebar) · Sidebar header: 44px"}
            </p>
            <MockChrome compact={compact} />
        </div>
    );
}

function DensityShowcase(): JSX.Element {
    return (
        <div style={{ maxWidth: 640 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--color-gw-secondary)", margin: "0 0 4px" }}>
                Density
            </p>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-gw-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
                GetWrite supports two density modes. Comfortable is the default. Compact reduces chrome bar heights and padding, controlled by the .gw-density-compact class applied to the root container.
            </p>
            <div style={{ borderTop: "0.5px solid var(--color-gw-border)" }}>
                <DensityRow compact={false} />
                <DensityRow compact={true} />
            </div>
        </div>
    );
}

const meta: Meta<typeof DensityShowcase> = {
    title: "Foundations/Density",
    component: DensityShowcase,
};

export default meta;

type Story = StoryObj<typeof DensityShowcase>;

export const Default: Story = {
    args: {},
};
