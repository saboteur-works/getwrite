import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import ComparisonView, {
  type ComparisonVariant,
  type ComparisonViewProps,
} from "../../components/Folklore/ComparisonView";
import type { VariantTextsDeps } from "../../components/Folklore/useVariantTexts";

/**
 * The read-only side-by-side comparison (Feature 110). The variants are chosen
 * in the list, so this view takes the chosen ids as `selectedIds` and has no
 * chooser of its own; "Back to list" calls `onBack`. The reads are fakes
 * passed through `deps`, so no network is touched and the stories are not
 * evidence about the real route or a device. The phone message appears below
 * 768px: narrow the viewport to check it. The default column limit is 3
 * (`comparisonLimit.ts`); the story that shows a refusal passes 3 explicitly.
 */

const VARIANTS: ComparisonVariant[] = ["A", "B", "C", "D"].map(
  (letter, i): ComparisonVariant => ({
    id: `story-variant-${letter}`,
    name: `Version ${letter}`,
    fields: [
      {
        key: "teller",
        label: "Teller",
        kind: "detail",
        state: "set",
        text: `Teller ${i + 1}`,
      },
      { key: "place", label: "Place", kind: "detail", state: "not-set" },
    ],
  }),
);

function docOf(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

const DEPS: VariantTextsDeps = {
  readVariantText: async (_projectId, resourceId) => {
    if (resourceId.endsWith("C")) {
      return { kind: "unreadable", reason: "The revision file is missing." };
    }
    if (resourceId.endsWith("D")) return { kind: "none" };
    return {
      kind: "text",
      text: docOf(`Text of ${resourceId}. Once there was a river and a mill.`),
    };
  },
  listAttachments: async () => [],
};

const ids = (letters: string[]): string[] =>
  letters.map((l) => `story-variant-${l}`);

const BASE: ComparisonViewProps = {
  projectId: "story-project",
  variants: VARIANTS,
  selectedIds: ids(["A", "B"]),
  onBack: fn(),
  deps: DEPS,
};

const meta: Meta<typeof ComparisonView> = {
  title: "Folklore/ComparisonView",
  component: ComparisonView,
  parameters: { a11y: { test: "error" } },
  args: BASE,
  render: (args: ComparisonViewProps) => (
    <div style={{ width: 900 }}>
      <ComparisonView {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof ComparisonView>;

/** Nothing chosen: the heading, Back to list and a prompt, no columns. */
export const NothingChosen: Story = {
  args: { selectedIds: [] },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/Choose two or more variants/),
    ).toBeVisible();
  },
};

/** Two chosen variants open in two columns, each scrolling on its own. */
export const TwoColumns: Story = {
  play: async ({
    canvasElement,
    args,
  }: {
    canvasElement: HTMLElement;
    args: ComparisonViewProps;
  }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByRole("heading", { level: 3, name: "Version B" }),
    ).toBeVisible();
    expect(canvas.getAllByTestId("comparison-column-body")).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Back to list" }));
    expect(args.onBack).toHaveBeenCalled();
  },
};

/** Four chosen variants share the width; none is cut off. */
export const FourColumns: Story = {
  args: { selectedIds: ids(["A", "B", "C", "D"]) },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText("No text")).toBeVisible();
    expect(canvas.getAllByTestId("comparison-column-body")).toHaveLength(4);
  },
};

/** An unreadable variant and an empty one sit beside a readable one. */
export const MixedStates: Story = {
  args: { selectedIds: ids(["A", "C", "D"]) },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("alert")).toHaveTextContent("is missing");
    expect(canvas.getByText("No text")).toBeVisible();
  },
};

/** A limit of 3 passed in with four chosen: a message, no columns. */
export const OverTheLimit: Story = {
  args: { limit: 3, selectedIds: ids(["A", "B", "C", "D"]) },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("alert")).toHaveTextContent(
      "At most 3 variants",
    );
  },
};

/** A narrative with no variants. */
export const NoVariants: Story = {
  args: { variants: [], selectedIds: [] },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/Choose two or more variants/),
    ).toBeVisible();
  },
};

/**
 * Below 768px the fixed message replaces the columns and no read starts.
 * Narrow the viewport to 360px to see it; at wider widths this story shows
 * the ordinary view.
 */
export const PhoneMessage: Story = {};
