import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import MarkClaimControl from "../../components/Editor/Citations/MarkClaimControl";

const PASSAGE = "Harbour lights at dusk.";
const STATEMENT = "The harbour lamp was lit before dusk.";

const meta: Meta<typeof MarkClaimControl> = {
  title: "Editor/MarkClaimControl",
  component: MarkClaimControl,
  parameters: { a11y: { test: "error" } },
  args: { selectionText: PASSAGE, onMarkClaim: async () => undefined },
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MarkClaimControl>;

/** A passage is selected and no statement is written yet. No Source list is needed, so this is also the Sources-off view. */
export const Idle: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Mark as claim" }),
    ).toHaveAttribute("aria-disabled", "false");
    await expect(canvas.getByText(PASSAGE)).toBeVisible();
  },
};

/** Nothing is selected: the button is unavailable and the reason is shown as text. */
export const EmptySelection: Story = {
  args: { selectionText: "" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Mark as claim" }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      canvas.getByText("Select the passage you want to mark as a claim."),
    ).toBeVisible();
  },
};

/** The write has not finished: the status says so and a second activation is ignored. */
export const Working: Story = {
  args: { onMarkClaim: () => new Promise<void>(() => undefined) },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Claim statement"), STATEMENT);
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark as claim" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Saving the claim.",
    );
  },
};

/** The write was refused: the reason is shown and the statement is kept. */
export const Failed: Story = {
  args: {
    onMarkClaim: async () => {
      throw new Error("The project is locked.");
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Claim statement"), STATEMENT);
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark as claim" }),
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "The claim could not be saved. The project is locked.",
    );
    await expect(canvas.getByLabelText("Claim statement")).toHaveValue(
      STATEMENT,
    );
  },
};

/** The claim was stored: the status confirms it and the statement is cleared. */
export const Succeeded: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Claim statement"), STATEMENT);
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark as claim" }),
    );
    await expect(await canvas.findByText("Marked as a claim.")).toBeVisible();
    await expect(canvas.getByLabelText("Claim statement")).toHaveValue("");
  },
};
