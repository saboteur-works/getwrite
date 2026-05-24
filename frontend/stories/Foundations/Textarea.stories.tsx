import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Textarea from "../../components/common/UI/Textarea/Textarea";

const meta: Meta<typeof Textarea> = {
  title: "Foundations/Textarea",
  component: Textarea,
  argTypes: { disabled: { control: "boolean" }, rows: { control: "number" } },
  decorators: [
    (Story: React.ComponentType) => (
      <div className="p-6 bg-gw-chrome min-h-screen flex flex-col gap-4 max-w-sm">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: { placeholder: "Write a synopsis…", "aria-label": "synopsis" },
};

export const WithValue: Story = {
  args: {
    defaultValue: "A story about courage and redemption.",
    "aria-label": "notes",
  },
};

export const Disabled: Story = {
  args: {
    placeholder: "Disabled textarea",
    disabled: true,
    "aria-label": "disabled",
  },
};

export const FullWidth: Story = {
  args: {
    placeholder: "Full-width textarea",
    className: "w-full",
    "aria-label": "full width",
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-3 w-full">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-label text-gw-secondary">
          Default
        </span>
        <Textarea placeholder="Write a synopsis…" aria-label="default" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-label text-gw-secondary">
          Disabled
        </span>
        <Textarea placeholder="Disabled" disabled aria-label="disabled" />
      </label>
    </div>
  ),
  args: {},
};
