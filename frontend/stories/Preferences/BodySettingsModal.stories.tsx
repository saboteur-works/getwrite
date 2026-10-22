import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import BodySettingsModal from "../../components/preferences/BodySettingsModal";
import type { EditorBodyConfig } from "../../src/lib/editor-body-settings";
import { Dialog } from "../../components/common/UI/Dialog/Dialog";

const meta = {
  title: "Preferences/BodySettingsModal",
  component: BodySettingsModal,
  decorators: [
    (Story: React.ComponentType) => (
      <Dialog open onOpenChange={() => undefined}>
        <Story />
      </Dialog>
    ),
  ],
} satisfies Meta<typeof BodySettingsModal>;

export default meta;

type Story = StoryObj<typeof meta>;

const fullConfig: EditorBodyConfig = {
  fontFamily: "IBM Plex Serif",
  fontSize: "18px",
  lineHeight: "1.8",
  paragraphSpacing: "1em",
};

export const Default: Story = {
  args: {
    onClose: () => console.log("close"),
    onSave: async (body: EditorBodyConfig) => {
      console.log("save", body);
    },
  },
};

export const WithValues: Story = {
  args: {
    initialBody: fullConfig,
    onClose: () => console.log("close"),
    onSave: async (body: EditorBodyConfig) => {
      console.log("save", body);
    },
  },
};

export const WithValidationError: Story = {
  render: () => {
    return (
      <BodySettingsModal
        initialBody={fullConfig}
        onClose={() => console.log("close")}
        onSave={async () => {
          throw new Error("Failed to save: project is read-only.");
        }}
      />
    );
  },
};

export const PartialValues: Story = {
  args: {
    initialBody: { fontFamily: "Georgia", fontSize: "16px" },
    onClose: () => console.log("close"),
    onSave: async (body: EditorBodyConfig) => {
      console.log("save", body);
    },
  },
};

export const LineHeightBelowFloor: Story = {
  args: {
    initialBody: { ...fullConfig, lineHeight: "1.7" },
    onClose: () => console.log("close"),
    onSave: async (body: EditorBodyConfig) => {
      console.log("save", body);
    },
  },
  play: async () => {
    // The dialog renders in a portal, so look in the whole document.
    const save = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Save Changes",
    );
    save?.click();
  },
};

export const StoredNonPxSize: Story = {
  args: {
    initialBody: { fontSize: "1.5rem", fontFamily: "Garamond" },
    onClose: () => console.log("close"),
    onSave: async (body: EditorBodyConfig) => {
      console.log("save", body);
    },
  },
};
