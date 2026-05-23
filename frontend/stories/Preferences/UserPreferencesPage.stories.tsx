import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import UserPreferencesPage from "../../components/preferences/UserPreferencesPage";
import { Dialog } from "../../components/common/UI/Dialog/Dialog";

const meta: Meta<typeof UserPreferencesPage> = {
  title: "Preferences/UserPreferencesPage",
  component: UserPreferencesPage,
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

type Story = StoryObj<typeof UserPreferencesPage>;

export const ModalMode: Story = {
  args: { renderInModal: true, onClose: () => console.log("close") },
};

export const Interactive: Story = {
  render: (args: React.ComponentProps<typeof UserPreferencesPage>) => {
    const [isOpen, setIsOpen] = React.useState(true);
    return (
      <div>
        <UserPreferencesPage
          {...args}
          renderInModal={true}
          onClose={() => {
            setIsOpen(false);
            args.onClose?.();
          }}
        />
        <div data-testid="is-open" aria-hidden style={{ display: "none" }}>
          {String(isOpen)}
        </div>
      </div>
    );
  },
  args: { renderInModal: true, onClose: () => console.log("close") },
};
