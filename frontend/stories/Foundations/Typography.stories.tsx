import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

interface TypeScaleEntry {
    token: string;
    sizePx: string;
    fontFamily: string;
    weight: number;
    tracking: string;
    uppercase: boolean;
    annotation: string | null;
    use: string;
    specimen: string;
}

interface FontFamilyEntry {
    token: string;
    name: string;
    weight: number;
    use: string;
    specimen: string;
}

interface TrackingEntry {
    token: string;
    value: string;
    use: string;
}

interface LeadingEntry {
    token: string;
    value: string;
    use: string;
}

const TYPE_SCALE: TypeScaleEntry[] = [
    {
        token: "--font-size-gw-hero",
        sizePx: "clamp(60–88px)",
        fontFamily: "var(--font-display)",
        weight: 700,
        tracking: "-0.04em",
        uppercase: false,
        annotation: "clamp(60px, 9vw, 88px) · min: 60px · preferred: 9vw · max: 88px",
        use: "Hero wordmark",
        specimen: "GetWrite",
    },
    {
        token: "--font-size-gw-display",
        sizePx: "48px",
        fontFamily: "var(--font-display)",
        weight: 700,
        tracking: "-0.03em",
        uppercase: false,
        annotation: null,
        use: "Display headings",
        specimen: "GetWrite",
    },
    {
        token: "--font-size-gw-h1",
        sizePx: "28px",
        fontFamily: "var(--font-sans)",
        weight: 700,
        tracking: "-0.02em",
        uppercase: false,
        annotation: null,
        use: "Project and page titles",
        specimen: "Project Overview",
    },
    {
        token: "--font-size-gw-h2",
        sizePx: "18px",
        fontFamily: "var(--font-sans)",
        weight: 700,
        tracking: "0",
        uppercase: false,
        annotation: null,
        use: "Section headings",
        specimen: "Chapter Structure",
    },
    {
        token: "--font-size-gw-h3",
        sizePx: "14px",
        fontFamily: "var(--font-sans)",
        weight: 700,
        tracking: "0",
        uppercase: false,
        annotation: null,
        use: "Card titles, panel headings",
        specimen: "Scene Details",
    },
    {
        token: "--font-size-gw-body",
        sizePx: "14px",
        fontFamily: "var(--font-sans)",
        weight: 400,
        tracking: "0",
        uppercase: false,
        annotation: null,
        use: "UI body text",
        specimen: "The application shell is organized into three panels.",
    },
    {
        token: "--font-size-gw-small",
        sizePx: "13px",
        fontFamily: "var(--font-sans)",
        weight: 400,
        tracking: "0",
        uppercase: false,
        annotation: null,
        use: "Secondary body text",
        specimen: "Last modified 2 minutes ago",
    },
    {
        token: "--font-size-gw-editor",
        sizePx: "15px",
        fontFamily: "var(--font-serif)",
        weight: 400,
        tracking: "0",
        uppercase: false,
        annotation: null,
        use: "Editor body — IBM Plex Serif, editor surface only",
        specimen: "The room is quiet except for the hinge-click of the desk lamp.",
    },
    {
        token: "--font-size-gw-label",
        sizePx: "11px",
        fontFamily: "var(--font-mono)",
        weight: 400,
        tracking: "0.14em",
        uppercase: true,
        annotation: null,
        use: "Panel section headers",
        specimen: "Panel Section",
    },
    {
        token: "--font-size-gw-micro",
        sizePx: "10px",
        fontFamily: "var(--font-mono)",
        weight: 400,
        tracking: "0.1em",
        uppercase: true,
        annotation: null,
        use: "Timestamps, metadata values",
        specimen: "Saved · 2 min ago",
    },
    {
        token: "--font-size-gw-nano",
        sizePx: "9px",
        fontFamily: "var(--font-mono)",
        weight: 400,
        tracking: "0.18em",
        uppercase: true,
        annotation: null,
        use: "Tab labels, keyboard shortcuts",
        specimen: "Edit · Format",
    },
];

const FONT_FAMILIES: FontFamilyEntry[] = [
    {
        token: "--font-display",
        name: "IBM Plex Sans Condensed",
        weight: 700,
        use: "Wordmarks, major headings",
        specimen: "GetWrite — A Writing Workspace",
    },
    {
        token: "--font-sans",
        name: "IBM Plex Sans",
        weight: 400,
        use: "UI body and headings",
        specimen: "The application shell is organized into three panels.",
    },
    {
        token: "--font-mono",
        name: "IBM Plex Mono",
        weight: 400,
        use: "Labels, metadata, descriptors, buttons",
        specimen: "SAVED · VERSION 12 · 2 MIN AGO",
    },
    {
        token: "--font-serif",
        name: "IBM Plex Serif",
        weight: 400,
        use: "Editor body text only — never in chrome surfaces",
        specimen: "The room is quiet except for the hinge-click of the desk lamp.",
    },
];

const TRACKING_SCALE: TrackingEntry[] = [
    { token: "--tracking-wordmark", value: "-0.04em", use: "Condensed wordmark at hero size" },
    { token: "--tracking-display", value: "-0.03em", use: "Display headings" },
    { token: "--tracking-heading", value: "-0.02em", use: "H1 level" },
    { token: "--tracking-body", value: "0em", use: "Default body text" },
    { token: "--tracking-micro", value: "0.1em", use: "Small mono" },
    { token: "--tracking-label", value: "0.14em", use: "Mono labels" },
    { token: "--tracking-label-wide", value: "0.18em", use: "Mono descriptors" },
    { token: "--tracking-label-xl", value: "0.22em", use: "Mono hero descriptors" },
];

const LEADING_SCALE: LeadingEntry[] = [
    { token: "--leading-tight", value: "1.05", use: "Hero and display headings" },
    { token: "--leading-snug", value: "1.3", use: "H1, H2 headings" },
    { token: "--leading-normal", value: "1.6", use: "H3, UI body" },
    { token: "--leading-relaxed", value: "1.8", use: "Descriptions, small body" },
    { token: "--leading-editorial", value: "2", use: "Wide reading mode" },
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

function TypeScaleRow({ entry }: { entry: TypeScaleEntry }): JSX.Element {
    return (
        <div style={{ padding: "16px 0", borderBottom: "0.5px solid var(--color-gw-rule)" }}>
            <div
                style={{
                    fontFamily: entry.fontFamily,
                    fontSize: `var(${entry.token})`,
                    fontWeight: entry.weight,
                    letterSpacing: entry.tracking,
                    textTransform: entry.uppercase ? "uppercase" : "none",
                    color: "var(--color-gw-primary)",
                    lineHeight: 1.2,
                }}
            >
                {entry.specimen}
            </div>
            {entry.annotation !== null && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--color-gw-secondary)", margin: "6px 0 0" }}>
                    {entry.annotation}
                </p>
            )}
            <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center" }}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-secondary)" }}>
                    {entry.token}
                </code>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-gw-dim)", letterSpacing: "0.1em" }}>
                    {entry.sizePx}
                </span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--color-gw-secondary)" }}>
                    {entry.use}
                </span>
            </div>
        </div>
    );
}

function FontFamilyRow({ entry }: { entry: FontFamilyEntry }): JSX.Element {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 260px",
                gap: 24,
                alignItems: "start",
                padding: "16px 0",
                borderBottom: "0.5px solid var(--color-gw-rule)",
            }}
        >
            <div style={{ fontFamily: `var(${entry.token})`, fontSize: 18, fontWeight: entry.weight, color: "var(--color-gw-primary)", lineHeight: 1.4 }}>
                {entry.specimen}
            </div>
            <div>
                <code style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-secondary)", marginBottom: 4 }}>
                    {entry.token}
                </code>
                <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "var(--color-gw-secondary)", marginBottom: 4 }}>
                    {entry.name}
                </span>
                <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--color-gw-secondary)", lineHeight: 1.4 }}>
                    {entry.use}
                </span>
            </div>
        </div>
    );
}

function TrackingRow({ entry }: { entry: TrackingEntry }): JSX.Element {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "220px 1fr",
                gap: 24,
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "0.5px solid var(--color-gw-rule)",
            }}
        >
            <div>
                <code style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-secondary)" }}>
                    {entry.token}
                </code>
                <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-dim)" }}>{entry.value}</code>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--color-gw-dim)" }}>· {entry.use}</span>
                </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: entry.value, color: "var(--color-gw-primary)", textTransform: "uppercase" }}>
                The Quick Brown Fox
            </div>
        </div>
    );
}

function LeadingRow({ entry }: { entry: LeadingEntry }): JSX.Element {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "220px 1fr",
                gap: 24,
                alignItems: "start",
                padding: "10px 0",
                borderBottom: "0.5px solid var(--color-gw-rule)",
            }}
        >
            <div style={{ paddingTop: 2 }}>
                <code style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-secondary)" }}>
                    {entry.token}
                </code>
                <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                    <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-dim)" }}>{entry.value}</code>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--color-gw-dim)" }}>· {entry.use}</span>
                </div>
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, lineHeight: entry.value, color: "var(--color-gw-primary)" }}>
                The application shell is organized into three panels: a resource tree, an editing surface, and a metadata sidebar.
            </div>
        </div>
    );
}

function TypographyShowcase(): JSX.Element {
    return (
        <div style={{ maxWidth: 960 }}>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader
                    title="Type Scale"
                    description="Each size token is paired with its intended font family, weight, and tracking from getwrite-theme.css."
                />
                {TYPE_SCALE.map((entry) => (
                    <TypeScaleRow key={entry.token} entry={entry} />
                ))}
            </section>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader
                    title="Font Families"
                    description="Four IBM Plex families. Serif is restricted to the editor surface. Mono is used for all label and metadata text."
                />
                {FONT_FAMILIES.map((entry) => (
                    <FontFamilyRow key={entry.token} entry={entry} />
                ))}
            </section>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader
                    title="Tracking Scale"
                    description="Letter-spacing tokens from saboteur-base.css. Negative values compress display text; positive values open up mono labels."
                />
                {TRACKING_SCALE.map((entry) => (
                    <TrackingRow key={entry.token} entry={entry} />
                ))}
            </section>
            <section style={{ marginBottom: 48 }}>
                <SectionHeader
                    title="Leading Scale"
                    description="Line-height tokens from saboteur-base.css. Editor body requires a minimum of 1.8 (--leading-relaxed)."
                />
                {LEADING_SCALE.map((entry) => (
                    <LeadingRow key={entry.token} entry={entry} />
                ))}
            </section>
        </div>
    );
}

const meta: Meta<typeof TypographyShowcase> = {
    title: "Foundations/Typography",
    component: TypographyShowcase,
};

export default meta;

type Story = StoryObj<typeof TypographyShowcase>;

export const Default: Story = {
    args: {},
};
