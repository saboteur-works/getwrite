import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { Provider } from "react-redux";

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));
vi.mock("../src/lib/api/word-count-goal", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/api/word-count-goal")>();
  return { ...actual, setWordCountGoal: vi.fn() };
});
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
import { setWordCountGoal } from "../src/lib/api/word-count-goal";
import { setDailyWordGoal } from "../src/lib/api/writing-log";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";

const mockSet = vi.mocked(setWordCountGoal);

// The project.json `id` deliberately differs from the directory basename in
// rootPath; tenant-scoped routes take the directory basename (mirrors
// appShellDailyGoalProjectId.test.tsx's Task-16 regression check).
const INTERNAL_ID = "9c19c9a4-internal-id-from-project-json";
const DIRECTORY_ID = "1e6f0b3d-directory-basename";

describe("AppShell word-count goal wiring (Task 8)", () => {
  setupAppShellFetchStub();

  beforeEach(() => {
    mockSet.mockReset();
    mockSet.mockResolvedValue({ wordCountGoal: 50000 });
  });

  function renderWithPageShapedProject(wordCountGoal: number | undefined) {
    const resource = createTextResource({ name: "Scene A", plainText: "" });
    const rootPath = `/test/workspace/${DIRECTORY_ID}`;
    // Mirrors the shape `app/(app)/page.tsx`'s `handleOpen`/`handleCreate`
    // actually build: `config.wordCountGoal` sourced from
    // `p.project.config?.wordCountGoal`, sitting alongside `dailyWordGoal`.
    const project = {
      id: INTERNAL_ID,
      name: "Mismatched Ids",
      rootPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: { wordCountGoal, dailyWordGoal: undefined },
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

    return { resource, project };
  }

  it("reflects project.config.wordCountGoal as WordCountGoalField's initial displayed value", async () => {
    renderWithPageShapedProject(50000);

    fireEvent.click(
      screen.getByRole("button", { name: "Open project settings menu" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Project Settings" }));
    fireEvent.click(await screen.findByRole("tab", { name: /Writing Goals/i }));

    const input = (await screen.findByLabelText(
      "Total word-count goal",
    )) as HTMLInputElement;
    expect(input.value).toBe("50000");
  });

  it("shows both saved goals when Project Settings is reopened without a reload (D-14)", async () => {
    vi.mocked(setDailyWordGoal).mockResolvedValue({ dailyWordGoal: 20 });
    const resource = createTextResource({ name: "Scene A", plainText: "" });
    const rootPath = `/test/workspace/${DIRECTORY_ID}`;
    const store = makeStore();
    store.dispatch(
      setProject({
        id: INTERNAL_ID,
        name: "Goals",
        rootPath,
        folders: [],
        resources: [{ id: resource.id, name: resource.name }],
      }),
    );
    store.dispatch(setSelectedProjectId(INTERNAL_ID));
    store.dispatch(setResources([resource]));

    // Holds the project the way `app/(app)/page.tsx` does and applies the
    // shell's goal-saved callback to it.
    function PageLike(): JSX.Element {
      const [project, setProject] = React.useState({
        id: INTERNAL_ID,
        name: "Goals",
        rootPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        config: {
          wordCountGoal: undefined as number | undefined,
          dailyWordGoal: undefined as number | undefined,
        },
      });
      return (
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={[resource]}
          onProjectGoalSaved={(key, goal) =>
            setProject((prev) => ({
              ...prev,
              config: { ...prev.config, [key]: goal ?? undefined },
            }))
          }
        />
      );
    }
    render(
      <Provider store={store}>
        <PageLike />
      </Provider>,
    );

    const openWritingGoals = async (): Promise<void> => {
      fireEvent.click(
        screen.getByRole("button", { name: "Open project settings menu" }),
      );
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Project Settings" }),
      );
      fireEvent.click(
        await screen.findByRole("tab", { name: /Writing Goals/i }),
      );
    };

    await openWritingGoals();
    fireEvent.change(await screen.findByLabelText("Daily word goal"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save daily goal" }));
    await screen.findByText("Daily goal saved.");
    fireEvent.change(screen.getByLabelText("Total word-count goal"), {
      target: { value: "50000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save word-count goal" }),
    );
    await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Daily word goal")).toBeNull(),
    );

    await openWritingGoals();
    expect(
      ((await screen.findByLabelText("Daily word goal")) as HTMLInputElement)
        .value,
    ).toBe("20");
    expect(
      (screen.getByLabelText("Total word-count goal") as HTMLInputElement)
        .value,
    ).toBe("50000");
  });

  it("saves the word-count goal against the project directory id, not project.id", async () => {
    renderWithPageShapedProject(undefined);

    fireEvent.click(
      screen.getByRole("button", { name: "Open project settings menu" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Project Settings" }));
    fireEvent.click(await screen.findByRole("tab", { name: /Writing Goals/i }));
    fireEvent.change(await screen.findByLabelText("Total word-count goal"), {
      target: { value: "50000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save word-count goal" }),
    );

    await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
    expect(mockSet).toHaveBeenCalledWith(DIRECTORY_ID, 50000);
  });
});
