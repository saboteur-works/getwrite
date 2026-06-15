import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import UpdateNoticeBanner from "../../components/Layout/UpdateNoticeBanner";

const meta: Meta<typeof UpdateNoticeBanner> = {
  title: "Layout/UpdateNoticeBanner",
  component: UpdateNoticeBanner,
  parameters: {
    docs: {
      description: {
        component:
          "Shown at the top of the app shell (desktop build only) when a newer " +
          "GetWrite release is available. Presentational: the container supplies " +
          "the version/URLs and handles dismiss/skip persistence.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof UpdateNoticeBanner>;

const baseArgs = {
  latestVersion: "0.3.0",
  releaseUrl:
    "https://github.com/saboteur-works/getwrite/releases/tag/getwrite-v0.3.0",
  downloadUrl: "https://example.com/GetWrite-0.3.0-arm64.dmg",
  onDismiss: () => console.log("dismiss"),
  onSkip: () => console.log("skip"),
};

export const Default: Story = { args: baseArgs };

export const LongVersion: Story = {
  args: { ...baseArgs, latestVersion: "1.10.0" },
};
