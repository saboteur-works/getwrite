/**
 * "Sharing is on" status in the main views (Feature 75, Task 21). A fake
 * bridge is installed on `window` the way `preload.ts` does it.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SharingStatusView from "../../components/Sharing/SharingStatus";
import {
  INTERIM_EXPOSURE_NOTE,
  NO_NETWORK_ADDRESS,
  SHARING_BLOCKED_BY_HOSTED_AUTH,
  SHARING_IS_ON,
  SHARING_STATEMENT_AVAILABILITY,
  SHARING_STATEMENT_UNENCRYPTED,
  SHARING_STATUS_ERROR,
} from "../../components/Sharing/sharing-copy";
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
  addresses: ["http://192.168.1.20:4100", "http://10.0.0.5:4100"],
  credentialStore: "ok",
};

function install(getSharingStatus: () => Promise<SharingStatus>): void {
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    chooseWorkspaceDir: vi.fn(),
    getSharingStatus,
  };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

describe("SharingStatus", () => {
  it("shows state, every address, both statements and the note when effective", async () => {
    install(async () => ON);
    render(<SharingStatusView />);
    expect(await screen.findByText(SHARING_IS_ON)).toBeInTheDocument();
    expect(screen.getByText("http://192.168.1.20:4100")).toBeInTheDocument();
    expect(screen.getByText("http://10.0.0.5:4100")).toBeInTheDocument();
    expect(screen.getByText(SHARING_STATEMENT_UNENCRYPTED)).toBeInTheDocument();
    expect(
      screen.getByText(SHARING_STATEMENT_AVAILABILITY),
    ).toBeInTheDocument();
    expect(screen.getByText(INTERIM_EXPOSURE_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(NO_NETWORK_ADDRESS)).toBeNull();
  });

  it("shows the no-address line when effective with no addresses", async () => {
    install(async () => ({ ...ON, addresses: [] }));
    render(<SharingStatusView />);
    expect(await screen.findByText(SHARING_IS_ON)).toBeInTheDocument();
    expect(screen.getByText(NO_NETWORK_ADDRESS)).toBeInTheDocument();
  });

  it("renders no sharing text when sharing is not effective", async () => {
    const getSharingStatus = vi.fn(async () => OFF);
    install(getSharingStatus);
    const { container } = render(<SharingStatusView />);
    await vi.waitFor(() => expect(getSharingStatus).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByText(SHARING_IS_ON)).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing without a bridge", () => {
    const { container } = render(<SharingStatusView />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the hosted-auth message, not 'Sharing is on', when blocked", async () => {
    install(async () => ({ ...OFF, enabled: true, blockedByHostedAuth: true }));
    render(<SharingStatusView />);
    expect(
      await screen.findByText(SHARING_BLOCKED_BY_HOSTED_AUTH),
    ).toBeInTheDocument();
    expect(screen.queryByText(SHARING_IS_ON)).toBeNull();
  });

  it("shows an explicit error line when the bridge rejects", async () => {
    install(async () => {
      throw new Error("boom");
    });
    render(<SharingStatusView />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      SHARING_STATUS_ERROR,
    );
  });

  it("shows the error line when the bridge lacks the method", async () => {
    (window as unknown as Record<string, unknown>).getwriteDesktop = {
      chooseWorkspaceDir: vi.fn(),
    };
    render(<SharingStatusView />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      SHARING_STATUS_ERROR,
    );
  });

  it("uses no red class", async () => {
    install(async () => ON);
    const { container } = render(<SharingStatusView />);
    await screen.findByText(SHARING_IS_ON);
    const elements: HTMLElement[] = Array.from(
      (container as HTMLElement).querySelectorAll("[class]"),
    );
    const classes = elements.flatMap((el) => el.className.split(/\s+/));
    expect(classes.filter((c) => /(^|-)red(-|$)/.test(c))).toEqual([]);
  });
});
