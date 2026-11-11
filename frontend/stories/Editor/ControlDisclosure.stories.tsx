import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import ControlDisclosure from "../../components/Editor/Citations/ControlDisclosure";
import MarkClaimControl from "../../components/Editor/Citations/MarkClaimControl";

const meta: Meta<typeof ControlDisclosure> = {
  title: "Editor/ControlDisclosure",
  component: ControlDisclosure,
  parameters: { a11y: { test: "error" } },
  args: {
    label: "Mark as claim",
    renderForm: (done: (message: string) => void) => (
      <MarkClaimControl
        selectionText="Harbour lights at dusk."
        onMarkClaim={async () => undefined}
        onDone={done}
      />
    ),
  },
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ControlDisclosure>;

/** Collapsed at a phone width: one button, aria-expanded false, no form taking the screen. */
export const Collapsed: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Mark as claim" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByLabelText("Claim statement")).toBeNull();
  },
};

/** Expanded: aria-expanded true, the form is shown and focus is on its first field. */
export const Expanded: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Mark as claim" });
    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByLabelText("Claim statement")).toHaveFocus();
  },
};

/** After a success the form closes, focus returns to the button and the result stays as text. */
export const AfterSuccess: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Mark as claim" });
    await userEvent.click(button);
    await userEvent.type(
      canvas.getByLabelText("Claim statement"),
      "The lamp was lit before dusk.",
    );
    const form = within(canvas.getByRole("group", { name: "Mark a claim" }));
    await userEvent.click(form.getByRole("button", { name: "Mark as claim" }));
    await expect(await canvas.findByText("Marked as a claim.")).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toHaveFocus();
  },
};
