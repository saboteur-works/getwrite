import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import { openProject } from "../src/lib/api/projects";
import { getGoalFilteredTotal } from "../src/lib/api/goal-filtered-total";

/**
 * Feature 98 defect: the Data view's filtered-total read was keyed by the
 * project's internal `project.id`, but `/api/project/goal-filtered-total`
 * derives the project root from the on-disk directory id (the same id the
 * writing-log footer sends). With the two ids different, the route read a
 * nonexistent folder (ENOENT) and reported the total as unavailable.
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

vi.mock("../src/lib/api/goal-filtered-total", () => ({
  getGoalFilteredTotal: vi.fn().mockResolvedValue({ status: "not-filtered" }),
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

describe("filtered goal total project id (Feature 98)", () => {
  it("reads the total with the project directory id, not project.id", async () => {
    vi.mocked(openProject).mockResolvedValue({
      project: {
        id: "project-internal-id",
        name: "P",
        rootPath: "/projects/proj-dir-id",
        config: { goalFilter: { op: "eq", field: "status", value: "Draft" } },
      },
      folders: [],
      resources: [],
    } as unknown as Awaited<ReturnType<typeof openProject>>);
    const { default: Page } = await import("../app/(app)/page");
    render(
      <Provider store={makeStore()}>
        <TrashRefreshProvider>
          <Page />
        </TrashRefreshProvider>
      </Provider>,
    );
    await waitFor(() => expect(getGoalFilteredTotal).toHaveBeenCalled());
    for (const call of vi.mocked(getGoalFilteredTotal).mock.calls) {
      expect(call[0]).toBe("proj-dir-id");
    }
  });
});
