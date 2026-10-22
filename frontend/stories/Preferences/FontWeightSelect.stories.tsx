import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import FontWeightSelect from "../../components/preferences/FontWeightSelect";

interface HarnessProps {
  family: string;
  initial: string | undefined;
}

function Harness({ family, initial }: HarnessProps): JSX.Element {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <div className="p-4">
      <FontWeightSelect
        aria-label="H2 Font Weight"
        family={family}
        value={value}
        onChange={setValue}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: "Preferences/FontWeightSelect",
  component: Harness,
};

export default meta;

type Story = StoryObj<typeof Harness>;

export const Default: Story = {
  args: { family: "Playwrite IE", initial: "300" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const select = within(canvasElement).getByRole("combobox", {
      name: "H2 Font Weight",
    });
    await expect(select).toHaveValue("300");
    await expect(select.querySelectorAll("option").length).toBe(5);
  },
};

export const ExtraEntry: Story = {
  args: { family: "Source Serif 4", initial: "700" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const select = within(canvasElement).getByRole("combobox", {
      name: "H2 Font Weight",
    });
    await expect(select).toHaveValue("700");
    await expect(
      within(select).getByRole("option", { name: "700 (current value)" }),
    ).toBeInTheDocument();
  },
};
