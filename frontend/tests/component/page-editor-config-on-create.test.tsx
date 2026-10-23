import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Same rationale as page-default-revision-name.test.tsx: this file is not
// about sharing limits, so they are fixed at "exempt".
vi.mock("../../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: async () => ({ state: "exempt" }),
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));
import { Provider } from "react-redux";
import { makeStore } from "../../src/store/store";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";

/**
 * Regression coverage: `handleOpen` loads the project's
 * `config.editorConfig` into the `editorConfig` slice, but `handleCreate`
 * did not. A newly created project therefore showed the previous project's
 * styles (or the defaults) in the editor and in Project Settings until it
 * was closed and reopened. Closing a project also left its styles in the
 * slice.
 *
 * `AppShell` and `StartPage` are stubbed (as in
 * page-default-revision-name.test.tsx) so the test drives `page.tsx`'s
 * create and close handlers directly.
 */

vi.mock("../../src/lib/api/projects", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: vi.fn(),
}));

vi.mock("../../components/Layout/AppShell", () => ({
  __esModule: true,
  default: (props: {
    onCloseProject?: () => void;
    children?: React.ReactNode;
  }) => (
    <div>
      <button onClick={() => props.onCloseProject?.()}>close project</button>
      {props.children}
    </div>
  ),
}));

const createdHeadings = { h1: { fontFamily: "Domine", fontSize: "40px" } };
const createdBody = { fontFamily: "Lora", fontSize: "18px" };

vi.mock("../../components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onCreate?: (result: unknown) => void }) => (
    <button
      onClick={() =>
        props.onCreate?.({
          project: {
            id: "created-id",
            name: "Created",
            rootPath: "/projects/created-dir",
            config: {
              editorConfig: { headings: createdHeadings, body: createdBody },
            },
          },
          folders: [],
          resources: [],
        })
      }
    >
      create project
    </button>
  ),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("entity-alias-table")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ entities: {}, claimedBy: {} }),
        } as Response;
      }
      throw new Error("not available in test");
    }),
  );
});

async function renderPage() {
  const { default: Page } = await import("../../app/(app)/page");
  const store = makeStore();
  render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <Page />
      </TrashRefreshProvider>
    </Provider>,
  );
  return store;
}

describe("page.tsx editor config on create and close", () => {
  it("loads a created project's editorConfig into the store", async () => {
    const store = await renderPage();
    fireEvent.click(await screen.findByText("create project"));

    await waitFor(() =>
      expect(store.getState().editorConfig).toEqual({
        headings: createdHeadings,
        body: createdBody,
      }),
    );
  });

  it("clears the editorConfig when the project is closed", async () => {
    const store = await renderPage();
    fireEvent.click(await screen.findByText("create project"));
    await waitFor(() =>
      expect(store.getState().editorConfig.body).toEqual(createdBody),
    );

    fireEvent.click(screen.getByText("close project"));

    await waitFor(() =>
      expect(store.getState().editorConfig).toEqual({
        headings: {},
        body: undefined,
      }),
    );
  });
});
