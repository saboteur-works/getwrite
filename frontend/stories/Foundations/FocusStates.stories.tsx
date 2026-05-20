import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const FOCUS_RING_STYLE: React.CSSProperties = {
    outline: "none",
    boxShadow: "0 0 0 3px var(--color-gw-focus-ring)",
};

const BASE_BUTTON: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: "var(--color-gw-primary)",
    backgroundColor: "var(--color-gw-chrome2)",
    border: "0.5px solid var(--color-gw-border)",
    borderRadius: "var(--radius-md)",
    padding: "6px 12px",
    cursor: "pointer",
    outline: "none",
    transition: "box-shadow var(--transition-fast)",
};

const BASE_INPUT: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    color: "var(--color-gw-primary)",
    backgroundColor: "var(--color-gw-chrome2)",
    border: "0.5px solid var(--color-gw-border)",
    borderRadius: "var(--radius-md)",
    padding: "6px 10px",
    outline: "none",
    transition: "box-shadow var(--transition-fast)",
    width: 200,
};

interface FocusDemoItem {
    label: string;
    description: string;
    element: JSX.Element;
}

function ButtonDemo(): JSX.Element {
    const [focused, setFocused] = React.useState(false);
    return (
        <button
            style={{ ...BASE_BUTTON, ...(focused ? FOCUS_RING_STYLE : {}) }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
        >
            Save Revision
        </button>
    );
}

function InputDemo(): JSX.Element {
    const [focused, setFocused] = React.useState(false);
    return (
        <input
            type="text"
            placeholder="Chapter title..."
            style={{ ...BASE_INPUT, ...(focused ? FOCUS_RING_STYLE : {}) }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
        />
    );
}

function LinkDemo(): JSX.Element {
    const [focused, setFocused] = React.useState(false);
    return (
        <a
            href="#"
            onClick={(e) => e.preventDefault()}
            style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                color: "var(--color-gw-primary)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                outline: "none",
                borderRadius: "var(--radius-sm)",
                padding: "1px 3px",
                transition: "box-shadow var(--transition-fast)",
                ...(focused ? FOCUS_RING_STYLE : {}),
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
        >
            Open project settings
        </a>
    );
}

const DEMOS: FocusDemoItem[] = [
    {
        label: "Button",
        description: "box-shadow: 0 0 0 3px var(--color-gw-focus-ring) on :focus-visible",
        element: <ButtonDemo />,
    },
    {
        label: "Input",
        description: "Same ring — outline is suppressed, box-shadow used throughout the system",
        element: <InputDemo />,
    },
    {
        label: "Inline link",
        description: "Ring with borderRadius: --radius-sm to follow the link text",
        element: <LinkDemo />,
    },
];

function FocusDemoRow({ label, description, element }: FocusDemoItem): JSX.Element {
    return (
        <div style={{ padding: "20px 0", borderBottom: "0.5px solid var(--color-gw-rule)", display: "grid", gridTemplateColumns: "1fr 280px", gap: 32, alignItems: "center" }}>
            <div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-gw-secondary)", margin: "0 0 6px" }}>
                    {label}
                </p>
                <p style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--color-gw-secondary)", margin: 0, lineHeight: 1.5 }}>
                    {description}
                </p>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
                {element}
            </div>
        </div>
    );
}

function FocusStatesShowcase(): JSX.Element {
    return (
        <div style={{ maxWidth: 760 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--color-gw-secondary)", margin: "0 0 4px" }}>
                Focus States
            </p>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-gw-secondary)", margin: "0 0 8px", lineHeight: 1.5 }}>
                All focusable elements use a consistent 3px red-tinted ring via <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>--color-gw-focus-ring</code> (rgba(212, 64, 64, 0.2)).
                Tab through the elements below to see the ring in context. The ring uses <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>box-shadow</code> — not <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>outline</code> — so it respects border-radius.
            </p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-gw-secondary)", margin: "0 0 16px", letterSpacing: "0.06em" }}>
                box-shadow: 0 0 0 3px var(--color-gw-focus-ring)
            </p>
            <div style={{ borderTop: "0.5px solid var(--color-gw-border)" }}>
                {DEMOS.map((d) => (
                    <FocusDemoRow key={d.label} {...d} />
                ))}
            </div>
        </div>
    );
}

const meta: Meta<typeof FocusStatesShowcase> = {
    title: "Foundations/Focus States",
    component: FocusStatesShowcase,
};

export default meta;

type Story = StoryObj<typeof FocusStatesShowcase>;

export const Default: Story = {
    args: {},
};
