import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

interface TransitionToken {
  token: string;
  duration: string;
  easing: string;
  use: string;
}

const TRANSITION_TOKENS: TransitionToken[] = [
  {
    token: "--transition-fast",
    duration: "150ms",
    easing: "ease",
    use: "Color, border, opacity changes",
  },
  {
    token: "--transition-normal",
    duration: "200ms",
    easing: "ease",
    use: "Layout shifts, transforms",
  },
];

function TransitionDemo({
  token,
  duration,
  easing,
  use,
}: TransitionToken): JSX.Element {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      style={{
        padding: "20px 0",
        borderBottom: "0.5px solid var(--color-gw-rule)",
      }}
    >
      <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            width: 200,
            height: 48,
            backgroundColor: hovered
              ? "var(--color-gw-chrome2)"
              : "var(--color-gw-chrome)",
            border: hovered
              ? "0.5px solid var(--color-gw-border-md)"
              : "0.5px solid var(--color-gw-border)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            transition: `background-color var(${token}), border-color var(${token})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: hovered
                ? "var(--color-gw-primary)"
                : "var(--color-gw-secondary)",
              transition: `color var(${token})`,
            }}
          >
            Hover me
          </span>
        </div>
        <div>
          <code
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--color-gw-secondary)",
              marginBottom: 6,
            }}
          >
            {token}
          </code>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--color-gw-dim)",
              }}
            >
              {duration}
            </code>
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--color-gw-dim)",
              }}
            >
              {easing}
            </code>
          </div>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              color: "var(--color-gw-secondary)",
            }}
          >
            {use}
          </span>
        </div>
      </div>
    </div>
  );
}

function ReducedMotionDemo(): JSX.Element {
  const [enabled, setEnabled] = React.useState(false);

  return (
    <div
      style={{
        padding: "20px 0",
        borderBottom: "0.5px solid var(--color-gw-rule)",
      }}
    >
      <div
        className={enabled ? "gw-reduced-motion" : undefined}
        style={{ display: "flex", gap: 32, alignItems: "center" }}
      >
        <div
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "var(--color-gw-chrome2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "var(--color-gw-chrome)";
          }}
          style={{
            width: 200,
            height: 48,
            backgroundColor: "var(--color-gw-chrome)",
            border: "0.5px solid var(--color-gw-border)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            transition:
              "background-color var(--transition-normal), border-color var(--transition-normal)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--color-gw-secondary)",
            }}
          >
            Hover me
          </span>
        </div>
        <div>
          <code
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--color-gw-secondary)",
              marginBottom: 6,
            }}
          >
            .gw-reduced-motion
          </code>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              color: "var(--color-gw-secondary)",
            }}
          >
            Collapses all transitions to 0.01ms — effectively instant
          </span>
        </div>
      </div>
      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          onClick={() => setEnabled((v) => !v)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: enabled
              ? "var(--color-gw-primary)"
              : "var(--color-gw-secondary)",
            backgroundColor: enabled
              ? "var(--color-gw-chrome2)"
              : "transparent",
            border: "0.5px solid var(--color-gw-border)",
            borderRadius: "var(--radius-sm)",
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          {enabled ? "Reduced motion: ON" : "Reduced motion: OFF"}
        </button>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 11,
            color: "var(--color-gw-secondary)",
          }}
        >
          Toggle to compare
        </span>
      </div>
    </div>
  );
}

function MotionShowcase(): JSX.Element {
  return (
    <div style={{ maxWidth: 640 }}>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          color: "var(--color-gw-secondary)",
          margin: "0 0 4px",
        }}
      >
        Motion
      </p>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          color: "var(--color-gw-secondary)",
          margin: "0 0 16px",
          lineHeight: 1.5,
        }}
      >
        Transition tokens from saboteur-base.css. All motion in the app is
        functional — hover each box to observe the easing and duration.
      </p>
      <div
        style={{
          borderTop: "0.5px solid var(--color-gw-border)",
          marginBottom: 48,
        }}
      >
        {TRANSITION_TOKENS.map((t) => (
          <TransitionDemo key={t.token} {...t} />
        ))}
      </div>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          color: "var(--color-gw-secondary)",
          margin: "0 0 4px",
        }}
      >
        Reduced Motion
      </p>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          color: "var(--color-gw-secondary)",
          margin: "0 0 16px",
          lineHeight: 1.5,
        }}
      >
        The .gw-reduced-motion class collapses all animation and transition
        durations to 0.01ms. Applied by the user preferences system when reduced
        motion is enabled. Also respected via the prefers-reduced-motion media
        query.
      </p>
      <div style={{ borderTop: "0.5px solid var(--color-gw-border)" }}>
        <ReducedMotionDemo />
      </div>
    </div>
  );
}

const meta: Meta<typeof MotionShowcase> = {
  title: "Foundations/Motion",
  component: MotionShowcase,
};

export default meta;

type Story = StoryObj<typeof MotionShowcase>;

export const Default: Story = { args: {} };
