import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import HelpPage from "../../components/help/HelpPage";
import { Dialog } from "../../components/common/UI/Dialog/Dialog";

const meta: Meta<typeof HelpPage> = {
  title: "Help/HelpPage",
  component: HelpPage,
  decorators: [
    (Story: React.ComponentType) => (
      <Dialog open onOpenChange={() => undefined}>
        <Story />
      </Dialog>
    ),
  ],
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj<typeof HelpPage>;

export const ModalMode: Story = {
  args: { renderInModal: true, onClose: () => console.log("close help") },
};

export const FullPageMode: Story = { args: { renderInModal: false } };
