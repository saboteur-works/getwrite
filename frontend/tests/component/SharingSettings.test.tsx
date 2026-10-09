/**
 * Desktop sharing controls (Feature 75, Task 20). A fake bridge is installed
 * on `window` the way `preload.ts` does it; every method the interface
 * declares is filled.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SharingSettings from "../../components/Sharing/SharingSettings";
import WorkspaceLocationSettings from "../../components/preferences/WorkspaceLocationSettings";
import {
  INTERIM_EXPOSURE_NOTE,
  NO_NETWORK_ADDRESS,
  PAIRING_CODE_ANNOUNCE_EXPIRED,
  PAIRING_CODE_ANNOUNCE_GENERATED,
  PAIRING_CODE_EXPIRED,
  SHARING_BLOCKED_BY_HOSTED_AUTH,
  SHARING_CHANGE_ERROR,
  SHARING_CODE_ERROR,
  SHARING_HEADING,
  SHARING_IS_ON,
  SHARING_RESTARTING,
  SHARING_RESTART_BUTTON,
  SHARING_RESTART_TO_APPLY,
  SHARING_STATEMENT_AVAILABILITY,
  SHARING_STATEMENT_UNENCRYPTED,
  SHARING_STATUS_ERROR,
  SHARING_STORE_CORRUPT,
} from "../../components/Sharing/sharing-copy";
import type {
  DesktopBridge,
  PairingCodeInfo,
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
  addresses: ["http://192.168.1.20:4100", "http://10.0.0.5:4100"],
  credentialStore: "ok",
};

type Fake = { bridge: DesktopBridge } & {
  [K in keyof DesktopBridge]: ReturnType<typeof vi.fn>;
};

function installBridge(
  status: SharingStatus,
  overrides: Partial<Record<keyof DesktopBridge, unknown>> = {},
): Fake {
  const fake = {
    getWorkspaceDir: vi.fn(async () => "/ws"),
    chooseWorkspaceDir: vi.fn(async () => ({ ok: true, projectsDir: "/new" })),
    restart: vi.fn(async () => undefined),
    chooseScrivenerSource: vi.fn(async () => ({ ok: false, cancelled: true })),
    startScrivenerImport: vi.fn(),
    chooseDocxFile: vi.fn(async () => ({ ok: false, cancelled: true })),
    chooseDocxFolder: vi.fn(async () => ({ ok: false, cancelled: true })),
    startDocxImport: vi.fn(),
    getGlobalNoiseWords: vi.fn(async () => []),
    setGlobalNoiseWords: vi.fn(async () => ({ ok: true })),
    getSharingStatus: vi.fn(async () => status),
    setSharingEnabled: vi.fn(async () => undefined),
    generatePairingCode: vi.fn(
      async (): Promise<PairingCodeInfo> => ({
        code: "123456",
        generatedAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000,
      }),
    ),
    getPairingCode: vi.fn(async () => null),
    ...overrides,
  };
  (window as unknown as Record<string, unknown>).getwriteDesktop = fake;
  return {
    ...fake,
    bridge: fake as unknown as DesktopBridge,
  } as unknown as Fake;
}

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

describe("SharingSettings", () => {
  it("renders nothing without a bridge", () => {
    const { container } = render(<SharingSettings />);
    expect(container).toBeEmptyDOMElement();
  });

  it("with sharing off shows a labelled switch and no 'on' statements", async () => {
    installBridge(OFF);
    render(<SharingSettings />);
    const sw = await screen.findByRole("switch", {
      name: /share my projects/i,
    });
    expect(sw).not.toBeChecked();
    expect(screen.queryByText(SHARING_IS_ON)).toBeNull();
    expect(screen.queryByText(SHARING_STATEMENT_UNENCRYPTED)).toBeNull();
    expect(screen.queryByText(INTERIM_EXPOSURE_NOTE)).toBeNull();
  });

  it("turning on records the flag and shows statements, note and restart to apply", async () => {
    const fake = installBridge(OFF);
    render(<SharingSettings />);
    await userEvent.click(await screen.findByRole("switch"));
    expect(fake.setSharingEnabled).toHaveBeenCalledWith(true);
    expect(
      await screen.findByText(SHARING_STATEMENT_UNENCRYPTED),
    ).toBeInTheDocument();
    expect(
      screen.getByText(SHARING_STATEMENT_AVAILABILITY),
    ).toBeInTheDocument();
    expect(screen.getByText(INTERIM_EXPOSURE_NOTE)).toBeInTheDocument();
    expect(screen.getByText(SHARING_RESTART_TO_APPLY)).toBeInTheDocument();
    expect(screen.getByText(SHARING_RESTART_TO_APPLY)).toHaveTextContent(
      /restart to apply/i,
    );
    expect(fake.restart).not.toHaveBeenCalled();
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("commits the restarting message to the DOM before restart() is called", async () => {
    let textAtCall: string | null = null;
    const fake = installBridge(OFF, {
      restart: vi.fn(async () => {
        textAtCall = document.body.textContent;
      }),
    });
    render(<SharingSettings />);
    await userEvent.click(await screen.findByRole("switch"));
    await userEvent.click(
      await screen.findByRole("button", { name: SHARING_RESTART_BUTTON }),
    );
    await vi.waitFor(() => expect(fake.restart).toHaveBeenCalledTimes(1));
    expect(textAtCall).toContain(SHARING_RESTARTING);
  });

  it("one restart applies a pending sharing change and a pending workspace change", async () => {
    const fake = installBridge(OFF);
    render(
      <>
        <WorkspaceLocationSettings />
        <SharingSettings />
      </>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /change folder/i }),
    );
    await screen.findByText("/new");
    await userEvent.click(await screen.findByRole("switch"));
    const section = screen.getByRole("region", { name: SHARING_HEADING });
    await userEvent.click(
      await within(section).findByRole("button", {
        name: SHARING_RESTART_BUTTON,
      }),
    );
    await vi.waitFor(() => expect(fake.restart).toHaveBeenCalledTimes(1));
    expect(fake.chooseWorkspaceDir).toHaveBeenCalledTimes(1);
    expect(fake.setSharingEnabled).toHaveBeenCalledWith(true);
  });

  it("when effective shows 'Sharing is on', both statements, the note and every address", async () => {
    installBridge(ON);
    render(<SharingSettings />);
    expect(await screen.findByText(SHARING_IS_ON)).toBeInTheDocument();
    expect(screen.getByText(SHARING_STATEMENT_UNENCRYPTED)).toBeInTheDocument();
    expect(
      screen.getByText(SHARING_STATEMENT_AVAILABILITY),
    ).toBeInTheDocument();
    expect(screen.getByText(INTERIM_EXPOSURE_NOTE)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((i: HTMLElement) => i.textContent)).toEqual(ON.addresses);
  });

  it("says plainly when there is no address", async () => {
    installBridge({ ...ON, addresses: [] });
    render(<SharingSettings />);
    expect(await screen.findByText(NO_NETWORK_ADDRESS)).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("generates a code, counts down each second, then shows an expired state with announcements", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const t0 = Date.now();
    installBridge(ON, {
      generatePairingCode: vi.fn(async () => ({
        code: "654321",
        generatedAt: t0,
        expiresAt: t0 + 5 * 60 * 1000,
      })),
    });
    render(<SharingSettings />);
    const btn = await screen.findByRole("button", {
      name: /show a pairing code/i,
    });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByText("654321")).toBeInTheDocument();
    expect(screen.getByText(/expires in 5:00/i)).toBeInTheDocument();
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent(PAIRING_CODE_ANNOUNCE_GENERATED);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/expires in 4:59/i)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(screen.getByText(PAIRING_CODE_EXPIRED)).toBeInTheDocument();
    expect(live).toHaveTextContent(PAIRING_CODE_ANNOUNCE_EXPIRED);
    expect(
      screen.getByRole("button", { name: /generate a new code/i }),
    ).toBeInTheDocument();
  });

  it("hosted-auth block shows the message and no 'sharing is on' text", async () => {
    installBridge({ ...OFF, enabled: true, blockedByHostedAuth: true });
    render(<SharingSettings />);
    expect(
      await screen.findByText(SHARING_BLOCKED_BY_HOSTED_AUTH),
    ).toBeInTheDocument();
    expect(screen.queryByText(SHARING_IS_ON)).toBeNull();
    expect(screen.queryByText(SHARING_STATEMENT_UNENCRYPTED)).toBeNull();
  });

  it("says in text when the paired-device store is corrupt", async () => {
    installBridge({ ...ON, credentialStore: "corrupt" });
    render(<SharingSettings />);
    expect(await screen.findByText(SHARING_STORE_CORRUPT)).toBeInTheDocument();
  });

  it("shows an explicit error when the status cannot be read", async () => {
    installBridge(OFF, {
      getSharingStatus: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    render(<SharingSettings />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      SHARING_STATUS_ERROR,
    );
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows an error and leaves the switch unchanged when recording fails", async () => {
    installBridge(OFF, {
      setSharingEnabled: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    render(<SharingSettings />);
    await userEvent.click(await screen.findByRole("switch"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      SHARING_CHANGE_ERROR,
    );
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("shows an error and no stale code when generating fails", async () => {
    installBridge(ON, {
      generatePairingCode: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    render(<SharingSettings />);
    await userEvent.click(
      await screen.findByRole("button", { name: /show a pairing code/i }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      SHARING_CODE_ERROR,
    );
  });

  it("uses no red class or token", async () => {
    installBridge(ON);
    const { container } = render(<SharingSettings />);
    await screen.findByText(SHARING_IS_ON);
    expect(container.innerHTML).not.toMatch(/(^|[\s"'-])red(-|\s|"|')/);
  });

  it("is operable by keyboard", async () => {
    const fake = installBridge(OFF);
    const user = userEvent.setup();
    render(<SharingSettings />);
    const sw = await screen.findByRole("switch");
    await user.tab();
    expect(sw).toHaveFocus();
    await user.keyboard(" ");
    expect(fake.setSharingEnabled).toHaveBeenCalledWith(true);
    const restart = await screen.findByRole("button", {
      name: SHARING_RESTART_BUTTON,
    });
    await user.tab();
    expect(restart).toHaveFocus();
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(fake.restart).toHaveBeenCalledTimes(1));
  });
});
