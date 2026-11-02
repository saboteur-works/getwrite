import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import { setSelectedResourceId as setResourceId } from "../src/store/resourcesSlice";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import { openProject } from "../src/lib/api/projects";

/**
 * Feature 98 Task 24 (FR-33): a resolved sidecar field save from the page's
 * `updateResource` calls `notifyWritingLogGoalChanged` only while the project
 * has a `config.goalFilter`; a rejected save never calls it.
 */

const updateSidecarMock = vi.fn();
const notifyMock = vi.fn();

vi.mock("../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: async () => ({ state: "exempt" }),
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));

vi.mock("../src/lib/api/resources", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/api/resources")
  >("../src/lib/api/resources");
  return {
    ...actual,
    updateSidecar: (...args: unknown[]) => updateSidecarMock(...args),
  };
});

vi.mock("../src/lib/writing-log-signal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/writing-log-signal")>()),
  notifyWritingLogGoalChanged: () => notifyMock(),
}));

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

vi.mock("../src/lib/api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api/projects")>()),
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: vi.fn(),
}));

function MockStartPage(props: { onOpen?: (id: string) => void }) {
  React.useEffect(() => {
    props.onOpen?.("proj-dir-id");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

vi.mock("../components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onOpen?: (id: string) => void }) => (
    <MockStartPage {...props} />
  ),
}));

setupAppShellFetchStub();

const GOAL_FILTER = {
  type: "condition",
  field: "mood",
  operator: "equals",
  value: "calm",
};

function payload(
  goalFilter?: unknown,
): Awaited<ReturnType<typeof openProject>> {
  return {
    project: {
      id: "project-internal-id",
      name: "Goal Filter Signal Project",
      rootPath: "/projects/proj-dir-id",
      config: {
        ...(goalFilter === undefined ? {} : { goalFilter }),
        metadataSchema: {
          groups: [
            {
              id: "custom-group",
              label: "Custom",
              fields: [{ key: "mood", label: "Mood", type: "text" }],
            },
          ],
        },
      },
    },
    folders: [],
    resources: [
      {
        id: "res-1",
        name: "Chapter One",
        type: "text",
        folderId: null,
        orderIndex: 0,
        userMetadata: {},
      },
    ],
  } as unknown as Awaited<ReturnType<typeof openProject>>;
}

async function editMood(goalFilter?: unknown): Promise<void> {
  vi.mocked(openProject).mockResolvedValue(payload(goalFilter));
  const { default: Page } = await import("../app/(app)/page");
  const store = makeStore();
  render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <Page />
      </TrashRefreshProvider>
    </Provider>,
  );
  await waitFor(() =>
    expect(store.getState().resources.resources.length).toBe(1),
  );
  store.dispatch(setResourceId("res-1"));
  fireEvent.change(await screen.findByLabelText("mood"), {
    target: { value: "calm" },
  });
  await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  updateSidecarMock.mockReset();
  notifyMock.mockReset();
});

describe("page.tsx sidecar field save signals the footer (Feature 98 Task 24, FR-33)", () => {
  it("calls the signal after a resolved save while a goal filter is set", async () => {
    updateSidecarMock.mockResolvedValue(undefined);
    await editMood(GOAL_FILTER);
    await waitFor(() => expect(notifyMock).toHaveBeenCalledTimes(1));
  });

  it("does not call the signal after a resolved save when no goal filter is set", async () => {
    updateSidecarMock.mockResolvedValue(undefined);
    await editMood();
    await new Promise((r) => setTimeout(r, 20));
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("does not call the signal when the save is rejected, even with a filter set", async () => {
    updateSidecarMock.mockRejectedValue(new Error("write failed"));
    await editMood(GOAL_FILTER);
    await new Promise((r) => setTimeout(r, 20));
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
