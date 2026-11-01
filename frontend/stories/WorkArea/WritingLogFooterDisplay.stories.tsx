import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import WritingLogFooterDisplay from "../../components/WorkArea/WritingLogFooterDisplay";
import type { WritingLogAggregate } from "../../src/lib/api/writing-log";

/**
 * `WritingLogFooterDisplay` fetches today's aggregate itself, so each story
 * stubs `globalThis.fetch` (the pattern used by `TrashView.stories.tsx`); the
 * returned function restores it.
 */
function setup(aggregate: WritingLogAggregate | null) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> =>
    aggregate === null
      ? ({
          ok: false,
          status: 500,
          json: async () => ({ error: "unavailable" }),
        } as Response)
      : ({ ok: true, json: async () => aggregate } as Response);
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
  isFiltered: false,
  hasNoMatch: false,
};

const meta: Meta<typeof WritingLogFooterDisplay> = {
  title: "WorkArea/WritingLogFooterDisplay",
  component: WritingLogFooterDisplay,
  args: { projectId: "project-1" },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof WritingLogFooterDisplay>;

/** Default: closed footer with a goal, no overlay open. */
export const Closed: Story = {
  beforeEach: () => setup(WITH_GOAL),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Today: 550 / 1000");
    await expect(canvas.queryByRole("dialog")).toBeNull();
  },
};

/** The button opens the details overlay with added, deleted and net. */
export const OverlayOpen: Story = {
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

/** Open overlay: imports are listed separately, plus the incomplete marker. */
export const OverlayImportAndIncomplete: Story = {
  beforeEach: () =>
    setup({
      ...WITH_GOAL,
      imported: { added: 12000, deleted: 0, net: 12000 },
      incomplete: true,
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Today: 550 / 1000");
    await userEvent.click(canvas.getByRole("button"));
    await within(document.body).findByText(
      "Imported (not counted toward goal): 12000",
    );
    const dialog = within(await within(document.body).findByRole("dialog"));
    await expect(
      dialog.getByText("Today's count may be incomplete"),
    ).toBeVisible();
  },
};

/** A skipped save leaves a marker: the count is flagged as possibly incomplete. */
export const IncompleteMarker: Story = {
  beforeEach: () => setup({ ...WITH_GOAL, incomplete: true }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await within(canvasElement).findByText("Today's count may be incomplete");
  },
};

const FILTERED: WritingLogAggregate = { ...WITH_GOAL, isFiltered: true };

/** A goal filter is set: the figure counts only the selected documents. */
export const Filtered: Story = {
  beforeEach: () => setup(FILTERED),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Today: 550 / 1000");
    await expect(canvas.getByText("Counting selected documents")).toBeVisible();
    await userEvent.click(canvas.getByRole("button"));
    const dialog = within(await within(document.body).findByRole("dialog"));
    await dialog.findByText("Net: 550");
    await expect(dialog.getByText("Counting selected documents")).toBeVisible();
  },
};

/** The filter matches no documents: a real zero with an explanatory line. */
export const FilteredNoMatch: Story = {
  beforeEach: () =>
    setup({
      ...FILTERED,
      hasNoMatch: true,
      totals: { added: 0, deleted: 0, net: 0 },
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Today: 0 / 1000");
    await expect(
      canvas.getByText("No documents match your goal filter"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button"));
    const dialog = within(await within(document.body).findByRole("dialog"));
    await dialog.findByText("Net: 0");
    await expect(
      dialog.getByText("No documents match your goal filter"),
    ).toBeVisible();
  },
};

/** The filtered figure cannot be computed: unavailable, never a number. */
export const FilteredUnavailable: Story = {
  beforeEach: () => setup(null),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Today's count is unavailable");
    await expect(canvas.queryByText(/Today: \d/)).toBeNull();
    await userEvent.click(canvas.getByRole("button"));
    const dialog = within(await within(document.body).findByRole("dialog"));
    await dialog.findByText("Today's count is unavailable");
  },
};

/** Filtered and incomplete: both markers show, with the unfiltered import line. */
export const FilteredIncomplete: Story = {
  beforeEach: () =>
    setup({
      ...FILTERED,
      incomplete: true,
      imported: { added: 12000, deleted: 0, net: 12000 },
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Counting selected documents");
    await expect(
      canvas.getByText("Today's count may be incomplete"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button"));
    await within(document.body).findByText(
      "Imported (not counted toward goal): 12000",
    );
  },
};
