import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import KeepRunningSetting from "../../components/AppSettings/KeepRunningSetting";
import type { KeepRunningSetting as KeepRunningSettingValue } from "../../src/lib/desktop-bridge";

/** Installs a stub desktop bridge on `window` for the story's lifetime. */
function stubBridge(setting: KeepRunningSettingValue): () => void {
  const target = window as unknown as Record<string, unknown>;
  const original = target.getwriteDesktop;
  target.getwriteDesktop = {
    chooseWorkspaceDir: async () => ({ ok: false, cancelled: true }),
    getKeepRunningSetting: async () => setting,
    setKeepRunningSetting: async () => undefined,
  };
  return () => {
    target.getwriteDesktop = original;
  };
}

const meta: Meta<typeof KeepRunningSetting> = {
  title: "AppSettings/KeepRunningSetting",
  component: KeepRunningSetting,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof KeepRunningSetting>;

/** The default on macOS: closing the window quits GetWrite. */
export const Off: Story = {
  beforeEach: () => stubBridge({ supported: true, enabled: false }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("switch")).not.toBeChecked();
  },
};

/** Kept running: GetWrite stays in the Dock after its window closes. */
export const On: Story = {
  beforeEach: () => stubBridge({ supported: true, enabled: true }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("switch")).toBeChecked();
  },
};
