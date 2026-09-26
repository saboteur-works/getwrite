import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import WritingLogFooterDisplay from "../../components/WorkArea/WritingLogFooterDisplay";
import type { WritingLogAggregate } from "../../src/lib/api/writing-log";

/**
 * `WritingLogFooterDisplay` fetches today's aggregate itself, so each story
 * stubs `globalThis.fetch` (the pattern used by `TrashView.stories.tsx`); the
 * returned function restores it.
 */
function setup(aggregate: WritingLogAggregate) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> =>
    ({ ok: true, json: async () => aggregate }) as Response;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const NO_IMPORT = { added: 0, deleted: 0, net: 0 };
const WITH_GOAL: WritingLogAggregate = {
  totals: { added: 640, deleted: 90, net: 550 },
  imported: NO_IMPORT,
  goal: 1000,
  incomplete: false,
};

const meta: Meta<typeof WritingLogFooterDisplay> = {
  title: "WorkArea/WritingLogFooterDisplay",
  component: WritingLogFooterDisplay,
  args: { projectId: "project-1" },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof WritingLogFooterDisplay>;

/** Default: summary line only, no overlay open. */
export const Collapsed: Story = {
  beforeEach: () => setup(WITH_GOAL),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Today: 550 / 1000");
    await expect(canvas.queryByRole("dialog")).toBeNull();
  },
};

/** The button opens the details overlay with added, deleted and net. */
export const Expanded: Story = {
  beforeEach: () => setup(WITH_GOAL),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Today: 550 / 1000");
    await userEvent.click(canvas.getByRole("button"));
    const dialog = within(await within(document.body).findByRole("dialog"));
    await dialog.findByText("Added: 640");
    await expect(dialog.getByText("Deleted: 90")).toBeVisible();
    await expect(dialog.getByText("Net: 550")).toBeVisible();
  },
};

/** No daily goal set: the figure is shown without a target. */
export const NoGoal: Story = {
  beforeEach: () => setup({ ...WITH_GOAL, goal: undefined }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await within(canvasElement).findByText("Today: 550");
  },
};

/** Imported words are listed separately and excluded from the goal. */
export const ImportLine: Story = {
  beforeEach: () =>
    setup({ ...WITH_GOAL, imported: { added: 12000, deleted: 0, net: 12000 } }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Today: 550 / 1000");
    await userEvent.click(canvas.getByRole("button"));
    await within(document.body).findByText(
      "Imported (not counted toward goal): 12000",
    );
  },
};

/** A skipped save leaves a marker: the count is flagged as possibly incomplete. */
export const IncompleteMarker: Story = {
  beforeEach: () => setup({ ...WITH_GOAL, incomplete: true }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await within(canvasElement).findByText("Today's count may be incomplete");
  },
};
