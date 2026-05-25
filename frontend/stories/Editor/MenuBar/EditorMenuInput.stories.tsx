import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EditorMenuInput from "../../../components/Editor/MenuBar/EditorMenuInput";
import { action } from "storybook/actions";

const meta = {
  title: "Editor/MenuBar/EditorMenuInput",
  component: EditorMenuInput,
} satisfies Meta<typeof EditorMenuInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ColorPicker: Story = {
  render: () => (
    <div className="p-4 bg-gw-chrome flex items-center gap-2">
      <EditorMenuInput
        Icon="fontColor"
        type="color"
        initialValue="#374151"
        tooltipContent="Text color"
        onChange={action("color-changed")}
      />
    </div>
  ),
};

export const RangeSlider: Story = {
  render: () => (
    <div className="p-4 bg-gw-chrome flex items-center gap-2">
      <EditorMenuInput
        Icon="lineHeight"
        type="range"
        initialValue="50"
        minValue={0}
        maxValue={100}
        tooltipContent="Line height"
        onChange={action("range-changed")}
      />
    </div>
  ),
};

export const NumberInput: Story = {
  render: () => (
    <div className="p-4 bg-gw-chrome flex items-center gap-2">
      <EditorMenuInput
        Icon="fontSize"
        type="number"
        initialValue="16"
        minValue={8}
        maxValue={72}
        tooltipContent="Font size (px)"
        onChange={action("number-changed")}
      />
    </div>
  ),
};

export const SelectDropdown: Story = {
  render: () => (
    <div className="p-4 bg-gw-chrome flex items-center gap-2">
      <EditorMenuInput
        Icon="fontStyle"
        type="select"
        initialValue="IBM Plex Serif"
        options={[
          "IBM Plex Serif",
          "IBM Plex Sans",
          "IBM Plex Mono",
          "Georgia",
          "Times New Roman",
        ]}
        tooltipContent="Font family"
        onChange={action("font-changed")}
      />
    </div>
  ),
};

export const AllTypes: Story = {
  render: () => (
    <div className="p-4 bg-gw-chrome flex items-center gap-4 flex-wrap">
      <EditorMenuInput
        Icon="fontColor"
        type="color"
        initialValue="#374151"
        tooltipContent="Text color"
        onChange={action("color-changed")}
      />
      <EditorMenuInput
        Icon="lineHeight"
        type="range"
        initialValue="50"
        tooltipContent="Line height"
        onChange={action("range-changed")}
      />
      <EditorMenuInput
        Icon="fontSize"
        type="number"
        initialValue="16"
        tooltipContent="Font size"
        onChange={action("number-changed")}
      />
      <EditorMenuInput
        Icon="fontStyle"
        type="select"
        initialValue="IBM Plex Serif"
        options={["IBM Plex Serif", "IBM Plex Sans", "IBM Plex Mono"]}
        tooltipContent="Font family"
        onChange={action("font-changed")}
      />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="p-4 bg-gw-chrome flex items-center gap-4">
      <EditorMenuInput
        Icon="fontColor"
        type="color"
        initialValue="#374151"
        disabled={true}
        tooltipContent="Text color (disabled)"
        onChange={action("color-changed")}
      />
      <EditorMenuInput
        Icon="fontSize"
        type="number"
        initialValue="16"
        disabled={true}
        tooltipContent="Font size (disabled)"
        onChange={action("number-changed")}
      />
    </div>
  ),
};
