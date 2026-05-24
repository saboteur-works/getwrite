import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import Listbox from "../../components/common/UI/Listbox/Listbox";
import type { ListboxOption } from "../../components/common/UI/Listbox/Listbox";

const meta: Meta = { title: "Common/UI/Listbox" };

export default meta;
type Story = StoryObj;

const STUB_OPTIONS: ListboxOption[] = [
  { value: "chapter-1", label: "Chapter One" },
  { value: "chapter-2", label: "Chapter Two" },
  { value: "chapter-3", label: "Chapter Three" },
  { value: "chapter-4", label: "Chapter Four", meta: "Text" },
  { value: "notes", label: "Research Notes", meta: "Text" },
];

export const Default: Story = {
  render: () => {
    const [highlighted, setHighlighted] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    return (
      <div style={{ position: "relative", width: 320 }}>
        <input
          style={{
            width: "100%",
            padding: "6px 10px",
            border: "1px solid #ccc",
          }}
          placeholder="Type to filter..."
          readOnly
        />
        <Listbox
          options={STUB_OPTIONS}
          highlightedIndex={highlighted}
          onSelect={(v) => setSelected(v)}
          onHighlightChange={setHighlighted}
        />
        {selected ? (
          <p style={{ marginTop: 8, fontSize: 12 }}>Selected: {selected}</p>
        ) : null}
      </div>
    );
  },
};

export const Inline: Story = {
  render: () => {
    const [highlighted, setHighlighted] = useState(1);
    return (
      <div style={{ width: 320 }}>
        <Listbox
          options={STUB_OPTIONS}
          highlightedIndex={highlighted}
          onSelect={() => undefined}
          onHighlightChange={setHighlighted}
          anchored={false}
        />
      </div>
    );
  },
};
