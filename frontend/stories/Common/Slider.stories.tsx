import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Slider from "../../components/common/UI/Slider/Slider";

const meta: Meta<typeof Slider> = {
  title: "Foundations/Slider",
  component: Slider,
  decorators: [
    (Story) => (
      <div style={{ width: 320 }} className="bg-gw-bg p-6">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  args: { defaultValue: [40], min: 0, max: 100, "aria-label": "Example" },
};

export const Range: Story = {
  args: { defaultValue: [25, 75], min: 0, max: 100, "aria-label": "Range" },
};

export const Disabled: Story = {
  args: {
    defaultValue: [50],
    min: 0,
    max: 100,
    disabled: true,
    "aria-label": "Disabled",
  },
};
