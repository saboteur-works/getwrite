import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceRefInput from "../../../components/Sidebar/controls/ResourceRefInput";
import type { ResourceRef } from "../../../src/lib/models/types";

const meta: Meta<typeof ResourceRefInput> = {
  title: "Sidebar/Controls/ResourceRefInput",
  component: ResourceRefInput,
};

export default meta;

type Story = StoryObj<typeof ResourceRefInput>;

const RESOURCE_OPTIONS = [
  { id: "uuid-alice", name: "Alice" },
  { id: "uuid-bob", name: "Bob" },
  { id: "uuid-charlie", name: "Charlie" },
  { id: "uuid-diana", name: "Diana" },
];

export const SingleRefSelected: Story = {
  args: {
    label: "Character",
    resourceOptions: RESOURCE_OPTIONS,
    value: { id: "uuid-alice", name: "Alice" },
    onChange: (value: ResourceRef | ResourceRef[]) =>
      console.log("character", value),
    multiple: false,
  },
};

export const SingleRefUnmatched: Story = {
  args: {
    label: "Character",
    resourceOptions: RESOURCE_OPTIONS,
    value: { id: null, name: "Unknown Character" },
    onChange: (value: ResourceRef | ResourceRef[]) =>
      console.log("character", value),
    multiple: false,
  },
};

export const SingleRefEmpty: Story = {
  args: {
    label: "Character",
    resourceOptions: RESOURCE_OPTIONS,
    value: undefined,
    onChange: (value: ResourceRef | ResourceRef[]) =>
      console.log("character", value),
    multiple: false,
  },
};

export const MultipleRefsSelected: Story = {
  args: {
    label: "Characters",
    resourceOptions: RESOURCE_OPTIONS,
    value: [
      { id: "uuid-alice", name: "Alice" },
      { id: "uuid-bob", name: "Bob" },
    ],
    onChange: (value: ResourceRef | ResourceRef[]) =>
      console.log("characters", value),
    multiple: true,
  },
};

export const MultipleRefsEmpty: Story = {
  args: {
    label: "Characters",
    resourceOptions: RESOURCE_OPTIONS,
    value: [],
    onChange: (value: ResourceRef | ResourceRef[]) =>
      console.log("characters", value),
    multiple: true,
  },
};
