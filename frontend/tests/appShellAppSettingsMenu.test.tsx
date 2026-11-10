import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

const startShareListener = vi.hoisted(() =>
  vi.fn(async () => ({ stop: async () => undefined })),
);
vi.mock("../src/lib/api/share-in", () => ({ startShareListener }));

import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { StaticSharingLimitsProvider } from "../components/Sharing/SharingLimitsContext";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import { flushPendingEffects } from "./helpers/flushEffects";

describe("AppShell: App Settings from the settings menu", () => {
  setupAppShellFetchStub();

  it("opens the App Settings dialog and closes the menu", async () => {
    render(
      <Provider store={makeStore()}>
        <StaticSharingLimitsProvider>
          <AppShell showSidebars={false} project={null} resources={[]} />
        </StaticSharingLimitsProvider>
      </Provider>,
    );
    await flushPendingEffects();

    fireEvent.click(
      screen.getByRole("button", { name: "Open project settings menu" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "App Settings" }));

    expect(
      await screen.findByRole("dialog", { name: "App Settings" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

/**
 * Feature 106, Task 20 (FR-11, OQ-6 as amended): the Capture box host is
 * mounted inside AppShell, which also renders on the Start screen, and
 * AppShell's one document keydown handler separates Cmd/Ctrl+K (palette) from
 * Cmd/Ctrl+Shift+K (Capture). These are jsdom key events, not evidence that a
 * browser or the Electron shell delivers the combination (Task 26).
 */
const OPEN_PROJECT = {
  id: "proj_capture_keys",
  name: "Capture Keys Project",
  rootPath: "/test/capture-keys",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function renderShell(withProject: boolean): Promise<void> {
  render(
    <Provider store={makeStore()}>
      <StaticSharingLimitsProvider>
        <AppShell
          showSidebars={false}
          project={withProject ? (OPEN_PROJECT as never) : null}
          resources={[]}
        />
      </StaticSharingLimitsProvider>
    </Provider>,
  );
  await flushPendingEffects();
}

const PLAIN_COMBOS: Array<{ name: string; init: KeyboardEventInit }> = [
  { name: "Cmd+K", init: { key: "k", metaKey: true } },
  { name: "Ctrl+K", init: { key: "k", ctrlKey: true } },
];
const SHIFT_COMBOS: Array<{ name: string; init: KeyboardEventInit }> = [
  { name: "Cmd+Shift+K", init: { key: "K", metaKey: true, shiftKey: true } },
  { name: "Ctrl+Shift+K", init: { key: "K", ctrlKey: true, shiftKey: true } },
];

describe("AppShell: Capture box host and key handling (Feature 106, Task 20)", () => {
  setupAppShellFetchStub();

  it.each(SHIFT_COMBOS)(
    "$name opens only the Capture box, with no project open",
    async ({ init }) => {
      await renderShell(false);
      fireEvent.keyDown(document, init);

      expect(
        await screen.findByRole("dialog", { name: "Capture" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "Open Resource" }),
      ).toBeNull();
    },
  );

  it.each(SHIFT_COMBOS)(
    "$name opens only the Capture box, with a project open",
    async ({ init }) => {
      await renderShell(true);
      fireEvent.keyDown(document, init);

      expect(
        await screen.findByRole("dialog", { name: "Capture" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "Open Resource" }),
      ).toBeNull();
    },
  );

  it.each(PLAIN_COMBOS)(
    "$name opens only the palette while a project is open",
    async ({ init }) => {
      await renderShell(true);
      fireEvent.keyDown(document, init);

      expect(
        await screen.findByRole("dialog", { name: "Open Resource" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Capture" })).toBeNull();
    },
  );

  it.each(PLAIN_COMBOS)(
    "$name opens only the palette with no project open",
    async ({ init }) => {
      await renderShell(false);
      fireEvent.keyDown(document, init);

      expect(
        await screen.findByRole("dialog", { name: "Open Resource" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Capture" })).toBeNull();
    },
  );

  it.each(PLAIN_COMBOS)(
    "$name with no project open shows the Capture... row, and selecting it opens Capture and closes the palette",
    async ({ init }) => {
      await renderShell(false);
      fireEvent.keyDown(document, init);
      const row = await screen.findByRole("option", { name: /Capture\.\.\./ });
      fireEvent.click(row);

      expect(
        await screen.findByRole("dialog", { name: "Capture" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "Open Resource" }),
      ).toBeNull();
    },
  );

  it("plain K opens neither", async () => {
    await renderShell(true);
    fireEvent.keyDown(document, { key: "k" });
    await flushPendingEffects();

    expect(screen.queryByRole("dialog", { name: "Open Resource" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Capture" })).toBeNull();
  });

  it("answers one keydown with one handler: preventDefault runs once", async () => {
    await renderShell(true);
    const event = new KeyboardEvent("keydown", {
      key: "K",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventDefault = vi.spyOn(event, "preventDefault");
    document.dispatchEvent(event);
    await screen.findByRole("dialog", { name: "Capture" });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("the palette's Capture... row closes the palette and opens the Capture box (Task 21)", async () => {
    await renderShell(true);
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const row = await screen.findByRole("option", { name: /Capture\.\.\./ });
    fireEvent.click(row);

    expect(
      await screen.findByRole("dialog", { name: "Capture" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Open Resource" })).toBeNull();
  });
});

/**
 * Feature 107, Task 10 (FR-12, US-2): a "Capture" entry in the top bar on a
 * native runtime, with and without an open project. It opens the same
 * Capture box host as Cmd/Ctrl+Shift+K. jsdom only: not evidence about the
 * device.
 */
describe("AppShell: Capture top-bar entry on a native runtime (Feature 107, Task 10)", () => {
  setupAppShellFetchStub();

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([false, true])(
    "renders a Capture button in the top bar (project open: %s)",
    async (withProject) => {
      vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
      await renderShell(withProject);

      const header = screen.getByRole("banner");
      expect(
        within(header).getByRole("button", { name: "Capture" }),
      ).toBeInTheDocument();
    },
  );

  it.each([false, true])(
    "clicking it opens one Capture box (project open: %s)",
    async (withProject) => {
      vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
      await renderShell(withProject);

      fireEvent.click(screen.getByRole("button", { name: "Capture" }));

      expect(
        await screen.findByRole("dialog", { name: "Capture" }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole("dialog", { name: "Capture" })).toHaveLength(
        1,
      );
      expect(
        screen.queryByRole("dialog", { name: "Open Resource" }),
      ).toBeNull();
    },
  );

  it("opens from the keyboard (Enter on the focused entry)", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    await renderShell(true);

    const user = userEvent.setup();
    const entry = screen.getByRole("button", { name: "Capture" });
    entry.focus();
    expect(entry).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("dialog", { name: "Capture" }),
    ).toBeInTheDocument();
  });

  it("uses the same host as the shortcut: entry then shortcut leaves one dialog", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    await renderShell(false);

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByRole("dialog", { name: "Capture" });
    fireEvent.keyDown(document, { key: "K", metaKey: true, shiftKey: true });
    await flushPendingEffects();

    expect(screen.getAllByRole("dialog", { name: "Capture" })).toHaveLength(1);
  });

  it("is absent on a non-native runtime", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "");
    await renderShell(true);

    expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
  });
});

/**
 * Feature 107, Task 12 (FR-3): the share host is mounted in AppShell on a
 * native runtime only, so its listener exists at shell mount, before any
 * Capture open. jsdom with a fake wrapper: not evidence about the bridge.
 */
describe("AppShell: share listener mount (Feature 107, Task 12)", () => {
  setupAppShellFetchStub();

  beforeEach(() => {
    startShareListener.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds the share listener at mount on a native runtime, with no Capture open", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    await renderShell(false);

    expect(startShareListener).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Capture" })).toBeNull();
  });

  it("adds it once even after the Capture box is opened", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    await renderShell(true);
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByRole("dialog", { name: "Capture" });

    expect(startShareListener).toHaveBeenCalledTimes(1);
  });

  it("is not mounted and never calls the plugin on a non-native runtime", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "");
    await renderShell(true);

    expect(startShareListener).not.toHaveBeenCalled();
  });
});
