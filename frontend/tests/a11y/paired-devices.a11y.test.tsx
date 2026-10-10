import React from "react";
import { afterEach, describe, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { runAxe } from "./helpers/axe";
import PairedDevices from "../../components/Sharing/PairedDevices";
import {
  PAIRED_DEVICES_UNREADABLE,
  PAIRED_DEVICE_RENAME_ERROR,
} from "../../components/Sharing/sharing-copy";
import type {
  ListPairedDevicesResult,
  PairedDevice,
  PairedDeviceMutationResult,
} from "../../src/lib/desktop-bridge";

const IPAD: PairedDevice = {
  id: "d1",
  name: "Safari on iPad",
  createdAt: "2026-10-01T14:30:00.000Z",
};
const SAME: PairedDevice = {
  id: "d2",
  name: "Safari on iPad",
  createdAt: "2026-10-02T09:05:00.000Z",
};

function install(
  list: ListPairedDevicesResult,
  rename: PairedDeviceMutationResult = { kind: "ok" },
  revoke: PairedDeviceMutationResult = { kind: "ok" },
): void {
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    chooseWorkspaceDir: vi.fn(),
    listPairedDevices: vi.fn(async () => list),
    renamePairedDevice: vi.fn(async () => rename),
    revokePairedDevice: vi.fn(async () => revoke),
  };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

describe("a11y: PairedDevices", () => {
  it("has no axe violations when empty", async () => {
    install({ kind: "missing", devices: [], storeDirectory: "/x" });
    const { container } = render(<PairedDevices isSharingActive />);
    await screen.findByText("No devices are paired.");
    await runAxe(container);
  });

  it("has no axe violations with several devices", async () => {
    install({
      kind: "ok",
      devices: [IPAD, { ...IPAD, id: "d3", name: "Chrome on Mac" }],
      storeDirectory: "/x",
    });
    const { container } = render(<PairedDevices isSharingActive />);
    await screen.findByText("Chrome on Mac");
    await runAxe(container);
  });

  it("has no axe violations with same-name devices", async () => {
    install({ kind: "ok", devices: [IPAD, SAME], storeDirectory: "/x" });
    const { container } = render(<PairedDevices isSharingActive />);
    await screen.findAllByText("Safari on iPad");
    await runAxe(container);
  });

  it("has no axe violations when the store is unreadable", async () => {
    install({ kind: "corrupt", storeDirectory: "/x" });
    const { container } = render(<PairedDevices isSharingActive />);
    await screen.findByText(PAIRED_DEVICES_UNREADABLE);
    await runAxe(container);
  });

  it("has no axe violations showing a rename error", async () => {
    install(
      { kind: "ok", devices: [IPAD], storeDirectory: "/x" },
      { kind: "write-failed" },
    );
    const user = userEvent.setup();
    const { container } = render(<PairedDevices isSharingActive />);
    await user.click(
      await screen.findByRole("button", { name: "Rename Safari on iPad" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(PAIRED_DEVICE_RENAME_ERROR);
    await runAxe(container);
  });

  it("has no axe violations with the rename form open", async () => {
    install({ kind: "ok", devices: [IPAD, SAME], storeDirectory: "/x" });
    const user = userEvent.setup();
    const { container } = render(<PairedDevices isSharingActive />);
    await user.click(
      (await screen.findAllByRole("button", { name: /^Rename Safari/ }))[0],
    );
    await screen.findByRole("textbox");
    await runAxe(container);
  });

  describe("revoke dialog", () => {
    async function openDialog(): Promise<HTMLElement> {
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", { name: "Revoke Chrome on Mac" }),
      );
      return screen.findByRole("dialog");
    }
    const two: ListPairedDevicesResult = {
      kind: "ok",
      devices: [IPAD, { ...IPAD, id: "d3", name: "Chrome on Mac" }],
      storeDirectory: "/x",
    };
    function inList(): HTMLElement {
      return screen.getByRole("heading", { name: "Paired devices" })
        .parentElement as HTMLElement;
    }

    it("has no axe violations with the revoke dialog open", async () => {
      install(two);
      render(<PairedDevices isSharingActive />);
      const dialog = await openDialog();
      await runAxe(dialog);
    });

    it("keeps focus inside the list region after cancel", async () => {
      install(two);
      render(<PairedDevices isSharingActive />);
      const dialog = await openDialog();
      await userEvent
        .setup()
        .click(within(dialog).getByRole("button", { name: /^Keep / }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() =>
        expect(inList().contains(document.activeElement)).toBe(true),
      );
      expect(document.activeElement).not.toBe(document.body);
    });

    it("keeps focus inside the list region after Escape", async () => {
      install(two);
      render(<PairedDevices isSharingActive />);
      await openDialog();
      await userEvent.setup().keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() =>
        expect(inList().contains(document.activeElement)).toBe(true),
      );
      expect(document.activeElement).not.toBe(document.body);
    });

    it("keeps focus inside the list region after confirm", async () => {
      install(two);
      render(<PairedDevices isSharingActive />);
      const dialog = await openDialog();
      await userEvent
        .setup()
        .click(within(dialog).getByRole("button", { name: /^Revoke Chrome/ }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() =>
        expect(inList().contains(document.activeElement)).toBe(true),
      );
      expect(document.activeElement).not.toBe(document.body);
    });

    it("has no axe violations showing a revoke error", async () => {
      install(two, { kind: "ok" }, { kind: "write-failed" });
      const { container } = render(<PairedDevices isSharingActive />);
      const dialog = await openDialog();
      await userEvent
        .setup()
        .click(within(dialog).getByRole("button", { name: /^Revoke Chrome/ }));
      await screen.findByText(
        "Could not revoke this device. It is still paired.",
      );
      await runAxe(container);
    });
  });
});
