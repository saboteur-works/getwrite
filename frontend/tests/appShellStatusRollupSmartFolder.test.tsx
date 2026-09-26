import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { setResources } from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import type { AnyResource } from "../src/lib/models/types";

const PROJECT_ID = "proj_status_rollup_smart_folder";

function makeResource(
  name: string,
  status: string,
  wordCount: number,
): AnyResource {
  const r = createTextResource({ name, plainText: "" });
  return {
    ...r,
    userMetadata: { ...(r.userMetadata ?? {}), status, wordCount },
  } as AnyResource;
}

function statusRows(): string[][] {
  return screen
    .getAllByRole("rowheader")
    .filter((h: HTMLElement) =>
      ["Draft", "Final"].includes(h.textContent ?? ""),
    )
    .map((h: HTMLElement) => [
      h.textContent ?? "",
      ...Array.from(
        (h.closest("tr") as HTMLElement).querySelectorAll("td"),
      ).map((c) => c.textContent ?? ""),
    ]);
}

function overviewResourcesTotal(): string | null {
  const label = screen
    .getAllByText("Resources", { exact: false })
    .find((el: HTMLElement) => el.parentElement?.querySelector(".text-gw-h1"));
  return (
    label?.parentElement?.querySelector(".text-gw-h1")?.textContent?.trim() ??
    null
  );
}

describe("AppShell — status roll-up ignores smart folders (FR-17)", () => {
  let originalFetch: typeof globalThis.fetch;
  const resources = [
    makeResource("Scene A", "Draft", 100),
    makeResource("Scene B", "Final", 200),
    makeResource("Scene C", "Final", 300),
  ];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = {};
      if (url.includes("/api/project/query/saved")) {
        body = {
          queries: [
            {
              id: "sf1",
              name: "Only A",
              definition: { type: "group", combinator: "and", children: [] },
            },
          ],
        };
      } else if (url.includes("/api/project/query/evaluate")) {
        body = { ids: [resources[0].id] };
      }
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => "",
      };
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("keeps By status numbers identical while the Overview total changes", async () => {
    const config = { statuses: ["Draft", "Final"] };
    const project = {
      id: PROJECT_ID,
      name: "Rollup Smart Folder",
      rootPath: "/test/rollup-sf",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config,
    };
    const store = makeStore();
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: project.name,
        rootPath: project.rootPath,
        folders: [],
        resources: resources.map((r) => ({ id: r.id, name: r.name })),
        statuses: ["Draft", "Final"],
        config,
      } as never),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    store.dispatch(setResources(resources));

    render(
      <Provider store={store}>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={resources}
        />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Data/i }));
    const before = statusRows();
    expect(before).toEqual([
      ["Draft", "1", "100"],
      ["Final", "2", "500"],
    ]);
    expect(overviewResourcesTotal()).toBe("3");

    fireEvent.click(await screen.findByRole("button", { name: "Only A" }));
    await waitFor(() => expect(overviewResourcesTotal()).toBe("1"));

    expect(statusRows()).toEqual(before);
  });
});
