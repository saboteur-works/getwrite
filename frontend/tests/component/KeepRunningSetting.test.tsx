/**
 * App Settings switch for keeping GetWrite running after its window closes
 * (macOS desktop only). A fake bridge is installed on `window` the way
 * `preload.ts` does it.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KeepRunningSetting from "../../components/AppSettings/KeepRunningSetting";
import type { DesktopBridge } from "../../src/lib/desktop-bridge";

type KeepRunningBridge = Pick<
  DesktopBridge,
  "chooseWorkspaceDir" | "getKeepRunningSetting" | "setKeepRunningSetting"
>;

function installBridge(bridge: KeepRunningBridge): void {
  (
    window as unknown as { getwriteDesktop?: KeepRunningBridge }
  ).getwriteDesktop = bridge;
}

function fakeBridge(
  setting: { supported: boolean; enabled: boolean },
  setImpl: (enabled: boolean) => Promise<void> = async () => undefined,
) {
  return {
    chooseWorkspaceDir: vi.fn(),
    getKeepRunningSetting: vi.fn(async () => setting),
    setKeepRunningSetting: vi.fn(setImpl),
  };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { getwriteDesktop?: unknown }).getwriteDesktop;
});

const SWITCH_NAME = "Keep GetWrite running after its window is closed";

describe("KeepRunningSetting", () => {
  it("renders nothing outside the desktop app", () => {
    const { container } = render(<KeepRunningSetting />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing, without throwing, for a bridge without the setting", () => {
    installBridge({
      chooseWorkspaceDir: vi.fn(),
    } as unknown as KeepRunningBridge);

    const { container } = render(<KeepRunningSetting />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing where the platform does not support it", async () => {
    const bridge = fakeBridge({ supported: false, enabled: false });
    installBridge(bridge);
    const { container } = render(<KeepRunningSetting />);

    await vi.waitFor(() =>
      expect(bridge.getKeepRunningSetting).toHaveBeenCalled(),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the recorded setting as an off switch by default", async () => {
    installBridge(fakeBridge({ supported: true, enabled: false }));
    render(<KeepRunningSetting />);

    const toggle = await screen.findByRole("switch", { name: SWITCH_NAME });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/Cmd\+Q quits/)).toBeInTheDocument();
  });

  it("records the change when the switch is turned on", async () => {
    const bridge = fakeBridge({ supported: true, enabled: false });
    installBridge(bridge);
    render(<KeepRunningSetting />);

    await userEvent.click(
      await screen.findByRole("switch", { name: SWITCH_NAME }),
    );

    expect(bridge.setKeepRunningSetting).toHaveBeenCalledWith(true);
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeChecked();
  });

  it("puts the switch back and says so when saving fails", async () => {
    installBridge(
      fakeBridge({ supported: true, enabled: false }, async () => {
        throw new Error("disk full");
      }),
    );
    render(<KeepRunningSetting />);

    await userEvent.click(
      await screen.findByRole("switch", { name: SWITCH_NAME }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save this setting.",
    );
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).not.toBeChecked();
  });

  it("says so when the setting cannot be read", async () => {
    installBridge({
      chooseWorkspaceDir: vi.fn(),
      getKeepRunningSetting: vi.fn(async () => {
        throw new Error("unreadable");
      }),
      setKeepRunningSetting: vi.fn(),
    });
    render(<KeepRunningSetting />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load this setting.",
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
