import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within, expect, waitFor } from "storybook/test";
import ImageViewer from "../../components/WorkArea/Media/ImageViewer";

/** Builds an inline SVG data URI so stories render without network access. */
function svgDataUri(
  width: number,
  height: number,
  label: string,
  from: string,
  to: string,
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="50%" fill="#ffffff" font-family="monospace" font-size="24"
      text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const LANDSCAPE = svgDataUri(640, 400, "640 × 400", "#3b5bdb", "#1098ad");
const PORTRAIT = svgDataUri(360, 640, "360 × 640", "#9c36b5", "#e8590c");

const meta: Meta<typeof ImageViewer> = {
  title: "WorkArea/Media/ImageViewer",
  component: ImageViewer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: 480 }} className="bg-gw-bg">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ImageViewer>;

export const Landscape: Story = {
  args: { src: LANDSCAPE, alt: "A landscape gradient sample image" },
};

export const Portrait: Story = {
  args: { src: PORTRAIT, alt: "A portrait gradient sample image" },
};

export const ZoomInteraction: Story = {
  args: { src: LANDSCAPE, alt: "A zoomable gradient sample image" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Starts at 100% with zoom-out disabled.
    expect(canvas.getByText("100%")).toBeInTheDocument();
    expect(canvas.getByLabelText("Zoom out")).toBeDisabled();

    await userEvent.click(canvas.getByLabelText("Zoom in"));
    expect(canvas.getByText("125%")).toBeInTheDocument();
    expect(canvas.getByLabelText("Zoom out")).toBeEnabled();

    // Reset returns to the fit view.
    await userEvent.click(canvas.getByLabelText("Reset zoom"));
    expect(canvas.getByText("100%")).toBeInTheDocument();
  },
};

export const ErrorState: Story = {
  args: {
    src: "/__nonexistent_image__.png",
    alt: "An image that fails to load",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("alert")).toBeInTheDocument());
    expect(canvas.getByText("Unable to load image.")).toBeInTheDocument();
  },
};
