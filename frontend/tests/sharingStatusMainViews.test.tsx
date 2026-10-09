/**
 * SharingStatus is rendered in the Start page and the app shell
 * (Feature 75, Task 21).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

import StartPage from "../components/Start/StartPage";
import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { createTextResource } from "../src/lib/models/resource";
import { SHARING_IS_ON } from "../components/Sharing/sharing-copy";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";

function installEffectiveBridge(): void {
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    chooseWorkspaceDir: vi.fn(),
    getSharingStatus: vi.fn(async () => ({
      enabled: true,
      effective: true,
      blockedByHostedAuth: false,
      addresses: ["http://192.168.1.20:4100"],
      credentialStore: "ok",
      port: 4100,
    })),
  };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

describe("SharingStatus in main views", () => {
  setupAppShellFetchStub();

  it("shows 'Sharing is on' on the Start page", async () => {
    installEffectiveBridge();
    render(
      <Provider store={makeStore()}>
        <StartPage projects={[]} />
      </Provider>,
    );
    expect(await screen.findByText(SHARING_IS_ON)).toBeInTheDocument();
  });

  it("shows 'Sharing is on' in the app shell", async () => {
    installEffectiveBridge();
    const resource = createTextResource({ name: "Scene A", plainText: "" });
    const project = {
      id: "p1",
      name: "P",
      rootPath: "/test/workspace/p1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    render(
      <Provider store={makeStore()}>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={[resource]}
        />
      </Provider>,
    );
    expect(await screen.findByText(SHARING_IS_ON)).toBeInTheDocument();
  });

  it("shows nothing about sharing without a bridge", () => {
    render(
      <Provider store={makeStore()}>
        <StartPage projects={[]} />
      </Provider>,
    );
    expect(screen.queryByText(SHARING_IS_ON)).toBeNull();
  });
});
