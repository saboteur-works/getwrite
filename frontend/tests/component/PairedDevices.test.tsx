/**
 * Paired devices list and rename (Feature 76, Task 7). A fake bridge backed by
 * an in-memory "store" is installed on `window` the way `preload.ts` does it.
 * The store is deliberately able to hold something other than what was typed,
 * so the tests can tell "shows what is stored" from "shows what was typed".
 */
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PairedDevices, {
  PAIRED_DEVICES_POLL_INTERVAL_MS,
} from "../../components/Sharing/PairedDevices";
import Button from "../../components/common/UI/Button/Button";
import {
  PAIRED_DEVICES_EMPTY,
  PAIRED_DEVICES_HEADING,
  PAIRED_DEVICES_LOAD_ERROR,
  PAIRED_DEVICES_UNREADABLE,
  PAIRED_DEVICE_ALREADY_GONE,
  PAIRED_DEVICE_RENAME_ERROR,
  PAIRED_DEVICE_REVOKE_ERROR,
  pairedDeviceLocation,
  pairedDeviceRenamed,
} from "../../components/Sharing/sharing-copy";
import type {
  ListPairedDevicesResult,
  PairedDevice,
  PairedDeviceMutationResult,
} from "../../src/lib/desktop-bridge";

const DIR = "/arbitrary/test/dir";
const IPAD: PairedDevice = {
  id: "dev-1",
  name: "Safari on iPad",
  createdAt: "2026-10-01T14:30:00.000Z",
};
const MAC: PairedDevice = {
  id: "dev-2",
  name: "Chrome on Mac",
  createdAt: "2026-10-02T09:05:00.000Z",
};

interface Fake {
  list: ReturnType<typeof vi.fn<() => Promise<ListPairedDevicesResult>>>;
  rename: ReturnType<
    typeof vi.fn<
      (id: string, name: string) => Promise<PairedDeviceMutationResult>
    >
  >;
  revoke: ReturnType<
    typeof vi.fn<(id: string) => Promise<PairedDeviceMutationResult>>
  >;
  store: { devices: PairedDevice[] };
}

function install(
  devices: PairedDevice[],
  options: {
    listResult?: () => Promise<ListPairedDevicesResult>;
    renameResult?: (
      store: { devices: PairedDevice[] },
      id: string,
      name: string,
    ) => PairedDeviceMutationResult;
    revokeResult?: (
      store: { devices: PairedDevice[] },
      id: string,
    ) => Promise<PairedDeviceMutationResult> | PairedDeviceMutationResult;
  } = {},
): Fake {
  const store = { devices: devices.map((d) => ({ ...d })) };
  const list = vi.fn(
    options.listResult ??
      (async (): Promise<ListPairedDevicesResult> =>
        store.devices.length === 0
          ? { kind: "missing", devices: [], storeDirectory: DIR }
          : { kind: "ok", devices: [...store.devices], storeDirectory: DIR }),
  );
  const rename = vi.fn(
    async (id: string, name: string): Promise<PairedDeviceMutationResult> =>
      options.renameResult
        ? options.renameResult(store, id, name)
        : (() => {
            const hit = store.devices.find((d) => d.id === id);
            if (!hit) return { kind: "not-found" };
            hit.name = name;
            return { kind: "ok" };
          })(),
  );
  const revoke = vi.fn(
    async (id: string): Promise<PairedDeviceMutationResult> => {
      if (options.revokeResult) return options.revokeResult(store, id);
      const before = store.devices.length;
      store.devices = store.devices.filter((d) => d.id !== id);
      return store.devices.length === before
        ? { kind: "not-found" }
        : { kind: "ok" };
    },
  );
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    chooseWorkspaceDir: vi.fn(),
    listPairedDevices: list,
    renamePairedDevice: rename,
    revokePairedDevice: revoke,
  };
  return { list, rename, revoke, store };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

async function openRename(name: string): Promise<HTMLInputElement> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name }));
  return (await screen.findByRole("textbox")) as HTMLInputElement;
}

describe("PairedDevices", () => {
  it("renders nothing without a bridge (FR-5(e))", () => {
    const { container } = render(<PairedDevices isSharingActive />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the empty text, not the unreadable text, for a missing store", async () => {
    install([]);
    render(<PairedDevices isSharingActive />);
    expect(await screen.findByText(PAIRED_DEVICES_EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(PAIRED_DEVICES_UNREADABLE)).toBeNull();
  });

  it("shows the unreadable text and the path from the result, with no actions", async () => {
    install([], {
      listResult: async () => ({ kind: "corrupt", storeDirectory: DIR }),
    });
    render(<PairedDevices isSharingActive />);
    expect(
      await screen.findByText(PAIRED_DEVICES_UNREADABLE),
    ).toBeInTheDocument();
    expect(screen.getByText(pairedDeviceLocation(DIR))).toHaveTextContent(
      `The file is in ${DIR}.`,
    );
    expect(screen.queryByText(PAIRED_DEVICES_EMPTY)).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("hard-codes no machine path in its source", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../components/Sharing/PairedDevices.tsx"),
      "utf8",
    );
    expect(source).not.toContain("Library/Application Support");
  });

  it("shows a failure, not the empty text, when the list read rejects (FR-18)", async () => {
    install([], {
      listResult: async () => {
        throw new Error("ipc down");
      },
    });
    render(<PairedDevices isSharingActive />);
    expect(
      await screen.findByText(PAIRED_DEVICES_LOAD_ERROR),
    ).toBeInTheDocument();
    expect(screen.queryByText(PAIRED_DEVICES_EMPTY)).toBeNull();
  });

  it("lists devices in a semantic list under the heading, with a formatted date", async () => {
    install([IPAD, MAC]);
    render(<PairedDevices isSharingActive />);
    const heading = await screen.findByRole("heading", {
      name: PAIRED_DEVICES_HEADING,
    });
    expect(heading).toBeInTheDocument();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Safari on iPad")).toBeInTheDocument();
    const text = items[0].textContent ?? "";
    expect(text).toContain("2026");
    expect(text).not.toContain("2026-10-01T14:30");
    expect(text).not.toContain("Invalid Date");
  });

  it("shows an unparseable date as the raw stored string", async () => {
    install([{ ...IPAD, createdAt: "not-a-date" }]);
    render(<PairedDevices isSharingActive />);
    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent("not-a-date");
    expect(item).not.toHaveTextContent("Invalid Date");
  });

  it("renders a markup-looking name as text and creates no element", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    const { container } = (() => {
      install([{ ...IPAD, name: evil }]);
      return render(<PairedDevices isSharingActive />);
    })();
    expect(await screen.findByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("names each action button after its device, and tells same-named devices apart by date", async () => {
    install([
      IPAD,
      MAC,
      { ...IPAD, id: "dev-3", createdAt: "2026-10-03T10:00:00.000Z" },
    ]);
    render(<PairedDevices isSharingActive />);
    expect(
      await screen.findByRole("button", { name: /^Rename Chrome on Mac$/ }),
    ).toBeInTheDocument();
    const same = await screen.findAllByRole("button", {
      name: /^Rename Safari on iPad, paired /,
    });
    expect(same).toHaveLength(2);
    expect(same[0].getAttribute("aria-label")).not.toBe(
      same[1].getAttribute("aria-label"),
    );
  });

  it("opens a labelled field prefilled with the name, then renames once and shows the stored name", async () => {
    const fake = install([IPAD], {
      renameResult: (store) => {
        store.devices[0].name = "Stored Differently";
        return { kind: "ok" };
      },
    });
    const user = userEvent.setup();
    render(<PairedDevices isSharingActive />);
    const field = await openRename("Rename Safari on iPad");
    expect(field).toHaveValue("Safari on iPad");
    expect(screen.getByLabelText(/device name/i)).toBe(field);
    await user.clear(field);
    await user.type(field, "Typed Name");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fake.rename).toHaveBeenCalledTimes(1));
    expect(fake.rename).toHaveBeenCalledWith("dev-1", "Typed Name");
    expect(await screen.findByText("Stored Differently")).toBeInTheDocument();
    expect(screen.queryByText("Typed Name")).toBeNull();
    expect(fake.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("textbox")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Rename Stored Differently" }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Stored Differently");
  });

  it("keeps the field open, focused, with the reason, on invalid-name", async () => {
    const fake = install([IPAD], {
      renameResult: () => ({ kind: "invalid-name", reason: "too-long" }),
    });
    const user = userEvent.setup();
    render(<PairedDevices isSharingActive />);
    const field = await openRename("Rename Safari on iPad");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/64/);
    expect(screen.getByRole("textbox")).toBe(field);
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveValue("Safari on iPad");
    expect(fake.rename).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["not-a-string", /text/i],
    ["empty", /enter a name/i],
    ["control-character", /control/i],
  ] as const)("explains the %s reason in words", async (reason, pattern) => {
    install([IPAD], { renameResult: () => ({ kind: "invalid-name", reason }) });
    const user = userEvent.setup();
    render(<PairedDevices isSharingActive />);
    await openRename("Rename Safari on iPad");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(pattern);
  });

  it("says the device was already removed on not-found, refreshes, and focuses the heading", async () => {
    const fake = install([IPAD, MAC], {
      renameResult: (store, id) => {
        store.devices = store.devices.filter((d) => d.id !== id);
        return { kind: "not-found" };
      },
    });
    const user = userEvent.setup();
    render(<PairedDevices isSharingActive />);
    await openRename("Rename Safari on iPad");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(PAIRED_DEVICE_ALREADY_GONE),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Safari on iPad")).toBeNull(),
    );
    expect(fake.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: PAIRED_DEVICES_HEADING }),
      ).toHaveFocus(),
    );
  });

  it.each(["corrupt", "lock-not-acquired", "write-failed"] as const)(
    "shows the rename error and re-reads the list on %s",
    async (kind) => {
      const fake = install([IPAD], { renameResult: () => ({ kind }) });
      const user = userEvent.setup();
      render(<PairedDevices isSharingActive />);
      await openRename("Rename Safari on iPad");
      await user.click(screen.getByRole("button", { name: "Save" }));
      const message = await screen.findByText(PAIRED_DEVICE_RENAME_ERROR);
      expect(message.closest("[role='status'], [role='alert']")).not.toBeNull();
      expect(message.className).not.toMatch(/red|alert|danger|error/i);
      await waitFor(() =>
        expect(fake.list.mock.calls.length).toBeGreaterThanOrEqual(2),
      );
    },
  );

  it("shows the rename error and the list when the rename call rejects", async () => {
    const fake = install([IPAD]);
    fake.rename.mockRejectedValueOnce(new Error("ipc"));
    const user = userEvent.setup();
    render(<PairedDevices isSharingActive />);
    await openRename("Rename Safari on iPad");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(PAIRED_DEVICE_RENAME_ERROR),
    ).toBeInTheDocument();
  });

  it("closes without calling the bridge on Cancel and returns focus to the Rename button", async () => {
    const fake = install([IPAD]);
    const user = userEvent.setup();
    render(<PairedDevices isSharingActive />);
    await openRename("Rename Safari on iPad");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fake.rename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Rename Safari on iPad" }),
      ).toHaveFocus(),
    );
  });

  describe("revoke (Task 8)", () => {
    const THIRD: PairedDevice = {
      id: "dev-3",
      name: "Firefox on Linux",
      createdAt: "2026-10-03T10:00:00.000Z",
    };

    async function openRevoke(name: string): Promise<HTMLElement> {
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name }));
      return screen.findByRole("dialog");
    }

    it("opens a dialog with the spec copy naming the device, and cancel is the default focus", async () => {
      install([IPAD, MAC]);
      render(<PairedDevices isSharingActive />);
      const dialog = await openRevoke("Revoke Safari on iPad");
      expect(
        within(dialog).getByText("Revoke this device?"),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          "Safari on iPad will be refused from now on. It can pair again with a new code. Your other devices are not affected. Unsaved edits on that device will be lost.",
        ),
      ).toBeInTheDocument();
      expect(dialog.textContent).toContain(
        "Unsaved edits on that device will be lost.",
      );
      expect(
        within(dialog).getByRole("button", { name: "Revoke Safari on iPad" }),
      ).toBeInTheDocument();
      const keep = within(dialog).getByRole("button", {
        name: "Keep Safari on iPad",
      });
      await waitFor(() => expect(keep).toHaveFocus());
      expect(document.activeElement).toBe(keep);
    });

    it("uses no red class and the unchanged destructive variant", async () => {
      install([IPAD]);
      render(<PairedDevices isSharingActive />);
      const dialog = await openRevoke("Revoke Safari on iPad");
      for (const el of [dialog, ...Array.from(dialog.querySelectorAll("*"))]) {
        expect(el.getAttribute("class") ?? "").not.toMatch(/red/i);
      }
      const { container } = render(<Button variant="destructive">x</Button>);
      const reference = container.querySelector("button")?.className;
      expect(
        within(dialog).getByRole("button", { name: "Revoke Safari on iPad" })
          .className,
      ).toBe(reference);
    });

    it("builds the copy safely for a name containing braces", async () => {
      install([{ ...IPAD, name: "{name} $& {0}" }]);
      render(<PairedDevices isSharingActive />);
      const dialog = await openRevoke("Revoke {name} $& {0}");
      expect(
        within(dialog).getByText(
          "{name} $& {0} will be refused from now on. It can pair again with a new code. Your other devices are not affected. Unsaved edits on that device will be lost.",
        ),
      ).toBeInTheDocument();
    });

    it("cancel closes, calls nothing, and returns focus to that device's Revoke button", async () => {
      const fake = install([IPAD, MAC]);
      const user = userEvent.setup();
      render(<PairedDevices isSharingActive />);
      const dialog = await openRevoke("Revoke Chrome on Mac");
      await user.click(
        within(dialog).getByRole("button", { name: "Keep Chrome on Mac" }),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fake.revoke).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Revoke Chrome on Mac" }),
        ).toHaveFocus(),
      );
    });

    it("Escape closes without revoking and focus is not on the body", async () => {
      const fake = install([IPAD, MAC]);
      const user = userEvent.setup();
      render(<PairedDevices isSharingActive />);
      await openRevoke("Revoke Safari on iPad");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(fake.revoke).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Revoke Safari on iPad" }),
        ).toHaveFocus(),
      );
    });

    it("confirm revokes once, re-reads, announces, and focuses the next device's control", async () => {
      const fake = install([IPAD, MAC, THIRD]);
      const user = userEvent.setup();
      render(<PairedDevices isSharingActive />);
      const dialog = await openRevoke("Revoke Chrome on Mac");
      const readsBefore = fake.list.mock.calls.length;
      await user.click(
        within(dialog).getByRole("button", { name: "Revoke Chrome on Mac" }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(fake.revoke).toHaveBeenCalledTimes(1);
      expect(fake.revoke).toHaveBeenCalledWith("dev-2");
      expect(fake.list.mock.calls.length).toBeGreaterThan(readsBefore);
      expect(screen.queryByText("Chrome on Mac")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent(
        "Chrome on Mac was revoked.",
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Rename Firefox on Linux" }),
        ).toHaveFocus(),
      );
    });

    it("moves focus to the previous device when the last one was revoked", async () => {
      install([IPAD, MAC]);
      const user = userEvent.setup();
      render(<PairedDevices isSharingActive />);
      const dialog = await openRevoke("Revoke Chrome on Mac");
      await user.click(
        within(dialog).getByRole("button", { name: "Revoke Chrome on Mac" }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Rename Safari on iPad" }),
        ).toHaveFocus(),
      );
    });

    it("moves focus to the heading when no device remains", async () => {
      install([IPAD]);
      const user = userEvent.setup();
      render(<PairedDevices isSharingActive />);
      const dialog = await openRevoke("Revoke Safari on iPad");
      await user.click(
        within(dialog).getByRole("button", { name: "Revoke Safari on iPad" }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: PAIRED_DEVICES_HEADING }),
        ).toHaveFocus(),
      );
      expect(screen.getByText(PAIRED_DEVICES_EMPTY)).toBeInTheDocument();
    });

    it("calls revoke once on a double-click and disables confirm while pending", async () => {
      let release: (r: PairedDeviceMutationResult) => void = () => {};
      const fake = install([IPAD], {
        revokeResult: (store, id) =>
          new Promise<PairedDeviceMutationResult>((resolve) => {
            release = (r) => {
              store.devices = store.devices.filter((d) => d.id !== id);
              resolve(r);
            };
          }),
      });
      const user = userEvent.setup();
      render(<PairedDevices isSharingActive />);
      const dialog = await openRevoke("Revoke Safari on iPad");
      const confirm = within(dialog).getByRole("button", {
        name: "Revoke Safari on iPad",
      });
      await user.dblClick(confirm);
      expect(fake.revoke).toHaveBeenCalledTimes(1);
      expect(confirm).toBeDisabled();
      release({ kind: "ok" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(fake.revoke).toHaveBeenCalledTimes(1);
    });

    it("says the device was already removed on not-found, refreshes, and keeps focus out of the body", async () => {
      const fake = install([IPAD, MAC], {
        revokeResult: (store, id) => {
          store.devices = store.devices.filter((d) => d.id !== id);
          return { kind: "not-found" };
        },
      });
      const user = userEvent.setup();
      render(<PairedDevices isSharingActive />);
      const dialog = await openRevoke("Revoke Safari on iPad");
      await user.click(
        within(dialog).getByRole("button", { name: "Revoke Safari on iPad" }),
      );
      expect(
        await screen.findByText(PAIRED_DEVICE_ALREADY_GONE),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText("Safari on iPad")).toBeNull(),
      );
      expect(fake.list.mock.calls.length).toBeGreaterThanOrEqual(2);
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Rename Chrome on Mac" }),
        ).toHaveFocus(),
      );
    });

    it.each(["corrupt", "lock-not-acquired", "write-failed"] as const)(
      "shows the revoke error on %s and the list still shows the stored device",
      async (kind) => {
        const fake = install([IPAD], { revokeResult: () => ({ kind }) });
        const user = userEvent.setup();
        render(<PairedDevices isSharingActive />);
        const dialog = await openRevoke("Revoke Safari on iPad");
        const readsBefore = fake.list.mock.calls.length;
        await user.click(
          within(dialog).getByRole("button", { name: "Revoke Safari on iPad" }),
        );
        const message = await screen.findByText(PAIRED_DEVICE_REVOKE_ERROR);
        expect(message.closest("[role='status']")).not.toBeNull();
        expect(message.className).not.toMatch(/red|danger/i);
        expect(PAIRED_DEVICE_REVOKE_ERROR).toBe(
          "Could not revoke this device. It is still paired.",
        );
        await waitFor(() =>
          expect(fake.list.mock.calls.length).toBeGreaterThan(readsBefore),
        );
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByText("Safari on iPad")).toBeInTheDocument();
        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: "Revoke Safari on iPad" }),
          ).toHaveFocus(),
        );
      },
    );

    it("shows the revoke error and the list when the revoke call rejects", async () => {
      const fake = install([IPAD]);
      fake.revoke.mockRejectedValueOnce(new Error("ipc"));
      const user = userEvent.setup();
      render(<PairedDevices isSharingActive />);
      const dialog = await openRevoke("Revoke Safari on iPad");
      await user.click(
        within(dialog).getByRole("button", { name: "Revoke Safari on iPad" }),
      );
      expect(
        await screen.findByText(PAIRED_DEVICE_REVOKE_ERROR),
      ).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("Safari on iPad")).toBeInTheDocument();
    });

    it("has no Revoke all control", async () => {
      install([IPAD, MAC]);
      render(<PairedDevices isSharingActive />);
      await screen.findByText("Chrome on Mac");
      expect(screen.queryByRole("button", { name: /revoke all/i })).toBeNull();
    });
  });
});

describe("PairedDevices visibility, refresh and poll (Task 9)", () => {
  const TICK = PAIRED_DEVICES_POLL_INTERVAL_MS;

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Lets resolved promises and zero-delay timers run under fake timers. */
  async function settle(ms = 0): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  const listOf = (devices: PairedDevice[]): ListPairedDevicesResult =>
    devices.length === 0
      ? { kind: "missing", devices: [], storeDirectory: DIR }
      : { kind: "ok", devices, storeDirectory: DIR };

  it("shows nothing with sharing off and no store", async () => {
    install([]);
    const { container } = render(<PairedDevices isSharingActive={false} />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing with sharing off and a corrupt store (owner's Gate 4 decision)", async () => {
    install([], {
      listResult: async () => ({
        kind: "corrupt",
        devices: [],
        storeDirectory: DIR,
      }),
    });
    const { container } = render(<PairedDevices isSharingActive={false} />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(PAIRED_DEVICES_UNREADABLE)).toBeNull();
  });

  it("shows the list and revoke works with sharing off when the store holds a device (FR-20)", async () => {
    const fake = install([IPAD]);
    const user = userEvent.setup();
    render(<PairedDevices isSharingActive={false} />);
    await user.click(
      await screen.findByRole("button", { name: "Revoke Safari on iPad" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Revoke Safari on iPad" }),
    );
    await waitFor(() => expect(fake.revoke).toHaveBeenCalledWith("dev-1"));
  });

  it("with sharing active and an empty store shows the empty text; corrupt shows text and path", async () => {
    install([]);
    render(<PairedDevices isSharingActive />);
    expect(await screen.findByText(PAIRED_DEVICES_EMPTY)).toBeInTheDocument();
    cleanup();
    install([], {
      listResult: async () => ({
        kind: "corrupt",
        devices: [],
        storeDirectory: DIR,
      }),
    });
    render(<PairedDevices isSharingActive />);
    expect(
      await screen.findByText(PAIRED_DEVICES_UNREADABLE),
    ).toBeInTheDocument();
    expect(screen.getByText(pairedDeviceLocation(DIR))).toBeInTheDocument();
  });

  it("reads on mount and polls on the named interval, and stops on unmount", async () => {
    vi.useFakeTimers();
    const fake = install([IPAD]);
    const view = render(<PairedDevices isSharingActive />);
    await settle();
    expect(fake.list).toHaveBeenCalledTimes(1);
    await settle(TICK);
    expect(fake.list).toHaveBeenCalledTimes(2);
    await settle(TICK);
    expect(fake.list).toHaveBeenCalledTimes(3);
    view.unmount();
    await settle(TICK * 3);
    expect(fake.list).toHaveBeenCalledTimes(3);
  });

  it("shows a device that appears in the store between polls, without user action", async () => {
    vi.useFakeTimers();
    const fake = install([IPAD]);
    render(<PairedDevices isSharingActive />);
    await settle();
    expect(screen.queryByText("Chrome on Mac")).toBeNull();
    fake.store.devices.push({ ...MAC });
    await settle(TICK);
    expect(screen.getByText("Chrome on Mac")).toBeInTheDocument();
  });

  it("does not poll while the document is hidden, and reads again when it is shown", async () => {
    vi.useFakeTimers();
    const fake = install([IPAD]);
    let isHidden = true;
    const spy = vi
      .spyOn(document, "hidden", "get")
      .mockImplementation(() => isHidden);
    try {
      render(<PairedDevices isSharingActive />);
      await settle();
      expect(fake.list).toHaveBeenCalledTimes(1);
      await settle(TICK * 3);
      expect(fake.list).toHaveBeenCalledTimes(1);
      isHidden = false;
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await settle();
      expect(fake.list).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps a good list when a tick fails, shows the failure, and clears it on the next good tick", async () => {
    vi.useFakeTimers();
    let isFailing = false;
    const fake = install([IPAD], {
      listResult: async () => {
        if (isFailing) throw new Error("ipc");
        return listOf([IPAD]);
      },
    });
    render(<PairedDevices isSharingActive />);
    await settle();
    isFailing = true;
    await settle(TICK);
    expect(screen.getByText(PAIRED_DEVICES_LOAD_ERROR)).toBeInTheDocument();
    expect(screen.getByText("Safari on iPad")).toBeInTheDocument();
    expect(screen.queryByText(PAIRED_DEVICES_EMPTY)).toBeNull();
    isFailing = false;
    await settle(TICK);
    expect(screen.queryByText(PAIRED_DEVICES_LOAD_ERROR)).toBeNull();
    expect(screen.getByText("Safari on iPad")).toBeInTheDocument();
    expect(fake.list).toHaveBeenCalledTimes(3);
  });

  it("the later request wins when reads resolve out of order", async () => {
    vi.useFakeTimers();
    const first = deferred<ListPairedDevicesResult>();
    const second = deferred<ListPairedDevicesResult>();
    const queue = [first, second];
    let calls = 0;
    install([], {
      listResult: async () => {
        calls += 1;
        if (calls === 1) return listOf([IPAD]);
        const next = queue.shift();
        if (!next) return listOf([IPAD, MAC]);
        return next.promise;
      },
    });
    render(<PairedDevices isSharingActive />);
    await settle();
    await settle(TICK); // call 2, held
    await settle(TICK); // call 3, held
    second.resolve(listOf([IPAD, MAC])); // later request resolves first
    await settle();
    expect(screen.getByText("Chrome on Mac")).toBeInTheDocument();
    first.resolve(listOf([IPAD])); // earlier request resolves last
    await settle();
    expect(screen.getByText("Chrome on Mac")).toBeInTheDocument();
  });

  it("a poll that overtakes a rename's re-read does not turn a good rename into 'already removed'", async () => {
    vi.useFakeTimers();
    const held = deferred<ListPairedDevicesResult>();
    const stored = { ...IPAD };
    let calls = 0;
    install([IPAD], {
      listResult: async () => {
        calls += 1;
        if (calls === 1 || calls === 3) return listOf([{ ...stored }]);
        return held.promise;
      },
      renameResult: (_store, _id, name) => {
        stored.name = name;
        return { kind: "ok" };
      },
    });
    render(<PairedDevices isSharingActive />);
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Rename Safari on iPad" }),
    );
    await settle();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Den iPad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await settle(); // rename done, its re-read (call 2) is held
    await settle(TICK); // poll (call 3) resolves at once and wins
    held.resolve(listOf([{ ...stored }]));
    await settle();
    expect(
      screen.getByText(pairedDeviceRenamed("Den iPad")),
    ).toBeInTheDocument();
    expect(screen.queryByText(PAIRED_DEVICE_ALREADY_GONE)).toBeNull();
  });

  it("a refresh does not discard text typed in an open rename form", async () => {
    vi.useFakeTimers();
    const fake = install([IPAD]);
    render(<PairedDevices isSharingActive />);
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Rename Safari on iPad" }),
    );
    await settle();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Half typed" },
    });
    await settle(TICK * 2);
    expect(fake.list.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "Half typed",
    );
  });

  it("a refresh does not close an open revoke dialog", async () => {
    vi.useFakeTimers();
    install([IPAD, MAC]);
    render(<PairedDevices isSharingActive />);
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke Safari on iPad" }),
    );
    await settle();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await settle(TICK * 2);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Keep Safari on iPad" }),
    ).toBeInTheDocument();
  });

  it("never shows 'up to date'-style text", async () => {
    vi.useFakeTimers();
    install([IPAD]);
    const { container } = render(<PairedDevices isSharingActive />);
    await settle(TICK);
    expect(container.textContent ?? "").not.toMatch(
      /up to date|up-to-date|current|last updated/i,
    );
  });
});
