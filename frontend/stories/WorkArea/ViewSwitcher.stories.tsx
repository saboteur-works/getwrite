import React from "react";
import type { ViewName } from "../../src/lib/models/types";
import type { Meta, StoryObj } from "@storybook/react";
import ViewSwitcher, {
  ViewSwitcherProps,
} from "../../components/WorkArea/ViewSwitcher";

const meta: Meta<typeof ViewSwitcher> = {
  title: "WorkArea/ViewSwitcher",
  component: ViewSwitcher,
};

export default meta;
type Story = StoryObj<typeof ViewSwitcher>;

export const Default: Story = {
  args: {
    view: "edit",
    onChange: (v: ViewSwitcherProps) => console.log("view changed", v),
  },
};

export const MediaResource: Story = {
  args: {
    view: "edit",
    editLabel: "Media",
    disabledViews: ["diff", "organizer"],
    onChange: (v: ViewSwitcherProps) => console.log("view changed", v),
  },
};

/**
 * The Timeline tab disabled with its explanatory tooltip, rendered in a
 * phone-width frame. The reason string is long; the tooltip must wrap within
 * the viewport rather than overflow it (which previously let the page scroll
 * sideways into an unstyled void on mobile).
 */
export const DisabledTimeline: Story = {
  render: () => (
    <div style={{ width: 360, overflowX: "auto" }}>
      <ViewSwitcher
        view="edit"
        disabledViews={["timeline"]}
        disabledReasons={{
          timeline:
            "The Timeline view is off. Turn it on in User Preferences → Timeline view.",
        }}
        onChange={(v) => console.log("view changed", v)}
      />
    </div>
  ),
};

export const Interactive: Story = {
  render: () => {
    // `ViewName` rather than a hand-copied union: the local list was written
    // before `entityRoster`, `entityGraph` and `trash` existed, so this story
    // could not select the three newest tabs it renders.
    const [view, setView] = React.useState<ViewName>("edit");
    return (
      <div>
        <ViewSwitcher view={view} onChange={setView} />
        <div data-testid="active-view" aria-hidden style={{ display: "none" }}>
          {view}
        </div>
      </div>
    );
  },
};
