import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CollapsibleSection from "../../components/common/UI/CollapsibleSection/CollapsibleSection";

const meta: Meta<typeof CollapsibleSection> = {
  title: "Foundations/CollapsibleSection",
  component: CollapsibleSection,
  argTypes: {
    variant: { control: "select", options: ["workarea", "sidebar"] },
  },
};

export default meta;

type Story = StoryObj<typeof CollapsibleSection>;

export const WorkareaDefault: Story = {
  args: {
    title: "Resources",
    variant: "workarea",
    children: (
      <ul>
        <li className="py-1 text-sm text-gw-primary">Chapter One</li>
        <li className="py-1 text-sm text-gw-primary">Chapter Two</li>
        <li className="py-1 text-sm text-gw-primary">Chapter Three</li>
      </ul>
    ),
  },
};

export const WorkareaCollapsed: Story = {
  args: {
    title: "Writing Goal",
    variant: "workarea",
    defaultOpen: false,
    children: (
      <div className="text-sm text-gw-secondary">
        Progress bar would appear here.
      </div>
    ),
  },
};

export const WorkareaWithActions: Story = {
  args: {
    title: "Resources",
    variant: "workarea",
    actions: (
      <div className="flex gap-3">
        <button
          type="button"
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-gw-primary transition-colors duration-150"
        >
          Last Edited
        </button>
        <button
          type="button"
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-gw-secondary hover:text-gw-primary transition-colors duration-150"
        >
          Name
        </button>
      </div>
    ),
    children: (
      <ul>
        <li className="py-1 text-sm text-gw-primary">Chapter One</li>
        <li className="py-1 text-sm text-gw-primary">Chapter Two</li>
      </ul>
    ),
  },
};

export const SidebarDefault: Story = {
  args: {
    title: "Synopsis",
    variant: "sidebar",
    children: (
      <div className="text-sm text-gw-secondary mt-2">
        Synopsis textarea would appear here.
      </div>
    ),
  },
};

export const SidebarCollapsed: Story = {
  args: {
    title: "Tags",
    variant: "sidebar",
    defaultOpen: false,
    children: (
      <div className="text-sm text-gw-secondary mt-2">
        Tag chips would appear here.
      </div>
    ),
  },
};

export const SidebarMultiple: Story = {
  render: () => (
    <div className="w-64 p-4 border border-gw-border rounded">
      <CollapsibleSection title="Status & POV" variant="sidebar">
        <div className="text-sm text-gw-secondary mt-2">Status field here.</div>
      </CollapsibleSection>
      <CollapsibleSection title="Story Details" variant="sidebar">
        <div className="text-sm text-gw-secondary mt-2">
          Date and duration fields here.
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Tags" variant="sidebar">
        <div className="text-sm text-gw-secondary mt-2">Tag chips here.</div>
      </CollapsibleSection>
    </div>
  ),
};
