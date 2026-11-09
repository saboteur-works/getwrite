import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import CapturedSection from "../../components/Sidebar/CapturedSection";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";

const ISO = "2026-11-09T14:30:00.000Z";

function resource(extra: Partial<AnyResource>): AnyResource {
  return {
    ...createTextResource({ name: "Idea", plainText: "an idea" }),
    ...extra,
  } as AnyResource;
}

const meta: Meta<typeof CapturedSection> = {
  title: "Sidebar/CapturedSection",
  component: CapturedSection,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof CapturedSection>;

/** Time and an http(s) link: the link is an anchor. */
export const TimeAndLink: Story = {
  args: {
    resource: resource({
      capturedAt: ISO,
      capturedLink: "https://example.com/article",
    }),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("group", { name: "Captured" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "https://example.com/article" }),
    ).toBeInTheDocument();
  },
};

/** Time only: no link row. */
export const TimeOnly: Story = {
  args: { resource: resource({ capturedAt: ISO }) },
};

/** A non-http(s) link is plain text, never an anchor. */
export const NonHttpLinkAsText: Story = {
  args: {
    resource: resource({
      capturedAt: ISO,
      capturedLink: "javascript:alert(1)",
    }),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(within(canvasElement).queryByRole("link")).toBeNull();
  },
};

/** Neither key: nothing renders. */
export const Neither: Story = {
  args: { resource: resource({}) },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(canvasElement).toBeEmptyDOMElement();
  },
};
