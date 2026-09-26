import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import StatusRollup from "../../components/WorkArea/StatusRollup";
import type { AnyResource } from "../../src/lib/models/types";

const meta = {
  title: "WorkArea/StatusRollup",
  component: StatusRollup,
  // Strict-axe override scoped to this file only; the global setting stays "todo".
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof StatusRollup>;

export default meta;
type Story = StoryObj<typeof meta>;

function textResource(id: string, words: number, status?: string): AnyResource {
  return {
    id,
    slug: id,
    name: id,
    type: "text",
    orderIndex: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    userMetadata:
      status === undefined
        ? { wordCount: words }
        : { status, wordCount: words },
  } as AnyResource;
}

const configured = ["Draft", "Revised", "Final"] as const;

/** No resources at all: shows the empty message, no table. */
export const Empty: Story = { args: { resources: [], statuses: configured } };

/** Configured statuses with text resources spread across them. */
export const Populated: Story = {
  args: {
    resources: [
      textResource("ch-1", 1200, "Draft"),
      textResource("ch-2", 800, "Draft"),
      textResource("ch-3", 2500, "Revised"),
      textResource("ch-4", 400),
    ],
    statuses: configured,
  },
};

/** A resource carries a status that is no longer in the configured list. */
export const OffList: Story = {
  args: {
    resources: [
      textResource("ch-1", 1200, "Draft"),
      textResource("ch-2", 300, "Archived"),
      textResource("ch-3", 150),
    ],
    statuses: configured,
  },
};

/** The project has no statuses configured: hint shown, all under No status. */
export const NoStatusesConfigured: Story = {
  args: {
    resources: [textResource("ch-1", 900), textResource("ch-2", 100)],
    statuses: [],
  },
};
