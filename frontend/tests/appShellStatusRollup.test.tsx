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
import {
  setResources,
  setSelectedResourceId,
  updateResource,
} from "../src/store/resourcesSlice";
import {
  createImageResource,
  createTextResource,
} from "../src/lib/models/resource";
import type { AnyResource } from "../src/lib/models/types";

const PROJECT_ID = "proj_status_rollup_wiring";

function textResource(
  name: string,
  userMetadata: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): AnyResource {
  const r = createTextResource({ name, plainText: "" });
  return {
    ...r,
    ...extra,
    userMetadata: { ...(r.userMetadata ?? {}), ...userMetadata },
  } as AnyResource;
}

function buildResources(): Record<string, AnyResource> {
  const image = createImageResource({ name: "Cover" });
  return {
    draftA: textResource("Draft A", { status: "Draft", wordCount: 100 }),
    draftB: textResource("Draft B", { status: "Draft", wordCount: 50 }),
    revised: textResource("Revised A", { status: "Revised", wordCount: 200 }),
    offList: textResource("Off list", { status: "Archived", wordCount: 30 }),
    unset: textResource("No status A", { wordCount: 70 }),
    // Legacy top-level `statuses` only; must not count under "Final".
    legacy: textResource("Legacy", { wordCount: 40 }, { statuses: ["Final"] }),
    // Stub-sized: no word count anywhere.
    stub: textResource("Stub", {}),
    // Non-text resource carrying a configured status and words.
    image: {
      ...image,
      userMetadata: { status: "Final", wordCount: 999 },
    } as AnyResource,
  };
}

function renderShell(
  statuses: string[],
  resources: AnyResource[],
  options: { pageShaped?: boolean } = {},
) {
  const config = { statuses };
  // page.tsx builds its project without config.statuses; statuses reach the
  // app only through the Redux store.
  const projectConfig = options.pageShaped ? {} : config;
  const project = {
    id: PROJECT_ID,
    name: "Rollup Wiring",
    rootPath: "/test/rollup-wiring",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: projectConfig,
  };
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: project.name,
      rootPath: project.rootPath,
      folders: [],
      resources: resources.map((r) => ({ id: r.id, name: r.name })),
      statuses,
      config,
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setResources(resources));

  // Same store update page.tsx's handleChangeStatus produces for a status edit.
  const onChangeStatus = (status: string, id: string): void => {
    const current = store
      .getState()
      .resources.resources.find((r: AnyResource) => r.id === id);
    store.dispatch(
      updateResource({
        id,
        userMetadata: { ...(current?.userMetadata ?? {}), status },
      } as never),
    );
  };

  render(
    <Provider store={store}>
      <AppShell
        showSidebars={true}
        project={project as never}
        resources={resources}
        onChangeStatus={onChangeStatus as never}
      />
    </Provider>,
  );
  fireEvent.click(screen.getByRole("tab", { name: /Data/i }));
  return { store };
}

/** Reads the By status table as [label, count, words] in rendered order. */
function rollupRows(): string[][] {
  const table: HTMLElement = screen.getByRole("table", {
    name: "Resources and words by status",
  });
  return Array.from(table.querySelectorAll<HTMLElement>("tbody tr")).map(
    (tr: HTMLElement) => [
      tr.querySelector("th")?.textContent ?? "",
      ...Array.from(tr.querySelectorAll("td")).map(
        (c: Element) => c.textContent ?? "",
      ),
    ],
  );
}

describe("AppShell — By status roll-up wiring (Feature 60, Task 6)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    })) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("shows exact count and words per row, in configured, unknown, No status order", () => {
    const res = buildResources();
    renderShell(["Draft", "Revised", "Final"], Object.values(res));

    expect(rollupRows()).toEqual([
      ["Draft", "2", "150"],
      ["Revised", "1", "200"],
      ["Final", "0", "0"],
      ["Archived (not in the current list)", "1", "30"],
      ["No status", "3", "110"],
    ]);
  });

  it("excludes the image and legacy-only resource from configured rows, and row counts sum to the text resources", () => {
    const res = buildResources();
    renderShell(["Draft", "Revised", "Final"], Object.values(res));

    const rows = rollupRows();
    expect(rows.find((r) => r[0] === "Final")).toEqual(["Final", "0", "0"]);

    const textCount = Object.values(res).filter(
      (r) => r.type === "text",
    ).length;
    const sum = rows.reduce((acc, r) => acc + Number(r[1]), 0);
    expect(textCount).toBe(7);
    expect(sum).toBe(textCount);
  });

  it("moves a resource between rows when its status is changed in the sidebar StatusSelector", async () => {
    const res = buildResources();
    const { store } = renderShell(
      ["Draft", "Revised", "Final"],
      Object.values(res),
    );

    store.dispatch(setSelectedResourceId(res.unset.id));
    const select = await screen.findByRole("combobox", { name: "status" });
    fireEvent.change(select, { target: { value: "Final" } });

    await waitFor(() =>
      expect(rollupRows()).toEqual([
        ["Draft", "2", "150"],
        ["Revised", "1", "200"],
        ["Final", "1", "70"],
        ["Archived (not in the current list)", "1", "30"],
        ["No status", "2", "40"],
      ]),
    );
  });

  it("shows the no-statuses hint when the project has no configured statuses", () => {
    const res = buildResources();
    renderShell([], Object.values(res));

    expect(
      screen.getByText(/No statuses are set up for this project yet/),
    ).toBeInTheDocument();
    const rows = rollupRows();
    expect(rows[rows.length - 1][0]).toBe("No status");
  });

  it("uses the store's statuses when the page-shaped project config lacks them", () => {
    const res = buildResources();
    renderShell(["Draft", "Revised"], Object.values(res), { pageShaped: true });

    const rows = rollupRows();
    expect(rows.slice(0, 2)).toEqual([
      ["Draft", "2", "150"],
      ["Revised", "1", "200"],
    ]);
    expect(
      rows.some(
        (r) =>
          r[0].includes("(not in the current list)") &&
          (r[0].startsWith("Draft") || r[0].startsWith("Revised")),
      ),
    ).toBe(false);
    expect(
      screen.queryByText(/No statuses are set up for this project yet/),
    ).not.toBeInTheDocument();
  });

  it("still shows the no-statuses hint for a page-shaped project with genuinely empty statuses", () => {
    const res = buildResources();
    renderShell([], Object.values(res), { pageShaped: true });

    expect(
      screen.getByText(/No statuses are set up for this project yet/),
    ).toBeInTheDocument();
  });
});
