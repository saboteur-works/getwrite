import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { action } from "storybook/actions";
import OrganizerCard from "../../components/WorkArea/Views/OrganizerView/OrganizerCard";
import {
  createTextResource,
  createImageResource,
  createAudioResource,
  createFolderResource,
} from "../../src/lib/models/resource-factory";

const meta: Meta<typeof OrganizerCard> = {
  title: "WorkArea/OrganizerCard",
  component: OrganizerCard,
};

export default meta;
type Story = StoryObj<typeof OrganizerCard>;

const sample = createTextResource({ name: "Sample Card", plainText: "" });

export const Default: Story = {
  args: {
    resource: sample,
    showBody: true,
    body: "A short body preview, sourced from the project's configured card-body source (a metadata field or a text excerpt).",
    onOpen: action("onOpen"),
    onSelect: action("onSelect"),
  },
};

export const Compact: Story = {
  args: {
    resource: sample,
    showBody: false,
    onOpen: action("onOpen"),
    onSelect: action("onSelect"),
  },
};

// Demonstrates the selected-card highlight (FR-8): `isSelected` appends the
// shared `resource-tree-item--selected` highlight class to the card. Default
// and Compact above both omit `isSelected`, so they remain the unhighlighted
// comparison.
export const Selected: Story = {
  args: {
    resource: sample,
    showBody: true,
    body: "A short body preview, sourced from the project's configured card-body source (a metadata field or a text excerpt).",
    isSelected: true,
    onOpen: action("onOpen"),
    onSelect: action("onSelect"),
  },
};

// Demonstrates the drag handle in its normal, enabled state (FR-1, FR-2,
// FR-5): a plausible `dragHandleAttributes`/`dragHandleListeners` pair (the
// shape `@dnd-kit/sortable`'s `useSortable()` returns) is passed through so
// the handle renders as a real, grabbable control rather than the inert
// default the other exports above leave it in by omitting these props.
export const DragHandleEnabled: Story = {
  args: {
    resource: sample,
    showBody: true,
    body: "A short body preview, sourced from the project's configured card-body source (a metadata field or a text excerpt).",
    dragHandleAttributes: {
      role: "button",
      "aria-roledescription": "sortable",
    },
    dragHandleListeners: { onPointerDown: action("onPointerDown") },
    onOpen: action("onOpen"),
    onSelect: action("onSelect"),
  },
};

// Demonstrates the drag handle disabled (FR-1, FR-2, FR-5): `isDragDisabled`
// renders the handle visibly disabled and out of tab order, with
// `dragDisabledReason` surfaced as both a `title` tooltip and a
// screen-reader-only hint wired via `aria-describedby`.
export const DragHandleDisabled: Story = {
  args: {
    resource: sample,
    showBody: true,
    body: "A short body preview, sourced from the project's configured card-body source (a metadata field or a text excerpt).",
    isDragDisabled: true,
    dragDisabledReason: "Reordering is disabled while a filter is active.",
    onOpen: action("onOpen"),
    onSelect: action("onSelect"),
  },
};

// One card per resource kind, so every per-type icon added alongside the
// clickable title (FR-1, FR-2, FR-3, FR-5) is visible from Storybook without
// manual interaction.
const textKindResource = createTextResource({
  name: "Chapter One",
  plainText: "It was a dark and stormy night.",
});
const imageKindResource = createImageResource({
  name: "Cover Art",
  file: "cover.png",
});
const audioKindResource = createAudioResource({
  name: "Narration Take 3",
  file: "take-3.mp3",
});
const folderKindResource = createFolderResource({ name: "Act One" });

export const AllResourceKinds: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <OrganizerCard
        resource={textKindResource}
        onOpen={action("onOpen:text")}
        onSelect={action("onSelect:text")}
      />
      <OrganizerCard
        resource={imageKindResource}
        onOpen={action("onOpen:image")}
        onSelect={action("onSelect:image")}
      />
      <OrganizerCard
        resource={audioKindResource}
        onOpen={action("onOpen:audio")}
        onSelect={action("onSelect:audio")}
      />
      <OrganizerCard
        resource={folderKindResource}
        onOpen={action("onOpen:folder")}
        onSelect={action("onSelect:folder")}
      />
    </div>
  ),
};
