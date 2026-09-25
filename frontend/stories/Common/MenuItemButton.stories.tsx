import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Copy, Trash2 } from "lucide-react";
import MenuItemButton from "../../components/common/MenuItemButton";

const meta: Meta<typeof MenuItemButton> = {
  title: "Common/MenuItemButton",
  component: MenuItemButton,
  // The component defaults to `role="menuitem"`, which requires a menu
  // ancestor. Every real call site provides one; only these stories rendered
  // it bare, so axe's `aria-required-parent` here was a story artifact rather
  // than a product defect. The decorator supplies the context the app does.
  decorators: [
    (Story: () => JSX.Element) => (
      <div role="menu" aria-label="Example menu">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MenuItemButton>;

export const Default: Story = {
  args: {
    icon: <Copy size={14} aria-hidden="true" />,
    label: "Duplicate",
    onClick: () => console.log("duplicate"),
  },
};

export const Danger: Story = {
  args: {
    icon: <Trash2 size={14} aria-hidden="true" />,
    label: "Delete",
    danger: true,
    onClick: () => console.log("delete"),
  },
};

export const Disabled: Story = {
  args: {
    icon: <Copy size={14} aria-hidden="true" />,
    label: "Disabled action",
    disabled: true,
    onClick: () => console.log("disabled"),
  },
};
