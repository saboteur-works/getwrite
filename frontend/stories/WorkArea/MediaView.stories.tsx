import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { within, expect } from "storybook/test";
import MediaView from "../../components/WorkArea/Media/MediaView";
import projectsReducer from "../../src/store/projectsSlice";
import { createImageResource, createAudioResource } from "../../src/lib/models";
import type { StoredProject } from "../../src/store/projectsSlice";

/** Builds a minimal store exposing a project root path for the URL builder. */
function makeStore(rootPath: string | null) {
  return configureStore({
    reducer: { projects: projectsReducer },
    preloadedState: {
      projects: {
        selectedProjectId: rootPath ? "story-proj" : null,
        projects: rootPath
          ? {
              "story-proj": {
                id: "story-proj",
                name: "Story Project",
                rootPath,
              } as StoredProject,
            }
          : {},
      },
    },
  });
}

const meta: Meta<typeof MediaView> = {
  title: "WorkArea/Media/MediaView",
  component: MediaView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: 360 }} className="bg-gw-bg">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MediaView>;

export const ImageResourceView: Story = {
  render: () => (
    <Provider store={makeStore("/story")}>
      <MediaView
        resource={createImageResource({
          name: "Cover Photo",
          file: "original.png",
          width: 640,
          height: 400,
        })}
      />
    </Provider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Image branch renders the ImageViewer (its controls toolbar is present).
    expect(
      canvas.getByRole("toolbar", { name: "Image controls" }),
    ).toBeInTheDocument();
  },
};

export const AudioResourceView: Story = {
  render: () => (
    <Provider store={makeStore("/story")}>
      <MediaView
        resource={createAudioResource({
          name: "Intro Music",
          file: "original.mp3",
          durationSeconds: 203,
          format: "mp3",
        })}
      />
    </Provider>
  ),
};

export const NoProjectOpen: Story = {
  render: () => (
    <Provider store={makeStore(null)}>
      <MediaView
        resource={createImageResource({ name: "Orphan", file: "original.png" })}
      />
    </Provider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByText("Open a project to view this media."),
    ).toBeInTheDocument();
  },
};
