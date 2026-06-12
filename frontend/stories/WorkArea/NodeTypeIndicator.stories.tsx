import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import NodeTypeIndicator from "../../components/WorkArea/NodeTypeIndicator";

const meta: Meta<typeof NodeTypeIndicator> = {
  title: "WorkArea/NodeTypeIndicator",
  component: NodeTypeIndicator,
};

export default meta;

type Story = StoryObj<typeof NodeTypeIndicator>;

/** Caret resting in a single node. */
export const Single: Story = { args: { types: ["Heading 2"] } };

/** Selection spanning a few node types — shown in full, no truncation. */
export const MultipleUntruncated: Story = {
  args: { types: ["Heading 2", "Body"] },
};

/**
 * A large selection spanning more node types than fit inline. The visible list
 * collapses to a `+N` summary; hover (or a screen reader) reveals the full set.
 */
export const MultipleTruncated: Story = {
  args: {
    types: ["Heading 1", "Body", "Bullet List", "Blockquote", "Code Block"],
  },
};

/** No resource open / no cursor — neutral placeholder. */
export const Empty: Story = { args: { types: [] } };
