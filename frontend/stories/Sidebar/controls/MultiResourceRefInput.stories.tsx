import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import MultiResourceRefInput from "../../../components/Sidebar/controls/MultiResourceRefInput";

const meta: Meta<typeof MultiResourceRefInput> = {
  title: "Sidebar/Controls/MultiResourceRefInput",
  component: MultiResourceRefInput,
};

export default meta;

type Story = StoryObj<typeof MultiResourceRefInput>;

const RESOURCE_OPTIONS = [
  { id: "uuid-alice", name: "Alice" },
  { id: "uuid-bob", name: "Bob" },
  { id: "uuid-charlie", name: "Charlie" },
  { id: "uuid-diana", name: "Diana" },
];

export const Empty: Story = {
  args: { label: "Characters", resourceOptions: RESOURCE_OPTIONS, value: [] },
};

export const WithChips: Story = {
  args: {
    label: "Characters",
    resourceOptions: RESOURCE_OPTIONS,
    value: [
      { id: "uuid-alice", name: "Alice" },
      { id: "uuid-bob", name: "Bob" },
      { id: null, name: "Deleted Character" },
    ],
  },
};

export const AutocompleteOpen: Story = {
  args: {
    label: "Characters",
    resourceOptions: RESOURCE_OPTIONS,
    value: [{ id: "uuid-alice", name: "Alice" }],
    defaultInputValue: "Al",
  },
};

export const MaxSelectionsReached: Story = {
  args: {
    label: "Characters",
    resourceOptions: RESOURCE_OPTIONS,
    value: [
      { id: "uuid-alice", name: "Alice" },
      { id: "uuid-bob", name: "Bob" },
    ],
    maxSelections: 2,
  },
};

export const Interactive: Story = {
  args: { label: "Characters", resourceOptions: RESOURCE_OPTIONS, value: [] },
  render: (args: React.ComponentProps<typeof MultiResourceRefInput>) => {
    const [value, setValue] = React.useState(args.value ?? []);
    return (
      <MultiResourceRefInput {...args} value={value} onChange={setValue} />
    );
  },
};
