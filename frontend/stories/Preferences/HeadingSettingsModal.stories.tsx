import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import HeadingSettingsModal from "../../components/preferences/HeadingSettingsModal";
import type { EditorHeadingMap } from "../../src/lib/editor-heading-settings";
import { Dialog } from "../../components/common/UI/Dialog/Dialog";

const initialHeadings: EditorHeadingMap = {
  h1: {
    fontSize: "32px",
    fontFamily: "IBM Plex Sans",
    fontWeight: "700",
    letterSpacing: "0.02em",
    color: "#111827",
  },
  h2: {
    fontSize: "28px",
    fontFamily: "IBM Plex Sans",
    fontWeight: "700",
    letterSpacing: "0.02em",
    color: "#1f2937",
  },
  h3: {
    fontSize: "24px",
    fontFamily: "IBM Plex Sans",
    fontWeight: "700",
    letterSpacing: "0.02em",
    color: "#374151",
  },
};

const meta: Meta<typeof HeadingSettingsModal> = {
  title: "Preferences/HeadingSettingsModal",
  component: HeadingSettingsModal,
  decorators: [
    (Story: React.ComponentType) => (
      <Dialog open onOpenChange={() => undefined}>
        <Story />
      </Dialog>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HeadingSettingsModal>;

export const Default: Story = {
  args: {
    initialHeadings,
    onClose: () => console.log("close heading settings"),
    onSave: async (headings: EditorHeadingMap) => {
      console.log("save headings", headings);
    },
  },
};
