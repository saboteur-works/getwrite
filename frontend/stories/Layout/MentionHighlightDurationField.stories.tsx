import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, userEvent, within } from "storybook/test";
import MentionHighlightDurationField from "../../components/Layout/MentionHighlightDurationField";

/**
 * `MentionHighlightDurationField` saves through `setMentionHighlightDuration`
 * (`lib/api/mention-highlight-duration.ts`), whose HTTP transport calls
 * `fetch` directly. Each story stubs `globalThis.fetch`, the pattern used by
 * `WordCountGoalField.stories.tsx`/`WritingLogFooterDisplay.stories.tsx`/
 * `TrashView.stories.tsx`; the returned function restores it.
 */
function mockMentionHighlightDurationFetch(
  mentionHighlightDurationSeconds: number | undefined,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> =>
    ({
      ok: true,
      json: async () => ({ mentionHighlightDurationSeconds }),
    }) as Response;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const meta: Meta<typeof MentionHighlightDurationField> = {
  title: "Layout/MentionHighlightDurationField",
  component: MentionHighlightDurationField,
  args: { projectId: "project-1" },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof MentionHighlightDurationField>;

/** No configured value: the field prefills with the default, 2 seconds. */
export const DefaultsToTwo: Story = {
  args: { initialDurationSeconds: undefined },
  beforeEach: () => mockMentionHighlightDurationFetch(undefined),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const inputEl = canvas.getByLabelText(
      "Highlight duration (seconds)",
    ) as HTMLInputElement;
    await expect(inputEl.value).toBe("2");
  },
};

/** A previously-saved value prefills the field. */
export const Configured: Story = {
  args: { initialDurationSeconds: 7 },
  beforeEach: () => mockMentionHighlightDurationFetch(7),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const inputEl = canvas.getByLabelText(
      "Highlight duration (seconds)",
    ) as HTMLInputElement;
    await expect(inputEl.value).toBe("7");
  },
};

/**
 * An out-of-range value is rejected client-side with an accessible
 * `role="alert"` message and no request sent — the same validation path
 * `mentionHighlightDurationField.test.tsx` exercises.
 */
export const Error: Story = {
  args: { initialDurationSeconds: undefined },
  beforeEach: () => mockMentionHighlightDurationFetch(undefined),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const inputEl = canvas.getByLabelText(
      "Highlight duration (seconds)",
    ) as HTMLInputElement;
    fireEvent.change(inputEl, { target: { value: "11" } });
    await userEvent.click(
      canvas.getByRole("button", { name: "Save highlight duration" }),
    );
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(/1 to 10/i);
    await expect(inputEl).toHaveAttribute("aria-invalid", "true");
  },
};
