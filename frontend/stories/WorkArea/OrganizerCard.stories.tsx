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
  },
};

export const Compact: Story = {
  args: { resource: sample, showBody: false, onOpen: action("onOpen") },
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
      />
      <OrganizerCard
        resource={imageKindResource}
        onOpen={action("onOpen:image")}
      />
      <OrganizerCard
        resource={audioKindResource}
        onOpen={action("onOpen:audio")}
      />
      <OrganizerCard
        resource={folderKindResource}
        onOpen={action("onOpen:folder")}
      />
    </div>
  ),
};
