import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Card from "../../components/common/UI/Card/Card";

const meta: Meta<typeof Card> = {
  title: "Foundations/Card",
  component: Card,
  argTypes: {
    variant: { control: "select", options: ["chrome", "chrome2"] },
    padding: { control: "select", options: ["none", "sm", "md", "lg"] },
  },
};

export default meta;

type Story = StoryObj<typeof Card>;

export const Chrome: Story = {
  args: {
    variant: "chrome",
    padding: "md",
    children: "A card on the chrome surface",
  },
};

export const Chrome2: Story = {
  args: {
    variant: "chrome2",
    padding: "md",
    children: "A card on the chrome2 (nested) surface",
  },
};

export const PaddingSm: Story = {
  args: { variant: "chrome", padding: "sm", children: "Small padding (p-3)" },
};

export const PaddingLg: Story = {
  args: {
    variant: "chrome",
    padding: "lg",
    children: "Large padding (p-5) — preferences modal section style",
  },
};

export const NoPadding: Story = {
  args: {
    variant: "chrome",
    padding: "none",
    children: (
      <div className="px-4 py-3 text-sm text-gw-secondary">
        No padding — card manages its own internal layout
      </div>
    ),
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-6 bg-gw-bg min-h-screen">
      <p className="font-mono text-[9px] uppercase tracking-label text-gw-secondary mb-2">
        Chrome surface (default)
      </p>
      <Card variant="chrome" padding="md">
        <p className="text-sm text-gw-primary">
          Chrome card — primary panel surface
        </p>
        <p className="mt-1 text-xs text-gw-secondary">
          bg-gw-chrome with border
        </p>
      </Card>

      <p className="font-mono text-[9px] uppercase tracking-label text-gw-secondary mb-2 mt-4">
        Chrome2 surface (nested)
      </p>
      <Card variant="chrome2" padding="md">
        <p className="text-sm text-gw-primary">
          Chrome2 card — nested / stat surface
        </p>
        <p className="mt-1 text-xs text-gw-secondary">
          bg-gw-chrome2 with border
        </p>
      </Card>

      <p className="font-mono text-[9px] uppercase tracking-label text-gw-secondary mb-2 mt-4">
        Padding scale
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Card variant="chrome" padding="sm">
          <p className="text-xs text-gw-secondary">sm (p-3)</p>
        </Card>
        <Card variant="chrome" padding="md">
          <p className="text-xs text-gw-secondary">md (p-4)</p>
        </Card>
        <Card variant="chrome" padding="lg">
          <p className="text-xs text-gw-secondary">lg (p-5)</p>
        </Card>
      </div>

      <p className="font-mono text-[9px] uppercase tracking-label text-gw-secondary mb-2 mt-4">
        Polymorphic (as=article)
      </p>
      <Card
        as="article"
        variant="chrome"
        padding="md"
        aria-label="sample resource card"
      >
        <p className="text-sm font-medium text-gw-primary">Chapter One</p>
        <p className="mt-1 text-xs text-gw-secondary">
          text file · 2 450 words
        </p>
      </Card>
    </div>
  ),
  args: {},
};
