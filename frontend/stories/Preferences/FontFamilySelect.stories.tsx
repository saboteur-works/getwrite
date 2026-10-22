import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import FontFamilySelect from "../../components/preferences/FontFamilySelect";
import { FONT_FAMILY_LIST } from "../../src/lib/fonts/fonts";

interface HarnessProps {
  initial: string | undefined;
  allowOther?: boolean;
}

function Harness({ initial, allowOther }: HarnessProps): JSX.Element {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <div className="p-4">
      <FontFamilySelect
        aria-label="Body Font Family"
        value={value}
        onChange={setValue}
        allowOther={allowOther}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: "Preferences/FontFamilySelect",
  component: Harness,
};

export default meta;

type Story = StoryObj<typeof Harness>;

export const Default: Story = {
  args: { initial: "IBM Plex Serif", allowOther: true },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const select = within(canvasElement).getByRole("combobox", {
      name: "Body Font Family",
    });
    await expect(select).toHaveValue("IBM Plex Serif");
    await expect(select.querySelectorAll("option").length).toBeGreaterThan(
      FONT_FAMILY_LIST.length,
    );
  },
};

export const ValueSet: Story = { args: { initial: "Playfair Display" } };

export const NoValue: Story = { args: { initial: undefined } };

export const UnlistedValue: Story = {
  args: { initial: "Garamond", allowOther: true },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const select = within(canvasElement).getByRole("combobox", {
      name: "Body Font Family",
    }) as HTMLSelectElement;
    await expect(select.selectedOptions[0].textContent).toBe("Garamond");
  },
};

export const KeyboardFocus: Story = {
  args: { initial: "Lato" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const select = within(canvasElement).getByRole("combobox", {
      name: "Body Font Family",
    });
    select.focus();
    await expect(select).toHaveFocus();
    await expect(select.className).toContain("focus-visible:ring-1");
  },
};
