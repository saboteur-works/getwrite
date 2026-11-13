import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import ComparisonView, {
  type ComparisonVariant,
  type ComparisonViewProps,
} from "../../components/Folklore/ComparisonView";
import type { VariantTextsDeps } from "../../components/Folklore/useVariantTexts";

/**
 * The read-only side-by-side comparison (Feature 110). The reads are fakes
 * passed through `deps`, so no network is touched and the stories are not
 * evidence about the real route or a device. The phone message appears below
 * 768px: narrow the viewport to check it. No column limit is committed, so
 * the stories that show a refusal pass a limit of 3 explicitly.
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

const BASE: ComparisonViewProps = {
  projectId: "story-project",
  narrativeId: "story-narrative",
  variants: VARIANTS,
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

/** Nothing chosen: the chooser and a prompt, no columns. */
export const NothingChosen: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/Choose two or more variants/),
    ).toBeVisible();
  },
};

/** Two chosen variants open in two columns, each scrolling on its own. */
export const TwoColumns: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox", { name: "Version A" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Version B" }));
    expect(
      await canvas.findByRole("heading", { level: 3, name: "Version B" }),
    ).toBeVisible();
    expect(canvas.getAllByTestId("comparison-column-body")).toHaveLength(2);
  },
};

/** An unreadable variant and an empty one sit beside a readable one. */
export const MixedStates: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    for (const name of ["Version A", "Version C", "Version D"]) {
      await userEvent.click(canvas.getByRole("checkbox", { name }));
    }
    expect(await canvas.findByRole("alert")).toHaveTextContent("is missing");
    expect(canvas.getByText("No text")).toBeVisible();
  },
};

/** A limit of 3 passed in: a fourth choice is refused with a message. */
export const OverTheLimit: Story = {
  args: { limit: 3 },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    for (const letter of ["A", "B", "C", "D"]) {
      await userEvent.click(
        canvas.getByRole("checkbox", { name: `Version ${letter}` }),
      );
    }
    expect(await canvas.findByRole("alert")).toHaveTextContent(
      "At most 3 variants",
    );
  },
};

/** A narrative with no variants. */
export const NoVariants: Story = {
  args: { variants: [] },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText("This narrative has no variants."),
    ).toBeVisible();
  },
};

/**
 * Below 768px the fixed message replaces the columns and no read starts.
 * Narrow the viewport to 360px to see it; at wider widths this story shows
 * the ordinary view.
 */
export const PhoneMessage: Story = {};
