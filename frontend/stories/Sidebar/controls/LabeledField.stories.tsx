import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import LabeledField from "../../../components/Sidebar/controls/LabeledField";

const meta: Meta<typeof LabeledField> = {
  title: "Sidebar/Controls/LabeledField",
  component: LabeledField,
};

export default meta;

type Story = StoryObj<typeof LabeledField>;

export const WithInput: Story = {
  args: {
    label: "Example Field",
    children: (
      <input
        // LabeledField names the GROUP, not one control inside it — see its
        // doc comment for why it cannot name the control directly. Every real
        // consumer labels its own control; this story now does the same
        // instead of rendering an unlabelled input.
        aria-label="Example Field"
        defaultValue="Example"
        className="w-full mt-2 p-2 border rounded text-sm"
      />
    ),
  },
};
