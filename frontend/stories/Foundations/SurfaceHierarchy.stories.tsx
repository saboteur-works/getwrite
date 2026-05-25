import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

interface SurfaceLayer {
  label: string;
  token: string;
  colorToken: string;
  description: string;
}

const CORRECT_LAYERS: SurfaceLayer[] = [
  {
    label: "Background",
    token: "--color-gw-bg",
    colorToken: "var(--color-gw-bg)",
    description: "Application background — deepest level",
  },
  {
    label: "Chrome",
    token: "--color-gw-chrome",
    colorToken: "var(--color-gw-chrome)",
    description: "Panels, sidebars, title bar",
  },
  {
    label: "Chrome 2",
    token: "--color-gw-chrome2",
    colorToken: "var(--color-gw-chrome2)",
    description: "Cards, inputs, nested chrome",
  },
  {
    label: "Editor",
    token: "--color-gw-editor",
    colorToken: "var(--color-gw-editor)",
    description: "Writing surface — always warmer than chrome",
  },
];

function CorrectExample(): JSX.Element {
  return (
    <div
      style={{
        backgroundColor: "var(--color-gw-bg)",
        border: "0.5px solid var(--color-gw-border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        width: 320,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--color-gw-chrome)",
          borderBottom: "0.5px solid var(--color-gw-border)",
          padding: "0 12px",
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--color-gw-secondary)",
          }}
        >
          Title Bar
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--color-gw-dim)",
          }}
        >
          --color-gw-chrome
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr" }}>
        <div
          style={{
            backgroundColor: "var(--color-gw-chrome)",
            borderRight: "0.5px solid var(--color-gw-border)",
            padding: "10px 8px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "var(--color-gw-secondary)",
              margin: "0 0 8px",
            }}
          >
            Sidebar
          </p>
          <div
            style={{
              backgroundColor: "var(--color-gw-chrome2)",
              borderRadius: "var(--radius-sm)",
              padding: "4px 8px",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                color: "var(--color-gw-primary)",
              }}
            >
              Chapter 01
            </span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "var(--color-gw-dim)",
              letterSpacing: "0.06em",
            }}
          >
            chrome2
          </span>
        </div>
        <div
          style={{
            backgroundColor: "var(--color-gw-editor)",
            padding: "12px 10px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 12,
              lineHeight: 1.8,
              color: "var(--color-gw-ink)",
              margin: "0 0 6px",
            }}
          >
            The room is quiet...
          </p>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "var(--color-gw-secondary)",
              letterSpacing: "0.06em",
            }}
          >
            --color-gw-editor
          </span>
        </div>
      </div>
    </div>
  );
}

function IncorrectExample(): JSX.Element {
  return (
    <div
      style={{
        backgroundColor: "var(--color-gw-chrome)",
        border: "2px solid #d44040",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        width: 320,
        position: "relative",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--color-gw-chrome)",
          borderBottom: "0.5px solid var(--color-gw-border)",
          padding: "0 12px",
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--color-gw-secondary)",
          }}
        >
          Title Bar
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--color-gw-dim)",
          }}
        >
          --color-gw-chrome
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr" }}>
        <div
          style={{
            backgroundColor: "var(--color-gw-chrome)",
            borderRight: "0.5px solid var(--color-gw-border)",
            padding: "10px 8px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "var(--color-gw-secondary)",
              margin: "0 0 8px",
            }}
          >
            Sidebar
          </p>
          <div
            style={{
              backgroundColor: "var(--color-gw-chrome2)",
              borderRadius: "var(--radius-sm)",
              padding: "4px 8px",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                color: "var(--color-gw-primary)",
              }}
            >
              Chapter 01
            </span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "var(--color-gw-dim)",
              letterSpacing: "0.06em",
            }}
          >
            chrome2
          </span>
        </div>
        <div
          style={{
            backgroundColor: "var(--color-gw-chrome)",
            padding: "12px 10px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 12,
              lineHeight: 1.8,
              color: "var(--color-gw-primary)",
              margin: "0 0 6px",
            }}
          >
            The room is quiet...
          </p>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "#d44040",
              letterSpacing: "0.06em",
            }}
          >
            editor using --color-gw-chrome ✗
          </span>
        </div>
      </div>
    </div>
  );
}

function LayerTable(): JSX.Element {
  return (
    <div
      style={{
        borderTop: "0.5px solid var(--color-gw-border)",
        marginBottom: 32,
      }}
    >
      {CORRECT_LAYERS.map((layer) => (
        <div
          key={layer.token}
          style={{
            display: "grid",
            gridTemplateColumns: "16px 160px 1fr",
            gap: 16,
            alignItems: "center",
            padding: "10px 0",
            borderBottom: "0.5px solid var(--color-gw-rule)",
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: layer.colorToken,
              border: "0.5px solid var(--color-gw-border)",
              borderRadius: 3,
              flexShrink: 0,
            }}
          />
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--color-gw-secondary)",
            }}
          >
            {layer.token}
          </code>
          <div>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--color-gw-primary)",
                marginRight: 8,
              }}
            >
              {layer.label}
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                color: "var(--color-gw-secondary)",
              }}
            >
              {layer.description}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SurfaceHierarchyShowcase(): JSX.Element {
  return (
    <div style={{ maxWidth: 760 }}>
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
        Surface Hierarchy
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
        GetWrite uses a strict four-level surface hierarchy. The editor surface
        must always be visually warmer and spatially distinct from the
        surrounding chrome. Using a chrome surface token on the editor breaks
        the primary spatial signal that tells writers they are in a writing
        context.
      </p>

      <section style={{ marginBottom: 40 }}>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--color-gw-secondary)",
            margin: "0 0 12px",
          }}
        >
          Surface Levels
        </p>
        <LayerTable />
      </section>

      <section style={{ marginBottom: 40 }}>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--color-gw-secondary)",
            margin: "0 0 16px",
          }}
        >
          Correct vs. Incorrect Usage
        </p>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}
        >
          <div>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                color: "var(--color-gw-secondary)",
                margin: "0 0 10px",
              }}
            >
              ✓ Editor uses{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>
                --color-gw-editor
              </code>{" "}
              — warmer, distinct from chrome
            </p>
            <CorrectExample />
          </div>
          <div>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                color: "var(--color-gw-secondary)",
                margin: "0 0 10px",
              }}
            >
              ✗ Editor using{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>
                --color-gw-chrome
              </code>{" "}
              — indistinguishable surface
            </p>
            <IncorrectExample />
          </div>
        </div>
      </section>
    </div>
  );
}

const meta: Meta<typeof SurfaceHierarchyShowcase> = {
  title: "Foundations/Surface Hierarchy",
  component: SurfaceHierarchyShowcase,
};

export default meta;

type Story = StoryObj<typeof SurfaceHierarchyShowcase>;

export const Default: Story = { args: {} };
