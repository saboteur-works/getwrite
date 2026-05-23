import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import RenameResourceModal from "../../components/ResourceTree/RenameResourceModal";

const meta: Meta<typeof RenameResourceModal> = {
  title: "Tree/RenameResourceModal",
  component: RenameResourceModal,
};

export default meta;

type Story = StoryObj<typeof RenameResourceModal>;

export const Default: Story = {
  args: {
    isOpen: false,
    initialName: "My Chapter",
    onClose: () => console.log("close"),
    onConfirm: (newName: string) => console.log("rename", newName),
  },
};

export const Open: Story = {
  args: {
    isOpen: true,
    initialName: "My Chapter",
    onClose: () => console.log("close"),
    onConfirm: (newName: string) => console.log("rename", newName),
  },
};

export const Interactive: Story = {
  render: (args: React.ComponentProps<typeof RenameResourceModal>) => {
    const [open, setOpen] = React.useState(true);
    const [lastRename, setLastRename] = React.useState<string | null>(null);
    return (
      <div>
        <RenameResourceModal
          {...args}
          isOpen={open}
          onClose={() => setOpen(false)}
          onConfirm={(name: string) => {
            setLastRename(name);
            args.onConfirm?.(name);
          }}
        />
        <div data-testid="last-rename" aria-hidden style={{ display: "none" }}>
          {lastRename}
        </div>
        <div data-testid="is-open" aria-hidden style={{ display: "none" }}>
          {String(open)}
        </div>
      </div>
    );
  },
  args: {
    isOpen: true,
    initialName: "My Chapter",
    onClose: () => console.log("close"),
    onConfirm: (newName: string) => console.log("rename", newName),
  },
};
