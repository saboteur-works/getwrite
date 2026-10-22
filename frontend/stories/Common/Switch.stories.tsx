import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Switch from "../../components/common/UI/Switch/Switch";

const meta: Meta<typeof Switch> = {
  title: "Foundations/Switch",
  component: Switch,
  parameters: { a11y: { test: "error" } },
  decorators: [
    (Story: () => JSX.Element) => (
      <div className="bg-gw-bg p-6 text-gw-primary">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Switch>;

/** A labelled switch the reader can click, as it sits in App Settings. */
function SettingRow({
  label,
  initial,
  disabled,
}: {
  label: string;
  initial: boolean;
  disabled?: boolean;
}): JSX.Element {
  const [isChecked, setIsChecked] = React.useState(initial);
  const id = React.useId();
  return (
    <div className="flex items-center gap-3">
      <Switch
        id={id}
        checked={isChecked}
        disabled={disabled}
        onChange={(e) => setIsChecked(e.target.checked)}
      />
      <label htmlFor={id} className="text-sm text-gw-primary">
        {label}
      </label>
    </div>
  );
}

/** Off, on and both disabled states. Tab moves focus; Space toggles. */
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <SettingRow label="Off" initial={false} />
      <SettingRow label="On" initial />
      <SettingRow label="Off, disabled" initial={false} disabled />
      <SettingRow label="On, disabled" initial disabled />
    </div>
  ),
};

/** Clicking and Space both toggle the switch. */
export const Toggling: Story = {
  render: () => (
    <SettingRow
      label="Keep GetWrite running after its window is closed"
      initial={false}
    />
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("switch", {
      name: "Keep GetWrite running after its window is closed",
    });
    await expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
    await userEvent.keyboard(" ");
    await expect(toggle).not.toBeChecked();
  },
};
