import React from "react";
import { afterEach, describe, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { runAxe } from "./helpers/axe";
import SharingStatusView from "../../components/Sharing/SharingStatus";
import type { SharingStatus } from "../../src/lib/desktop-bridge";

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

function install(getSharingStatus: () => Promise<SharingStatus>): void {
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    chooseWorkspaceDir: vi.fn(),
    getSharingStatus: vi.fn(getSharingStatus),
  };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

describe("a11y: SharingStatus", () => {
  it("has no axe violations when on", async () => {
    install(async () => ON);
    const { container } = render(<SharingStatusView />);
    await screen.findByText(/sharing is on/i);
    await runAxe(container);
  });

  it("has no axe violations with no addresses", async () => {
    install(async () => ({ ...ON, addresses: [] }));
    const { container } = render(<SharingStatusView />);
    await screen.findByText(/no network address/i);
    await runAxe(container);
  });

  it("has no axe violations when blocked", async () => {
    install(async () => ({ ...OFF, enabled: true, blockedByHostedAuth: true }));
    const { container } = render(<SharingStatusView />);
    await screen.findByText(/hosted sign-in/i);
    await runAxe(container);
  });

  it("has no axe violations on a bridge error", async () => {
    install(async () => {
      throw new Error("x");
    });
    const { container } = render(<SharingStatusView />);
    await screen.findByRole("alert");
    await runAxe(container);
  });
});
