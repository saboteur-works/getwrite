import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import { selectSpellCheckerState } from "../src/store/spellingAvailabilitySlice";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";

/**
 * FR-46 / AC-21: creating a project through the Start Page `handleCreate`
 * path must fetch the project's spelling lists and alias table for the new
 * project's directory id, as `loadProject` does on open, so the checker
 * leaves "loading" without reopening the project.
 *
 * `AppShell` and `StartPage` are stubbed (as in
 * component/page-editor-config-on-create.test.tsx) so the test drives
 * `page.tsx`'s create handler directly.
 */

vi.mock("../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: async () => ({ state: "exempt" }),
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));

vi.mock("../src/lib/api/projects", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: vi.fn(),
}));

vi.mock("../components/Layout/AppShell", () => ({
  __esModule: true,
  default: (props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
}));

vi.mock("../components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onCreate?: (result: unknown) => void }) => (
    <button
      onClick={() =>
        props.onCreate?.({
          project: {
            id: "created-id",
            name: "Created",
            rootPath: "/projects/created-dir",
            config: {},
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

let requestedUrls: string[] = [];

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  requestedUrls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      requestedUrls.push(url);
      if (url.startsWith("/api/project/spelling?")) {
        return jsonResponse({
          spellingProjectWords: [],
          spellingIgnoredWords: [],
        });
      }
      if (url.endsWith("/entity-alias-table")) {
        return jsonResponse({ entities: {}, claimedBy: {} });
      }
      throw new Error("not available in test");
    }),
  );
});

async function renderPage() {
  const { default: Page } = await import("../app/(app)/page");
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

describe("Start Page create loads the spelling state (FR-46)", () => {
  it("fetches the spelling lists and alias table for the new project's directory id", async () => {
    await renderPage();
    fireEvent.click(await screen.findByText("create project"));

    await waitFor(() =>
      expect(requestedUrls).toContain(
        "/api/project/spelling?projectId=created-dir",
      ),
    );
    expect(requestedUrls).toContain(
      "/api/project/created-dir/entity-alias-table",
    );
  });

  it("leaves the checker active once both reads have loaded for that project", async () => {
    const store = await renderPage();
    fireEvent.click(await screen.findByText("create project"));

    await waitFor(() => {
      const state = store.getState();
      expect(state.spelling.projectId).toBe("created-dir");
      expect(state.spelling.status).toBe("loaded");
      expect(state.spelling.aliasTableStatus).toBe("loaded");
    });
    expect(selectSpellCheckerState(store.getState()).status).toBe("active");
  });

  it("also loads the entity-highlighting alias table for the new project (task_a01aea7f)", async () => {
    const store = await renderPage();
    fireEvent.click(await screen.findByText("create project"));
    await waitFor(() => {
      const table = store.getState().entityAliasTable;
      expect(table.projectId).toBe("created-dir");
      expect(table.status).toBe("succeeded");
    });
    // One read for spelling's copy, one for entity highlighting.
    expect(
      requestedUrls.filter((u) => u.endsWith("/entity-alias-table")),
    ).toHaveLength(2);
  });
});
