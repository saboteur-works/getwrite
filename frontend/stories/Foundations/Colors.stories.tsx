import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

interface ColorToken {
    token: string;
    dark: string;
    light: string | null;
    role: string;
}

interface ColorSectionData {
    title: string;
    description: string;
    tokens: ColorToken[];
}

const BRAND_PALETTE: ColorToken[] = [
    { token: "--color-brand-black", dark: "#0a0a0a", light: null, role: "Primary background — source of dark-mode chrome values" },
    { token: "--color-brand-white", dark: "#f5f4f0", light: null, role: "Warm off-white — not pure white. Source of light-mode text and dark-mode fg values" },
    { token: "--color-brand-red", dark: "#d44040", light: null, role: "Signal red — reserved for structure and interaction indicators only" },
    { token: "--color-brand-mid", dark: "#6a6864", light: null, role: "Mid grey — secondary text, muted labels" },
    { token: "--color-brand-dim", dark: "#2e2e2c", light: null, role: "Dark dim — default borders and rules in dark mode" },
    { token: "--color-brand-rule", dark: "#1a1a18", light: null, role: "Near-black — divider lines in dark mode" },
    { token: "--color-brand-surface", dark: "#111110", light: null, role: "Raised dark surface — panels, sidebars" },
    { token: "--color-brand-surface2", dark: "#161614", light: null, role: "Deeper dark surface — nested cards, inputs" },
];

const CHROME_SURFACES: ColorToken[] = [
    { token: "--color-gw-bg", dark: "#0a0a0a", light: "#f5f4f0", role: "Application background" },
    { token: "--color-gw-chrome", dark: "#111110", light: "#f5f4f0", role: "Panels, sidebars, title bar" },
    { token: "--color-gw-chrome2", dark: "#161614", light: "#eceae3", role: "Nested chrome: cards, inputs" },
    { token: "--color-gw-chrome3", dark: "#1a1a18", light: "#e4e1da", role: "Deepest chrome level" },
    { token: "--color-gw-chrome-light", dark: "#f5f4f0", light: null, role: "Light mode panel reference — static" },
    { token: "--color-gw-chrome2-light", dark: "#eceae3", light: null, role: "Light mode card/input reference — static" },
    { token: "--color-gw-chrome3-light", dark: "#e4e1da", light: null, role: "Deepest light chrome reference — static" },
];

const EDITOR_SURFACES: ColorToken[] = [
    { token: "--color-gw-editor", dark: "#1c1c1a", light: "#f0ede6", role: "Writing surface — always warmer than chrome" },
    { token: "--color-gw-paper", dark: "#f0ede6", light: null, role: "Light mode editor surface reference — static" },
    { token: "--color-gw-ink", dark: "#f5f4f0", light: "#1a1916", role: "Body text on the editor surface" },
];

const TEXT_COLORS: ColorToken[] = [
    { token: "--color-gw-primary", dark: "#f5f4f0", light: "#0a0a0a", role: "Primary UI text" },
    { token: "--color-gw-secondary", dark: "#6a6864", light: "#7a7870", role: "Muted labels, panel headers" },
    { token: "--color-gw-secondary-light", dark: "#7a7870", light: null, role: "Light mode secondary reference — static" },
    { token: "--color-gw-dim", dark: "#3a3a38", light: null, role: "Near-invisible text on dark surfaces — folder tree items. Dark-mode only by design; no light-mode equivalent exists." },
    { token: "--color-gw-red", dark: "#d44040", light: null, role: "Signal red — cursor, canonical badge, active file — static" },
];

const BORDER_COLORS: ColorToken[] = [
    { token: "--color-gw-border", dark: "#2e2e2c", light: "#d0cec8", role: "Default 0.5px borders" },
    { token: "--color-gw-border-md", dark: "#3a3a38", light: "#b0ada8", role: "Hover / emphasis borders" },
    { token: "--color-gw-rule", dark: "#1a1a18", light: "#d8d5ce", role: "Divider lines" },
    { token: "--color-gw-red-border", dark: "#d44040", light: null, role: "Active file indicator, canonical badge border — static" },
    { token: "--color-gw-focus-ring", dark: "rgba(212, 64, 64, 0.2)", light: null, role: "Keyboard focus ring — static" },
    { token: "--color-gw-border-light", dark: "#d0cec8", light: null, role: "Light mode border reference — static" },
    { token: "--color-gw-rule-light", dark: "#d8d5ce", light: null, role: "Light mode rule reference — static" },
];

const FUNCTIONAL_COLORS: ColorToken[] = [
    { token: "--color-gw-saved", dark: "#4a9e4a", light: null, role: "Save status: saved — static" },
    { token: "--color-gw-saving", dark: "#d4a440", light: null, role: "Save status: saving — static" },
];

const TOAST_DIFF_COLORS: ColorToken[] = [
    { token: "--color-gw-toast-bg", dark: "#1a1a18", light: null, role: "Default toast background — fixed dark, outside cascade" },
    { token: "--color-gw-toast-fg", dark: "#f5f4f0", light: null, role: "Default toast text — fixed dark" },
    { token: "--color-gw-toast-success-bg", dark: "#0d2a18", light: null, role: "Success toast background — fixed dark" },
    { token: "--color-gw-toast-success-fg", dark: "#b3e8c2", light: null, role: "Success toast text — fixed dark" },
    { token: "--color-gw-toast-error-bg", dark: "#291d09", light: null, role: "Error toast background — amber, not red — fixed dark" },
    { token: "--color-gw-toast-error-fg", dark: "#f0d8a8", light: null, role: "Error toast text — fixed dark" },
    { token: "--color-gw-diff-added", dark: "rgba(80, 160, 100, 0.24)", light: "rgba(80, 160, 100, 0.18)", role: "Added text highlight in diff view" },
    { token: "--color-gw-diff-removed", dark: "rgba(80, 130, 180, 0.24)", light: "rgba(80, 130, 180, 0.18)", role: "Removed text highlight in diff view" },
];

const SECTIONS: ColorSectionData[] = [
    {
        title: "Brand Palette",
        description: "Fixed raw brand colors from saboteur-base.css. These tokens do not cascade between light and dark — they are the source palette from which semantic --color-gw-* tokens are derived. The warm black (#0a0a0a) and off-white (#f5f4f0) are foundational: GetWrite is never pure black or pure white.",
        tokens: BRAND_PALETTE,
    },
    {
        title: "Chrome Surfaces",
        description: "Backgrounds outside the editor: app shell, panels, sidebars, title bar. In light mode, chrome surfaces shift to warm off-white values.",
        tokens: CHROME_SURFACES,
    },
    {
        title: "Editor Surfaces",
        description: "Writing surface colors. The editor must always be warmer than the surrounding chrome — this is the primary spatial signal.",
        tokens: EDITOR_SURFACES,
    },
    {
        title: "Text",
        description: "Semantic text colors for UI and editor content. Red is reserved for position and canonical indicators only — never for actions or alerts.",
        tokens: TEXT_COLORS,
    },
    {
        title: "Borders",
        description: "Border, divider, and focus ring colors. Hairline (0.5px) is the default; md variant appears on hover.",
        tokens: BORDER_COLORS,
    },
    {
        title: "Functional",
        description: "Status indicator colors. Not brand colors — exception use for save state only. Do not use elsewhere.",
        tokens: FUNCTIONAL_COLORS,
    },
    {
        title: "Toast & Diff",
        description: "Toast tokens render outside the .appshell-shell cascade and are always fixed dark values. Diff tokens have a slight opacity shift between modes.",
        tokens: TOAST_DIFF_COLORS,
    },
];

const colLabelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: "var(--color-gw-secondary)",
};

const GRID: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "52px 1fr 196px 196px 1fr",
    gap: "0 16px",
    alignItems: "center",
};

function MiniSwatch({ color }: { color: string }): JSX.Element {
    return (
        <div
            style={{
                width: 14,
                height: 14,
                backgroundColor: color,
                border: "0.5px solid var(--color-gw-border)",
                borderRadius: 3,
                flexShrink: 0,
            }}
        />
    );
}

function TableHeader(): JSX.Element {
    return (
        <div style={{ ...GRID, paddingBottom: 6, borderBottom: "0.5px solid var(--color-gw-border)" }}>
            <span />
            <span style={colLabelStyle}>Token</span>
            <span style={colLabelStyle}>Dark</span>
            <span style={colLabelStyle}>Light</span>
            <span style={colLabelStyle}>Role</span>
        </div>
    );
}

function ColorRow({ token, dark, light, role }: ColorToken): JSX.Element {
    return (
        <div style={{ ...GRID, padding: "8px 0", borderBottom: "0.5px solid var(--color-gw-rule)" }}>
            <div
                style={{
                    width: 44,
                    height: 44,
                    backgroundColor: `var(${token})`,
                    border: "0.5px solid var(--color-gw-border)",
                    borderRadius: 5,
                }}
            />
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-gw-secondary)", wordBreak: "break-all" }}>
                {token}
            </code>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MiniSwatch color={dark} />
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-secondary)" }}>{dark}</code>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {light !== null ? (
                    <>
                        <MiniSwatch color={light} />
                        <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-secondary)" }}>{light}</code>
                    </>
                ) : (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-dim)", fontStyle: "italic" }}>
                        static
                    </span>
                )}
            </div>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-gw-secondary)", lineHeight: 1.4 }}>
                {role}
            </span>
        </div>
    );
}

function ColorSection({ title, description, tokens }: ColorSectionData): JSX.Element {
    return (
        <section style={{ marginBottom: 48 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--color-gw-secondary)", margin: "0 0 4px" }}>
                {title}
            </p>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-gw-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
                {description}
            </p>
            <TableHeader />
            {tokens.map((t) => (
                <ColorRow key={t.token} {...t} />
            ))}
        </section>
    );
}

function ColorShowcase(): JSX.Element {
    return (
        <div style={{ maxWidth: 980 }}>
            {SECTIONS.map((section) => (
                <ColorSection key={section.title} {...section} />
            ))}
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
