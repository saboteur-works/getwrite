import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import StoredDocumentView, {
  type StoredDocumentViewProps,
} from "../../components/Folklore/StoredDocumentView";

const text = (value: string, marks?: { type: string }[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

const STRUCTURED = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [text("The Three Sisters")],
    },
    {
      type: "paragraph",
      content: [
        text("Once there was a "),
        text("river", [{ type: "bold" }]),
        text(" and a "),
        text("mill", [{ type: "italic" }]),
        text("."),
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [text("The eldest")] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [text("The youngest")] }],
        },
      ],
    },
  ],
};

const MARKUP = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [text('<script>alert("x")</script> <b>not bold</b>')],
    },
  ],
};

const UNSUPPORTED = {
  type: "doc",
  content: [
    { type: "paragraph", content: [text("Text before.")] },
    { type: "gadget" },
    { type: "paragraph", content: [text("Text after.")] },
  ],
};

const meta: Meta<typeof StoredDocumentView> = {
  title: "Folklore/StoredDocumentView",
  component: StoredDocumentView,
  parameters: { a11y: { test: "error" } },
  render: (args: StoredDocumentViewProps) => (
    <div style={{ width: 360 }}>
      <StoredDocumentView {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof StoredDocumentView>;

/** Headings, paragraphs, emphasis and lists keep their structure. */
export const Structured: Story = {
  args: { document: STRUCTURED },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByRole("heading", { name: "The Three Sisters" }),
    ).toBeVisible();
    expect(canvas.getAllByRole("listitem")).toHaveLength(2);
  },
};

/** Markup in the text shows as text. */
export const MarkupAsText: Story = {
  args: { document: MARKUP },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    expect(canvasElement.querySelector("script")).toBeNull();
    expect(canvasElement.textContent).toContain("<b>not bold</b>");
  },
};

/** An unsupported node is a visible placeholder, not dropped. */
export const UnsupportedNode: Story = {
  args: { document: UNSUPPORTED },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/gadget/)).toBeVisible();
  },
};

/** A value that is not a document is a placeholder, not an empty column. */
export const MalformedDocument: Story = {
  args: { document: "not a document" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("note")).toBeVisible();
  },
};
