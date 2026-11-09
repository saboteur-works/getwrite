import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ShareSheet from "../../components/Capture/ShareSheet";
import type { ShareItem } from "../../src/lib/api/share-capture-types";

const ITEMS: ShareItem[] = [
  {
    kind: "text",
    text: "Check the lighthouse keeper's timeline against chapter 3.",
  },
  { kind: "text", text: "https://example.com/lighthouse-history" },
  {
    kind: "image",
    uri: "content://media/external/images/1",
    name: "cliff.jpg",
    mimeType: "image/jpeg",
  },
];

const meta: Meta<typeof ShareSheet> = {
  title: "Capture/ShareSheet",
  component: ShareSheet,
  parameters: { a11y: { test: "error" } },
  args: {
    isOpen: true,
    phase: "picking",
    items: ITEMS,
    status: "ready",
    options: [
      { kind: "named", id: "novel-dir", label: "The Lighthouse Novel" },
      { kind: "named", id: "essays-dir", label: "Essays" },
    ],
    defaultProjectId: "novel-dir",
    errorMessage: null,
    onRetry: () => undefined,
    onConfirm: () => undefined,
    onCancel: () => undefined,
    onDone: () => undefined,
  },
};

export default meta;

type Story = StoryObj<typeof ShareSheet>;

/** Choosing a project for a share of text, a link and an image. */
export const Picking: Story = {};

/** A second share is waiting behind this one. */
export const PickingWithQueue: Story = { args: { queuedCount: 2 } };

/** The capture is running; confirm is disabled and cancel is still offered. */
export const Pending: Story = { args: { phase: "pending" } };

/** One image was refused and one item failed; the others became resources. */
export const PartialFailure: Story = {
  args: {
    phase: "result",
    result: {
      shareId: "s1",
      capturedCount: 1,
      items: [
        { status: "captured", index: 0, kind: "text", resourceId: "r1" },
        {
          status: "failed",
          index: 1,
          kind: "text",
          message: "The note could not be saved. Try again.",
        },
        {
          status: "refused",
          index: 2,
          kind: "image",
          message: "cliff.jpg is 40.0 MB, which is over the 30 MB limit.",
        },
      ],
    },
  },
};

/** Every item became a resource. */
export const AllSuccess: Story = {
  args: {
    phase: "result",
    result: {
      shareId: "s2",
      capturedCount: 3,
      items: [
        { status: "captured", index: 0, kind: "text", resourceId: "r1" },
        { status: "captured", index: 1, kind: "text", resourceId: "r2" },
        { status: "captured", index: 2, kind: "image", resourceId: "r3" },
      ],
    },
  },
};

/** No project exists; capture is disabled and says a project is needed. */
export const Empty: Story = {
  args: { status: "empty", options: [], defaultProjectId: null },
};

/** The project list could not be read; Retry is offered. */
export const Failed: Story = {
  args: {
    status: "failed",
    options: [],
    defaultProjectId: null,
    errorMessage:
      "Could not load your projects. Check your connection and try again.",
  },
};

/** The project list is loading. */
export const Loading: Story = {
  args: { status: "loading", options: [], defaultProjectId: null },
};
