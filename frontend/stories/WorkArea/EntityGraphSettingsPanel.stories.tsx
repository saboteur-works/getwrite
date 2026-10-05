import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, userEvent, within } from "storybook/test";
import EntityGraphSettingsPanel from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphSettingsPanel";

/**
 * `EntityGraphSettingsPanel` reads/writes through
 * `getEntityGraphSettings`/`setEntityGraphSettings`
 * (`lib/api/entity-graph-settings.ts`), whose HTTP transport calls `fetch`
 * directly. Each story stubs `globalThis.fetch`, the pattern
 * `WordCountGoalField.stories.tsx`/`WritingLogFooterDisplay.stories.tsx`/
 * `TrashView.stories.tsx` already use; the returned function restores it.
 */
function mockEntityGraphSettingsFetch(
  connectionTypes: string[],
  hopRadius: number,
) {
  const originalFetch = globalThis.fetch;
  let current = { connectionTypes, hopRadius };
  globalThis.fetch = async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (init?.method === "PUT" && typeof init.body === "string") {
      const body = JSON.parse(init.body) as {
        entityGraphConnectionTypes: string[];
        entityGraphFocalHopRadius: number;
      };
      current = {
        connectionTypes: body.entityGraphConnectionTypes,
        hopRadius: body.entityGraphFocalHopRadius,
      };
    }
    return {
      ok: true,
      json: async () => ({
        entityGraphConnectionTypes: current.connectionTypes,
        entityGraphFocalHopRadius: current.hopRadius,
      }),
    } as Response;
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const meta: Meta<typeof EntityGraphSettingsPanel> = {
  title: "WorkArea/EntityGraphSettingsPanel",
  component: EntityGraphSettingsPanel,
  args: { projectId: "project-1" },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof EntityGraphSettingsPanel>;

/** Closed by default: only the "Graph settings" toggle button is visible. */
export const Closed: Story = {
  beforeEach: () =>
    mockEntityGraphSettingsFetch(["authored", "cooccurrence"], 2),
};

/**
 * Opening the toggle loads and renders all five connection-type toggles plus
 * the hop-radius field, reflecting the project's saved settings.
 */
export const Open: Story = {
  beforeEach: () =>
    mockEntityGraphSettingsFetch(["authored", "cooccurrence"], 2),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Graph settings" }),
    );
    await expect(
      await canvas.findByLabelText("Authored relationships"),
    ).toBeChecked();
    await expect(canvas.getByLabelText("Backlinks")).not.toBeChecked();
    await expect(
      (canvas.getByLabelText("Focal hop radius") as HTMLInputElement).value,
    ).toBe("2");
  },
};

/**
 * Toggling a connection type persists the change through the transport and
 * reflects the saved response back without a page reload.
 */
export const ToggleConnectionType: Story = {
  beforeEach: () =>
    mockEntityGraphSettingsFetch(["authored", "cooccurrence"], 2),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Graph settings" }),
    );
    const backlinksToggle = await canvas.findByLabelText("Backlinks");
    await userEvent.click(backlinksToggle);
    await expect(await canvas.findByRole("status")).toHaveTextContent(/saved/i);
    await expect(backlinksToggle).toBeChecked();
  },
};

/**
 * An invalid hop-radius entry is rejected client-side with an accessible
 * `role="alert"` message, and no request is sent for that change.
 */
export const InvalidHopRadius: Story = {
  beforeEach: () =>
    mockEntityGraphSettingsFetch(["authored", "cooccurrence"], 2),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Graph settings" }),
    );
    const hopRadiusInput = await canvas.findByLabelText("Focal hop radius");
    fireEvent.change(hopRadiusInput, { target: { value: "-1" } });
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(/whole number/i);
    await expect(hopRadiusInput).toHaveAttribute("aria-invalid", "true");
  },
};
