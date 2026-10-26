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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import spellingReducer from "../../src/store/spellingSlice";
import spellingAvailabilityReducer from "../../src/store/spellingAvailabilitySlice";
import userWordListReducer from "../../src/store/userWordListSlice";
import { setUserListApplies } from "../../src/store/spellingAvailabilitySlice";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import * as userWordTransport from "../../src/lib/api/user-word-list";
import AppSettingsDialog from "../../components/AppSettings/AppSettingsDialog";
import {
  getGlobalNoiseWords,
  setGlobalNoiseWords,
} from "../../src/lib/api/global-noise-words";

vi.mock("../../src/lib/api/global-noise-words", () => ({
  getGlobalNoiseWords: vi.fn(),
  setGlobalNoiseWords: vi.fn(),
}));

vi.mock("../../src/lib/api/user-word-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/api/user-word-list")>();
  return { ...actual, getUserWords: vi.fn() };
});

const mockGetUserWords = vi.mocked(userWordTransport.getUserWords);

const mockGetGlobalNoiseWords = getGlobalNoiseWords as unknown as ReturnType<
  typeof vi.fn
>;
const mockSetGlobalNoiseWords = setGlobalNoiseWords as unknown as ReturnType<
  typeof vi.fn
>;

function renderDialog() {
  const store = configureStore({
    reducer: {
      spelling: spellingReducer,
      spellingAvailability: spellingAvailabilityReducer,
      userWordList: userWordListReducer,
    },
  });
  const view = render(
    <Provider store={store}>
      <StaticSharingLimitsProvider value={{ state: { state: "exempt" } }}>
        <AppSettingsDialog isOpen onClose={() => undefined} />
      </StaticSharingLimitsProvider>
    </Provider>,
  );
  return { ...view, store };
}

beforeEach(() => {
  mockGetUserWords.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

describe("AppSettingsDialog", () => {
  it("never renders account-implying copy", async () => {
    mockGetGlobalNoiseWords.mockResolvedValue([]);
    renderDialog();

    await waitFor(() =>
      expect(screen.getByText(/No noise words yet/i)).toBeInTheDocument(),
    );

    expect(screen.getByText("App Settings")).toBeInTheDocument();
    expect(screen.queryByText(/Account Settings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sign in to manage/i)).not.toBeInTheDocument();
  });

  it("shows the spell-check switch with no desktop bridge present", async () => {
    mockGetGlobalNoiseWords.mockResolvedValue([]);
    renderDialog();
    expect(
      await screen.findByRole("switch", { name: /check spelling/i }),
    ).toBeChecked();
  });

  it("loads the global list on open", async () => {
    mockGetGlobalNoiseWords.mockResolvedValue(["red herring", "macguffin"]);
    renderDialog();

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
    renderDialog();

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
    renderDialog();

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
    renderDialog();
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
  describe("My dictionary (Feature 96)", () => {
    it("lists the section and shows the writer's words", async () => {
      mockGetGlobalNoiseWords.mockResolvedValue([]);
      mockGetUserWords.mockResolvedValue(["zorblax"]);
      renderDialog();
      expect(
        await screen.findByRole("heading", { name: /my dictionary/i }),
      ).toBeInTheDocument();
      expect(await screen.findByText("zorblax")).toBeInTheDocument();
    });

    it("shows no notice when the read has not failed", async () => {
      mockGetGlobalNoiseWords.mockResolvedValue([]);
      const { store } = renderDialog();
      store.dispatch(setUserListApplies(true));
      await screen.findByText("Spell check");
      await waitFor(() =>
        expect(store.getState().userWordList.status).toBe("loaded"),
      );
      expect(screen.queryByText(/could not be loaded/i)).toBeNull();
      expect(screen.queryByText(/not being applied/i)).toBeNull();
      expect(
        screen.queryByRole("button", {
          name: "Continue without my dictionary",
        }),
      ).toBeNull();
    });

    it("on a failed read shows the reason, Retry and Continue in the status line", async () => {
      mockGetGlobalNoiseWords.mockResolvedValue([]);
      mockGetUserWords.mockRejectedValue(new Error("disk gone"));
      const { store } = renderDialog();
      store.dispatch(setUserListApplies(true));
      const line = await screen.findByText(
        /Your dictionary could not be loaded/i,
        { selector: "[role=status] p" },
      );
      const region = line.closest("[role=status]") as HTMLElement;
      expect(region).toHaveTextContent(
        "Your dictionary could not be loaded. Something went wrong while reading it.",
      );
      expect(region).not.toHaveTextContent("disk gone");
      expect(
        within(region).getByRole("button", { name: "Retry" }),
      ).toBeInTheDocument();
      expect(
        within(region).getByRole("button", {
          name: "Continue without my dictionary",
        }),
      ).toBeInTheDocument();
    });

    it("shows a failed read once: Retry in Spell check, a short line in My dictionary", async () => {
      mockGetGlobalNoiseWords.mockResolvedValue([]);
      mockGetUserWords.mockRejectedValue(
        new userWordTransport.UserWordListTransportError(
          "corrupt",
          "The user word list is not valid JSON. Refusing to treat a corrupt file as an empty list.",
        ),
      );
      const { store } = renderDialog();
      store.dispatch(setUserListApplies(true));
      await screen.findByText(/Your dictionary could not be loaded/i, {
        selector: "[role=status] p",
      });
      expect(screen.getAllByText(/could not be loaded/i)).toHaveLength(1);
      expect(
        screen.getByText(/Its file is damaged and couldn't be read\./),
      ).toBeInTheDocument();
      expect(screen.queryByText(/corrupt|JSON|Refusing/i)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
      expect(
        screen.getByText(
          "Your words can't be shown until your dictionary loads.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 3, name: /my dictionary/i }),
      ).toBeInTheDocument();
    });

    it("after Continue a persistent status notice stays, without a dismiss control", async () => {
      mockGetGlobalNoiseWords.mockResolvedValue([]);
      mockGetUserWords.mockRejectedValue(new Error("disk gone"));
      const user = userEvent.setup();
      const { store } = renderDialog();
      store.dispatch(setUserListApplies(true));
      await user.click(
        await screen.findByRole("button", {
          name: "Continue without my dictionary",
        }),
      );
      const notice = await screen.findByText(
        /your own words are not being applied/i,
      );
      const region = notice.closest("[role=status]") as HTMLElement;
      expect(region).not.toBeNull();
      expect(
        within(region).queryByRole("button", { name: /dismiss|close/i }),
      ).toBeNull();
      expect(store.getState().spellingAvailability.userListOverride).toBe(true);
    });

    it("a successful Retry clears the notice", async () => {
      mockGetGlobalNoiseWords.mockResolvedValue([]);
      mockGetUserWords.mockRejectedValue(new Error("disk gone"));
      const user = userEvent.setup();
      const { store } = renderDialog();
      store.dispatch(setUserListApplies(true));
      await user.click(
        await screen.findByRole("button", {
          name: "Continue without my dictionary",
        }),
      );
      await screen.findByText(/your own words are not being applied/i);
      mockGetUserWords.mockResolvedValue(["zorblax"]);
      const section = screen
        .getByRole("heading", { name: /my dictionary/i })
        .closest("section") as HTMLElement;
      await user.click(within(section).getByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(
          screen.queryByText(/your own words are not being applied/i),
        ).toBeNull(),
      );
    });

    it("Retry in the status line re-reads the list", async () => {
      mockGetGlobalNoiseWords.mockResolvedValue([]);
      mockGetUserWords.mockRejectedValue(new Error("disk gone"));
      const user = userEvent.setup();
      const { store } = renderDialog();
      store.dispatch(setUserListApplies(true));
      const line = await screen.findByText(
        /Your dictionary could not be loaded/i,
        { selector: "[role=status] p" },
      );
      const region = line.closest("[role=status]") as HTMLElement;
      mockGetUserWords.mockResolvedValue(["zorblax"]);
      await user.click(within(region).getByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(store.getState().userWordList.status).toBe("loaded"),
      );
      expect(
        screen.queryByText(/Your dictionary could not be loaded/i, {
          selector: "[role=status] p",
        }),
      ).toBeNull();
    });
  });
});
