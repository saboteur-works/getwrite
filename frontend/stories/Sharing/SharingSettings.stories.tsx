import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import SharingSettings from "../../components/Sharing/SharingSettings";
import {
  SHARING_BLOCKED_BY_HOSTED_AUTH,
  SHARING_IS_ON,
  SHARING_STATEMENT_UNENCRYPTED,
} from "../../components/Sharing/sharing-copy";
import type {
  ListPairedDevicesResult,
  SharingStatus,
} from "../../src/lib/desktop-bridge";

const OFF: SharingStatus = {
  enabled: false,
  effective: false,
  blockedByHostedAuth: false,
  addresses: [],
  credentialStore: "missing",
  port: 4100,
};

/** Installs a stub desktop bridge on `window` for the story's lifetime. */
function stubBridge(
  status: SharingStatus,
  devices: ListPairedDevicesResult = {
    kind: "missing",
    devices: [],
    storeDirectory: "/Users/you/store",
  },
): () => void {
  const target = window as unknown as Record<string, unknown>;
  const original = target.getwriteDesktop;
  target.getwriteDesktop = {
    chooseWorkspaceDir: async () => ({ ok: false, cancelled: true }),
    getSharingStatus: async () => status,
    setSharingEnabled: async () => undefined,
    getPairingCode: async () => null,
    generatePairingCode: async () => ({
      code: "123456",
      generatedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    }),
    restart: async () => undefined,
    listPairedDevices: async () => devices,
    renamePairedDevice: async () => ({ kind: "ok" }),
    revokePairedDevice: async () => ({ kind: "ok" }),
  };
  return () => {
    target.getwriteDesktop = original;
  };
}

const meta: Meta<typeof SharingSettings> = {
  title: "Sharing/SharingSettings",
  component: SharingSettings,
  parameters: { a11y: { test: "error" } },
  args: {},
};

export default meta;

type Story = StoryObj<typeof SharingSettings>;

export const Off: Story = {
  beforeEach: () => stubBridge(OFF),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("switch")).not.toBeChecked();
  },
};

export const On: Story = {
  beforeEach: () =>
    stubBridge({
      ...OFF,
      enabled: true,
      effective: true,
      addresses: ["http://192.168.1.20:4100"],
      credentialStore: "ok",
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(SHARING_IS_ON)).toBeInTheDocument();
    await expect(
      canvas.getByText(SHARING_STATEMENT_UNENCRYPTED),
    ).toBeInTheDocument();
  },
};

export const BlockedByHostedAuth: Story = {
  beforeEach: () =>
    stubBridge({ ...OFF, enabled: true, blockedByHostedAuth: true }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(SHARING_BLOCKED_BY_HOSTED_AUTH),
    ).toBeInTheDocument();
  },
};

/** Sharing in effect with two paired devices listed under the controls. */
export const WithPairedDevices: Story = {
  beforeEach: () =>
    stubBridge(
      {
        ...OFF,
        enabled: true,
        effective: true,
        addresses: ["http://192.168.1.20:4100"],
        credentialStore: "ok",
      },
      {
        kind: "ok",
        devices: [
          {
            id: "device-1",
            name: "Safari on iPad",
            createdAt: "2026-10-01T14:30:00.000Z",
          },
          {
            id: "device-2",
            name: "Chrome on Mac",
            createdAt: "2026-10-02T09:05:00.000Z",
          },
        ],
        storeDirectory: "/Users/you/store",
      },
    ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Safari on iPad")).toBeInTheDocument();
    await expect(canvas.getByText("Chrome on Mac")).toBeInTheDocument();
  },
};
