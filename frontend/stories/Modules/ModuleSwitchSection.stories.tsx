import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import ModuleSwitchSection from "../../components/Modules/ModuleSwitchSection";

/**
 * `ModuleSwitchSection` saves through `setModuleEnabled`
 * (`lib/api/modules.ts`), whose HTTP transport calls `fetch` directly. Each
 * interactive story stubs `globalThis.fetch`; the returned function restores
 * it. The initial switch state comes from `parameters.modules` (the
 * `withModules` decorator in `.storybook/preview.tsx`).
 */
function mockModulesFetch(respond: () => Response): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => respond();
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const meta: Meta<typeof ModuleSwitchSection> = {
  title: "Modules/ModuleSwitchSection",
  component: ModuleSwitchSection,
  args: { projectId: "project-1" },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof ModuleSwitchSection>;

/** No `config.modules` entry: the Sources switch reads as its default, on (OQ-13). */
export const Absent: Story = {};

export const On: Story = { parameters: { modules: { sources: true } } };

export const Off: Story = { parameters: { modules: { sources: false } } };

/** A successful save shows the status message. */
export const SavedOff: Story = {
  parameters: { modules: { sources: true } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const restore = mockModulesFetch(
      () =>
        ({
          ok: true,
          json: async () => ({ modules: { sources: false } }),
        }) as Response,
    );
    try {
      const canvas = within(canvasElement);
      await userEvent.click(canvas.getByRole("checkbox", { name: /Sources/ }));
      await expect(await canvas.findByRole("status")).toHaveTextContent(
        "Sources is now off.",
      );
    } finally {
      restore();
    }
  },
};

/** A failed save shows an alert and keeps the writer's choice displayed. */
export const FailedSave: Story = {
  parameters: { modules: { sources: true } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const restore = mockModulesFetch(
      () =>
        ({
          ok: false,
          status: 500,
          json: async () => ({ error: "Could not write project.json." }),
        }) as Response,
    );
    try {
      const canvas = within(canvasElement);
      const box = canvas.getByRole("checkbox", { name: /Sources/ });
      await userEvent.click(box);
      await expect(await canvas.findByRole("alert")).toHaveTextContent(
        "Could not write project.json.",
      );
      await expect(box).not.toBeChecked();
    } finally {
      restore();
    }
  },
};
