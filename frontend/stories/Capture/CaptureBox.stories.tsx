import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CaptureBox from "../../components/Capture/CaptureBox";

const meta: Meta<typeof CaptureBox> = {
  title: "Capture/CaptureBox",
  component: CaptureBox,
  args: {
    isOpen: true,
    text: "Check the lighthouse keeper's timeline against chapter 3.",
    onTextChange: () => undefined,
    onSubmit: () => undefined,
    onClose: () => undefined,
    projectChoice: (
      <label className="flex flex-col gap-1 text-sm text-gw-secondary">
        Project
        <select defaultValue="novel" className="border border-gw-border p-1">
          <option value="novel">The Lighthouse Novel</option>
          <option value="essays">Essays</option>
        </select>
      </label>
    ),
  },
};

export default meta;

type Story = StoryObj<typeof CaptureBox>;

/** Ready to capture: text entered, project chosen, no message. */
export const Idle: Story = {};

/** An empty box with the project choice. */
export const Empty: Story = { args: { text: "" } };

/** A request is in flight; the text is read-only and further submits are ignored. */
export const Submitting: Story = { args: { isSubmitting: true } };

/** No project can be chosen: capture is disabled and says a project is needed. */
export const ProjectNeeded: Story = {
  args: { isProjectNeeded: true, text: "", projectChoice: undefined },
};

/** The text was refused as empty. */
export const EmptyTextRefused: Story = {
  args: { text: "", issue: { kind: "emptyText" } },
};

/** The text is over the 50,000 character limit; the limit is named. */
export const TextTooLong: Story = {
  args: { issue: { kind: "textTooLong", limit: 50000 } },
};

/** The chosen project no longer exists. */
export const ProjectNotFound: Story = {
  args: { issue: { kind: "projectNotFound" } },
};

/** The project is locked and the unlock prompt was declined. */
export const LockedUnlockDeclined: Story = {
  args: { issue: { kind: "lockedDeclined" } },
};

/** The project is locked and unlocking is limited on this paired device. */
export const LockedUnlockLimited: Story = {
  args: { issue: { kind: "lockedLimited" } },
};

/** The project's Inbox is in Trash and awaits a choice. */
export const InboxInTrash: Story = {
  args: { issue: { kind: "inboxInTrash" } },
};

/** Captured, with a notice that the compile exclusion could not be saved. */
export const SeedingNotice: Story = {
  args: { issue: { kind: "seedingNotice" } },
};

/** Captured, with a notice that the writing log was not updated. */
export const WritingLogNotice: Story = {
  args: { issue: { kind: "writingLogNotice" } },
};

/** The request never reached the app. */
export const NetworkError: Story = { args: { issue: { kind: "network" } } };

/** The app answered with an error. */
export const ServerError: Story = { args: { issue: { kind: "server" } } };

/** A paired device was refused. */
export const PairedDeviceRefused: Story = {
  args: { issue: { kind: "pairedRefused" } },
};

/** After a capture: the box is closed and the confirmation is announced in a status region. */
export const Confirmed: Story = {
  args: { isOpen: false, confirmation: "Captured to The Lighthouse Novel" },
  render: (args: React.ComponentProps<typeof CaptureBox>) => (
    <div>
      <p className="text-sm">Where the writer was before opening the box.</p>
      <CaptureBox {...args} />
    </div>
  ),
};
