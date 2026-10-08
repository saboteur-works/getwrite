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
  return { ...actual, setDailyWordGoal: vi.fn(), getTodayWritingLog: vi.fn() };
});

import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import {
  getTodayWritingLog,
  setDailyWordGoal,
} from "../src/lib/api/writing-log";
import { stubAppShellFetch } from "./helpers/appShellFetchStub";

const mockSet = vi.mocked(setDailyWordGoal);
const mockGet = vi.mocked(getTodayWritingLog);

const DIRECTORY_ID = "af142f76-directory-basename";

/** Server-side goal the mocked transport reads and writes. */
let serverGoal: number | undefined;

function aggregate(): Awaited<ReturnType<typeof getTodayWritingLog>> {
  return {
    totals: { added: 13, removed: 0, net: 13 },
    goal: serverGoal,
    incomplete: false,
  } as unknown as Awaited<ReturnType<typeof getTodayWritingLog>>;
}

function renderShell(): void {
  const resource = createTextResource({ name: "Scene A", plainText: "" });
  const rootPath = `/test/workspace/${DIRECTORY_ID}`;
  const project = {
    id: DIRECTORY_ID,
    name: "Goal Refresh",
    rootPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const store = makeStore();
  store.dispatch(
    setProject({
      id: DIRECTORY_ID,
      name: project.name,
      rootPath,
      folders: [],
      resources: [{ id: resource.id, name: resource.name }],
    }),
  );
  store.dispatch(setSelectedProjectId(DIRECTORY_ID));
  store.dispatch(setResources([resource]));
  store.dispatch(setSelectedResourceId(resource.id));
  render(
    <Provider store={store}>
      <AppShell
        showSidebars={true}
        project={project as never}
        resources={[resource]}
      />
    </Provider>,
  );
}

async function openGoalSettings(): Promise<void> {
  fireEvent.click(
    screen.getByRole("button", { name: "Open project settings menu" }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Project Settings" }));
  fireEvent.click(await screen.findByRole("tab", { name: /Writing Goals/i }));
}

function saveGoal(value: string): void {
  fireEvent.change(screen.getByLabelText("Daily word goal"), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save daily goal" }));
}

describe("AppShell footer refreshes after a daily goal change (Task 19)", () => {
  let restoreFetch: () => void;

  beforeEach(() => {
    restoreFetch = stubAppShellFetch();
    serverGoal = undefined;
    mockGet.mockReset();
    mockGet.mockImplementation(async () => aggregate());
    mockSet.mockReset();
    mockSet.mockImplementation(async (_id, goal) => {
      serverGoal = goal === null ? undefined : goal;
      return { dailyWordGoal: serverGoal };
    });
  });

  afterEach(() => {
    restoreFetch();
  });

  // Both tests mount the full `AppShell` (one of the heaviest components in
  // the app — resource tree, editor shell, sidebar, and every Project
  // Settings tab, all `forceMount`ed) and drive it through several sequential
  // `fireEvent`+`waitFor` round trips. That comfortably clears vitest's
  // default 5000ms per-test timeout locally (consistently ~3s for the whole
  // file, including both tests), but was observed failing on exactly this
  // timeout in CI three runs in a row while passing reliably everywhere else
  // this was reproduced (isolated run, full-suite run, full-suite run capped
  // to 4 worker threads to approximate CI's smaller runner) — i.e. a timing
  // margin that holds up fine locally but not under CI's actual resource
  // ceiling, not a logic defect in the test or the code it exercises. A
  // generous explicit timeout is the correct fix for that, not a change to
  // what's being asserted.
  it("shows the new goal after a save and drops it after a clear, without a document save", async () => {
    renderShell();
    expect(await screen.findByText("Today: 13")).toBeTruthy();

    await openGoalSettings();
    saveGoal("500");
    expect(await screen.findByText("Daily goal saved.")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText("Today: 13 / 500")).toBeTruthy(),
    );

    saveGoal("");
    expect(await screen.findByText("Daily goal cleared.")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Today: 13")).toBeTruthy());
    expect(screen.queryByText(/\/ 500/)).toBeNull();
  }, 15000);

  it("leaves the footer unchanged when the goal save fails", async () => {
    renderShell();
    expect(await screen.findByText("Today: 13")).toBeTruthy();
    mockSet.mockRejectedValueOnce(new Error("boom"));

    await openGoalSettings();
    saveGoal("500");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Today: 13")).toBeTruthy();
    expect(screen.queryByText("Today: 13 / 500")).toBeNull();
  }, 15000);
});
