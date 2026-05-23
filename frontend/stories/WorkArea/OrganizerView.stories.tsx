import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import OrganizerView from "../../components/WorkArea/Views/OrganizerView/OrganizerView";

const meta: Meta<typeof OrganizerView> = {
  title: "WorkArea/OrganizerView",
  component: OrganizerView,
};

export default meta;
type Story = StoryObj<typeof OrganizerView>;

export const Default: Story = {
  render: () => (
    <div>
      <OrganizerView showBody={true} />
    </div>
  ),
};

export const Interactive: Story = {
  render: () => {
    const [show, setShow] = React.useState(true);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    return (
      <div>
        <OrganizerView showBody={show} onToggleBody={(s) => setShow(s)} />
        <div data-testid="show-body" aria-hidden style={{ display: "none" }}>
          {String(show)}
        </div>
        <div
          data-testid="selected-resource-id"
          aria-hidden
          style={{ display: "none" }}
        >
          {selectedId}
        </div>
      </div>
    );
  },
};
