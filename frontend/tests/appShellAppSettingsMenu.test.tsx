import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

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

  it.each([...PLAIN_COMBOS, ...SHIFT_COMBOS])(
    "$name with no project open does not open the palette",
    async ({ init }) => {
      await renderShell(false);
      fireEvent.keyDown(document, init);
      await flushPendingEffects();

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
