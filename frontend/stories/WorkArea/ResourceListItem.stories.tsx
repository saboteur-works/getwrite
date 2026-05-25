import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceListItem, {
  type ResourceListItemProps,
} from "../../components/WorkArea/ResourceListItem";

const meta: Meta<typeof ResourceListItem> = {
  title: "WorkArea/ResourceListItem",
  component: ResourceListItem,
};

export default meta;

type Story = StoryObj<typeof ResourceListItem>;

const wrap = (args: ResourceListItemProps) => (
  <ul className="workarea-list">
    <ResourceListItem {...args} />
  </ul>
);

export const Default: Story = {
  render: wrap,
  args: {
    name: "Chapter One",
    type: "text",
    wordCount: 2400,
    lastEditedAt: new Date(Date.now() - 3600000).toISOString(),
  },
};

export const OlderFile: Story = {
  render: wrap,
  args: {
    name: "Chapter One",
    type: "text",
    wordCount: 2400,
    lastEditedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
};

export const NoTimestamp: Story = {
  render: wrap,
  args: {
    name: "Chapter One",
    type: "text",
    wordCount: 2400,
    lastEditedAt: undefined,
  },
};

export const HighWordCount: Story = {
  render: wrap,
  args: {
    name: "Full Manuscript",
    type: "text",
    wordCount: 45000,
    lastEditedAt: new Date(Date.now() - 300000).toISOString(),
  },
};
