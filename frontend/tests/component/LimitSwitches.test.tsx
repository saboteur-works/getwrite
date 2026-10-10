/**
 * Paired-device limit switches (Feature 77, Task 23, FR-27, FR-29 to FR-31).
 * A fake bridge is installed on `window` the way `preload.ts` does it.
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LimitSwitches from "../../components/Sharing/LimitSwitches";
import {
  LIMITS_CHANGE_FAILED,
  LIMITS_CHANGE_LOCK_BUSY,
  LIMITS_CHANGE_REFUSED_UNREADABLE,
  LIMITS_LOAD_ERROR,
  LIMITS_UNLOCK_CONFIRM_TITLE,
  LIMITS_UNREADABLE,
  LIMITS_UNLOCK_WARNING_RECORDED,
  LIMITS_UNLOCK_WARNING_TYPED,
  LIMITS_UNLOCK_WARNING_UNENCRYPTED,
  pairedDeviceLocation,
} from "../../components/Sharing/sharing-copy";
import type {
  GetSharingLimitsResult,
  ListPairedDevicesResult,
  SetSharingLimitResult,
  SharingLimitKey,
} from "../../src/lib/desktop-bridge";

const NAMES: Record<SharingLimitKey, string> = {
  projectDeletion: "Limit project deletion",
  unlocking: "Limit unlocking",
  locking: "Limit locking",
  encryptionChanges: "Limit encryption changes",
  permanentDeletion: "Limit permanent deletion",
};
const KEYS = Object.keys(NAMES) as SharingLimitKey[];

function limitsResult(
  overrides: Partial<Record<SharingLimitKey, boolean>> = {},
  kind: GetSharingLimitsResult["kind"] = "ok",
): GetSharingLimitsResult {
  return {
    kind,
    limits: {
      projectDeletion: true,
      unlocking: true,
      locking: true,
      encryptionChanges: true,
      permanentDeletion: true,
      ...overrides,
    },
    storeDirectory: "/userdata",
  };
}

const NO_DEVICES: ListPairedDevicesResult = {
  kind: "missing",
  devices: [],
  storeDirectory: "/store",
};

interface Fake {
  getSharingLimits: ReturnType<typeof vi.fn>;
  setSharingLimit: ReturnType<typeof vi.fn>;
}

/**
 * A stateful fake store: `set` applies when it answers ok, like the main side.
 */
function install(
  initial: GetSharingLimitsResult,
  options: {
    set?: (key: SharingLimitKey, value: boolean) => SetSharingLimitResult;
    devices?: ListPairedDevicesResult;
  } = {},
): Fake {
  let current = initial;
  const fake: Fake = {
    getSharingLimits: vi.fn(async () => current),
    setSharingLimit: vi.fn(async (key: SharingLimitKey, value: boolean) => {
      const outcome = options.set
        ? options.set(key, value)
        : ({ kind: "ok" } as const);
      if (outcome.kind === "ok") {
        current = {
          ...current,
          kind: "ok",
          limits: { ...current.limits, [key]: value },
        };
      }
      return outcome;
    }),
  };
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    chooseWorkspaceDir: vi.fn(),
    ...fake,
    listPairedDevices: vi.fn(async () => options.devices ?? NO_DEVICES),
  };
  return fake;
}

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});
afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

describe("LimitSwitches", () => {
  it("renders nothing without the desktop bridge", () => {
    const { container } = render(<LimitSwitches isSharingActive />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows five switches named for the limits, all on when the file says so", async () => {
    install(limitsResult());
    render(<LimitSwitches isSharingActive />);
    for (const key of KEYS) {
      const sw = await screen.findByRole("switch", { name: NAMES[key] });
      expect(sw).toBeChecked();
    }
    expect(screen.getAllByRole("switch")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });

  it("shows a limit that is off as off", async () => {
    install(limitsResult({ locking: false }));
    render(<LimitSwitches isSharingActive />);
    expect(
      await screen.findByRole("switch", { name: NAMES.locking }),
    ).not.toBeChecked();
    expect(screen.getByRole("switch", { name: NAMES.unlocking })).toBeChecked();
  });

  it("shows all on for a missing or invalid file", async () => {
    for (const kind of ["missing", "invalid"] as const) {
      install(limitsResult({}, kind));
      const { unmount } = render(<LimitSwitches isSharingActive />);
      await screen.findByRole("switch", { name: NAMES.locking });
      for (const sw of screen.getAllByRole("switch")) expect(sw).toBeChecked();
      unmount();
    }
  });

  describe("visibility (same rule as the paired-devices list)", () => {
    it("is hidden with sharing off, no devices and a readable store", async () => {
      const fake = install(limitsResult());
      const { container } = render(<LimitSwitches isSharingActive={false} />);
      await vi.waitFor(() => expect(fake.getSharingLimits).toHaveBeenCalled());
      await vi.waitFor(() =>
        expect(
          (
            window as unknown as {
              getwriteDesktop: { listPairedDevices: ReturnType<typeof vi.fn> };
            }
          ).getwriteDesktop.listPairedDevices,
        ).toHaveBeenCalled(),
      );
      expect(screen.queryByRole("switch")).toBeNull();
      expect(container.textContent).toBe("");
    });

    it("is shown with sharing off when a device is paired", async () => {
      install(limitsResult(), {
        devices: {
          kind: "ok",
          storeDirectory: "/store",
          devices: [
            { id: "d1", name: "Phone", createdAt: "2026-10-01T00:00:00Z" },
          ],
        },
      });
      render(<LimitSwitches isSharingActive={false} />);
      expect(
        await screen.findByRole("switch", { name: NAMES.locking }),
      ).toBeInTheDocument();
    });

    it("is shown with sharing off when the limits file is unreadable", async () => {
      install(limitsResult({}, "unreadable"));
      render(<LimitSwitches isSharingActive={false} />);
      expect(await screen.findByText(LIMITS_UNREADABLE)).toBeInTheDocument();
    });

    it("is shown with sharing off when the device store is unreadable", async () => {
      install(limitsResult(), {
        devices: { kind: "corrupt", storeDirectory: "/store" },
      });
      render(<LimitSwitches isSharingActive={false} />);
      expect(
        await screen.findByRole("switch", { name: NAMES.locking }),
      ).toBeInTheDocument();
    });
  });

  describe("changing a limit", () => {
    it("calls the bridge once and re-reads: turning a limit off", async () => {
      const fake = install(limitsResult());
      render(<LimitSwitches isSharingActive />);
      const sw = await screen.findByRole("switch", { name: NAMES.locking });
      const readsBefore = fake.getSharingLimits.mock.calls.length;
      await userEvent.click(sw);
      expect(fake.setSharingLimit).toHaveBeenCalledTimes(1);
      expect(fake.setSharingLimit).toHaveBeenCalledWith("locking", false);
      await vi.waitFor(() =>
        expect(fake.getSharingLimits.mock.calls.length).toBe(readsBefore + 1),
      );
      expect(
        await screen.findByRole("switch", { name: NAMES.locking }),
      ).not.toBeChecked();
    });

    it("turning a limit on calls the bridge with true and no confirmation", async () => {
      const fake = install(limitsResult({ unlocking: false, locking: false }));
      render(<LimitSwitches isSharingActive />);
      await userEvent.click(
        await screen.findByRole("switch", { name: NAMES.unlocking }),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fake.setSharingLimit).toHaveBeenCalledWith("unlocking", true);
      await vi.waitFor(() =>
        expect(
          screen.getByRole("switch", { name: NAMES.unlocking }),
        ).toBeChecked(),
      );
    });

    it("the other four switches turn off with no confirmation", async () => {
      const fake = install(limitsResult());
      render(<LimitSwitches isSharingActive />);
      for (const key of KEYS.filter((k) => k !== "unlocking")) {
        await userEvent.click(
          await screen.findByRole("switch", { name: NAMES[key] }),
        );
        expect(screen.queryByRole("dialog")).toBeNull();
        await vi.waitFor(() =>
          expect(fake.setSharingLimit).toHaveBeenLastCalledWith(key, false),
        );
        await vi.waitFor(() =>
          expect(
            screen.getByRole("switch", { name: NAMES[key] }),
          ).not.toBeChecked(),
        );
      }
      expect(fake.setSharingLimit).toHaveBeenCalledTimes(4);
    });

    it("shows the store's true state after a failed attempt, with a message", async () => {
      const cases: Array<[SetSharingLimitResult, string]> = [
        [{ kind: "lock-not-acquired" }, LIMITS_CHANGE_LOCK_BUSY],
        [{ kind: "write-failed" }, LIMITS_CHANGE_FAILED],
        [{ kind: "invalid-input" }, LIMITS_CHANGE_FAILED],
        [
          { kind: "unreadable", reason: "EACCES" },
          LIMITS_CHANGE_REFUSED_UNREADABLE,
        ],
      ];
      for (const [outcome, text] of cases) {
        const fake = install(limitsResult(), { set: () => outcome });
        const { unmount } = render(<LimitSwitches isSharingActive />);
        const reads = fake.getSharingLimits.mock.calls.length;
        await userEvent.click(
          await screen.findByRole("switch", { name: NAMES.locking }),
        );
        expect(await screen.findByText(text)).toBeInTheDocument();
        expect(fake.setSharingLimit).toHaveBeenCalledTimes(1);
        await vi.waitFor(() =>
          expect(fake.getSharingLimits.mock.calls.length).toBeGreaterThan(
            reads,
          ),
        );
        expect(
          screen.getByRole("switch", { name: NAMES.locking }),
        ).toBeChecked();
        unmount();
      }
    });

    it("a thrown change says so and shows the store's true state", async () => {
      const fake = install(limitsResult());
      fake.setSharingLimit.mockRejectedValueOnce(new Error("boom"));
      render(<LimitSwitches isSharingActive />);
      await userEvent.click(
        await screen.findByRole("switch", { name: NAMES.locking }),
      );
      expect(await screen.findByText(LIMITS_CHANGE_FAILED)).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: NAMES.locking })).toBeChecked();
    });

    it("shows what the store holds even when it differs from what was asked", async () => {
      const fake = install(limitsResult());
      // Main answers ok but another writer set it back before the re-read.
      fake.setSharingLimit.mockImplementationOnce(async () => ({ kind: "ok" }));
      render(<LimitSwitches isSharingActive />);
      await userEvent.click(
        await screen.findByRole("switch", { name: NAMES.locking }),
      );
      await vi.waitFor(() => expect(fake.setSharingLimit).toHaveBeenCalled());
      expect(screen.getByRole("switch", { name: NAMES.locking })).toBeChecked();
    });
  });

  describe("unlock warning and confirmation", () => {
    it("shows the three statements whether Limit unlocking is on or off, tied by aria-describedby", async () => {
      for (const isUnlockingOn of [true, false]) {
        install(limitsResult({ unlocking: isUnlockingOn }));
        const { unmount } = render(<LimitSwitches isSharingActive />);
        const sw = await screen.findByRole("switch", { name: NAMES.unlocking });
        const describedBy = sw.getAttribute("aria-describedby");
        expect(describedBy).toBeTruthy();
        const warning = document.getElementById(describedBy as string);
        expect(warning).not.toBeNull();
        const scoped = within(warning as HTMLElement);
        expect(
          scoped.getByText(LIMITS_UNLOCK_WARNING_TYPED),
        ).toBeInTheDocument();
        expect(
          scoped.getByText(LIMITS_UNLOCK_WARNING_UNENCRYPTED),
        ).toBeInTheDocument();
        expect(
          scoped.getByText(LIMITS_UNLOCK_WARNING_RECORDED),
        ).toBeInTheDocument();
        expect(warning?.textContent).toMatch(/typed on the paired device/i);
        expect(warning?.textContent).toMatch(/unencrypted/i);
        expect(warning?.textContent).toMatch(/stolen disk or backup/i);
        unmount();
      }
    });

    it("the other switches are not tied to the warning", async () => {
      install(limitsResult());
      render(<LimitSwitches isSharingActive />);
      const unlocking = await screen.findByRole("switch", {
        name: NAMES.unlocking,
      });
      const warningId = unlocking.getAttribute("aria-describedby");
      for (const key of KEYS.filter((k) => k !== "unlocking")) {
        expect(
          screen
            .getByRole("switch", { name: NAMES[key] })
            .getAttribute("aria-describedby") ?? "",
        ).not.toContain(warningId as string);
      }
    });

    it("switching Limit unlocking off asks first, with Cancel focused, and does not call the bridge yet", async () => {
      const fake = install(limitsResult());
      render(<LimitSwitches isSharingActive />);
      await userEvent.click(
        await screen.findByRole("switch", { name: NAMES.unlocking }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText(LIMITS_UNLOCK_CONFIRM_TITLE),
      ).toBeInTheDocument();
      expect(dialog.textContent).toContain(LIMITS_UNLOCK_WARNING_TYPED);
      expect(dialog.textContent).toContain(LIMITS_UNLOCK_WARNING_UNENCRYPTED);
      expect(dialog.textContent).toContain(LIMITS_UNLOCK_WARNING_RECORDED);
      const buttons = within(dialog).getAllByRole("button");
      expect(document.activeElement).toBe(buttons[0]);
      expect(buttons[0]).toHaveTextContent(/keep/i);
      expect(fake.setSharingLimit).not.toHaveBeenCalled();
    });

    it("cancel changes nothing and the switch still shows on", async () => {
      const fake = install(limitsResult());
      render(<LimitSwitches isSharingActive />);
      await userEvent.click(
        await screen.findByRole("switch", { name: NAMES.unlocking }),
      );
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getAllByRole("button")[0]);
      await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(fake.setSharingLimit).not.toHaveBeenCalled();
      expect(
        screen.getByRole("switch", { name: NAMES.unlocking }),
      ).toBeChecked();
    });

    it("confirming calls the bridge once with false and re-reads", async () => {
      const fake = install(limitsResult());
      render(<LimitSwitches isSharingActive />);
      await userEvent.click(
        await screen.findByRole("switch", { name: NAMES.unlocking }),
      );
      const dialog = await screen.findByRole("dialog");
      const buttons = within(dialog).getAllByRole("button");
      await userEvent.click(buttons[buttons.length - 1]);
      await vi.waitFor(() =>
        expect(fake.setSharingLimit).toHaveBeenCalledWith("unlocking", false),
      );
      expect(fake.setSharingLimit).toHaveBeenCalledTimes(1);
      await vi.waitFor(() =>
        expect(
          screen.getByRole("switch", { name: NAMES.unlocking }),
        ).not.toBeChecked(),
      );
    });
  });

  describe("unreadable or failing reads", () => {
    it("says the limits file is unreadable, shows its location, and shows all on", async () => {
      install(limitsResult({}, "unreadable"));
      render(<LimitSwitches isSharingActive />);
      expect(await screen.findByText(LIMITS_UNREADABLE)).toBeInTheDocument();
      expect(
        screen.getByText(pairedDeviceLocation("/userdata")),
      ).toBeInTheDocument();
      for (const sw of screen.getAllByRole("switch")) expect(sw).toBeChecked();
    });

    it("says so in text when the read itself fails, never a blank", async () => {
      install(limitsResult());
      const target = (
        window as unknown as { getwriteDesktop: Record<string, unknown> }
      ).getwriteDesktop;
      target.getSharingLimits = vi.fn(async () => {
        throw new Error("boom");
      });
      render(<LimitSwitches isSharingActive />);
      expect(await screen.findByText(LIMITS_LOAD_ERROR)).toBeInTheDocument();
      expect(screen.queryByRole("switch")).toBeNull();
    });

    it("never shows a hard-coded path or a reason string", async () => {
      install(limitsResult(), {
        set: () => ({ kind: "unreadable", reason: "EACCES" }),
      });
      render(<LimitSwitches isSharingActive />);
      await userEvent.click(
        await screen.findByRole("switch", { name: NAMES.locking }),
      );
      await screen.findByText(LIMITS_CHANGE_REFUSED_UNREADABLE);
      expect(document.body.textContent).not.toContain("EACCES");
    });
  });
});
