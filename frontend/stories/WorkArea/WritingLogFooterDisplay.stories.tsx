import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import WritingLogFooterDisplay from "../../components/WorkArea/WritingLogFooterDisplay";
import { EDIT_FOOTER_EXPANDED_KEY } from "../../src/lib/edit-footer-state";
import type { WritingLogAggregate } from "../../src/lib/api/writing-log";

/**
 * `WritingLogFooterDisplay` fetches today's aggregate itself, so each story
 * stubs `globalThis.fetch` (the pattern used by `TrashView.stories.tsx`) and
 * seeds the persisted expand state; the returned function restores both.
 */
function setup(aggregate: WritingLogAggregate, isExpanded: boolean) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> =>
    ({ ok: true, json: async () => aggregate }) as Response;
  window.localStorage.setItem(EDIT_FOOTER_EXPANDED_KEY, String(isExpanded));
  return () => {
    globalThis.fetch = originalFetch;
    window.localStorage.removeItem(EDIT_FOOTER_EXPANDED_KEY);
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

/** Default: summary line only, details region hidden. */
export const Collapsed: Story = {
  beforeEach: () => setup(WITH_GOAL, false),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Today: 550 / 1000");
    await expect(canvas.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  },
};

/** Details region shows added, deleted and net. */
export const Expanded: Story = {
  beforeEach: () => setup(WITH_GOAL, true),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Added: 640");
    await expect(canvas.getByText("Deleted: 90")).toBeVisible();
    await expect(canvas.getByText("Net: 550")).toBeVisible();
  },
};

/** No daily goal set: the figure is shown without a target. */
export const NoGoal: Story = {
  beforeEach: () => setup({ ...WITH_GOAL, goal: undefined }, false),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await within(canvasElement).findByText("Today: 550");
  },
};

/** Imported words are listed separately and excluded from the goal. */
export const ImportLine: Story = {
  beforeEach: () =>
    setup(
      { ...WITH_GOAL, imported: { added: 12000, deleted: 0, net: 12000 } },
      true,
    ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await within(canvasElement).findByText(
      "Imported (not counted toward goal): 12000",
    );
  },
};

/** A skipped save leaves a marker: the count is flagged as possibly incomplete. */
export const IncompleteMarker: Story = {
  beforeEach: () => setup({ ...WITH_GOAL, incomplete: true }, false),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await within(canvasElement).findByText("Today's count may be incomplete");
  },
};
