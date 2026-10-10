import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import PairedDevices from "../../components/Sharing/PairedDevices";
import {
  PAIRED_DEVICES_EMPTY,
  PAIRED_DEVICES_UNREADABLE,
  PAIRED_DEVICE_ALREADY_GONE,
  PAIRED_DEVICE_RENAME_ERROR,
  PAIRED_DEVICE_REVOKE_ERROR,
} from "../../components/Sharing/sharing-copy";
import type {
  ListPairedDevicesResult,
  PairedDevice,
  PairedDeviceMutationResult,
} from "../../src/lib/desktop-bridge";

const IPAD: PairedDevice = {
  id: "device-1",
  name: "Safari on iPad",
  createdAt: "2026-10-01T14:30:00.000Z",
};
const MAC: PairedDevice = {
  id: "device-2",
  name: "Chrome on Mac",
  createdAt: "2026-10-02T09:05:00.000Z",
};
const SECOND_IPAD: PairedDevice = {
  id: "device-3",
  name: "Safari on iPad",
  createdAt: "2026-10-03T18:45:00.000Z",
};

/** Installs a stub desktop bridge on `window` for the story's lifetime. */
function stubBridge(
  list: ListPairedDevicesResult,
  rename: PairedDeviceMutationResult = { kind: "ok" },
  revoke: PairedDeviceMutationResult = { kind: "ok" },
): () => void {
  const target = window as unknown as Record<string, unknown>;
  const original = target.getwriteDesktop;
  target.getwriteDesktop = {
    chooseWorkspaceDir: async () => ({ ok: false, cancelled: true }),
    listPairedDevices: async () => list,
    renamePairedDevice: async () => rename,
    revokePairedDevice: async () => revoke,
  };
  return () => {
    target.getwriteDesktop = original;
  };
}

const meta: Meta<typeof PairedDevices> = {
  title: "Sharing/PairedDevices",
  component: PairedDevices,
  parameters: { a11y: { test: "error" } },
  args: { isSharingActive: true },
};

export default meta;

type Story = StoryObj<typeof PairedDevices>;

export const Empty: Story = {
  beforeEach: () =>
    stubBridge({
      kind: "missing",
      devices: [],
      storeDirectory: "/Users/you/store",
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(PAIRED_DEVICES_EMPTY),
    ).toBeInTheDocument();
  },
};

export const SeveralDevices: Story = {
  beforeEach: () =>
    stubBridge({
      kind: "ok",
      devices: [IPAD, MAC],
      storeDirectory: "/Users/you/store",
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Chrome on Mac")).toBeInTheDocument();
    await expect(canvas.getAllByRole("listitem")).toHaveLength(2);
  },
};

export const SameNameDevices: Story = {
  beforeEach: () =>
    stubBridge({
      kind: "ok",
      devices: [IPAD, SECOND_IPAD],
      storeDirectory: "/Users/you/store",
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findAllByRole("button", {
        name: /^Rename Safari on iPad, paired /,
      }),
    ).toHaveLength(2);
  },
};

export const Corrupt: Story = {
  beforeEach: () =>
    stubBridge({ kind: "corrupt", storeDirectory: "/Users/you/store" }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(PAIRED_DEVICES_UNREADABLE),
    ).toBeInTheDocument();
    await expect(canvas.queryAllByRole("button")).toHaveLength(0);
  },
};

export const RenameError: Story = {
  beforeEach: () =>
    stubBridge(
      { kind: "ok", devices: [IPAD], storeDirectory: "/Users/you/store" },
      { kind: "write-failed" },
    ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    (
      await canvas.findByRole("button", { name: "Rename Safari on iPad" })
    ).click();
    (await canvas.findByRole("button", { name: "Save" })).click();
    await expect(
      await canvas.findByText(PAIRED_DEVICE_RENAME_ERROR),
    ).toBeInTheDocument();
  },
};

export const RevokeDialogOpen: Story = {
  beforeEach: () =>
    stubBridge({
      kind: "ok",
      devices: [IPAD, MAC],
      storeDirectory: "/Users/you/store",
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Revoke Safari on iPad" }),
    );
    const dialog = within(await within(document.body).findByRole("dialog"));
    await expect(dialog.getByText("Revoke this device?")).toBeInTheDocument();
    await expect(
      dialog.getByRole("button", { name: "Keep Safari on iPad" }),
    ).toHaveFocus();
  },
};

export const RevokeError: Story = {
  beforeEach: () =>
    stubBridge(
      { kind: "ok", devices: [IPAD], storeDirectory: "/Users/you/store" },
      { kind: "ok" },
      { kind: "write-failed" },
    ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Revoke Safari on iPad" }),
    );
    const dialog = within(await within(document.body).findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Revoke Safari on iPad" }),
    );
    await expect(
      await canvas.findByText(PAIRED_DEVICE_REVOKE_ERROR),
    ).toBeInTheDocument();
  },
};

export const RevokeAlreadyRemoved: Story = {
  beforeEach: () =>
    stubBridge(
      { kind: "ok", devices: [IPAD], storeDirectory: "/Users/you/store" },
      { kind: "ok" },
      { kind: "not-found" },
    ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Revoke Safari on iPad" }),
    );
    const dialog = within(await within(document.body).findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Revoke Safari on iPad" }),
    );
    await expect(
      await canvas.findByText(PAIRED_DEVICE_ALREADY_GONE),
    ).toBeInTheDocument();
  },
};
