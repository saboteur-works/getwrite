import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import UnsavedChangesPrompt from "../../components/project-types/UnsavedChangesPrompt";

const meta: Meta<typeof UnsavedChangesPrompt> = {
  title: "ProjectTypes/UnsavedChangesPrompt",
  component: UnsavedChangesPrompt,
  args: {
    isOpen: true,
    itemNames: ["My Novel"],
    isSaving: false,
    returnFocusTo: null,
    onSave: fn(),
    onDiscard: fn(),
    onKeepEditing: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof UnsavedChangesPrompt>;

export const Open: Story = {
  play: async ({
    args,
  }: {
    args: React.ComponentProps<typeof UnsavedChangesPrompt>;
  }) => {
    const dialog = within(document.body).getByRole("dialog", {
      name: "Unsaved changes",
    });
    await expect(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

export const SeveralItems: Story = {
  args: { itemNames: ["My Novel", "Poems", "Untitled"] },
};

export const Saving: Story = {
  args: { isSaving: true },
  play: async () => {
    const dialog = within(document.body).getByRole("dialog");
    await expect(
      within(dialog).getByRole("button", { name: "Saving\u2026" }),
    ).toBeDisabled();
  },
};

export const EscapeKeepsEditing: Story = {
  play: async ({
    args,
  }: {
    args: React.ComponentProps<typeof UnsavedChangesPrompt>;
  }) => {
    await userEvent.keyboard("{Escape}");
    await expect(args.onKeepEditing).toHaveBeenCalled();
  },
};
