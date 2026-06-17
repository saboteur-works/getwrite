import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { action } from "storybook/actions";
import MarkdownSwitchWarningModal from "../../components/Editor/MarkdownSwitchWarningModal";
import type { MarkdownConstructWarning } from "../../src/lib/export/types";

const meta = {
  title: "Editor/MarkdownSwitchWarningModal",
  component: MarkdownSwitchWarningModal,
  parameters: {
    docs: {
      description: {
        component:
          "Confirmation shown before switching a resource from rich-text to " +
          'raw Markdown ("Edit as Markdown"). The conversion is one-way for ' +
          "formatting GitHub-Flavored Markdown cannot represent, so the modal " +
          "warns about the impact and — when the live document contains such " +
          "constructs — lists each one before the user confirms or cancels.",
      },
    },
  },
} satisfies Meta<typeof MarkdownSwitchWarningModal>;

export default meta;

type Story = StoryObj<typeof meta>;

const LOSSY_WARNINGS: MarkdownConstructWarning[] = [
  {
    construct: "text-style",
    label: "Text colour & font styling",
    kind: "dropped",
    count: 4,
  },
  {
    construct: "paragraph-leading",
    label: "Paragraph line spacing",
    kind: "dropped",
    count: 2,
  },
  {
    construct: "image-link",
    label: "Image with GetWrite link",
    kind: "html-fallback",
    count: 1,
  },
];

/** Document with no unrepresentable formatting: only the general warning shows. */
export const NoLossyConstructs: Story = {
  args: {
    isOpen: true,
    warnings: [],
    onConfirm: action("confirm-switch"),
    onCancel: action("cancel-switch"),
  },
};

/** Document containing constructs that will be dropped or HTML-fallbacked. */
export const WithAffectedFormatting: Story = {
  args: {
    isOpen: true,
    warnings: LOSSY_WARNINGS,
    onConfirm: action("confirm-switch"),
    onCancel: action("cancel-switch"),
  },
};

/**
 * Interactive variant for end-to-end coverage: confirm/cancel/escape toggle
 * local state, exposed through hidden `is-open` / `last-action` probes (mirrors
 * the ConfirmDialog Interactive story the e2e suite drives).
 */
export const Interactive: Story = {
  args: {
    isOpen: true,
    warnings: LOSSY_WARNINGS,
    onConfirm: action("confirm-switch"),
    onCancel: action("cancel-switch"),
  },
  render: (args) => {
    const [isOpen, setIsOpen] = React.useState(true);
    const [lastAction, setLastAction] = React.useState<string | null>(null);
    return (
      <div>
        <MarkdownSwitchWarningModal
          {...args}
          isOpen={isOpen}
          onConfirm={() => {
            setLastAction("confirmed");
            setIsOpen(false);
            args.onConfirm();
          }}
          onCancel={() => {
            setLastAction("canceled");
            setIsOpen(false);
            args.onCancel();
          }}
        />
        <div data-testid="is-open" aria-hidden style={{ display: "none" }}>
          {String(isOpen)}
        </div>
        <div data-testid="last-action" aria-hidden style={{ display: "none" }}>
          {lastAction}
        </div>
      </div>
    );
  },
};
