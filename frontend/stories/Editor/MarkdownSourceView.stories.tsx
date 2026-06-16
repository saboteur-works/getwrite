import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { action } from "storybook/actions";
import MarkdownSourceView from "../../components/Editor/MarkdownSourceView";

const meta = {
  title: "Editor/MarkdownSourceView",
  component: MarkdownSourceView,
  parameters: {
    docs: {
      description: {
        component:
          "Raw Markdown source editor shown when a text resource is toggled " +
          "from rich-text to source mode. TipTapEditor converts the document " +
          "to GFM at the toggle boundary and renders this controlled textarea.",
      },
    },
  },
} satisfies Meta<typeof MarkdownSourceView>;

export default meta;

type Story = StoryObj<typeof meta>;

const SAMPLE_MARKDOWN = `## Chapter One

The **opening** scene, with _emphasis_ and a [link](https://example.com).

- a first beat
- a second beat

> A line of dialogue.`;

export const Default: Story = {
  args: {
    value: SAMPLE_MARKDOWN,
    onChange: action("source-changed"),
    onExitToRichText: action("exit-to-rich-text"),
  },
  decorators: [
    (Story) => (
      <div style={{ height: 360, border: "1px solid var(--gw-border, #ccc)" }}>
        <Story />
      </div>
    ),
  ],
};

export const Empty: Story = {
  args: {
    value: "",
    onChange: action("source-changed"),
    onExitToRichText: action("exit-to-rich-text"),
  },
  decorators: [
    (Story) => (
      <div style={{ height: 360, border: "1px solid var(--gw-border, #ccc)" }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * Interactive variant: edits update local state so the textarea behaves like
 * it does inside the live editor (controlled by TipTapEditor in the app).
 */
export const Interactive: Story = {
  args: {
    value: SAMPLE_MARKDOWN,
    onChange: action("source-changed"),
    onExitToRichText: action("exit-to-rich-text"),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div style={{ height: 360, border: "1px solid var(--gw-border, #ccc)" }}>
        <MarkdownSourceView
          {...args}
          value={value}
          onChange={(next) => {
            setValue(next);
            args.onChange(next);
          }}
        />
      </div>
    );
  },
};
