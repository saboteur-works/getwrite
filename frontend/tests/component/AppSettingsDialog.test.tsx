/**
 * Entity Mention Noise Flagging, Task 12: the standalone "App Settings"
 * surface (FR-14) that manages the cross-project global noise-word list.
 *
 * `getGlobalNoiseWords`/`setGlobalNoiseWords` (Task 11's transport collapse)
 * are mocked directly rather than at `fetch`, mirroring how other dialogs in
 * this suite mock at whichever boundary is closest to the component under
 * test.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppSettingsDialog from "../../components/AppSettings/AppSettingsDialog";
import {
  getGlobalNoiseWords,
  setGlobalNoiseWords,
} from "../../src/lib/api/global-noise-words";

vi.mock("../../src/lib/api/global-noise-words", () => ({
  getGlobalNoiseWords: vi.fn(),
  setGlobalNoiseWords: vi.fn(),
}));

const mockGetGlobalNoiseWords = getGlobalNoiseWords as unknown as ReturnType<
  typeof vi.fn
>;
const mockSetGlobalNoiseWords = setGlobalNoiseWords as unknown as ReturnType<
  typeof vi.fn
>;

afterEach(() => {
  vi.clearAllMocks();
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

describe("AppSettingsDialog", () => {
  it("never renders account-implying copy", async () => {
    mockGetGlobalNoiseWords.mockResolvedValue([]);
    render(<AppSettingsDialog isOpen onClose={() => undefined} />);

    await waitFor(() =>
      expect(screen.getByText(/No noise words yet/i)).toBeInTheDocument(),
    );

    expect(screen.getByText("App Settings")).toBeInTheDocument();
    expect(screen.queryByText(/Account Settings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sign in to manage/i)).not.toBeInTheDocument();
  });

  it("loads the global list on open", async () => {
    mockGetGlobalNoiseWords.mockResolvedValue(["red herring", "macguffin"]);
    render(<AppSettingsDialog isOpen onClose={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByText("red herring")).toBeInTheDocument();
      expect(screen.getByText("macguffin")).toBeInTheDocument();
    });
    expect(mockGetGlobalNoiseWords).toHaveBeenCalledTimes(1);
  });

  it("adds a word by sending the full updated list", async () => {
    mockGetGlobalNoiseWords.mockResolvedValue(["red herring"]);
    mockSetGlobalNoiseWords.mockResolvedValue(["red herring", "macguffin"]);
    const user = userEvent.setup();
    render(<AppSettingsDialog isOpen onClose={() => undefined} />);

    await waitFor(() =>
      expect(screen.getByText("red herring")).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText("New noise word"), "macguffin");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(mockSetGlobalNoiseWords).toHaveBeenCalledWith([
        "red herring",
        "macguffin",
      ]),
    );
    await waitFor(() =>
      expect(screen.getByText("macguffin")).toBeInTheDocument(),
    );
  });

  it("removes a word by sending the list without it", async () => {
    mockGetGlobalNoiseWords.mockResolvedValue(["red herring", "macguffin"]);
    mockSetGlobalNoiseWords.mockResolvedValue(["macguffin"]);
    const user = userEvent.setup();
    render(<AppSettingsDialog isOpen onClose={() => undefined} />);

    await waitFor(() =>
      expect(screen.getByText("red herring")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Remove noise word red herring" }),
    );

    await waitFor(() =>
      expect(mockSetGlobalNoiseWords).toHaveBeenCalledWith(["macguffin"]),
    );
    await waitFor(() =>
      expect(screen.queryByText("red herring")).not.toBeInTheDocument(),
    );
  });

  it("opens the revoke confirmation inside the dialog and returns focus to Revoke after cancel (FR-21)", async () => {
    mockGetGlobalNoiseWords.mockResolvedValue([]);
    (window as unknown as Record<string, unknown>).getwriteDesktop = {
      chooseWorkspaceDir: async () => ({ ok: false, cancelled: true }),
      getSharingStatus: async () => ({
        enabled: true,
        effective: true,
        blockedByHostedAuth: false,
        addresses: [],
        credentialStore: "ok",
        port: 4100,
      }),
      getPairingCode: async () => null,
      listPairedDevices: async () => ({
        kind: "ok",
        devices: [
          {
            id: "dev-1",
            name: "Safari on iPad",
            createdAt: "2026-10-01T14:30:00.000Z",
          },
        ],
        storeDirectory: "/store",
      }),
      renamePairedDevice: async () => ({ kind: "ok" }),
      revokePairedDevice: async () => ({ kind: "ok" }),
    };
    const user = userEvent.setup();
    render(<AppSettingsDialog isOpen onClose={() => undefined} />);
    const revoke = await screen.findByRole("button", {
      name: "Revoke Safari on iPad",
    });
    await user.click(revoke);
    const dialogs = await screen.findAllByRole("dialog");
    const confirm = dialogs.find((d: HTMLElement) =>
      within(d).queryByText("Revoke this device?"),
    );
    expect(confirm).toBeDefined();
    const keep = within(confirm as HTMLElement).getByRole("button", {
      name: "Keep Safari on iPad",
    });
    await waitFor(() => expect(keep).toHaveFocus());
    await user.click(keep);
    await waitFor(() =>
      expect(screen.queryByText("Revoke this device?")).toBeNull(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Revoke Safari on iPad" }),
      ).toHaveFocus(),
    );
    expect(screen.getByText("App Settings")).toBeInTheDocument();
  });
});
