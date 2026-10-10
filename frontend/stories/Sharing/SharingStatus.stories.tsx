import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import SharingStatus from "../../components/Sharing/SharingStatus";
import {
  NO_NETWORK_ADDRESS,
  SHARING_BLOCKED_BY_HOSTED_AUTH,
  SHARING_IS_ON,
  SHARING_STATEMENT_UNENCRYPTED,
  SHARING_STATUS_ERROR,
} from "../../components/Sharing/sharing-copy";
import type { SharingStatus as SharingStatusInfo } from "../../src/lib/desktop-bridge";

const OFF: SharingStatusInfo = {
  enabled: false,
  effective: false,
  blockedByHostedAuth: false,
  addresses: [],
  credentialStore: "missing",
  port: 4100,
};
const ON: SharingStatusInfo = {
  ...OFF,
  enabled: true,
  effective: true,
  addresses: ["http://192.168.1.20:4100"],
  credentialStore: "ok",
};

/** Installs a stub desktop bridge on `window` for the story's lifetime. */
function stubBridge(
  getSharingStatus: () => Promise<SharingStatusInfo>,
): () => void {
  const target = window as unknown as Record<string, unknown>;
  const original = target.getwriteDesktop;
  target.getwriteDesktop = {
    chooseWorkspaceDir: async () => ({ ok: false, cancelled: true }),
    getSharingStatus,
  };
  return () => {
    target.getwriteDesktop = original;
  };
}

const meta: Meta<typeof SharingStatus> = {
  title: "Sharing/SharingStatus",
  component: SharingStatus,
  parameters: { a11y: { test: "error" } },
  args: {},
};

export default meta;

type Story = StoryObj<typeof SharingStatus>;

export const On: Story = {
  beforeEach: () => stubBridge(async () => ON),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(SHARING_IS_ON)).toBeInTheDocument();
    await expect(
      canvas.getByText(SHARING_STATEMENT_UNENCRYPTED),
    ).toBeInTheDocument();
  },
};

export const OnWithNoAddress: Story = {
  beforeEach: () => stubBridge(async () => ({ ...ON, addresses: [] })),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(NO_NETWORK_ADDRESS),
    ).toBeInTheDocument();
  },
};

export const BlockedByHostedAuth: Story = {
  beforeEach: () =>
    stubBridge(async () => ({
      ...OFF,
      enabled: true,
      blockedByHostedAuth: true,
    })),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(SHARING_BLOCKED_BY_HOSTED_AUTH),
    ).toBeInTheDocument();
  },
};

export const BridgeError: Story = {
  beforeEach: () =>
    stubBridge(async () => {
      throw new Error("unavailable");
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(SHARING_STATUS_ERROR),
    ).toBeInTheDocument();
  },
};
