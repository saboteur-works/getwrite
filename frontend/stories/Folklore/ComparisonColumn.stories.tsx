import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import ComparisonColumn, {
  type ComparisonColumnProps,
} from "../../components/Folklore/ComparisonColumn";
import type { VariantFieldDescription } from "../../src/lib/models/folklore-variant-fields";

const FIELDS: VariantFieldDescription[] = [
  {
    key: "teller",
    label: "Teller",
    kind: "detail",
    state: "set",
    text: "Anna Kovacs",
  },
  { key: "place", label: "Place", kind: "detail", state: "not-set" },
  {
    key: "motifs",
    label: "Motifs",
    kind: "tags",
    state: "set",
    tags: [
      { text: "river", isInList: true, mark: null },
      { text: "mill", isInList: false, mark: "not in the list" },
    ],
  },
];

const DOC = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Once there was a river and a mill, and three sisters who lived beside them.",
        },
      ],
    },
  ],
});

const BASE: ComparisonColumnProps = {
  projectId: "story-project",
  resourceId: "story-variant",
  name: "Version A",
  fields: FIELDS,
  content: { kind: "text", text: DOC },
  audio: { kind: "none" },
};

/** A short silent 8-bit mono WAV (800 samples at 8000 Hz). */
function wavBytes(): Uint8Array {
  const samples = 800;
  const out = new Uint8Array(44 + samples);
  const view = new DataView(out.buffer);
  const text = (at: number, value: string): void =>
    value.split("").forEach((c, i) => out.set([c.charCodeAt(0)], at + i));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  out.fill(128, 44);
  return out;
}

/** Replaces `fetch` for the byte route only; restored on unmount. */
function useBytesFetch(): void {
  const original = React.useRef<typeof fetch | null>(null);
  if (original.current === null) {
    original.current = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("/api/project/source-attachments/bytes")) {
        return new Response(new Blob([wavBytes() as BlobPart]), {
          status: 200,
          headers: {
            "Content-Type": "audio/wav",
            "x-attachment-kind": "audio",
          },
        });
      }
      return original.current!(input, init);
    };
  }
  React.useEffect(
    () => () => {
      if (original.current) globalThis.fetch = original.current;
    },
    [],
  );
}

function Harness(args: ComparisonColumnProps): React.ReactElement {
  useBytesFetch();
  return (
    <div style={{ width: 360 }}>
      <ComparisonColumn {...args} />
    </div>
  );
}

const meta: Meta<typeof ComparisonColumn> = {
  title: "Folklore/ComparisonColumn",
  component: ComparisonColumn,
  parameters: { a11y: { test: "error" } },
  args: BASE,
  render: (args: ComparisonColumnProps) => <Harness {...args} />,
};
export default meta;

type Story = StoryObj<typeof ComparisonColumn>;

/** Fields above the text; no audio player is mounted. */
export const WithText: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByRole("heading", { level: 3, name: "Version A" }),
    ).toBeVisible();
    expect(canvas.getByText("not set")).toBeVisible();
    expect(canvas.getByText(/not in the list/)).toBeVisible();
    expect(
      canvas.getByRole("region", { name: "Text of Version A" }),
    ).toHaveAttribute("tabindex", "0");
    expect(canvasElement.querySelector("audio")).toBeNull();
  },
};

/** An empty body with no audio: the "No text" line and the fields. */
export const NoText: Story = {
  args: { content: { kind: "none" } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText("No text")).toBeVisible();
    expect(canvas.getByText("Anna Kovacs")).toBeVisible();
  },
};

/** An empty body with audio: the player mounts only after Play. */
export const AudioOnly: Story = {
  args: {
    content: { kind: "none" },
    audio: {
      kind: "available",
      attachments: [{ id: "b2", name: "telling.wav" }],
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(canvasElement.querySelector("audio")).toBeNull();
    await userEvent.click(
      await canvas.findByRole("button", { name: "Play audio: telling.wav" }),
    );
    for (let i = 0; i < 50 && !canvasElement.querySelector("audio"); i += 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(canvasElement.querySelector("audio")).not.toBeNull();
  },
};

/** A failed attachment list read is a failure, not "no audio". */
export const AttachmentListFailed: Story = {
  args: {
    content: { kind: "none" },
    audio: { kind: "failed", reason: "The attachments could not be listed." },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("alert")).toHaveTextContent(
      "could not be listed",
    );
  },
};

/** An unreadable variant shows the reason, never an empty column. */
export const Unreadable: Story = {
  args: {
    content: {
      kind: "unreadable",
      reason: "This variant's canonical revision file is missing.",
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("alert")).toHaveTextContent("is missing");
  },
};
