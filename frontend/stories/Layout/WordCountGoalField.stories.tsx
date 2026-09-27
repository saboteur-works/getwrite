import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, userEvent, within } from "storybook/test";
import WordCountGoalField from "../../components/Layout/WordCountGoalField";

/**
 * `WordCountGoalField` saves through `setWordCountGoal`
 * (`lib/api/word-count-goal.ts`), whose HTTP transport calls `fetch` directly.
 * Each story stubs `globalThis.fetch`, the pattern used by
 * `WritingLogFooterDisplay.stories.tsx` and `TrashView.stories.tsx`; the
 * returned function restores it.
 */
function mockWordCountGoalFetch(wordCountGoal: number | undefined) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> =>
    ({ ok: true, json: async () => ({ wordCountGoal }) }) as Response;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const meta: Meta<typeof WordCountGoalField> = {
  title: "Layout/WordCountGoalField",
  component: WordCountGoalField,
  args: { projectId: "project-1" },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof WordCountGoalField>;

/** No initial goal: the field starts empty. */
export const Empty: Story = {
  args: { initialGoal: undefined },
  beforeEach: () => mockWordCountGoalFetch(undefined),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText(
      "Total word-count goal",
    ) as HTMLInputElement;
    await expect(input.value).toBe("");
  },
};

/** A previously-saved goal prefills the field. */
export const Filled: Story = {
  args: { initialGoal: 50000 },
  beforeEach: () => mockWordCountGoalFetch(50000),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText(
      "Total word-count goal",
    ) as HTMLInputElement;
    await expect(input.value).toBe("50000");
  },
};

/**
 * An invalid value (non-integer) is rejected client-side with an accessible
 * `role="alert"` message and no request sent — the same validation path
 * `wordCountGoalField.test.tsx` exercises.
 */
export const Error: Story = {
  args: { initialGoal: undefined },
  beforeEach: () => mockWordCountGoalFetch(undefined),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText(
      "Total word-count goal",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-5" } });
    await userEvent.click(
      canvas.getByRole("button", { name: "Save word-count goal" }),
    );
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(/whole number/i);
    await expect(input).toHaveAttribute("aria-invalid", "true");
  },
};
