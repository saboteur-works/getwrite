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
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import { flushPendingEffects } from "./helpers/flushEffects";

describe("AppShell: App Settings from the settings menu", () => {
  setupAppShellFetchStub();

  it("opens the App Settings dialog and closes the menu", async () => {
    render(
      <Provider store={makeStore()}>
        <AppShell showSidebars={false} project={null} resources={[]} />
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
