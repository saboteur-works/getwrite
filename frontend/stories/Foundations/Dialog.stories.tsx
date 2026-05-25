import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "../../components/common/UI/Dialog/Dialog";
import Button from "../../components/common/UI/Button/Button";

const meta: Meta = { title: "Foundations/Dialog" };

export default meta;

function DialogDemo({
  title,
  description,
  children,
  maxWidth,
  topAlign,
  triggerLabel = "Open Dialog",
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  maxWidth?: string;
  topAlign?: boolean;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth={maxWidth} topAlign={topAlign}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const Default: StoryObj = {
  render: () => (
    <DialogDemo
      title="Delete resource"
      description="This action cannot be undone. The resource will be permanently removed from the project."
    >
      <p className="text-sm text-gw-secondary">
        Are you sure you want to proceed?
      </p>
    </DialogDemo>
  ),
};

export const Destructive: StoryObj = {
  render: () => (
    <DialogDemo
      title="Delete project"
      description="All resources, revisions, and metadata will be permanently deleted."
      triggerLabel="Delete project"
    />
  ),
};

export const ScrollableContent: StoryObj = {
  render: () => (
    <DialogDemo
      title="Long content dialog"
      description="This dialog has content that may require scrolling."
    >
      {Array.from({ length: 20 }, (_, i) => (
        <p key={i} className="text-sm text-gw-secondary mb-2">
          Paragraph {i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing
          elit.
        </p>
      ))}
    </DialogDemo>
  ),
};

export const TopAlign: StoryObj = {
  render: () => (
    <DialogDemo
      title="Command Palette"
      description="Opens at the top of the viewport — used for command palette pattern."
      topAlign
      maxWidth="max-w-[560px]"
      triggerLabel="Open palette"
    />
  ),
};

export const NarrowWidth: StoryObj = {
  render: () => (
    <DialogDemo
      title="Rename project"
      maxWidth="max-w-[480px]"
      triggerLabel="Rename"
    />
  ),
};
