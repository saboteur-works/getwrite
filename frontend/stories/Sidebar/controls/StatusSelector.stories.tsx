import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import StatusSelector from "../../../components/Sidebar/controls/StatusSelector";

const meta: Meta<typeof StatusSelector> = {
  title: "Sidebar/Controls/StatusSelector",
  component: StatusSelector,
};

export default meta;

type Story = StoryObj<typeof StatusSelector>;

export const Default: Story = {
  args: {
    value: "In review",
    options: ["Draft", "In review", "Published"],
    onChange: (value: string) => console.log("status", value),
  },
};

export const NoOptions: Story = {
  args: { onChange: (value: string) => console.log("status", value) },
};

export const NoValue: Story = {
  args: {
    value: "",
    options: ["Draft", "In review", "Published"],
    onChange: (value: string) => console.log("status", value),
  },
};

export const OffList: Story = {
  args: {
    value: "Archived",
    options: ["Draft", "In review", "Published"],
    onChange: (value: string) => console.log("status", value),
  },
};

export const EmptyList: Story = {
  args: {
    value: "",
    options: [],
    onChange: (value: string) => console.log("status", value),
  },
};

export const EmptyListOffList: Story = {
  args: {
    value: "Archived",
    options: [],
    onChange: (value: string) => console.log("status", value),
  },
};
