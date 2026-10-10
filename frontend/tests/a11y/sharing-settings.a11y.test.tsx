import React from "react";
import { afterEach, describe, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { runAxe } from "./helpers/axe";
import SharingSettings from "../../components/Sharing/SharingSettings";
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
const ON: SharingStatus = {
  ...OFF,
  enabled: true,
  effective: true,
  addresses: ["http://192.168.1.20:4100"],
  credentialStore: "ok",
};

function install(status: SharingStatus, ttlMs = 5 * 60 * 1000): void {
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    chooseWorkspaceDir: vi.fn(),
    getSharingStatus: vi.fn(async () => status),
    getPairingCode: vi.fn(async () => null),
    setSharingEnabled: vi.fn(async () => undefined),
    generatePairingCode: vi.fn(async () => ({
      code: "123456",
      generatedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    })),
    restart: vi.fn(async () => undefined),
    listPairedDevices: vi.fn(async () => devices),
    renamePairedDevice: vi.fn(async () => ({ kind: "ok" })),
    revokePairedDevice: vi.fn(async () => ({ kind: "ok" })),
  };
}

const devices: ListPairedDevicesResult = {
  kind: "ok",
  devices: [
    {
      id: "dev-1",
      name: "Safari on iPad",
      createdAt: "2026-10-01T14:30:00.000Z",
    },
    {
      id: "dev-2",
      name: "Chrome on Mac",
      createdAt: "2026-10-02T09:05:00.000Z",
    },
  ],
  storeDirectory: "/store",
};

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

describe("a11y: SharingSettings", () => {
  it("has no axe violations when off", async () => {
    install(OFF);
    const { container } = render(<SharingSettings />);
    await screen.findByRole("switch");
    await runAxe(container);
  });

  it("has no axe violations when on, with a code", async () => {
    install(ON);
    const { container } = render(<SharingSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: /show a pairing code/i }),
    );
    await screen.findByText("123456");
    await runAxe(container);
  });

  it("has no axe violations when the code has expired", async () => {
    install(ON, 1000);
    const { container } = render(<SharingSettings />);
    const button = await screen.findByRole("button", {
      name: /show a pairing code/i,
    });
    await act(async () => {
      fireEvent.click(button);
    });
    await screen.findByText("123456");
    await screen.findByText(/has expired/i, undefined, { timeout: 4000 });
    await runAxe(container);
  });

  it("has no axe violations when blocked by hosted auth", async () => {
    install({ ...OFF, enabled: true, blockedByHostedAuth: true });
    const { container } = render(<SharingSettings />);
    await screen.findByText(/hosted sign-in/i);
    await runAxe(container);
  });

  it("has no axe violations with paired devices listed", async () => {
    install(ON);
    const { container } = render(<SharingSettings />);
    await screen.findByText("Safari on iPad");
    await runAxe(container);
  });
});
