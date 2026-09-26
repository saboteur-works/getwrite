import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));
vi.mock("../src/lib/api/writing-log", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/api/writing-log")>();
  return { ...actual, setDailyWordGoal: vi.fn() };
});

import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { setResources } from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import { setDailyWordGoal } from "../src/lib/api/writing-log";

const mockSet = vi.mocked(setDailyWordGoal);

// The project.json `id` deliberately differs from the directory basename in
// rootPath; tenant-scoped routes take the directory basename.
const INTERNAL_ID = "4943675f-internal-id-from-project-json";
const DIRECTORY_ID = "af142f76-directory-basename";

describe("AppShell daily goal wiring (Task 16)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    })) as unknown as typeof globalThis.fetch;
    mockSet.mockReset();
    mockSet.mockResolvedValue({ dailyWordGoal: 400 });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("saves the daily goal against the project directory id, not project.id", async () => {
    const resource = createTextResource({ name: "Scene A", plainText: "" });
    const rootPath = `/test/workspace/${DIRECTORY_ID}`;
    const project = {
      id: INTERNAL_ID,
      name: "Mismatched Ids",
      rootPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const store = makeStore();
    store.dispatch(
      setProject({
        id: INTERNAL_ID,
        name: project.name,
        rootPath,
        folders: [],
        resources: [{ id: resource.id, name: resource.name }],
      }),
    );
    store.dispatch(setSelectedProjectId(INTERNAL_ID));
    store.dispatch(setResources([resource]));

    render(
      <Provider store={store}>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={[resource]}
        />
      </Provider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open project settings menu" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Project Settings" }));
    fireEvent.click(await screen.findByRole("tab", { name: /Writing Goals/i }));
    fireEvent.change(await screen.findByLabelText("Daily word goal"), {
      target: { value: "400" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save daily goal" }));

    await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
    expect(mockSet).toHaveBeenCalledWith(DIRECTORY_ID, 400);
  });
});
