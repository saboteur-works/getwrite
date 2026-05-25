import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import WordCountProgressBar from "../../components/WorkArea/WordCountProgressBar";

const meta: Meta<typeof WordCountProgressBar> = {
  title: "WorkArea/WordCountProgressBar",
  component: WordCountProgressBar,
};

export default meta;

type Story = StoryObj<typeof WordCountProgressBar>;

export const Empty: Story = { args: { current: 0, goal: 80000 } };

export const InProgress: Story = { args: { current: 18500, goal: 80000 } };

export const Achieved: Story = { args: { current: 80000, goal: 80000 } };

export const Exceeded: Story = { args: { current: 95000, goal: 80000 } };
